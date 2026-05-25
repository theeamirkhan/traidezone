/**
 * Mechanical Flow Analysis
 *
 * Calculates dealer hedging dynamics:
 * 1. Required hedging flow into close based on net GEX
 * 2. Asymmetric setup detection (flow direction × gamma regime)
 * 3. Charm acceleration into close
 *
 * Core mechanic: dealers hedge to stay delta-neutral
 *   Positive GEX → dealers long gamma → sell rallies, buy dips (mean-reverting)
 *   Negative GEX → dealers short gamma → chase moves (trending/explosive)
 */

export interface MechanicalFlow {
  // Hedging flow forecast
  netGexUSD:             number | null    // dollars per 1% SPX move
  hedgingFlowRemaining:  number | null    // estimated $ flow remaining today
  hedgingDirection:      'SELL_RALLIES' | 'BUY_DIPS' | 'AMPLIFY_MOVES' | 'NEUTRAL'
  hedgingForce:          'STRONG' | 'MODERATE' | 'WEAK'

  // Asymmetric setup
  asymmetricSetup:       'BULLISH_AMPLIFY' | 'BEARISH_AMPLIFY' | 'BULLISH_RESISTED' | 'BEARISH_RESISTED' | 'NEUTRAL'
  asymmetricNote:        string

  // Charm acceleration
  charmIntensity:        'CRITICAL' | 'HIGH' | 'BUILDING' | 'NONE'
  charmDirection:        'BULLISH_DRIFT' | 'BEARISH_DRIFT' | null
  charmDollarsPerHour:   number | null

  // Combined mechanical bias
  mechanicalBias:        'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'TWO_WAY'
  mechanicalScore:       number    // -100 to +100, how strongly mechanics favor one direction

  aiContext:             string
  signal:                string
}

