/**
 * Volume Profile — Point of Control (POC) + Value Area
 *
 * Calculates where the most volume traded during a session.
 * POC = price level with the highest traded volume (strongest S/R)
 * VAH = top of value area (70% of volume)
 * VAL = bottom of value area (70% of volume)
 *
 * Uses 5-min SPX bars with volume. Buckets price into 1-point increments.
 */

export interface VolumeProfileResult {
  poc:          number        // Point of Control — highest volume price
  vah:          number        // Value Area High (70% of volume above POC)
  val:          number        // Value Area Low (70% of volume below POC)
  valueAreaPct: number        // % of day's volume in value area (should be ~70%)
  totalVolume:  number        // total volume traded today
  priceRange:   { high: number; low: number }
  buckets:      Array<{ price: number; volume: number; pct: number }>  // top 10 by volume
  allBuckets:   Array<{ price: number; volume: number; pct: number }>  // ALL buckets for visual rendering
  currentPrice: number   // current price for the visual marker
  aiContext:    string
  signal:       string
}

export function calculateVolumeProfile(
  candles: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>,
  bucketSize = 1  // 1 SPX point per bucket
): VolumeProfileResult | null {
  if (!candles?.length) return null

  // Filter to current session (9:30am-4pm ET)
  const session = candles.filter(c => {
    const et = new Date(c.t).toLocaleString('en-US', { timeZone: 'America/New_York' })
    const h  = new Date(et).getHours()
    const m  = new Date(et).getMinutes()
    const mins = h * 60 + m
    return mins >= 570 && mins <= 960  // 9:30-4:00pm
  })

  if (session.length < 3) return null

  // Build price buckets — assign each candle's volume to price levels
  const volMap: Record<number, number> = {}

  for (const bar of session) {
    const vol  = bar.v || 1
    const low  = Math.floor(bar.l / bucketSize) * bucketSize
    const high = Math.ceil(bar.h / bucketSize)  * bucketSize
    const numBuckets = Math.max(1, (high - low) / bucketSize)

    // Distribute volume evenly across the bar's price range
    for (let price = low; price <= high; price += bucketSize) {
      const bucket = Math.round(price)
      volMap[bucket] = (volMap[bucket] || 0) + (vol / numBuckets)
    }
  }

  if (!Object.keys(volMap).length) return null

  // Sort buckets by price
  const sorted = Object.entries(volMap)
    .map(([price, volume]) => ({ price: parseFloat(price), volume }))
    .sort((a, b) => a.price - b.price)

  const totalVolume = sorted.reduce((s, b) => s + b.volume, 0)

  // POC = highest volume bucket
  const poc = sorted.reduce((max, b) => b.volume > max.volume ? b : max, sorted[0])

  // Value Area — 70% of total volume centered on POC
  const targetVol   = totalVolume * 0.70
  let   areaVol     = poc.volume
  let   upperIdx    = sorted.findIndex(b => b.price === poc.price)
  let   lowerIdx    = upperIdx

  // Expand value area upward and downward, taking the side with more volume each step
  while (areaVol < targetVol) {
    const nextUp   = upperIdx + 1 < sorted.length ? sorted[upperIdx + 1].volume : 0
    const nextDown = lowerIdx - 1 >= 0            ? sorted[lowerIdx - 1].volume : 0
    if (nextUp === 0 && nextDown === 0) break
    if (nextUp >= nextDown) { upperIdx++; areaVol += nextUp }
    else                    { lowerIdx--; areaVol += nextDown }
  }

  const vah = sorted[upperIdx].price
  const val = sorted[lowerIdx].price
  const valueAreaPct = Math.round(areaVol / totalVolume * 100)

  // Price range
  const prices = session.flatMap(c => [c.h, c.l])
  const dayHigh = Math.max(...prices)
  const dayLow  = Math.min(...prices)
  const currPrice = session[session.length - 1].c

  // ALL buckets sorted high-to-low for the visual profile chart
  const allBuckets = sorted
    .map(b => ({
      price: b.price,
      volume: Math.round(b.volume),
      pct: Math.round(b.volume / totalVolume * 100 * 10) / 10,
    }))
    .sort((a, b) => b.price - a.price)

  // Top 10 buckets by volume for legacy display
  const top10 = [...sorted]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map(b => ({ ...b, pct: Math.round(b.volume / totalVolume * 100) }))
    .sort((a, b) => b.price - a.price)

  // Signal interpretation
  const abovePoc  = currPrice > poc.price
  const inValue   = currPrice >= val && currPrice <= vah
  const nearPoc   = Math.abs(currPrice - poc.price) <= 3

  let signal = `POC: ${poc.price.toFixed(0)} | VAH: ${vah.toFixed(0)} | VAL: ${val.toFixed(0)}`

  let interpretation = ''
  if (nearPoc) {
    interpretation = `Price at POC (${poc.price.toFixed(0)}) — highest volume node, expect consolidation or strong reaction`
  } else if (currPrice > vah) {
    interpretation = `Price above value area (VAH ${vah.toFixed(0)}) — breakout mode, thin volume above, moves can extend quickly`
  } else if (currPrice < val) {
    interpretation = `Price below value area (VAL ${val.toFixed(0)}) — breakdown mode, thin volume below, watch for snapback to VAL`
  } else if (abovePoc) {
    interpretation = `Price in value area above POC (${poc.price.toFixed(0)}) — mild bullish bias, POC is first support`
  } else {
    interpretation = `Price in value area below POC (${poc.price.toFixed(0)}) — mild bearish bias, POC is first resistance`
  }

  const aiContext = [
    `VOLUME PROFILE (today):`,
    `  POC: ${poc.price.toFixed(0)} (highest volume — strongest S/R level)`,
    `  Value Area: ${val.toFixed(0)}–${vah.toFixed(0)} (70% of today's volume)`,
    `  Day range: ${dayLow.toFixed(0)}–${dayHigh.toFixed(0)} | Current: ${currPrice.toFixed(0)}`,
    `  Position: ${interpretation}`,
    `  Use POC as: entry anchor, stop reference, and key S/R for targets`,
  ].join('\n')

  return {
    poc:          parseFloat(poc.price.toFixed(1)),
    vah:          parseFloat(vah.toFixed(1)),
    val:          parseFloat(val.toFixed(1)),
    valueAreaPct,
    totalVolume:  Math.round(totalVolume),
    priceRange:   { high: parseFloat(dayHigh.toFixed(1)), low: parseFloat(dayLow.toFixed(1)) },
    buckets:      top10,
    allBuckets,
    currentPrice: parseFloat(currPrice.toFixed(1)),
    aiContext,
    signal:       `${signal} | ${interpretation}`,
  }
}
