/**
 * actionability.ts — Signal Actionability Engine
 *
 * Single source of truth for: is this signal ACTIONABLE or NOISE?
 *
 * Computes a final actionability classification by checking:
 *   1. Signal staleness (age >15min = degraded)
 *   2. Quality gate verdict (BLOCKED = noise)
 *   3. Mechanical flow alignment
 *   4. News blackout (major release in next 15min)
 *   5. Setup type classification (breakout/bounce/reversal/fade)
 *   6. Liquidity check (volume sufficient)
 *   7. Conviction calibration (historical accuracy at this confidence band)
 *   8. Invalidation level (explicit setup failure point)
 *
 * Returns ONE clear verdict the trader can act on:
 *   ACTIONABLE → execute now
 *   WATCH      → not yet, here's the specific trigger
 *   NOISE      → skip entirely
 */

export interface ActionabilityResult {
  verdict:           'ACTIONABLE' | 'WATCH' | 'NOISE'
  headline:          string                    // One-line summary
  reasoning:         string                    // Why this verdict
  setupType:         SetupType
  invalidationPrice: number | null             // Below this for LONG / above this for SHORT = setup is wrong
  staleness:         { minutesOld: number; degraded: boolean }
  newsRisk:          { blackout: boolean; nextEvent: string | null }
  liquidityCheck:    { ok: boolean; note: string }
  calibratedConf:    { stated: number; calibrated: number; note: string }
  greenLights:       string[]                  // What's confirming
  redFlags:          string[]                  // What's contradicting
  triggers:          string[]                  // For WATCH: specific conditions to act on
}

export type SetupType =
  | 'BREAKOUT'           // breaking above resistance/range
  | 'BOUNCE'             // dip-buy at support
  | 'REVERSAL'           // exhaustion reversal at extreme
  | 'TREND_CONTINUATION' // pullback in established trend
  | 'FADE'               // counter-trend fade at extreme
  | 'RANGE_PLAY'         // trading inside a range
  | 'NO_SETUP'

