/**
 * patternRecognition.ts — Chart Pattern & Fibonacci Analysis Engine
 *
 * Runs on existing OHLCV candle data already in memory.
 * No new API calls — detects patterns server-side before each AI signal call.
 *
 * Output is structured text injected into the AI system prompt so Claude
 * can reason about chart structure, not just price levels.
 *
 * Patterns detected:
 *  - Double top / Double bottom
 *  - Head & Shoulders / Inverse H&S
 *  - Rising wedge / Falling wedge
 *  - Bull flag / Bear flag
 *  - Trendline break (linear regression)
 *  - Engulfing candles (at key levels only)
 *  - Inside bar compression
 *
 * Fibonacci:
 *  - Auto-detects swing high/low from daily bars (20-day) and longer bars (60-day)
 *  - Calculates 0.236, 0.382, 0.5, 0.618, 0.786 retracement levels
 *  - Extension levels 1.0, 1.272, 1.618 for targets
 *  - Reports which fib levels current price is near
 */

export interface Bar {
  t: number   // timestamp ms
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface PatternResult {
  name:        string
  direction:   'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence:  'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  priceLevel?: number   // key price level associated with pattern
  target?:     number   // measured move target
}

export interface FibLevel {
  label:    string    // e.g. '0.618'
  price:    number
  type:     'retracement' | 'extension'
  isNear:   boolean   // within 0.3% of current price
  position: 'ABOVE' | 'BELOW' | 'AT'  // relative to current price
}

export interface FibGrid {
  swingHigh:    number
  swingLow:     number
  swingBars:    number  // how many bars span the swing
  direction:    'UP' | 'DOWN'  // is the swing bullish or bearish
  levels:       FibLevel[]
  nearestLevel: FibLevel | null
  label:        string  // e.g. '20-day swing'
}

export interface PatternAnalysis {
  patterns:     PatternResult[]
  fibGrids:     FibGrid[]
  trendBias:    'BULLISH' | 'BEARISH' | 'NEUTRAL'
  structureSummary: string  // 1-2 sentence summary for AI context
  aiContext:    string      // formatted string injected into AI prompt
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function pct(a: number, b: number): number {
  return Math.abs(a - b) / b
}

function linReg(points: number[]): { slope: number; intercept: number; r2: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0] || 0, r2: 0 }
  const xs = points.map((_, i) => i)
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = points.reduce((s, y) => s + y, 0) / n
  let num = 0, den = 0, ssTot = 0, ssRes = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (points[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = my - slope * mx
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept
    ssRes += (points[i] - pred) ** 2
    ssTot += (points[i] - my) ** 2
  }
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0
  return { slope, intercept, r2 }
}

function findLocalMaxima(bars: Bar[], lookback = 3): number[] {
  const idxs: number[] = []
  for (let i = lookback; i < bars.length - lookback; i++) {
    const h = bars[i].h
    let isMax = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].h >= h) { isMax = false; break }
    }
    if (isMax) idxs.push(i)
  }
  return idxs
}

function findLocalMinima(bars: Bar[], lookback = 3): number[] {
  const idxs: number[] = []
  for (let i = lookback; i < bars.length - lookback; i++) {
    const l = bars[i].l
    let isMin = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].l <= l) { isMin = false; break }
    }
    if (isMin) idxs.push(i)
  }
  return idxs
}

// ── Pattern Detection ─────────────────────────────────────────────────────────

function detectDoubleTop(bars: Bar[], maxima: number[]): PatternResult | null {
  if (maxima.length < 2) return null
  const last2 = maxima.slice(-2)
  const [i1, i2] = last2
  const h1 = bars[i1].h, h2 = bars[i2].h
  const gap = i2 - i1
  if (gap < 5 || gap > 40) return null           // need separation
  if (pct(h1, h2) > 0.0025) return null           // peaks within 0.25%

  // Find the trough between peaks (neckline)
  const troughBars = bars.slice(i1, i2)
  const neckline = Math.min(...troughBars.map(b => b.l))
  const height = ((h1 + h2) / 2) - neckline
  const target = neckline - height                 // measured move down
  const currentPrice = bars[bars.length - 1].c

  // Only signal if price is near or below neckline
  const nearNeckline = Math.abs(currentPrice - neckline) / neckline < 0.005
  const belowNeckline = currentPrice < neckline

  if (!nearNeckline && !belowNeckline) return null

  return {
    name: 'Double Top',
    direction: 'BEARISH',
    confidence: belowNeckline ? 'HIGH' : 'MEDIUM',
    description: `Double top at ${((h1+h2)/2).toFixed(0)}. Neckline ${neckline.toFixed(0)}${belowNeckline ? ' — BROKEN, breakdown confirmed' : ' — testing neckline now'}. Measured target ${target.toFixed(0)}.`,
    priceLevel: neckline,
    target,
  }
}

