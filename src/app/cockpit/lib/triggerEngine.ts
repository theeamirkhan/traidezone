/**
 * lib/triggerEngine.ts
 *
 * The deterministic rule engine. Evaluates structured trigger rules
 * against live market state every tick. Tracks which primitives have
 * fired this session (the "accumulator") so that CHAINED conditions
 * that build across time can complete.
 *
 * This is what fixes the Thursday problem: VWAP hold at 10:05, then
 * PDH reclaim at 10:40 — the engine remembers the 10:05 hold and fires
 * when the PDH reclaim completes the chain, even though they happened
 * 35 minutes apart.
 *
 * NO LLM here. Pure deterministic evaluation. The AI only parses
 * English → TriggerRule once at definition time (see parseTrigger).
 */

import {
  evaluatePrimitive,
  type PrimitiveId,
  type PrimitiveContext,
  type MarketSnapshot,
} from './triggerPrimitives'

// ── A single condition within a rule ──
export interface TriggerCondition {
  primitive:        PrimitiveId
  threshold?:       number   // for TICK
  minutesSinceOpen?: number  // for time gates
  // "sequential" conditions must fire IN ORDER and stay valid within windowMins
  // "state" conditions just need to be true at fire time (e.g. after 10am)
  mode:             'sequential' | 'state'
}

// ── A complete trigger rule ──
export interface TriggerRule {
  id:               string
  name:             string              // human label, e.g. "Morning VWAP + PDH long"
  originalText:     string              // the English the user typed
  direction:        'LONG' | 'SHORT'
  conditions:       TriggerCondition[]  // ALL must be satisfied (AND logic)
  windowMins:       number              // sequential conditions must complete within this window
  confidence:       number              // confidence to assign when fired (user's conviction)
  enabled:          boolean
  // Stop/target hints (optional — used to pre-fill the trade modal)
  stopHint?:        string              // e.g. "VWAP" or "200 EMA" or "8 points"
  targetHint?:      string
}

// ── Accumulator: per-session memory of primitive firings ──
export interface PrimitiveFiring {
  primitive:  PrimitiveId
  firedAt:    number     // ms timestamp
  detail:     string
  value?:     number
}

export interface SessionAccumulator {
  sessionDate:  string                 // ET date "YYYY-MM-DD"
  firings:      PrimitiveFiring[]       // chronological log of all primitive activations
  firedRuleIds: Record<string, number> // ruleId → last fire timestamp (dedup)
}

export function newAccumulator(sessionDate: string): SessionAccumulator {
  return { sessionDate, firings: [], firedRuleIds: {} }
}

// ── Record any newly-active primitives into the accumulator ──
// Called every tick BEFORE rule evaluation. Logs the moment a primitive
// transitions to active (or stays active — we keep the most recent firing).
export function recordFirings(
  acc: SessionAccumulator,
  ctx: PrimitiveContext,
  watchedPrimitives: { primitive: PrimitiveId; threshold?: number; minutesSinceOpen?: number }[],
): SessionAccumulator {
  const now = ctx.snap.timestamp
  const updated = { ...acc, firings: [...acc.firings] }

  for (const w of watchedPrimitives) {
    const state = evaluatePrimitive(w.primitive, ctx, { threshold: w.threshold, minutesSinceOpen: w.minutesSinceOpen })
    if (state.active) {
      // Update or append the most recent firing for this primitive
      const existingIdx = updated.firings.findIndex(f => f.primitive === w.primitive)
      const firing: PrimitiveFiring = { primitive: w.primitive, firedAt: now, detail: state.detail, value: state.value }
      if (existingIdx >= 0) {
        // Keep the EARLIEST firing time (when the condition first became true)
        // but refresh detail. Earliest matters for sequential ordering.
        firing.firedAt = updated.firings[existingIdx].firedAt
        updated.firings[existingIdx] = firing
      } else {
        updated.firings.push(firing)
      }
    }
  }
  return updated
}

// ── Evaluate a single rule against the accumulator + current state ──
export interface RuleEvaluation {
  ruleId:       string
  satisfied:    boolean
  reason:       string
  firedConditions: { primitive: PrimitiveId; firedAt: number; detail: string }[]
  missingConditions: PrimitiveId[]
}

