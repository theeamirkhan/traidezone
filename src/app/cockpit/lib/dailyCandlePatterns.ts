/**
 * dailyCandlePatterns.ts — Daily candle pattern recognition
 *
 * Detects high-probability reversal and continuation signals on daily bars.
 * Used in morning brief, companion context, and signal generation.
 *
 * Patterns detected:
 * REVERSAL:
 *   - Hammer / Inverted Hammer (bullish reversal after downtrend)
 *   - Shooting Star / Hanging Man (bearish reversal after uptrend)
 *   - Bullish/Bearish Engulfing
 *   - Doji (indecision — especially at extremes)
 *   - Morning Star / Evening Star (3-candle)
 *   - Bullish/Bearish Harami
 *   - Pin Bar (long wick rejection)
 *
 * CONTINUATION:
 *   - Marubozu (strong trend candle, no wicks)
 *   - Three White Soldiers / Three Black Crows
 *   - Inside Bar (coiling before breakout)
 *
 * CONTEXT:
 *   - Key level confluence (near 200 EMA, 50 SMA, PDH/PDL, round numbers)
 *   - Volume confirmation
 *   - Trend context (uptrend/downtrend before signal)
 */

export interface CandleBar {
  o: number; h: number; l: number; c: number; v?: number; t?: number
}

export interface DailyPattern {
  name:        string
  type:        'BULLISH_REVERSAL' | 'BEARISH_REVERSAL' | 'BULLISH_CONTINUATION' | 'BEARISH_CONTINUATION' | 'INDECISION'
  strength:    'STRONG' | 'MODERATE' | 'WEAK'
  description: string
  actionable:  string   // what this means for tomorrow's trading
  keyLevel?:   string   // if near a key level
  confirmed:   boolean  // volume or second candle confirmation
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function body(bar: CandleBar)     { return Math.abs(bar.c - bar.o) }
function range(bar: CandleBar)    { return bar.h - bar.l }
function upperWick(bar: CandleBar){ return bar.h - Math.max(bar.o, bar.c) }
function lowerWick(bar: CandleBar){ return Math.min(bar.o, bar.c) - bar.l }
function isBull(bar: CandleBar)   { return bar.c > bar.o }
function isBear(bar: CandleBar)   { return bar.c < bar.o }
function bodyRatio(bar: CandleBar){ return range(bar) > 0 ? body(bar) / range(bar) : 0 }

// Trend direction over N bars
function trendDir(bars: CandleBar[], n = 5): 'UP' | 'DOWN' | 'SIDEWAYS' {
  if (bars.length < n) return 'SIDEWAYS'
  const first = bars[bars.length - n].c
  const last  = bars[bars.length - 1].c
  const pct   = (last - first) / first * 100
  if (pct > 1.0) return 'UP'
  if (pct < -1.0) return 'DOWN'
  return 'SIDEWAYS'
}

// Check if near a key level (within 0.3%)
function nearLevel(price: number, levels: number[], pct = 0.003): number | null {
  for (const lvl of levels) {
    if (lvl && Math.abs(price - lvl) / lvl < pct) return lvl
  }
  return null
}

// ── Pattern detectors ─────────────────────────────────────────────────────────

function detectHammer(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  const bar  = bars[bars.length - 1]
  const prev = bars.slice(-6, -1)
  const trend = trendDir(bars, 5)

  const lw    = lowerWick(bar)
  const uw    = upperWick(bar)
  const bd    = body(bar)
  const rng   = range(bar)

  // Hammer: long lower wick (>= 2x body), small upper wick, small body
  const isHammer = lw >= bd * 2 && uw <= bd * 0.5 && bd > 0 && lw >= rng * 0.5

  if (!isHammer || trend !== 'DOWN') return null

  const closePrice = bar.c
  const lvl = nearLevel(closePrice, keyLevels)
  const strength = isBull(bar) ? 'STRONG' : 'MODERATE'

  return {
    name:        isBull(bar) ? 'Bullish Hammer' : 'Hammer (Bearish Close)',
    type:        'BULLISH_REVERSAL',
    strength,
    description: `Hammer formed after ${prev.length}-bar downtrend. Lower wick is ${(lw/bd).toFixed(1)}x the body, showing strong buyer rejection at the lows. ${isBull(bar) ? 'Bullish close confirms buyer control.' : 'Bears closed it red — watch for confirmation tomorrow.'}`,
    actionable:  `Watch for bullish follow-through tomorrow above ${bar.h.toFixed(0)}. A gap up or strong open confirms reversal. Stop below ${bar.l.toFixed(0)}.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   isBull(bar),
  }
}

function detectShootingStar(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  const bar  = bars[bars.length - 1]
  const trend = trendDir(bars, 5)

  const uw = upperWick(bar)
  const lw = lowerWick(bar)
  const bd = body(bar)
  const rng = range(bar)

  // Shooting star: long upper wick (>= 2x body), small lower wick
  const isStar = uw >= bd * 2 && lw <= bd * 0.5 && bd > 0 && uw >= rng * 0.5

  if (!isStar || trend !== 'UP') return null

  const lvl = nearLevel(bar.c, keyLevels)
  const strength = isBear(bar) ? 'STRONG' : 'MODERATE'

  return {
    name:        isBear(bar) ? 'Shooting Star' : 'Hanging Man',
    type:        'BEARISH_REVERSAL',
    strength,
    description: `${isBear(bar) ? 'Shooting star' : 'Hanging man'} after uptrend. Upper wick is ${(uw/bd).toFixed(1)}x the body — buyers were rejected hard at ${bar.h.toFixed(0)}. ${isBear(bar) ? 'Bearish close confirms seller control.' : 'Bulls held green but the rejection wick is a warning.'}`,
    actionable:  `Watch for breakdown below ${bar.l.toFixed(0)} tomorrow. A gap down or weak open confirms reversal. Resistance now at ${bar.h.toFixed(0)}.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   isBear(bar),
  }
}

function detectEngulfing(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 2) return null
  const curr = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  const trend = trendDir(bars, 5)