function detectDoubleBottom(bars: Bar[], minima: number[]): PatternResult | null {
  if (minima.length < 2) return null
  const last2 = minima.slice(-2)
  const [i1, i2] = last2
  const l1 = bars[i1].l, l2 = bars[i2].l
  const gap = i2 - i1
  if (gap < 5 || gap > 40) return null
  if (pct(l1, l2) > 0.0025) return null

  const neckBars = bars.slice(i1, i2)
  const neckline = Math.max(...neckBars.map(b => b.h))
  const height = neckline - ((l1 + l2) / 2)
  const target = neckline + height
  const currentPrice = bars[bars.length - 1].c

  const nearNeckline = Math.abs(currentPrice - neckline) / neckline < 0.005
  const aboveNeckline = currentPrice > neckline

  if (!nearNeckline && !aboveNeckline) return null

  return {
    name: 'Double Bottom',
    direction: 'BULLISH',
    confidence: aboveNeckline ? 'HIGH' : 'MEDIUM',
    description: `Double bottom at ${((l1+l2)/2).toFixed(0)}. Neckline ${neckline.toFixed(0)}${aboveNeckline ? ' — BROKEN, breakout confirmed' : ' — testing neckline now'}. Measured target ${target.toFixed(0)}.`,
    priceLevel: neckline,
    target,
  }
}

function detectHeadAndShoulders(bars: Bar[], maxima: number[]): PatternResult | null {
  if (maxima.length < 3) return null
  const last3 = maxima.slice(-3)
  const [iL, iH, iR] = last3
  const lShoulder = bars[iL].h, head = bars[iH].h, rShoulder = bars[iR].h

  // Head must be clearly higher than both shoulders
  if (head <= lShoulder || head <= rShoulder) return null
  if (head - lShoulder < lShoulder * 0.003) return null
  if (head - rShoulder < rShoulder * 0.003) return null
  // Shoulders should be roughly equal
  if (pct(lShoulder, rShoulder) > 0.006) return null

  const neckline = Math.min(
    Math.min(...bars.slice(iL, iH).map(b => b.l)),
    Math.min(...bars.slice(iH, iR).map(b => b.l))
  )
  const height = head - neckline
  const target = neckline - height
  const currentPrice = bars[bars.length - 1].c
  const nearNeckline = Math.abs(currentPrice - neckline) / neckline < 0.006

  if (!nearNeckline && currentPrice > neckline) return null

  return {
    name: 'Head & Shoulders',
    direction: 'BEARISH',
    confidence: currentPrice < neckline ? 'HIGH' : 'MEDIUM',
    description: `H&S pattern: shoulders ~${((lShoulder+rShoulder)/2).toFixed(0)}, head ${head.toFixed(0)}, neckline ${neckline.toFixed(0)}${currentPrice < neckline ? ' — BROKEN bearish' : ' — watching neckline'}. Target ${target.toFixed(0)}.`,
    priceLevel: neckline,
    target,
  }
}

function detectInverseHS(bars: Bar[], minima: number[]): PatternResult | null {
  if (minima.length < 3) return null
  const last3 = minima.slice(-3)
  const [iL, iH, iR] = last3
  const lShoulder = bars[iL].l, head = bars[iH].l, rShoulder = bars[iR].l

  if (head >= lShoulder || head >= rShoulder) return null
  if (lShoulder - head < head * 0.003) return null
  if (rShoulder - head < head * 0.003) return null
  if (pct(lShoulder, rShoulder) > 0.006) return null

  const neckline = Math.max(
    Math.max(...bars.slice(iL, iH).map(b => b.h)),
    Math.max(...bars.slice(iH, iR).map(b => b.h))
  )
  const height = neckline - head
  const target = neckline + height
  const currentPrice = bars[bars.length - 1].c
  const nearNeckline = Math.abs(currentPrice - neckline) / neckline < 0.006

  if (!nearNeckline && currentPrice < neckline) return null

  return {
    name: 'Inverse Head & Shoulders',
    direction: 'BULLISH',
    confidence: currentPrice > neckline ? 'HIGH' : 'MEDIUM',
    description: `Inverse H&S: shoulders ~${((lShoulder+rShoulder)/2).toFixed(0)}, head ${head.toFixed(0)}, neckline ${neckline.toFixed(0)}${currentPrice > neckline ? ' — BROKEN bullish' : ' — watching neckline'}. Target ${target.toFixed(0)}.`,
    priceLevel: neckline,
    target,
  }
}

