/**
 * /api/breadth — Real-time market breadth: TICK, TRIN, VVIX
 *
 * TICK:  NYSE Tick Index — number of stocks last-traded on uptick minus downtick
 *        > +800 = broad buying, < -800 = broad selling, ±1000 = extreme
 * TRIN:  Arms Index — ratio of advancing/declining stocks vs advancing/declining volume
 *        < 0.75 = strong buying, > 1.25 = strong selling, > 2.0 = capitulation
 * VVIX:  VIX of VIX — volatility of volatility (how uncertain is volatility itself)
 *        < 80 = calm, 80-100 = normal, 100-120 = elevated, > 120 = extreme fear
 *
 * All three are available on Polygon Indices Advanced plan.
 * Returns current values + regime classification + AI-ready summary.
 */

import { NextRequest, NextResponse } from 'next/server'

const POLY_KEY = process.env.POLYGON_API_KEY

async function fetchBars(ticker: string, multiplier: number, timespan: string, limit: number) {
  const to   = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
  const url  = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=desc&limit=${limit}&apiKey=${POLY_KEY}`
  const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
  const data = await res.json()
  return data.results || []
}

function classifyTick(tick: number): { regime: string; bias: string; note: string } {
  if (tick > 1000)  return { regime: 'EXTREME_BUY',  bias: 'BULLISH', note: 'Extreme broad buying — institutional accumulation' }
  if (tick > 800)   return { regime: 'STRONG_BUY',   bias: 'BULLISH', note: 'Strong broad buying across NYSE' }
  if (tick > 400)   return { regime: 'MODERATE_BUY', bias: 'BULLISH', note: 'Moderate buying breadth' }
  if (tick > -400)  return { regime: 'NEUTRAL',       bias: 'NEUTRAL', note: 'Mixed breadth — no clear directional pressure' }
  if (tick > -800)  return { regime: 'MODERATE_SELL', bias: 'BEARISH', note: 'Moderate selling breadth' }
  if (tick > -1000) return { regime: 'STRONG_SELL',   bias: 'BEARISH', note: 'Strong broad selling across NYSE' }
  return              { regime: 'EXTREME_SELL',  bias: 'BEARISH', note: 'Extreme broad selling — institutional distribution' }
}

function classifyTrin(trin: number): { regime: string; bias: string; note: string } {
  if (trin < 0.50)  return { regime: 'EXTREME_BUY',  bias: 'BULLISH', note: 'Extremely bullish — volume heavily in advancing stocks' }
  if (trin < 0.75)  return { regime: 'STRONG_BUY',   bias: 'BULLISH', note: 'Strong buying — volume favors advancers' }
  if (trin < 1.25)  return { regime: 'NEUTRAL',       bias: 'NEUTRAL', note: 'Balanced volume between advancers and decliners' }
  if (trin < 2.00)  return { regime: 'STRONG_SELL',   bias: 'BEARISH', note: 'Selling pressure — volume favors decliners' }
  return              { regime: 'CAPITULATION',  bias: 'BEARISH', note: 'Capitulation — panic selling, possible exhaustion reversal' }
}

function classifyVvix(vvix: number): { regime: string; note: string } {
  if (vvix < 80)   return { regime: 'CALM',     note: 'Volatility expectations stable — trending environment' }
  if (vvix < 100)  return { regime: 'NORMAL',   note: 'Normal volatility uncertainty' }
  if (vvix < 120)  return { regime: 'ELEVATED', note: 'Elevated vol-of-vol — signals become less reliable' }
  return             { regime: 'EXTREME',   note: 'Extreme uncertainty — high false signal risk, reduce size' }
}

export async function GET(req: NextRequest) {
  try {
    const [tickBars, trinBars, vvixBars] = await Promise.all([
      fetchBars('I:TICK', 1, 'minute', 10),
      fetchBars('I:TRIN', 5, 'minute', 5),
      fetchBars('I:VVIX', 5, 'minute', 5),
    ])

    const tickVal  = tickBars[0]?.c  ?? null
    const tickHigh = tickBars.slice(0, 10).reduce((m: number, b: any) => Math.max(m, b.h || 0), -9999)
    const tickLow  = tickBars.slice(0, 10).reduce((m: number, b: any) => Math.min(m, b.l || 9999), 9999)
    const trinVal  = trinBars[0]?.c  ?? null
    const vvixVal  = vvixBars[0]?.c  ?? null

    const tickClass = tickVal !== null ? classifyTick(tickVal) : null
    const trinClass = trinVal !== null ? classifyTrin(trinVal) : null
    const vvixClass = vvixVal !== null ? classifyVvix(vvixVal) : null

    // Build AI-ready summary
    const lines: string[] = ['MARKET BREADTH & VOLATILITY:']

    if (tickVal !== null && tickClass) {
      lines.push(`  TICK: ${tickVal > 0 ? '+' : ''}${tickVal.toFixed(0)} [${tickClass.regime}] — ${tickClass.note}`)
      lines.push(`  TICK range last 10min: H:${tickHigh > 0 ? '+' : ''}${tickHigh} / L:${tickLow > 0 ? '+' : ''}${tickLow}`)
    }

    if (trinVal !== null && trinClass) {
      lines.push(`  TRIN: ${trinVal.toFixed(2)} [${trinClass.regime}] — ${trinClass.note}`)
    }

    if (vvixVal !== null && vvixClass) {
      lines.push(`  VVIX: ${vvixVal.toFixed(1)} [${vvixClass.regime}] — ${vvixClass.note}`)
    }

    // Consensus
    const bullishCount = [tickClass?.bias === 'BULLISH', trinClass?.bias === 'BULLISH'].filter(Boolean).length
    const bearishCount = [tickClass?.bias === 'BEARISH', trinClass?.bias === 'BEARISH'].filter(Boolean).length

    const consensus = bullishCount > bearishCount ? 'BULLISH'
                    : bearishCount > bullishCount ? 'BEARISH'
                    : 'MIXED'

    lines.push(`  BREADTH CONSENSUS: ${consensus}`)
    if (vvixClass?.regime === 'EXTREME' || vvixClass?.regime === 'ELEVATED') {
      lines.push(`  ⚠ VVIX elevated — treat all signals with lower confidence`)
    }

    return NextResponse.json({
      tick:  { value: tickVal,  high10m: tickHigh, low10m: tickLow, ...tickClass },
      trin:  { value: trinVal,  ...trinClass },
      vvix:  { value: vvixVal,  ...vvixClass },
      consensus,
      aiContext: lines.join('\n'),
      updatedAt: new Date().toISOString(),
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