  const currBody = body(curr)
  const prevBody = body(prev)
  if (currBody < prevBody * 1.3) return null  // must clearly engulf

  const bullEngulf = isBull(curr) && isBear(prev) && curr.o <= prev.c && curr.c >= prev.o
  const bearEngulf = isBear(curr) && isBull(prev) && curr.o >= prev.c && curr.c <= prev.o

  if (!bullEngulf && !bearEngulf) return null
  // Context: bullish engulf after downtrend, bearish after uptrend
  if (bullEngulf && trend === 'UP') return null
  if (bearEngulf && trend === 'DOWN') return null

  const lvl = nearLevel(curr.c, keyLevels)
  const isBullish = bullEngulf

  return {
    name:        isBullish ? 'Bullish Engulfing' : 'Bearish Engulfing',
    type:        isBullish ? 'BULLISH_REVERSAL' : 'BEARISH_REVERSAL',
    strength:    'STRONG',
    description: `${isBullish ? 'Bullish' : 'Bearish'} engulfing candle. Today's ${isBullish ? 'green' : 'red'} body (${currBody.toFixed(0)}pts) fully swallowed yesterday's ${isBullish ? 'red' : 'green'} body (${prevBody.toFixed(0)}pts). ${isBullish ? 'Decisive buyer takeover.' : 'Decisive seller takeover.'}`,
    actionable:  isBullish
      ? `Bullish bias tomorrow above ${curr.c.toFixed(0)}. Strong reversal signal — watch for continuation. Stop below ${curr.l.toFixed(0)}.`
      : `Bearish bias tomorrow below ${curr.c.toFixed(0)}. Strong reversal signal — watch for continuation. Stop above ${curr.h.toFixed(0)}.`,
    keyLevel:    lvl ? `At key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   true,
  }
}

function detectDoji(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  const bar   = bars[bars.length - 1]
  const trend = trendDir(bars, 5)
  const rng   = range(bar)
  const bd    = body(bar)

  // Doji: body < 10% of range
  if (rng === 0 || bd / rng > 0.1) return null
  if (rng < 5) return null  // too small to matter

  const lvl = nearLevel(bar.c, keyLevels)
  const isAtExtreme = trend !== 'SIDEWAYS'

  if (!isAtExtreme && !lvl) return null  // doji only matters at extremes or key levels

  const uw = upperWick(bar)
  const lw = lowerWick(bar)
  const isGravestone = uw > lw * 3  // long upper wick
  const isDragonfly  = lw > uw * 3  // long lower wick

  let name = 'Doji'
  let desc = 'Perfect indecision'
  if (isGravestone) { name = 'Gravestone Doji'; desc = 'Rejected at highs — bearish signal' }
  if (isDragonfly)  { name = 'Dragonfly Doji';  desc = 'Rejected at lows — bullish signal' }

  return {
    name,
    type:        isDragonfly ? 'BULLISH_REVERSAL' : isGravestone ? 'BEARISH_REVERSAL' : 'INDECISION',
    strength:    lvl ? 'STRONG' : 'MODERATE',
    description: `${name} at ${trend} trend extreme. ${desc}. Range: ${rng.toFixed(0)}pts, body: ${bd.toFixed(1)}pts. Market at a decision point.`,
    actionable:  `Wait for tomorrow's open to confirm direction. ${isDragonfly ? 'A bullish open tomorrow confirms reversal.' : isGravestone ? 'A bearish open tomorrow confirms reversal.' : 'A strong directional move tomorrow breaks the indecision.'}`,
    keyLevel:    lvl ? `At key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   false,
  }
}

function detectPinBar(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  const bar   = bars[bars.length - 1]
  const trend = trendDir(bars, 5)
  const rng   = range(bar)
  const bd    = body(bar)
  const uw    = upperWick(bar)
  const lw    = lowerWick(bar)

  if (rng < 8) return null  // need meaningful range

  // Pin bar: wick >= 60% of range, body in outer 1/3
  const bullPin = lw >= rng * 0.6 && trend === 'DOWN'
  const bearPin = uw >= rng * 0.6 && trend === 'UP'

  if (!bullPin && !bearPin) return null

  const lvl = nearLevel(bullPin ? bar.l : bar.h, keyLevels)

  return {
    name:        bullPin ? 'Bullish Pin Bar' : 'Bearish Pin Bar',
    type:        bullPin ? 'BULLISH_REVERSAL' : 'BEARISH_REVERSAL',
    strength:    lvl ? 'STRONG' : 'MODERATE',
    description: `${bullPin ? 'Bullish' : 'Bearish'} pin bar — ${bullPin ? `lower wick ${lw.toFixed(0)}pts showing strong buyer rejection at ${bar.l.toFixed(0)}` : `upper wick ${uw.toFixed(0)}pts showing strong seller rejection at ${bar.h.toFixed(0)}`}. Classic ${bullPin ? 'bullish' : 'bearish'} reversal signal.`,
    actionable:  bullPin
      ? `Bullish setup — entry above ${bar.h.toFixed(0)}, stop below ${bar.l.toFixed(0)}. Risk/reward favors longs.`
      : `Bearish setup — entry below ${bar.l.toFixed(0)}, stop above ${bar.h.toFixed(0)}. Risk/reward favors shorts.`,
    keyLevel:    lvl ? `Rejected from key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   false,
  }
}

