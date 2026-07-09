/**
 * lib/buildMarketState.ts
 *
 * Builds a complete market state snapshot from raw API data.
 * Used by the shadow prediction agent to compute the same components
 * the cockpit shows to the trader — mechanical flow, day type forecast,
 * actionability, setup evaluation — all from server-side cron.
 *
 * This is the bridge between raw data sources (Polygon, FlashAlpha,
 * Unusual Whales) and the pure computation libs.
 */

import { calculateMechanicalFlow, type MechanicalFlow } from '../cockpit/lib/mechanicalFlow'
import { classifyActionability, type ActionabilityResult } from '../cockpit/lib/actionability'
import { forecastDayType, type DayTypeForecast } from '../cockpit/lib/dayTypeForecaster'
import { calculateVolumeProfile, type VolumeProfileResult } from '../cockpit/lib/volumeProfile'

export interface RawBar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface MarketState {
  // ── Basic ──
  currentSPX:        number
  timestamp:         string  // ISO
  timeET:            string  // "HH:MM" in ET
  sessionMinutes:    number  // minutes since 9:30am ET (negative if pre-market)
  sessionWindow:     'pre' | 'open_drive' | 'mid_session' | 'pre_power' | 'power_hour' | 'after'
  dayOfWeek:         number

  // ── Bars ──
  bars5m:            RawBar[]  // today's 5-min bars (and yesterday's tail for VWAP)
  todayBars:         RawBar[]  // just today's session bars

  // ── Levels ──
  pdh:               number | null
  pdl:               number | null
  prevClose:         number | null
  orbHigh:           number | null
  orbLow:            number | null
  intradayHigh:      number | null
  intradayLow:       number | null
  vwap:              number | null

  // ── Volume Profile ──
  volumeProfile:     VolumeProfileResult | null

  // ── Macro ──
  vix:               number | null
  vixChange:         number | null
  vix1d:             number | null
  vix30:             number | null

  // ── Gamma / Options ──
  netGex:            number | null
  gexRegime:         'positive' | 'negative' | null
  gammaFlip:         number | null
  callWall:          number | null
  putWall:           number | null
  charmDollar:       number | null
  charmUrgency:      'HIGH' | 'MODERATE' | 'LOW' | null
  dexBias:           'LONG' | 'SHORT' | 'NEUTRAL' | null
  putCallRatio:      number | null

  // ── Microstructure (lightweight server-side approximation) ──
  cumDelta:          string | null  // STRONG_BUY/BUY/NEUTRAL/SELL/STRONG_SELL
  cumDeltaTrend:     'BUILDING' | 'FADING' | 'NEUTRAL' | null

  // ── Multi-TF ──
  m15Trend:          string | null  // BULLISH/BEARISH/RANGING

  // ── Computed components ──
  mechanicalFlow:    MechanicalFlow | null
  dayTypeForecast:   DayTypeForecast | null
  actionability:     ActionabilityResult | null
  candidateSignal:   'LONG' | 'SHORT' | 'WAIT' | null  // direction the mech bias suggests

  // ── Diagnostic ──
  errors:            string[]
}

// ═════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════

function getETParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const parts = fmt.formatToParts(d).reduce((acc: any, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    weekday:  weekdayMap[parts.weekday] ?? 0,
    year:     parseInt(parts.year, 10),
    month:    parseInt(parts.month, 10),
    day:      parseInt(parts.day, 10),
    hour:     parseInt(parts.hour, 10),
    minute:   parseInt(parts.minute, 10),
    dateStr:  `${parts.year}-${parts.month}-${parts.day}`,
    timeStr:  `${parts.hour}:${parts.minute}`,
  }
}

function getSessionWindow(mins: number): MarketState['sessionWindow'] {
  if (mins < 0)         return 'pre'
  if (mins < 60)        return 'open_drive'    // 9:30-10:30
  if (mins < 300)       return 'mid_session'   // 10:30-14:30
  if (mins < 330)       return 'pre_power'     // 14:30-15:00
  if (mins < 390)       return 'power_hour'    // 15:00-16:00
  return 'after'
}

// VWAP (volume-weighted average price) from today's bars
function calcVWAP(bars: RawBar[]): number | null {
  if (!bars.length) return 0
  let cumPV = 0
  let cumV = 0
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3
    cumPV += typical * b.v
    cumV += b.v
  }
  return cumV > 0 ? cumPV / cumV : null
}

