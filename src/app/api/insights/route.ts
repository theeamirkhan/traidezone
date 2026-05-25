/**
 * /api/insights — AI Learning Dashboard data
 *
 * Returns a comprehensive view of what the system has learned:
 *   - Signal performance metrics
 *   - Confidence calibration (does 80% confidence actually win 80%?)
 *   - Best/worst performing conditions
 *   - What the AI has learned from chat
 *   - Trader behavior patterns identified
 *   - Alert quality breakdown
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Fetch all scored signals
    const { data: alerts } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, outcome, outcome_normalized, confidence, pts_to_t1, vix_at_signal, created_at, human_outcome, human_pts, ai_view, system_alignment, context_snapshot, wait_reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)

    // Fetch trader profile learnings
    const { data: profile } = await supabaseAdmin
      .from('trader_profiles')
      .select('chat_learnings, weaknesses, strengths, patterns, edge_notes, session_count')
      .eq('user_id', userId)
      .single()

    // Normalize outcomes — use outcome_normalized if available, else map raw outcome
    const normalize = (a: any): string | null => {
      if (a.outcome_normalized) return a.outcome_normalized
      if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') return 'WIN'
      if (a.outcome === 'STOPPED_OUT') return 'LOSS'
      if (a.outcome === 'PARTIAL' || a.outcome === 'EXPIRED') return 'SCRATCH'
      return null
    }

    const scored  = (alerts || []).filter(a => a.outcome && a.outcome !== 'PENDING').map(a => ({ ...a, _norm: normalize(a) }))
    const total   = scored.filter(a => a._norm).length
    const wins    = scored.filter(a => a._norm === 'WIN').length
    const losses  = scored.filter(a => a._norm === 'LOSS').length
    const scratch = scored.filter(a => a._norm === 'SCRATCH').length
    const winRate = total > 0 ? Math.round(wins / total * 100) : 0

    // Avg pts
    const avgPts  = total > 0
      ? (scored.reduce((s, a) => s + (a.pts_to_t1 || 0), 0) / total).toFixed(1)
      : '0'

    // Confidence calibration — does high confidence actually win more?
    const byConfidence: Record<string, { wins: number; total: number }> = {}
    scored.forEach(a => {
      const bucket = a.confidence >= 80 ? '80-100%' : a.confidence >= 65 ? '65-79%' : a.confidence >= 50 ? '50-64%' : '<50%'
      if (!byConfidence[bucket]) byConfidence[bucket] = { wins: 0, total: 0 }
      byConfidence[bucket].total++
      if (a._norm === 'WIN') byConfidence[bucket].wins++
    })
    const confidenceCalibration = Object.entries(byConfidence).map(([range, d]) => ({
      range,
      winRate: Math.round(d.wins / d.total * 100),
      count: d.total,
      note: d.total < 5 ? 'small sample' : null
    }))

    // Signal direction breakdown
    const longs  = scored.filter(a => a.signal === 'LONG')
    const shorts = scored.filter(a => a.signal === 'SHORT')
    const longWR = longs.length > 0 ? Math.round(longs.filter(a => a._norm === 'WIN').length / longs.length * 100) : null
    const shortWR = shorts.length > 0 ? Math.round(shorts.filter(a => a._norm === 'WIN').length / shorts.length * 100) : null

    // VIX regime performance
    const byVix: Record<string, { wins: number; total: number }> = {}
    scored.forEach(a => {
      if (!a.vix_at_signal) return
      const bucket = a.vix_at_signal > 25 ? 'VIX >25 (high vol)' : a.vix_at_signal > 18 ? 'VIX 18-25 (elevated)' : 'VIX <18 (low vol)'
      if (!byVix[bucket]) byVix[bucket] = { wins: 0, total: 0 }
      byVix[bucket].total++
      if (a._norm === 'WIN') byVix[bucket].wins++
    })
    const vixPerformance = Object.entries(byVix).map(([regime, d]) => ({
      regime,
      winRate: Math.round(d.wins / d.total * 100),
      count: d.total,
    }))

    // ── New: Performance by mechanical bias / actionability / setup ─────────
    const buildBreakdown = (field: string, displayLabel: string) => {
      const buckets: Record<string, { wins: number; total: number }> = {}
      scored.forEach(a => {
        let ctx: any = {}
        try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}
        const val = ctx[field]
        if (!val) return
        if (!buckets[val]) buckets[val] = { wins: 0, total: 0 }
        buckets[val].total++
        if (a._norm === 'WIN') buckets[val].wins++
      })
      return Object.entries(buckets)
        .filter(([_, d]) => d.total >= 2)
        .map(([key, d]) => ({
          label:   displayLabel + ': ' + key,
          winRate: Math.round(d.wins / d.total * 100),
          count:   d.total,
        }))
    }

    const mechanicalBreakdown   = buildBreakdown('mechanicalBias',      'Mech')
    const asymmetricBreakdown   = buildBreakdown('asymmetricSetup',     'Asymm')
    const actionabilityBreakdown = buildBreakdown('actionabilityVerdict', 'Action')
    const setupTypeBreakdown    = buildBreakdown('setupType',           'Setup')
    const namedSetupBreakdown   = buildBreakdown('setupName',           'Play')
    const crossAssetBreakdown   = buildBreakdown('crossAssetBias',      'CrossA')
    const sessionBreakdown      = buildBreakdown('sessionName',         'Session')

    // ── Setup quality scoring — do high score setups win more? ─────────────
    const setupScoreBuckets: Record<string, { wins: number; total: number }> = {
      '75+ (STRONG)':  { wins: 0, total: 0 },
      '60-74 (GOOD)':  { wins: 0, total: 0 },
      '45-59 (NEUTRAL)': { wins: 0, total: 0 },
      '<45 (WEAK)':    { wins: 0, total: 0 },
    }
    scored.forEach(a => {
      let ctx: any = {}
      try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}
      const score = ctx.setupScore
      if (score === null || score === undefined) return
      const bucket = score >= 75 ? '75+ (STRONG)' : score >= 60 ? '60-74 (GOOD)' : score >= 45 ? '45-59 (NEUTRAL)' : '<45 (WEAK)'
      setupScoreBuckets[bucket].total++
      if (a._norm === 'WIN') setupScoreBuckets[bucket].wins++
    })
    const setupScorePerformance = Object.entries(setupScoreBuckets)
      .filter(([_, d]) => d.total > 0)
      .map(([range, d]) => ({
        range,
        winRate: Math.round(d.wins / d.total * 100),
        count:   d.total,
      }))

    // ── Green lights vs red flags edge ──────────────────────────────────────
    let actionableWins = 0, actionableTotal = 0, noiseWins = 0, noiseTotal = 0
    scored.forEach(a => {
      let ctx: any = {}
      try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}
      if (ctx.actionabilityVerdict === 'ACTIONABLE') {
        actionableTotal++
        if (a._norm === 'WIN') actionableWins++
      } else if (ctx.actionabilityVerdict === 'NOISE') {
        noiseTotal++
        if (a._norm === 'WIN') noiseWins++
      }
    })

    // System alignment — does following the plan win more?
    const aligned   = scored.filter(a => a.system_alignment === 'aligned')
    const divergent = scored.filter(a => a.system_alignment === 'divergent')
    const alignedWR = aligned.length > 0 ? Math.round(aligned.filter(a => a._norm === 'WIN').length / aligned.length * 100) : null
    const divergentWR = divergent.length > 0 ? Math.round(divergent.filter(a => a._norm === 'WIN').length / divergent.length * 100) : null

    // Recent losers — what conditions led to losses
    const recentLosses = scored
      .filter(a => a._norm === 'LOSS')
      .slice(0, 5)
      .map(a => ({
        signal:    a.signal,
        confidence: a.confidence,
        pts:       a.pts_to_t1,
        vix:       a.vix_at_signal,
        date:      a.created_at?.split('T')[0],
        aiView:    a.ai_view,
      }))

    // Recent wins
    const recentWins = scored
      .filter(a => a._norm === 'WIN')
      .slice(0, 5)
      .map(a => ({
        signal:    a.signal,
        confidence: a.confidence,
        pts:       a.pts_to_t1,
        vix:       a.vix_at_signal,
        date:      a.created_at?.split('T')[0],
      }))

    // Chat learnings — what companion has learned from your conversations
    const chatLearnings = (profile?.chat_learnings || []).slice(-7)

    // Trailing 5-day performance
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString()
    const recent5d    = scored.filter(a => a.created_at > fiveDaysAgo)
    const recent5dWR  = recent5d.length > 0
      ? Math.round(recent5d.filter(a => a._norm === 'WIN').length / recent5d.length * 100)
      : null

    return NextResponse.json({
      summary: {
        total, wins, losses, scratch, winRate,
        avgPts, sessionCount: profile?.session_count || 0,
        longWinRate: longWR, shortWinRate: shortWR,
        recent5d: { count: recent5d.length, winRate: recent5dWR },
      },
      confidenceCalibration,
      vixPerformance,
      alignment: {
        alignedWinRate: alignedWR, alignedCount: aligned.length,
        divergentWinRate: divergentWR, divergentCount: divergent.length,
        note: alignedWR && divergentWR
          ? alignedWR > divergentWR
            ? `Following the plan wins ${alignedWR - divergentWR}% more often`
            : `Diverging from plan wins ${divergentWR - alignedWR}% more often`
          : 'Need more data'
      },
      // ── New feature breakdowns ────────────────────────────────────────────
      featureBreakdowns: {
        mechanical:    mechanicalBreakdown,
        asymmetric:    asymmetricBreakdown,
        actionability: actionabilityBreakdown,
        setupType:     setupTypeBreakdown,
        namedSetups:   namedSetupBreakdown,
        crossAsset:    crossAssetBreakdown,
        session:       sessionBreakdown,
      },
      setupScorePerformance,
      actionabilityEdge: {
        actionableWins, actionableTotal,
        actionableWinRate: actionableTotal > 0 ? Math.round(actionableWins / actionableTotal * 100) : null,
        noiseWins, noiseTotal,
        noiseWinRate: noiseTotal > 0 ? Math.round(noiseWins / noiseTotal * 100) : null,
        note: actionableTotal >= 5 && noiseTotal >= 3
          ? Math.round(actionableWins / actionableTotal * 100) > Math.round(noiseWins / noiseTotal * 100)
            ? `ACTIONABLE filters work: +${Math.round(actionableWins/actionableTotal*100) - Math.round(noiseWins/noiseTotal*100)}% win rate vs ignoring filter`
            : `ACTIONABLE filter not yet additive — review verdicts`
          : 'Need more scored trades to validate filter',
      },
      recentLosses,
      recentWins,
      aiLearnings: {
        chatLearnings,
        weaknesses: profile?.weaknesses || [],
        strengths:  profile?.strengths  || [],
        patterns:   profile?.patterns   || [],
        edgeNotes:  profile?.edge_notes || [],
      },
      dataQuality: {
        scoredSignals: total,
        unscoredSignals: (alerts || []).filter(a => a.outcome === 'PENDING' || !a.outcome).length,
        hasEnoughData: total >= 20,
        note: total < 10 ? 'Need at least 10 scored signals for reliable insights' :
              total < 20 ? 'Getting there — 20+ signals gives reliable patterns' :
              `Good dataset — ${total} scored signals`
      }
    })

  } catch (e: any) {
    console.error('[insights]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
