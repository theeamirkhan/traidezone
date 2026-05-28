/**
 * lib/buildHistoricalState.ts
 *
 * Reconstructs market state at a specific historical timestamp.
 *
 * CRITICAL: This function must guarantee NO LOOKAHEAD LEAKAGE.
 * Every bar, level, and computation uses ONLY data available at-or-before
 * the target timestamp. Predictions made on backfilled state are valid
 * iff this guarantee holds.
 *
 * Differences vs buildMarketState (live):
 *   - Takes a targetMs timestamp (point-in-time) instead of "now"
 *   - Takes pre-fetched bars (caller fetches full day, function slices)
 *   - Cannot access FlashAlpha GEX (current-state-only API) — sets to null
 *   - Cannot access Unusual Whales flow — sets to null
 *   - Everything else (VWAP, ORB, levels, mech flow, day type, actionability,
 *     microstructure approximations) replays cleanly from price/volume data
 */

import { calculateMechanicalFlow, type MechanicalFlow } from '../cockpit/lib/mechanicalFlow'
import { classifyActionability, type ActionabilityResult } from '../cockpit/lib/actionability'
import { forecastDayType, type DayTypeForecast } from '../cockpit/lib/dayTypeForecaster'
import { calculateVolumeProfile, type VolumeProfileResult } from '../cockpit/lib/volumeProfile'
import type { RawBar, MarketState } from './buildMarketState'

export interface HistoricalInput {
  targetMs:         number                    // the moment we're reconstructing
  allDayBars5m:     RawBar[]                  // full day's 5-min bars (function slices)
  allDayBars1m:     RawBar[]                  // full day's 1-min bars (for accurate cum delta)
  yesterdayBars5m:  RawBar[]                  // previous day's bars for VWAP context
  priorDay:         { pdh: number | null; pdl: number | null; prevClose: number | null }
  vix:              { price: number | null; change: number | null }
  // Historical GEX is usually unavailable — caller can supply null
  gex?:             { netGex: number | null; regime: 'positive' | 'negative' | null; gammaFlip: number | null; callWall: number | null; putWall: number | null } | null
}

// ─── ET timezone parts for a given timestamp ───
function getETPartsAt(ms: number) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const parts = fmt.formatToParts(new Date(ms)).reduce((acc: any, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  let hour = parseInt(parts.hour, 10)
  if (hour === 24) hour = 0  // en-US midnight quirk
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    weekday:  weekdayMap[parts.weekday] ?? 0,
    year:     parseInt(parts.year, 10),
    month:    parseInt(parts.month, 10),
    day:      parseInt(parts.day, 10),
    hour,
    minute:   parseInt(parts.minute, 10),
    timeStr:  `${String(hour).padStart(2, '0')}:${parts.minute}`,
  }
}

function getSessionWindow(mins: number): MarketState['sessionWindow'] {
  if (mins < 0)         return 'pre'
  if (mins < 60)        return 'open_drive'
  if (mins < 300)       return 'mid_session'
  if (mins < 330)       return 'pre_power'
  if (mins < 390)       return 'power_hour'
  return 'after'
}

function calcVWAP(bars: RawBar[]): number | null {
  if (!bars.length) return null
  let cumPV = 0
  let cumV = 0
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3
    cumPV += typical * b.v
    cumV += b.v
  }
  return cumV > 0 ? cumPV / cumV : null
}

function classify15mTrend(bars: RawBar[]): string | null {
  if (bars.length < 3) return null
  const last3 = bars.slice(-3)
  const opens = last3.map(b => b.o)
  const closes = last3.map(b => b.c)
  const totalMove = closes[closes.length - 1] - opens[0]
  const absMove = Math.abs(totalMove)
  const avgRange = last3.reduce((s, b) => s + (b.h - b.l), 0) / last3.length
  if (absMove > avgRange * 1.5) return totalMove > 0 ? 'BULLISH' : 'BEARISH'
  return 'RANGING'
}

function approximateCumDelta(bars: RawBar[]): { strength: string; trend: 'BUILDING' | 'FADING' | 'NEUTRAL' } {
  if (bars.length < 3) return { strength: 'NEUTRAL', trend: 'NEUTRAL' }
  let netDelta = 0
  for (const b of bars) {
    const range = b.h - b.l || 1
    const closePos = (b.c - b.l) / range
    netDelta += (closePos - 0.5) * 2 * b.v
  }
  const totalVol = bars.reduce((s, b) => s + b.v, 0)
  const ratio = totalVol > 0 ? netDelta / totalVol : 0
  let strength: string
  if (ratio > 0.5) strength = 'STRONG_BUY'
  else if (ratio > 0.15) strength = 'BUY'
  else if (ratio < -0.5) strength = 'STRONG_SELL'
  else if (ratio < -0.15) strength = 'SELL'
  else strength = 'NEUTRAL'

  const recent = bars.slice(-3)
  const recentDelta = recent.reduce((s, b) => {
    const range = b.h - b.l || 1
    return s + ((b.c - b.l) / range - 0.5) * 2 * b.v
  }, 0)
  const recentVol = recent.reduce((s, b) => s + b.v, 0)
  const recentRatio = recentVol > 0 ? recentDelta / recentVol : 0
  let trend: 'BUILDING' | 'FADING' | 'NEUTRAL' = 'NEUTRAL'
  if (Math.abs(recentRatio) > Math.abs(ratio) && Math.sign(recentRatio) === Math.sign(ratio)) {
    trend = 'BUILDING'
  } else if (Math.abs(recentRatio) < Math.abs(ratio) * 0.7) {
    trend = 'FADING'
  }
  return { strength, trend }
}

