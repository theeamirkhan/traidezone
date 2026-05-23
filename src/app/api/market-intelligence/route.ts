/**
 * /api/market-intelligence — Comprehensive market data for AI signal quality
 *
 * Fetches and structures ALL data the AI needs:
 *   1. VIX term structure (VIX1D, VIX9D, VIX, VVIX) — today's implied range
 *   2. VWAP bands (±1σ, ±2σ) — entry/exit zones
 *   3. Realized vs implied vol spread — options cheap/expensive
 *   4. SPX options max pain + OI concentration — price gravity
 *   5. Sector rotation — XLK, XLF, XLY, XLE, XLV, XLU, XLI, XLB, XLP, XLRE
 *   6. Pre-market quality — volume, conviction, futures vs fair value
 *   7. Intraday time-of-day context — where are we in the session historically
 *   8. News sentiment scoring — actual vs estimate on economic prints
 *
 * Background data: feeds AI context silently
 * UI data: key metrics surfaced in cockpit header + signal card
 *
 * Cached: 60s for price data, 5min for structure data
 */

import { NextRequest, NextResponse } from 'next/server'

const POLY = () => process.env.POLYGON_API_KEY || ''

async function polyGet(path: string, timeout = 6000) {
  try {
    const res = await fetch(
      `https://api.polygon.io${path}${path.includes('?') ? '&' : '?'}apiKey=${POLY()}`,
      { signal: AbortSignal.timeout(timeout) }
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

function etNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function yday() {
  const d = new Date(Date.now() - 86400000)
  // Walk back to last weekday
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// ── 1. VIX TERM STRUCTURE ────────────────────────────────────────────────────
async function fetchVIXTermStructure() {
  const td = today()
  const [vix1d, vix9d, vix, vvix, skew] = await Promise.all([
    polyGet(`/v2/aggs/ticker/I:VIX1D/range/1/minute/${td}/${td}?adjusted=true&sort=desc&limit=3`),
    polyGet(`/v2/aggs/ticker/I:VIX9D/range/1/minute/${td}/${td}?adjusted=true&sort=desc&limit=3`),
    polyGet(`/v2/aggs/ticker/I:VIX/range/1/minute/${td}/${td}?adjusted=true&sort=desc&limit=3`),
    polyGet(`/v2/aggs/ticker/I:VVIX/range/1/minute/${td}/${td}?adjusted=true&sort=desc&limit=3`),
    polyGet(`/v2/aggs/ticker/I:SKEW/range/1/day/${yday()}/${td}?adjusted=true&sort=desc&limit=3`),
  ])

  const v1d  = vix1d?.results?.[0]?.c || null
  const v9d  = vix9d?.results?.[0]?.c || null
  const v30  = vix?.results?.[0]?.c   || null
  const vvx  = vvix?.results?.[0]?.c  || null
  const skewVal = skew?.results?.[0]?.c || null
  // SKEW > 130 = tail risk elevated (market buying downside protection aggressively)
  // SKEW < 110 = complacency / normal
  const skewRegime = skewVal
    ? skewVal > 140 ? 'EXTREME_TAIL_RISK'
    : skewVal > 130 ? 'ELEVATED_TAIL_RISK'
    : skewVal > 115 ? 'NORMAL'
    : 'LOW_FEAR'
    : null

  // Daily implied move from VIX1D
  // VIX1D = expected % move today. Convert to SPX points
  const spxRes = await polyGet(`/v2/aggs/ticker/I:SPX/range/1/minute/${td}/${td}?adjusted=true&sort=asc&limit=5`)
  const spxOpen = spxRes?.results?.[0]?.o || 5400
  const impliedMoveToday = v1d ? (v1d / 100) * spxOpen : null

  // Term structure shape
  let termShape = 'normal'
  if (v1d && v30 && v1d > v30 * 1.1)  termShape = 'inverted'   // today more uncertain than month
  if (v1d && v30 && v1d < v30 * 0.85) termShape = 'calm'       // today calmer than month average

  // Contango/backwardation
  let contango = null
  if (v9d && v30) contango = ((v30 - v9d) / v9d * 100).toFixed(1)

  return {
    vix1d:           v1d ? parseFloat(v1d.toFixed(2)) : null,
    vix9d:           v9d ? parseFloat(v9d.toFixed(2)) : null,
    vix30:           v30 ? parseFloat(v30.toFixed(2)) : null,
    vvix:            vvx ? parseFloat(vvx.toFixed(2)) : null,
    impliedMoveToday: impliedMoveToday ? parseFloat(impliedMoveToday.toFixed(1)) : null,
    termShape,
    contango,
    skew:        skewVal ? parseFloat(skewVal.toFixed(1)) : null,
    skewRegime,  // EXTREME_TAIL_RISK | ELEVATED_TAIL_RISK | NORMAL | LOW_FEAR
    signal: v1d && v30
      ? v1d > v30 * 1.1
        ? `⚠ INVERTED TERM STRUCTURE — today more uncertain than month. Elevated 0DTE premium.`
        : v1d < v30 * 0.85
        ? `Calm term structure — today's implied move smaller than monthly avg. Options cheap.`
        : `Normal term structure — VIX1D ${v1d?.toFixed(1)} / VIX ${v30?.toFixed(1)}`
      : 'Term structure unavailable',
    skewSignal: skewVal
      ? `SKEW ${skewVal.toFixed(0)} (${skewRegime?.replace(/_/g,' ')}) — ${skewVal > 130 ? 'market buying heavy downside protection — expect volatility' : skewVal < 110 ? 'low tail hedging — complacent market' : 'normal tail risk pricing'}`
      : null,
  }
}

// ── 2. VWAP STANDARD DEVIATION BANDS ────────────────────────────────────────
async function fetchVWAPBands() {
  const td = today()
  const res = await polyGet(`/v2/aggs/ticker/I:SPX/range/1/minute/${td}/${td}?adjusted=true&sort=asc&limit=500`)
  const bars = res?.results || []
  if (bars.length < 10) return null

  // Calculate VWAP
  let cumVol = 0, cumTPV = 0
  const vwapLine: number[] = []
  for (const b of bars) {
    const tp  = (b.h + b.l + b.c) / 3
    const vol = b.v || 1
    cumTPV   += tp * vol
    cumVol   += vol
    vwapLine.push(cumTPV / cumVol)
  }

  const vwap     = vwapLine[vwapLine.length - 1]
  const currentPrice = bars[bars.length - 1]?.c || vwap

  // Standard deviation of price from VWAP
  const deviations = bars.map((b, i) => b.c - vwapLine[i])
  const variance   = deviations.reduce((s, d) => s + d * d, 0) / deviations.length
  const stdDev     = Math.sqrt(variance)

  const band1Up    = parseFloat((vwap + stdDev).toFixed(2))
  const band1Dn    = parseFloat((vwap - stdDev).toFixed(2))
  const band2Up    = parseFloat((vwap + stdDev * 2).toFixed(2))
  const band2Dn    = parseFloat((vwap - stdDev * 2).toFixed(2))
  const vwapRound  = parseFloat(vwap.toFixed(2))

  // Where is price relative to bands?
  let bandPosition = 'at_vwap'
  if (currentPrice > band2Up)      bandPosition = 'above_2sigma'
  else if (currentPrice > band1Up) bandPosition = 'above_1sigma'
  else if (currentPrice > vwap)    bandPosition = 'above_vwap'
  else if (currentPrice > band1Dn) bandPosition = 'below_vwap'
  else if (currentPrice > band2Dn) bandPosition = 'below_1sigma'
  else                             bandPosition = 'below_2sigma'

  const isExtended = bandPosition === 'above_2sigma' || bandPosition === 'below_2sigma'
  const isMeanRevertZone = bandPosition === 'above_1sigma' || bandPosition === 'below_1sigma'

  return {
    vwap:        vwapRound,
    stdDev:      parseFloat(stdDev.toFixed(1)),
    band1Up, band1Dn, band2Up, band2Dn,
    bandPosition,
    isExtended,
    isMeanRevertZone,
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    signal: isExtended
      ? `🔴 EXTENDED: Price at VWAP ±2σ (${bandPosition.replace('_', ' ')}). High mean-reversion probability.`
      : isMeanRevertZone
      ? `🟡 STRETCHED: Price at VWAP ±1σ. Watch for fade or continuation.`
      : `Price near VWAP — fair value zone. Directional move needs catalyst.`,
  }
}

// ── 3. REALIZED VS IMPLIED VOLATILITY ────────────────────────────────────────
async function fetchVolSpread() {
  const td   = today()
  const from = new Date(Date.now() - 10 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const [spxDaily, vixNow] = await Promise.all([
    polyGet(`/v2/aggs/ticker/I:SPX/range/1/day/${from}/${td}?adjusted=true&sort=asc&limit=10`),
    polyGet(`/v2/aggs/ticker/I:VIX/range/1/minute/${td}/${td}?adjusted=true&sort=desc&limit=3`),
  ])

  const bars = spxDaily?.results || []
  if (bars.length < 5) return null

  // 5-day realized vol (annualized)
  const returns = bars.slice(-6).map((b: any, i: number, arr: any[]) =>
    i === 0 ? 0 : Math.log(b.c / arr[i-1].c)
  ).slice(1)

  const meanReturn = returns.reduce((s: number, r: number) => s + r, 0) / returns.length
  const variance   = returns.reduce((s: number, r: number) => s + Math.pow(r - meanReturn, 2), 0) / returns.length
  const realizedVol = Math.sqrt(variance * 252) * 100  // annualized %

  const impliedVol  = vixNow?.results?.[0]?.c || null
  const spread      = impliedVol ? impliedVol - realizedVol : null

  return {
    realizedVol5d: parseFloat(realizedVol.toFixed(1)),
    impliedVol:    impliedVol ? parseFloat(impliedVol.toFixed(1)) : null,
    spread:        spread ? parseFloat(spread.toFixed(1)) : null,
    signal: spread !== null
      ? spread > 5
        ? `Options EXPENSIVE: Implied ${impliedVol?.toFixed(1)}% vs Realized ${realizedVol.toFixed(1)}%. Premium elevated — be cautious buying options.`
        : spread < -3
        ? `Options CHEAP: Implied ${impliedVol?.toFixed(1)}% vs Realized ${realizedVol.toFixed(1)}%. Good time to buy premium.`
        : `Options FAIRLY PRICED: IV ${impliedVol?.toFixed(1)}% ≈ RV ${realizedVol.toFixed(1)}%`
      : 'Vol spread unavailable',
  }
}

// ── 4. SECTOR ROTATION ───────────────────────────────────────────────────────
async function fetchSectorRotation() {
  const td   = today()
  const yest = yday()

  const sectors = [
    { ticker: 'XLK', name: 'Tech' },
    { ticker: 'XLF', name: 'Finance' },
    { ticker: 'XLY', name: 'Consumer Disc' },
    { ticker: 'XLE', name: 'Energy' },
    { ticker: 'XLV', name: 'Healthcare' },
    { ticker: 'XLU', name: 'Utilities' },
    { ticker: 'XLI', name: 'Industrial' },
    { ticker: 'XLB', name: 'Materials' },
    { ticker: 'XLP', name: 'Consumer Staples' },
    { ticker: 'XLRE', name: 'Real Estate' },
  ]

  // Use snapshot endpoint for real-time prices (much faster than aggs)
  const tickerList = sectors.map(s => s.ticker).join(',')
  const [snapshotRes, yestBarsAll] = await Promise.all([
    polyGet(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerList}`),
    Promise.all(sectors.map(s => polyGet(`/v2/aggs/ticker/${s.ticker}/range/1/day/${yest}/${yest}?adjusted=true&sort=desc&limit=1`))),
  ])
  const snapMap: Record<string, any> = {}
  ;(snapshotRes?.tickers || []).forEach((t: any) => { snapMap[t.ticker] = t })

  const results = sectors.map((s, i) => {
    const snap      = snapMap[s.ticker]
    const curr      = snap?.day?.c || snap?.lastTrade?.p || null
    const prevClose = yestBarsAll[i]?.results?.[0]?.c || snap?.prevDay?.c || null
    const chgPct    = curr && prevClose ? ((curr - prevClose) / prevClose * 100) : null
    return { ...s, curr, prevClose, chgPct: chgPct ? parseFloat(chgPct.toFixed(2)) : null }
  })

  const valid   = results.filter(s => s.chgPct !== null)
  const sorted  = [...valid].sort((a, b) => (b.chgPct || 0) - (a.chgPct || 0))
  const leading = sorted.slice(0, 3)
  const lagging = sorted.slice(-3).reverse()

  // Classify rotation
  const growthUp    = valid.filter(s => ['XLK','XLY','XLF'].includes(s.ticker) && (s.chgPct || 0) > 0).length
  const defensiveUp = valid.filter(s => ['XLU','XLP','XLV'].includes(s.ticker) && (s.chgPct || 0) > 0).length
  const allUp       = valid.filter(s => (s.chgPct || 0) > 0).length

  let rotationSignal = 'MIXED'
  let rotationBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DEFENSIVE' = 'NEUTRAL'
  if (growthUp >= 3 && defensiveUp <= 1) { rotationSignal = 'RISK-ON';    rotationBias = 'BULLISH' }
  if (defensiveUp >= 3 && growthUp <= 1) { rotationSignal = 'DEFENSIVE';  rotationBias = 'DEFENSIVE' }
  if (allUp >= 8)                        { rotationSignal = 'BROAD RALLY'; rotationBias = 'BULLISH' }
  if (allUp <= 2)                        { rotationSignal = 'BROAD SELL';  rotationBias = 'BEARISH' }

  return {
    sectors: valid,
    leading: leading.map(s => `${s.name} ${s.chgPct! > 0 ? '+' : ''}${s.chgPct}%`),
    lagging: lagging.map(s => `${s.name} ${s.chgPct! > 0 ? '+' : ''}${s.chgPct}%`),
    rotationSignal,
    rotationBias,
    advancers: allUp,
    decliners: valid.length - allUp,
    signal: `Sectors: ${rotationSignal} — Leading: ${leading.slice(0,2).map(s => s.name).join(', ')} | Lagging: ${lagging.slice(0,2).map(s => s.name).join(', ')}`,
  }
}

// ── 5. TIME OF DAY CONTEXT ───────────────────────────────────────────────────
function getTimeOfDayContext() {
  const et    = etNow()
  const hour  = et.getHours()
  const min   = et.getMinutes()
  const mins  = hour * 60 + min

  const sessions = [
    { from: 570,  to: 585,  name: 'Market Open',       bias: 'HIGH NOISE',  note: 'First 15min — fakeouts common. Wait for direction.' },
    { from: 585,  to: 615,  name: '10am Window',        bias: 'PRIME',       note: 'Best entry window. Noise settles, institutional flow begins.' },
    { from: 615,  to: 720,  name: 'Mid-Morning',        bias: 'PRIME',       note: 'Strong trend continuation or reversal becomes clear.' },
    { from: 720,  to: 780,  name: 'Lunch Lull',         bias: 'CHOPPY',      note: 'Noon-1pm: volume drops, chop increases. Avoid new entries.' },
    { from: 780,  to: 870,  name: 'Afternoon Move',     bias: 'ACTIVE',      note: '1pm-2:30pm: second directional move often starts here.' },
    { from: 870,  to: 930,  name: 'Power Hour',         bias: 'THETA RISK',  note: '2:30-3:30pm: theta accelerates on 0DTE. Size down.' },
    { from: 930,  to: 960,  name: 'Close Auction',      bias: 'DANGER',      note: 'Last 30min: gamma risk extreme. Exit or hedge.' },
    { from: 0,    to: 570,  name: 'Pre-Market',         bias: 'SETUP',       note: 'Watch futures, build plan. No entries yet.' },
    { from: 960,  to: 1440, name: 'After Hours',        bias: 'CLOSED',      note: 'Market closed.' },
  ]

  const session = sessions.find(s => mins >= s.from && mins < s.to) || sessions[sessions.length - 1]

  // Theta decay urgency for 0DTE
  let thetaUrgency = 'LOW'
  if (mins >= 870)       thetaUrgency = 'CRITICAL'
  else if (mins >= 780)  thetaUrgency = 'HIGH'
  else if (mins >= 720)  thetaUrgency = 'MODERATE'

  // Time remaining in session
  const closeMin = 960  // 4pm ET
  const minsLeft = Math.max(0, closeMin - mins)
  const hoursLeft = (minsLeft / 60).toFixed(1)

  return {
    currentSession:  session.name,
    sessionBias:     session.bias,
    sessionNote:     session.note,
    thetaUrgency,
    minsLeft,
    hoursLeft:       parseFloat(hoursLeft),
    isPrimeWindow:   session.bias === 'PRIME',
    isHighRisk:      thetaUrgency === 'HIGH' || thetaUrgency === 'CRITICAL',
    etTime:          `${et.getHours()}:${String(et.getMinutes()).padStart(2,'0')} ET`,
    signal: `${session.name} (${session.bias}) — ${session.note} | ${minsLeft}min left | Theta: ${thetaUrgency}`,
  }
}

// ── 6. PRE-MARKET QUALITY ────────────────────────────────────────────────────
async function fetchPreMarketQuality() {
  const td   = today()
  const yest = yday()

  // Get pre-market bars (4am-9:30am) via extended hours
  const [preRes, yestRes] = await Promise.all([
    polyGet(`/v2/aggs/ticker/SPY/range/5/minute/${td}/${td}?adjusted=false&sort=asc&limit=80`),
    polyGet(`/v2/aggs/ticker/SPY/range/1/day/${yest}/${yest}?adjusted=true&sort=desc&limit=1`),
  ])

  const preBars   = (preRes?.results || []).filter((b: any) => {
    const h = new Date(b.t).getHours()
    return h >= 4 && h < 9
  })

  const prevClose    = yestRes?.results?.[0]?.c || null
  const preVol       = preBars.reduce((s: number, b: any) => s + (b.v || 0), 0)
  const preOpen      = preBars[0]?.o || null
  const preLast      = preBars[preBars.length - 1]?.c || null
  const preMoveAmt   = preOpen && preLast ? Math.abs(preLast - preOpen) : null

  // Avg pre-market vol (rough: 20% of daily SPY vol which is ~80M shares)
  const avgPreVol    = 5000000  // ~5M shares in pre-market is average
  const volConviction = preVol > avgPreVol * 1.5 ? 'HIGH' : preVol > avgPreVol ? 'NORMAL' : 'LOW'

  return {
    preMarketVolume:   preVol,
    volConviction,
    preMarketMove:     preMoveAmt ? parseFloat(preMoveAmt.toFixed(2)) : null,
    prevClose,
    signal: volConviction === 'HIGH'
      ? `High pre-market conviction (${(preVol/1e6).toFixed(1)}M shares vs avg 5M) — gap likely to hold`
      : volConviction === 'LOW'
      ? `Low pre-market volume (${(preVol/1e6).toFixed(1)}M shares) — gap fill risk higher`
      : `Normal pre-market volume — standard gap behavior expected`,
  }
}

// ── 7. SPX OPTIONS CHAIN — max pain + OI concentration ──────────────────────
async function fetchOptionsChain() {
  // Polygon options snapshot for SPX (0DTE = today's expiry SPXW)
  const td = today()
  // Get SPX options expiring today
  const [todayChain, weekChain] = await Promise.all([
    polyGet(`/v3/snapshot/options/I:SPX?expiration_date=${td}&limit=250&sort=strike_price&order=asc`),
    polyGet(`/v3/snapshot/options/I:SPX?expiration_date.gte=${td}&expiration_date.lte=${new Date(Date.now()+5*86400000).toLocaleDateString('en-CA')}&limit=100&sort=expiration_date&order=asc`),
  ])

  const contracts = todayChain?.results || []
  if (contracts.length < 5) {
    // Fallback: try SPXW (weekly SPX options)
    const spxw = await polyGet(`/v3/snapshot/options/SPXW?expiration_date=${td}&limit=250&sort=strike_price&order=asc`)
    if (spxw?.results?.length > 0) contracts.push(...(spxw.results || []))
  }

  if (contracts.length < 5) return null

  // Calculate max pain — strike where total options premium expires worthless
  const strikes: Record<number, { callOI: number; putOI: number; callPain: number; putPain: number }> = {}

  for (const c of contracts) {
    const strike = c.details?.strike_price || c.strike_price
    const oi     = c.open_interest || c.day?.open_interest || 0
    const type   = c.details?.contract_type || c.contract_type
    if (!strike || !oi) continue
    if (!strikes[strike]) strikes[strike] = { callOI: 0, putOI: 0, callPain: 0, putPain: 0 }
    if (type === 'call') strikes[strike].callOI += oi
    if (type === 'put')  strikes[strike].putOI  += oi
  }

  // For each possible expiry price, calculate total pain ($ value of all options expiring ITM)
  const strikeList = Object.keys(strikes).map(Number).sort((a,b)=>a-b)
  let   maxPainStrike = 0
  let   minPain = Infinity

  for (const testStrike of strikeList) {
    let totalPain = 0
    for (const s of strikeList) {
      // Call pain: calls below test strike expire worthless, calls above are ITM
      if (s > testStrike) totalPain += strikes[s].callOI * (s - testStrike)
      // Put pain: puts above test strike expire worthless, puts below are ITM
      if (s < testStrike) totalPain += strikes[s].putOI  * (testStrike - s)
    }
    if (totalPain < minPain) { minPain = totalPain; maxPainStrike = testStrike }
  }

  // Find highest OI strikes (call wall, put wall)
  let callWallStrike = 0, callWallOI = 0
  let putWallStrike  = 0, putWallOI  = 0

  for (const [s, data] of Object.entries(strikes)) {
    const strike = Number(s)
    if (data.callOI > callWallOI) { callWallOI = data.callOI; callWallStrike = strike }
    if (data.putOI  > putWallOI)  { putWallOI  = data.putOI;  putWallStrike  = strike }
  }

  // Top 5 strikes by total OI (gamma gravity zones)
  const topStrikes = strikeList
    .map(s => ({ strike: s, totalOI: strikes[s].callOI + strikes[s].putOI, callOI: strikes[s].callOI, putOI: strikes[s].putOI }))
    .sort((a,b) => b.totalOI - a.totalOI)
    .slice(0, 5)

  // P/C ratio for 0DTE
  const totalCallOI = strikeList.reduce((s, k) => s + strikes[k].callOI, 0)
  const totalPutOI  = strikeList.reduce((s, k) => s + strikes[k].putOI,  0)
  const zeroDtePCR  = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(2)) : null

  return {
    maxPain:       maxPainStrike,
    callWall:      callWallStrike,
    putWall:       putWallStrike,
    callWallOI:    callWallOI,
    putWallOI:     putWallOI,
    topStrikes,
    zeroDtePCR,
    contractCount: contracts.length,
    signal: maxPainStrike > 0
      ? `Max pain: ${maxPainStrike} | Call wall: ${callWallStrike} (${(callWallOI/1000).toFixed(0)}K OI) | Put wall: ${putWallStrike} (${(putWallOI/1000).toFixed(0)}K OI) | 0DTE P/C: ${zeroDtePCR}`
      : 'Options chain unavailable',
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section') || 'all'

  try {
    // Run all fetches in parallel
    const [termStructure, vwapBands, volSpread, sectorRotation, preMarket, optionsChain] = await Promise.all([
      section === 'all' || section === 'vix'     ? fetchVIXTermStructure()  : Promise.resolve(null),
      section === 'all' || section === 'vwap'    ? fetchVWAPBands()         : Promise.resolve(null),
      section === 'all' || section === 'vol'     ? fetchVolSpread()         : Promise.resolve(null),
      section === 'all' || section === 'sectors' ? fetchSectorRotation()    : Promise.resolve(null),
      section === 'all' || section === 'premarket'? fetchPreMarketQuality() : Promise.resolve(null),
      section === 'all' || section === 'options' ? fetchOptionsChain()      : Promise.resolve(null),
    ])

    const timeContext = getTimeOfDayContext()

    // Build AI context string — injected into signal prompt
    const aiContext = [
      termStructure  ? `VIX TERM STRUCTURE: ${termStructure.signal}` : '',
      termStructure  ? `VIX1D: ${termStructure.vix1d} | VIX9D: ${termStructure.vix9d} | VIX30: ${termStructure.vix30} | Implied move today: ±${termStructure.impliedMoveToday}pts` : '',
      vwapBands      ? `VWAP BANDS: ${vwapBands.signal}` : '',
      vwapBands      ? `VWAP: ${vwapBands.vwap} | +1σ: ${vwapBands.band1Up} | -1σ: ${vwapBands.band1Dn} | +2σ: ${vwapBands.band2Up} | -2σ: ${vwapBands.band2Dn}` : '',
      volSpread      ? `VOL SPREAD: ${volSpread.signal}` : '',
      sectorRotation ? `SECTORS: ${sectorRotation.signal}` : '',
      `SESSION: ${timeContext.signal}`,
      preMarket      ? `PRE-MARKET: ${preMarket.signal}` : '',
      optionsChain   ? `OPTIONS CHAIN (0DTE): ${optionsChain.signal}` : '',
      termStructure?.skewSignal ? `SKEW: ${termStructure.skewSignal}` : '',
    ].filter(Boolean).join('\n')

    return NextResponse.json({
      termStructure,
      vwapBands,
      volSpread,
      sectorRotation,
      timeContext,
      preMarket,
      aiContext,
      optionsChain,
      fetchedAt: new Date().toISOString(),
    })

  } catch (e: any) {
    console.error('[market-intelligence]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