function detectWedge(bars: Bar[]): PatternResult | null {
  if (bars.length < 15) return null
  const recent = bars.slice(-20)

  // Fit trendlines to highs and lows
  const highs = recent.map(b => b.h)
  const lows  = recent.map(b => b.l)
  const highTrend = linReg(highs)
  const lowTrend  = linReg(lows)

  // Need reasonable fit (r2 > 0.5)
  if (highTrend.r2 < 0.5 || lowTrend.r2 < 0.5) return null

  const highSlope = highTrend.slope
  const lowSlope  = lowTrend.slope

  // Rising wedge: both lines slope up but lows rise faster (converging)
  if (highSlope > 0 && lowSlope > 0 && lowSlope > highSlope && (lowSlope - highSlope) > 0.3) {
    const currentPrice = bars[bars.length - 1].c
    const projHigh = highTrend.intercept + highTrend.slope * (recent.length - 1)
    const nearUpper = pct(currentPrice, projHigh) < 0.003
    return {
      name: 'Rising Wedge',
      direction: 'BEARISH',
      confidence: nearUpper ? 'HIGH' : 'MEDIUM',
      description: `Rising wedge forming over last ${recent.length} bars. Both highs and lows rising but converging — typically bearish resolution. Watch for breakdown below rising support.`,
    }
  }

  // Falling wedge: both slope down but highs fall faster (converging)
  if (highSlope < 0 && lowSlope < 0 && highSlope < lowSlope && (lowSlope - highSlope) > 0.3) {
    const currentPrice = bars[bars.length - 1].c
    const projLow = lowTrend.intercept + lowTrend.slope * (recent.length - 1)
    const nearLower = pct(currentPrice, projLow) < 0.003
    return {
      name: 'Falling Wedge',
      direction: 'BULLISH',
      confidence: nearLower ? 'HIGH' : 'MEDIUM',
      description: `Falling wedge forming over last ${recent.length} bars. Both highs and lows falling but converging — typically bullish resolution. Watch for breakout above falling resistance.`,
    }
  }

  return null
}

function detectFlag(bars: Bar[]): PatternResult | null {
  if (bars.length < 10) return null
  const recent = bars.slice(-15)

  // Look for a strong move followed by tight consolidation
  // Find the biggest single-bar move in the last 30 bars
  const flagpole = bars.slice(-30, -10)
  if (!flagpole.length) return null

  const bestMove = flagpole.reduce((best, b) => {
    const move = Math.abs(b.c - b.o)
    return move > best.move ? { move, bar: b } : best
  }, { move: 0, bar: flagpole[0] })

  if (bestMove.move < bestMove.bar.o * 0.004) return null  // need at least 0.4% pole

  // Consolidation: tight range in recent bars
  const recentHighs = recent.map(b => b.h)
  const recentLows  = recent.map(b => b.l)
  const rangeMax = Math.max(...recentHighs)
  const rangeMin = Math.min(...recentLows)
  const consolidationRange = (rangeMax - rangeMin) / rangeMin

  if (consolidationRange > 0.008) return null  // too wide to be a flag

  const isBullFlag = bestMove.bar.c > bestMove.bar.o  // pole was up
  const currentPrice = bars[bars.length - 1].c

  return {
    name: isBullFlag ? 'Bull Flag' : 'Bear Flag',
    direction: isBullFlag ? 'BULLISH' : 'BEARISH',
    confidence: 'MEDIUM',
    description: `${isBullFlag ? 'Bull' : 'Bear'} flag — tight consolidation (${(consolidationRange * 100).toFixed(2)}% range) following a strong ${isBullFlag ? 'up' : 'down'} move. Anticipate ${isBullFlag ? 'upside' : 'downside'} continuation on break of ${isBullFlag ? rangeMax.toFixed(0) : rangeMin.toFixed(0)}.`,
    priceLevel: isBullFlag ? rangeMax : rangeMin,
    target: isBullFlag ? rangeMax + bestMove.move : rangeMin - bestMove.move,
  }
}