export function calculateMechanicalFlow(input: {
  netGex:             number | null         // dollars
  regime:             string | null         // 'positive' | 'negative'
  gammaFlip:          number | null
  callWall:           number | null
  putWall:            number | null
  charmDollar:        number | null         // dollars per day
  charmNote:          string | null
  charmUrgency:       'HIGH' | 'MODERATE' | 'LOW' | null
  dexBias:            'LONG' | 'SHORT' | 'NEUTRAL' | null
  currentPrice:       number
  sessionMinsLeft:    number
  optionsFlowBias:    string | null         // 'CALL HEAVY' | 'PUT HEAVY' | 'BALANCED'
  marketTideBias:     string | null         // bullish/bearish from tide
  putCallRatio:       number | null
}): MechanicalFlow {
  const {
    netGex, regime, gammaFlip, callWall, putWall,
    charmDollar, charmUrgency, dexBias,
    currentPrice, sessionMinsLeft,
    optionsFlowBias, marketTideBias, putCallRatio,
  } = input

  // ── 1. Hedging flow direction ─────────────────────────────────────────────
  let hedgingDirection: MechanicalFlow['hedgingDirection'] = 'NEUTRAL'
  let hedgingForce:     MechanicalFlow['hedgingForce']     = 'WEAK'
  let hedgingFlowRemaining: number | null = null

  if (netGex !== null) {
    const absGex = Math.abs(netGex)
    hedgingForce =
      absGex > 5e9 ? 'STRONG'   :
      absGex > 1e9 ? 'MODERATE' :
                     'WEAK'

    if (regime === 'positive' || (regime === null && netGex > 0)) {
      // Positive gamma → dealers absorb moves
      hedgingDirection = 'SELL_RALLIES'   // primary effect: rallies fade, dips bought
    } else if (regime === 'negative' || netGex < 0) {
      // Negative gamma → dealers chase moves
      hedgingDirection = 'AMPLIFY_MOVES'
    }

    // Rough flow remaining = netGex × estimated remaining intraday vol
    // Conservative: assume 0.3% remaining range, flow scales with that
    const remainingVolPct = Math.min(0.5, sessionMinsLeft / 390 * 0.5)
    hedgingFlowRemaining = parseFloat((absGex * remainingVolPct / 1e6).toFixed(0))  // in millions
  }

  // ── 2. Asymmetric setup detection ─────────────────────────────────────────
  // Combines options flow direction + dealer positioning
  let asymmetricSetup: MechanicalFlow['asymmetricSetup'] = 'NEUTRAL'
  let asymmetricNote = 'No clear asymmetric setup'

  const flowBullish = optionsFlowBias === 'CALL HEAVY' || marketTideBias === 'bullish' || (putCallRatio !== null && putCallRatio < 0.75)
  const flowBearish = optionsFlowBias === 'PUT HEAVY'  || marketTideBias === 'bearish' || (putCallRatio !== null && putCallRatio > 1.25)
  const negativeGamma = regime === 'negative' || (netGex !== null && netGex < 0)
  const positiveGamma = regime === 'positive' || (netGex !== null && netGex > 0)

  if (flowBullish && negativeGamma) {
    asymmetricSetup = 'BULLISH_AMPLIFY'
    asymmetricNote = `BULLISH AMPLIFY: Call buying + negative gamma — dealers must chase up to hedge short calls. Asymmetric upside.`
  } else if (flowBearish && negativeGamma) {
    asymmetricSetup = 'BEARISH_AMPLIFY'
    asymmetricNote = `BEARISH AMPLIFY: Put buying + negative gamma — dealers must sell into weakness to hedge short puts. Asymmetric downside.`
  } else if (flowBullish && positiveGamma) {
    asymmetricSetup = 'BULLISH_RESISTED'
    asymmetricNote = `BULLISH but RESISTED: Calls buying but positive gamma — dealers sell rallies. Moves limited to call wall ${callWall || '?'}.`
  } else if (flowBearish && positiveGamma) {
    asymmetricSetup = 'BEARISH_RESISTED'
    asymmetricNote = `BEARISH but RESISTED: Puts buying but positive gamma — dealers buy dips. Moves limited to put wall ${putWall || '?'}.`
  }

  // ── 3. Charm acceleration ─────────────────────────────────────────────────
  let charmIntensity: MechanicalFlow['charmIntensity'] = 'NONE'
  let charmDirection: MechanicalFlow['charmDirection'] = null
  let charmDollarsPerHour: number | null = null

  if (charmUrgency && charmDollar !== null) {
    charmIntensity =
      charmUrgency === 'HIGH'     ? 'CRITICAL' :
      charmUrgency === 'MODERATE' ? 'HIGH'     :
                                    'BUILDING'
    charmDirection = charmDollar > 0 ? 'BULLISH_DRIFT' : 'BEARISH_DRIFT'

    // Estimate $/hour based on remaining time
    const hoursLeft = Math.max(0.25, sessionMinsLeft / 60)
    charmDollarsPerHour = Math.abs(charmDollar) / hoursLeft
  }

  // ── 4. Combined mechanical bias score (-100 to +100) ──────────────────────
  let score = 0

  // Asymmetric setup contributes 40 points
  if (asymmetricSetup === 'BULLISH_AMPLIFY')   score += 40
  if (asymmetricSetup === 'BEARISH_AMPLIFY')   score -= 40
  if (asymmetricSetup === 'BULLISH_RESISTED')  score += 15
  if (asymmetricSetup === 'BEARISH_RESISTED')  score -= 15

  // Charm direction contributes up to 30 points based on intensity
  if (charmDirection === 'BULLISH_DRIFT') {
    score += charmIntensity === 'CRITICAL' ? 30 : charmIntensity === 'HIGH' ? 20 : 10
  }
  if (charmDirection === 'BEARISH_DRIFT') {
    score -= charmIntensity === 'CRITICAL' ? 30 : charmIntensity === 'HIGH' ? 20 : 10
  }

  // DEX bias contributes 20 points
  if (dexBias === 'LONG')  score += 20  // dealers long → must sell into rally
  if (dexBias === 'SHORT') score -= 20  // dealers short → must buy into rally

  // Distance from gamma flip contributes 10 points
  if (gammaFlip && currentPrice) {
    const distance = currentPrice - gammaFlip
    if (Math.abs(distance) < 5) {
      // At flip = volatility expected, no bias
    } else if (distance > 0 && positiveGamma) {
      score += 10  // above flip in positive gamma = supported
    } else if (distance < 0 && negativeGamma) {
      score -= 10  // below flip in negative gamma = amplified down
    }
  }

  score = Math.max(-100, Math.min(100, score))

  const mechanicalBias: MechanicalFlow['mechanicalBias'] =
    score >= 30  ? 'BULLISH' :
    score <= -30 ? 'BEARISH' :
    Math.abs(score) < 10 && (asymmetricSetup === 'BULLISH_RESISTED' || asymmetricSetup === 'BEARISH_RESISTED') ? 'TWO_WAY' :
    'NEUTRAL'

  // ── 5. AI context string ──────────────────────────────────────────────────
  const aiContext = [
    `MECHANICAL FLOW ANALYSIS:`,
    `  Net GEX: ${netGex !== null ? `$${(netGex / 1e9).toFixed(1)}B` : 'n/a'} | Regime: ${regime || 'unknown'}`,
    `  Hedging dynamic: ${hedgingDirection === 'SELL_RALLIES' ? 'Dealers SELL rallies, BUY dips (mean-revert)' : hedgingDirection === 'AMPLIFY_MOVES' ? 'Dealers AMPLIFY moves (chase direction)' : 'Neutral hedging'}`,
    `  Hedging force: ${hedgingForce}${hedgingFlowRemaining ? ` (~$${hedgingFlowRemaining}M flow remaining)` : ''}`,
    asymmetricNote,
    charmIntensity !== 'NONE' ? `Charm: ${charmIntensity} ${charmDirection?.replace('_', ' ')} ${charmDollarsPerHour ? `($${(charmDollarsPerHour / 1e6).toFixed(0)}M/hr forced hedging)` : ''}` : '',
    dexBias ? `DEX bias: dealers ${dexBias} delta — must ${dexBias === 'LONG' ? 'SELL' : dexBias === 'SHORT' ? 'BUY' : 'hedge'} into rallies` : '',
    `Mechanical score: ${score > 0 ? '+' : ''}${score} → ${mechanicalBias} bias`,
  ].filter(Boolean).join('\n')

  const signal =
    mechanicalBias === 'BULLISH' ? `Mechanics favor LONG (${score > 0 ? '+' : ''}${score}): ${asymmetricNote.split(':')[0]}` :
    mechanicalBias === 'BEARISH' ? `Mechanics favor SHORT (${score}): ${asymmetricNote.split(':')[0]}` :
    mechanicalBias === 'TWO_WAY' ? `Mechanics two-way: range-bound between ${putWall || '?'}-${callWall || '?'}` :
                                    `Mechanics neutral (score ${score}): no strong dealer hedging signal`

  return {
    netGexUSD: netGex,
    hedgingFlowRemaining,
    hedgingDirection,
    hedgingForce,
    asymmetricSetup,
    asymmetricNote,
    charmIntensity,
    charmDirection,
    charmDollarsPerHour: charmDollarsPerHour !== null ? parseFloat(charmDollarsPerHour.toFixed(0)) : null,
    mechanicalBias,
    mechanicalScore: score,
    aiContext,
    signal,
  }
}