// 15-min trend classification
function classify15mTrend(bars: RawBar[]): string | null {
  if (bars.length < 3) return null
  const last3 = bars.slice(-3)  // last 15min if bars are 5min
  const opens = last3.map(b => b.o)
  const closes = last3.map(b => b.c)
  const totalMove = closes[closes.length - 1] - opens[0]
  const absMove = Math.abs(totalMove)
  const avgRange = last3.reduce((s, b) => s + (b.h - b.l), 0) / last3.length

  if (absMove > avgRange * 1.5) return totalMove > 0 ? 'BULLISH' : 'BEARISH'
  return 'RANGING'
}

// Crude cum delta approximation from candle shapes
function approximateCumDelta(bars: RawBar[]): { strength: string; trend: 'BUILDING' | 'FADING' | 'NEUTRAL' } {
  if (bars.length < 3) return { strength: 'NEUTRAL', trend: 'NEUTRAL' }

  // For each bar, estimate buy/sell pressure by close position within range
  let netDelta = 0
  for (const b of bars) {
    const range = b.h - b.l || 1
    const closePos = (b.c - b.l) / range  // 0 = at low, 1 = at high
    const barDelta = (closePos - 0.5) * 2 * b.v  // -1 to +1 × volume
    netDelta += barDelta
  }

  const totalVol = bars.reduce((s, b) => s + b.v, 0)
  const ratio = totalVol > 0 ? netDelta / totalVol : 0

  let strength: string
  if (ratio > 0.5) strength = 'STRONG_BUY'
  else if (ratio > 0.15) strength = 'BUY'
  else if (ratio < -0.5) strength = 'STRONG_SELL'
  else if (ratio < -0.15) strength = 'SELL'
  else strength = 'NEUTRAL'

  // Trend: are last 3 bars accelerating in same direction?
  const recent = bars.slice(-3)
  const recentDelta = recent.reduce((s, b) => {
    const range = b.h - b.l || 1
    return s + ((b.c - b.l) / range - 0.5) * 2 * b.v
  }, 0)
  const recentRatio = recent.reduce((s, b) => s + b.v, 0) > 0 ? recentDelta / recent.reduce((s, b) => s + b.v, 0) : 0

  let trend: 'BUILDING' | 'FADING' | 'NEUTRAL' = 'NEUTRAL'
  if (Math.abs(recentRatio) > Math.abs(ratio) && Math.sign(recentRatio) === Math.sign(ratio)) {
    trend = 'BUILDING'
  } else if (Math.abs(recentRatio) < Math.abs(ratio) * 0.7) {
    trend = 'FADING'
  }

  return { strength, trend }
}

// ═════════════════════════════════════════════════════════════════════════
// Fetchers (server-side, using existing API keys)
// ═════════════════════════════════════════════════════════════════════════

async function fetchSPXBars(polygonKey: string): Promise<RawBar[]> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${yesterday}/${today}?adjusted=true&sort=asc&limit=200&apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data: any = await res.json()
    return (data?.results || []).map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }))
  } catch (e) {
    return []
  }
}

async function fetchCurrentSPX(polygonKey: string): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v2/last/trade/I:SPX?apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.results?.p || null
  } catch { return null }
}

