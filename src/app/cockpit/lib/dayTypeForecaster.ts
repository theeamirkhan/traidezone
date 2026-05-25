/**
 * Day Type Forecaster
 *
 * Combines 8 signals to forecast whether today will be a TREND day or
 * CONSOLIDATION day. Output drives setup recommendations.
 *
 * Fires automatically at 10am ET after the 15-min Opening Range completes,
 * with auto-refresh capability as new data arrives.
 *
 * Signals scored (each contributes +1 or -1 to trend score):
 *   1. Gamma regime (negative=trend, positive=consolidation)
 *   2. Opening drive persistence (delta strong + directional bars = trend)
 *   3. VIX behavior (rising/stable = trend, falling = consolidation)
 *   4. VIX term structure (inverted = trend potential)
 *   5. TICK extremes (sustained extremes = trend)
 *   6. Opening range size (tight = clean break = trend, wide = consolidation)
 *   7. Cross-asset alignment (broad narrative = trend)
 *   8. Day-of-week / calendar (OPEX = consolidation, etc.)
 */

import type { SetupId } from './setupEvaluator'

export type DayType = 'TREND' | 'CONSOLIDATION' | 'INDETERMINATE'

export interface DayTypeForecast {
  dayType:                DayType
  trendProbability:       number     // 0-100
  consolidationProbability: number   // 0-100
  indeterminateProbability: number   // 0-100
  directionalLean:        'LONG' | 'SHORT' | 'NEUTRAL'
  confidence:             'HIGH' | 'MEDIUM' | 'LOW'
  trendSignals:           Array<{ name: string; status: 'SUPPORTS_TREND' | 'SUPPORTS_RANGE' | 'NEUTRAL'; detail: string }>
  recommendedSetups:      Array<{ id: SetupId; name: string; direction: 'LONG' | 'SHORT'; probability: number; rationale: string }>
  avoidSetups:            Array<{ id: SetupId; name: string; reason: string }>
  sizingRecommendation:   'FULL' | 'HALF' | 'QUARTER'
  stopWidthRecommendation: 'WIDER' | 'NORMAL' | 'TIGHTER'
  headline:               string
  reasoning:              string
  generatedAt:            string
}