function detectMorningStar(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 3) return null
  const [b1, b2, b3] = [bars[bars.length-3], bars[bars.length-2], bars[bars.length-1]]
  const trend = trendDir(bars.slice(0, -1), 5)
  if (trend !== 'DOWN') return null

  // Day 1: big bearish candle, Day 2: small body (star) gaps down, Day 3: bullish reclaims 50%+ of day 1
  const isBigBear = isBear(b1) && body(b1) > range(b1) * 0.5
  const isStar    = body(b2) < body(b1) * 0.3  // small body
  const b3Reclaim = b3.c > b1.o + (b1.c - b1.o) * 0.5  // reclaims 50% of b1
  if (!isBigBear || !isStar || !isBull(b3) || !b3Reclaim) return null

  const lvl = nearLevel(b3.c, keyLevels)
  return {
    name:        'Morning Star',
    type:        'BULLISH_REVERSAL',
    strength:    'STRONG',
    description: `3-candle morning star: strong bearish day, small indecision candle (${body(b2).toFixed(0)}pts body), then bullish recovery closing above the midpoint of the first candle. Classic bottom reversal.`,
    actionable:  `High-probability bullish reversal. Look for LONG above ${b3.h.toFixed(0)} with stop below ${b2.l.toFixed(0)}.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   true,
  }
}

function detectEveningStar(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 3) return null
  const [b1, b2, b3] = [bars[bars.length-3], bars[bars.length-2], bars[bars.length-1]]
  const trend = trendDir(bars.slice(0, -1), 5)
  if (trend !== 'UP') return null

  const isBigBull = isBull(b1) && body(b1) > range(b1) * 0.5
  const isStar    = body(b2) < body(b1) * 0.3
  const b3Reclaim = b3.c < b1.o + (b1.c - b1.o) * 0.5
  if (!isBigBull || !isStar || !isBear(b3) || !b3Reclaim) return null

  const lvl = nearLevel(b3.c, keyLevels)
  return {
    name:        'Evening Star',
    type:        'BEARISH_REVERSAL',
    strength:    'STRONG',
    description: `3-candle evening star: strong bullish day, small indecision candle at the top (${body(b2).toFixed(0)}pts body), then bearish close back below the midpoint. Classic top reversal.`,
    actionable:  `High-probability bearish reversal. Watch for SHORT below ${b3.l.toFixed(0)} with stop above ${b2.h.toFixed(0)}.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   true,
  }
}

