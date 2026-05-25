/**
 * /api/strike-suggestions — AI-ranked SPX ITM option strike recommendations
 *
 * Gap fixes applied:
 *   1. Black-Scholes premium estimates (not AI-guessed)
 *   2. Microstructure context (TICK, TRIN, cumDelta, dark pool, flow bias)
 *   3. Full signal context (aiView, riskFlag, multiTFAlignment, sizingNote)
 *   4. Confluence scoring (clusters nearby levels, assigns HIGH/MED/LOW)
 *   5. VIX term structure + SKEW
 *   6. Sector bias + earnings risk
 *   7. Historical accuracy (stream weights + trader weaknesses)
 *   8. Mathematical target/stop from signal levels (delta-adjusted)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

// ── Black-Scholes approximation for ITM SPX options ─────────────────────────
// Uses simplified BSM: for 0DTE deep ITM options, premium ≈ intrinsic + time value
// time value = 0.5 × σ × S × √T × (2π)^-0.5 × e^(-d1²/2) where d1 is small for ITM
function estimatePremium(
  spot: number,
  strike: number,
  type: 'call' | 'put',
  ivAnnual: number,  // e.g. 0.18 for 18%
  dte: number = 0,   // days to expiry (0 = 0DTE)
): { low: number; high: number; delta: number } {
  const T    = Math.max(dte, 0.5) / 365  // avoid T=0 (use 0.5 days min)
  const σ    = ivAnnual
  const S    = spot
  const K    = strike

  // Intrinsic value
  const intrinsic = type === 'call'
    ? Math.max(S - K, 0)
    : Math.max(K - S, 0)

  // Approximate d1 for time value
  const d1 = (Math.log(S / K) + (0.5 * σ * σ) * T) / (σ * Math.sqrt(T))

  // Standard normal PDF
  const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)

  // Standard normal CDF approximation (Abramowitz & Stegun)
  const normCDF = (x: number) => {
    const a = [0.2316419, 0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429]
    const t = 1 / (1 + a[0] * Math.abs(x))
    const poly = t * (a[1] + t * (a[2] + t * (a[3] + t * (a[4] + t * a[5]))))
    const cdf = 1 - phi(x) * poly
    return x >= 0 ? cdf : 1 - cdf
  }

  const d2 = d1 - σ * Math.sqrt(T)
  const r  = 0.05 // risk-free rate approx

  let theoretical: number
  let delta: number

  if (type === 'call') {
    theoretical = S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    delta = normCDF(d1)
  } else {
    theoretical = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
    delta = normCDF(d1) - 1
  }

  // Use max of intrinsic and theoretical (can't be below intrinsic)
  const fair = Math.max(intrinsic + 0.1, theoretical)

  // Bid/ask spread: wider for deep ITM, tighter near ATM
  const spread = Math.max(0.30, fair * 0.04)
  const low    = parseFloat(Math.max(intrinsic + 0.05, fair - spread / 2).toFixed(2))
  const high   = parseFloat((fair + spread / 2).toFixed(2))

  return { low, high, delta: parseFloat(Math.abs(delta).toFixed(2)) }
}

// ── Confluence scoring — cluster nearby levels ───────────────────────────────
function scoreConfluence(
  levels: Array<{ price: number; label: string; type: string }>,
  clusterRadius = 3
): Array<{ price: number; label: string; type: string; confluenceScore: number; nearbyLabels: string[] }> {
  return levels.map(level => {
    const nearby = levels.filter(
      other => other !== level && Math.abs(other.price - level.price) <= clusterRadius
    )
    const score = nearby.length  // 0 = alone, 1 = one nearby, 3+ = strong confluence
    return {
      ...level,
      confluenceScore: score,
      nearbyLabels: nearby.map(n => n.label),
    }
  })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    currentPrice,
    signal,
    confidence,
    aiResult,           // full signal output (aiView, riskFlag, multiTFAlignment, etc.)
    vwapBands,
    gexData,
    volumeProfile,
    optionsChain,
    uwIV,
    impliedMove,
    levels,
    sessionMins,
    multiTF,
    morningBias,
    microstructure,     // NEW: TICK/TRIN/cumDelta/darkPool/flow
    termStructure,      // NEW: VIX term shape + SKEW
    sectorRotation,     // NEW: sector bias
    earningsCalendar,   // NEW: upcoming major reports
    traderProfile,      // NEW: stream weights + weaknesses
  } = body

  if (!currentPrice) return NextResponse.json({ error: 'currentPrice required' }, { status: 400 })

  const price = parseFloat(currentPrice)

  // ── IV for premium calculation ────────────────────────────────────────────
  // Use UW iv30 first, fallback to VIX as % (VIX / 100)
  const ivAnnual = uwIV?.iv30
    ? parseFloat(uwIV.iv30) / 100
    : (termStructure?.vix30 || 18) / 100

  // ── Direction ─────────────────────────────────────────────────────────────
  const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
    signal === 'LONG'         ? 'LONG'  :
    signal === 'SHORT'        ? 'SHORT' :
    aiResult?.signal === 'LONG'  ? 'LONG'  :
    aiResult?.signal === 'SHORT' ? 'SHORT' :
    morningBias === 'BULLISH' ? 'LONG'  :
    morningBias === 'BEARISH' ? 'SHORT' :
    'NEUTRAL'

  const optionType: 'call' | 'put' = direction === 'SHORT' ? 'put' : 'call'

  // ── Collect all key levels ────────────────────────────────────────────────
  const rawLevels: Array<{ price: number; label: string; type: 'support' | 'resistance' | 'gravity' | 'gamma' }> = []

  // VWAP bands
  if (vwapBands?.vwap)    rawLevels.push({ price: vwapBands.vwap,    label: 'VWAP',     type: 'gravity' })
  if (vwapBands?.band1Up) rawLevels.push({ price: vwapBands.band1Up, label: '+1σ',      type: 'resistance' })
  if (vwapBands?.band1Dn) rawLevels.push({ price: vwapBands.band1Dn, label: '-1σ',      type: 'support' })
  if (vwapBands?.band2Up) rawLevels.push({ price: vwapBands.band2Up, label: '+2σ',      type: 'resistance' })
  if (vwapBands?.band2Dn) rawLevels.push({ price: vwapBands.band2Dn, label: '-2σ',      type: 'support' })

  // Volume profile
  if (volumeProfile?.poc) rawLevels.push({ price: volumeProfile.poc, label: 'POC',      type: 'gravity' })
  if (volumeProfile?.vah) rawLevels.push({ price: volumeProfile.vah, label: 'VAH',      type: 'resistance' })
  if (volumeProfile?.val) rawLevels.push({ price: volumeProfile.val, label: 'VAL',      type: 'support' })

  // GEX
  if (gexData?.gammaFlip) rawLevels.push({ price: gexData.gammaFlip, label: 'Gamma Flip',     type: 'gamma' })
  if (gexData?.callWall)  rawLevels.push({ price: gexData.callWall,  label: 'GEX Call Wall',  type: 'resistance' })
  if (gexData?.putWall)   rawLevels.push({ price: gexData.putWall,   label: 'GEX Put Wall',   type: 'support' })
  if (gexData?.maxPain)   rawLevels.push({ price: gexData.maxPain,   label: 'FlashAlpha Max Pain', type: 'gravity' })

  // OI-based
  if (optionsChain?.maxPain)  rawLevels.push({ price: optionsChain.maxPain,  label: 'Max Pain (OI chain)', type: 'gravity' })
  if (optionsChain?.callWall) rawLevels.push({ price: optionsChain.callWall, label: 'Call Wall (OI)',      type: 'resistance' })
  if (optionsChain?.putWall)  rawLevels.push({ price: optionsChain.putWall,  label: 'Put Wall (OI)',       type: 'support' })

  // Price levels
  if (levels?.pdh)       rawLevels.push({ price: levels.pdh,       label: 'PDH',         type: 'resistance' })
  if (levels?.pdl)       rawLevels.push({ price: levels.pdl,       label: 'PDL',         type: 'support' })
  if (levels?.prevClose) rawLevels.push({ price: levels.prevClose,  label: 'Prev Close',  type: 'gravity' })
  if (levels?.ema200)    rawLevels.push({ price: levels.ema200,     label: '200 EMA (5m)',type: direction === 'LONG' ? 'support' : 'resistance' })
  if (levels?.dayOpen)   rawLevels.push({ price: levels.dayOpen,    label: 'Day Open',    type: 'gravity' })
  if (multiTF?.h1?.ema20) rawLevels.push({ price: multiTF.h1.ema20, label: 'EMA20 (1hr)', type: direction === 'LONG' ? 'support' : 'resistance' })

  // Implied move range
  const imPts = parseFloat(impliedMove) || 0
  if (imPts > 0 && levels?.dayOpen) {
    rawLevels.push({ price: levels.dayOpen + imPts, label: `+1σ Implied Move (+${imPts.toFixed(0)}pts)`, type: 'resistance' })
    rawLevels.push({ price: levels.dayOpen - imPts, label: `-1σ Implied Move (-${imPts.toFixed(0)}pts)`, type: 'support' })
  }

  // Filter valid levels and score confluence
  const validLevels = rawLevels.filter(l => l.price > 4000 && l.price < 15000)
  const scoredLevels = scoreConfluence(validLevels)

  // ── Pre-calculate premium estimates for 3 candidate ITM strikes ──────────
  // Candidate strikes: 5, 10, 15pts ITM
  const itm5  = direction === 'LONG' ? price - 5  : price + 5
  const itm10 = direction === 'LONG' ? price - 10 : price + 10
  const itm15 = direction === 'LONG' ? price - 15 : price + 15
  const itm20 = direction === 'LONG' ? price - 20 : price + 20

  // Round to nearest 5
  const round5 = (n: number) => Math.round(n / 5) * 5

  const premiumEstimates = [itm5, itm10, itm15, itm20].map(k => {
    const strike = round5(k)
    const est    = estimatePremium(price, strike, optionType, ivAnnual, 0)
    return { strike, ...est }
  })

  // ── Mathematical target/stop from signal levels ───────────────────────────
  let mathTarget: { strike: number; premium: number; pnl: number } | null = null
  let mathStop:   { premium: number; loss: number } | null = null

  if (aiResult?.target1 && direction !== 'NEUTRAL') {
    const targetSPX  = parseFloat(aiResult.target1)
    const entrySPX   = price
    const spxMove    = Math.abs(targetSPX - entrySPX)

    // For the STANDARD strike (10pts ITM), delta ≈ 0.7
    const avgDelta    = 0.70
    const estPremiumAtEntry  = premiumEstimates[1]?.low || 10
    const estPremiumAtTarget = estPremiumAtEntry + spxMove * avgDelta
    mathTarget = {
      strike: premiumEstimates[1]?.strike || round5(itm10),
      premium: parseFloat(estPremiumAtTarget.toFixed(2)),
      pnl: parseFloat(((estPremiumAtTarget - estPremiumAtEntry) * 100).toFixed(0)),
    }
  }

  if (aiResult?.stopLevel && direction !== 'NEUTRAL') {
    const stopSPX   = parseFloat(aiResult.stopLevel)
    const spxLoss   = Math.abs(price - stopSPX)
    const avgDelta  = 0.70
    const estEntry  = premiumEstimates[1]?.low || 10
    const stopPrem  = Math.max(0.50, estEntry - spxLoss * avgDelta)
    mathStop = {
      premium: parseFloat(stopPrem.toFixed(2)),
      loss: parseFloat(((estEntry - stopPrem) * 100).toFixed(0)),
    }
  }

  // ── IV assessment ─────────────────────────────────────────────────────────
  const ivRank = uwIV?.ivRank ?? null
  let ivAssessment = 'normal'
  let ivNote = 'IV in normal range — standard premium conditions'
  let bestBuyWindow = 'Entry conditions are neutral'

  if (ivRank !== null) {
    if (ivRank > 70) {
      ivAssessment = 'expensive'
      ivNote = `IV Rank ${ivRank}/100 — options are expensive (${(ivAnnual * 100).toFixed(1)}% annualized). Premiums inflated.`
      bestBuyWindow = 'Wait for post-10am vol compression or enter on VWAP pullback to reduce premium paid'
    } else if (ivRank > 50) {
      ivAssessment = 'elevated'
      ivNote = `IV Rank ${ivRank}/100 — slightly elevated. Consider entering on dips.`
      bestBuyWindow = 'Enter on pullback to key support rather than chasing — better fill'
    } else if (ivRank < 20) {
      ivAssessment = 'cheap'
      ivNote = `IV Rank ${ivRank}/100 — options historically cheap (${(ivAnnual * 100).toFixed(1)}% annualized). Good conditions.`
      bestBuyWindow = 'Favorable now — low IV means better risk/reward on premium buying'
    } else {
      bestBuyWindow = 'Normal conditions — no IV timing edge, enter on setup confirmation'
    }
  }

  // ── Term structure warning ────────────────────────────────────────────────
  const termShape = termStructure?.termShape || null
  const skew      = termStructure?.skew || null
  const skewNote  = skew && skew > 130
    ? `SKEW ${skew.toFixed(0)} elevated — institutions buying downside protection aggressively`
    : null

  // ── Microstructure summary ────────────────────────────────────────────────
  const microCtx = microstructure?.aiContext || null

  // ── Session timing ────────────────────────────────────────────────────────
  const mins = parseInt(sessionMins) || 390
  const sessionNote =
    mins < 30  ? `DANGER: ${mins}min left — extreme theta/gamma risk, avoid new entries` :
    mins < 60  ? `CAUTION: ${mins}min left — charm pressure intensifying, size down` :
    mins < 120 ? `${mins}min left — theta risk building into close` :
                 `${mins}min left — sufficient time for trade to develop`

  const charmUrgency = gexData?.charmUrgency || 'LOW'
  const charmNote    = gexData?.charmNote    || null

  // ── Trader profile context ────────────────────────────────────────────────
  const streamWeights  = traderProfile?.stream_weights || {}
  const weaknesses     = traderProfile?.weaknesses || []
  const strengths      = traderProfile?.strengths  || []
  const topStreams      = Object.entries(streamWeights)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([name, w]) => `${name} (${(w as number).toFixed(2)}x)`)

  // ── High-confluence zones ─────────────────────────────────────────────────
  const highConflZones = scoredLevels
    .filter(l => l.confluenceScore >= 2)
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, 5)

  // ── Sector context ────────────────────────────────────────────────────────
  const sectorSignal = sectorRotation?.signal || sectorRotation?.rotationSignal || null
  const sectorBias   = sectorRotation?.rotationBias || null

  // ── Earnings risk ─────────────────────────────────────────────────────────
  const earningsToday = (earningsCalendar || [])
    .filter((e: any) => {
      const big = ['NVDA','AAPL','MSFT','AMZN','META','GOOGL','TSLA','SPY','QQQ']
      return big.some(t => e.ticker?.includes(t))
    })
    .map((e: any) => `${e.ticker} ${e.time || ''}`)

  // ── Build prompt ──────────────────────────────────────────────────────────
  const prompt = `You are an elite SPX 0DTE ITM options strike selection engine.
Your job: recommend 3-5 specific strikes. Use the pre-calculated data below — do NOT invent numbers.

═══ CURRENT STATE ═══
SPX: ${price.toFixed(2)} | Direction: ${direction} | Signal confidence: ${confidence || 'n/a'}%
Session: ${sessionNote}
IV: ${ivNote}

${aiResult?.aiView ? `AI Signal Read: "${aiResult.aiView}"` : ''}
${aiResult?.riskFlag ? `Signal Risk Flag: "${aiResult.riskFlag}"` : ''}
${aiResult?.multiTFAlignment ? `Multi-TF: ${aiResult.multiTFAlignment}` : ''}
${aiResult?.sizingNote ? `Sizing: ${aiResult.sizingNote}` : ''}

═══ PRE-CALCULATED PREMIUM ESTIMATES (Black-Scholes, IV=${(ivAnnual*100).toFixed(1)}%) ═══
Use THESE numbers — do not invent premiums:
${premiumEstimates.map(e => `  ${e.strike} ${optionType.toUpperCase()} | ${Math.abs(e.strike - price).toFixed(0)}pts ITM | Entry: $${e.low}–$${e.high} | Delta: ~${e.delta}`).join('\n')}
${mathTarget ? `\nMath target from signal: If SPX hits ${aiResult?.target1}, ${premiumEstimates[1]?.strike} ${optionType} → ~$${mathTarget.premium} (+$${mathTarget.pnl}/contract)` : ''}
${mathStop ? `Math stop from signal: If SPX hits ${aiResult?.stopLevel}, stop option at ~$${mathStop.premium} (-$${mathStop.loss}/contract)` : ''}

═══ PRICE LEVELS (confluence-scored) ═══
${scoredLevels.filter(l => l.price > 4000 && l.price < 15000).sort((a,b) => b.price - a.price)
  .map(l => `  ${l.price.toFixed(0).padStart(6)}: ${l.label.padEnd(28)} [${l.type}]${l.confluenceScore >= 2 ? ` ★HIGH CONFLUENCE (${l.nearbyLabels.join('+')} within 3pts)` : ''}`)
  .join('\n')}

${highConflZones.length > 0 ? `\n★ STRONGEST ZONES (${highConflZones.length} high-confluence clusters):\n${highConflZones.map(z => `  ${z.price.toFixed(0)}: ${z.label} + ${z.nearbyLabels.join(', ')}`).join('\n')}` : ''}

═══ DEALER POSITIONING ═══
GEX regime: ${gexData?.regime || 'unknown'} | Gamma flip: ${gexData?.gammaFlip || 'n/a'}
DEX (dealer delta): ${gexData?.dexBias || 'n/a'}
${charmNote ? `Charm: ${charmNote}` : ''}
${skewNote ? `SKEW: ${skewNote}` : ''}
${termShape ? `VIX term: ${termShape}${termShape === 'inverted' ? ' — 0DTE premium elevated vs monthly' : ''}` : ''}

═══ REAL-TIME MICROSTRUCTURE ═══
${microCtx || 'Not available — use level-based analysis only'}

═══ INTRADAY STRUCTURE ═══
${multiTF?.m15 ? `15-min: ${multiTF.m15.trend} | Range ${multiTF.m15.low?.toFixed(0)}–${multiTF.m15.high?.toFixed(0)} | Price at ${multiTF.m15.rangePct}% of range` : ''}
${multiTF?.h1  ? `1-hour: ${multiTF.h1.trend} | EMA20: ${multiTF.h1.ema20?.toFixed(0)} | Price ${multiTF.h1.aboveEma ? 'above' : 'below'} EMA` : ''}

${sectorSignal ? `═══ SECTOR CONTEXT ═══\n${sectorSignal}${sectorBias === 'BEARISH' && direction === 'LONG' ? ' ⚠ SECTOR HEADWIND — broad selling vs long signal' : sectorBias === 'BULLISH' && direction === 'LONG' ? ' ✓ SECTOR TAILWIND' : ''}` : ''}

${earningsToday.length > 0 ? `═══ EARNINGS RISK ═══\n⚠ Major reports today: ${earningsToday.join(', ')} — may spike IV or gap SPX` : ''}

${topStreams.length > 0 ? `═══ TRADER EDGE (historical accuracy) ═══\nTop predictive streams: ${topStreams.join(', ')}
${weaknesses.slice(-2).length > 0 ? `Known weaknesses: ${weaknesses.slice(-2).map((w: any) => typeof w === 'string' ? w : w.description).join('; ')}` : ''}` : ''}

═══ BEST ENTRY WINDOW ═══
${bestBuyWindow}

YOUR JOB: Recommend 3-5 strikes for ${direction} trade.

RULES:
- Use ONLY the pre-calculated premiums above — do not invent numbers
- ITM only: calls BELOW spot (LONG), puts ABOVE spot (SHORT)
- Reference actual levels from the confluence data
- If a high-confluence zone exists near a candidate strike, prioritize it
- Probability score 0-100: weight confluence (40%) + microstructure direction (25%) + IV (15%) + session (20%)
- Tier: AGGRESSIVE (0-5pts ITM), STANDARD (5-12pts ITM, recommended), CONSERVATIVE (12-20pts ITM)
- If microstructure contradicts direction, flag in rationale and reduce score by 10-15pts
- If TICK/TRIN/delta available, cite them in rationale

JSON only (no markdown):
{
  "direction": "${direction}",
  "currentPrice": ${price.toFixed(2)},
  "ivAssessment": "${ivAssessment}",
  "ivAnnual": ${(ivAnnual * 100).toFixed(1)},
  "bestEntryWindow": "specific condition",
  "sessionWarning": "${sessionNote}",
  "charmWarning": ${charmUrgency === 'HIGH' ? '"⚠ CHARM CRITICAL"' : 'null'},
  "setupWarning": "single biggest risk",
  "sectorNote": ${sectorSignal ? `"${sectorSignal.substring(0, 80)}"` : 'null'},
  "strikes": [
    {
      "strike": 0,
      "type": "${optionType}",
      "tier": "AGGRESSIVE|STANDARD|CONSERVATIVE",
      "itmDepth": 0,
      "rationale": "cite specific levels + microstructure data",
      "entryPremiumLow": 0.00,
      "entryPremiumHigh": 0.00,
      "targetExit": 0.00,
      "stopPremium": 0.00,
      "estimatedDelta": 0.00,
      "estPnlPerContract": 0,
      "probabilityScore": 0,
      "confluenceScore": "HIGH|MEDIUM|LOW",
      "keyLevel": "exact level name + price",
      "microNote": "TICK/TRIN/delta observation or null",
      "avoid": false,
      "avoidReason": null
    }
  ],
  "topPick": 0,
  "mathTarget": ${mathTarget ? JSON.stringify(mathTarget) : 'null'},
  "mathStop": ${mathStop ? JSON.stringify(mathStop) : 'null'}
}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data  = await resp.json()
    const raw   = data.content?.[0]?.text || ''
    const clean = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    return NextResponse.json({
      ...result,
      premiumEstimates,
      keyLevels: scoredLevels
        .filter(l => l.price > 4000 && l.price < 15000)
        .sort((a, b) => b.price - a.price)
        .slice(0, 14),
      highConflZones,
      generatedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[StrikeSuggestions]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
