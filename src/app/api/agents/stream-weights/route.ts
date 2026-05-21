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
  'Cum. Delta',
  'Options Flow',
  'Dark Pool',
  'NYSE TICK',
  'TRIN',
  'GEX Regime',
  'Morning Plan',
  'Patterns',
]

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
      .select('signal, outcome, context_snapshot, created_at')
      .eq('user_id', userId)
      .in('outcome', ['WIN', 'LOSS'])
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

      if (!ctx.streamVotes) continue
      let votes: Array<{ n: string; v: number }> = []
      try { votes = JSON.parse(ctx.streamVotes) } catch { continue }

      const won = alert.outcome === 'WIN'
      scoredWithStreams++

      for (const vote of votes) {
        const stats = streamStats[vote.n]
        if (!stats) continue

        if (vote.v === 0) {
          stats.neutral++
        } else {
          // Stream is "correct" if its vote direction matches the outcome
          const streamCorrect = (vote.v === 1 && won) || (vote.v === -1 && !won)
          if (streamCorrect) {
            stats.correct++
            stats.recent.push(1)
          } else {
            stats.incorrect++
            stats.recent.push(-1)
          }
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