function detectHarami(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length-2]
  const curr = bars[bars.length-1]
  const trend = trendDir(bars, 5)

  // Harami: current bar's body is fully inside prior bar's body
  const prevBodyHigh = Math.max(prev.o, prev.c)
  const prevBodyLow  = Math.min(prev.o, prev.c)
  const currBodyHigh = Math.max(curr.o, curr.c)
  const currBodyLow  = Math.min(curr.o, curr.c)

  if (currBodyHigh >= prevBodyHigh || currBodyLow <= prevBodyLow) return null
  if (body(curr) > body(prev) * 0.5) return null  // harami is small relative to prior

  const isBullHarami = isBear(prev) && isBull(curr) && trend === 'DOWN'
  const isBearHarami = isBull(prev) && isBear(curr) && trend === 'UP'
  if (!isBullHarami && !isBearHarami) return null

  const lvl = nearLevel(curr.c, keyLevels)
  return {
    name:        isBullHarami ? 'Bullish Harami' : 'Bearish Harami',
    type:        isBullHarami ? 'BULLISH_REVERSAL' : 'BEARISH_REVERSAL',
    strength:    'MODERATE',
    description: `${isBullHarami ? 'Bullish' : 'Bearish'} harami: small ${isBullHarami ? 'green' : 'red'} candle (${body(curr).toFixed(0)}pts) nestled inside yesterday's large ${isBullHarami ? 'red' : 'green'} candle. Momentum is stalling — potential reversal.`,
    actionable:  isBullHarami
      ? `Momentum slowing after downtrend. Watch for bullish confirmation above ${curr.h.toFixed(0)} tomorrow.`
      : `Momentum slowing after uptrend. Watch for bearish confirmation below ${curr.l.toFixed(0)} tomorrow.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   false,
  }
}

function detectTweezers(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length-2]
  const curr = bars[bars.length-1]
  const trend = trendDir(bars, 5)

  const tolerance = (prev.h - prev.l) * 0.005  // 0.5% of range

  // Tweezer tops: two candles with same high after uptrend
  const isTweezTop = trend === 'UP' && Math.abs(curr.h - prev.h) <= tolerance
    && isBull(prev) && isBear(curr)

  // Tweezer bottoms: two candles with same low after downtrend
  const isTweezBot = trend === 'DOWN' && Math.abs(curr.l - prev.l) <= tolerance
    && isBear(prev) && isBull(curr)

  if (!isTweezTop && !isTweezBot) return null

  const lvl = nearLevel(isTweezTop ? curr.h : curr.l, keyLevels)
  return {
    name:        isTweezTop ? 'Tweezer Top' : 'Tweezer Bottom',
    type:        isTweezTop ? 'BEARISH_REVERSAL' : 'BULLISH_REVERSAL',
    strength:    lvl ? 'STRONG' : 'MODERATE',
    description: `${isTweezTop ? 'Tweezer top' : 'Tweezer bottom'}: two consecutive candles ${isTweezTop ? `rejected at the same high (${curr.h.toFixed(0)})` : `found support at the same low (${curr.l.toFixed(0)})`}. Double rejection signals a strong ${isTweezTop ? 'resistance' : 'support'} level.`,
    actionable:  isTweezTop
      ? `Strong resistance at ${curr.h.toFixed(0)} confirmed by double rejection. Watch for breakdown below ${curr.l.toFixed(0)}.`
      : `Strong support at ${curr.l.toFixed(0)} confirmed by double test. Watch for breakout above ${curr.h.toFixed(0)}.`,
    keyLevel:    lvl ? `At key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   true,
  }
}

