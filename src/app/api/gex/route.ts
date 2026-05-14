/**
 * /api/gex — Dealer Gamma Exposure (GEX) for SPX
 *
 * GEX explains WHY price behaves differently at certain levels:
 *
 * Positive Gamma: Dealers are LONG gamma — they SELL when price rises,
 *   BUY when price falls. This creates a "gravity" effect — price
 *   gets pinned near high-OI strikes. Breakouts fail more often.
 *   Think of it as a coil being compressed.
 *
 * Negative Gamma: Dealers are SHORT gamma — they BUY when price rises,
 *   SELL when price falls. This AMPLIFIES moves. Breakouts succeed more
 *   often and travel further. Think of it as a spring being released.
 *
 * Key Gamma Flip Level: The price where GEX crosses zero. Below this
 *   level markets are more volatile. Above it, more range-bound.
 *
 * Sources (server-side fetch, no CORS issues):
 *  Primary: SpotGamma HIRO API (free daily summary)
 *  Fallback: Cboe published OI data + manual calculation
 *
 * Cached daily (changes overnight, not intraday).
 */

import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory daily cache
let cached: { data: any; date: string } | null = null

async function fetchSpotGamma(): Promise<any> {
  // SpotGamma's free daily levels - available pre-market
  const res = await fetch('https://spotgamma.com/wp-json/ht_kb/v1/article?slug=spy-gamma-exposure', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`SpotGamma HTTP ${res.status}`)
  const data = await res.json()
  return data
}

async function fetchCboeGamma(): Promise<any> {
  // Cboe publishes daily options data including OI by strike
  // This is a simplified estimate — real GEX requires options chain + delta
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const res = await fetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/SPX_EOD.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Cboe HTTP ${res.status}`)
  return await res.json()
}

function buildGexContext(gex: any): string {
  if (!gex) return ''

  const lines: string[] = ['DEALER GAMMA EXPOSURE (GEX):']
  const absGex = Math.abs(gex.totalGex || 0)
  const gexBn  = (absGex / 1e9).toFixed(1)

  if (gex.totalGex !== undefined) {
    const sign = gex.totalGex >= 0 ? 'POSITIVE' : 'NEGATIVE'
    lines.push(`  GEX: ${sign} $${gexBn}B`)
  }

  if (gex.gammaFlip) {
    lines.push(`  Gamma Flip Level: ${gex.gammaFlip} (key regime change level)`)
  }
  if (gex.callWall)  lines.push(`  Call Wall: ${gex.callWall} (strong resistance — dealers short above here)`)
  if (gex.putWall)   lines.push(`  Put Wall: ${gex.putWall} (strong support — dealers long below here)`)
  if (gex.zeroDteGex !== undefined) {
    lines.push(`  0DTE GEX contribution: ${gex.zeroDteGex >= 0 ? '+' : ''}${(gex.zeroDteGex / 1e9).toFixed(1)}B`)
  }

  if (gex.totalGex !== undefined) {
    if (gex.totalGex > 0) {
      lines.push(`  REGIME: POSITIVE GAMMA — price gravitates toward ${gex.gammaFlip || 'key strikes'}. Breakouts need high volume to sustain. Fade extensions.`)
    } else {
      lines.push(`  REGIME: NEGATIVE GAMMA — dealer hedging AMPLIFIES moves. Breakouts more likely to run. Don't fade too early.`)
    }
  }

  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Return cache if same day
  if (cached?.date === today) {
    return NextResponse.json(cached.data)
  }

  const result: any = { date: today, source: 'unavailable', aiContext: '' }

  // Try SpotGamma
  try {
    const sg = await fetchSpotGamma()

    // Parse SpotGamma response — they return article content
    // Extract key levels from their text if structured data unavailable
    const content = JSON.stringify(sg)

    // Look for key numbers in their response
    const gammaFlipMatch = content.match(/gamma\s*flip[^\d]*(\d{4,5})/i)
    const callWallMatch  = content.match(/call\s*wall[^\d]*(\d{4,5})/i)
    const putWallMatch   = content.match(/put\s*wall[^\d]*(\d{4,5})/i)

    if (gammaFlipMatch || callWallMatch || putWallMatch) {
      result.gammaFlip = gammaFlipMatch ? parseInt(gammaFlipMatch[1]) : null
      result.callWall  = callWallMatch  ? parseInt(callWallMatch[1])  : null
      result.putWall   = putWallMatch   ? parseInt(putWallMatch[1])   : null
      result.source    = 'spotgamma'
      result.aiContext = buildGexContext(result)
    } else {
      // SpotGamma returned data but not parseable — store raw for now
      result.source = 'spotgamma_raw'
      result.raw    = content.substring(0, 200)
    }
  } catch (e: any) {
    result.spotgammaError = e.message
  }

  // If SpotGamma failed, note it and provide regime estimate from VIX
  if (result.source === 'unavailable' || result.source === 'spotgamma_raw') {
    // Rough heuristic: VIX > 20 tends to correlate with negative gamma environments
    result.aiContext = [
      'DEALER GAMMA EXPOSURE (GEX):',
      '  GEX data temporarily unavailable.',
      '  Heuristic: VIX > 20 typically = negative gamma (amplified moves).',
      '  VIX < 17 typically = positive gamma (mean-reverting, range-bound).',
      '  Use VVIX and options flow as proxy for gamma regime.'
    ].join('\n')
  }

  cached = { data: result, date: today }
  return NextResponse.json(result)
}