export function classifyActionability(input: {
  signal:            'LONG' | 'SHORT' | 'WAIT' | 'NO TRADE' | null
  confidence:        number | null
  signalAge:         number          // minutes since signal fired
  qualityVerdict:    'STRONG' | 'CONFIRMED' | 'MARGINAL' | 'CONFLICTED' | 'BLOCKED' | null
  mechanicalScore:   number | null   // -100 to +100
  asymmetricSetup:   string | null   // BULLISH_AMPLIFY etc.
  currentPrice:      number
  vwap:              number | null
  ema200:            number | null
  poc:               number | null
  callWall:          number | null
  putWall:           number | null
  gammaFlip:         number | null
  // Volume
  currentVolume:     number | null
  avgVolume:         number | null
  // News
  upcomingEvents:    Array<{ time: string; importance: string; event: string }>
  sessionMinsLeft:   number
  // Historical accuracy at this confidence band
  historicalWinRateAtConf: number | null  // % win rate for trades at this confidence level
}): ActionabilityResult {
  const {
    signal, confidence, signalAge,
    qualityVerdict, mechanicalScore, asymmetricSetup,
    currentPrice, vwap, ema200, poc, callWall, putWall, gammaFlip,
    currentVolume, avgVolume,
    upcomingEvents, sessionMinsLeft,
    historicalWinRateAtConf,
  } = input

  const greenLights: string[] = []
  const redFlags:    string[] = []
  const triggers:    string[] = []

  // ── 1. Staleness check ──────────────────────────────────────────────────
  const stalenessMins = Math.round(signalAge)
  const stale = stalenessMins > 15
  if (stale) redFlags.push(`Signal is ${stalenessMins}min old — market may have moved`)
  if (stalenessMins <= 5) greenLights.push('Signal is fresh')

  // ── 2. Quality verdict ──────────────────────────────────────────────────
  if (qualityVerdict === 'STRONG') greenLights.push('Quality gate: STRONG — multiple streams confirming')
  if (qualityVerdict === 'CONFIRMED') greenLights.push('Quality gate: CONFIRMED')
  if (qualityVerdict === 'MARGINAL') redFlags.push('Quality gate: MARGINAL — mixed signals')
  if (qualityVerdict === 'CONFLICTED') redFlags.push('Quality gate: CONFLICTED — streams disagree')
  if (qualityVerdict === 'BLOCKED') redFlags.push('Quality gate BLOCKED this signal')

  // ── 3. Mechanical flow alignment ────────────────────────────────────────
  if (mechanicalScore !== null && signal && signal !== 'WAIT' && signal !== 'NO TRADE') {
    if (signal === 'LONG' && mechanicalScore >= 30) greenLights.push(`Mechanics confirm LONG (+${mechanicalScore})`)
    if (signal === 'SHORT' && mechanicalScore <= -30) greenLights.push(`Mechanics confirm SHORT (${mechanicalScore})`)
    if (signal === 'LONG' && mechanicalScore <= -30) redFlags.push(`Mechanics OPPOSE LONG (${mechanicalScore})`)
    if (signal === 'SHORT' && mechanicalScore >= 30) redFlags.push(`Mechanics OPPOSE SHORT (+${mechanicalScore})`)
  }

  if (asymmetricSetup?.includes('AMPLIFY') && signal && signal !== 'WAIT') {
    const setupDir = asymmetricSetup.includes('BULLISH') ? 'LONG' : 'SHORT'
    if (setupDir === signal) greenLights.push(`⚡ ${asymmetricSetup} — dealers must chase your direction`)
    else redFlags.push(`⚠ ${asymmetricSetup} opposes signal direction`)
  }

  // ── 4. News blackout check ──────────────────────────────────────────────
  const now = new Date()
  const next15MinEvents = upcomingEvents.filter(e => {
    try {
      const eventTime = new Date(e.time)
      const minsUntil  = (eventTime.getTime() - now.getTime()) / 60000
      return minsUntil >= 0 && minsUntil <= 15 && (e.importance === 'high' || e.importance === 'critical')
    } catch { return false }
  })
  const newsBlackout = next15MinEvents.length > 0
  if (newsBlackout) redFlags.push(`📰 Major event in <15min: ${next15MinEvents[0].event}`)

  // ── 5. Liquidity check ──────────────────────────────────────────────────
  let liquidityOk = true
  let liquidityNote = 'Volume sufficient'
  if (currentVolume !== null && avgVolume !== null && avgVolume > 0) {
    const volRatio = currentVolume / avgVolume
    if (volRatio < 0.5) {
      liquidityOk = false
      liquidityNote = `Volume only ${(volRatio * 100).toFixed(0)}% of avg — thin liquidity`
      redFlags.push(liquidityNote)
    } else if (volRatio > 2) {
      liquidityNote = `Volume ${(volRatio * 100).toFixed(0)}% of avg — high participation`
      greenLights.push(`Heavy volume confirming move`)
    }
  }

  // ── 6. Session timing ───────────────────────────────────────────────────
  if (sessionMinsLeft < 30) redFlags.push(`Only ${sessionMinsLeft}min left — extreme theta risk`)
  else if (sessionMinsLeft < 60) redFlags.push(`${sessionMinsLeft}min left — theta accelerating`)
  else if (sessionMinsLeft >= 240 && sessionMinsLeft <= 360) greenLights.push('Prime session window (10am-12pm)')

  // ── 7. Setup type classification ────────────────────────────────────────
  const setupType: SetupType = classifySetupType({
    signal, currentPrice, vwap, ema200, poc, callWall, putWall, gammaFlip, mechanicalScore,
  })

  // ── 8. Invalidation level ───────────────────────────────────────────────
  // Different from stop: invalidation = where setup THESIS is wrong (not just where stop is hit)
  let invalidationPrice: number | null = null
  if (signal === 'LONG' && ema200 && vwap) {
    // LONG setup invalid if price loses BOTH VWAP and 200 EMA
    invalidationPrice = Math.min(vwap, ema200) - 3
  } else if (signal === 'SHORT' && ema200 && vwap) {
    invalidationPrice = Math.max(vwap, ema200) + 3
  }

  // ── 9. Conviction calibration ───────────────────────────────────────────
  const stated = confidence || 0
  let calibrated = stated
  let calibNote = 'No historical calibration yet'
  if (historicalWinRateAtConf !== null) {
    // If model says 75% confidence and historical accuracy at that band is 55%, calibrate down
    calibrated = Math.round((stated + historicalWinRateAtConf) / 2)
    const drift = Math.abs(stated - historicalWinRateAtConf)
    if (drift > 15) {
      calibNote = `Model says ${stated}%, history says ${historicalWinRateAtConf}% at this confidence — model is ${stated > historicalWinRateAtConf ? 'overconfident' : 'underconfident'}`
      if (stated > historicalWinRateAtConf + 15) redFlags.push('Model overconfident vs history')
    } else {
      calibNote = `${stated}% stated, ${historicalWinRateAtConf}% historical at this band — calibrated`
      if (drift < 10) greenLights.push('Confidence well-calibrated vs history')
    }
  }

  // ── 10. Final verdict ───────────────────────────────────────────────────
  let verdict: 'ACTIONABLE' | 'WATCH' | 'NOISE' = 'NOISE'
  let headline = ''
  let reasoning = ''

  if (!signal || signal === 'NO TRADE') {
    verdict   = 'NOISE'
    headline  = 'NO SETUP'
    reasoning = 'AI flagged no actionable setup right now'
  } else if (signal === 'WAIT') {
    verdict   = 'WATCH'
    headline  = 'WAIT FOR TRIGGER'
    reasoning = 'Setup pending — specific conditions needed'
    if (vwap) triggers.push(`Watch VWAP reclaim at ${vwap.toFixed(0)}`)
    if (ema200) triggers.push(`Watch 200 EMA at ${ema200.toFixed(0)}`)
  } else if (qualityVerdict === 'BLOCKED' || qualityVerdict === 'CONFLICTED') {
    verdict   = 'NOISE'
    headline  = 'CONFLICTING DATA — STAND ASIDE'
    reasoning = 'Data streams contradict, do not trade'
  } else if (newsBlackout) {
    verdict   = 'WATCH'
    headline  = `WAIT — ${next15MinEvents[0].event} INCOMING`
    reasoning = 'Major release imminent; avoid being caught in spike'
    triggers.push('Re-evaluate signal 5min after release')
  } else if (stale && redFlags.length > 0) {
    verdict   = 'NOISE'
    headline  = 'SIGNAL STALE'
    reasoning = `Signal is ${stalenessMins}min old with new contradicting data — refresh first`
  } else if (greenLights.length >= 3 && redFlags.length === 0) {
    verdict   = 'ACTIONABLE'
    headline  = `${signal} — EXECUTE`
    reasoning = `${greenLights.length} confirmations, no red flags`
  } else if (greenLights.length >= redFlags.length + 1) {
    verdict   = 'ACTIONABLE'
    headline  = `${signal} — proceed with awareness`
    reasoning = `${greenLights.length} confirmations vs ${redFlags.length} flags`
  } else if (redFlags.length > greenLights.length) {
    verdict   = 'NOISE'
    headline  = 'TOO MANY RED FLAGS'
    reasoning = `${redFlags.length} red flags vs ${greenLights.length} confirmations`
  } else {
    verdict   = 'WATCH'
    headline  = 'BORDERLINE — WAIT FOR BETTER ENTRY'
    reasoning = 'Mixed picture — wait for a cleaner setup'
  }

  return {
    verdict,
    headline,
    reasoning,
    setupType,
    invalidationPrice,
    staleness:      { minutesOld: stalenessMins, degraded: stale },
    newsRisk:       { blackout: newsBlackout, nextEvent: next15MinEvents[0]?.event || null },
    liquidityCheck: { ok: liquidityOk, note: liquidityNote },
    calibratedConf: { stated, calibrated, note: calibNote },
    greenLights,
    redFlags,
    triggers,
  }
}