export function evaluateRule(
  rule: TriggerRule,
  acc: SessionAccumulator,
  ctx: PrimitiveContext,
): RuleEvaluation {
  if (!rule.enabled) {
    return { ruleId: rule.id, satisfied: false, reason: 'disabled', firedConditions: [], missingConditions: [] }
  }

  const now = ctx.snap.timestamp
  const windowMs = rule.windowMins * 60 * 1000

  const fired: { primitive: PrimitiveId; firedAt: number; detail: string }[] = []
  const missing: PrimitiveId[] = []

  // Separate sequential vs state conditions
  const sequential = rule.conditions.filter(c => c.mode === 'sequential')
  const stateConds = rule.conditions.filter(c => c.mode === 'state')

  // 1. STATE conditions must be true RIGHT NOW
  for (const cond of stateConds) {
    const st = evaluatePrimitive(cond.primitive, ctx, { threshold: cond.threshold, minutesSinceOpen: cond.minutesSinceOpen })
    if (st.active) {
      fired.push({ primitive: cond.primitive, firedAt: now, detail: st.detail })
    } else {
      missing.push(cond.primitive)
    }
  }

  // 2. SEQUENTIAL conditions must each have fired, IN ORDER, within window
  let lastFiredAt = 0
  let sequenceValid = true
  for (const cond of sequential) {
    // Find this primitive's firing in the accumulator
    const firing = acc.firings.find(f => f.primitive === cond.primitive)
    if (!firing) {
      missing.push(cond.primitive)
      sequenceValid = false
      continue
    }
    // Must have fired within the window (not stale)
    if (now - firing.firedAt > windowMs) {
      missing.push(cond.primitive)
      sequenceValid = false
      continue
    }
    // Must fire in order (each subsequent condition fired at/after the prior)
    if (firing.firedAt < lastFiredAt) {
      sequenceValid = false
    }
    lastFiredAt = Math.max(lastFiredAt, firing.firedAt)
    fired.push({ primitive: cond.primitive, firedAt: firing.firedAt, detail: firing.detail })
  }

  const allStateOk = stateConds.every(c =>
    fired.some(f => f.primitive === c.primitive))
  const allSeqOk = sequential.length === 0 || (sequenceValid &&
    sequential.every(c => fired.some(f => f.primitive === c.primitive)))

  const satisfied = allStateOk && allSeqOk && missing.length === 0

  return {
    ruleId: rule.id,
    satisfied,
    reason: satisfied
      ? `All ${rule.conditions.length} conditions met`
      : `Missing: ${missing.join(', ') || 'sequence order/window'}`,
    firedConditions: fired,
    missingConditions: missing,
  }
}

// ── Top-level tick handler: record firings, evaluate all rules, return any that should fire ──
export interface TriggerFireResult {
  rule:        TriggerRule
  evaluation:  RuleEvaluation
  snapshot:    MarketSnapshot
}

export function processTick(
  rules: TriggerRule[],
  acc: SessionAccumulator,
  ctx: PrimitiveContext,
  dedupeWindowMins = 30,
): { accumulator: SessionAccumulator; fires: TriggerFireResult[] } {
  // 1. Gather all primitives any enabled rule cares about
  const watched = new Map<string, { primitive: PrimitiveId; threshold?: number; minutesSinceOpen?: number }>()
  for (const rule of rules) {
    if (!rule.enabled) continue
    for (const cond of rule.conditions) {
      const key = `${cond.primitive}:${cond.threshold ?? ''}:${cond.minutesSinceOpen ?? ''}`
      watched.set(key, { primitive: cond.primitive, threshold: cond.threshold, minutesSinceOpen: cond.minutesSinceOpen })
    }
  }

  // 2. Record firings
  let updatedAcc = recordFirings(acc, ctx, Array.from(watched.values()))

  // 3. Evaluate each rule
  const fires: TriggerFireResult[] = []
  const now = ctx.snap.timestamp
  const dedupeMs = dedupeWindowMins * 60 * 1000

  for (const rule of rules) {
    const evalResult = evaluateRule(rule, updatedAcc, ctx)
    if (evalResult.satisfied) {
      // Dedup: don't re-fire the same rule within the dedup window
      const lastFire = updatedAcc.firedRuleIds[rule.id]
      if (lastFire && now - lastFire < dedupeMs) continue

      updatedAcc = {
        ...updatedAcc,
        firedRuleIds: { ...updatedAcc.firedRuleIds, [rule.id]: now },
      }
      fires.push({ rule, evaluation: evalResult, snapshot: ctx.snap })
    }
  }

  return { accumulator: updatedAcc, fires }
}
