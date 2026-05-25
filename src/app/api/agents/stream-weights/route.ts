/**
 * /api/agents/stream-weights — Dynamic stream weight learning
 *
 * Analyzes historical trade_alerts to measure each stream's predictive accuracy.
 * When a stream voted CONFIRM (+1) and the trade WON → stream gets accuracy credit.
 * When a stream voted CONFIRM (+1) and the trade LOST → stream gets accuracy debit.
 * When a stream voted CONTRA (-1) and the trade LOST → stream gets accuracy credit.
 * When a stream voted CONTRA (-1) and the trade WON → stream gets accuracy debit.
 * Neutral votes (0) → not counted.
 *
 * Returns normalized weights (sum to 100%) for use in confidence scoring.
 * Stored in trader_profiles.stream_weights (jsonb).
 *
 * Cron: runs after market close daily (5pm ET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const STREAM_NAMES = [
  // Original 8 quality gate streams
  'Cum. Delta',
  'Options Flow',
  'Dark Pool',
  'NYSE TICK',
  'TRIN',
  'GEX Regime',
  'Morning Plan',
  'Patterns',
  // Market intelligence streams (tracked via context_snapshot)
  'VIX Term Shape',
  'VWAP Position',
  'IV vs RV',
  'Sector Rotation',
  'Session Timing',
  'Daily Trend',
  'Weekly Trend',
  'Candle Patterns',
  'Pre-Market',
  // New mechanical / actionability streams
  'Mechanical Flow',
  'Asymmetric Setup',
  'Setup Type',
  'Actionability Gate',
  'Cross-Asset',
  '1-Hour Trend',
  '15-Min Trend',
  'UW IV Rank',
  'Economic Macro',
  'Multi-TF Alignment',
]

// Map context_snapshot fields to stream names for accuracy tracking
const INTEL_STREAM_MAP: Record<string, string> = {
  termShape:           'VIX Term Shape',
  vwapBandPos:         'VWAP Position',
  optionsCheap:        'IV vs RV',
  optionsExpensive:    'IV vs RV',
  sectorBias:          'Sector Rotation',
  sessionBias:         'Session Timing',
  dailyTrend:          'Daily Trend',
  weeklyTrend:         'Weekly Trend',
  candlePatterns:      'Candle Patterns',
  preMarketConviction: 'Pre-Market',
  // New mechanical / actionability streams
  mechanicalBias:      'Mechanical Flow',
  asymmetricSetup:     'Asymmetric Setup',
  setupType:           'Setup Type',
  actionabilityVerdict:'Actionability Gate',
  crossAssetBias:      'Cross-Asset',
  h1Trend:             '1-Hour Trend',
  m15Trend:            '15-Min Trend',
  uwIvRank:            'UW IV Rank',
  economicBias:        'Economic Macro',
  multiTFAlignment:    'Multi-TF Alignment',
}

// Determine if a market intelligence value is "bullish" or "bearish"
function intelVote(key: string, value: any, signal: string): 1 | -1 | 0 {
  const isBull = signal === 'LONG'
  const isBear = signal === 'SHORT'
  if (key === 'termShape') {
    if (value === 'inverted') return 0
    if (value === 'calm' && isBull) return 1
    if (value === 'normal') return 0
    return 0
  }
  if (key === 'vwapBandPos') {
    if (isBull && value === 'above_vwap') return 1
    if (isBull && value === 'below_1sigma') return -1
    if (isBear && value === 'below_vwap') return 1
    if (isBear && value === 'above_1sigma') return -1
    if (value === 'above_2sigma' || value === 'below_2sigma') return -1
    return 0
  }
  if (key === 'optionsCheap' && value === true) return 1
  if (key === 'optionsExpensive' && value === true) return -1
  if (key === 'sectorBias') {
    if (isBull && value === 'BULLISH') return 1
    if (isBull && value === 'BEARISH') return -1
    if (isBear && value === 'BEARISH') return 1
    if (isBear && value === 'BULLISH') return -1
    return 0
  }
  if (key === 'sessionBias') {
    if (value === 'PRIME') return 1
    if (value === 'DANGER' || value === 'THETA RISK') return -1
    if (value === 'HIGH NOISE' || value === 'CHOPPY') return -1
    return 0
  }
  if (key === 'dailyTrend' || key === 'weeklyTrend' || key === 'h1Trend' || key === 'm15Trend') {
    if (isBull && value === 'BULLISH') return 1
    if (isBull && value === 'BEARISH') return -1
    if (isBear && value === 'BEARISH') return 1
    if (isBear && value === 'BULLISH') return -1
    return 0
  }
  if (key === 'preMarketConviction') {
    if (value === 'HIGH') return 1
    if (value === 'LOW') return -1
    return 0
  }
  // ── Mechanical flow streams ──────────────────────────────────────────────
  if (key === 'mechanicalBias') {
    if (isBull && value === 'BULLISH') return 1
    if (isBull && value === 'BEARISH') return -1
    if (isBear && value === 'BEARISH') return 1
    if (isBear && value === 'BULLISH') return -1
    return 0
  }
  if (key === 'asymmetricSetup') {
    if (isBull && value === 'BULLISH_AMPLIFY') return 1
    if (isBull && value === 'BEARISH_AMPLIFY') return -1
    if (isBear && value === 'BEARISH_AMPLIFY') return 1
    if (isBear && value === 'BULLISH_AMPLIFY') return -1
    if (value === 'BULLISH_RESISTED' && isBull) return -1  // setup says headwind
    if (value === 'BEARISH_RESISTED' && isBear) return -1
    return 0
  }
  if (key === 'setupType') {
    // High-quality setup types are positive votes; NO_SETUP is negative
    if (value === 'BREAKOUT' || value === 'BOUNCE' || value === 'TREND_CONTINUATION') return 1
    if (value === 'NO_SETUP') return -1
    if (value === 'FADE') return -1  // counter-trend = lower base rate
    return 0
  }
  if (key === 'actionabilityVerdict') {
    if (value === 'ACTIONABLE') return 1
    if (value === 'NOISE') return -1
    return 0  // WATCH = neutral
  }
  if (key === 'crossAssetBias') {
    if (isBull && value === 'RISK_ON') return 1
    if (isBull && (value === 'RISK_OFF' || value === 'BEARISH')) return -1
    if (isBear && (value === 'RISK_OFF' || value === 'BEARISH')) return 1
    if (isBear && value === 'RISK_ON') return -1
    return 0
  }
  if (key === 'uwIvRank') {
    const rank = parseFloat(value)
    if (isNaN(rank)) return 0
    if (rank < 30) return 1   // cheap options = good for buying
    if (rank > 70) return -1  // expensive options = headwind
    return 0
  }
  if (key === 'economicBias') {
    if (isBull && value === 'MACRO_BULLISH') return 1
    if (isBull && value === 'MACRO_BEARISH') return -1
    if (isBear && value === 'MACRO_BEARISH') return 1
    if (isBear && value === 'MACRO_BULLISH') return -1
    return 0
  }
  if (key === 'multiTFAlignment') {
    if (isBull && value === 'all-bullish') return 1
    if (isBear && value === 'all-bearish') return 1
    if (value === 'mixed') return -1
    if (value === '5min-only') return -1
    return 0
  }
  return 0
}

// Equal weights to start — each stream gets 12.5% (100/8)
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  STREAM_NAMES.map(n => [n, 1.0])
)

interface StreamStats {
  name:          string
  correct:       number   // voted with outcome
  incorrect:     number   // voted against outcome
  neutral:       number   // didn't vote
  total:         number   // signals where stream had data
  accuracy:      number   // correct / (correct + incorrect)
  weight:        number   // normalized weight (0-2 range, 1.0 = equal)
  weightPct:     number   // % of total weight (sums to 100)
  trend:         'improving' | 'declining' | 'stable'
  sampleSize:    'strong' | 'moderate' | 'weak'
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  let userId: string | null = null
  if (isCron) {
    userId = req.nextUrl.searchParams.get('userId')
  } else {
    const { userId: uid } = await auth()
    userId = uid
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Get all scored signals with stream vote data
    const { data: alerts } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, outcome, outcome_normalized, context_snapshot, created_at')
      .eq('user_id', userId)
      .not('outcome', 'eq', 'PENDING')
      .not('outcome', 'is', null)
      .not('context_snapshot', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!alerts?.length || alerts.length < 5) {
      return NextResponse.json({
        status: 'insufficient_data',
        count: alerts?.length || 0,
        needed: 5,
        weights: DEFAULT_WEIGHTS,
        weightPcts: Object.fromEntries(STREAM_NAMES.map(n => [n, 12.5])),
      })
    }

    // Parse stream votes from context_snapshot
    const streamStats: Record<string, { correct: number; incorrect: number; neutral: number; recent: number[] }> = {}
    STREAM_NAMES.forEach(n => { streamStats[n] = { correct: 0, incorrect: 0, neutral: 0, recent: [] } })

    let scoredWithStreams = 0
    for (const alert of alerts) {
      let ctx: any = {}
      try { ctx = JSON.parse(alert.context_snapshot || '{}') } catch { continue }

      let votes: Array<{ n: string; v: number }> = []
      if (ctx.streamVotes) {
        try { votes = JSON.parse(ctx.streamVotes) } catch {}
      }

      // Normalize outcome
      const norm = alert.outcome_normalized ||
        (alert.outcome === 'HIT_T1' || alert.outcome === 'HIT_T2' ? 'WIN' :
         alert.outcome === 'STOPPED_OUT' ? 'LOSS' : null)
      if (!norm || norm === 'SCRATCH') continue  // skip non-decisive outcomes
      const won = norm === 'WIN'
      scoredWithStreams++

      // Track original 8 stream votes
      for (const vote of votes) {
        const stats = streamStats[vote.n]
        if (!stats) continue
        if (vote.v === 0) {
          stats.neutral++
        } else {
          const streamCorrect = (vote.v === 1 && won) || (vote.v === -1 && !won)
          if (streamCorrect) { stats.correct++; stats.recent.push(1) }
          else               { stats.incorrect++; stats.recent.push(-1) }
        }
      }

      // Track market intelligence streams from context_snapshot
      for (const [key, streamName] of Object.entries(INTEL_STREAM_MAP)) {
        const val = ctx[key]
        if (val === null || val === undefined) continue
        const stats = streamStats[streamName]
        if (!stats) continue
        const vote = intelVote(key, val, alert.signal)
        if (vote === 0) {
          stats.neutral++
        } else {
          const correct = (vote === 1 && won) || (vote === -1 && !won)
          if (correct) { stats.correct++; stats.recent.push(1) }
          else         { stats.incorrect++; stats.recent.push(-1) }
        }
      }
    }

    if (scoredWithStreams < 3) {
      return NextResponse.json({
        status: 'insufficient_stream_data',
        scoredWithStreams,
        note: 'Stream votes only tracked from recent signals — building dataset',
        weights: DEFAULT_WEIGHTS,
        weightPcts: Object.fromEntries(STREAM_NAMES.map(n => [n, 12.5])),
      })
    }

    // Calculate accuracy and weights for each stream
    const results: StreamStats[] = STREAM_NAMES.map(name => {
      const s = streamStats[name]
      const total = s.correct + s.incorrect
      const accuracy = total > 0 ? s.correct / total : 0.5
      const recent5 = s.recent.slice(-5)
      const recentAcc = recent5.length > 0
        ? recent5.filter(v => v === 1).length / recent5.length
        : 0.5

      // Trend: is recent accuracy better or worse than overall?
      const trend: 'improving' | 'declining' | 'stable' =
        recent5.length >= 3
          ? recentAcc > accuracy + 0.1 ? 'improving'
          : recentAcc < accuracy - 0.1 ? 'declining'
          : 'stable'
        : 'stable'

      // Weight formula:
      // - Base: 1.0 (equal weight)
      // - Accuracy above 60%: boost up to 1.8
      // - Accuracy below 40%: reduce down to 0.3
      // - Trend modifier: ±0.1
      // - Small sample: pull toward 1.0 (regression to mean)
      const sampleFactor = Math.min(1, total / 20) // full confidence at 20+ samples
      const rawWeight = total < 3
        ? 1.0  // not enough data — equal weight
        : 1.0 + (accuracy - 0.5) * 1.6 * sampleFactor + (trend === 'improving' ? 0.1 : trend === 'declining' ? -0.1 : 0)

      const weight = Math.max(0.3, Math.min(2.0, rawWeight))

      return {
        name,
        correct:    s.correct,
        incorrect:  s.incorrect,
        neutral:    s.neutral,
        total,
        accuracy:   total > 0 ? Math.round(accuracy * 100) : 50,
        weight:     parseFloat(weight.toFixed(2)),
        weightPct:  0, // calculated after normalization
        trend,
        sampleSize: total >= 20 ? 'strong' : total >= 8 ? 'moderate' : 'weak',
      }
    })

    // Normalize weights to sum to 100%
    const totalWeight = results.reduce((s, r) => s + r.weight, 0)
    results.forEach(r => {
      r.weightPct = parseFloat((r.weight / totalWeight * 100).toFixed(1))
    })

    // Sort by weight descending
    results.sort((a, b) => b.weight - a.weight)

    // Save weights to trader_profiles
    const weightMap = Object.fromEntries(results.map(r => [r.name, r.weight]))
    await supabaseAdmin.from('trader_profiles').upsert({
      user_id:        userId,
      stream_weights: weightMap,
      updated_at:     new Date().toISOString(),
    })

    return NextResponse.json({
      status:          'ok',
      scoredWithStreams,
      totalAlerts:     alerts.length,
      streams:         results,
      topStream:       results[0]?.name,
      bottomStream:    results[results.length - 1]?.name,
      insight: results[0] && results[0].accuracy > 55
        ? `${results[0].name} is your most accurate stream at ${results[0].accuracy}% — signals confirming with this stream win more often`
        : 'Building accuracy data — need more scored trades',
    })

  } catch (e: any) {
    console.error('[stream-weights]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