/**
 * Build historical market state at targetMs with NO lookahead.
 * Returns null if reconstruction not viable (no bars at/before target).
 */
export function buildHistoricalState(input: HistoricalInput): MarketState | null {
  const { targetMs, allDayBars5m, allDayBars1m, yesterdayBars5m, priorDay, vix, gex } = input

  // ⚠️ CRITICAL: slice all bars to be ≤ targetMs (use bar OPEN time t)
  //    A 5-min bar that OPENS at 10:30 represents 10:30-10:35 data.
  //    At the 10:30 prediction moment, the trader has the 10:25 bar
  //    (which opened at 10:25 and closed at 10:30) fully formed but
  //    NOT YET the 10:30 bar.
  //    So we include bars whose CLOSE time ≤ targetMs.
  //    A 5-min bar at t=10:25 closes at 10:30. closeTime = t + 5*60*1000.
  const bars5mSlice = allDayBars5m.filter(b => b.t + 5 * 60 * 1000 <= targetMs)
  const bars1mSlice = allDayBars1m.filter(b => b.t + 60 * 1000 <= targetMs)

  if (bars5mSlice.length === 0 && bars1mSlice.length === 0) {
    return null  // pre-open — no usable bars yet
  }

  // Current SPX = last close from sliced bars (prefer 1m for precision, fall back to 5m)
  const currentSPX = bars1mSlice.length > 0
    ? bars1mSlice[bars1mSlice.length - 1].c
    : bars5mSlice.length > 0
      ? bars5mSlice[bars5mSlice.length - 1].c
      : 0

  if (!currentSPX) return null

  const et = getETPartsAt(targetMs)
  const sessionMinutes = (et.hour - 9) * 60 + (et.minute - 30)
  const sessionWindow = getSessionWindow(sessionMinutes)

  // Today's bars = bars in the trading session window for this day
  // We've already sliced to ≤ target, so filter to session hours only
  const todayBars = bars5mSlice.filter(b => {
    const bET = getETPartsAt(b.t)
    const mins = bET.hour * 60 + bET.minute
    return mins >= 9 * 60 + 30 && mins <= 16 * 60
  })

  // Today's 1-min bars for cum delta accuracy
  const todayBars1m = bars1mSlice.filter(b => {
    const bET = getETPartsAt(b.t)
    const mins = bET.hour * 60 + bET.minute
    return mins >= 9 * 60 + 30 && mins <= 16 * 60
  })

  // Levels (computed from sliced bars only)
  const intradayHigh = todayBars.length > 0 ? Math.max(...todayBars.map(b => b.h)) : null
  const intradayLow = todayBars.length > 0 ? Math.min(...todayBars.map(b => b.l)) : null
  const vwap = calcVWAP(todayBars)

  // ORB = first 15 min after open (9:30-9:45)
  // Only meaningful if we're past 9:45
  const orCandles = todayBars.filter(b => {
    const bET = getETPartsAt(b.t)
    const mins = bET.hour * 60 + bET.minute
    return mins >= 9 * 60 + 30 && mins < 9 * 60 + 45
  })
  const orbHigh = orCandles.length > 0 ? Math.max(...orCandles.map(b => b.h)) : null
  const orbLow = orCandles.length > 0 ? Math.min(...orCandles.map(b => b.l)) : null

  // Volume profile — use all sliced bars (including yesterday's tail for context)
  let volumeProfile: VolumeProfileResult | null = null
  try {
    const profileInput = [...yesterdayBars5m, ...bars5mSlice]
    if (profileInput.length >= 3) {
      volumeProfile = calculateVolumeProfile(profileInput)
    }
  } catch {}

  // Microstructure from 1-min bars (more accurate than 5-min)
  const { strength: cumDelta, trend: cumDeltaTrend } = approximateCumDelta(todayBars1m.length > 0 ? todayBars1m : todayBars)
  const m15Trend = classify15mTrend(todayBars)

  // Mechanical flow (uses GEX if available, otherwise nulls — function handles gracefully)
  let mechanicalFlow: MechanicalFlow | null = null
  try {
    mechanicalFlow = calculateMechanicalFlow({
      netGex:           gex?.netGex || null,
      regime:           gex?.regime || null,
      gammaFlip:        gex?.gammaFlip || null,
      callWall:         gex?.callWall || null,
      putWall:          gex?.putWall || null,
      charmDollar:      null,
      charmNote:        null,
      charmUrgency:     null,
      dexBias:          null,
      currentPrice:     currentSPX,
      sessionMinsLeft:  Math.max(0, 390 - sessionMinutes),
      optionsFlowBias:  null,
      marketTideBias:   null,
      putCallRatio:     null,
    })
  } catch {}

  // Day type forecast
  let dayTypeForecast: DayTypeForecast | null = null
  try {
    if (sessionMinutes >= 15 && orbHigh !== null && orbLow !== null) {
      const isOpex = (et.weekday === 5 && et.day >= 15 && et.day <= 21)
      const gapPoints = (priorDay.prevClose && todayBars[0]) ? todayBars[0].o - priorDay.prevClose : null
      const yesterdayRange = (priorDay.pdh && priorDay.pdl) ? priorDay.pdh - priorDay.pdl : null
      const esOvernightTrend = gapPoints !== null
        ? (gapPoints > 3 ? 'BULLISH' : gapPoints < -3 ? 'BEARISH' : 'CHOPPY') as 'BULLISH' | 'BEARISH' | 'CHOPPY'
        : null

      dayTypeForecast = forecastDayType({
        netGex:             gex?.netGex || null,
        gexRegime:          gex?.regime || null,
        tickValue:          null,
        tickHigh15m:        null,
        tickLow15m:         null,
        cumDelta,
        cumDeltaTrend,
        vixPrice:           vix.price,
        vixChange:          vix.change,
        vix1d:              null,
        vix30:              null,
        orbHigh, orbLow,
        orbWindowMins:      15,
        m15Trend,
        m15RangePct:        null,
        crossAssetBias:     null,
        currentPrice:       currentSPX,
        pdh: priorDay.pdh, pdl: priorDay.pdl,
        esOvernightTrend,
        gapPoints,
        isOpex,
        isFomcDay:          false,
        dayOfWeek:          et.weekday,
        minutesSinceOpen:   sessionMinutes,
        yesterdayRange,
      })
    }
  } catch {}

  // Actionability
  let actionability: ActionabilityResult | null = null
  let candidateSignal: 'LONG' | 'SHORT' | 'WAIT' | null = null
  try {
    if (mechanicalFlow) {
      candidateSignal =
        mechanicalFlow.mechanicalBias === 'BULLISH' ? 'LONG' :
        mechanicalFlow.mechanicalBias === 'BEARISH' ? 'SHORT' :
        'WAIT'

      const currentVolume = todayBars.length > 0 ? todayBars[todayBars.length - 1].v : null
      const avgVolume = todayBars.length >= 20
        ? todayBars.slice(-20).reduce((s, b) => s + b.v, 0) / 20
        : null

      actionability = classifyActionability({
        signal:           candidateSignal,
        confidence:       60,
        signalAge:        0,
        qualityVerdict:   null,
        mechanicalScore:  mechanicalFlow.mechanicalScore,
        asymmetricSetup:  mechanicalFlow.asymmetricSetup,
        currentPrice:     currentSPX,
        vwap,
        ema200:           null,
        poc:              volumeProfile?.poc || null,
        callWall:         gex?.callWall || null,
        putWall:          gex?.putWall || null,
        gammaFlip:        gex?.gammaFlip || null,
        currentVolume,
        avgVolume,
      } as any)
    }
  } catch {}

  return {
    currentSPX,
    timestamp:       new Date(targetMs).toISOString(),
    timeET:          et.timeStr,
    sessionMinutes,
    sessionWindow,
    dayOfWeek:       et.weekday,
    bars5m:          bars5mSlice,
    todayBars,
    pdh:             priorDay.pdh,
    pdl:             priorDay.pdl,
    prevClose:       priorDay.prevClose,
    orbHigh, orbLow,
    intradayHigh, intradayLow,
    vwap,
    volumeProfile,
    vix:             vix.price,
    vixChange:       vix.change,
    vix1d:           null,
    vix30:           null,
    netGex:          gex?.netGex || null,
    gexRegime:       gex?.regime || null,
    gammaFlip:       gex?.gammaFlip || null,
    callWall:        gex?.callWall || null,
    putWall:         gex?.putWall || null,
    charmDollar:     null,
    charmUrgency:    null,
    dexBias:         null,
    putCallRatio:    null,
    cumDelta,
    cumDeltaTrend,
    m15Trend,
    mechanicalFlow,
    dayTypeForecast,
    actionability,
    candidateSignal,
    errors:          [],
  }
}