async function fetchVIX(polygonKey: string): Promise<{ price: number | null; change: number | null }> {
  try {
    const url = `https://api.polygon.io/v2/last/trade/I:VIX?apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { price: null, change: null }
    const data: any = await res.json()
    const price = data?.results?.p || null

    // Get prev close
    const prevUrl = `https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=${polygonKey}`
    const prevRes = await fetch(prevUrl, { signal: AbortSignal.timeout(5000) })
    if (!prevRes.ok) return { price, change: null }
    const prevData: any = await prevRes.json()
    const prevClose = prevData?.results?.[0]?.c
    const change = (price && prevClose) ? ((price - prevClose) / prevClose) * 100 : null
    return { price, change }
  } catch { return { price: null, change: null } }
}

async function fetchPriorDay(polygonKey: string): Promise<{ pdh: number | null; pdl: number | null; prevClose: number | null }> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?adjusted=true&apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { pdh: null, pdl: null, prevClose: null }
    const data: any = await res.json()
    const r = data?.results?.[0]
    if (!r) return { pdh: null, pdl: null, prevClose: null }
    return { pdh: r.h, pdl: r.l, prevClose: r.c }
  } catch { return { pdh: null, pdl: null, prevClose: null } }
}

async function fetchGEX(): Promise<{ netGex: number | null; regime: 'positive' | 'negative' | null; gammaFlip: number | null; callWall: number | null; putWall: number | null }> {
  const empty = { netGex: null, regime: null as any, gammaFlip: null, callWall: null, putWall: null }
  try {
    // Call our own /api/gex route rather than FlashAlpha directly:
    //  1. It has the CORRECT integration (lab.flashalpha.com, X-Api-Key
    //     header, /v1/exposure/* paths, snake_case fields). The previous
    //     direct call here used a wrong domain (api.flashalpha.io) and
    //     wrong field names — it NEVER returned data, which is why every
    //     shadow prediction had gexRegime: null.
    //  2. It has a 15-min cache respecting FlashAlpha's 100 calls/day
    //     limit. Direct calls every 5min would burn the quota by noon.
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://traidezone.ai'
    const res = await fetch(`${base}/api/gex?symbol=SPX`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return empty
    const data: any = await res.json()
    const regime = data?.regime === 'positive' || data?.regime === 'negative' ? data.regime : null
    return {
      netGex:    data?.netGex ?? null,
      regime,
      gammaFlip: data?.gammaFlip ?? null,
      callWall:  data?.callWall ?? null,
      putWall:   data?.putWall ?? null,
    }
  } catch { return empty }
}

// ═════════════════════════════════════════════════════════════════════════
// Main: buildMarketState
// ═════════════════════════════════════════════════════════════════════════

export async function buildMarketState(): Promise<MarketState> {
  const errors: string[] = []
  const polygonKey = process.env.POLYGON_API_KEY || ''

  if (!polygonKey) {
    errors.push('POLYGON_API_KEY not set')
  }

  // Parallel-fetch raw data
  const [currentSPX, bars, vix, priorDay, gex] = await Promise.all([
    fetchCurrentSPX(polygonKey),
    fetchSPXBars(polygonKey),
    fetchVIX(polygonKey),
    fetchPriorDay(polygonKey),
    fetchGEX(),
  ])

  // currentSPX from last-trade endpoint OFTEN fails for index tickers
  // (I:SPX is a calculated index, not a traded instrument — /v2/last/trade
  // returns nothing). Fall back to the most recent 5-min bar's close, which
  // the aggregates endpoint DOES provide for indices.
  let resolvedSPX = currentSPX
  if (!resolvedSPX && bars.length > 0) {
    resolvedSPX = bars[bars.length - 1].c
  }

  if (!resolvedSPX) errors.push('currentSPX unavailable')
  if (!bars.length) errors.push('5min bars unavailable')

  const et = getETParts(new Date())
  const sessionMinutes = (et.hour - 9) * 60 + (et.minute - 30)
  const sessionWindow = getSessionWindow(sessionMinutes)

  // Today's date in ET for filtering bars
  const etDateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const todayET = etDateFmt.format(new Date())

  // Filter today's bars (session-only: 9:30am-4pm ET)
  const todayBars = bars.filter(b => {
    try {
      const bDate = etDateFmt.format(new Date(b.t))
      if (bDate !== todayET) return false
      const bFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      })
      const parts = bFmt.format(new Date(b.t)).split(':')
      const h = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const mins = h * 60 + m
      return mins >= 9 * 60 + 30 && mins <= 16 * 60
    } catch { return false }
  })

  // Levels
  const intradayHigh = todayBars.length > 0 ? Math.max(...todayBars.map(b => b.h)) : null
  const intradayLow = todayBars.length > 0 ? Math.min(...todayBars.map(b => b.l)) : null
  const vwap = calcVWAP(todayBars)

  // ORB (first 15min after open)
  const orCandles = todayBars.filter(b => {
    const bFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    })
    const parts = bFmt.format(new Date(b.t)).split(':')
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    const mins = h * 60 + m
    return mins >= 9 * 60 + 30 && mins < 9 * 60 + 45
  })
  const orbHigh = orCandles.length > 0 ? Math.max(...orCandles.map(b => b.h)) : null
  const orbLow = orCandles.length > 0 ? Math.min(...orCandles.map(b => b.l)) : null

  // Volume profile
  let volumeProfile: VolumeProfileResult | null = null
  try {
    if (todayBars.length >= 3) {
      volumeProfile = calculateVolumeProfile(bars)  // pass all bars; lib filters internally
    }
  } catch (e: any) { errors.push(`VP: ${e.message}`) }

  // Microstructure approximations
  const { strength: cumDelta, trend: cumDeltaTrend } = approximateCumDelta(todayBars)

  // 15-min trend
  const m15Trend = classify15mTrend(todayBars)

  // Mechanical flow
  let mechanicalFlow: MechanicalFlow | null = null
  try {
    if (resolvedSPX) {
      mechanicalFlow = calculateMechanicalFlow({
        netGex:           gex.netGex,
        regime:           gex.regime,
        gammaFlip:        gex.gammaFlip,
        callWall:         gex.callWall,
        putWall:          gex.putWall,
        charmDollar:      null,  // not fetched server-side yet
        charmNote:        null,
        charmUrgency:     null,
        dexBias:          null,
        currentPrice:     resolvedSPX,
        sessionMinsLeft:  Math.max(0, 390 - sessionMinutes),
        optionsFlowBias:  null,
        marketTideBias:   null,
        putCallRatio:     null,
      })
    }
  } catch (e: any) { errors.push(`MechFlow: ${e.message}`) }

  // Day type forecast
  let dayTypeForecast: DayTypeForecast | null = null
  try {
    if (resolvedSPX && sessionMinutes >= 30 && orbHigh !== null && orbLow !== null) {
      const isOpex = (et.weekday === 5 && et.day >= 15 && et.day <= 21)
      const gapPoints = (priorDay.prevClose && todayBars[0]) ? todayBars[0].o - priorDay.prevClose : null
      const yesterdayRange = (priorDay.pdh && priorDay.pdl) ? priorDay.pdh - priorDay.pdl : null
      const esOvernightTrend = gapPoints !== null
        ? (gapPoints > 3 ? 'BULLISH' : gapPoints < -3 ? 'BEARISH' : 'CHOPPY') as 'BULLISH' | 'BEARISH' | 'CHOPPY'
        : null

      dayTypeForecast = forecastDayType({
        netGex:             gex.netGex,
        gexRegime:          gex.regime,
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
        currentPrice:       resolvedSPX,
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
  } catch (e: any) { errors.push(`DayType: ${e.message}`) }

  // Actionability (needs a hypothetical signal — we'll pre-evaluate as if a LONG were considered)
  let actionability: ActionabilityResult | null = null
  let candidateSignal: 'LONG' | 'SHORT' | 'WAIT' | null = null
  try {
    if (resolvedSPX && mechanicalFlow) {
      const currentVolume = todayBars.length > 0 ? todayBars[todayBars.length - 1].v : null
      const avgVolume = todayBars.length >= 20
        ? todayBars.slice(-20).reduce((s, b) => s + b.v, 0) / 20
        : null

      // Pick candidate direction from mechanical bias for actionability eval
      // (passing null signal returns NOISE/NO SETUP which is uninformative)
      candidateSignal =
        mechanicalFlow.mechanicalBias === 'BULLISH' ? 'LONG' :
        mechanicalFlow.mechanicalBias === 'BEARISH' ? 'SHORT' :
        'WAIT'

      actionability = classifyActionability({
        signal:           candidateSignal,
        confidence:       60,  // synthetic mid-conviction for state assessment
        signalAge:        0,
        qualityVerdict:   null,
        mechanicalScore:  mechanicalFlow.mechanicalScore,
        asymmetricSetup:  mechanicalFlow.asymmetricSetup,
        currentPrice:     resolvedSPX,
        vwap,
        ema200:           null,
        poc:              volumeProfile?.poc || null,
        callWall:         gex.callWall,
        putWall:          gex.putWall,
        gammaFlip:        gex.gammaFlip,
        currentVolume,
        avgVolume,
        upcomingEvents:   [],  // shadow agent has no calendar feed; news-blackout check skipped
      } as any)
    }
  } catch (e: any) { errors.push(`Actionability: ${e.message}`) }

  return {
    currentSPX:      resolvedSPX || 0,
    timestamp:       new Date().toISOString(),
    timeET:          et.timeStr,
    sessionMinutes,
    sessionWindow,
    dayOfWeek:       et.weekday,
    bars5m:          bars,
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
    netGex:          gex.netGex,
    gexRegime:       gex.regime,
    gammaFlip:       gex.gammaFlip,
    callWall:        gex.callWall,
    putWall:         gex.putWall,
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
    errors,
  }
}