// ── Setup type classifier ─────────────────────────────────────────────────
function classifySetupType(input: {
  signal: string | null
  currentPrice: number
  vwap: number | null
  ema200: number | null
  poc: number | null
  callWall: number | null
  putWall: number | null
  gammaFlip: number | null
  mechanicalScore: number | null
}): SetupType {
  const { signal, currentPrice, vwap, callWall, putWall, gammaFlip, mechanicalScore } = input

  if (!signal || signal === 'NO TRADE' || signal === 'WAIT') return 'NO_SETUP'

  // Breakout — price punching through resistance with momentum + negative gamma
  if (signal === 'LONG' && callWall && currentPrice > callWall - 2 && (mechanicalScore || 0) <= -20) {
    return 'BREAKOUT'
  }
  if (signal === 'SHORT' && putWall && currentPrice < putWall + 2 && (mechanicalScore || 0) >= 20) {
    return 'BREAKOUT'
  }

  // Bounce — entry at support
  if (signal === 'LONG' && putWall && Math.abs(currentPrice - putWall) <= 5) return 'BOUNCE'
  if (signal === 'SHORT' && callWall && Math.abs(currentPrice - callWall) <= 5) return 'BOUNCE'

  // Reversal — at extreme of range
  if (signal === 'LONG' && putWall && currentPrice < putWall) return 'REVERSAL'
  if (signal === 'SHORT' && callWall && currentPrice > callWall) return 'REVERSAL'

  // Mean-revert / range play in positive gamma
  if ((mechanicalScore || 0) > 0 && vwap && Math.abs(currentPrice - vwap) <= 5) return 'RANGE_PLAY'

  // Trend continuation — in line with mechanical bias, at pullback level
  if (signal === 'LONG' && (mechanicalScore || 0) > 20) return 'TREND_CONTINUATION'
  if (signal === 'SHORT' && (mechanicalScore || 0) < -20) return 'TREND_CONTINUATION'

  // Fade — counter-mechanics
  if (signal === 'LONG' && (mechanicalScore || 0) < -20) return 'FADE'
  if (signal === 'SHORT' && (mechanicalScore || 0) > 20) return 'FADE'

  return 'NO_SETUP'
}
