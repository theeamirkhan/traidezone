/**
 * /api/mechanical-flow-accuracy
 *
 * Reads past trades from the trades table and scores mechanical flow accuracy:
 *  - How often did mechanical bias predict the winner correctly?
 *  - Did entering on AMPLIFY setups outperform RESISTED?
 *  - Did following predicted entry windows produce better P&L?
 *
 * Returns: aggregate stats for the AI Learning dashboard
 */

import { NextResponse } from 'next/server'
import { auth }         from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: trades, error } = await supabaseAdmin.from('trades')
      .select('id, date, symbol, direction, qty, price, pnl, notes')
      .eq('user_id', userId)
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const withMech = (trades || []).filter(t => t.notes?.includes('Mech:'))

    if (withMech.length === 0) {
      return NextResponse.json({
        sampleSize: 0,
        note: 'No trades with mechanical flow snapshots yet — keep trading to build sample',
      })
    }

    // Parse mechanical bias from notes string
    const parsed = withMech.map(t => {
      const mechMatch = t.notes!.match(/Mech: (BULLISH|BEARISH|NEUTRAL|TWO_WAY) (-?\d+)( \((BULLISH_AMPLIFY|BEARISH_AMPLIFY|BULLISH_RESISTED|BEARISH_RESISTED|NEUTRAL)\))?/)
      if (!mechMatch) return null
      return {
        pnl:        t.pnl || 0,
        direction:  t.direction,
        mechBias:   mechMatch[1],
        mechScore:  parseInt(mechMatch[2]),
        asymmetric: mechMatch[5] || 'NEUTRAL',
        windowMatch: t.notes!.includes('Predicted window:'),
      }
    }).filter(Boolean) as Array<any>

    // ── Stat 1: Did mechanical bias predict winners? ─────────────────────────
    const aligned = parsed.filter(t =>
      (t.mechBias === 'BULLISH' && t.direction === 'LONG') ||
      (t.mechBias === 'BEARISH' && t.direction === 'SHORT')
    )
    const opposed = parsed.filter(t =>
      (t.mechBias === 'BULLISH' && t.direction === 'SHORT') ||
      (t.mechBias === 'BEARISH' && t.direction === 'LONG')
    )

    const alignedWinRate = aligned.length > 0
      ? Math.round(aligned.filter(t => t.pnl > 0).length / aligned.length * 100)
      : 0
    const opposedWinRate = opposed.length > 0
      ? Math.round(opposed.filter(t => t.pnl > 0).length / opposed.length * 100)
      : 0
    const alignedAvgPnl = aligned.length > 0
      ? Math.round(aligned.reduce((s, t) => s + t.pnl, 0) / aligned.length)
      : 0
    const opposedAvgPnl = opposed.length > 0
      ? Math.round(opposed.reduce((s, t) => s + t.pnl, 0) / opposed.length)
      : 0

    // ── Stat 2: Did AMPLIFY setups outperform RESISTED? ──────────────────────
    const amplify  = parsed.filter(t => t.asymmetric.includes('AMPLIFY'))
    const resisted = parsed.filter(t => t.asymmetric.includes('RESISTED'))
    const amplifyWinRate  = amplify.length > 0
      ? Math.round(amplify.filter(t => t.pnl > 0).length / amplify.length * 100)
      : 0
    const resistedWinRate = resisted.length > 0
      ? Math.round(resisted.filter(t => t.pnl > 0).length / resisted.length * 100)
      : 0

    // ── Stat 3: Window timing impact ─────────────────────────────────────────
    const withWindow = parsed.filter(t => t.windowMatch)
    const noWindow   = parsed.filter(t => !t.windowMatch)
    const withWindowAvgPnl = withWindow.length > 0
      ? Math.round(withWindow.reduce((s, t) => s + t.pnl, 0) / withWindow.length)
      : null
    const noWindowAvgPnl = noWindow.length > 0
      ? Math.round(noWindow.reduce((s, t) => s + t.pnl, 0) / noWindow.length)
      : null

    // ── Verdict ──────────────────────────────────────────────────────────────
    let verdict = 'INSUFFICIENT_DATA'
    let edge: string | null = null
    if (aligned.length >= 5 && opposed.length >= 5) {
      const diff = alignedWinRate - opposedWinRate
      if (diff > 15)      { verdict = 'STRONG_EDGE';   edge = `+${diff}% win rate when mechanics align` }
      else if (diff > 5)  { verdict = 'MODERATE_EDGE'; edge = `+${diff}% win rate when mechanics align` }
      else if (diff < -5) { verdict = 'INVERSE_EDGE';  edge = `Mechanics opposing wins more — fade the bias` }
      else                { verdict = 'NO_EDGE';        edge = 'Mechanical bias not predictive yet' }
    }

    return NextResponse.json({
      sampleSize: parsed.length,
      verdict,
      edge,
      alignedTrades: {
        count:    aligned.length,
        winRate:  alignedWinRate,
        avgPnl:   alignedAvgPnl,
      },
      opposedTrades: {
        count:    opposed.length,
        winRate:  opposedWinRate,
        avgPnl:   opposedAvgPnl,
      },
      amplifyTrades: {
        count:    amplify.length,
        winRate:  amplifyWinRate,
      },
      resistedTrades: {
        count:    resisted.length,
        winRate:  resistedWinRate,
      },
      windowFollow: {
        followed:    withWindow.length,
        ignored:     noWindow.length,
        followedAvgPnl: withWindowAvgPnl,
        ignoredAvgPnl:  noWindowAvgPnl,
        edgePts: (withWindowAvgPnl !== null && noWindowAvgPnl !== null)
          ? withWindowAvgPnl - noWindowAvgPnl
          : null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
