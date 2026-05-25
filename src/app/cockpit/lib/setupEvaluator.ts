/**
 * Named Setup Evaluator
 *
 * Scores 7 specific SPX intraday setups against current market data.
 * Each setup has its own criteria — confluence isn't generic.
 *
 *   1. VWAP Retest Bounce (LONG)
 *   2. VWAP Retest Reject (SHORT)
 *   3. Prior Day High Breakout (LONG)
 *   4. Prior Day Low Breakdown (SHORT)
 *   5. Double Top (SHORT)
 *   6. Double Bottom (LONG)
 *   7. Trend Line Break (LONG or SHORT)
 */

export type SetupId =
  | 'vwap_retest_long'
  | 'vwap_retest_short'
  | 'pdh_breakout'
  | 'pdl_breakdown'
  | 'double_top'
  | 'double_bottom'
  | 'trendline_break_long'
  | 'trendline_break_short'
  | 'orb_breakout_long'
  | 'orb_breakdown_short'

export interface SetupDefinition {
  id:           SetupId
  name:         string
  direction:    'LONG' | 'SHORT'
  description:  string
  keyLevel:     string   // human-readable label for the level being tested
}

export const SETUPS: SetupDefinition[] = [
  { id: 'vwap_retest_long',     name: 'VWAP Retest Bounce',         direction: 'LONG',  description: 'Price pulls back to VWAP, bounces with bull confirmation', keyLevel: 'VWAP' },
  { id: 'vwap_retest_short',    name: 'VWAP Retest Reject',         direction: 'SHORT', description: 'Price rallies to VWAP from below, rejects with bear confirmation', keyLevel: 'VWAP' },
  { id: 'orb_breakout_long',    name: 'Opening Range Breakout',     direction: 'LONG',  description: 'Price breaks above opening range high with momentum confirmation', keyLevel: 'OR High' },
  { id: 'orb_breakdown_short',  name: 'Opening Range Breakdown',    direction: 'SHORT', description: 'Price breaks below opening range low with momentum confirmation', keyLevel: 'OR Low' },
  { id: 'pdh_breakout',         name: 'Prior Day High Breakout',    direction: 'LONG',  description: 'Price breaks above PDH and holds with momentum', keyLevel: 'PDH' },
  { id: 'pdl_breakdown',        name: 'Prior Day Low Breakdown',    direction: 'SHORT', description: 'Price breaks below PDL with continuation momentum', keyLevel: 'PDL' },
  { id: 'double_top',           name: 'Double Top (Supply Zone)',   direction: 'SHORT', description: 'Second test of intraday supply zone rejects with weakness', keyLevel: 'Intraday High' },
  { id: 'double_bottom',        name: 'Double Bottom (Demand Zone)', direction: 'LONG',  description: 'Second test of intraday demand zone bounces with strength', keyLevel: 'Intraday Low' },
  { id: 'trendline_break_long', name: 'Trend Line Break (LONG)',    direction: 'LONG',  description: 'Downtrend line breaks with momentum confirmation', keyLevel: 'Trend Line' },
  { id: 'trendline_break_short',name: 'Trend Line Break (SHORT)',   direction: 'SHORT', description: 'Uptrend line breaks with momentum confirmation', keyLevel: 'Trend Line' },
]

export interface SetupCriterion {
  label:       string
  status:      'PASS' | 'FAIL' | 'NEUTRAL'
  weight:      number          // 1-3, importance
  detail:      string          // what was checked + actual value
}

export interface SetupEvaluation {
  setup:           SetupDefinition
  score:           number              // 0-100 favorability
  rating:          'STRONG' | 'GOOD' | 'NEUTRAL' | 'WEAK' | 'AVOID'
  verdict:         string              // one-line summary
  criteria:        SetupCriterion[]    // all checked criteria
  confirmingCount: number
  contradictingCount: number
  timingWindow:    string              // best window for this setup
  invalidationPrice: number | null     // explicit failure level
  triggerCondition:  string | null     // what we're still waiting for
}

