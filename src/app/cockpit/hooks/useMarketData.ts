/**
 * useMarketData — single source of truth for all market prices
 *
 * Responsibilities:
 *  - Fetch today-only I:SPX, I:VIX, SPY bars from Polygon
 *  - Calculate VWAP directly from I:SPX RTH bars (no SPY conversion)
 *  - Calculate 200 EMA from I:SPX bars
 *  - Fetch PDH/PDL/prevClose from yesterday's daily bar
 *  - Expose a manual VWAP override
 *  - Refresh every 60 seconds during market hours
 *  - Single setCurrentPrice — no competing writes
 *
 * NOT responsible for:
 *  - Options flow, market tide, news, calendar (separate hooks)
 *  - Chart candles for Deep Dive (fetchHistory handles those)
 *  - AI calls of any kind
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
export interface Bar {
  t: number   // timestamp ms
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface MarketLevels {
  spyVwap:      number | null   // VWAP (from I:SPX direct, or manual override)
  ema200:       number | null   // 200 EMA from I:SPX bars
  pdh:          number | null   // prior day high
  pdl:          number | null   // prior day low
  prevClose:    number | null   // yesterday's close
  dayOpen:      number | null   // today's open (first bar)
  impliedHigh:  number | null   // currentPrice + impliedMove
  impliedLow:   number | null   // currentPrice - impliedMove
}

export interface MarketData {
  // Prices
  currentPrice:  number | null
  spyPrice:      number | null
  vixPrice:      number | null
  openPrice:     number | null

  // Levels
  levels: MarketLevels

  // Candles (today only — for signal/VWAP calculations)
  candles:    Bar[]
  spyCandles: Bar[]
  vixCandles: Bar[]

  // Daily % changes
  changes: { spx: number | null; spy: number | null; vix: number | null }

  // Status
  connected: boolean
  lastUpdated: Date | null
  dataAge: number | null  // minutes since last bar

  // Manual VWAP override
  manualVwap:     number | null
  setManualVwap:  (v: number | null) => void

  // Force refresh
  refresh: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcEMA(bars: Bar[], period: number): number[] {
  if (bars.length < period) return []
  const k = 2 / (period + 1)
  const closes = bars.map(b => b.c)
  const emas: number[] = []
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  emas.push(ema)
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
    emas.push(ema)
  }
  return emas
}

function calcVWAP(bars: Bar[]): number | null {
  // Only use RTH bars (9:30 AM ET onwards, today only)
  const todayET = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })
  const rth = bars.filter(b => {
    const d = new Date(b.t)
    const barDay = d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    const barHour = parseInt(d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    const barMin = d.getMinutes()
    return barDay === todayET && (barHour > 9 || (barHour === 9 && barMin >= 30))
  })
  if (!rth.length) return null
  let tpv = 0, tv = 0
  rth.forEach(b => { const tp = (b.h + b.l + b.c) / 3; tpv += tp * (b.v || 1); tv += (b.v || 1) })
  const vwap = tv > 0 ? tpv / tv : 0
  return vwap > 5000 && vwap < 15000 ? vwap : null
}

function getTodayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function getPrevTradingDay() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

async function polyFetch(path: string): Promise<any> {
  const url = `/api/polygon?apiKey=server&path=${encodeURIComponent(path)}`
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`Polygon ${r.status}`)
  return r.json()
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useMarketData(impliedMove?: number): MarketData {
  const [currentPrice, setCurrentPrice]   = useState<number | null>(null)
  const [spyPrice,    setSpyPrice]         = useState<number | null>(null)
  const [vixPrice,    setVixPrice]         = useState<number | null>(null)
  const [openPrice,   setOpenPrice]        = useState<number | null>(null)
  const [candles,     setCandles]          = useState<Bar[]>([])
  const [spyCandles,  setSpyCandles]       = useState<Bar[]>([])
  const [vixCandles,  setVixCandles]       = useState<Bar[]>([])
  const [levels,      setLevels]           = useState<MarketLevels>({
    spyVwap: null, ema200: null, pdh: null, pdl: null,
    prevClose: null, dayOpen: null, impliedHigh: null, impliedLow: null
  })
  const [changes,     setChanges]          = useState<{ spx: number|null; spy: number|null; vix: number|null }>({ spx: null, spy: null, vix: null })
  const [connected,   setConnected]        = useState(false)
  const [lastUpdated, setLastUpdated]      = useState<Date | null>(null)
  const [manualVwap,  setManualVwap]       = useState<number | null>(null)

  const manualVwapRef = useRef<number | null>(null)

  const setManualVwapBoth = useCallback((v: number | null) => {
    manualVwapRef.current = v
    setManualVwap(v)
    if (v !== null) {
      setLevels(p => ({ ...p, spyVwap: v }))
    }
  }, [])

  // ── Core fetch ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const today   = getTodayStr()
    const yday    = getPrevTradingDay()

    try {
      // ── 1. I:SPX today bars (real-time with Indices Advanced) ────────────
      const spxRes = await polyFetch(
        `/v2/aggs/ticker/I:SPX/range/5/minute/${today}/${today}?adjusted=true&sort=asc&limit=500`
      ).catch(() => null)

      const spxBars: Bar[] = spxRes?.results?.map((r: any) => ({
        t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v
      })) || []

      if (spxBars.length > 0) {
        const last = spxBars[spxBars.length - 1]
        const first = spxBars[0]

        setCandles(spxBars)
        setCurrentPrice(last.c)

        // VWAP — direct from I:SPX, never from SPY conversion
        const vwap = manualVwapRef.current ?? calcVWAP(spxBars)
        if (vwap) setLevels(p => ({ ...p, spyVwap: vwap }))

        // 200 EMA
        const emas = calcEMA(spxBars, 200)
        if (emas.length) setLevels(p => ({ ...p, ema200: emas[emas.length - 1] }))

        // Day open
        setLevels(p => ({ ...p, dayOpen: first.o }))
        setOpenPrice(first.o)
      }

      // ── 2. Yesterday's SPX daily bar (PDH/PDL/prevClose) ────────────────
      const ydayRes = await polyFetch(
        `/v2/aggs/ticker/I:SPX/range/1/day/${yday}/${yday}?adjusted=true&sort=asc&limit=1`
      ).catch(() => null)

      const ydayBar = ydayRes?.results?.[0]
      if (ydayBar) {
        setLevels(p => ({
          ...p,
          pdh: ydayBar.h,
          pdl: ydayBar.l,
          prevClose: ydayBar.c,
        }))
        if (spxBars.length) {
          const last = spxBars[spxBars.length - 1]
          setChanges(p => ({ ...p, spx: last.c - ydayBar.c }))
        }
      }

      // ── 3. I:VIX today bars ─────────────────────────────────────────────
      const vixRes = await polyFetch(
        `/v2/aggs/ticker/I:VIX/range/5/minute/${today}/${today}?adjusted=true&sort=asc&limit=500`
      ).catch(() => null)

      const vixBars: Bar[] = vixRes?.results?.map((r: any) => ({
        t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v
      })) || []

      if (vixBars.length > 0) {
        const last = vixBars[vixBars.length - 1]
        setVixCandles(vixBars)
        setVixPrice(last.c)
        // VIX % change from yesterday
        const vixYd = await polyFetch(
          `/v2/aggs/ticker/I:VIX/range/1/day/${yday}/${yday}?adjusted=true&sort=asc&limit=1`
        ).catch(() => null)
        const vixPrev = vixYd?.results?.[0]?.c
        if (vixPrev) setChanges(p => ({ ...p, vix: last.c - vixPrev }))
      }

      // ── 4. SPY today bars (15-min delayed, for reference only) ──────────
      const spyRes = await polyFetch(
        `/v2/aggs/ticker/SPY/range/5/minute/${today}/${today}?adjusted=true&sort=asc&limit=500`
      ).catch(() => null)

      const spyBars: Bar[] = spyRes?.results?.map((r: any) => ({
        t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v
      })) || []

      if (spyBars.length > 0) {
        setSpyCandles(spyBars)
        setSpyPrice(spyBars[spyBars.length - 1].c)
        // SPY % change
        const spyYd = await polyFetch(
          `/v2/aggs/ticker/SPY/range/1/day/${yday}/${yday}?adjusted=true&sort=asc&limit=1`
        ).catch(() => null)
        const spyPrev = spyYd?.results?.[0]?.c
        if (spyPrev) setChanges(p => ({ ...p, spy: spyBars[spyBars.length - 1].c - spyPrev }))
      }

      // ── 5. Update implied move levels ───────────────────────────────────
      if (impliedMove) {
        setCurrentPrice(p => {
          if (p && impliedMove) {
            setLevels(lp => ({
              ...lp,
              impliedHigh: p + impliedMove,
              impliedLow:  p - impliedMove,
            }))
          }
          return p
        })
      }

      setConnected(true)
      setLastUpdated(new Date())

    } catch (e) {
      console.error('[useMarketData] fetch error:', e)
    }
  }, [impliedMove])

  // ── Mount + 60s refresh ─────────────────────────────────────────────────
  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60_000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // ── Compute data age ────────────────────────────────────────────────────
  const dataAge = lastUpdated
    ? Math.round((Date.now() - lastUpdated.getTime()) / 60000)
    : null

  return {
    currentPrice,
    spyPrice,
    vixPrice,
    openPrice,
    levels,
    candles,
    spyCandles,
    vixCandles,
    changes,
    connected,
    lastUpdated,
    dataAge,
    manualVwap,
    setManualVwap: setManualVwapBoth,
    refresh: fetchAll,
  }
}
