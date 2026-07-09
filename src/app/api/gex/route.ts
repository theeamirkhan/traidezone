/**
 * /api/gex — Dealer positioning via FlashAlpha Basic plan
 *
 * Basic plan: 100 req/day, 15-second freshness, SPX/SPY/QQQ
 * Fetches: GEX + levels + DEX/VEX/CHEX (delta/vanna/charm) + max pain
 *
 * Budget: ~20 fetches/day (every 30min market hours = 13 fetches)
 * Each fetch = 4 API calls → 52 calls/day, well within 100 limit
 *
 * Vanna + charm are critical for 0DTE:
 *   Vanna: how delta changes with IV → explains violent intraday reversals
 *   Charm: how delta decays with time → explains end-of-day gamma compression
 *
 * Env var: FLASHALPHA_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server'

const FA_BASE = 'https://lab.flashalpha.com'

// Cache: refresh every 15min during market hours (respects 100/day limit)
let cache: { data: FullGexResult; ts: number } | null = null
const CACHE_MS = 15 * 60 * 1000  // 15 minutes

interface FullGexResult {
  symbol:       string
  // Core GEX
  gammaFlip:    number | null
  callWall:     number | null
  putWall:      number | null
  netGex:       number | null
  regime:       'positive' | 'negative' | 'neutral' | 'unknown'
  // DEX — net dealer delta exposure
  netDex:       number | null
  dexBias:      'LONG' | 'SHORT' | 'NEUTRAL' | null  // dealer delta direction
  // VEX — vanna exposure (delta sensitivity to IV changes)
  netVex:       number | null
  vannaBias:    'AMPLIFYING' | 'SUPPRESSING' | null
  vannaNote:    string | null
  // CHEX — charm exposure (delta decay with time, critical for 0DTE)
  netChex:      number | null
  charmNote:    string | null
  charmUrgency: 'HIGH' | 'MODERATE' | 'LOW' | null
  // Max pain
  maxPain:      number | null
  pinProbability: number | null  // % chance price pins at max pain
  // Meta
  source:       string
  aiContext:    string
  updatedAt:    string
  freshAt:      string
}

async function fa(path: string): Promise<any> {
  const key = process.env.FLASHALPHA_API_KEY
  if (!key) throw new Error('FLASHALPHA_API_KEY not configured')
  const res = await fetch(`${FA_BASE}${path}`, {
    headers: { 'X-Api-Key': key, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`FlashAlpha ${res.status}: ${path}`)
  return res.json()
}

function isMarketHours(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const h  = et.getHours(), m = et.getMinutes()
  const mins = h * 60 + m
  return et.getDay() >= 1 && et.getDay() <= 5 && mins >= 570 && mins <= 960
}

function minsLeftInSession(): number {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const mins = et.getHours() * 60 + et.getMinutes()
  return Math.max(0, 960 - mins)
}

async function fetchAll(symbol = 'SPX'): Promise<FullGexResult> {
  const now = new Date().toISOString()

  // Fetch all 4 endpoints in parallel — 4 API calls per refresh
  const [levelsRes, gexRes, dexvexchexRes, maxpainRes] = await Promise.allSettled([
    fa(`/v1/exposure/levels/${symbol}`),
    fa(`/v1/exposure/gex/${symbol}`),
    fa(`/v1/exposure/dexvexchex/${symbol}`),       // DEX + VEX + CHEX combined
    fa(`/v1/maxpain/${symbol}`),
  ])

  const levels  = levelsRes.status  === 'fulfilled' ? levelsRes.value  : null
  const gex     = gexRes.status     === 'fulfilled' ? gexRes.value     : null
  const dvc     = dexvexchexRes.status === 'fulfilled' ? dexvexchexRes.value : null
  const maxpain = maxpainRes.status === 'fulfilled' ? maxpainRes.value : null

  // Capture WHY calls failed — surfaced via ?debug=1 for diagnosis
  const fetchErrors: string[] = []
  if (levelsRes.status === 'rejected')      fetchErrors.push(`levels: ${levelsRes.reason?.message || levelsRes.reason}`)
  if (gexRes.status === 'rejected')         fetchErrors.push(`gex: ${gexRes.reason?.message || gexRes.reason}`)
  if (dexvexchexRes.status === 'rejected')  fetchErrors.push(`dexvexchex: ${dexvexchexRes.reason?.message || dexvexchexRes.reason}`)
  if (maxpainRes.status === 'rejected')     fetchErrors.push(`maxpain: ${maxpainRes.reason?.message || maxpainRes.reason}`)
  ;(globalThis as any).__gexLastErrors = fetchErrors

  // ── Core GEX levels ───────────────────────────────────────────────────────
  const gammaFlip = levels?.levels?.gamma_flip  ?? levels?.gamma_flip  ?? null
  const callWall  = levels?.levels?.call_wall   ?? levels?.call_wall   ?? null
  const putWall   = levels?.levels?.put_wall    ?? levels?.put_wall    ?? null
  const netGex    = gex?.net_gex ?? null
  const regimeRaw = gex?.net_gex_label ?? gex?.regime ?? (netGex !== null ? (netGex >= 0 ? 'positive' : 'negative') : 'unknown')
  const regime    = ['positive','negative','neutral'].includes(regimeRaw) ? regimeRaw : 'unknown'

  // ── DEX — net dealer delta ────────────────────────────────────────────────
  // Positive DEX = dealers net long delta → they sell into strength (suppressive)
  // Negative DEX = dealers net short delta → they buy into strength (amplifying)
  const netDex = dvc?.net_dex ?? dvc?.dex?.net ?? null
  let dexBias: FullGexResult['dexBias'] = null
  if (netDex !== null) {
    dexBias = netDex > 1e9 ? 'SHORT'    // dealers long → sell into rally
            : netDex < -1e9 ? 'LONG'    // dealers short → buy into dip
            : 'NEUTRAL'
  }

  // ── VEX — vanna exposure ──────────────────────────────────────────────────
  // Vanna = how much dealer delta changes when IV moves
  // Positive VEX: IV drop → dealers buy delta (bullish) / IV spike → sell delta (bearish)
  // Negative VEX: IV drop → dealers sell delta (bearish) / IV spike → buy delta (bullish)
  const netVex = dvc?.net_vex ?? dvc?.vex?.net ?? null
  let vannaBias: FullGexResult['vannaBias'] = null
  let vannaNote: string | null = null
  if (netVex !== null) {
    if (netVex > 0) {
      vannaBias = 'AMPLIFYING'
      vannaNote = `Positive VEX: IV drop → dealers buy delta (rally fuel). IV spike → dealers sell (accelerates drop).`
    } else {
      vannaBias = 'SUPPRESSING'
      vannaNote = `Negative VEX: IV spike → dealers buy delta (cushions drop). IV drop → dealers sell (caps rally).`
    }
  }

  // ── CHEX — charm exposure ─────────────────────────────────────────────────
  // Charm = delta decay with time. Critical for 0DTE end-of-day behavior.
  // As 0DTE options approach expiry, charm forces dealer rehedging
  // Positive CHEX: as time passes, dealers must BUY → bullish into close
  // Negative CHEX: as time passes, dealers must SELL → bearish into close
  const netChex = dvc?.net_chex ?? dvc?.chex?.net ?? null
  const minsLeft = minsLeftInSession()
  let charmNote: string | null = null
  let charmUrgency: FullGexResult['charmUrgency'] = null

  if (netChex !== null) {
    charmUrgency = minsLeft < 60 ? 'HIGH' : minsLeft < 120 ? 'MODERATE' : 'LOW'
    const charmDollar = `$${(Math.abs(netChex)/1e9).toFixed(1)}B`
    if (netChex > 0) {
      charmNote = `Positive charm ($${charmDollar}): time decay forces dealer BUYING into close. Bullish 0DTE tailwind — price tends to drift up into 4pm. ${charmUrgency === 'HIGH' ? 'CRITICAL: <60min left, effect intensifying.' : ''}`
    } else {
      charmNote = `Negative charm ($${charmDollar}): time decay forces dealer SELLING into close. Bearish 0DTE headwind — price tends to drift down into 4pm. ${charmUrgency === 'HIGH' ? 'CRITICAL: <60min left, effect intensifying.' : ''}`
    }
  }

  // ── Max pain ──────────────────────────────────────────────────────────────
  const maxPainLevel  = maxpain?.max_pain ?? maxpain?.maxpain ?? null
  const pinProb       = maxpain?.pin_probability ?? maxpain?.probability ?? null

  // ── AI context string ─────────────────────────────────────────────────────
  const lines: string[] = ['═══ DEALER POSITIONING (FlashAlpha Basic) ═══']

  // GEX regime
  lines.push(`GEX Regime: ${regime.toUpperCase()} GAMMA | Net GEX: ${netGex !== null ? `$${(netGex/1e9).toFixed(1)}B` : 'n/a'}`)
  if (gammaFlip) lines.push(`Gamma Flip: ${gammaFlip} | Call Wall: ${callWall || 'n/a'} | Put Wall: ${putWall || 'n/a'}`)
  if (regime === 'negative') {
    lines.push(`NEGATIVE GAMMA → moves amplified, breakouts run. Dealers pro-cyclical. Trend days likely.`)
  } else if (regime === 'positive') {
    lines.push(`POSITIVE GAMMA → moves suppressed, dealers buy dips/sell rallies. Range-bound, fade extremes.`)
    if (callWall && putWall) lines.push(`Expected pin range: ${putWall}–${callWall}`)
  }

  // DEX
  if (dexBias) {
    lines.push(`Dealer Delta (DEX): ${dexBias} — ${dexBias === 'SHORT' ? 'dealers net long, will sell into strength' : dexBias === 'LONG' ? 'dealers net short, will buy into weakness' : 'balanced dealer delta'}`)
  }

  // VEX — vanna
  if (vannaNote) lines.push(`Vanna (VEX): ${vannaNote}`)

  // CHEX — charm (most critical for 0DTE)
  if (charmNote) {
    lines.push(``)
    lines.push(`CHARM (0DTE CRITICAL): ${charmNote}`)
  }

  // Max pain
  if (maxPainLevel) {
    lines.push(`Max Pain: ${maxPainLevel}${pinProb ? ` | Pin probability: ${Math.round(pinProb * 100)}%` : ''}`)
    lines.push(`Price gravitates toward ${maxPainLevel} into expiry — if within 10pts, pin risk is real.`)
  }

  return {
    symbol, gammaFlip, callWall, putWall, netGex,
    regime: regime as FullGexResult['regime'],
    netDex, dexBias,
    netVex, vannaBias, vannaNote,
    netChex, charmNote, charmUrgency,
    maxPain: maxPainLevel, pinProbability: pinProb,
    source:    'flashalpha_basic',
    aiContext: lines.join('\n'),
    updatedAt: gex?.updated_at ?? now,
    freshAt:   now,
  }
}

export async function GET(req: NextRequest) {
  const currentPrice = parseFloat(req.nextUrl.searchParams.get('price') || '0') || undefined
  const force        = req.nextUrl.searchParams.get('force') === 'true'

  // Serve from cache if fresh enough
  if (!force && cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ ...cache.data, cached: true, cacheAgeMin: Math.round((Date.now() - cache.ts) / 60000) })
  }

  const key = process.env.FLASHALPHA_API_KEY
  if (!key) {
    return NextResponse.json({
      symbol: 'SPX', gammaFlip: null, callWall: null, putWall: null, netGex: null,
      regime: 'unknown', netDex: null, dexBias: null, netVex: null, vannaBias: null,
      vannaNote: null, netChex: null, charmNote: null, charmUrgency: null,
      maxPain: null, pinProbability: null, source: 'no_key',
      aiContext: 'FlashAlpha not configured — add FLASHALPHA_API_KEY to Vercel env vars',
      updatedAt: new Date().toISOString(), freshAt: new Date().toISOString(),
    })
  }

  try {
    // Try SPX first (Basic plan), fallback to SPY
    let result: FullGexResult
    try {
      result = await fetchAll('SPX')
    } catch {
      result = await fetchAll('SPY')
    }

    // Add price context to charm/vanna notes
    if (currentPrice && result.gammaFlip) {
      const side = currentPrice > result.gammaFlip ? 'above' : 'below'
      result.aiContext += `\nPrice ${currentPrice} is ${side} gamma flip (${result.gammaFlip}) — ${side === 'above' ? 'positive gamma zone' : 'negative gamma zone'}.`
    }

    cache = { data: result, ts: Date.now() }
    const debugMode = req.nextUrl.searchParams.get('debug') === '1'
    return NextResponse.json({
      ...result,
      cached: false,
      ...(debugMode ? { fetchErrors: (globalThis as any).__gexLastErrors || [] } : {}),
    })

  } catch (e: any) {
    console.error('[GEX]', e.message)
    // Return stale cache if available
    if (cache) return NextResponse.json({ ...cache.data, cached: true, stale: true })
    return NextResponse.json({ error: e.message, source: 'error' }, { status: 500 })
  }
}
