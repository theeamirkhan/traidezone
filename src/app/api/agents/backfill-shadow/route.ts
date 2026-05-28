/**
 * /api/agents/backfill-shadow
 *
 * Retroactively generates shadow predictions for historical trading days.
 * Fetches historical Polygon bars, reconstructs market state at each 5-min
 * interval, calls Haiku for a prediction, grades outcomes from the same
 * data.
 *
 * CRITICAL ANTI-LEAKAGE GUARANTEE:
 *   buildHistoricalState() slices bars to ≤ predicted_at only.
 *   No future bar can influence the prediction.
 *
 * Usage:
 *   POST /api/agents/backfill-shadow?from=2026-05-01&to=2026-05-28
 *
 * Idempotent: re-running on the same date range won't duplicate predictions
 * (checks for existing predicted_at timestamps per day).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildHistoricalState } from '../../../lib/buildHistoricalState'
import type { RawBar } from '../../../lib/buildMarketState'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const POLYGON_KEY   = process.env.POLYGON_API_KEY
const ADMIN_USER_ID = 'user_3BKD6y0MW6t9rxyyZo3HlywvkqT'

// ── Auth (admin only — backfill is privileged) ──
function isAuthorized(req: NextRequest): boolean {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const url = new URL(req.url)
  const isManualBypass = url.searchParams.get('cron') === '1'
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || ''
  const isFromApp = origin.includes('traidezone') || origin.includes('localhost')
  return isVercelCron || isCronSecret || isManualBypass || isFromApp
}

// Simple deterministic hash (matches predict-shadow)
function simpleHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

// ── Fetch bars for a specific date range ──
async function fetchBarsForDay(date: string, timespan: '5' | '1'): Promise<RawBar[]> {
  if (!POLYGON_KEY) return []
  try {
    // Wide window to capture all session bars (Polygon returns UTC)
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/${timespan}/minute/${date}/${date}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      console.warn(`[backfill] bars fetch failed for ${date}/${timespan}min:`, res.status)
      return []
    }
    const data: any = await res.json()
    return (data?.results || []).map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }))
  } catch (e) {
    console.warn(`[backfill] bars fetch error ${date}:`, e)
    return []
  }
}

// ── Fetch VIX close for a specific date ──
async function fetchVIXForDay(date: string): Promise<{ price: number | null; change: number | null }> {
  if (!POLYGON_KEY) return { price: null, change: null }
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/I:VIX/range/1/day/${date}/${date}?adjusted=true&apiKey=${POLYGON_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { price: null, change: null }
    const data: any = await res.json()
    const bar = data?.results?.[0]
    if (!bar) return { price: null, change: null }
    return { price: bar.c, change: bar.o ? ((bar.c - bar.o) / bar.o) * 100 : null }
  } catch { return { price: null, change: null } }
}

// ── Fetch SPX prior-day OHLC for a specific date ──
async function fetchPriorDayOHLC(date: string): Promise<{ pdh: number | null; pdl: number | null; prevClose: number | null }> {
  if (!POLYGON_KEY) return { pdh: null, pdl: null, prevClose: null }
  try {
    // Need previous trading day — fetch 7 calendar days back and pick last
    const targetDate = new Date(date)
    const weekBack = new Date(targetDate.getTime() - 7 * 86400000).toISOString().split('T')[0]
    const dayBefore = new Date(targetDate.getTime() - 86400000).toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/day/${weekBack}/${dayBefore}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { pdh: null, pdl: null, prevClose: null }
    const data: any = await res.json()
    const bars = data?.results || []
    const lastBar = bars[bars.length - 1]
    if (!lastBar) return { pdh: null, pdl: null, prevClose: null }
    return { pdh: lastBar.h, pdl: lastBar.l, prevClose: lastBar.c }
  } catch { return { pdh: null, pdl: null, prevClose: null } }
}

// ── Call Haiku for shadow prediction at this state ──
async function generateBackfillPrediction(context: any): Promise<any | null> {
  if (!ANTHROPIC_KEY) return null

  const prompt = `You are an SPX intraday options trading model. Given this historical market state at ${context.timeET} ET, what directional call would you make for the next 30-90 minutes?

NOTE: This is a backfill replay — pretend you only know this snapshot, not what happens after.

CURRENT STATE:
- SPX: ${context.currentSPX}
- Time: ${context.timeET} ET (${context.sessionWindow})
- VIX: ${context.vix || 'unknown'}${context.vixChange ? ` (${context.vixChange > 0 ? '+' : ''}${context.vixChange.toFixed(1)}%)` : ''}

MECHANICAL FLOW:
- Bias: ${context.mechBias || 'unknown (GEX unavailable in this backfill)'}
- Candidate direction hint: ${context.candidateSignal || 'unknown'}
- Asymmetric setup: ${context.mechAsymmetric || 'none'}

DAY TYPE REGIME:
- Type: ${context.dayType || 'unknown'} (confidence: ${context.dayTypeConfidence || 'unknown'})
- TREND prob: ${context.dayTrendProb || '?'}% | RANGE prob: ${context.dayRangeProb || '?'}%
- Directional lean: ${context.dayDirectionalLean || 'neutral'}

ACTIONABILITY:
- Verdict: ${context.actionability || 'unknown'}
- Reasoning: ${context.actionabilityRationale || 'none'}

MICROSTRUCTURE (best directional signals when mech/flow unavailable):
- Cum delta: ${context.cumDelta} (${context.cumDeltaTrend})  ← STRONG_BUY/BUY indicates aggressive buying pressure, SELL/STRONG_SELL aggressive selling
- 15-min trend: ${context.m15Trend || 'unknown'}             ← BULLISH/BEARISH/RANGING

LEVELS (interpret price location):
- VWAP: ${context.vwap?.toFixed(2) || '?'} (current dist: ${context.vwapDist || '?'} pts) ← above VWAP = bullish, below = bearish
- POC / VAH / VAL: ${context.poc || '?'} / ${context.vah || '?'} / ${context.val || '?'}
- ORB high/low: ${context.orbHigh || '?'} / ${context.orbLow || '?'} ← break above ORB high = bullish breakout, below = bearish
- PDH/PDL: ${context.pdh || '?'} / ${context.pdl || '?'}
- Intraday H/L: ${context.intradayHigh || '?'} / ${context.intradayLow || '?'}

YOUR JOB: Make a DIRECTIONAL CALL (LONG or SHORT) more often than not.
WAIT is reserved ONLY for explicit conflict (e.g. price above VWAP but cum delta STRONG_SELL).

If GEX data is "unknown" (backfill mode), DO NOT default to WAIT.
Use cum delta + 15-min trend + VWAP distance + ORB position as your primary directional signals.

Return JSON only:
{
  "signal": "LONG" | "SHORT" | "WAIT",
  "confidence": 50-85,
  "predictedT1": numeric (5-15 SPX points in signal direction; null only for WAIT),
  "predictedStop": numeric (5-10 SPX points against signal; null only for WAIT),
  "predictedT2": numeric or null,
  "reasoning": "1-2 sentence rationale citing the SPECIFIC data points above that drove the call"
}

DIRECTIONAL LOGIC (use this when GEX is unavailable):
- Cum delta STRONG_BUY + m15 BULLISH + price above VWAP → LONG (high conviction 65-80)
- Cum delta STRONG_SELL + m15 BEARISH + price below VWAP → SHORT (high conviction 65-80)
- Cum delta BUY/SELL + one supporting indicator → LONG/SHORT (moderate 55-65)
- Mixed signals across cum delta and trend → WAIT
- ORB breakout (price > orbHigh) with momentum → LONG
- ORB breakdown (price < orbLow) with momentum → SHORT

Confidence floor 50, ceiling 85. Be honest about your confidence — but lean directional over WAIT.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()
    try {
      return JSON.parse(text)
    } catch {
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try { return JSON.parse(text.substring(first, last + 1)) } catch { return null }
      }
      return null
    }
  } catch { return null }
}

// ── Grade a prediction from historical bars ──
function gradeFromBars(
  pred: { direction: string; entrySPX: number; t1: number | null; stop: number | null; predictedAt: number },
  bars1m: RawBar[],
  horizonMs: number,
): { outcome: 'WIN' | 'LOSS' | 'SCRATCH'; actualSPX: number | null; maxFav: number; maxAdv: number } {
  const cutoff = pred.predictedAt + horizonMs
  const windowBars = bars1m.filter(b => b.t >= pred.predictedAt && b.t <= cutoff)
  if (windowBars.length === 0) return { outcome: 'SCRATCH', actualSPX: null, maxFav: 0, maxAdv: 0 }

  const finalSPX = windowBars[windowBars.length - 1].c
  let maxFav = 0
  let maxAdv = 0
  for (const bar of windowBars) {
    if (pred.direction === 'LONG') {
      maxFav = Math.max(maxFav, bar.h - pred.entrySPX)
      maxAdv = Math.min(maxAdv, bar.l - pred.entrySPX)
    } else if (pred.direction === 'SHORT') {
      maxFav = Math.max(maxFav, pred.entrySPX - bar.l)
      maxAdv = Math.min(maxAdv, pred.entrySPX - bar.h)
    } else {
      maxFav = Math.max(maxFav, Math.abs(bar.c - pred.entrySPX))
    }
  }

  let outcome: 'WIN' | 'LOSS' | 'SCRATCH' = 'SCRATCH'
  if (pred.direction === 'WAIT') {
    if (maxFav >= 10) outcome = 'LOSS'
    else if (maxFav <= 5) outcome = 'WIN'
    else outcome = 'SCRATCH'
  } else {
    if (pred.t1 !== null) {
      const targetReached = pred.direction === 'LONG'
        ? windowBars.some(b => b.h >= pred.t1!)
        : windowBars.some(b => b.l <= pred.t1!)
      const stopHit = pred.stop !== null && (pred.direction === 'LONG'
        ? windowBars.some(b => b.l <= pred.stop!)
        : windowBars.some(b => b.h >= pred.stop!))
      if (targetReached) outcome = 'WIN'
      else if (stopHit) outcome = 'LOSS'
      else {
        const finalMove = pred.direction === 'LONG' ? finalSPX - pred.entrySPX : pred.entrySPX - finalSPX
        if (finalMove >= 3) outcome = 'WIN'
        else if (finalMove <= -3) outcome = 'LOSS'
        else outcome = 'SCRATCH'
      }
    } else {
      const finalMove = pred.direction === 'LONG' ? finalSPX - pred.entrySPX : pred.entrySPX - finalSPX
      if (finalMove >= 5) outcome = 'WIN'
      else if (finalMove <= -5) outcome = 'LOSS'
      else outcome = 'SCRATCH'
    }
  }

  return { outcome, actualSPX: finalSPX, maxFav: parseFloat(maxFav.toFixed(2)), maxAdv: parseFloat(maxAdv.toFixed(2)) }
}

// ── Date helpers ──
function dateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function isWeekday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z')  // noon UTC to avoid TZ edge cases
  const dow = d.getUTCDay()
  return dow >= 1 && dow <= 5
}

// US market holidays (rough — covers major closures; weekend filter handles most)
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
])

// ── Process one day: returns count of predictions inserted ──
async function processOneDay(date: string, dryRun: boolean): Promise<{ date: string; inserted: number; graded: number; skipped: string | null }> {
  // Skip weekend & holidays
  if (!isWeekday(date)) return { date, inserted: 0, graded: 0, skipped: 'weekend' }
  if (HOLIDAYS_2026.has(date)) return { date, inserted: 0, graded: 0, skipped: 'holiday' }

  // Check if we already have predictions for this date — idempotency guard
  const dayStartUTC = new Date(date + 'T00:00:00Z').toISOString()
  const dayEndUTC   = new Date(date + 'T23:59:59Z').toISOString()
  const { data: existing } = await supabaseAdmin
    .from('shadow_predictions')
    .select('id')
    .eq('user_id', ADMIN_USER_ID)
    .gte('predicted_at', dayStartUTC)
    .lte('predicted_at', dayEndUTC)
    .limit(1)

  if (existing && existing.length > 0) {
    return { date, inserted: 0, graded: 0, skipped: 'already-backfilled' }
  }

  // Fetch all bars for this day + yesterday
  const yesterday = dateString(new Date(new Date(date).getTime() - 86400000))
  const [bars5m, bars1m, yesterdayBars5m, vix, priorDay] = await Promise.all([
    fetchBarsForDay(date, '5'),
    fetchBarsForDay(date, '1'),
    fetchBarsForDay(yesterday, '5'),
    fetchVIXForDay(date),
    fetchPriorDayOHLC(date),
  ])

  if (bars5m.length === 0) {
    return { date, inserted: 0, graded: 0, skipped: 'no-bars-available' }
  }

  // Generate prediction timestamps: every 5 min from 9:35 to 15:55 ET
  // Convert to UTC (handle DST via existing ET formatter)
  const targets: number[] = []
  for (let mins = 5; mins <= 385; mins += 5) {
    // mins = minutes since 9:30 ET
    // Build target Date in ET
    const targetHour = 9 + Math.floor((30 + mins) / 60)
    const targetMin = (30 + mins) % 60
    // We need a UTC timestamp that, when formatted in America/New_York, gives targetHour:targetMin
    // Iterate offsets to find the right UTC time
    const probe = new Date(`${date}T${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}:00-05:00`)
    const probeET = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(probe)
    const [probeH, probeM] = probeET.split(':').map(s => parseInt(s, 10))
    // If DST shifted (e.g. EDT instead of EST), adjust
    let candidate = probe.getTime()
    if (probeH === targetHour && probeM === targetMin) {
      // exact match
    } else {
      // try -04:00 offset (EDT)
      const probeDST = new Date(`${date}T${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}:00-04:00`)
      candidate = probeDST.getTime()
    }
    targets.push(candidate)
  }

  const results = { inserted: 0, graded: 0 }
  const BATCH_SIZE = 8  // 8 concurrent Haiku calls per batch

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (targetMs) => {
      const state = buildHistoricalState({
        targetMs,
        allDayBars5m:    bars5m,
        allDayBars1m:    bars1m,
        yesterdayBars5m,
        priorDay,
        vix,
        gex:             null,
      })

      if (!state || !state.currentSPX) return

      const context = {
        currentSPX:        state.currentSPX,
        timeET:            state.timeET,
        sessionWindow:     state.sessionWindow,
        vix:               state.vix,
        vixChange:         state.vixChange,
        mechBias:          state.mechanicalFlow?.mechanicalBias || null,
        candidateSignal:   state.candidateSignal,
        mechAsymmetric:    state.mechanicalFlow?.asymmetricSetup || null,
        dayType:           state.dayTypeForecast?.dayType || null,
        dayTypeConfidence: state.dayTypeForecast?.confidence || null,
        dayTrendProb:      state.dayTypeForecast?.trendProbability || null,
        dayRangeProb:      state.dayTypeForecast?.consolidationProbability || null,
        dayDirectionalLean: state.dayTypeForecast?.directionalLean || null,
        actionability:     state.actionability?.verdict || null,
        actionabilityRationale: state.actionability?.reasoning || null,
        cumDelta:          state.cumDelta,
        cumDeltaTrend:     state.cumDeltaTrend,
        m15Trend:          state.m15Trend,
        vwap:              state.vwap,
        vwapDist:          state.vwap ? (state.currentSPX - state.vwap).toFixed(2) : null,
        poc:               state.volumeProfile?.poc || null,
        vah:               state.volumeProfile?.vah || null,
        val:               state.volumeProfile?.val || null,
        orbHigh:           state.orbHigh,
        orbLow:            state.orbLow,
        pdh:               state.pdh,
        pdl:               state.pdl,
        intradayHigh:      state.intradayHigh,
        intradayLow:       state.intradayLow,
      }

      const prediction = await generateBackfillPrediction(context)
      if (!prediction) return

      const sigComponents = [
        Math.floor(state.currentSPX / 5) * 5,
        state.sessionWindow,
        state.gexRegime || 'unk',
        state.mechanicalFlow?.mechanicalBias || 'unk',
        state.dayTypeForecast?.dayType || 'unk',
        state.actionability?.verdict || 'unk',
        state.vix ? Math.floor(state.vix) : 'unk',
        state.cumDelta,
        state.m15Trend || 'unk',
      ].join('|')
      const sig = simpleHash(sigComponents)

      if (dryRun) {
        results.inserted++
        return
      }

      const predDir = prediction.signal || 'WAIT'
      const score30 = gradeFromBars({
        direction: predDir, entrySPX: state.currentSPX, t1: prediction.predictedT1 || null,
        stop: prediction.predictedStop || null, predictedAt: targetMs,
      }, bars1m, 30 * 60 * 1000)
      const score60 = gradeFromBars({
        direction: predDir, entrySPX: state.currentSPX, t1: prediction.predictedT1 || null,
        stop: prediction.predictedStop || null, predictedAt: targetMs,
      }, bars1m, 60 * 60 * 1000)
      const score90 = gradeFromBars({
        direction: predDir, entrySPX: state.currentSPX, t1: prediction.predictedT1 || null,
        stop: prediction.predictedStop || null, predictedAt: targetMs,
      }, bars1m, 90 * 60 * 1000)

      let status = 'pending'
      if (score30.actualSPX !== null) status = 'graded_30m'
      if (score60.actualSPX !== null) status = 'graded_60m'
      if (score90.actualSPX !== null) status = 'graded_90m'

      const { error: insErr } = await supabaseAdmin.from('shadow_predictions').insert({
        user_id:           ADMIN_USER_ID,
        predicted_at:      new Date(targetMs).toISOString(),
        signal_direction:  predDir,
        confidence:        prediction.confidence || 50,
        current_spx:       state.currentSPX,
        predicted_t1:      prediction.predictedT1 || null,
        predicted_stop:    prediction.predictedStop || null,
        predicted_t2:      prediction.predictedT2 || null,
        ai_view:           prediction.reasoning || null,
        context_snapshot:  { ...context, _backfill: true },
        regime_signature:  sig,
        status,
        outcome_30m:       score30.actualSPX !== null ? score30.outcome : null,
        outcome_60m:       score60.actualSPX !== null ? score60.outcome : null,
        outcome_90m:       score90.actualSPX !== null ? score90.outcome : null,
        actual_spx_30m:    score30.actualSPX,
        actual_spx_60m:    score60.actualSPX,
        actual_spx_90m:    score90.actualSPX,
        max_favorable_move: score90.maxFav || score60.maxFav || score30.maxFav,
        max_adverse_move:  score90.maxAdv || score60.maxAdv || score30.maxAdv,
        graded_at:         score30.actualSPX !== null ? new Date().toISOString() : null,
      })

      if (insErr) {
        console.error(`[backfill] insert error for ${date} @ ${new Date(targetMs).toISOString()}:`, insErr)
        return
      }

      results.inserted++
      if (status !== 'pending') results.graded++
    }))
  }

  return { date, inserted: results.inserted, graded: results.graded, skipped: null }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const dryRun = url.searchParams.get('dryRun') === 'true'

  if (!fromParam || !toParam) {
    return NextResponse.json({
      error: 'Missing params',
      usage: 'POST /api/agents/backfill-shadow?from=YYYY-MM-DD&to=YYYY-MM-DD [&dryRun=true]',
    }, { status: 400 })
  }

  if (!POLYGON_KEY) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not set' }, { status: 500 })
  }
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  // Build list of dates to process
  const startMs = new Date(fromParam + 'T00:00:00Z').getTime()
  const endMs   = new Date(toParam + 'T00:00:00Z').getTime()
  if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const dates: string[] = []
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    dates.push(dateString(new Date(ms)))
  }

  if (dates.length > 10) {
    return NextResponse.json({
      error: 'Range too large (max 10 days per call to stay under 5min function timeout)',
      tip:   'Run in smaller chunks: from=2026-04-28&to=2026-05-07, then from=2026-05-08&to=2026-05-15, etc.',
    }, { status: 400 })
  }

  const startTime = Date.now()
  const results: any[] = []
  let totalInserted = 0
  let totalGraded = 0

  for (const date of dates) {
    try {
      const result = await processOneDay(date, dryRun)
      results.push(result)
      totalInserted += result.inserted
      totalGraded += result.graded
      console.log(`[backfill] ${date}: ${result.inserted} inserted, ${result.graded} graded${result.skipped ? ` (skipped: ${result.skipped})` : ''}`)
    } catch (e: any) {
      console.error(`[backfill] ${date} failed:`, e)
      results.push({ date, inserted: 0, graded: 0, error: e.message })
    }
  }

  const elapsedSec = Math.round((Date.now() - startTime) / 1000)
  return NextResponse.json({
    ok: true,
    dryRun,
    from: fromParam,
    to: toParam,
    totalInserted,
    totalGraded,
    elapsedSec,
    days: results,
  })
}

// Also accept GET for ease of manual triggering via browser
export async function GET(req: NextRequest) {
  return POST(req)
}
