/**
 * marketMicrostructure.ts — Real-time market microstructure analysis
 *
 * Synthesizes signals the AI can use to assess breakout probability:
 *
 * 1. Cumulative Delta — buying vs selling pressure from bar structure
 *    (close > open = buyers winning that bar, accumulate across last N bars)
 *
 * 2. Dark Pool Block Scanner — UW dark pool prints filtered for:
 *    - SPY, QQQ, IWM (broad market proxies)
 *    - Premium > $500K notional
 *    - Above ask (aggressive buy) or below bid (aggressive sell)
 *
 * 3. Volume Spike Detection — 1-min bars vs rolling 20-bar average
 *    Flags when current bar volume is 2x+ the recent average
 *
 * 4. Options Order Imbalance — ratio of ask-side vs bid-side premium
 *    in the recent flow alerts (smart money directional indicator)
 *
 * Output: structured text injected into AI signal + companion prompts
 */

export interface Bar {
  t: number; o: number; h: number; l: number; c: number; v: number; vw?: number
}

export interface DarkPoolPrint {
  ticker:      string
  size:        number
  price:       string
  premium?:    string
  nbbo_bid?:   string
  nbbo_ask?:   string
  executed_at: string
  canceled?:   boolean
}

export interface FlowAlert {
  ticker:             string
  total_premium?:     string
  total_ask_side_prem?: string
  total_bid_side_prem?: string
  has_sweep?:         boolean
  has_floor?:         boolean
  type?:              string
  strike?:            string
  expiry?:            string
  underlying_price?:  string
  created_at?:        string
}

export interface MicrostructureResult {
  cumulativeDelta: {
    value:      number    // positive = net buying, negative = net selling
    pct:        number    // % of bars that were bullish (close > open)
    strength:   'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
    bars:       number    // how many bars analyzed
  }
  darkPool: {
    prints:     DarkPoolSummary[]
    netBias:    'BUY' | 'SELL' | 'NEUTRAL'
    totalBuyNotional:  number
    totalSellNotional: number
  }
  volumeSpike: {
    detected:    boolean
    currentVol:  number
    avgVol:      number
    multiplier:  number
    direction:   'UP' | 'DOWN' | 'FLAT'
  } | null
  optionsImbalance: {
    askSidePrem:  number   // $ buying pressure
    bidSidePrem:  number   // $ selling pressure
    ratio:        number   // >1 = buyers, <1 = sellers
    bias:         'CALL_HEAVY' | 'PUT_HEAVY' | 'BALANCED'
    sweepCount:   number
    floorCount:   number
  }
  aiContext:        string
  summary:          string
}

interface DarkPoolSummary {
  ticker:    string
  notional:  number
  side:      'BUY' | 'SELL' | 'NEUTRAL'
  price:     number
  vsNBBO:    string  // "above ask" | "below bid" | "at mid"
  time:      string
}

// ── Cumulative Delta ──────────────────────────────────────────────────────────

export function computeCumulativeDelta(bars: Bar[]): MicrostructureResult['cumulativeDelta'] {
  if (!bars.length) return { value: 0, pct: 50, strength: 'NEUTRAL', bars: 0 }

  let bullBars = 0
  let delta = 0

  bars.forEach(bar => {
    const range = bar.h - bar.l
    if (!range || range < 0.01) return

    const vol = bar.v || 0
    if (!vol || !isFinite(vol)) return

    if (bar.c > bar.o) {
      const buyPct = Math.min(1, Math.max(0, (bar.c - bar.l) / range))
      if (isFinite(buyPct)) { delta += vol * (buyPct - 0.5) * 2; bullBars++ }
    } else if (bar.c < bar.o) {
      const sellPct = Math.min(1, Math.max(0, (bar.h - bar.c) / range))
      if (isFinite(sellPct)) delta -= vol * (sellPct - 0.5) * 2
    }
  })

  const pct = Math.round((bullBars / bars.length) * 100)

  let strength: MicrostructureResult['cumulativeDelta']['strength']
  if (pct >= 70 && delta > 0)       strength = 'STRONG_BUY'
  else if (pct >= 55 && delta > 0)  strength = 'BUY'
  else if (pct <= 30 && delta < 0)  strength = 'STRONG_SELL'
  else if (pct <= 45 && delta < 0)  strength = 'SELL'
  else                               strength = 'NEUTRAL'

  return { value: Math.round(delta), pct, strength, bars: bars.length }
}

// ── Dark Pool Analysis ────────────────────────────────────────────────────────

// Broad market proxies — index ETFs and leveraged versions
const MARKET_PROXIES = new Set(['SPY', 'QQQ', 'IWM', 'SPX', 'SPXW', 'ES', 'NQ',
  'SSO', 'UPRO', 'SDS', 'SPXS', 'SPXU', 'QLD', 'TQQQ', 'SQQQ',
  'XLF', 'XLE', 'XLK', 'XLY', 'GLD', 'TLT', 'HYG', 'VIX'])