function detectTrendlineBreak(bars: Bar[]): PatternResult | null {
  if (bars.length < 20) return null
  const recent = bars.slice(-25)
  const currentPrice = bars[bars.length - 1].c
  const currentBar   = bars[bars.length - 1]

  // Fit trendline to recent swing highs (downtrend resistance)
  const swingHighs = findLocalMaxima(recent, 2)
  const swingLows  = findLocalMinima(recent, 2)

  if (swingHighs.length >= 3) {
    const highPrices = swingHighs.map(i => recent[i].h)
    const trend = linReg(highPrices)
    if (trend.r2 > 0.75 && trend.slope < 0) {
      const projectedLine = trend.intercept + trend.slope * (recent.length - 1)
      if (currentBar.c > projectedLine && currentBar.o < projectedLine) {
        return {
          name: 'Downtrend Break',
          direction: 'BULLISH',
          confidence: 'HIGH',
          description: `Price just broke above a descending resistance trendline (${swingHighs.length} touch points, r²=${trend.r2.toFixed(2)}). Projected resistance was ${projectedLine.toFixed(0)}. Current close ${currentPrice.toFixed(0)} — bullish breakout.`,
          priceLevel: projectedLine,
        }
      }
    }
  }

  if (swingLows.length >= 3) {
    const lowPrices = swingLows.map(i => recent[i].l)
    const trend = linReg(lowPrices)
    if (trend.r2 > 0.75 && trend.slope > 0) {
      const projectedLine = trend.intercept + trend.slope * (recent.length - 1)
      if (currentBar.c < projectedLine && currentBar.o > projectedLine) {
        return {
          name: 'Uptrend Break',
          direction: 'BEARISH',
          confidence: 'HIGH',
          description: `Price just broke below an ascending support trendline (${swingLows.length} touch points, r²=${trend.r2.toFixed(2)}). Projected support was ${projectedLine.toFixed(0)}. Current close ${currentPrice.toFixed(0)} — bearish breakdown.`,
          priceLevel: projectedLine,
        }
      }
    }
  }

  return null
}

function detectEngulfing(bars: Bar[], keyLevels: number[]): PatternResult | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length - 2]
  const curr = bars[bars.length - 1]
  const currentPrice = curr.c

  // Check if we're near any key level
  const nearKey = keyLevels.some(l => l > 0 && Math.abs(currentPrice - l) / l < 0.003)
  if (!nearKey) return null  // only signal engulfing at key levels

  const prevBody = Math.abs(prev.c - prev.o)
  const currBody = Math.abs(curr.c - curr.o)
  if (currBody < prevBody * 1.5) return null  // current must clearly engulf prior

  const isBullish = curr.c > curr.o && prev.c < prev.o && curr.o < prev.c && curr.c > prev.o
  const isBearish = curr.c < curr.o && prev.c > prev.o && curr.o > prev.c && curr.c < prev.o

  if (!isBullish && !isBearish) return null

  const nearestLevel = keyLevels.reduce((nearest, l) => {
    return l > 0 && Math.abs(currentPrice - l) < Math.abs(currentPrice - nearest) ? l : nearest
  }, keyLevels[0] || 0)

  return {
    name: isBullish ? 'Bullish Engulfing' : 'Bearish Engulfing',
    direction: isBullish ? 'BULLISH' : 'BEARISH',
    confidence: 'MEDIUM',
    description: `${isBullish ? 'Bullish' : 'Bearish'} engulfing candle at key level ${nearestLevel.toFixed(0)}. ${isBullish ? 'Prior red candle fully engulfed by green — buyers in control' : 'Prior green candle fully engulfed by red — sellers in control'}.`,
    priceLevel: nearestLevel,
  }
}

