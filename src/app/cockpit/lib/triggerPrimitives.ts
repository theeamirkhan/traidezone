/**
 * lib/triggerPrimitives.ts
 *
 * Pure deterministic functions that detect whether a single trigger
 * "primitive" condition is satisfied given current + recent market state.
 *
 * These are the ATOMS that trigger rules compose from. No LLM, no
 * async — just math against price/level data. Called every tick by the
 * trigger monitor.
 *
 * Each primitive returns a PrimitiveState: is it active NOW, and a
 * detail string for logging/display.
 */

export interface MarketSnapshot {
  currentPrice:  number
  timestamp:     number          // ms
  vwap:          number | null
  ema200:        number | null   // 5-min 200 EMA
  ema90:         number | null   // 5-min 90 EMA
  pdh:           number | null   // prior day high
  pdl:           number | null   // prior day low
  prevClose:     number | null
  orbHigh:       number | null
  orbLow:        number | null
  tick:          number | null   // NYSE TICK index
  sessionMinutes: number         // minutes since 9:30 ET (can be negative)
}

export interface PrimitiveState {
  active:  boolean
  detail:  string
  value?:  number
}

// ── Tolerance for "hold" detection (how close to a level counts as testing it) ──
const HOLD_TOLERANCE_PTS = 3   // within 3 SPX points of the level
const RECLAIM_BUFFER_PTS = 1   // must be at least 1pt above/below to count as reclaimed

// ═══════════════════════════════════════════════════════════════════════
// VWAP primitives
// ═══════════════════════════════════════════════════════════════════════

/** Price is above VWAP and holding (tested from above, didn't break below) */
export function vwapHoldAbove(snap: MarketSnapshot, recentLows: number[]): PrimitiveState {
  if (!snap.vwap || !snap.currentPrice) return { active: false, detail: 'no VWAP data' }
  const aboveNow = snap.currentPrice > snap.vwap + RECLAIM_BUFFER_PTS
  // "Hold" = currently above AND recent lows tested near VWAP without breaking decisively below
  const testedAndHeld = recentLows.length > 0 &&
    recentLows.some(low => low <= snap.vwap! + HOLD_TOLERANCE_PTS) &&  // came down to test
    recentLows.every(low => low >= snap.vwap! - HOLD_TOLERANCE_PTS)    // but didn't break far below
  return {
    active: aboveNow && testedAndHeld,
    detail: aboveNow ? (testedAndHeld ? `holding above VWAP ${snap.vwap.toFixed(1)}` : `above VWAP but no test`) : `below VWAP`,
    value: snap.vwap,
  }
}

/** Price reclaimed VWAP from below (was below, now decisively above) */
export function vwapReclaim(snap: MarketSnapshot, priorPrice: number | null): PrimitiveState {
  if (!snap.vwap || !snap.currentPrice || priorPrice === null) return { active: false, detail: 'no VWAP/prior data' }
  const wasBelow = priorPrice < snap.vwap
  const nowAbove = snap.currentPrice > snap.vwap + RECLAIM_BUFFER_PTS
  return {
    active: wasBelow && nowAbove,
    detail: (wasBelow && nowAbove) ? `reclaimed VWAP ${snap.vwap.toFixed(1)}` : `no reclaim`,
    value: snap.vwap,
  }
}

