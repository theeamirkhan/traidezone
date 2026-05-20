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
      .select('signal, outcome, confidence, pts_to_t1, vix_at_signal, created_at, human_outcome, human_pts, ai_view, system_alignment, context_snapshot, wait_reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)

    // Fetch trader profile learnings
    const { data: profile } = await supabaseAdmin
      .from('trader_profiles')
      .select('chat_learnings, weaknesses, strengths, patterns, edge_notes, session_count')
      .eq('user_id', userId)
      .single()

    const scored  = (alerts || []).filter(a => a.outcome && a.outcome !== 'PENDING')
    const total   = scored.length
    const wins    = scored.filter(a => a.outcome === 'WIN').length
    const losses  = scored.filter(a => a.outcome === 'LOSS').length
    const scratch = scored.filter(a => a.outcome === 'SCRATCH').length
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
      if (a.outcome === 'WIN') byConfidence[bucket].wins++
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
    const longWR = longs.length > 0 ? Math.round(longs.filter(a => a.outcome === 'WIN').length / longs.length * 100) : null
    const shortWR = shorts.length > 0 ? Math.round(shorts.filter(a => a.outcome === 'WIN').length / shorts.length * 100) : null

    // VIX regime performance
    const byVix: Record<string, { wins: number; total: number }> = {}
    scored.forEach(a => {
      if (!a.vix_at_signal) return
      const bucket = a.vix_at_signal > 25 ? 'VIX >25 (high vol)' : a.vix_at_signal > 18 ? 'VIX 18-25 (elevated)' : 'VIX <18 (low vol)'
      if (!byVix[bucket]) byVix[bucket] = { wins: 0, total: 0 }
      byVix[bucket].total++
      if (a.outcome === 'WIN') byVix[bucket].wins++
    })
    const vixPerformance = Object.entries(byVix).map(([regime, d]) => ({
      regime,
      winRate: Math.round(d.wins / d.total * 100),
      count: d.total,
    }))

    // System alignment — does following the plan win more?
    const aligned   = scored.filter(a => a.system_alignment === 'aligned')
    const divergent = scored.filter(a => a.system_alignment === 'divergent')
    const alignedWR = aligned.length > 0 ? Math.round(aligned.filter(a => a.outcome === 'WIN').length / aligned.length * 100) : null
    const divergentWR = divergent.length > 0 ? Math.round(divergent.filter(a => a.outcome === 'WIN').length / divergent.length * 100) : null

    // Recent losers — what conditions led to losses
    const recentLosses = scored
      .filter(a => a.outcome === 'LOSS')
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
      .filter(a => a.outcome === 'WIN')
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
      ? Math.round(recent5d.filter(a => a.outcome === 'WIN').length / recent5d.length * 100)
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