const MIN_NOTIONAL   = 250_000  // $250K minimum — lower to catch more blocks

export function analyzeDarkPool(prints: DarkPoolPrint[]): MicrostructureResult['darkPool'] {
  const summaries: DarkPoolSummary[] = []
  let totalBuy = 0, totalSell = 0

  // Filter: market proxies only, no cancels, minimum size
  const relevant = prints.filter(p =>
    MARKET_PROXIES.has(p.ticker) &&
    !p.canceled &&
    p.size * parseFloat(p.price) >= MIN_NOTIONAL
  )

  relevant.forEach(p => {
    const price    = parseFloat(p.price)
    const ask      = parseFloat(p.nbbo_ask || '0')
    const bid      = parseFloat(p.nbbo_bid || '0')
    const notional = p.size * price
    const prem     = parseFloat(p.premium || '0')

    // Aggressor detection: price vs NBBO
    let side: DarkPoolSummary['side'] = 'NEUTRAL'
    let vsNBBO = 'at mid'

    if (ask > 0 && price >= ask * 0.9999) {
      side = 'BUY'
      vsNBBO = 'above ask (aggressive buy)'
      totalBuy += notional
    } else if (bid > 0 && price <= bid * 1.0001) {
      side = 'SELL'
      vsNBBO = 'below bid (aggressive sell)'
      totalSell += notional
    } else {
      // Mid print — neutral, slight buy bias if premium positive
      vsNBBO = 'at mid'
      if (prem > 0) totalBuy += notional * 0.3
      else totalSell += notional * 0.3
    }

    summaries.push({
      ticker:   p.ticker,
      notional: Math.round(notional),
      side,
      price,
      vsNBBO,
      time: new Date(p.executed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
    })
  })

  const netBias: 'BUY' | 'SELL' | 'NEUTRAL' =
    totalBuy > totalSell * 1.3  ? 'BUY'  :
    totalSell > totalBuy * 1.3  ? 'SELL' : 'NEUTRAL'

  return { prints: summaries, netBias, totalBuyNotional: Math.round(totalBuy), totalSellNotional: Math.round(totalSell) }
}

// ── Volume Spike ──────────────────────────────────────────────────────────────

export function detectVolumeSpike(bars: Bar[]): MicrostructureResult['volumeSpike'] {
  if (bars.length < 5) return null

  const currentBar = bars[bars.length - 1]
  const lookback   = bars.slice(-21, -1)  // prior 20 bars
  const avgVol     = lookback.reduce((s, b) => s + b.v, 0) / lookback.length

  if (avgVol === 0) return null

  const multiplier = currentBar.v / avgVol
  if (multiplier < 1.5) return null  // not a spike

  const direction: 'UP' | 'DOWN' | 'FLAT' =
    currentBar.c > currentBar.o ? 'UP'  :
    currentBar.c < currentBar.o ? 'DOWN' : 'FLAT'

  return {
    detected:   true,
    currentVol: Math.round(currentBar.v),
    avgVol:     Math.round(avgVol),
    multiplier: parseFloat(multiplier.toFixed(1)),
    direction,
  }
}

// ── Options Order Imbalance ───────────────────────────────────────────────────

export function computeOptionsImbalance(alerts: FlowAlert[]): MicrostructureResult['optionsImbalance'] {
  let askPrem = 0, bidPrem = 0, sweeps = 0, floors = 0

  alerts.forEach(a => {
    const ask = parseFloat(a.total_ask_side_prem || '0')
    const bid = parseFloat(a.total_bid_side_prem || '0')
    const total = parseFloat(a.total_premium || '0')

    askPrem += ask
    bidPrem += bid
    if (a.has_sweep) sweeps++
    if (a.has_floor) floors++
  })

  const ratio = bidPrem > 0 ? askPrem / bidPrem : askPrem > 0 ? 99 : 1
  const bias: 'CALL_HEAVY' | 'PUT_HEAVY' | 'BALANCED' =
    ratio > 1.3  ? 'CALL_HEAVY' :
    ratio < 0.77 ? 'PUT_HEAVY'  : 'BALANCED'

  return {
    askSidePrem: Math.round(askPrem),
    bidSidePrem: Math.round(bidPrem),
    ratio:       parseFloat(ratio.toFixed(2)),
    bias,
    sweepCount:  sweeps,
    floorCount:  floors,
  }
}

// ── Master analysis function ──────────────────────────────────────────────────

export function analyzeMicrostructure(
  bars5m:     Bar[],
  bars1m:     Bar[],
  darkPool:   DarkPoolPrint[],
  flowAlerts: FlowAlert[],
): MicrostructureResult {
  const delta      = computeCumulativeDelta(bars5m.slice(-20))
  const dp         = analyzeDarkPool(darkPool)
  const volSpike   = detectVolumeSpike(bars1m.length >= 5 ? bars1m : bars5m)
  const optImbal   = computeOptionsImbalance(flowAlerts.slice(0, 20))

  // ── Build AI context string ────────────────────────────────────────────────
  const lines: string[] = []

  // Cumulative delta
  lines.push('CUMULATIVE DELTA (last 20 bars):')
  const deltaDir = delta.value >= 0 ? '▲' : '▼'
  lines.push(`  ${delta.strength} — ${delta.pct}% bullish bars, net delta ${deltaDir}${Math.abs(delta.value).toLocaleString()}`)
  if (delta.strength === 'STRONG_BUY')  lines.push('  → Buyers consistently in control. Supports LONG bias.')
  if (delta.strength === 'STRONG_SELL') lines.push('  → Sellers consistently in control. Supports SHORT bias.')
  if (delta.strength === 'NEUTRAL')     lines.push('  → No clear directional pressure. Caution on breakout trades.')

  lines.push('')

  // Options imbalance
  lines.push('OPTIONS ORDER FLOW IMBALANCE:')
  const biasColor = optImbal.bias === 'CALL_HEAVY' ? 'bullish' : optImbal.bias === 'PUT_HEAVY' ? 'bearish' : 'neutral'
  const fmtM = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : `$${(n/1_000).toFixed(0)}K`
  lines.push(`  ${optImbal.bias} — Ask side: ${fmtM(optImbal.askSidePrem)} | Bid side: ${fmtM(optImbal.bidSidePrem)} | Ratio: ${optImbal.ratio}x`)
  lines.push(`  Sweeps: ${optImbal.sweepCount} | Floor prints: ${optImbal.floorCount}`)
  lines.push(`  → Order flow is ${biasColor} (${optImbal.ratio}x ask/bid ratio)`)

  lines.push('')

  // Dark pool
  // If no proxy blocks, show top 3 largest blocks of any ticker for context
  const allBlocks = darkPool.filter((p: DarkPoolPrint) => !p.canceled && p.size * parseFloat(p.price) >= 250_000)
    .map((p: DarkPoolPrint) => ({
      ...p, notional: p.size * parseFloat(p.price)
    })).sort((a: any, b: any) => b.notional - a.notional).slice(0, 3)

  if (dp.prints.length > 0 || allBlocks.length > 0) {
    lines.push('DARK POOL BLOCKS (broad market $250K+):')
    lines.push(`  Net bias: ${dp.netBias} | Buy: ${fmtM(dp.totalBuyNotional)} | Sell: ${fmtM(dp.totalSellNotional)}`)
    const toShow = dp.prints.length > 0 ? dp.prints.slice(0, 3) : allBlocks.map((b: any) => ({
      ticker: b.ticker, notional: b.notional, side: 'NEUTRAL' as const,
      price: parseFloat(b.price), vsNBBO: 'block print',
      time: new Date(b.executed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
    }))
    toShow.forEach((p: any) => {
      lines.push(`  ${p.time} ${p.ticker} ${fmtM(p.notional)} ${p.vsNBBO} @ $${p.price.toFixed ? p.price.toFixed(2) : p.price}`)
    })
  } else {
    lines.push('DARK POOL: No significant blocks detected in market proxies recently.')
  }

  lines.push('')

  // Volume spike
  if (volSpike?.detected) {
    lines.push(`VOLUME SPIKE DETECTED: ${volSpike.multiplier}x avg volume, direction ${volSpike.direction}`)
    lines.push(`  ${volSpike.currentVol.toLocaleString()} vs avg ${volSpike.avgVol.toLocaleString()} — elevated institutional activity`)
  }

  // Summary for AI
  const signals: string[] = []
  if (delta.strength === 'STRONG_BUY' || delta.strength === 'BUY') signals.push('bullish delta')
  if (delta.strength === 'STRONG_SELL' || delta.strength === 'SELL') signals.push('bearish delta')
  if (optImbal.bias === 'CALL_HEAVY') signals.push('call-heavy flow')
  if (optImbal.bias === 'PUT_HEAVY') signals.push('put-heavy flow')
  if (dp.netBias === 'BUY') signals.push('dark pool buying')
  if (dp.netBias === 'SELL') signals.push('dark pool selling')
  if (volSpike?.detected) signals.push(`${volSpike.multiplier}x volume spike (${volSpike.direction})`)

  const bullish = signals.filter(s => s.includes('bull') || s.includes('call') || s.includes('buy')).length
  const bearish = signals.filter(s => s.includes('bear') || s.includes('put') || s.includes('sell')).length

  let summary: string
  if (bullish > bearish + 1)      summary = `Microstructure BULLISH: ${signals.join(', ')}.`
  else if (bearish > bullish + 1) summary = `Microstructure BEARISH: ${signals.join(', ')}.`
  else if (signals.length === 0)  summary = 'Microstructure NEUTRAL: No strong directional signals.'
  else                            summary = `Microstructure MIXED: ${signals.join(', ')} — wait for confirmation.`

  return {
    cumulativeDelta: delta,
    darkPool:        dp,
    volumeSpike:     volSpike,
    optionsImbalance: optImbal,
    aiContext:       lines.join('\n'),
    summary,
  }
}