/** Price is below VWAP and holding below (for short setups) */
export function vwapHoldBelow(snap: MarketSnapshot, recentHighs: number[]): PrimitiveState {
  if (!snap.vwap || !snap.currentPrice) return { active: false, detail: 'no VWAP data' }
  const belowNow = snap.currentPrice < snap.vwap - RECLAIM_BUFFER_PTS
  const testedAndHeld = recentHighs.length > 0 &&
    recentHighs.some(high => high >= snap.vwap! - HOLD_TOLERANCE_PTS) &&
    recentHighs.every(high => high <= snap.vwap! + HOLD_TOLERANCE_PTS)
  return {
    active: belowNow && testedAndHeld,
    detail: belowNow ? (testedAndHeld ? `holding below VWAP ${snap.vwap.toFixed(1)}` : `below VWAP but no test`) : `above VWAP`,
    value: snap.vwap,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PDH / PDL primitives
// ═══════════════════════════════════════════════════════════════════════

/** Price broke above prior day high and is holding above it */
export function pdhBreakHold(snap: MarketSnapshot, recentLows: number[]): PrimitiveState {
  if (!snap.pdh || !snap.currentPrice) return { active: false, detail: 'no PDH data' }
  const aboveNow = snap.currentPrice > snap.pdh + RECLAIM_BUFFER_PTS
  // held = recent lows stayed at/above PDH (didn't fall back below)
  const held = recentLows.length === 0 || recentLows.every(low => low >= snap.pdh! - HOLD_TOLERANCE_PTS)
  return {
    active: aboveNow && held,
    detail: aboveNow ? (held ? `broke + holding above PDH ${snap.pdh.toFixed(1)}` : `above PDH but slipping`) : `below PDH`,
    value: snap.pdh,
  }
}

/** Price broke below prior day low and holding below */
export function pdlBreakHold(snap: MarketSnapshot, recentHighs: number[]): PrimitiveState {
  if (!snap.pdl || !snap.currentPrice) return { active: false, detail: 'no PDL data' }
  const belowNow = snap.currentPrice < snap.pdl - RECLAIM_BUFFER_PTS
  const held = recentHighs.length === 0 || recentHighs.every(high => high <= snap.pdl! + HOLD_TOLERANCE_PTS)
  return {
    active: belowNow && held,
    detail: belowNow ? (held ? `broke + holding below PDL ${snap.pdl.toFixed(1)}` : `below PDL but bouncing`) : `above PDL`,
    value: snap.pdl,
  }
}

/** Price reclaimed above prior day close (your "take above yesterday's close" trigger) */
export function prevCloseReclaim(snap: MarketSnapshot, priorPrice: number | null): PrimitiveState {
  if (!snap.prevClose || !snap.currentPrice) return { active: false, detail: 'no prevClose data' }
  const nowAbove = snap.currentPrice > snap.prevClose + RECLAIM_BUFFER_PTS
  const wasBelowOrCrossing = priorPrice === null || priorPrice <= snap.prevClose + RECLAIM_BUFFER_PTS
  return {
    active: nowAbove && wasBelowOrCrossing,
    detail: nowAbove ? `above prev close ${snap.prevClose.toFixed(1)}` : `below prev close`,
    value: snap.prevClose,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ORB (opening range breakout) primitives
// ═══════════════════════════════════════════════════════════════════════

/** Price broke above the opening range high */
export function orbBreakUp(snap: MarketSnapshot): PrimitiveState {
  if (!snap.orbHigh || !snap.currentPrice) return { active: false, detail: 'no ORB data' }
  const broke = snap.currentPrice > snap.orbHigh + RECLAIM_BUFFER_PTS
  return {
    active: broke,
    detail: broke ? `broke above ORB high ${snap.orbHigh.toFixed(1)}` : `inside/below ORB`,
    value: snap.orbHigh,
  }
}

/** Price broke below the opening range low */
export function orbBreakDown(snap: MarketSnapshot): PrimitiveState {
  if (!snap.orbLow || !snap.currentPrice) return { active: false, detail: 'no ORB data' }
  const broke = snap.currentPrice < snap.orbLow - RECLAIM_BUFFER_PTS
  return {
    active: broke,
    detail: broke ? `broke below ORB low ${snap.orbLow.toFixed(1)}` : `inside/above ORB`,
    value: snap.orbLow,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EMA primitives
// ═══════════════════════════════════════════════════════════════════════

/** Price reclaimed the 200 EMA (5-min) from below */
export function ema200Reclaim(snap: MarketSnapshot, priorPrice: number | null): PrimitiveState {
  if (!snap.ema200 || !snap.currentPrice || priorPrice === null) return { active: false, detail: 'no 200EMA/prior data' }
  const wasBelow = priorPrice < snap.ema200
  const nowAbove = snap.currentPrice > snap.ema200 + RECLAIM_BUFFER_PTS
  return {
    active: wasBelow && nowAbove,
    detail: (wasBelow && nowAbove) ? `reclaimed 200EMA ${snap.ema200.toFixed(1)}` : `no 200EMA reclaim`,
    value: snap.ema200,
  }
}

/** Price is above 200 EMA (state, not event) */
export function ema200Above(snap: MarketSnapshot): PrimitiveState {
  if (!snap.ema200 || !snap.currentPrice) return { active: false, detail: 'no 200EMA data' }
  const above = snap.currentPrice > snap.ema200
  return { active: above, detail: above ? `above 200EMA` : `below 200EMA`, value: snap.ema200 }
}

/** Price is below 90 EMA (your stall/exit warning from Thursday) */
export function ema90Below(snap: MarketSnapshot): PrimitiveState {
  if (!snap.ema90 || !snap.currentPrice) return { active: false, detail: 'no 90EMA data' }
  const below = snap.currentPrice < snap.ema90
  return { active: below, detail: below ? `below 90EMA ${snap.ema90.toFixed(1)}` : `above 90EMA`, value: snap.ema90 }
}

// ═══════════════════════════════════════════════════════════════════════
// TICK primitives
// ═══════════════════════════════════════════════════════════════════════

/** NYSE TICK above a bullish threshold (default +600) */
export function tickAbove(snap: MarketSnapshot, threshold = 600): PrimitiveState {
  if (snap.tick === null) return { active: false, detail: 'no TICK data' }
  const above = snap.tick >= threshold
  return { active: above, detail: above ? `TICK ${snap.tick} ≥ +${threshold}` : `TICK ${snap.tick} < +${threshold}`, value: snap.tick }
}

/** NYSE TICK below a bearish threshold (default -600) */
export function tickBelow(snap: MarketSnapshot, threshold = -600): PrimitiveState {
  if (snap.tick === null) return { active: false, detail: 'no TICK data' }
  const below = snap.tick <= threshold
  return { active: below, detail: below ? `TICK ${snap.tick} ≤ ${threshold}` : `TICK ${snap.tick} > ${threshold}`, value: snap.tick }
}

// ═══════════════════════════════════════════════════════════════════════
// Time-of-day gate
// ═══════════════════════════════════════════════════════════════════════

/** Current time is after a given minutes-since-open threshold (default 30 = 10:00am) */
export function afterTime(snap: MarketSnapshot, minutesSinceOpen = 30): PrimitiveState {
  const past = snap.sessionMinutes >= minutesSinceOpen
  const targetHour = 9 + Math.floor((30 + minutesSinceOpen) / 60)
  const targetMin = (30 + minutesSinceOpen) % 60
  const label = `${targetHour}:${String(targetMin).padStart(2, '0')}`
  return {
    active: past,
    detail: past ? `after ${label} ET` : `before ${label} ET`,
    value: snap.sessionMinutes,
  }
}

/** Current time is before a threshold (for "morning only" gates) */
export function beforeTime(snap: MarketSnapshot, minutesSinceOpen: number): PrimitiveState {
  const before = snap.sessionMinutes < minutesSinceOpen
  return { active: before, detail: before ? `before gate` : `after gate`, value: snap.sessionMinutes }
}

// ═══════════════════════════════════════════════════════════════════════
// Primitive registry — maps a primitive ID to its evaluator
// ═══════════════════════════════════════════════════════════════════════

export type PrimitiveId =
  | 'vwap_hold_above' | 'vwap_reclaim' | 'vwap_hold_below'
  | 'pdh_break_hold' | 'pdl_break_hold' | 'prev_close_reclaim'
  | 'orb_break_up' | 'orb_break_down'
  | 'ema200_reclaim' | 'ema200_above' | 'ema90_below'
  | 'tick_above' | 'tick_below'
  | 'after_time' | 'before_time'

export interface PrimitiveContext {
  snap:         MarketSnapshot
  priorPrice:   number | null    // price one tick/bar ago (for reclaim detection)
  recentLows:   number[]         // last ~3 bars' lows (for hold detection)
  recentHighs:  number[]         // last ~3 bars' highs
}

/** Evaluate a primitive by id with optional params */
export function evaluatePrimitive(
  id: PrimitiveId,
  ctx: PrimitiveContext,
  params?: { threshold?: number; minutesSinceOpen?: number },
): PrimitiveState {
  const { snap, priorPrice, recentLows, recentHighs } = ctx
  switch (id) {
    case 'vwap_hold_above':   return vwapHoldAbove(snap, recentLows)
    case 'vwap_reclaim':      return vwapReclaim(snap, priorPrice)
    case 'vwap_hold_below':   return vwapHoldBelow(snap, recentHighs)
    case 'pdh_break_hold':    return pdhBreakHold(snap, recentLows)
    case 'pdl_break_hold':    return pdlBreakHold(snap, recentHighs)
    case 'prev_close_reclaim':return prevCloseReclaim(snap, priorPrice)
    case 'orb_break_up':      return orbBreakUp(snap)
    case 'orb_break_down':    return orbBreakDown(snap)
    case 'ema200_reclaim':    return ema200Reclaim(snap, priorPrice)
    case 'ema200_above':      return ema200Above(snap)
    case 'ema90_below':       return ema90Below(snap)
    case 'tick_above':        return tickAbove(snap, params?.threshold)
    case 'tick_below':        return tickBelow(snap, params?.threshold)
    case 'after_time':        return afterTime(snap, params?.minutesSinceOpen)
    case 'before_time':       return beforeTime(snap, params?.minutesSinceOpen ?? 0)
    default:                  return { active: false, detail: `unknown primitive ${id}` }
  }
}

/** Human-readable labels for each primitive (used in UI + parsing) */
export const PRIMITIVE_LABELS: Record<PrimitiveId, string> = {
  vwap_hold_above:   'VWAP hold (above)',
  vwap_reclaim:      'VWAP reclaim (from below)',
  vwap_hold_below:   'VWAP hold (below)',
  pdh_break_hold:    'PDH break + hold',
  pdl_break_hold:    'PDL break + hold',
  prev_close_reclaim:'Prev close reclaim',
  orb_break_up:      'ORB break up',
  orb_break_down:    'ORB break down',
  ema200_reclaim:    '200 EMA reclaim',
  ema200_above:      'Above 200 EMA',
  ema90_below:       'Below 90 EMA',
  tick_above:        'TICK above threshold',
  tick_below:        'TICK below threshold',
  after_time:        'After time-of-day',
  before_time:       'Before time-of-day',
}