function detectInsideBar(bars: Bar[]): PatternResult | null {
  if (bars.length < 2) return null
  const prev = bars[bars.length - 2]
  const curr = bars[bars.length - 1]

  if (curr.h < prev.h && curr.l > prev.l) {
    const range = (curr.h - curr.l) / curr.l
    return {
      name: 'Inside Bar',
      direction: 'NEUTRAL',
      confidence: 'LOW',
      description: `Inside bar compression — current bar range ${(range * 100).toFixed(2)}% entirely within prior bar. Energy coiling. Watch for breakout above ${curr.h.toFixed(0)} or breakdown below ${curr.l.toFixed(0)}.`,
      priceLevel: curr.c,
    }
  }
  return null
}

// ── Fibonacci ─────────────────────────────────────────────────────────────────

const FIB_RETRACEMENTS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
const FIB_EXTENSIONS   = [1.0, 1.272, 1.618]

function buildFibGrid(bars: Bar[], currentPrice: number, label: string): FibGrid {
  const swingHigh = Math.max(...bars.map(b => b.h))
  const swingLow  = Math.min(...bars.map(b => b.l))

  // Determine swing direction — is recent price closer to high or low?
  const recentAvg = bars.slice(-5).reduce((s, b) => s + b.c, 0) / 5
  const direction: 'UP' | 'DOWN' = recentAvg > (swingHigh + swingLow) / 2 ? 'UP' : 'DOWN'
  const range = swingHigh - swingLow

  const levels: FibLevel[] = []

  // Retracements
  FIB_RETRACEMENTS.forEach(r => {
    // For upswing: retrace DOWN from high
    // For downswing: retrace UP from low
    const price = direction === 'UP'
      ? swingHigh - r * range    // retracing from high
      : swingLow  + r * range    // retracing from low

    const distPct = Math.abs(currentPrice - price) / currentPrice
    const isNear  = distPct < 0.003
    const position = currentPrice > price ? 'BELOW' : currentPrice < price ? 'ABOVE' : 'AT'

    levels.push({
      label:    r === 0 ? '0 (swing)' : r === 1.0 ? '1.0 (swing)' : r.toString(),
      price:    parseFloat(price.toFixed(2)),
      type:     'retracement',
      isNear,
      position,
    })
  })

  // Extensions (for targets)
  FIB_EXTENSIONS.filter(e => e > 1.0).forEach(e => {
    const price = direction === 'UP'
      ? swingLow + e * range     // extension above high
      : swingHigh - e * range    // extension below low

    const distPct = Math.abs(currentPrice - price) / currentPrice
    const isNear  = distPct < 0.005  // slightly wider for extensions
    const position = currentPrice > price ? 'BELOW' : currentPrice < price ? 'ABOVE' : 'AT'

    levels.push({
      label:    `${e} ext`,
      price:    parseFloat(price.toFixed(2)),
      type:     'extension',
      isNear,
      position,
    })
  })

  const nearestLevel = levels
    .filter(l => l.isNear)
    .sort((a, b) => Math.abs(currentPrice - a.price) - Math.abs(currentPrice - b.price))[0] || null

  return {
    swingHigh: parseFloat(swingHigh.toFixed(2)),
    swingLow:  parseFloat(swingLow.toFixed(2)),
    swingBars: bars.length,
    direction,
    levels,
    nearestLevel,
    label,
  }
}

// ── Trend bias from multi-timeframe candles ───────────────────────────────────