function detectDarkCloudPiercing(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length-2]
  const curr = bars[bars.length-1]
  const trend = trendDir(bars, 5)

  const prevMid = (prev.o + prev.c) / 2

  // Dark cloud cover: after uptrend, gaps up then closes below prior midpoint
  const isDarkCloud = trend === 'UP' && isBull(prev) && isBear(curr)
    && curr.o > prev.c && curr.c < prevMid && curr.c > prev.o

  // Piercing line: after downtrend, gaps down then closes above prior midpoint
  const isPiercing = trend === 'DOWN' && isBear(prev) && isBull(curr)
    && curr.o < prev.c && curr.c > prevMid && curr.c < prev.o

  if (!isDarkCloud && !isPiercing) return null

  const lvl = nearLevel(curr.c, keyLevels)
  const penetration = isDarkCloud
    ? ((prev.c - curr.c) / body(prev) * 100).toFixed(0)
    : ((curr.c - prev.c) / body(prev) * 100).toFixed(0)

  return {
    name:        isDarkCloud ? 'Dark Cloud Cover' : 'Piercing Line',
    type:        isDarkCloud ? 'BEARISH_REVERSAL' : 'BULLISH_REVERSAL',
    strength:    parseFloat(penetration) > 60 ? 'STRONG' : 'MODERATE',
    description: `${isDarkCloud ? 'Dark cloud cover' : 'Piercing line'}: gapped ${isDarkCloud ? 'up then reversed' : 'down then recovered'}, closing ${penetration}% into yesterday's body. ${parseFloat(penetration) > 60 ? 'Deep penetration — strong reversal signal.' : 'Moderate penetration — watch for confirmation.'}`,
    actionable:  isDarkCloud
      ? `Bearish reversal — watch for follow-through below ${curr.l.toFixed(0)}. Gap at ${curr.o.toFixed(0)} is now resistance.`
      : `Bullish reversal — watch for follow-through above ${curr.h.toFixed(0)}. Gap low at ${curr.o.toFixed(0)} is now support.`,
    keyLevel:    lvl ? `Near key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   parseFloat(penetration) > 60,
  }
}

function detectOutsideBar(bars: CandleBar[], keyLevels: number[]): DailyPattern | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length-2]
  const curr = bars[bars.length-1]
  const trend = trendDir(bars, 5)

  // Outside bar: today's range completely engulfs yesterday's range (including wicks)
  if (curr.h <= prev.h || curr.l >= prev.l) return null
  if (body(curr) < range(curr) * 0.3) return null  // need a real body not just wicks

  const isBullOutside = isBull(curr) && trend === 'DOWN'
  const isBearOutside = isBear(curr) && trend === 'UP'
  if (!isBullOutside && !isBearOutside) return null

  const lvl = nearLevel(curr.c, keyLevels)
  return {
    name:        isBullOutside ? 'Bullish Outside Bar' : 'Bearish Outside Bar',
    type:        isBullOutside ? 'BULLISH_REVERSAL' : 'BEARISH_REVERSAL',
    strength:    'STRONG',
    description: `${isBullOutside ? 'Bullish' : 'Bearish'} outside bar — today's range (${range(curr).toFixed(0)}pts, ${curr.l.toFixed(0)}-${curr.h.toFixed(0)}) fully engulfs yesterday's range including wicks. Aggressive ${isBullOutside ? 'buying' : 'selling'} took control.`,
    actionable:  isBullOutside
      ? `Strong bullish reversal. Above ${curr.h.toFixed(0)} confirms momentum. Stop below ${curr.l.toFixed(0)}.`
      : `Strong bearish reversal. Below ${curr.l.toFixed(0)} confirms momentum. Stop above ${curr.h.toFixed(0)}.`,
    keyLevel:    lvl ? `At key level ${lvl.toFixed(0)}` : undefined,
    confirmed:   true,
  }
}

function detectInsideBar(bars: CandleBar[]): DailyPattern | null {
  if (bars.length < 2) return null
  const curr = bars[bars.length - 1]
  const prev = bars[bars.length - 2]

  // Inside bar: today's high < yesterday's high AND today's low > yesterday's low
  if (curr.h >= prev.h || curr.l <= prev.l) return null
  const compression = (range(curr) / range(prev) * 100).toFixed(0)

  return {
    name:        'Inside Bar',
    type:        'INDECISION',
    strength:    'MODERATE',
    description: `Inside bar — today's range (${range(curr).toFixed(0)}pts) is ${compression}% of yesterday's range. Market is coiling inside yesterday's ${prev.h.toFixed(0)}-${prev.l.toFixed(0)} range. Compression before expansion.`,
    actionable:  `Watch for breakout of yesterday's range: above ${prev.h.toFixed(0)} = bullish breakout, below ${prev.l.toFixed(0)} = bearish breakdown. Often precedes a strong directional move.`,
    confirmed:   false,
  }
}

