/**
 * /api/strike-suggestions
 *
 * Synthesizes all market data into 3-5 ranked SPX option strike recommendations.
 * Refreshes every 15 minutes during market hours.
 *
 * Inputs (POST body):
 *   currentPrice, signal, vwapBands, gexData, volumeProfile,
 *   optionsChain, uwIV, impliedMove, levels, sessionMins
 *
 * Logic:
 *   1. Determine direction from signal or bias
 *   2. Score candidate strikes by confluence of key levels
 *   3. Assess IV regime for entry timing
 *   4. Rank by probability score
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    currentPrice,
    signal,        // LONG | SHORT | WAIT | NO TRADE
    confidence,
    vwapBands,     // { vwap, band1Up, band1Dn, band2Up, band2Dn, stdDev, bandPosition }
    gexData,       // { gammaFlip, callWall, putWall, netGex, regime, charmNote, charmUrgency, maxPain }
    volumeProfile, // { poc, vah, val }
    optionsChain,  // { maxPain, callWall, putWall, topStrikes, zeroDtePCR }
    uwIV,          // { ivRank, ivPercentile, iv30, putCallRatio }
    impliedMove,   // pts (e.g. 47)
    levels,        // { pdh, pdl, prevClose, ema200, dayOpen, impliedHigh, impliedLow }
    sessionMins,   // minutes remaining in session
    multiTF,       // { m15, h1 }
    morningBias,   // 'LONG' | 'SHORT' | 'NEUTRAL'
  } = body

  if (!currentPrice) return NextResponse.json({ error: 'currentPrice required' }, { status: 400 })

  const price = parseFloat(currentPrice)

  // ── Determine direction ──────────────────────────────────────────────────
  const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
    signal === 'LONG'  ? 'LONG'  :
    signal === 'SHORT' ? 'SHORT' :
    morningBias === 'BULLISH' ? 'LONG' :
    morningBias === 'BEARISH' ? 'SHORT' :
    'NEUTRAL'

  // ── Collect all key levels ───────────────────────────────────────────────
  const keyLevels: Array<{ price: number; label: string; type: 'support' | 'resistance' | 'gravity' | 'gamma' }> = []

  // VWAP levels
  if (vwapBands?.vwap) keyLevels.push({ price: vwapBands.vwap, label: 'VWAP', type: 'gravity' })
  if (vwapBands?.band1Up) keyLevels.push({ price: vwapBands.band1Up, label: '+1σ', type: 'resistance' })
  if (vwapBands?.band1Dn) keyLevels.push({ price: vwapBands.band1Dn, label: '-1σ', type: 'support' })
  if (vwapBands?.band2Up) keyLevels.push({ price: vwapBands.band2Up, label: '+2σ', type: 'resistance' })
  if (vwapBands?.band2Dn) keyLevels.push({ price: vwapBands.band2Dn, label: '-2σ', type: 'support' })

  // Volume profile
  if (volumeProfile?.poc) keyLevels.push({ price: volumeProfile.poc, label: 'POC', type: 'gravity' })
  if (volumeProfile?.vah) keyLevels.push({ price: volumeProfile.vah, label: 'VAH', type: 'resistance' })
  if (volumeProfile?.val) keyLevels.push({ price: volumeProfile.val, label: 'VAL', type: 'support' })

  // GEX levels
  if (gexData?.gammaFlip) keyLevels.push({ price: gexData.gammaFlip, label: 'Gamma Flip', type: 'gamma' })
  if (gexData?.callWall)  keyLevels.push({ price: gexData.callWall,  label: 'GEX Call Wall', type: 'resistance' })
  if (gexData?.putWall)   keyLevels.push({ price: gexData.putWall,   label: 'GEX Put Wall', type: 'support' })
  if (gexData?.maxPain)   keyLevels.push({ price: gexData.maxPain,   label: 'Max Pain', type: 'gravity' })

  // Options chain
  if (optionsChain?.maxPain)  keyLevels.push({ price: optionsChain.maxPain,  label: 'Max Pain (OI)', type: 'gravity' })
  if (optionsChain?.callWall) keyLevels.push({ price: optionsChain.callWall, label: 'Call Wall (OI)', type: 'resistance' })
  if (optionsChain?.putWall)  keyLevels.push({ price: optionsChain.putWall,  label: 'Put Wall (OI)', type: 'support' })

  // Prior day levels
  if (levels?.pdh) keyLevels.push({ price: levels.pdh, label: 'PDH', type: 'resistance' })
  if (levels?.pdl) keyLevels.push({ price: levels.pdl, label: 'PDL', type: 'support' })
  if (levels?.prevClose) keyLevels.push({ price: levels.prevClose, label: 'Prev Close', type: 'gravity' })
  if (levels?.ema200) keyLevels.push({ price: levels.ema200, label: '200 EMA (5m)', type: direction === 'LONG' ? 'support' : 'resistance' })
  if (levels?.dayOpen) keyLevels.push({ price: levels.dayOpen, label: 'Day Open', type: 'gravity' })

  // Implied move range
  const imPts = parseFloat(impliedMove) || 0
  if (imPts > 0 && levels?.dayOpen) {
    keyLevels.push({ price: levels.dayOpen + imPts, label: `+1× Implied Move (${imPts.toFixed(0)}pts)`, type: 'resistance' })
    keyLevels.push({ price: levels.dayOpen - imPts, label: `-1× Implied Move (${imPts.toFixed(0)}pts)`, type: 'support' })
  }

  // ── IV assessment ────────────────────────────────────────────────────────
  const ivRank = uwIV?.ivRank ?? null
  let ivAssessment = 'normal'
  let ivNote = 'IV in normal range — standard entry timing'
  let bestBuyWindow = 'Now is fine'

  if (ivRank !== null) {
    if (ivRank > 70) {
      ivAssessment = 'expensive'
      ivNote = `IV Rank ${ivRank}/100 — options are expensive. Premium elevated.`
      bestBuyWindow = 'Wait for IV to compress (post-data, post-open spike) or size down 50%'
    } else if (ivRank > 50) {
      ivAssessment = 'elevated'
      ivNote = `IV Rank ${ivRank}/100 — slightly elevated. Monitor for entry on pullback.`
      bestBuyWindow = 'Enter on pullback to VWAP or key support to get better fill'
    } else if (ivRank < 20) {
      ivAssessment = 'cheap'
      ivNote = `IV Rank ${ivRank}/100 — options historically cheap. Good premium conditions.`
      bestBuyWindow = 'Favorable now — low IV means better risk/reward on ITM entries'
    } else {
      bestBuyWindow = 'Current conditions are fine for entry'
    }
  }

  // ── Session timing note ──────────────────────────────────────────────────
  const mins = parseInt(sessionMins) || 390
  let sessionNote = ''
  if (mins < 30) sessionNote = 'DANGER: <30min left — extreme theta/gamma risk. Avoid new entries.'
  else if (mins < 60) sessionNote = 'CAUTION: <60min. Charm pressure intensifying. Size down or take profits.'
  else if (mins < 120) sessionNote = 'Theta risk building. Size down if not already in profit.'
  else sessionNote = 'Good window — sufficient time for trade to develop.'

  // ── Charm note for end of day ────────────────────────────────────────────
  const charmNote = gexData?.charmNote || null
  const charmUrgency = gexData?.charmUrgency || 'LOW'

  // ── Build AI prompt ──────────────────────────────────────────────────────
  const prompt = `You are an elite SPX 0DTE ITM options strike selection engine.

CURRENT MARKET STATE:
  SPX Price: ${price.toFixed(2)}
  Direction: ${direction} (signal: ${signal || 'none'}, confidence: ${confidence || 'n/a'}%)
  Session: ${mins} minutes remaining | ${sessionNote}

KEY PRICE LEVELS (your anchor points for strike selection):
${keyLevels.filter(l => l.price > 4000 && l.price < 15000).sort((a, b) => b.price - a.price).map(l => `  ${l.price.toFixed(0).padStart(6)}: ${l.label} [${l.type}]`).join('\n')}

IV CONDITIONS:
  ${ivNote}
  Best entry window: ${bestBuyWindow}

DEALER POSITIONING:
  GEX regime: ${gexData?.regime || 'unknown'} | Gamma flip: ${gexData?.gammaFlip || 'n/a'}
  ${charmNote ? `Charm: ${charmNote}` : ''}

INTRADAY STRUCTURE:
  ${multiTF?.m15 ? `15-min: ${multiTF.m15.trend} | Range ${multiTF.m15.low?.toFixed(0)}-${multiTF.m15.high?.toFixed(0)}` : ''}
  ${multiTF?.h1 ? `1-hour: ${multiTF.h1.trend} | EMA20: ${multiTF.h1.ema20?.toFixed(0)}` : ''}

YOUR JOB:
Recommend 3-5 specific SPX option strikes for a ${direction === 'NEUTRAL' ? 'LONG or SHORT' : direction} trade.

For each strike:
1. The specific strike price (round to nearest 5)
2. Option type (call for LONG, put for SHORT)
3. Why this strike specifically (reference the exact levels it sits near)
4. Entry premium range estimate (based on ITM depth — deeper ITM = higher premium, lower delta risk)
5. Probability score 0-100 (confluence of levels + IV + session timing + direction)
6. Whether this is: AGGRESSIVE (ATM/near-ATM, high gamma, cheap but risky), STANDARD (5-10pts ITM, good delta, recommended), or CONSERVATIVE (15-20pts ITM, high delta, expensive but safer)

Also provide:
- Overall best entry window (specific time or condition, not vague)
- One clear warning about the current setup

CRITICAL RULES:
- ITM strikes only (5-20pts in the money for SPX 0DTE) — this trader does NOT buy OTM
- For LONG: call strikes BELOW current price (so delta > 0.6)
- For SHORT: put strikes ABOVE current price (so delta > 0.6)  
- Reference actual price levels from the data — not generic advice
- If IV is expensive, note this prominently in entry window advice
- If charm is CRITICAL (end of day), flag the time risk on every strike

Respond ONLY with this JSON (no markdown):
{
  "direction": "LONG" | "SHORT" | "NEUTRAL",
  "currentPrice": ${price.toFixed(2)},
  "ivAssessment": "${ivAssessment}",
  "bestEntryWindow": "specific condition or time to enter",
  "sessionWarning": "${sessionNote}",
  "charmWarning": ${charmUrgency === 'HIGH' ? '"⚠ CHARM CRITICAL — charm pressure forcing dealer moves into close"' : 'null'},
  "setupWarning": "one specific risk to watch",
  "strikes": [
    {
      "strike": 0,
      "type": "call" | "put",
      "tier": "AGGRESSIVE" | "STANDARD" | "CONSERVATIVE",
      "itmDepth": 0,
      "rationale": "specific reason citing actual levels",
      "entryPremiumLow": 0.00,
      "entryPremiumHigh": 0.00,
      "targetExit": 0.00,
      "stopPremium": 0.00,
      "probabilityScore": 0,
      "keyLevel": "the specific level this strike is anchored to",
      "avoid": false,
      "avoidReason": null
    }
  ],
  "topPick": 0
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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await resp.json()
    const raw  = data.content?.[0]?.text || ''
    const clean = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    return NextResponse.json({
      ...result,
      keyLevels: keyLevels
        .filter(l => l.price > 4000 && l.price < 15000)
        .sort((a, b) => b.price - a.price)
        .slice(0, 12),
      generatedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[StrikeSuggestions]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
