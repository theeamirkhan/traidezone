/**
 * signalQuality.ts — Signal Quality Gate
 *
 * A second-opinion layer that runs BEFORE the signal reaches the trader.
 * Scores each signal against all available data streams independently,
 * then either confirms, downgrades, or blocks the signal.
 *
 * The goal: only high-conviction signals reach the trader.
 * Low-conviction setups get blocked or flagged — not forwarded.
 *
 * Philosophy:
 *   - Missed trade = 0 loss
 *   - Bad trade = real loss
 *   - Therefore: false negatives are always better than false positives
 *
 * Scoring system:
 *   Each independent data stream votes +1 (confirms), -1 (contradicts), 0 (neutral)
 *   Net confirmation score drives the final quality gate decision
 */

export interface SignalQualityInput {
  signal:        'LONG' | 'SHORT' | 'WAIT' | 'NO TRADE'
  confidence:    number
  currentPrice:  number | null
  streamWeights?: Record<string, number> | null
  vixPrice:      number | null

  // Microstructure
  microstructure?: {
    cumulativeDelta: { strength: string; pct: number }
    darkPool:        { netBias: string; totalBuyNotional: number; totalSellNotional: number }
    optionsImbalance:{ bias: string; ratio: number; sweepCount: number }
    volumeSpike?:    { detected: boolean; direction: string } | null
  } | null

  // Breadth
  breadthData?: {
    tick:      { value: number | null; regime: string | null }
    trin:      { value: number | null; regime: string | null }
    vvix:      { value: number | null; regime: string | null }
    consensus: string
  } | null

  // GEX
  gexData?: {
    regime:    string
    gammaFlip: number | null
    callWall:  number | null
    putWall:   number | null
    netGex:    number | null
  } | null

  // Morning plan
  morningBias?: string | null

  // Patterns
  patternBias?: string | null

  // Calendar — any events in next 30 min?
  economicCalendar?: string | null
}

export interface SignalQualityResult {
  approved:          boolean
  finalConfidence:   number     // adjusted confidence after quality gate
  originalConfidence: number
  confirmationScore: number     // -8 to +8 (how many streams agree)
  totalVoters:       number
  confirmationPct:   number     // % of voters that confirm
  verdict:           'STRONG' | 'CONFIRMED' | 'MARGINAL' | 'CONFLICTED' | 'BLOCKED'
  verdictReason:     string
  adjustments:       string[]   // what changed and why
  blockers:          string[]   // hard blocks that override confidence
  confirmers:        string[]   // streams that agree
  contradictors:     string[]   // streams that disagree
  aiContext:         string     // injected into final signal prompt
  streamBreakdown:   Array<{   // per-stream vote detail for visualization
    name:    string
    vote:    1 | -1 | 0        // +1 confirm, -1 contradict, 0 neutral/unavailable
    weight:  number            // % contribution when voting (equal weight = 100/totalVoters)
    detail:  string            // what the stream saw
    available: boolean         // was data available?
  }>
}

function isLong(signal: string)  { return signal === 'LONG' }
function isShort(signal: string) { return signal === 'SHORT' }
function isDirectional(signal: string) { return signal === 'LONG' || signal === 'SHORT' }