// ── Main evaluator ────────────────────────────────────────────────────────────
export function evaluateSetup(setupId: SetupId, ctx: {
  currentPrice:      number
  // Levels
  vwap:              number | null
  vwapBand1Up:       number | null
  vwapBand1Dn:       number | null
  pdh:               number | null
  pdl:               number | null
  prevClose:         number | null
  ema200:            number | null
  poc:               number | null
  vah:               number | null
  val:               number | null
  intradayHigh:      number | null
  intradayLow:       number | null
  orbHigh:           number | null   // Opening range high (first 15-30min)
  orbLow:            number | null   // Opening range low
  orbWindowMins:     number | null   // How many minutes the OR window spans (typically 15 or 30)
  minutesSinceOpen:  number          // Minutes since 9:30am ET
  // GEX
  gammaFlip:         number | null
  callWall:          number | null
  putWall:           number | null
  gexRegime:         string | null  // 'positive' | 'negative'
  // Microstructure
  tickValue:         number | null
  trinValue:         number | null
  cumDelta:          string | null  // STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL
  optionsFlowBias:   string | null  // CALL HEAVY / PUT HEAVY / BALANCED
  darkPoolBias:      string | null  // BUY / SELL / NEUTRAL
  // Multi-TF
  h1Trend:           string | null  // BULLISH / BEARISH / RANGING
  m15Trend:          string | null
  dailyTrend:        string | null
  // Mechanical flow
  mechanicalScore:   number | null
  asymmetricSetup:   string | null
  // IV
  ivRank:            number | null
  // Session
  sessionMinsLeft:   number
  sessionName:       string | null
  // Pattern
  patternSummary:    string | null
  candlePatterns:    string | null
  // Volume + move-size context (added for cross-setup normalization)
  currentVolume:     number | null     // last bar volume
  avgVolume:         number | null     // 20-bar average volume
  impliedMove:       number | null     // today's expected SPX range in points
  atr:               number | null     // 14-bar ATR for sizing context
}): SetupEvaluation {
  const setup = SETUPS.find(s => s.id === setupId)
  if (!setup) throw new Error(`Unknown setup: ${setupId}`)

  // Dispatch to specific evaluator
  let criteria: SetupCriterion[] = []
  let invalidation: number | null = null
  let trigger: string | null = null
  let timingWindow = ''

  if (setupId === 'vwap_retest_long') {
    ({ criteria, invalidation, trigger, timingWindow } = evalVwapRetestLong(ctx))
  } else if (setupId === 'vwap_retest_short') {
    ({ criteria, invalidation, trigger, timingWindow } = evalVwapRetestShort(ctx))
  } else if (setupId === 'pdh_breakout') {
    ({ criteria, invalidation, trigger, timingWindow } = evalPdhBreakout(ctx))
  } else if (setupId === 'pdl_breakdown') {
    ({ criteria, invalidation, trigger, timingWindow } = evalPdlBreakdown(ctx))
  } else if (setupId === 'double_top') {
    ({ criteria, invalidation, trigger, timingWindow } = evalDoubleTop(ctx))
  } else if (setupId === 'double_bottom') {
    ({ criteria, invalidation, trigger, timingWindow } = evalDoubleBottom(ctx))
  } else if (setupId === 'trendline_break_long') {
    ({ criteria, invalidation, trigger, timingWindow } = evalTrendlineBreakLong(ctx))
  } else if (setupId === 'trendline_break_short') {
    ({ criteria, invalidation, trigger, timingWindow } = evalTrendlineBreakShort(ctx))
  } else if (setupId === 'orb_breakout_long') {
    ({ criteria, invalidation, trigger, timingWindow } = evalOrbBreakoutLong(ctx))
  } else if (setupId === 'orb_breakdown_short') {
    ({ criteria, invalidation, trigger, timingWindow } = evalOrbBreakdownShort(ctx))
  }

  // ── Compute weighted score ──────────────────────────────────────────────
  const totalWeight     = criteria.reduce((s, c) => s + c.weight, 0)
  const earnedWeight    = criteria.reduce((s, c) => s + (c.status === 'PASS' ? c.weight : c.status === 'FAIL' ? -c.weight : 0), 0)
  const rawScore        = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0
  const score           = Math.round(Math.max(0, Math.min(100, (rawScore + 100) / 2)))  // shift -100..+100 → 0..100

  const confirmingCount    = criteria.filter(c => c.status === 'PASS').length
  const contradictingCount = criteria.filter(c => c.status === 'FAIL').length

  let rating:  SetupEvaluation['rating']
  let verdict: string
  if (score >= 75) { rating = 'STRONG';  verdict = `Strong ${setup.name} setup — ${confirmingCount}/${criteria.length} criteria confirming` }
  else if (score >= 60) { rating = 'GOOD';     verdict = `Good ${setup.name} setup — ${confirmingCount} confirming, ${contradictingCount} flags` }
  else if (score >= 45) { rating = 'NEUTRAL';  verdict = `Mixed — ${confirmingCount} confirming vs ${contradictingCount} contradicting` }
  else if (score >= 30) { rating = 'WEAK';     verdict = `Weak ${setup.name} — only ${confirmingCount} confirmations, ${contradictingCount} flags` }
  else                  { rating = 'AVOID';    verdict = `${contradictingCount} criteria failing — setup not present in current data` }

  return {
    setup,
    score,
    rating,
    verdict,
    criteria,
    confirmingCount,
    contradictingCount,
    timingWindow,
    invalidationPrice: invalidation,
    triggerCondition:  trigger,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared baseline criteria — applied to all setups for consistency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the standard mechanical-flow criteria that every setup should evaluate.
 * - Mechanical score alignment with direction
 * - Asymmetric setup match (AMPLIFY = great, RESISTED = headwind)
 * - POC confluence (does a key level cluster near this play's level)
 * - Volume confirmation (was this bar above average — confirms participation)
 * - Move-size realism (is the target reasonable vs today's implied move/ATR)
 */
function baselineCriteria(c: any, direction: 'LONG' | 'SHORT', keyLevel: number | null): SetupCriterion[] {
  const criteria: SetupCriterion[] = []
  const isBull = direction === 'LONG'

  // 1. Mechanical score alignment
  criteria.push({
    label:  `Mechanical flow ${isBull ? 'not bearish' : 'not bullish'}`,
    status: c.mechanicalScore === null
      ? 'NEUTRAL'
      : isBull && c.mechanicalScore >= 10
        ? 'PASS'
        : isBull && c.mechanicalScore <= -30
          ? 'FAIL'
          : !isBull && c.mechanicalScore <= -10
            ? 'PASS'
            : !isBull && c.mechanicalScore >= 30
              ? 'FAIL'
              : 'NEUTRAL',
    weight: 2,
    detail: `Mech score: ${c.mechanicalScore !== null ? (c.mechanicalScore > 0 ? '+' : '') + c.mechanicalScore : 'n/a'}`,
  })

  // 2. Asymmetric setup match
  const wantAmplify = isBull ? 'BULLISH_AMPLIFY' : 'BEARISH_AMPLIFY'
  const opposeAmplify = isBull ? 'BEARISH_AMPLIFY' : 'BULLISH_AMPLIFY'
  const ownResisted = isBull ? 'BULLISH_RESISTED' : 'BEARISH_RESISTED'
  criteria.push({
    label:  'Asymmetric setup aligned',
    status: c.asymmetricSetup === wantAmplify
      ? 'PASS'
      : c.asymmetricSetup === opposeAmplify
        ? 'FAIL'
        : c.asymmetricSetup === ownResisted
          ? 'FAIL'        // dealers will resist your direction
          : 'NEUTRAL',
    weight: 2,
    detail: c.asymmetricSetup || 'NEUTRAL',
  })

  // 3. POC confluence — is POC clustering near our key level?
  if (keyLevel !== null && c.poc !== null) {
    const dist = Math.abs(c.poc - keyLevel)
    criteria.push({
      label:  'POC confluence at key level',
      status: dist <= 3 ? 'PASS' : dist <= 8 ? 'NEUTRAL' : 'NEUTRAL',
      weight: 1,
      detail: dist <= 3
        ? `POC ${c.poc.toFixed(0)} clustering with level (within ${dist.toFixed(1)}pts)`
        : `POC ${c.poc.toFixed(0)} is ${dist.toFixed(0)}pts away from level`,
    })
  }

  // 4. Volume confirmation
  if (c.currentVolume !== null && c.avgVolume !== null && c.avgVolume > 0) {
    const ratio = c.currentVolume / c.avgVolume
    criteria.push({
      label:  'Volume confirming move',
      status: ratio > 1.3 ? 'PASS' : ratio < 0.6 ? 'FAIL' : 'NEUTRAL',
      weight: 2,
      detail: `Current bar volume ${Math.round(ratio * 100)}% of 20-bar avg`,
    })
  }

  return criteria
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-setup evaluators — each scores its specific criteria
// ─────────────────────────────────────────────────────────────────────────────

function evalVwapRetestLong(c: any): { criteria: SetupCriterion[]; invalidation: number | null; trigger: string | null; timingWindow: string } {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice

  // 1. Price near VWAP (within 4pts)
  if (c.vwap) {
    const dist = Math.abs(price - c.vwap)
    criteria.push({
      label:  'Price at VWAP retest zone',
      status: dist <= 4 ? 'PASS' : 'FAIL',
      weight: 3,
      detail: `Price ${price.toFixed(0)}, VWAP ${c.vwap.toFixed(0)} (${dist.toFixed(1)}pts away)`,
    })
  }

  // 2. Approaching from above (we want pullback, not breakdown)
  if (c.vwap) {
    const aboveVwap = price >= c.vwap - 1
    criteria.push({
      label:  'Approaching from above (pullback)',
      status: aboveVwap ? 'PASS' : 'FAIL',
      weight: 2,
      detail: aboveVwap ? `Price ${price.toFixed(0)} ≥ VWAP ${c.vwap.toFixed(0)} — valid pullback` : `Price below VWAP — this is breakdown not retest`,
    })
  }

  // 3. Cumulative delta confirming (buyers stepping in)
  criteria.push({
    label:  'Cumulative delta supports LONG',
    status: c.cumDelta === 'STRONG_BUY' || c.cumDelta === 'BUY' ? 'PASS' : c.cumDelta === 'STRONG_SELL' || c.cumDelta === 'SELL' ? 'FAIL' : 'NEUTRAL',
    weight: 3,
    detail: `Cum delta: ${c.cumDelta || 'n/a'}`,
  })

  // 4. TICK positive (broad buying)
  if (c.tickValue !== null) {
    criteria.push({
      label:  'NYSE TICK confirms broad buying',
      status: c.tickValue > 200 ? 'PASS' : c.tickValue < -200 ? 'FAIL' : 'NEUTRAL',
      weight: 2,
      detail: `TICK ${c.tickValue > 0 ? '+' : ''}${c.tickValue}`,
    })
  }

  // 5. Positive gamma supports VWAP (dealers buy dips)
  criteria.push({
    label:  'Dealers in positive gamma (absorb dips)',
    status: c.gexRegime === 'positive' ? 'PASS' : c.gexRegime === 'negative' ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: c.gexRegime ? `GEX regime: ${c.gexRegime}` : 'GEX data unavailable',
  })

  // 6. Higher timeframe alignment (1hr not bearish)
  criteria.push({
    label:  '1-hour trend not bearish',
    status: c.h1Trend === 'BULLISH' ? 'PASS' : c.h1Trend === 'BEARISH' ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: `1hr: ${c.h1Trend || 'n/a'}`,
  })

  // 8. Session timing
  criteria.push({
    label:  'Session timing favorable',
    status: c.sessionMinsLeft > 120 ? 'PASS' : c.sessionMinsLeft < 60 ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: `${c.sessionMinsLeft}min left | ${c.sessionName || 'n/a'}`,
  })

  // 10. Options flow not heavy puts
  criteria.push({
    label:  'Options flow not heavy puts',
    status: c.optionsFlowBias === 'CALL HEAVY' ? 'PASS' : c.optionsFlowBias === 'PUT HEAVY' ? 'FAIL' : 'NEUTRAL',
    weight: 1,
    detail: `Flow: ${c.optionsFlowBias || 'n/a'}`,
  })

  // Baseline criteria — mechanical flow + asymmetric + POC + volume (applied universally)
  criteria.push(...baselineCriteria(c, 'LONG', c.vwap))

  const invalidation = c.vwap ? c.vwap - 3 : null
  const trigger = c.vwap && price > c.vwap + 3
    ? `Wait for price to pull back closer to VWAP ${c.vwap.toFixed(0)} (currently ${price.toFixed(0)})`
    : c.cumDelta && c.cumDelta !== 'STRONG_BUY' && c.cumDelta !== 'BUY'
    ? `Wait for cum delta to turn STRONG_BUY before entering`
    : null

  return {
    criteria,
    invalidation,
    trigger,
    timingWindow: 'Best 10am-12pm (post-opening drive, before theta) | Hit rate drops after 2pm',
  }
}

function evalVwapRetestShort(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  if (c.vwap) {
    const dist = Math.abs(price - c.vwap)
    criteria.push({ label: 'Price at VWAP rejection zone', status: dist <= 4 ? 'PASS' : 'FAIL', weight: 3, detail: `Price ${price.toFixed(0)}, VWAP ${c.vwap.toFixed(0)} (${dist.toFixed(1)}pts)` })
  }
  if (c.vwap) {
    const belowVwap = price <= c.vwap + 1
    criteria.push({ label: 'Approaching from below (rejection setup)', status: belowVwap ? 'PASS' : 'FAIL', weight: 2, detail: belowVwap ? `Price ≤ VWAP — valid rejection setup` : `Price above VWAP — this is breakout not rejection` })
  }
  criteria.push({ label: 'Cumulative delta supports SHORT', status: c.cumDelta === 'STRONG_SELL' || c.cumDelta === 'SELL' ? 'PASS' : c.cumDelta === 'STRONG_BUY' || c.cumDelta === 'BUY' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: `Cum delta: ${c.cumDelta || 'n/a'}` })
  if (c.tickValue !== null) criteria.push({ label: 'NYSE TICK confirms broad selling', status: c.tickValue < -200 ? 'PASS' : c.tickValue > 200 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue > 0 ? '+' : ''}${c.tickValue}` })
  criteria.push({ label: 'Dealers positioning favors rejection', status: c.gexRegime === 'positive' ? 'PASS' : 'NEUTRAL', weight: 2, detail: c.gexRegime ? `GEX: ${c.gexRegime} (positive = VWAP rejects)` : 'n/a' })
  criteria.push({ label: '1-hour trend not bullish', status: c.h1Trend === 'BEARISH' ? 'PASS' : c.h1Trend === 'BULLISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'}` })
  criteria.push({ label: 'Session timing favorable', status: c.sessionMinsLeft > 120 ? 'PASS' : c.sessionMinsLeft < 60 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `${c.sessionMinsLeft}min left` })
  criteria.push({ label: 'Options flow not heavy calls', status: c.optionsFlowBias === 'PUT HEAVY' ? 'PASS' : c.optionsFlowBias === 'CALL HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 1, detail: `Flow: ${c.optionsFlowBias || 'n/a'}` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'SHORT', c.vwap))

  return {
    criteria,
    invalidation: c.vwap ? c.vwap + 3 : null,
    trigger: c.vwap && price < c.vwap - 3 ? `Wait for rally back to VWAP ${c.vwap.toFixed(0)}` : null,
    timingWindow: 'Best 10am-12pm or 2-3pm | Avoid <60min to close',
  }
}

function evalPdhBreakout(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  if (c.pdh) {
    const above = price > c.pdh
    criteria.push({ label: 'Price above PDH', status: above ? 'PASS' : 'FAIL', weight: 3, detail: `Price ${price.toFixed(0)}, PDH ${c.pdh.toFixed(0)} (${above ? '+' : ''}${(price - c.pdh).toFixed(1)}pts)` })
    const holdingAbove = price > c.pdh + 1
    criteria.push({ label: 'Holding above PDH (>1pt)', status: holdingAbove ? 'PASS' : 'NEUTRAL', weight: 2, detail: holdingAbove ? `Price ${(price - c.pdh).toFixed(1)}pts above — confirmed hold` : `Price marginal — not confirmed yet` })
  }
  // For breakouts you WANT negative gamma — dealers chase
  criteria.push({ label: 'Negative gamma amplifies breakout', status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: c.gexRegime === 'positive' ? `Positive gamma = dealers SELL rallies, breakouts fade` : c.gexRegime === 'negative' ? `Negative gamma = dealers chase, breakouts run` : 'n/a' })
  criteria.push({ label: 'Cumulative delta strong buying', status: c.cumDelta === 'STRONG_BUY' ? 'PASS' : c.cumDelta === 'BUY' ? 'NEUTRAL' : c.cumDelta === 'SELL' || c.cumDelta === 'STRONG_SELL' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: `Cum delta: ${c.cumDelta || 'n/a'}` })
  if (c.tickValue !== null) criteria.push({ label: 'TICK reading strong (>400)', status: c.tickValue > 400 ? 'PASS' : c.tickValue < 0 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue > 0 ? '+' : ''}${c.tickValue}` })
  if (c.callWall && c.pdh) {
    const callWallAbove = c.callWall - c.pdh
    criteria.push({ label: 'No major call wall capping move', status: callWallAbove > 10 ? 'PASS' : callWallAbove > 0 ? 'NEUTRAL' : 'NEUTRAL', weight: 2, detail: callWallAbove > 10 ? `Call wall ${c.callWall.toFixed(0)} is ${callWallAbove.toFixed(0)}pts above PDH — room to run` : `Call wall ${c.callWall?.toFixed(0)} only ${callWallAbove.toFixed(0)}pts above PDH — limited room` })
  }
  criteria.push({ label: 'Options flow CALL HEAVY confirming', status: c.optionsFlowBias === 'CALL HEAVY' ? 'PASS' : c.optionsFlowBias === 'PUT HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `Flow: ${c.optionsFlowBias || 'n/a'}` })
  criteria.push({ label: '1-hour trend supports', status: c.h1Trend === 'BULLISH' ? 'PASS' : c.h1Trend === 'BEARISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'}` })
  criteria.push({ label: 'Session timing — midday best for breakouts', status: c.sessionMinsLeft > 60 && c.sessionMinsLeft < 330 ? 'PASS' : 'NEUTRAL', weight: 2, detail: `${c.sessionMinsLeft}min left — ${c.sessionMinsLeft > 60 && c.sessionMinsLeft < 330 ? 'midday window favorable' : 'sub-optimal timing'}` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'LONG', c.pdh))

  return {
    criteria,
    invalidation: c.pdh ? c.pdh - 2 : null,
    trigger: c.pdh && price < c.pdh ? `Wait for clean break + hold above PDH ${c.pdh.toFixed(0)}` : null,
    timingWindow: 'Best 11am-1pm (post-opening flush, before close) | Avoid first 30min',
  }
}

function evalPdlBreakdown(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  if (c.pdl) {
    const below = price < c.pdl
    criteria.push({ label: 'Price below PDL', status: below ? 'PASS' : 'FAIL', weight: 3, detail: `Price ${price.toFixed(0)}, PDL ${c.pdl.toFixed(0)} (${(price - c.pdl).toFixed(1)}pts)` })
    criteria.push({ label: 'Holding below PDL (>1pt)', status: price < c.pdl - 1 ? 'PASS' : 'NEUTRAL', weight: 2, detail: `Distance: ${(c.pdl - price).toFixed(1)}pts below` })
  }
  criteria.push({ label: 'Negative gamma amplifies breakdown', status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: c.gexRegime || 'n/a' })
  criteria.push({ label: 'Cumulative delta strong selling', status: c.cumDelta === 'STRONG_SELL' ? 'PASS' : c.cumDelta === 'SELL' ? 'NEUTRAL' : c.cumDelta === 'BUY' || c.cumDelta === 'STRONG_BUY' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: `Cum delta: ${c.cumDelta || 'n/a'}` })
  if (c.tickValue !== null) criteria.push({ label: 'TICK reading strong negative (<-400)', status: c.tickValue < -400 ? 'PASS' : c.tickValue > 0 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue}` })
  if (c.putWall && c.pdl) {
    const putWallBelow = c.pdl - c.putWall
    criteria.push({ label: 'No major put wall holding floor', status: putWallBelow > 10 ? 'PASS' : 'NEUTRAL', weight: 2, detail: putWallBelow > 10 ? `Put wall ${c.putWall.toFixed(0)} is ${putWallBelow.toFixed(0)}pts below PDL — room to fall` : `Put wall close — may hold ${c.putWall?.toFixed(0)}` })
  }
  criteria.push({ label: 'Options flow PUT HEAVY confirming', status: c.optionsFlowBias === 'PUT HEAVY' ? 'PASS' : c.optionsFlowBias === 'CALL HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `Flow: ${c.optionsFlowBias || 'n/a'}` })
  criteria.push({ label: '1-hour trend supports', status: c.h1Trend === 'BEARISH' ? 'PASS' : c.h1Trend === 'BULLISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'}` })
  criteria.push({ label: 'Dark pool selling pressure', status: c.darkPoolBias === 'SELL' ? 'PASS' : c.darkPoolBias === 'BUY' ? 'FAIL' : 'NEUTRAL', weight: 1, detail: `Dark pool: ${c.darkPoolBias || 'n/a'}` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'SHORT', c.pdl))

  return {
    criteria,
    invalidation: c.pdl ? c.pdl + 2 : null,
    trigger: c.pdl && price > c.pdl ? `Wait for clean break below PDL ${c.pdl.toFixed(0)} with momentum` : null,
    timingWindow: 'Best 11am-2pm | Avoid first 30min (noise) and last 30min (mean revert)',
  }
}

function evalDoubleTop(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  if (c.intradayHigh) {
    const nearHigh = Math.abs(price - c.intradayHigh) <= 3
    criteria.push({ label: 'Price retesting intraday high', status: nearHigh ? 'PASS' : 'FAIL', weight: 3, detail: nearHigh ? `Within ${Math.abs(price - c.intradayHigh).toFixed(1)}pts of HOD ${c.intradayHigh.toFixed(0)}` : `${Math.abs(price - c.intradayHigh).toFixed(0)}pts from HOD — not at retest yet` })
  }
  // Volume should be LESS on second test
  criteria.push({ label: 'Cumulative delta weakening (no follow-through)', status: c.cumDelta === 'NEUTRAL' || c.cumDelta === 'SELL' ? 'PASS' : c.cumDelta === 'STRONG_BUY' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: `Cum delta: ${c.cumDelta || 'n/a'} — weak buying on retest = confirmation` })
  if (c.tickValue !== null) criteria.push({ label: 'TICK weaker than first test', status: c.tickValue < 200 ? 'PASS' : c.tickValue > 500 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue} — should be modest on retest` })
  criteria.push({ label: 'Positive gamma supports rejection', status: c.gexRegime === 'positive' ? 'PASS' : c.gexRegime === 'negative' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: c.gexRegime || 'n/a' })
  if (c.callWall && c.intradayHigh) {
    const wallAtHigh = Math.abs(c.callWall - c.intradayHigh) <= 5
    criteria.push({ label: 'Call wall near intraday high (caps move)', status: wallAtHigh ? 'PASS' : 'NEUTRAL', weight: 2, detail: wallAtHigh ? `Call wall ${c.callWall.toFixed(0)} clustering with HOD — strong cap` : `Call wall ${c.callWall?.toFixed(0)} away from HOD` })
  }
  criteria.push({ label: 'Options flow not heavily bullish', status: c.optionsFlowBias === 'PUT HEAVY' ? 'PASS' : c.optionsFlowBias === 'CALL HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `Flow: ${c.optionsFlowBias || 'n/a'}` })
  criteria.push({ label: 'Reversal pattern in candles', status: c.candlePatterns?.includes('doji') || c.candlePatterns?.includes('shooting_star') || c.candlePatterns?.includes('bearish_engulfing') ? 'PASS' : 'NEUTRAL', weight: 1, detail: c.candlePatterns ? `Patterns: ${c.candlePatterns}` : 'No patterns detected' })
  criteria.push({ label: '1-hour trend rolling over', status: c.h1Trend === 'BEARISH' ? 'PASS' : c.h1Trend === 'BULLISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'} — bullish trend makes top harder to hold` })
  criteria.push({ label: 'Session timing favorable', status: c.sessionMinsLeft > 60 ? 'PASS' : 'NEUTRAL', weight: 1, detail: `${c.sessionMinsLeft}min left` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'SHORT', c.intradayHigh))

  return {
    criteria,
    invalidation: c.intradayHigh ? c.intradayHigh + 2 : null,
    trigger: c.intradayHigh && Math.abs(price - c.intradayHigh) > 3 ? `Wait for price to retest HOD ${c.intradayHigh.toFixed(0)}` : null,
    timingWindow: 'Best when 2nd test occurs 30+ min after 1st test | Avoid choppy 11am-1pm if range is tight',
  }
}

function evalDoubleBottom(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  if (c.intradayLow) {
    const nearLow = Math.abs(price - c.intradayLow) <= 3
    criteria.push({ label: 'Price retesting intraday low', status: nearLow ? 'PASS' : 'FAIL', weight: 3, detail: nearLow ? `Within ${Math.abs(price - c.intradayLow).toFixed(1)}pts of LOD ${c.intradayLow.toFixed(0)}` : `${Math.abs(price - c.intradayLow).toFixed(0)}pts from LOD` })
  }
  criteria.push({ label: 'Selling exhaustion (delta weakening)', status: c.cumDelta === 'NEUTRAL' || c.cumDelta === 'BUY' ? 'PASS' : c.cumDelta === 'STRONG_SELL' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: `Cum delta: ${c.cumDelta || 'n/a'}` })
  if (c.tickValue !== null) criteria.push({ label: 'TICK improving (less negative than first test)', status: c.tickValue > -200 ? 'PASS' : c.tickValue < -500 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue}` })
  criteria.push({ label: 'Positive gamma supports bounce', status: c.gexRegime === 'positive' ? 'PASS' : c.gexRegime === 'negative' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: c.gexRegime || 'n/a' })
  if (c.putWall && c.intradayLow) {
    const wallAtLow = Math.abs(c.putWall - c.intradayLow) <= 5
    criteria.push({ label: 'Put wall near low (holds floor)', status: wallAtLow ? 'PASS' : 'NEUTRAL', weight: 2, detail: wallAtLow ? `Put wall ${c.putWall.toFixed(0)} clustering with LOD — strong floor` : `Put wall ${c.putWall?.toFixed(0)} away` })
  }
  criteria.push({ label: 'Options flow not heavily bearish', status: c.optionsFlowBias === 'CALL HEAVY' ? 'PASS' : c.optionsFlowBias === 'PUT HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `Flow: ${c.optionsFlowBias || 'n/a'}` })
  criteria.push({ label: 'Bullish reversal pattern', status: c.candlePatterns?.includes('hammer') || c.candlePatterns?.includes('bullish_engulfing') || c.candlePatterns?.includes('doji') ? 'PASS' : 'NEUTRAL', weight: 1, detail: c.candlePatterns ? `Patterns: ${c.candlePatterns}` : 'None detected' })
  criteria.push({ label: 'Dark pool buying', status: c.darkPoolBias === 'BUY' ? 'PASS' : c.darkPoolBias === 'SELL' ? 'FAIL' : 'NEUTRAL', weight: 1, detail: `Dark pool: ${c.darkPoolBias || 'n/a'}` })
  criteria.push({ label: '1-hour trend stabilizing', status: c.h1Trend === 'BULLISH' ? 'PASS' : c.h1Trend === 'BEARISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'} — bearish trend makes bottom harder to hold` })
  criteria.push({ label: 'Session timing favorable', status: c.sessionMinsLeft > 60 ? 'PASS' : 'NEUTRAL', weight: 1, detail: `${c.sessionMinsLeft}min left` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'LONG', c.intradayLow))

  return {
    criteria,
    invalidation: c.intradayLow ? c.intradayLow - 2 : null,
    trigger: c.intradayLow && Math.abs(price - c.intradayLow) > 3 ? `Wait for price to retest LOD ${c.intradayLow.toFixed(0)}` : null,
    timingWindow: 'Best when 2nd test occurs 30+ min after 1st test',
  }
}

function evalTrendlineBreakLong(c: any): any {
  const criteria: SetupCriterion[] = []
  // Note: trend line breaks are detected via pattern engine, not pure price
  criteria.push({ label: 'Pattern engine detects trend line break (LONG)', status: c.patternSummary?.toLowerCase().includes('breakout') || c.patternSummary?.toLowerCase().includes('trend line') ? 'PASS' : 'NEUTRAL', weight: 3, detail: c.patternSummary || 'No pattern detected yet — verify visually' })
  criteria.push({ label: 'Negative gamma amplifies breakout', status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: c.gexRegime || 'n/a' })
  criteria.push({ label: 'Cumulative delta confirms break', status: c.cumDelta === 'STRONG_BUY' ? 'PASS' : c.cumDelta === 'BUY' ? 'NEUTRAL' : 'FAIL', weight: 3, detail: c.cumDelta || 'n/a' })
  if (c.tickValue !== null) criteria.push({ label: 'TICK strong positive', status: c.tickValue > 300 ? 'PASS' : c.tickValue < 0 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue > 0 ? '+' : ''}${c.tickValue}` })
  criteria.push({ label: 'Higher timeframe alignment', status: c.h1Trend === 'BULLISH' ? 'PASS' : c.h1Trend === 'BEARISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'}` })
  criteria.push({ label: 'Options flow CALL HEAVY', status: c.optionsFlowBias === 'CALL HEAVY' ? 'PASS' : c.optionsFlowBias === 'PUT HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: c.optionsFlowBias || 'n/a' })
  criteria.push({ label: 'Session timing', status: c.sessionMinsLeft > 60 ? 'PASS' : 'FAIL', weight: 1, detail: `${c.sessionMinsLeft}min left` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'LONG', c.currentPrice))

  return {
    criteria,
    invalidation: c.currentPrice - 5,
    trigger: !c.patternSummary?.toLowerCase().includes('break') ? 'Waiting for confirmed trend line break — verify on chart' : null,
    timingWindow: 'Best when break occurs after consolidation in 11am-1pm window',
  }
}

function evalTrendlineBreakShort(c: any): any {
  const criteria: SetupCriterion[] = []
  criteria.push({ label: 'Pattern engine detects trend line break (SHORT)', status: c.patternSummary?.toLowerCase().includes('breakdown') || c.patternSummary?.toLowerCase().includes('trend line') ? 'PASS' : 'NEUTRAL', weight: 3, detail: c.patternSummary || 'Verify on chart' })
  criteria.push({ label: 'Negative gamma amplifies break', status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL', weight: 3, detail: c.gexRegime || 'n/a' })
  criteria.push({ label: 'Cumulative delta confirms', status: c.cumDelta === 'STRONG_SELL' ? 'PASS' : c.cumDelta === 'SELL' ? 'NEUTRAL' : 'FAIL', weight: 3, detail: c.cumDelta || 'n/a' })
  if (c.tickValue !== null) criteria.push({ label: 'TICK strong negative', status: c.tickValue < -300 ? 'PASS' : c.tickValue > 0 ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `TICK ${c.tickValue}` })
  criteria.push({ label: 'Higher timeframe alignment', status: c.h1Trend === 'BEARISH' ? 'PASS' : c.h1Trend === 'BULLISH' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: `1hr: ${c.h1Trend || 'n/a'}` })
  criteria.push({ label: 'Options flow PUT HEAVY', status: c.optionsFlowBias === 'PUT HEAVY' ? 'PASS' : c.optionsFlowBias === 'CALL HEAVY' ? 'FAIL' : 'NEUTRAL', weight: 2, detail: c.optionsFlowBias || 'n/a' })
  criteria.push({ label: 'Session timing', status: c.sessionMinsLeft > 60 ? 'PASS' : 'FAIL', weight: 1, detail: `${c.sessionMinsLeft}min left` })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'SHORT', c.currentPrice))

  return {
    criteria,
    invalidation: c.currentPrice + 5,
    trigger: !c.patternSummary?.toLowerCase().includes('break') ? 'Waiting for confirmed trend line break' : null,
    timingWindow: 'Best when break occurs after consolidation',
  }
}

function evalOrbBreakoutLong(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  const orbWindow = c.orbWindowMins || 15

  // 1. Opening range is established
  criteria.push({
    label:  `Opening range established (first ${orbWindow}min)`,
    status: c.orbHigh && c.orbLow && c.minutesSinceOpen >= orbWindow ? 'PASS' : 'FAIL',
    weight: 3,
    detail: c.orbHigh && c.orbLow
      ? `OR: ${c.orbLow.toFixed(0)} — ${c.orbHigh.toFixed(0)} (${(c.orbHigh - c.orbLow).toFixed(1)}pt range)`
      : `Waiting — ${c.minutesSinceOpen}min since open, need ${orbWindow}min`,
  })

  // 2. Price above OR high (breakout confirmed)
  if (c.orbHigh) {
    const above = price > c.orbHigh
    const clear = price > c.orbHigh + 1
    criteria.push({
      label:  'Price above OR high (>1pt clear)',
      status: clear ? 'PASS' : above ? 'NEUTRAL' : 'FAIL',
      weight: 3,
      detail: above
        ? `Price ${price.toFixed(0)} vs OR high ${c.orbHigh.toFixed(0)} (+${(price - c.orbHigh).toFixed(1)}pts)`
        : `Price below OR high — no breakout yet`,
    })
  }

  // 3. Negative gamma amplifies (breakouts run, not fade)
  criteria.push({
    label:  'Negative gamma amplifies breakout',
    status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL',
    weight: 3,
    detail: c.gexRegime === 'positive'
      ? 'Positive gamma = dealers SELL rallies — ORB likely fades'
      : c.gexRegime === 'negative'
      ? 'Negative gamma = dealers chase — ORB runs'
      : 'GEX regime unknown',
  })

  // 4. Cumulative delta confirming
  criteria.push({
    label:  'Cumulative delta strong buying',
    status: c.cumDelta === 'STRONG_BUY' ? 'PASS' : c.cumDelta === 'BUY' ? 'NEUTRAL' : c.cumDelta === 'SELL' || c.cumDelta === 'STRONG_SELL' ? 'FAIL' : 'NEUTRAL',
    weight: 3,
    detail: `Cum delta: ${c.cumDelta || 'n/a'}`,
  })

  // 5. TICK strong (>400)
  if (c.tickValue !== null) {
    criteria.push({
      label:  'NYSE TICK strong (>400)',
      status: c.tickValue > 400 ? 'PASS' : c.tickValue < 0 ? 'FAIL' : 'NEUTRAL',
      weight: 2,
      detail: `TICK ${c.tickValue > 0 ? '+' : ''}${c.tickValue}`,
    })
  }

  // 6. Timing — best in first 30-90min after OR completes
  const idealWindow = c.minutesSinceOpen >= orbWindow && c.minutesSinceOpen <= 90
  criteria.push({
    label:  'Within ideal ORB window',
    status: idealWindow ? 'PASS' : c.minutesSinceOpen > 120 ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: c.minutesSinceOpen < orbWindow
      ? `Too early — OR not complete (${c.minutesSinceOpen}/${orbWindow}min)`
      : c.minutesSinceOpen > 120
      ? `Too late — ORB validity decays after ~2 hours (${c.minutesSinceOpen}min in)`
      : `${c.minutesSinceOpen}min after open — within ORB window`,
  })

  // 7. No major call wall capping
  if (c.callWall && c.orbHigh) {
    const headroom = c.callWall - c.orbHigh
    criteria.push({
      label:  'Room above OR high (no call wall capping)',
      status: headroom > 10 ? 'PASS' : headroom > 5 ? 'NEUTRAL' : 'FAIL',
      weight: 2,
      detail: headroom > 10
        ? `Call wall ${c.callWall.toFixed(0)} is ${headroom.toFixed(0)}pts above OR high — room to run`
        : `Call wall ${c.callWall.toFixed(0)} only ${headroom.toFixed(0)}pts above OR high — limited room`,
    })
  }

  // 8. Options flow CALL HEAVY
  criteria.push({
    label:  'Options flow CALL HEAVY confirming',
    status: c.optionsFlowBias === 'CALL HEAVY' ? 'PASS' : c.optionsFlowBias === 'PUT HEAVY' ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: `Flow: ${c.optionsFlowBias || 'n/a'}`,
  })

  // 9. 1-hour trend not bearish
  criteria.push({
    label:  '1-hour trend not bearish',
    status: c.h1Trend === 'BULLISH' ? 'PASS' : c.h1Trend === 'BEARISH' ? 'FAIL' : 'NEUTRAL',
    weight: 1,
    detail: `1hr: ${c.h1Trend || 'n/a'}`,
  })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'LONG', c.orbHigh))

  return {
    criteria,
    invalidation: c.orbHigh ? c.orbHigh - 1 : null,  // back inside OR = false break
    trigger: c.orbHigh && c.minutesSinceOpen < orbWindow
      ? `Wait for OR to complete (${c.minutesSinceOpen}/${orbWindow}min) before evaluating`
      : c.orbHigh && price < c.orbHigh
      ? `Wait for price to break above OR high ${c.orbHigh.toFixed(0)} (currently ${price.toFixed(0)})`
      : null,
    timingWindow: 'Best 9:45am-11:00am after 15min OR completes | Validity decays after 2 hours',
  }
}

function evalOrbBreakdownShort(c: any): any {
  const criteria: SetupCriterion[] = []
  const price = c.currentPrice
  const orbWindow = c.orbWindowMins || 15

  criteria.push({
    label:  `Opening range established (first ${orbWindow}min)`,
    status: c.orbHigh && c.orbLow && c.minutesSinceOpen >= orbWindow ? 'PASS' : 'FAIL',
    weight: 3,
    detail: c.orbHigh && c.orbLow
      ? `OR: ${c.orbLow.toFixed(0)} — ${c.orbHigh.toFixed(0)} (${(c.orbHigh - c.orbLow).toFixed(1)}pt range)`
      : `Waiting — ${c.minutesSinceOpen}min since open, need ${orbWindow}min`,
  })

  if (c.orbLow) {
    const below = price < c.orbLow
    const clear = price < c.orbLow - 1
    criteria.push({
      label:  'Price below OR low (>1pt clear)',
      status: clear ? 'PASS' : below ? 'NEUTRAL' : 'FAIL',
      weight: 3,
      detail: below
        ? `Price ${price.toFixed(0)} vs OR low ${c.orbLow.toFixed(0)} (${(price - c.orbLow).toFixed(1)}pts)`
        : `Price above OR low — no breakdown yet`,
    })
  }

  criteria.push({
    label:  'Negative gamma amplifies breakdown',
    status: c.gexRegime === 'negative' ? 'PASS' : c.gexRegime === 'positive' ? 'FAIL' : 'NEUTRAL',
    weight: 3,
    detail: c.gexRegime === 'positive'
      ? 'Positive gamma = dealers BUY dips — ORB likely fades'
      : c.gexRegime === 'negative'
      ? 'Negative gamma = dealers sell into weakness — ORB runs'
      : 'GEX regime unknown',
  })

  criteria.push({
    label:  'Cumulative delta strong selling',
    status: c.cumDelta === 'STRONG_SELL' ? 'PASS' : c.cumDelta === 'SELL' ? 'NEUTRAL' : c.cumDelta === 'BUY' || c.cumDelta === 'STRONG_BUY' ? 'FAIL' : 'NEUTRAL',
    weight: 3,
    detail: `Cum delta: ${c.cumDelta || 'n/a'}`,
  })

  if (c.tickValue !== null) {
    criteria.push({
      label:  'NYSE TICK strong negative (<-400)',
      status: c.tickValue < -400 ? 'PASS' : c.tickValue > 0 ? 'FAIL' : 'NEUTRAL',
      weight: 2,
      detail: `TICK ${c.tickValue}`,
    })
  }

  const idealWindow = c.minutesSinceOpen >= orbWindow && c.minutesSinceOpen <= 90
  criteria.push({
    label:  'Within ideal ORB window',
    status: idealWindow ? 'PASS' : c.minutesSinceOpen > 120 ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: c.minutesSinceOpen < orbWindow
      ? `Too early — OR not complete (${c.minutesSinceOpen}/${orbWindow}min)`
      : c.minutesSinceOpen > 120
      ? `Too late — ORB validity decays after ~2 hours`
      : `${c.minutesSinceOpen}min after open`,
  })

  if (c.putWall && c.orbLow) {
    const headroom = c.orbLow - c.putWall
    criteria.push({
      label:  'Room below OR low (no put wall holding)',
      status: headroom > 10 ? 'PASS' : headroom > 5 ? 'NEUTRAL' : 'FAIL',
      weight: 2,
      detail: headroom > 10
        ? `Put wall ${c.putWall.toFixed(0)} is ${headroom.toFixed(0)}pts below OR low — room to fall`
        : `Put wall ${c.putWall.toFixed(0)} close — may hold`,
    })
  }

  criteria.push({
    label:  'Options flow PUT HEAVY confirming',
    status: c.optionsFlowBias === 'PUT HEAVY' ? 'PASS' : c.optionsFlowBias === 'CALL HEAVY' ? 'FAIL' : 'NEUTRAL',
    weight: 2,
    detail: `Flow: ${c.optionsFlowBias || 'n/a'}`,
  })

  criteria.push({
    label:  '1-hour trend not bullish',
    status: c.h1Trend === 'BEARISH' ? 'PASS' : c.h1Trend === 'BULLISH' ? 'FAIL' : 'NEUTRAL',
    weight: 1,
    detail: `1hr: ${c.h1Trend || 'n/a'}`,
  })

  // Baseline criteria
  criteria.push(...baselineCriteria(c, 'SHORT', c.orbLow))

  return {
    criteria,
    invalidation: c.orbLow ? c.orbLow + 1 : null,
    trigger: c.orbLow && c.minutesSinceOpen < orbWindow
      ? `Wait for OR to complete (${c.minutesSinceOpen}/${orbWindow}min)`
      : c.orbLow && price > c.orbLow
      ? `Wait for price to break below OR low ${c.orbLow.toFixed(0)} (currently ${price.toFixed(0)})`
      : null,
    timingWindow: 'Best 9:45am-11:00am after 15min OR completes | Validity decays after 2 hours',
  }
}