function computeTrendBias(bars: Bar[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (bars.length < 10) return 'NEUTRAL'
  const higherHighs = 0
  const lowerLows   = 0
  let hh = 0, ll = 0

  for (let i = 5; i < bars.length; i++) {
    const prevHigh = Math.max(...bars.slice(i - 5, i).map(b => b.h))
    const prevLow  = Math.min(...bars.slice(i - 5, i).map(b => b.l))
    if (bars[i].h > prevHigh) hh++
    if (bars[i].l < prevLow)  ll++
  }

  const recent10 = bars.slice(-10)
  const slope = linReg(recent10.map(b => b.c)).slope
  const mid   = (bars[bars.length - 1].c + bars[0].c) / 2

  if (slope > 0 && hh > ll) return 'BULLISH'
  if (slope < 0 && ll > hh) return 'BEARISH'
  return 'NEUTRAL'
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzePatterns(
  intraday5m: Bar[],   // 5-min bars for pattern detection (last 2 days)
  daily:      Bar[],   // daily bars for fib levels (last 60+ days)
  currentPrice: number,
  keyLevels: { vwap?: number; ema200?: number; pdh?: number; pdl?: number },
): PatternAnalysis {

  const patterns: PatternResult[] = []

  // ── Intraday pattern detection on 5m bars ────────────────────────────────
  const bars5m = intraday5m.slice(-60)  // last 60 bars (~5 hours)
  const maxima = findLocalMaxima(bars5m, 3)
  const minima = findLocalMinima(bars5m, 3)

  const keyLevelArr = [
    keyLevels.vwap || 0,
    keyLevels.ema200 || 0,
    keyLevels.pdh || 0,
    keyLevels.pdl || 0,
  ].filter(Boolean)

  ;[
    detectDoubleTop(bars5m, maxima),
    detectDoubleBottom(bars5m, minima),
    detectHeadAndShoulders(bars5m, maxima),
    detectInverseHS(bars5m, minima),
    detectWedge(bars5m),
    detectFlag(bars5m),
    detectTrendlineBreak(bars5m),
    detectEngulfing(bars5m, keyLevelArr),
    detectInsideBar(bars5m),
  ].forEach(p => { if (p) patterns.push(p) })

  // ── Fibonacci grids from daily bars ──────────────────────────────────────
  const fibGrids: FibGrid[] = []

  if (daily.length >= 20) {
    const swingLookback20 = daily.slice(-20)
    fibGrids.push(buildFibGrid(swingLookback20, currentPrice, '20-day swing'))
  }

  if (daily.length >= 60) {
    const swingLookback60 = daily.slice(-60)
    fibGrids.push(buildFibGrid(swingLookback60, currentPrice, '60-day swing'))
  }

  // ── Trend bias ────────────────────────────────────────────────────────────
  const trendBias = computeTrendBias(daily.length >= 10 ? daily.slice(-10) : bars5m)

  // ── Build AI context string ───────────────────────────────────────────────
  const lines: string[] = []

  if (patterns.length > 0) {
    lines.push('CHART PATTERNS DETECTED:')
    patterns.forEach(p => {
      lines.push(`  [${p.confidence}] ${p.name} (${p.direction}): ${p.description}`)
    })
  } else {
    lines.push('CHART PATTERNS: None clearly detected in current structure.')
  }

  lines.push('')
  lines.push(`TREND BIAS (daily): ${trendBias}`)

  if (fibGrids.length > 0) {
    lines.push('')
    lines.push('FIBONACCI LEVELS:')
    fibGrids.forEach(grid => {
      lines.push(`  ${grid.label.toUpperCase()} (H:${grid.swingHigh} L:${grid.swingLow} ${grid.direction}):`)

      // Show key levels only — near current price or at round fib numbers
      const keyFibs = grid.levels.filter(l =>
        l.isNear || ['0.382', '0.5', '0.618', '0.786', '1.272 ext', '1.618 ext'].includes(l.label)
      )
      keyFibs.forEach(l => {
        const marker = l.isNear ? ' ← PRICE HERE' : ''
        lines.push(`    ${l.label} = ${l.price} (${l.position})${marker}`)
      })

      if (grid.nearestLevel) {
        lines.push(`  ⚡ Price at/near ${grid.label} ${grid.nearestLevel.label} fib (${grid.nearestLevel.price}) — key S/R`)
      }
    })
  }

  // Structure summary
  const highConf = patterns.filter(p => p.confidence === 'HIGH')
  let structureSummary = ''
  if (highConf.length > 0) {
    const bearish = highConf.filter(p => p.direction === 'BEARISH')
    const bullish = highConf.filter(p => p.direction === 'BULLISH')
    if (bearish.length > bullish.length) {
      structureSummary = `High-confidence bearish pattern(s): ${bearish.map(p => p.name).join(', ')}. Lean short bias on patterns.`
    } else if (bullish.length > bearish.length) {
      structureSummary = `High-confidence bullish pattern(s): ${bullish.map(p => p.name).join(', ')}. Lean long bias on patterns.`
    } else {
      structureSummary = 'Mixed signals from patterns — wait for confirmation.'
    }
  }

  return {
    patterns,
    fibGrids,
    trendBias,
    structureSummary,
    aiContext: lines.join('\n'),
  }
}
