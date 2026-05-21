/**
 * /api/agents/score-alerts — Trade Alert Scoring Agent
 *
 * Runs on Vercel cron every 30 minutes, Mon-Fri market hours (9:30am-4:30pm ET)
 * Also callable on-demand for immediate scoring.
 *
 * For each PENDING alert:
 *  1. Fetch current SPX price from Polygon
 *  2. Score against entry/stop/targets
 *  3. Write outcome back to Supabase trade_alerts table
 *  4. After 2 hours, force-expire any still-PENDING alerts
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

type Outcome = 'PENDING' | 'HIT_T1' | 'HIT_T2' | 'STOPPED_OUT' | 'PARTIAL' | 'EXPIRED'

// ── Fetch current SPX price from Polygon ──────────────────────────────────────
async function getCurrentSPX(): Promise<number | null> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${today}/${today}?adjusted=true&sort=asc&limit=500&apiKey=${process.env.POLYGON_API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    const bars = data.results || []
    if (!bars.length) return null
    return bars[bars.length - 1].c
  } catch (e) {
    console.error('[score-alerts] SPX fetch failed:', e)
    return null
  }
}

// ── Score a single alert ──────────────────────────────────────────────────────
function scoreAlert(alert: any, currentPrice: number): {
  outcome: Outcome
  ptsToT1: number
  outcomeNote: string
} {
  const isLong    = alert.signal === 'LONG'
  const entryMid  = parseFloat(alert.entry_mid)
  const stop      = parseFloat(alert.stop_level)
  const t1        = parseFloat(alert.target1)
  const t2        = parseFloat(alert.target2)
  const ageMs     = Date.now() - new Date(alert.logged_at).getTime()
  const ageMin    = ageMs / 60000

  const priceMov  = isLong ? currentPrice - entryMid : entryMid - currentPrice
  const hitT2     = isLong ? currentPrice >= t2 : currentPrice <= t2
  const hitT1     = isLong ? currentPrice >= t1 : currentPrice <= t1
  const stopped   = isLong ? currentPrice <= stop : currentPrice >= stop

  let outcome: Outcome = 'PENDING'
  let outcomeNote = ''

  if (hitT2) {
    outcome = 'HIT_T2'
    outcomeNote = `T2 reached: +${Math.abs(currentPrice - entryMid).toFixed(1)}pts in ${Math.round(ageMin)}min`
  } else if (hitT1) {
    outcome = 'HIT_T1'
    outcomeNote = `T1 reached: +${Math.abs(currentPrice - entryMid).toFixed(1)}pts in ${Math.round(ageMin)}min`
  } else if (stopped) {
    outcome = 'STOPPED_OUT'
    outcomeNote = `Stopped: ${Math.abs(currentPrice - stop).toFixed(1)}pts through stop after ${Math.round(ageMin)}min`
  } else if (ageMin >= 120) {
    if (priceMov >= 8) {
      outcome = 'PARTIAL'
      outcomeNote = `Expired: +${priceMov.toFixed(1)}pts favorable but T1 not reached (${Math.round(ageMin)}min)`
    } else if (priceMov <= -5) {
      outcome = 'STOPPED_OUT'
      outcomeNote = `Expired adverse: ${priceMov.toFixed(1)}pts against after ${Math.round(ageMin)}min`
    } else {
      outcome = 'EXPIRED'
      outcomeNote = `Expired flat: ${priceMov.toFixed(1)}pts after ${Math.round(ageMin)}min`
    }
  }

  return { outcome, ptsToT1: parseFloat(priceMov.toFixed(1)), outcomeNote }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth: allow Vercel cron + internal calls
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const origin = req.headers.get('origin') || req.headers.get('referer') || ''
  const isFromApp = origin.includes('traidezone.ai') || origin.includes('localhost')

  if (!isVercelCron && !isCronSecret && !isFromApp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check market hours (only score during or just after market hours ET)
  const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const etDate = new Date(nowET)
  const etHour = etDate.getHours()
  const etDay = etDate.getDay()
  const isWeekend = etDay === 0 || etDay === 6
  const isMarketHours = etHour >= 9 && etHour <= 17  // 9am-5pm ET buffer

  // Fetch all PENDING alerts (all users — cron scores everyone)
  const { data: pending, error: fetchErr } = await supabaseAdmin
    .from('trade_alerts')
    .select('*')
    .eq('outcome', 'PENDING')
    .order('logged_at', { ascending: true })
    .limit(100)

  if (fetchErr) {
    console.error('[score-alerts] fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!pending?.length) {
    return NextResponse.json({ scored: 0, message: 'No pending alerts' })
  }

  // Get current SPX price (only during market hours — skip outside)
  let currentPrice: number | null = null
  if (!isWeekend && isMarketHours) {
    currentPrice = await getCurrentSPX()
  }

  const results: any[] = []

  for (const alert of pending) {
    const ageMs = Date.now() - new Date(alert.logged_at).getTime()
    const ageMin = ageMs / 60000

    // Force-expire alerts older than 2h even if no price
    if (ageMin >= 120 && !currentPrice) {
      const { error } = await supabaseAdmin
        .from('trade_alerts')
        .update({
          outcome:      'EXPIRED',
          outcome_at:   new Date().toISOString(),
          outcome_note: `Expired: market closed or no price available after ${Math.round(ageMin)}min`,
          scored_at:    new Date().toISOString(),
        })
        .eq('id', alert.id)

      results.push({ id: alert.id, outcome: 'EXPIRED' })
      continue
    }

    if (!currentPrice) continue  // can't score without price

    const { outcome, ptsToT1, outcomeNote } = scoreAlert(alert, currentPrice)

    if (outcome !== 'PENDING') {
      // Normalize to WIN/LOSS/SCRATCH for learning agents
      const normalizedOutcome =
        outcome === 'HIT_T1' || outcome === 'HIT_T2' ? 'WIN' :
        outcome === 'STOPPED_OUT' ? 'LOSS' :
        outcome === 'PARTIAL' ? 'SCRATCH' :
        outcome === 'EXPIRED' ? 'SCRATCH' : null

      const { error } = await supabaseAdmin
        .from('trade_alerts')
        .update({
          outcome,
          outcome_normalized: normalizedOutcome,
          outcome_at:   new Date().toISOString(),
          pts_to_t1:    ptsToT1,
          outcome_note: outcomeNote,
          scored_at:    new Date().toISOString(),
        })
        .eq('id', alert.id)

      if (error) {
        console.error(`[score-alerts] update error for ${alert.id}:`, error.message)
      } else {
        console.log(`[score-alerts] ${alert.id} → ${outcome}: ${outcomeNote}`)
        results.push({ id: alert.id, outcome, ptsToT1, outcomeNote })
      }
    }
  }

  return NextResponse.json({
    scored:        results.length,
    pending:       pending.length,
    currentPrice,
    marketHours:   !isWeekend && isMarketHours,
    results,
    timestamp:     new Date().toISOString(),
  })
}
