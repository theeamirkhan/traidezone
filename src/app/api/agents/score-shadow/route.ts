/**
 * /api/agents/score-shadow — Shadow Prediction Scoring Agent
 *
 * Runs every 5 minutes. Finds shadow predictions that have reached the
 * 30/60/90 minute mark and grades them against actual SPX movement.
 *
 * Status progression:
 *   pending → graded_30m → graded_60m → graded_90m (final)
 *
 * For each horizon, computes:
 *   - outcome (WIN/LOSS/SCRATCH)
 *   - actual SPX at that time
 *   - max favorable move from entry
 *   - max adverse move from entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ── Cron auth ──
function isAuthorized(req: NextRequest): boolean {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const url = new URL(req.url)
  const isManualBypass = url.searchParams.get('cron') === '1'
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || ''
  const isFromApp = origin.includes('traidezone') || origin.includes('localhost')
  return isVercelCron || isCronSecret || isManualBypass || isFromApp
}

// ── Fetch SPX bars within a time range ──
async function fetchSPXBars(fromMs: number, toMs: number): Promise<any[]> {
  try {
    const polygonKey = process.env.POLYGON_API_KEY
    if (!polygonKey) return []
    // Use 1-min bars for accurate intra-window high/low capture
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/minute/${fromMs}/${toMs}?adjusted=true&sort=asc&limit=200&apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data: any = await res.json()
    return data?.results || []
  } catch (e) {
    console.warn('[score-shadow] bars fetch failed:', e)
    return []
  }
}

// ── Score a prediction at a specific horizon ──
function scoreOutcome(
  pred: any,
  bars: any[],
  horizonMs: number,
): { outcome: 'WIN' | 'LOSS' | 'SCRATCH'; actualSPX: number | null; maxFav: number; maxAdv: number } {
  const direction = pred.signal_direction
  const entrySPX = parseFloat(pred.current_spx)
  const t1 = pred.predicted_t1 ? parseFloat(pred.predicted_t1) : null
  const stop = pred.predicted_stop ? parseFloat(pred.predicted_stop) : null
  const predictedAt = new Date(pred.predicted_at).getTime()
  const cutoff = predictedAt + horizonMs

  // Filter bars to the prediction window
  const windowBars = bars.filter(b => b.t >= predictedAt && b.t <= cutoff)
  if (windowBars.length === 0) {
    return { outcome: 'SCRATCH', actualSPX: null, maxFav: 0, maxAdv: 0 }
  }

  // Use last bar's close as "actual" SPX at horizon
  const finalSPX = windowBars[windowBars.length - 1].c

  // Compute max favorable and adverse moves within window
  let maxFav = 0
  let maxAdv = 0
  for (const bar of windowBars) {
    if (direction === 'LONG') {
      maxFav = Math.max(maxFav, bar.h - entrySPX)
      maxAdv = Math.min(maxAdv, bar.l - entrySPX)
    } else if (direction === 'SHORT') {
      maxFav = Math.max(maxFav, entrySPX - bar.l)
      maxAdv = Math.min(maxAdv, entrySPX - bar.h)
    } else {
      // WAIT: maxFav = how much price moved either way (a "win" for WAIT is small movement)
      const move = Math.abs(bar.c - entrySPX)
      maxFav = Math.max(maxFav, move)
    }
  }

  // Determine outcome
  let outcome: 'WIN' | 'LOSS' | 'SCRATCH' = 'SCRATCH'

  if (direction === 'WAIT') {
    // WAIT correct = price stayed in narrow range (<5pts)
    // WAIT wrong = price moved >10pts in either direction
    if (maxFav >= 10) outcome = 'LOSS'      // missed a move
    else if (maxFav <= 5) outcome = 'WIN'   // correctly predicted no edge
    else outcome = 'SCRATCH'                // ambiguous drift
  } else {
    // LONG/SHORT: check T1/stop
    if (t1 !== null) {
      const targetReached = direction === 'LONG'
        ? windowBars.some(b => b.h >= t1)
        : windowBars.some(b => b.l <= t1)
      const stopHit = stop !== null && (direction === 'LONG'
        ? windowBars.some(b => b.l <= stop)
        : windowBars.some(b => b.h >= stop))

      if (targetReached) outcome = 'WIN'
      else if (stopHit) outcome = 'LOSS'
      else {
        // No clear hit — check final price direction
        const finalMove = direction === 'LONG' ? finalSPX - entrySPX : entrySPX - finalSPX
        if (finalMove >= 3) outcome = 'WIN'     // mild win
        else if (finalMove <= -3) outcome = 'LOSS'  // mild loss
        else outcome = 'SCRATCH'
      }
    } else {
      // No T1 defined — judge by final price direction
      const finalMove = direction === 'LONG' ? finalSPX - entrySPX : entrySPX - finalSPX
      if (finalMove >= 5) outcome = 'WIN'
      else if (finalMove <= -5) outcome = 'LOSS'
      else outcome = 'SCRATCH'
    }
  }

  return {
    outcome,
    actualSPX: finalSPX,
    maxFav: parseFloat(maxFav.toFixed(2)),
    maxAdv: parseFloat(maxAdv.toFixed(2)),
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = Date.now()
    const thirtyMinAgo = now - 30 * 60 * 1000
    const sixtyMinAgo = now - 60 * 60 * 1000
    const ninetyMinAgo = now - 90 * 60 * 1000

    // Find predictions that need grading
    // status='pending' AND age >= 30m → grade at 30m
    // status='graded_30m' AND age >= 60m → grade at 60m
    // status='graded_60m' AND age >= 90m → grade at 90m

    const grades = []

    // ── 30-minute grading ──
    const { data: pending30 } = await supabaseAdmin
      .from('shadow_predictions')
      .select('*')
      .eq('status', 'pending')
      .lte('predicted_at', new Date(thirtyMinAgo).toISOString())
      .limit(50)

    for (const pred of pending30 || []) {
      const predictedMs = new Date(pred.predicted_at).getTime()
      const bars = await fetchSPXBars(predictedMs, predictedMs + 30 * 60 * 1000)
      const score = scoreOutcome(pred, bars, 30 * 60 * 1000)

      await supabaseAdmin
        .from('shadow_predictions')
        .update({
          status:             'graded_30m',
          outcome_30m:        score.outcome,
          actual_spx_30m:     score.actualSPX,
          max_favorable_move: score.maxFav,
          max_adverse_move:   score.maxAdv,
          graded_at:          new Date().toISOString(),
        })
        .eq('id', pred.id)

      grades.push({ id: pred.id, horizon: '30m', outcome: score.outcome })
    }

    // ── 60-minute grading ──
    const { data: pending60 } = await supabaseAdmin
      .from('shadow_predictions')
      .select('*')
      .eq('status', 'graded_30m')
      .lte('predicted_at', new Date(sixtyMinAgo).toISOString())
      .limit(50)

    for (const pred of pending60 || []) {
      const predictedMs = new Date(pred.predicted_at).getTime()
      const bars = await fetchSPXBars(predictedMs, predictedMs + 60 * 60 * 1000)
      const score = scoreOutcome(pred, bars, 60 * 60 * 1000)

      await supabaseAdmin
        .from('shadow_predictions')
        .update({
          status:         'graded_60m',
          outcome_60m:    score.outcome,
          actual_spx_60m: score.actualSPX,
          graded_at:      new Date().toISOString(),
        })
        .eq('id', pred.id)

      grades.push({ id: pred.id, horizon: '60m', outcome: score.outcome })
    }

    // ── 90-minute grading ──
    const { data: pending90 } = await supabaseAdmin
      .from('shadow_predictions')
      .select('*')
      .eq('status', 'graded_60m')
      .lte('predicted_at', new Date(ninetyMinAgo).toISOString())
      .limit(50)

    for (const pred of pending90 || []) {
      const predictedMs = new Date(pred.predicted_at).getTime()
      const bars = await fetchSPXBars(predictedMs, predictedMs + 90 * 60 * 1000)
      const score = scoreOutcome(pred, bars, 90 * 60 * 1000)

      await supabaseAdmin
        .from('shadow_predictions')
        .update({
          status:         'graded_90m',
          outcome_90m:    score.outcome,
          actual_spx_90m: score.actualSPX,
          graded_at:      new Date().toISOString(),
        })
        .eq('id', pred.id)

      grades.push({ id: pred.id, horizon: '90m', outcome: score.outcome })
    }

    return NextResponse.json({
      ok: true,
      graded_count: grades.length,
      grades,
    })
  } catch (e: any) {
    console.error('[score-shadow] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
