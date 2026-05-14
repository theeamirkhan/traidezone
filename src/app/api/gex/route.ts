/**
 * /api/gex — Dealer Gamma Exposure via FlashAlpha API
 *
 * Uses FlashAlpha free tier (5 req/day) — GEX updates EOD so once/day is enough.
 * SPY on free tier. SPX requires Basic ($79/mo).
 *
 * Returns: gamma_flip, call_wall, put_wall, net_gex, regime, AI context string.
 * Cached daily — fetch once pre-market, use all day.
 *
 * Env var: FLASHALPHA_API_KEY
 * Sign up free at: flashalpha.com (no credit card, 30 seconds)
 */

import { NextRequest, NextResponse } from 'next/server'

const FA_BASE = 'https://lab.flashalpha.com'

// In-memory daily cache
let gexCache:    { data: GexResult; date: string } | null = null
let levelsCache: { data: any; date: string } | null = null

interface GexResult {
  symbol:      string
  gammaFlip:   number | null
  callWall:    number | null
  putWall:     number | null
  netGex:      number | null
  regime:      'positive' | 'negative' | 'neutral' | 'unknown'
  source:      string
  aiContext:   string
  updatedAt:   string
}

async function fetchFlashAlpha(path: string): Promise<any> {
  const FA_KEY = process.env.FLASHALPHA_API_KEY
  if (!FA_KEY) throw new Error('FLASHALPHA_API_KEY not configured')
  const res = await fetch(`${FA_BASE}${path}`, {
    headers: { 'X-Api-Key': FA_KEY, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`FlashAlpha HTTP ${res.status}`)
  return res.json()
}

function buildAiContext(result: GexResult, currentPrice?: number): string {
  const lines: string[] = ['DEALER GAMMA EXPOSURE (GEX):']

  const gexBn = result.netGex !== null
    ? `${result.netGex >= 0 ? '+' : ''}$${(result.netGex / 1e9).toFixed(1)}B`
    : 'unavailable'

  lines.push(`  Symbol: ${result.symbol} | Net GEX: ${gexBn} | Regime: ${result.regime.toUpperCase()} GAMMA`)

  if (result.gammaFlip !== null) {
    const aboveFlip = currentPrice ? (currentPrice > result.gammaFlip ? 'ABOVE' : 'BELOW') : ''
    lines.push(`  Gamma Flip: ${result.gammaFlip} ${aboveFlip ? `(price is ${aboveFlip} flip)` : ''}`)
  }
  if (result.callWall !== null) lines.push(`  Call Wall: ${result.callWall} — dealer resistance ceiling`)
  if (result.putWall !== null)  lines.push(`  Put Wall:  ${result.putWall} — dealer support floor`)

  if (result.regime === 'positive') {
    lines.push(`  REGIME IMPLICATION: Dealers BUY dips / SELL rallies → range-bound, mean-reverting market.`)
    lines.push(`  Breakouts need high volume to sustain. Fade moves toward call/put walls.`)
    if (result.callWall && result.putWall) {
      lines.push(`  Expected range: ${result.putWall}–${result.callWall}`)
    }
  } else if (result.regime === 'negative') {
    lines.push(`  REGIME IMPLICATION: Dealers SELL dips / BUY rallies → trending, amplified moves.`)
    lines.push(`  Breakouts more likely to run. Don't fade too early. Size normal or larger.`)
    if (result.gammaFlip) lines.push(`  Key level: ${result.gammaFlip} gamma flip — if price reclaims, vol compresses.`)
  } else {
    lines.push(`  REGIME IMPLICATION: Neutral gamma — no strong structural bias from dealer hedging.`)
  }

  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const currentPrice = parseFloat(req.nextUrl.searchParams.get('price') || '0') || undefined

  // Serve from cache if same trading day AND we have a key (don't serve stale no-key cache)
  if (gexCache?.date === today && gexCache?.data?.source !== 'no_key' && gexCache?.data?.source !== 'vix_heuristic') {
    const cached = { ...gexCache.data, aiContext: buildAiContext(gexCache.data, currentPrice) }
    return NextResponse.json(cached)
  }

  // No API key configured
  const FA_KEY = process.env.FLASHALPHA_API_KEY
  if (!FA_KEY) {
    const fallback: GexResult = {
      symbol: 'SPY', gammaFlip: null, callWall: null, putWall: null,
      netGex: null, regime: 'unknown', source: 'no_key',
      aiContext: buildVixHeuristic(),
      updatedAt: new Date().toISOString(),
    }
    return NextResponse.json(fallback)
  }

  try {
    // Try SPX first (requires Basic plan), fall back to SPY (free)
    let gexData: any = null
    let symbol = 'SPX'

    try {
      // Use levels endpoint — returns gamma_flip, call_wall, put_wall in one call
      const levels = await fetchFlashAlpha('/v1/exposure/levels/SPX')
      const gex    = await fetchFlashAlpha('/v1/exposure/gex/SPX')
      gexData = { ...gex, ...levels.levels, _symbol: 'SPX' }
    } catch {
      // Fallback to SPY on free tier
      symbol = 'SPY'
      const levels = await fetchFlashAlpha('/v1/exposure/levels/SPY')
      const gex    = await fetchFlashAlpha('/v1/exposure/gex/SPY')
      gexData = { ...gex, ...levels.levels, _symbol: 'SPY' }
    }

    const result: GexResult = {
      symbol:    gexData._symbol || symbol,
      gammaFlip: gexData.gamma_flip ?? gexData.levels?.gamma_flip ?? null,
      callWall:  gexData.call_wall  ?? gexData.levels?.call_wall  ?? gexData.call_wall?.strike ?? null,
      putWall:   gexData.put_wall   ?? gexData.levels?.put_wall   ?? gexData.put_wall?.strike  ?? null,
      netGex:    gexData.net_gex    ?? null,
      regime:    (gexData.net_gex_label ?? gexData.regime ?? 'unknown') as GexResult['regime'],
      source:    'flashalpha',
      aiContext: '',
      updatedAt: gexData.updated_at ?? new Date().toISOString(),
    }

    result.aiContext = buildAiContext(result, currentPrice)
    gexCache = { data: result, date: today }
    return NextResponse.json(result)

  } catch (e: any) {
    // FlashAlpha failed — use VIX heuristic fallback
    const fallback: GexResult = {
      symbol: 'SPY', gammaFlip: null, callWall: null, putWall: null,
      netGex: null, regime: 'unknown',
      source: 'vix_heuristic',
      aiContext: buildVixHeuristic(),
      updatedAt: new Date().toISOString(),
    }
    console.warn('[GEX] FlashAlpha failed:', e.message, '— using VIX heuristic')
    gexCache = { data: fallback, date: today }
    return NextResponse.json(fallback)
  }
}

function buildVixHeuristic(): string {
  return [
    'DEALER GAMMA EXPOSURE (GEX):',
    '  Source: VIX heuristic (FlashAlpha API key not configured)',
    '  VIX < 15 → likely positive gamma (range-bound, fade edges)',
    '  VIX 15-20 → transitional gamma (watch gamma flip level)',
    '  VIX > 20 → likely negative gamma (amplified moves, trend days)',
    '  Add FLASHALPHA_API_KEY to Vercel env for real GEX levels.',
  ].join('\n')
}
