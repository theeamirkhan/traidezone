/**
 * /api/agents/backtest — AI Signal Historical Backtest Agent
 *
 * Fetches historical SPX/VIX data from Polygon, reconstructs what the
 * AI signal would have been each day, and scores actual outcomes.
 *
 * Data sources (all from Polygon historical):
 *  - I:SPX 5m bars  → price, VWAP, 200 EMA, intraday high/low
 *  - I:VIX 5m bars  → VIX level at signal time
 *  - I:SPX daily    → PDH/PDL from prior day
 *
 * What's NOT available historically:
 *  - Options flow (UW historical requires enterprise plan)
 *  - Market tide
 *  → These default to NEUTRAL in the AI context
 *
 * Signal logic mirrors the live system:
 *  - Only entries after 10:00 AM ET (your rule)
 *  - Looks for VWAP + EMA confluence (price above/below both)
 *  - Scores: did price reach +10pts (T1) or +25pts (T2) before -8pts (stop)?
 *  - Checks outcome over the next 90 minutes
 */

import { NextRequest, NextResponse } from 'next/server'

interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }
interface DayResult {
  date:          string
  signal:        'LONG' | 'SHORT' | 'WAIT'
  confidence:    number
  entryPrice:    number
  entryTime:     string
  vwap:          number
  ema200:        number | null
  vix:           number
  pdh:           number | null
  pdl:           number | null
  target1:       number   // +10pts
  target2:       number   // +25pts
  stopLevel:     number   // -8pts
  outcome:       'HIT_T1' | 'HIT_T2' | 'STOPPED_OUT' | 'EXPIRED'
  ptsToT1:       number   // actual pts moved in signal direction
  outcomeMinutes:number   // how long to outcome
  vwapPos:       'ABOVE' | 'BELOW'
  emaPos:        'ABOVE' | 'BELOW' | 'NO_DATA'
  dayOfWeek:     string
  gapPts:        number   // gap vs prior close
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcEMA(bars: Bar[], period: number): (number | null)[] {
  if (bars.length < period) return bars.map(() => null)
  const k = 2 / (period + 1)
  const result: (number | null)[] = bars.map(() => null)
  let ema = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period
  result[period - 1] = ema
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

function calcVWAP(bars: Bar[]): number | null {
  let tpv = 0, tv = 0
  bars.forEach(b => { const tp = (b.h + b.l + b.c) / 3; tpv += tp * (b.v || 1); tv += (b.v || 1) })
  const v = tv > 0 ? tpv / tv : 0
  return v > 5000 && v < 15000 ? v : null
}

function getETHour(ts: number): number {
  return parseInt(new Date(ts).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }))
}
function getETMin(ts: number): number {
  return new Date(ts).getMinutes()
}
function getETDateStr(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function getDayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

async function fetchBars(ticker: string, from: string, to: string, multiplier: number, timespan: string, apiKey: string): Promise<Bar[]> {
  let allBars: Bar[] = []
  let nextUrl: string | null = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`
  let pages = 0

  while (nextUrl && pages < 10) {
    const res: Response = await fetch(nextUrl, { signal: AbortSignal.timeout(15000) })
    const data: any = await res.json()
    if (data.results?.length) {
      allBars = allBars.concat(data.results.map((r: any) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0 })))
    }
    if (data.next_url) {
      nextUrl = data.next_url + `&apiKey=${apiKey}`
    } else {
      break
    }
    pages++
  }
  return allBars
}

// ── Core backtest logic for one day ──────────────────────────────────────────

function backtestDay(
  dateStr: string,
  dayBars: Bar[],
  allDayBars: Bar[],    // for 200 EMA (needs prior bars)
  vixBars: Bar[],
  pdh: number | null,
  pdl: number | null,
  priorClose: number | null,
): DayResult | null {

  // Only RTH bars (9:30 AM ET onwards)
  const rthBars = dayBars.filter(b => {
    const h = getETHour(b.t), m = getETMin(b.t)
    return h > 9 || (h === 9 && m >= 30)
  })
  if (rthBars.length < 10) return null  // not enough data

  // VWAP from RTH bars
  const vwap = calcVWAP(rthBars)
  if (!vwap) return null

  // 200 EMA — use all bars up to and including this day
  const emas = calcEMA(allDayBars, 200)
  const ema200 = emas[emas.length - 1]

  // VIX at ~10:15 AM (signal time)
  const vixAtSignal = vixBars.find(b => {
    const h = getETHour(b.t), m = getETMin(b.t)
    return h === 10 && m >= 15
  })?.c || vixBars.find(b => getETHour(b.t) >= 10)?.c || 18

  // Signal entry: first bar after 10:00 AM ET
  const entryBarIdx = rthBars.findIndex(b => {
    const h = getETHour(b.t)
    return h >= 10
  })
  if (entryBarIdx < 0) return null

  const entryBar  = rthBars[entryBarIdx]
  const entryPrice = entryBar.c
  const entryTime  = new Date(entryBar.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })

  const vwapPos = entryPrice > vwap ? 'ABOVE' : 'BELOW'
  const emaPos  = ema200 ? (entryPrice > ema200 ? 'ABOVE' : 'BELOW') : 'NO_DATA'

  // Signal logic: mirrors live system
  // LONG if: price ABOVE VWAP and ABOVE/AT EMA200 (or EMA not yet available)
  // SHORT if: price BELOW VWAP and BELOW EMA200
  // WAIT if: mixed signals

  const bothBullish = vwapPos === 'ABOVE' && (emaPos === 'ABOVE' || emaPos === 'NO_DATA')
  const bothBearish = vwapPos === 'BELOW' && (emaPos === 'BELOW' || emaPos === 'NO_DATA')

  // VIX extreme = reduce confidence
  const vixPenalty = vixAtSignal > 30 ? 20 : vixAtSignal > 22 ? 10 : 0

  // Gap alignment
  const gapPts = priorClose ? entryPrice - priorClose : 0
  const gapBoost = bothBullish && gapPts > 0 ? 10 : bothBearish && gapPts < 0 ? 10 : gapPts !== 0 ? -5 : 0

  // PDH/PDL proximity boost
  const pdhBoost = pdh && Math.abs(entryPrice - pdh) < 5 ? 8 : 0
  const pdlBoost = pdl && Math.abs(entryPrice - pdl) < 5 ? 8 : 0

  let signal: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT'
  let confidence = 45

  if (bothBullish) {
    signal = 'LONG'
    confidence = Math.max(25, Math.min(90, 60 + gapBoost + pdhBoost - vixPenalty))
  } else if (bothBearish) {
    signal = 'SHORT'
    confidence = Math.max(25, Math.min(90, 60 + gapBoost + pdlBoost - vixPenalty))
  } else {
    // Mixed signals = WAIT with lower confidence
    confidence = Math.max(15, 35 - vixPenalty)
  }

  if (signal === 'WAIT') {
    // Still log WAIT days for analytics
    return {
      date: dateStr, signal, confidence,
      entryPrice, entryTime, vwap,
      ema200: ema200 || null,
      vix: vixAtSignal, pdh, pdl,
      target1: entryPrice + 10,
      target2: entryPrice + 25,
      stopLevel: entryPrice - 8,
      outcome: 'EXPIRED', ptsToT1: 0, outcomeMinutes: 0,
      vwapPos, emaPos, dayOfWeek: getDayOfWeek(dateStr),
      gapPts: parseFloat(gapPts.toFixed(2)),
    }
  }

  // Score outcome: look at next 90 minutes of bars
  const target1  = signal === 'LONG' ? entryPrice + 10 : entryPrice - 10
  const target2  = signal === 'LONG' ? entryPrice + 25 : entryPrice - 25
  const stopLevel = signal === 'LONG' ? entryPrice - 8  : entryPrice + 8

  const futureBars = rthBars.slice(entryBarIdx + 1).filter(b =>
    b.t - entryBar.t <= 90 * 60 * 1000  // 90 min window
  )

  let outcome: 'HIT_T1' | 'HIT_T2' | 'STOPPED_OUT' | 'EXPIRED' = 'EXPIRED'
  let ptsToT1 = 0
  let outcomeMinutes = 90

  for (const bar of futureBars) {
    const mins = (bar.t - entryBar.t) / 60000
    const hitT2   = signal === 'LONG' ? bar.h >= target2   : bar.l <= target2
    const hitT1   = signal === 'LONG' ? bar.h >= target1   : bar.l <= target1
    const stopped = signal === 'LONG' ? bar.l <= stopLevel : bar.h >= stopLevel

    // Check stop first (within same bar, stop takes priority if hit before target)
    if (stopped && !hitT1) {
      outcome = 'STOPPED_OUT'
      ptsToT1 = signal === 'LONG' ? bar.l - entryPrice : entryPrice - bar.h
      outcomeMinutes = parseFloat(mins.toFixed(1))
      break
    }
    if (hitT2) {
      outcome = 'HIT_T2'
      ptsToT1 = signal === 'LONG' ? target2 - entryPrice : entryPrice - target2
      outcomeMinutes = parseFloat(mins.toFixed(1))
      break
    }
    if (hitT1) {
      outcome = 'HIT_T1'
      ptsToT1 = signal === 'LONG' ? target1 - entryPrice : entryPrice - target1
      outcomeMinutes = parseFloat(mins.toFixed(1))
      break
    }
  }

  // Max favorable move if expired
  if (outcome === 'EXPIRED' && futureBars.length > 0) {
    const maxMove = signal === 'LONG'
      ? Math.max(...futureBars.map(b => b.h)) - entryPrice
      : entryPrice - Math.min(...futureBars.map(b => b.l))
    ptsToT1 = parseFloat(maxMove.toFixed(2))
  }

  return {
    date: dateStr, signal, confidence,
    entryPrice, entryTime, vwap,
    ema200: ema200 || null,
    vix: vixAtSignal, pdh, pdl,
    target1, target2, stopLevel,
    outcome, ptsToT1: parseFloat(ptsToT1.toFixed(2)), outcomeMinutes,
    vwapPos, emaPos, dayOfWeek: getDayOfWeek(dateStr),
    gapPts: parseFloat(gapPts.toFixed(2)),
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const origin = req.headers.get('origin') || req.headers.get('referer') || ''
  const isFromApp = origin.includes('traidezone.ai') || origin.includes('localhost')
  if (!isCronSecret && !isFromApp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No Polygon key' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(parseInt(searchParams.get('days') || '90'), 400)  // Polygon goes back 2+ years

  const toDate   = new Date()
  toDate.setHours(0, 0, 0, 0)
  const fromDate = new Date(toDate)
  fromDate.setDate(fromDate.getDate() - days - 10)  // extra buffer for weekends

  const from = fromDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const to   = toDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  console.log(`[backtest] Fetching ${days} days: ${from} → ${to}`)

  try {
    // ── Fetch all data in 3 API calls ─────────────────────────────────────────
    const [spx5m, vix5m, spxDaily] = await Promise.all([
      fetchBars('I:SPX', from, to, 5,  'minute', apiKey),
      fetchBars('I:VIX', from, to, 5,  'minute', apiKey),
      fetchBars('I:SPX', from, to, 1,  'day',    apiKey),
    ])

    if (!spx5m.length) {
      return NextResponse.json({ error: 'No SPX data returned', from, to }, { status: 502 })
    }

    // ── Group 5m bars by trading day ──────────────────────────────────────────
    const spxByDay: Record<string, Bar[]> = {}
    const vixByDay: Record<string, Bar[]> = {}

    spx5m.forEach(b => {
      const d = getETDateStr(b.t)
      if (!spxByDay[d]) spxByDay[d] = []
      spxByDay[d].push(b)
    })
    vix5m.forEach(b => {
      const d = getETDateStr(b.t)
      if (!vixByDay[d]) vixByDay[d] = []
      vixByDay[d].push(b)
    })

    // ── Map daily bars for PDH/PDL/prevClose ─────────────────────────────────
    const dailyByDate: Record<string, Bar> = {}
    spxDaily.forEach(b => { dailyByDate[getETDateStr(b.t)] = b })

    const tradingDays = Object.keys(spxByDay).sort().slice(-days)

    // ── Run backtest for each day ─────────────────────────────────────────────
    const results: DayResult[] = []
    const allSpxBarsUpTo: Bar[] = []  // rolling window for 200 EMA

    for (const dateStr of tradingDays) {
      const dayBars = spxByDay[dateStr] || []
      if (!dayBars.length) continue

      allSpxBarsUpTo.push(...dayBars)

      // Prior trading day for PDH/PDL
      const priorDayStr = tradingDays[tradingDays.indexOf(dateStr) - 1]
      const priorDaily  = priorDayStr ? dailyByDate[priorDayStr] : null

      const result = backtestDay(
        dateStr,
        dayBars,
        allSpxBarsUpTo,
        vixByDay[dateStr] || [],
        priorDaily?.h || null,
        priorDaily?.l || null,
        priorDaily?.c || null,
      )

      if (result) results.push(result)
    }

    // ── Compute summary stats ─────────────────────────────────────────────────
    const signaled  = results.filter(r => r.signal !== 'WAIT')
    const wins      = signaled.filter(r => r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2')
    const t2s       = signaled.filter(r => r.outcome === 'HIT_T2')
    const stops     = signaled.filter(r => r.outcome === 'STOPPED_OUT')
    const longs     = signaled.filter(r => r.signal === 'LONG')
    const shorts    = signaled.filter(r => r.signal === 'SHORT')
    const longWins  = longs.filter(r => r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2')
    const shortWins = shorts.filter(r => r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2')

    const avgWin  = wins.length  ? wins.reduce((s,r)  => s + Math.abs(r.ptsToT1), 0) / wins.length  : 0
    const avgLoss = stops.length ? stops.reduce((s,r) => s + Math.abs(r.ptsToT1), 0) / stops.length : 0
    const pf      = avgLoss > 0  ? avgWin / avgLoss : wins.length > 0 ? 99 : 0

    const avgWinMins = wins.length ? wins.reduce((s,r) => s + r.outcomeMinutes, 0) / wins.length : 0
    const avgLossMins = stops.length ? stops.reduce((s,r) => s + r.outcomeMinutes, 0) / stops.length : 0

    // By VIX regime
    const byVix: Record<string, {wins:number;total:number}> = {}
    signaled.forEach(r => {
      const b = r.vix < 14 ? 'Low<14' : r.vix < 20 ? 'Normal14-20' : r.vix < 28 ? 'Elevated20-28' : 'High>28'
      if (!byVix[b]) byVix[b] = { wins: 0, total: 0 }
      byVix[b].total++
      if (r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2') byVix[b].wins++
    })

    // By day of week
    const byDow: Record<string, {wins:number;total:number}> = {}
    signaled.forEach(r => {
      if (!byDow[r.dayOfWeek]) byDow[r.dayOfWeek] = { wins: 0, total: 0 }
      byDow[r.dayOfWeek].total++
      if (r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2') byDow[r.dayOfWeek].wins++
    })

    // By entry time bucket
    const byHour: Record<string, {wins:number;total:number}> = {}
    signaled.forEach(r => {
      const h = r.entryTime.split(':')[0] + ':00'
      if (!byHour[h]) byHour[h] = { wins: 0, total: 0 }
      byHour[h].total++
      if (r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2') byHour[h].wins++
    })

    const summary = {
      totalDays:    results.length,
      signalDays:   signaled.length,
      waitDays:     results.filter(r => r.signal === 'WAIT').length,
      winRate:      signaled.length ? Math.round(wins.length / signaled.length * 100) : 0,
      t2Rate:       signaled.length ? Math.round(t2s.length / signaled.length * 100) : 0,
      stopRate:     signaled.length ? Math.round(stops.length / signaled.length * 100) : 0,
      longWinRate:  longs.length  ? Math.round(longWins.length  / longs.length  * 100) : 0,
      shortWinRate: shorts.length ? Math.round(shortWins.length / shorts.length * 100) : 0,
      totalLongs:   longs.length,
      totalShorts:  shorts.length,
      avgPtsWon:    parseFloat(avgWin.toFixed(1)),
      avgPtsLost:   parseFloat(avgLoss.toFixed(1)),
      profitFactor: parseFloat(pf.toFixed(2)),
      avgWinMins:   parseFloat(avgWinMins.toFixed(0)),
      avgLossMins:  parseFloat(avgLossMins.toFixed(0)),
      byVix:        Object.fromEntries(Object.entries(byVix).map(([k,v]) => [k, { ...v, rate: v.total ? Math.round(v.wins/v.total*100) : 0 }])),
      byDow:        Object.fromEntries(Object.entries(byDow).map(([k,v]) => [k, { ...v, rate: v.total ? Math.round(v.wins/v.total*100) : 0 }])),
      byHour:       Object.fromEntries(Object.entries(byHour).map(([k,v]) => [k, { ...v, rate: v.total ? Math.round(v.wins/v.total*100) : 0 }])),
      dateRange:    { from: tradingDays[0], to: tradingDays[tradingDays.length-1] },
      dataNote:     'Options flow not available historically — defaults to NEUTRAL. VWAP/EMA/VIX/PDH/PDL are exact historical values.',
    }

    return NextResponse.json({ summary, results, generatedAt: new Date().toISOString() })

  } catch (e: any) {
    console.error('[backtest] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