function detectThreeSoldiersCrows(bars: CandleBar[]): DailyPattern | null {
  if (bars.length < 3) return null
  const last3 = bars.slice(-3)

  const allBull = last3.every(b => isBull(b) && bodyRatio(b) > 0.5)
  const allBear = last3.every(b => isBear(b) && bodyRatio(b) > 0.5)
  if (!allBull && !allBear) return null

  // Each candle opens within prior body and closes higher/lower
  const soldiers = allBull && last3[1].o > last3[0].o && last3[1].c > last3[0].c
                            && last3[2].o > last3[1].o && last3[2].c > last3[1].c
  const crows    = allBear && last3[1].o < last3[0].o && last3[1].c < last3[0].c
                            && last3[2].o < last3[1].o && last3[2].c < last3[1].c

  if (!soldiers && !crows) return null

  const totalMove = Math.abs(last3[2].c - last3[0].o).toFixed(0)

  return {
    name:        soldiers ? 'Three White Soldiers' : 'Three Black Crows',
    type:        soldiers ? 'BULLISH_CONTINUATION' : 'BEARISH_CONTINUATION',
    strength:    'STRONG',
    description: `${soldiers ? 'Three consecutive bullish' : 'Three consecutive bearish'} candles with strong bodies — ${totalMove}pts total move. Consistent ${soldiers ? 'buying' : 'selling'} pressure with no meaningful wicks.`,
    actionable:  soldiers
      ? `Strong bullish momentum — look for LONG setups on any pullbacks to VWAP or 200 EMA. Trend is intact.`
      : `Strong bearish momentum — look for SHORT setups on any bounces to VWAP or 200 EMA. Trend is intact.`,
    confirmed:   true,
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

export function detectDailyCandlePatterns(
  bars: CandleBar[],
  keyLevels: {
    ema200?: number | null
    sma50?: number | null
    sma200?: number | null
    pdh?: number | null
    pdl?: number | null
    prevClose?: number | null
    vwap?: number | null
  } = {}
): DailyPattern[] {
  if (!bars || bars.length < 2) return []

  const levels = Object.values(keyLevels).filter((v): v is number => typeof v === 'number' && v > 0)
  const patterns: DailyPattern[] = []

  // Run all detectors — order matters (stronger signals first)
  const detectors = [
    // 3-candle patterns (most reliable — run first)
    () => detectMorningStar(bars, levels),
    () => detectEveningStar(bars, levels),
    // 2-candle strong reversals
    () => detectEngulfing(bars, levels),
    () => detectOutsideBar(bars, levels),
    () => detectTweezers(bars, levels),
    () => detectDarkCloudPiercing(bars, levels),
    // Single candle reversals
    () => detectHammer(bars, levels),
    () => detectShootingStar(bars, levels),
    () => detectPinBar(bars, levels),
    () => detectHarami(bars, levels),
    () => detectDoji(bars, levels),
    // Continuation / indecision
    () => detectThreeSoldiersCrows(bars),
    () => detectInsideBar(bars),
  ]

  for (const detect of detectors) {
    const pattern = detect()
    if (pattern) patterns.push(pattern)
  }

  return patterns
}

// ── Summary string for AI context ─────────────────────────────────────────────

export function formatPatternsForAI(patterns: DailyPattern[]): string {
  if (!patterns.length) return 'No significant daily candle patterns detected'

  return patterns.map(p => [
    `${p.strength === 'STRONG' ? '🔴' : '🟡'} ${p.name} (${p.type.replace('_', ' ')})`,
    p.description,
    `→ ${p.actionable}`,
    p.keyLevel ? `📍 ${p.keyLevel}` : null,
    p.confirmed ? '✓ Confirmed' : '⚠ Needs confirmation',
  ].filter(Boolean).join('\n')).join('\n\n')
}