export interface DayTypeInput {
  // Gamma
  netGex:               number | null
  gexRegime:            'positive' | 'negative' | null
  // Microstructure
  tickValue:            number | null
  tickHigh15m:          number | null     // max TICK reading in last 15min
  tickLow15m:           number | null     // min TICK reading in last 15min
  cumDelta:             string | null
  cumDeltaTrend:        'BUILDING' | 'FADING' | 'NEUTRAL' | null
  // VIX
  vixPrice:             number | null
  vixChange:            number | null     // intraday change %
  vix1d:                number | null
  vix30:                number | null
  // Opening Range
  orbHigh:              number | null
  orbLow:               number | null
  orbWindowMins:        number
  // Multi-TF
  m15Trend:             string | null     // BULLISH/BEARISH/RANGING
  m15RangePct:          number | null
  // Cross-asset
  crossAssetBias:       string | null     // RISK_ON / RISK_OFF / MIXED
  // Levels
  currentPrice:         number
  pdh:                  number | null
  pdl:                  number | null
  // Pre-market / overnight
  esOvernightTrend:     'BULLISH' | 'BEARISH' | 'CHOPPY' | null
  gapPoints:            number | null     // signed gap from prior close
  // Calendar
  isOpex:               boolean
  isFomcDay:            boolean
  dayOfWeek:            number            // 0=Sun, 1=Mon, ..., 5=Fri
  // Session
  minutesSinceOpen:     number
  // Yesterday's range (for context)
  yesterdayRange:       number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Main forecaster
// ─────────────────────────────────────────────────────────────────────────────

export function forecastDayType(input: DayTypeInput): DayTypeForecast {
  const signals: Array<{ name: string; status: 'SUPPORTS_TREND' | 'SUPPORTS_RANGE' | 'NEUTRAL'; detail: string; weight: number }> = []

  // ── Signal 1: Gamma regime (HIGHEST WEIGHT - 3) ─────────────────────────
  if (input.gexRegime === 'negative' || (input.netGex !== null && input.netGex < -1e9)) {
    signals.push({
      name: 'Gamma regime',
      status: 'SUPPORTS_TREND',
      detail: `Negative GEX ${input.netGex !== null ? '$' + (input.netGex / 1e9).toFixed(1) + 'B' : ''} — dealers must chase moves`,
      weight: 3,
    })
  } else if (input.gexRegime === 'positive' || (input.netGex !== null && input.netGex > 1e9)) {
    signals.push({
      name: 'Gamma regime',
      status: 'SUPPORTS_RANGE',
      detail: `Positive GEX ${input.netGex !== null ? '$' + (input.netGex / 1e9).toFixed(1) + 'B' : ''} — dealers absorb moves`,
      weight: 3,
    })
  } else {
    signals.push({ name: 'Gamma regime', status: 'NEUTRAL', detail: 'Near gamma flip — uncertain', weight: 1 })
  }

  // ── Signal 2: Opening drive persistence (WEIGHT 3) ──────────────────────
  const m15Directional = input.m15Trend === 'BULLISH' || input.m15Trend === 'BEARISH'
  const deltaBuilding = input.cumDeltaTrend === 'BUILDING' && (input.cumDelta === 'STRONG_BUY' || input.cumDelta === 'STRONG_SELL')
  if (m15Directional && deltaBuilding) {
    signals.push({
      name: 'Opening drive',
      status: 'SUPPORTS_TREND',
      detail: `15-min ${input.m15Trend} + cum delta ${input.cumDelta} building — committed flow`,
      weight: 3,
    })
  } else if (input.m15Trend === 'RANGING' && input.cumDeltaTrend !== 'BUILDING') {
    signals.push({
      name: 'Opening drive',
      status: 'SUPPORTS_RANGE',
      detail: 'No directional commitment in opening drive',
      weight: 3,
    })
  } else {
    signals.push({
      name: 'Opening drive',
      status: 'NEUTRAL',
      detail: `Mixed: ${input.m15Trend || 'n/a'} trend with ${input.cumDeltaTrend || 'flat'} delta`,
      weight: 2,
    })
  }

  // ── Signal 3: VIX behavior (WEIGHT 2) ────────────────────────────────────
  if (input.vixChange !== null) {
    if (input.vixChange > 2) {
      signals.push({ name: 'VIX behavior', status: 'SUPPORTS_TREND', detail: `VIX +${input.vixChange.toFixed(1)}% — volatility regime activating`, weight: 2 })
    } else if (input.vixChange < -3) {
      signals.push({ name: 'VIX behavior', status: 'SUPPORTS_RANGE', detail: `VIX ${input.vixChange.toFixed(1)}% — vol compressing, mean-revert favored`, weight: 2 })
    } else {
      signals.push({ name: 'VIX behavior', status: 'NEUTRAL', detail: `VIX ${input.vixChange > 0 ? '+' : ''}${input.vixChange.toFixed(1)}% — flat`, weight: 1 })
    }
  } else {
    signals.push({ name: 'VIX behavior', status: 'NEUTRAL', detail: 'VIX change unavailable', weight: 0 })
  }

  // ── Signal 4: VIX term structure (WEIGHT 2) ──────────────────────────────
  if (input.vix1d && input.vix30) {
    const inverted = input.vix1d > input.vix30
    const ratio = input.vix1d / input.vix30
    if (inverted) {
      signals.push({
        name: 'VIX term structure',
        status: 'SUPPORTS_TREND',
        detail: `Inverted (VIX1D ${input.vix1d.toFixed(1)} > VIX30 ${input.vix30.toFixed(1)}) — large move expected today`,
        weight: 2,
      })
    } else if (ratio < 0.75) {
      signals.push({
        name: 'VIX term structure',
        status: 'SUPPORTS_RANGE',
        detail: `Steep contango — calm regime, mean-revert favored`,
        weight: 2,
      })
    } else {
      signals.push({ name: 'VIX term structure', status: 'NEUTRAL', detail: 'Normal term structure', weight: 1 })
    }
  } else {
    signals.push({ name: 'VIX term structure', status: 'NEUTRAL', detail: 'Term data unavailable', weight: 0 })
  }

  // ── Signal 5: TICK extremes (WEIGHT 2) ───────────────────────────────────
  const tickRange = (input.tickHigh15m !== null && input.tickLow15m !== null)
    ? input.tickHigh15m - input.tickLow15m
    : null
  const extremeTickSustained = (input.tickHigh15m !== null && input.tickHigh15m > 900) ||
                                (input.tickLow15m !== null && input.tickLow15m < -900)
  const balancedTickOscillation = tickRange !== null && tickRange < 800 &&
                                   input.tickHigh15m! < 600 && input.tickLow15m! > -600
  if (extremeTickSustained) {
    signals.push({
      name: 'TICK extremes',
      status: 'SUPPORTS_TREND',
      detail: `TICK range ${input.tickLow15m}/${input.tickHigh15m} — sustained extreme readings = directional pressure`,
      weight: 2,
    })
  } else if (balancedTickOscillation) {
    signals.push({
      name: 'TICK extremes',
      status: 'SUPPORTS_RANGE',
      detail: `TICK oscillating ${input.tickLow15m}/${input.tickHigh15m} — no directional commitment`,
      weight: 2,
    })
  } else {
    signals.push({
      name: 'TICK extremes',
      status: 'NEUTRAL',
      detail: tickRange !== null ? `TICK range ${tickRange}pts` : 'TICK data limited',
      weight: 1,
    })
  }

  // ── Signal 6: Opening range size (WEIGHT 2) ──────────────────────────────
  if (input.orbHigh && input.orbLow && input.yesterdayRange) {
    const orRange = input.orbHigh - input.orbLow
    const orPctOfYesterday = (orRange / input.yesterdayRange) * 100
    if (orRange < 8 && input.minutesSinceOpen >= input.orbWindowMins) {
      signals.push({
        name: 'Opening range size',
        status: 'SUPPORTS_TREND',
        detail: `OR tight ${orRange.toFixed(1)}pts — coiled spring, clean break likely`,
        weight: 2,
      })
    } else if (orRange > 15) {
      signals.push({
        name: 'Opening range size',
        status: 'SUPPORTS_RANGE',
        detail: `OR wide ${orRange.toFixed(1)}pts — likely consolidation within this range`,
        weight: 2,
      })
    } else if (orPctOfYesterday > 70) {
      signals.push({
        name: 'Opening range size',
        status: 'SUPPORTS_TREND',
        detail: `OR is ${orPctOfYesterday.toFixed(0)}% of yesterday's range — explosive start`,
        weight: 2,
      })
    } else {
      signals.push({
        name: 'Opening range size',
        status: 'NEUTRAL',
        detail: `OR ${orRange.toFixed(1)}pts (${orPctOfYesterday.toFixed(0)}% of yest)`,
        weight: 1,
      })
    }
  } else {
    signals.push({ name: 'Opening range size', status: 'NEUTRAL', detail: 'OR or yesterday range not yet available', weight: 0 })
  }

  // ── Signal 7: Cross-asset alignment (WEIGHT 1) ───────────────────────────
  if (input.crossAssetBias === 'RISK_ON' || input.crossAssetBias === 'RISK_OFF') {
    signals.push({
      name: 'Cross-asset',
      status: 'SUPPORTS_TREND',
      detail: `Cross-asset ${input.crossAssetBias} — broad narrative driving direction`,
      weight: 1,
    })
  } else if (input.crossAssetBias === 'MIXED' || input.crossAssetBias === 'CHOPPY') {
    signals.push({
      name: 'Cross-asset',
      status: 'SUPPORTS_RANGE',
      detail: 'Cross-asset mixed — no broad narrative',
      weight: 1,
    })
  } else {
    signals.push({ name: 'Cross-asset', status: 'NEUTRAL', detail: 'Cross-asset signal unclear', weight: 0 })
  }

  // ── Signal 8: Calendar/day-of-week (WEIGHT 1) ────────────────────────────
  if (input.isOpex) {
    signals.push({
      name: 'Calendar',
      status: 'SUPPORTS_RANGE',
      detail: 'OPEX day — typically pinned by gamma',
      weight: 2,
    })
  } else if (input.isFomcDay) {
    signals.push({
      name: 'Calendar',
      status: 'SUPPORTS_TREND',
      detail: 'FOMC day — trend potential post-2pm release',
      weight: 2,
    })
  } else if (input.dayOfWeek === 1 && input.gapPoints !== null && Math.abs(input.gapPoints) > 5) {
    signals.push({
      name: 'Calendar',
      status: 'SUPPORTS_TREND',
      detail: `Monday gap ${input.gapPoints > 0 ? '+' : ''}${input.gapPoints.toFixed(0)}pts — continuation likely`,
      weight: 1,
    })
  } else if (input.dayOfWeek === 3 && !input.isFomcDay) {
    signals.push({
      name: 'Calendar',
      status: 'NEUTRAL',
      detail: 'Wednesday non-event — no calendar edge',
      weight: 0,
    })
  } else {
    signals.push({ name: 'Calendar', status: 'NEUTRAL', detail: 'No major calendar pressure', weight: 0 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Compute probabilities (weighted Bayesian-style)
  // ─────────────────────────────────────────────────────────────────────────
  const trendScore = signals
    .filter(s => s.status === 'SUPPORTS_TREND')
    .reduce((sum, s) => sum + s.weight, 0)
  const rangeScore = signals
    .filter(s => s.status === 'SUPPORTS_RANGE')
    .reduce((sum, s) => sum + s.weight, 0)
  const neutralScore = signals
    .filter(s => s.status === 'NEUTRAL')
    .reduce((sum, s) => sum + s.weight, 0)

  const totalWeight = trendScore + rangeScore + neutralScore

  // Base probability: split based on weighted votes
  let trendProb = totalWeight > 0 ? (trendScore / totalWeight) * 100 : 33
  let rangeProb = totalWeight > 0 ? (rangeScore / totalWeight) * 100 : 33
  let indeterminateProb = totalWeight > 0 ? (neutralScore / totalWeight) * 100 : 34

  // Normalize to 100
  const sum = trendProb + rangeProb + indeterminateProb
  trendProb = Math.round((trendProb / sum) * 100)
  rangeProb = Math.round((rangeProb / sum) * 100)
  indeterminateProb = 100 - trendProb - rangeProb

  // Cap raw confidence — even strongest signal stack tops at ~75%
  if (trendProb > 75) {
    const excess = trendProb - 75
    trendProb = 75
    rangeProb += Math.floor(excess / 2)
    indeterminateProb += Math.ceil(excess / 2)
  }
  if (rangeProb > 75) {
    const excess = rangeProb - 75
    rangeProb = 75
    trendProb += Math.floor(excess / 2)
    indeterminateProb += Math.ceil(excess / 2)
  }

  // ── Determine day type ───────────────────────────────────────────────────
  let dayType: DayType
  if (trendProb >= rangeProb + 15) dayType = 'TREND'
  else if (rangeProb >= trendProb + 15) dayType = 'CONSOLIDATION'
  else dayType = 'INDETERMINATE'

  // ── Directional lean (only if TREND) ─────────────────────────────────────
  let directionalLean: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'
  if (dayType === 'TREND') {
    const bullishVotes = (input.m15Trend === 'BULLISH' ? 1 : 0) +
                          (input.cumDelta === 'STRONG_BUY' || input.cumDelta === 'BUY' ? 1 : 0) +
                          (input.crossAssetBias === 'RISK_ON' ? 1 : 0) +
                          (input.esOvernightTrend === 'BULLISH' ? 1 : 0) +
                          (input.gapPoints !== null && input.gapPoints > 0 ? 1 : 0)
    const bearishVotes = (input.m15Trend === 'BEARISH' ? 1 : 0) +
                          (input.cumDelta === 'STRONG_SELL' || input.cumDelta === 'SELL' ? 1 : 0) +
                          (input.crossAssetBias === 'RISK_OFF' ? 1 : 0) +
                          (input.esOvernightTrend === 'BEARISH' ? 1 : 0) +
                          (input.gapPoints !== null && input.gapPoints < 0 ? 1 : 0)
    if (bullishVotes >= bearishVotes + 2) directionalLean = 'LONG'
    else if (bearishVotes >= bullishVotes + 2) directionalLean = 'SHORT'
  }

  // ── Confidence level ─────────────────────────────────────────────────────
  const alignedSignals = Math.max(
    signals.filter(s => s.status === 'SUPPORTS_TREND').length,
    signals.filter(s => s.status === 'SUPPORTS_RANGE').length
  )
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  if (alignedSignals >= 6) confidence = 'HIGH'
  else if (alignedSignals >= 4) confidence = 'MEDIUM'
  else confidence = 'LOW'

  // ─────────────────────────────────────────────────────────────────────────
  // Recommend specific setups based on day type
  // ─────────────────────────────────────────────────────────────────────────
  const TREND_SETUPS = [
    { id: 'orb_breakout_long'    as SetupId, name: 'Opening Range Breakout',  direction: 'LONG'  as const, baseProb: 0 },
    { id: 'orb_breakdown_short'  as SetupId, name: 'Opening Range Breakdown', direction: 'SHORT' as const, baseProb: 0 },
    { id: 'pdh_breakout'         as SetupId, name: 'Prior Day High Breakout', direction: 'LONG'  as const, baseProb: 0 },
    { id: 'pdl_breakdown'        as SetupId, name: 'Prior Day Low Breakdown', direction: 'SHORT' as const, baseProb: 0 },
    { id: 'trendline_break_long' as SetupId, name: 'Trend Line Break (LONG)', direction: 'LONG'  as const, baseProb: 0 },
    { id: 'trendline_break_short'as SetupId, name: 'Trend Line Break (SHORT)',direction: 'SHORT' as const, baseProb: 0 },
  ]

  const RANGE_SETUPS = [
    { id: 'vwap_retest_long'  as SetupId, name: 'VWAP Retest Bounce',         direction: 'LONG'  as const, baseProb: 0 },
    { id: 'vwap_retest_short' as SetupId, name: 'VWAP Retest Reject',         direction: 'SHORT' as const, baseProb: 0 },
    { id: 'double_top'        as SetupId, name: 'Double Top (Supply Zone)',   direction: 'SHORT' as const, baseProb: 0 },
    { id: 'double_bottom'     as SetupId, name: 'Double Bottom (Demand Zone)',direction: 'LONG'  as const, baseProb: 0 },
  ]

  // Build recommended setups list
  const recommendedSetups: DayTypeForecast['recommendedSetups'] = []
  const avoidSetups: DayTypeForecast['avoidSetups'] = []

  // Convert directional lean to filter
  const allowedDirection = directionalLean === 'LONG' ? 'LONG' :
                           directionalLean === 'SHORT' ? 'SHORT' :
                           null  // both allowed

  if (dayType === 'TREND') {
    // Trend day — recommend trend setups in the lean direction
    TREND_SETUPS.forEach(s => {
      const aligned = !allowedDirection || s.direction === allowedDirection
      if (aligned) {
        // Probability of this setup type working in trend day with this confidence
        // Base ~ 55-72% for trend setups on trend days
        let prob = 58
        if (confidence === 'HIGH') prob += 12
        else if (confidence === 'MEDIUM') prob += 5
        if (s.direction === directionalLean) prob += 5
        recommendedSetups.push({
          id: s.id,
          name: s.name,
          direction: s.direction,
          probability: Math.min(75, prob),
          rationale: `Trend day favors breakouts${directionalLean !== 'NEUTRAL' ? ` in ${directionalLean} direction` : ''}`,
        })
      }
    })
    // Avoid mean-revert setups
    RANGE_SETUPS.forEach(s => {
      avoidSetups.push({
        id: s.id,
        name: s.name,
        reason: 'Mean-revert setups fail on trend days — moves don\'t fade',
      })
    })
  } else if (dayType === 'CONSOLIDATION') {
    // Consolidation day — recommend mean-revert setups
    RANGE_SETUPS.forEach(s => {
      let prob = 56
      if (confidence === 'HIGH') prob += 12
      else if (confidence === 'MEDIUM') prob += 5
      recommendedSetups.push({
        id: s.id,
        name: s.name,
        direction: s.direction,
        probability: Math.min(72, prob),
        rationale: 'Consolidation day favors mean-revert at key levels',
      })
    })
    // Avoid breakouts on consolidation days
    TREND_SETUPS.forEach(s => {
      avoidSetups.push({
        id: s.id,
        name: s.name,
        reason: 'Breakouts fail on consolidation days — fade back inside range',
      })
    })
  } else {
    // INDETERMINATE — give modest probabilities to all, recommend smallest size
    [...TREND_SETUPS, ...RANGE_SETUPS].forEach(s => {
      recommendedSetups.push({
        id: s.id,
        name: s.name,
        direction: s.direction,
        probability: 50,
        rationale: 'Day type unclear — wait for cleaner signals or use small size',
      })
    })
  }

  // Sort recommended by probability descending
  recommendedSetups.sort((a, b) => b.probability - a.probability)

  // ── Sizing + stops ───────────────────────────────────────────────────────
  let sizing: 'FULL' | 'HALF' | 'QUARTER'
  let stopWidth: 'WIDER' | 'NORMAL' | 'TIGHTER'
  if (dayType === 'TREND' && confidence === 'HIGH') {
    sizing = 'FULL'
    stopWidth = 'WIDER'  // trend days punish tight stops
  } else if (dayType === 'CONSOLIDATION' && confidence === 'HIGH') {
    sizing = 'FULL'
    stopWidth = 'TIGHTER'  // consolidation days reward precision
  } else if (confidence === 'MEDIUM') {
    sizing = 'HALF'
    stopWidth = 'NORMAL'
  } else {
    sizing = 'QUARTER'
    stopWidth = 'NORMAL'
  }

  // ── Headline + reasoning ────────────────────────────────────────────────
  const headline = dayType === 'TREND'
    ? `TREND DAY ${trendProb}% (${directionalLean !== 'NEUTRAL' ? directionalLean + ' lean' : 'direction TBD'})`
    : dayType === 'CONSOLIDATION'
    ? `CONSOLIDATION DAY ${rangeProb}%`
    : `INDETERMINATE — mixed signals (${Math.max(trendProb, rangeProb)}% max)`

  const reasoning = dayType === 'TREND'
    ? `${signals.filter(s => s.status === 'SUPPORTS_TREND').length} of 8 signals support trending. Negative gamma + opening drive committed = chase moves, don't fade. Wider stops, trend continuation plays.`
    : dayType === 'CONSOLIDATION'
    ? `${signals.filter(s => s.status === 'SUPPORTS_RANGE').length} of 8 signals support range-bound. Positive gamma + lack of directional commitment = fade extremes, mean-revert to VWAP/POC.`
    : 'Signals split — wait for cleaner picture by 10:30am or use small size and adapt.'

  return {
    dayType,
    trendProbability:         trendProb,
    consolidationProbability: rangeProb,
    indeterminateProbability: indeterminateProb,
    directionalLean,
    confidence,
    trendSignals: signals.map(s => ({ name: s.name, status: s.status, detail: s.detail })),
    recommendedSetups,
    avoidSetups,
    sizingRecommendation: sizing,
    stopWidthRecommendation: stopWidth,
    headline,
    reasoning,
    generatedAt: new Date().toISOString(),
  }
}