export function scoreSignalQuality(input: SignalQualityInput): SignalQualityResult {
  const { signal, confidence, currentPrice, vixPrice } = input
  const bullish = isLong(signal)
  const bearish = isShort(signal)

  const confirmers:     string[] = []
  const contradictors:  string[] = []
  const adjustments:    string[] = []
  const blockers:       string[] = []

  let votes     = 0
  // Per-stream tracking for visualization
  const streams: Array<{ name: string; vote: 1|-1|0; detail: string; available: boolean }> = []
  const addStream = (name: string, vote: 1|-1|0, detail: string, available = true) => streams.push({ name, vote, detail, available })
  let maxVotes  = 0
  let finalConf = confidence

  // ── Apply learned stream weights ────────────────────────────────────────────
  if (input.streamWeights && streams.length > 0) {
    const hasLearned = Object.values(input.streamWeights).some((w: number) => w !== 1.0)
    if (hasLearned) {
      let weightedScore = 0, totalWeight = 0
      for (const s of streams) {
        if (s.vote !== 0) {
          const w = (input.streamWeights as Record<string,number>)[s.name] || 1.0
          weightedScore += s.vote * w
          totalWeight   += w
        }
      }
      if (totalWeight > 0) {
        const rawPct  = votes / Math.max(1, maxVotes)
        const wPct    = weightedScore / totalWeight
        votes = Math.round((wPct * 0.6 + rawPct * 0.4) * maxVotes)
      }
    }
  }

  // ── HARD BLOCKERS (override everything) ───────────────────────────────────

  // VVIX extreme — signals in extreme vol-of-vol are unreliable
  const vvix = input.breadthData?.vvix?.value
  if (vvix && vvix > 120) {
    blockers.push(`VVIX ${vvix.toFixed(0)} — extreme vol-of-vol (>120), signal reliability critically reduced`)
    finalConf = Math.min(finalConf, 45)
  } else if (vvix && vvix > 105) {
    adjustments.push(`VVIX ${vvix.toFixed(0)} elevated — confidence capped at 70`)
    finalConf = Math.min(finalConf, 70)
  }

  // Price at call wall (LONG) or put wall (SHORT) — fighting dealer resistance
  if (currentPrice && input.gexData?.callWall && bullish) {
    const distToCallWall = input.gexData.callWall - currentPrice
    if (distToCallWall < 10 && distToCallWall >= 0) {
      blockers.push(`Price ${currentPrice} within ${distToCallWall.toFixed(0)}pts of call wall ${input.gexData.callWall} — dealer selling overhead`)
      finalConf = Math.min(finalConf, 55)
    }
  }
  if (currentPrice && input.gexData?.putWall && bearish) {
    const distToPutWall = currentPrice - input.gexData.putWall
    if (distToPutWall < 10 && distToPutWall >= 0) {
      blockers.push(`Price ${currentPrice} within ${distToPutWall.toFixed(0)}pts of put wall ${input.gexData.putWall} — dealer buying underneath`)
      finalConf = Math.min(finalConf, 55)
    }
  }

  // VIX > 25 + LONG signal = high risk environment
  if (vixPrice && vixPrice > 25 && bullish) {
    adjustments.push(`VIX ${vixPrice.toFixed(1)} elevated (>25) — LONG in high-vol environment, confidence reduced`)
    finalConf = Math.min(finalConf, finalConf - 10)
  }

  // ── VOTING SYSTEM ─────────────────────────────────────────────────────────
  // Each stream votes independently. Only called for LONG/SHORT signals.

  if (!isDirectional(signal)) {
    return buildResult(input, finalConf, votes, maxVotes, confirmers, contradictors, adjustments, blockers, 'n/a', streams)
  }

  // 1. Cumulative Delta
  if (input.microstructure?.cumulativeDelta) {
    maxVotes++
    const delta = input.microstructure.cumulativeDelta
    const deltaBull = delta.strength === 'STRONG_BUY' || delta.strength === 'BUY'
    const deltaBear = delta.strength === 'STRONG_SELL' || delta.strength === 'SELL'
    if (bullish && deltaBull)  { votes++; confirmers.push(`Delta ${delta.strength} (${delta.pct}% bull bars)`); addStream('Cum. Delta', 1, `${delta.strength} (${delta.pct}% bull)`) }
    else if (bearish && deltaBear) { votes++; confirmers.push(`Delta ${delta.strength} (${delta.pct}% bull bars)`); addStream('Cum. Delta', 1, `${delta.strength}`) }
    else if (bullish && deltaBear) { votes--; contradictors.push(`Delta ${delta.strength} contradicts LONG`); addStream('Cum. Delta', -1, `${delta.strength} — bearish vs LONG`) }
    else if (bearish && deltaBull) { votes--; contradictors.push(`Delta ${delta.strength} contradicts SHORT`); addStream('Cum. Delta', -1, `${delta.strength} — bullish vs SHORT`) }
    else { /* neutral delta — no vote */ maxVotes--; addStream('Cum. Delta', 0, 'Neutral') }
  }

  // 2. Options Flow Imbalance
  if (input.microstructure?.optionsImbalance) {
    maxVotes++
    const flow = input.microstructure.optionsImbalance
    if (bullish && flow.bias === 'CALL_HEAVY')  { votes++; confirmers.push(`Options CALL_HEAVY ${flow.ratio.toFixed(1)}x, ${flow.sweepCount} sweeps`); addStream('Options Flow', 1, `CALL_HEAVY ${flow.ratio.toFixed(1)}x`) }
    else if (bearish && flow.bias === 'PUT_HEAVY')  { votes++; confirmers.push(`Options PUT_HEAVY ${flow.ratio.toFixed(1)}x`); addStream('Options Flow', 1, `PUT_HEAVY ${flow.ratio.toFixed(1)}x`) }
    else if (bullish && flow.bias === 'PUT_HEAVY')  { votes--; contradictors.push(`Options PUT_HEAVY contradicts LONG`); addStream('Options Flow', -1, `PUT_HEAVY vs LONG`) }
    else if (bearish && flow.bias === 'CALL_HEAVY') { votes--; contradictors.push(`Options CALL_HEAVY contradicts SHORT`); addStream('Options Flow', -1, `CALL_HEAVY vs SHORT`) }
    else { maxVotes--; addStream('Options Flow', 0, 'Balanced — no edge') } // BALANCED — no vote
  }

  // 3. Dark Pool
  if (input.microstructure?.darkPool) {
    const dp = input.microstructure.darkPool
    if (dp.netBias !== 'NEUTRAL') {
      maxVotes++
      if (bullish && dp.netBias === 'BUY')   { votes++; confirmers.push(`Dark pool net buying $${(dp.totalBuyNotional/1e6).toFixed(0)}M`); addStream('Dark Pool', 1, `Net buying $${(dp.totalBuyNotional/1e6).toFixed(0)}M`) }
      else if (bearish && dp.netBias === 'SELL')  { votes++; confirmers.push(`Dark pool net selling $${(dp.totalSellNotional/1e6).toFixed(0)}M`); addStream('Dark Pool', 1, `Net selling $${(dp.totalSellNotional/1e6).toFixed(0)}M`) }
      else if (bullish && dp.netBias === 'SELL') { votes--; contradictors.push(`Dark pool selling contradicts LONG`); addStream('Dark Pool', -1, 'Selling vs LONG') }
      else if (bearish && dp.netBias === 'BUY')  { votes--; contradictors.push(`Dark pool buying contradicts SHORT`); addStream('Dark Pool', -1, 'Buying vs SHORT') }
    }
  }

  // 4. NYSE TICK
  if (input.breadthData?.tick?.value !== null && input.breadthData?.tick?.value !== undefined) {
    const tick = input.breadthData.tick.value
    const tickRegime = input.breadthData.tick.regime || ''
    if (Math.abs(tick) > 400) { // only vote if TICK has a clear read
      maxVotes++
      const tickBull = tick > 400
      const tickBear = tick < -400
      if (bullish && tickBull)  { votes++; confirmers.push(`TICK +${tick.toFixed(0)} broad buying`); addStream('NYSE TICK', 1, `+${tick.toFixed(0)} broad buying`) }
      else if (bearish && tickBear)  { votes++; confirmers.push(`TICK ${tick.toFixed(0)} broad selling`); addStream('NYSE TICK', 1, `${tick.toFixed(0)} broad selling`) }
      else if (bullish && tickBear)  { votes--; contradictors.push(`TICK ${tick.toFixed(0)} contradicts LONG`); addStream('NYSE TICK', -1, `${tick.toFixed(0)} vs LONG`) }
      else if (bearish && tickBull)  { votes--; contradictors.push(`TICK +${tick.toFixed(0)} contradicts SHORT`); addStream('NYSE TICK', -1, `+${tick.toFixed(0)} vs SHORT`) }
    }
  }

  // 5. TRIN
  if (input.breadthData?.trin?.value !== null && input.breadthData?.trin?.value !== undefined) {
    const trin = input.breadthData.trin.value
    if (trin !== null) {
      maxVotes++
      const trinBull = trin < 0.75
      const trinBear = trin > 1.25
      if (bullish && trinBull)  { votes++; confirmers.push(`TRIN ${trin.toFixed(2)} volume favors advancers`); addStream('TRIN', 1, `${trin.toFixed(2)} favors advancers`) }
      else if (bearish && trinBear)  { votes++; confirmers.push(`TRIN ${trin.toFixed(2)} volume favors decliners`); addStream('TRIN', 1, `${trin.toFixed(2)} favors decliners`) }
      else if (bullish && trinBear)  { votes--; contradictors.push(`TRIN ${trin.toFixed(2)} contradicts LONG`); addStream('TRIN', -1, `${trin.toFixed(2)} vs LONG`) }
      else if (bearish && trinBull)  { votes--; contradictors.push(`TRIN ${trin.toFixed(2)} contradicts SHORT`) }
      else { maxVotes-- } // TRIN neutral — no vote
    }
  }

  // 6. GEX Regime
  if (input.gexData?.regime && input.gexData.regime !== 'unknown') {
    maxVotes++
    const negGamma = input.gexData.regime === 'negative'
    const posGamma = input.gexData.regime === 'positive'
    const gexDetail = `${input.gexData.regime} gamma | flip: ${input.gexData.gammaFlip || 'n/a'}`
    // In negative gamma: breakouts run — both LONG and SHORT get a boost
    // In positive gamma: breakouts fade — neither direction gets a boost
    if (negGamma) {
      votes++
      confirmers.push(`Negative gamma — moves amplified, breakouts run`)
      addStream('GEX Regime', 1, gexDetail)
    } else if (posGamma) {
      // Positive gamma: warn if price is near a wall
      if (bullish && input.gexData.callWall && currentPrice) {
        const dist = input.gexData.callWall - currentPrice
        if (dist < 20) {
          votes--
          contradictors.push(`Positive gamma with ${dist.toFixed(0)}pts to call wall — resistance overhead`)
        } else {
          maxVotes-- // positive gamma but far from walls — neutral
        }
      } else {
        maxVotes-- // positive gamma neutral
      }
    }
  }

  // 7. Morning Plan Bias
  if (input.morningBias) {
    maxVotes++
    const planBull = input.morningBias.toUpperCase() === 'LONG' || input.morningBias.toUpperCase() === 'BULLISH'
    const planBear = input.morningBias.toUpperCase() === 'SHORT' || input.morningBias.toUpperCase() === 'BEARISH'
    if (bullish && planBull)  { votes++; confirmers.push(`Morning plan bias: ${input.morningBias}`); addStream('Morning Plan', 1, `${input.morningBias} aligns`) }
    else if (bearish && planBear)  { votes++; confirmers.push(`Morning plan bias: ${input.morningBias}`) }
    else if (bullish && planBear)  { votes--; contradictors.push(`Morning plan is ${input.morningBias} — diverging from plan`) }
    else if (bearish && planBull)  { votes--; contradictors.push(`Morning plan is ${input.morningBias} — diverging from plan`) }
    else { maxVotes-- } // neutral bias
  }

  // 8. Pattern Analysis
  if (input.patternBias) {
    const patBull = input.patternBias.toLowerCase().includes('bull') || input.patternBias.toLowerCase().includes('long')
    const patBear = input.patternBias.toLowerCase().includes('bear') || input.patternBias.toLowerCase().includes('short')
    if (patBull || patBear) {
      maxVotes++
      if (bullish && patBull)  { votes++; addStream('Patterns', 1, input.patternBias || ''); confirmers.push(`Pattern: ${input.patternBias}`) }
      else if (bearish && patBear)  { votes++; confirmers.push(`Pattern: ${input.patternBias}`) }
      else if (bullish && patBear)  { votes--; contradictors.push(`Pattern bearish contradicts LONG`) }
      else if (bearish && patBull)  { votes--; contradictors.push(`Pattern bullish contradicts SHORT`) }
    }
  }

  return buildResult(input, finalConf, votes, maxVotes, confirmers, contradictors, adjustments, blockers, signal, streams)
}

function buildResult(
  input: SignalQualityInput,
  finalConf: number,
  votes: number,
  maxVotes: number,
  confirmers: string[],
  contradictors: string[],
  adjustments: string[],
  blockers: string[],
  signal: string,
  streams: Array<{ name: string; vote: 1|-1|0; detail: string; available: boolean }> = []
): SignalQualityResult {
  const { confidence } = input

  // For non-directional signals, pass through
  if (!isDirectional(signal)) {
    return {
      approved: true,
      streamBreakdown: [],
      finalConfidence: finalConf,
      originalConfidence: confidence,
      confirmationScore: 0,
      totalVoters: 0,
      confirmationPct: 0,
      verdict: 'CONFIRMED',
      verdictReason: 'WAIT/NO TRADE signal — no quality gate needed',
      adjustments, blockers,
      confirmers: [],
      contradictors: [],
      aiContext: '',
    }
  }

  const confirmationPct = maxVotes > 0 ? Math.round((votes / maxVotes) * 100) : 50

  // Adjust confidence based on confirmation score
  if (votes >= 4 && confirmationPct >= 70) {
    finalConf = Math.min(95, finalConf + 8)
    adjustments.push(`+8 confidence: ${confirmers.length} of ${maxVotes} streams confirm`)
  } else if (votes >= 2 && confirmationPct >= 50) {
    // No adjustment
  } else if (votes <= 0 || confirmationPct < 40) {
    const cut = Math.max(15, Math.round((confirmationPct / 100) * 20))
    finalConf = Math.max(30, finalConf - cut)
    adjustments.push(`-${cut} confidence: low confirmation (${confirmationPct}% of streams agree)`)
  }
  if (contradictors.length >= 3) {
    finalConf = Math.max(30, finalConf - 15)
    adjustments.push(`-15 confidence: ${contradictors.length} data streams contradict signal`)
  }

  // Hard cap from blockers
  if (blockers.length > 0) {
    finalConf = Math.min(finalConf, 55)
  }

  finalConf = Math.round(Math.max(20, Math.min(95, finalConf)))

  // Verdict
  let verdict: SignalQualityResult['verdict']
  let verdictReason: string
  let approved: boolean

  if (blockers.length > 0 && finalConf < 50) {
    verdict = 'BLOCKED'
    verdictReason = blockers[0]
    approved = false
  } else if (votes >= 4 && contradictors.length === 0) {
    verdict = 'STRONG'
    verdictReason = `${confirmers.length}/${maxVotes} data streams confirm — high conviction`
    approved = true
  } else if (confirmationPct >= 55 && contradictors.length <= 1) {
    verdict = 'CONFIRMED'
    verdictReason = `${confirmers.length}/${maxVotes} streams confirm with ${contradictors.length} contradiction(s)`
    approved = true
  } else if (confirmationPct >= 40) {
    verdict = 'MARGINAL'
    verdictReason = `Mixed data: ${confirmers.length} confirm, ${contradictors.length} contradict — proceed with caution`
    approved = finalConf >= 60 // only approve marginal if still ≥60%
  } else {
    verdict = 'CONFLICTED'
    verdictReason = `${contradictors.length} streams contradict signal — data not aligned`
    approved = false
  }

  // Build AI context string — injected as a final note in the signal prompt
  const lines: string[] = []
  lines.push(`SIGNAL QUALITY GATE [${verdict}]:`)
  lines.push(`  Confirmation: ${confirmers.length}/${maxVotes} data streams agree (${confirmationPct}%)`)
  if (confirmers.length)    lines.push(`  ✓ ${confirmers.join(' | ')}`)
  if (contradictors.length) lines.push(`  ✗ ${contradictors.join(' | ')}`)
  if (blockers.length)      lines.push(`  🚫 ${blockers[0]}`)
  lines.push(`  Verdict: ${verdict} — ${verdictReason}`)
  lines.push(`  Confidence adjustment: ${confidence}% → ${finalConf}%`)
  if (!approved) {
    lines.push(`  ⚠ QUALITY GATE RECOMMENDS: Do not signal. Issue WAIT with explanation.`)
  }

  // Build weight percentages
  const totalVoters2 = Math.max(1, maxVotes)
  const weightPct2 = Math.round(100 / totalVoters2)
  const streamBreakdown2 = streams.map(s => ({ ...s, weight: s.vote !== 0 ? weightPct2 : 0 }))

  return {
    approved,
    finalConfidence: finalConf,
    originalConfidence: confidence,
    confirmationScore: votes,
    totalVoters: maxVotes,
    confirmationPct,
    verdict,
    verdictReason,
    adjustments,
    blockers,
    confirmers,
    contradictors,
    streamBreakdown: streamBreakdown2,
    aiContext: lines.join('\n'),
  }
}
