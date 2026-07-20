/**
 * lib/setupEngine.ts — the ALWAYS-ON mechanical setup detector library.
 *
 * Decision (July 17): invert the signal architecture. These deterministic
 * detectors + measured probabilities are the PRIMARY signal source. The
 * LLM is demoted to risk-officer (overlay verdict on each fire). The old
 * Sonnet auto-signal keeps running as the comparison arm — trade_alerts
 * rows are stamped engine:'llm' vs engine:'setup' in context_snapshot.
 *
 * Unlike the Personal Trigger Engine (user-defined rules, opt-in), these
 * five setups run for EVERY session with no configuration:
 *
 *   1. level_rejection      — key-level retest-rejection (NEW primitive):
 *                             approach within 3pts → touch → reject 5+pts
 *                             → fail reclaim for 2 bars. Levels: round
 *                             numbers, PDH/PDL, prev close, gamma flip,
 *                             call/put walls, ORB high/low.
 *   2. vwap_reclaim / vwap_fail — decisive VWAP cross after holding the
 *                             other side.
 *   3. orb_hold_up / orb_hold_down — ORB break that HOLDS (3 min).
 *   4. flip_cross_up / flip_cross_down — gamma-flip cross + follow-through.
 *   5. pdh_sweep_reverse / pdl_sweep_reverse — sweep of prior-day extreme
 *                             that fails and reverses back through.
 *
 * Pure deterministic state machines. NO LLM anywhere in the firing path.
 * Ticks arrive every few seconds; "bars" are approximated with wall-clock
 * time (1 bar ≈ 60s), same convention as the trigger engine's hold logic.
 */

import type { MarketSnapshot } from './triggerPrimitives'

// ── Snapshot: trigger-engine snapshot + GEX levels ──────────────────────
export interface SetupSnapshot extends MarketSnapshot {
  gammaFlip: number | null
  callWall:  number | null
  putWall:   number | null
  // Optional higher-timeframe MA levels (D200EMA, H200EMA, ...) — treated as
  // named key levels for the rejection detector. Fed from fetchMTFStructure.
  extraLevels?: { label: string; value: number | null }[]
}

export type SetupId =
  | 'level_rejection'
  | 'vwap_reclaim' | 'vwap_fail'
  | 'orb_hold_up' | 'orb_hold_down'
  | 'flip_cross_up' | 'flip_cross_down'
  | 'pdh_sweep_reverse' | 'pdl_sweep_reverse'

export const SETUP_LABELS: Record<SetupId, string> = {
  level_rejection:   'Key-level rejection',
  vwap_reclaim:      'VWAP reclaim',
  vwap_fail:         'VWAP fail',
  orb_hold_up:       'ORB break + hold (up)',
  orb_hold_down:     'ORB break + hold (down)',
  flip_cross_up:     'Gamma-flip cross (up)',
  flip_cross_down:   'Gamma-flip cross (down)',
  pdh_sweep_reverse: 'PDH sweep + reverse',
  pdl_sweep_reverse: 'PDL sweep + reverse',
}

export interface SetupFire {
  setupId:    SetupId
  name:       string               // display, e.g. "7500 rejection"
  direction:  'LONG' | 'SHORT'
  level:      number | null        // the level that defined the setup
  levelLabel: string | null        // "7500" | "PDH" | "gamma flip" | ...
  detail:     string               // human-readable evidence line
  firedAt:    number
  snapshot:   SetupSnapshot
}

// ── Tunables ────────────────────────────────────────────────────────────
const APPROACH_PTS   = 3      // within 3pts of a level = approaching
const TOUCH_PTS      = 1      // within 1pt = touched
const REJECT_PTS     = 5      // must move 5+ pts away = rejected
const RECLAIM_PTS    = 2      // getting back within 2pts of level = reclaim attempt
const BREAK_PTS      = 1.5    // crossing beyond level by this = break, not rejection
const BAR_MS         = 60_000 // 1 "bar" ≈ 60s of wall-clock
const CONFIRM_BARS   = 2      // fail-reclaim window: 2 bars
const MACHINE_STALE_MS = 45 * 60_000  // abandon a stalled machine after 45min

const VWAP_BUFFER    = 1.5    // decisive cross distance
const VWAP_MIN_SIDE_MS = 5 * 60_000  // must have held prior side ≥5min (filters chop)

const ORB_HOLD_MS    = 3 * 60_000    // break must hold 3min
const ORB_FAIL_PTS   = 1             // back inside range by 1pt = failed break

const FLIP_FOLLOW_PTS = 4            // follow-through distance beyond flip
const FLIP_HOLD_MS    = 2 * 60_000   // must stay beyond flip 2min

const SWEEP_REVERSE_PTS   = 2        // reverse back through extreme by 2pts
const SWEEP_WINDOW_MS     = 20 * 60_000  // reversal must happen within 20min

const DEDUPE_MS      = 30 * 60_000   // don't refire same setup+level within 30min
const FIRE_MIN_SESSION_MIN = 30      // your rule: no entries before 10:00 ET
const FIRE_MAX_SESSION_MIN = 370     // no fresh entries after 3:40 ET

// ── Per-level rejection state machine ───────────────────────────────────
interface LevelMachine {
  phase:       'idle' | 'approach' | 'touched' | 'rejected'
  side:        'below' | 'above' | null  // side price approached FROM
  enteredAt:   number
  touchedAt:   number | null
  rejectedAt:  number | null
}

export interface SetupEngineState {
  sessionDate:   string
  levelMachines: Record<string, LevelMachine>   // key: `${label}@${level rounded}`
  vwapSide:      'above' | 'below' | null
  vwapSideSince: number
  orbUpBrokeAt:  number | null
  orbDnBrokeAt:  number | null
  flipSide:      'above' | 'below' | null
  flipCrossedAt: number | null
  flipCrossDir:  'up' | 'down' | null
  pdhSweptAt:    number | null
  pdlSweptAt:    number | null
  fired:         Record<string, number>          // dedupe: fireKey → ts
}

export function newSetupState(sessionDate: string): SetupEngineState {
  return {
    sessionDate,
    levelMachines: {},
    vwapSide: null, vwapSideSince: 0,
    orbUpBrokeAt: null, orbDnBrokeAt: null,
    flipSide: null, flipCrossedAt: null, flipCrossDir: null,
    pdhSweptAt: null, pdlSweptAt: null,
    fired: {},
  }
}

// ── Level collection: named levels + round numbers near price ───────────
interface KeyLevel { label: string; value: number; named: boolean }

function collectLevels(snap: SetupSnapshot): KeyLevel[] {
  const out: KeyLevel[] = []
  const push = (label: string, v: number | null | undefined) => {
    if (v != null && isFinite(v) && v > 0) out.push({ label, value: v, named: true })
  }
  push('PDH', snap.pdh)
  push('PDL', snap.pdl)
  push('prev close', snap.prevClose)
  push('ORB-H', snap.orbHigh)
  push('ORB-L', snap.orbLow)
  push('gamma flip', snap.gammaFlip)
  push('call wall', snap.callWall)
  push('put wall', snap.putWall)
  for (const xl of snap.extraLevels || []) push(xl.label, xl.value)

  // Round numbers: multiples of 25 within ±30pts of price (SPX psychology levels)
  if (snap.currentPrice) {
    const base = Math.round(snap.currentPrice / 25) * 25
    for (let k = -1; k <= 1; k++) {
      const rn = base + k * 25
      if (Math.abs(rn - snap.currentPrice) <= 30) {
        out.push({ label: String(rn), value: rn, named: false })
      }
    }
  }

  // Dedupe levels within 2pts of each other — prefer named levels
  const kept: KeyLevel[] = []
  const sorted = [...out].sort((a, b) => (a.named === b.named ? 0 : a.named ? -1 : 1))
  for (const lvl of sorted) {
    if (!kept.some(k => Math.abs(k.value - lvl.value) < 2)) kept.push(lvl)
  }
  return kept
}

// ── Main tick processor ─────────────────────────────────────────────────
export function processSetupTick(
  state: SetupEngineState,
  snap: SetupSnapshot,
): { state: SetupEngineState; fires: SetupFire[] } {
  const s: SetupEngineState = {
    ...state,
    levelMachines: { ...state.levelMachines },
    fired: { ...state.fired },
  }
  const fires: SetupFire[] = []
  const p = snap.currentPrice
  const now = snap.timestamp
  if (!p || !isFinite(p)) return { state: s, fires }

  const canFire = snap.sessionMinutes >= FIRE_MIN_SESSION_MIN &&
                  snap.sessionMinutes <= FIRE_MAX_SESSION_MIN

  const tryFire = (fire: Omit<SetupFire, 'firedAt' | 'snapshot'>, dedupeKey: string) => {
    if (!canFire) return
    const last = s.fired[dedupeKey]
    if (last && now - last < DEDUPE_MS) return
    s.fired[dedupeKey] = now
    fires.push({ ...fire, firedAt: now, snapshot: snap })
  }

  // ═══ 1. KEY-LEVEL RETEST-REJECTION ══════════════════════════════════
  const levels = collectLevels(snap)
  const liveKeys = new Set<string>()

  for (const lvl of levels) {
    const key = `${lvl.label}@${lvl.value.toFixed(0)}`
    liveKeys.add(key)
    const dist = p - lvl.value
    let m = s.levelMachines[key]

    // Abandon stalled machines
    if (m && m.phase !== 'idle' && now - m.enteredAt > MACHINE_STALE_MS) m = undefined as any

    if (!m || m.phase === 'idle') {
      if (Math.abs(dist) <= APPROACH_PTS) {
        s.levelMachines[key] = {
          phase: Math.abs(dist) <= TOUCH_PTS ? 'touched' : 'approach',
          side: dist < 0 ? 'below' : 'above',
          enteredAt: now,
          touchedAt: Math.abs(dist) <= TOUCH_PTS ? now : null,
          rejectedAt: null,
        }
      }
      continue
    }

    const brokeThrough =
      (m.side === 'below' && dist > BREAK_PTS) ||
      (m.side === 'above' && dist < -BREAK_PTS)

    if (m.phase === 'approach') {
      if (brokeThrough) { delete s.levelMachines[key]; continue }         // break, not rejection
      if (Math.abs(dist) <= TOUCH_PTS) {
        s.levelMachines[key] = { ...m, phase: 'touched', touchedAt: now }
      } else if (Math.abs(dist) > APPROACH_PTS + REJECT_PTS) {
        delete s.levelMachines[key]                                        // wandered off without touching
      }
      continue
    }

    if (m.phase === 'touched') {
      if (brokeThrough) { delete s.levelMachines[key]; continue }
      const rejected =
        (m.side === 'below' && dist <= -REJECT_PTS) ||
        (m.side === 'above' && dist >=  REJECT_PTS)
      if (rejected) s.levelMachines[key] = { ...m, phase: 'rejected', rejectedAt: now }
      continue
    }

    if (m.phase === 'rejected') {
      const reclaiming =
        (m.side === 'below' && dist >= -RECLAIM_PTS) ||
        (m.side === 'above' && dist <=  RECLAIM_PTS)
      if (reclaiming) { delete s.levelMachines[key]; continue }            // reclaim = rejection failed
      if (now - (m.rejectedAt || now) >= CONFIRM_BARS * BAR_MS) {
        // Confirmed: touched the level, rejected 5+pts, failed to reclaim for 2 bars
        const direction: 'LONG' | 'SHORT' = m.side === 'below' ? 'SHORT' : 'LONG'
        tryFire({
          setupId: 'level_rejection',
          name: `${lvl.label} rejection`,
          direction,
          level: lvl.value,
          levelLabel: lvl.label,
          detail: `touched ${lvl.label} ${lvl.value.toFixed(0)} from ${m.side}, rejected ${REJECT_PTS}+pts, no reclaim for ${CONFIRM_BARS} bars`,
        }, `level_rejection:${key}`)
        delete s.levelMachines[key]
      }
      continue
    }
  }
  // Drop machines whose level disappeared (e.g. GEX refresh moved the wall)
  for (const key of Object.keys(s.levelMachines)) {
    if (!liveKeys.has(key)) delete s.levelMachines[key]
  }

  // ═══ 2. VWAP RECLAIM / FAIL ═════════════════════════════════════════
  if (snap.vwap != null) {
    const vd = p - snap.vwap
    const decisiveSide: 'above' | 'below' | null =
      vd >= VWAP_BUFFER ? 'above' : vd <= -VWAP_BUFFER ? 'below' : null
    if (decisiveSide && decisiveSide !== s.vwapSide) {
      const heldPriorLongEnough = s.vwapSide !== null && (now - s.vwapSideSince) >= VWAP_MIN_SIDE_MS
      if (heldPriorLongEnough) {
        if (decisiveSide === 'above') {
          tryFire({
            setupId: 'vwap_reclaim', name: 'VWAP reclaim', direction: 'LONG',
            level: snap.vwap, levelLabel: 'VWAP',
            detail: `reclaimed VWAP ${snap.vwap.toFixed(1)} after holding below ${Math.round((now - s.vwapSideSince) / 60000)}min`,
          }, 'vwap_reclaim')
        } else {
          tryFire({
            setupId: 'vwap_fail', name: 'VWAP fail', direction: 'SHORT',
            level: snap.vwap, levelLabel: 'VWAP',
            detail: `lost VWAP ${snap.vwap.toFixed(1)} after holding above ${Math.round((now - s.vwapSideSince) / 60000)}min`,
          }, 'vwap_fail')
        }
      }
      s.vwapSide = decisiveSide
      s.vwapSideSince = now
    } else if (decisiveSide && s.vwapSide === null) {
      s.vwapSide = decisiveSide
      s.vwapSideSince = now
    }
  }

  // ═══ 3. ORB BREAK-AND-HOLD ══════════════════════════════════════════
  if (snap.orbHigh != null && snap.sessionMinutes >= 30) {
    if (s.orbUpBrokeAt === null) {
      if (p > snap.orbHigh + BREAK_PTS) s.orbUpBrokeAt = now
    } else if (p < snap.orbHigh - ORB_FAIL_PTS) {
      s.orbUpBrokeAt = null                                               // fell back inside — failed break
    } else if (now - s.orbUpBrokeAt >= ORB_HOLD_MS) {
      tryFire({
        setupId: 'orb_hold_up', name: 'ORB break + hold', direction: 'LONG',
        level: snap.orbHigh, levelLabel: 'ORB-H',
        detail: `broke ORB high ${snap.orbHigh.toFixed(1)} and held ${Math.round(ORB_HOLD_MS / 60000)}min`,
      }, 'orb_hold_up')
      s.orbUpBrokeAt = null
    }
  }
  if (snap.orbLow != null && snap.sessionMinutes >= 30) {
    if (s.orbDnBrokeAt === null) {
      if (p < snap.orbLow - BREAK_PTS) s.orbDnBrokeAt = now
    } else if (p > snap.orbLow + ORB_FAIL_PTS) {
      s.orbDnBrokeAt = null
    } else if (now - s.orbDnBrokeAt >= ORB_HOLD_MS) {
      tryFire({
        setupId: 'orb_hold_down', name: 'ORB breakdown + hold', direction: 'SHORT',
        level: snap.orbLow, levelLabel: 'ORB-L',
        detail: `broke ORB low ${snap.orbLow.toFixed(1)} and held ${Math.round(ORB_HOLD_MS / 60000)}min`,
      }, 'orb_hold_down')
      s.orbDnBrokeAt = null
    }
  }

  // ═══ 4. GAMMA-FLIP CROSS + FOLLOW-THROUGH ═══════════════════════════
  if (snap.gammaFlip != null) {
    const side: 'above' | 'below' = p >= snap.gammaFlip ? 'above' : 'below'
    if (s.flipSide === null) {
      s.flipSide = side
    } else if (side !== s.flipSide && s.flipCrossedAt === null) {
      s.flipCrossedAt = now
      s.flipCrossDir = side === 'above' ? 'up' : 'down'
      s.flipSide = side
    } else if (s.flipCrossedAt !== null) {
      const crossedUp = s.flipCrossDir === 'up'
      const stillBeyond = crossedUp ? p > snap.gammaFlip : p < snap.gammaFlip
      if (!stillBeyond) {
        s.flipCrossedAt = null; s.flipCrossDir = null                     // cross reversed — no follow-through
        s.flipSide = side
      } else {
        const followThrough = crossedUp
          ? p >= snap.gammaFlip + FLIP_FOLLOW_PTS
          : p <= snap.gammaFlip - FLIP_FOLLOW_PTS
        if (followThrough && now - s.flipCrossedAt >= FLIP_HOLD_MS) {
          tryFire({
            setupId: crossedUp ? 'flip_cross_up' : 'flip_cross_down',
            name: `Gamma-flip cross ${crossedUp ? 'up' : 'down'}`,
            direction: crossedUp ? 'LONG' : 'SHORT',
            level: snap.gammaFlip, levelLabel: 'gamma flip',
            detail: `crossed flip ${snap.gammaFlip.toFixed(0)} ${crossedUp ? 'up' : 'down'}, ${FLIP_FOLLOW_PTS}+pt follow-through held ${Math.round(FLIP_HOLD_MS / 60000)}min`,
          }, `flip_cross_${crossedUp ? 'up' : 'down'}`)
          s.flipCrossedAt = null; s.flipCrossDir = null
        }
      }
    }
  }

  // ═══ 5. PDH/PDL SWEEP-AND-REVERSE ═══════════════════════════════════
  if (snap.pdh != null) {
    if (s.pdhSweptAt === null) {
      if (p > snap.pdh + BREAK_PTS) s.pdhSweptAt = now
    } else if (now - s.pdhSweptAt > SWEEP_WINDOW_MS) {
      s.pdhSweptAt = null                                                 // held above → real break, not a sweep
    } else if (p < snap.pdh - SWEEP_REVERSE_PTS) {
      tryFire({
        setupId: 'pdh_sweep_reverse', name: 'PDH sweep + reverse', direction: 'SHORT',
        level: snap.pdh, levelLabel: 'PDH',
        detail: `swept above PDH ${snap.pdh.toFixed(1)}, reversed back through within ${Math.round((now - s.pdhSweptAt) / 60000)}min`,
      }, 'pdh_sweep_reverse')
      s.pdhSweptAt = null
    }
  }
  if (snap.pdl != null) {
    if (s.pdlSweptAt === null) {
      if (p < snap.pdl - BREAK_PTS) s.pdlSweptAt = now
    } else if (now - s.pdlSweptAt > SWEEP_WINDOW_MS) {
      s.pdlSweptAt = null
    } else if (p > snap.pdl + SWEEP_REVERSE_PTS) {
      tryFire({
        setupId: 'pdl_sweep_reverse', name: 'PDL sweep + reverse', direction: 'LONG',
        level: snap.pdl, levelLabel: 'PDL',
        detail: `swept below PDL ${snap.pdl.toFixed(1)}, reversed back through within ${Math.round((now - s.pdlSweptAt) / 60000)}min`,
      }, 'pdl_sweep_reverse')
      s.pdlSweptAt = null
    }
  }

  return { state: s, fires }
}

// ── Contract recommendation (deterministic, ITM per trader's system) ────
export interface ContractRec {
  type: 'CALL' | 'PUT'
  strike: number
  expiry: string        // ISO date
  expiryLabel: string   // '0DTE' or 'Aug 14'
  dte: number
}

/** Day trade: 0DTE, ~15pts ITM, strikes in 5s (≈0.60-0.65 delta at entry). */
export function recommendDayContract(direction: 'LONG' | 'SHORT', spot: number): ContractRec {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  if (direction === 'LONG') {
    return { type: 'CALL', strike: Math.floor((spot - 15) / 5) * 5, expiry: today, expiryLabel: '0DTE', dte: 0 }
  }
  return { type: 'PUT', strike: Math.ceil((spot + 15) / 5) * 5, expiry: today, expiryLabel: '0DTE', dte: 0 }
}

/** Swing: ~50pts ITM (≈0.70 delta), strikes in 25s, first Friday ≥21 days out. */
export function recommendSwingContract(direction: 'LONG' | 'SHORT', spot: number): ContractRec {
  const d = new Date()
  d.setDate(d.getDate() + 21)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)   // roll forward to Friday
  const expiry = d.toISOString().split('T')[0]
  const expiryLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const dte = Math.round((d.getTime() - Date.now()) / 86400000)
  if (direction === 'LONG') {
    return { type: 'CALL', strike: Math.floor((spot - 50) / 25) * 25, expiry, expiryLabel, dte }
  }
  return { type: 'PUT', strike: Math.ceil((spot + 50) / 25) * 25, expiry, expiryLabel, dte }
}

// ── Swing structure detector (multi-day, from MTF crossovers) ───────────
// Fires on fresh daily/weekly MA crossovers that AGREE with overall MA
// structure. Distinct from intraday setups: different card, different
// contract profile, excluded from the intraday grader.
export interface SwingSignal {
  id: string
  name: string
  direction: 'LONG' | 'SHORT'
  basis: string
  stopAnchor: number | null   // slower MA of the crossed pair
  barsAgo: number
}

export function detectSwingFromStructure(mtf: any): SwingSignal | null {
  if (!mtf?.spx?.d1) return null
  const d1 = mtf.spx.d1, w1 = mtf.spx.w1
  const p = mtf.spx.m5?.price ?? d1.price
  if (!p) return null

  // Structure agreement: fraction of tracked MAs below price
  const mas = [
    mtf.spx.m5?.ema9, mtf.spx.m5?.ema200, mtf.spx.m5?.sma200,
    mtf.spx.h1?.ema9, mtf.spx.h1?.ema200, mtf.spx.h1?.sma200,
    d1.ema9, d1.ema20, d1.ema50, d1.ema200, d1.sma200,
    w1?.ema9, w1?.ema20, w1?.ema50, w1?.ema200, w1?.sma200,
  ].filter((v: any) => v != null) as number[]
  if (!mas.length) return null
  const aboveFrac = mas.filter(v => p > v).length / mas.length

  // Priority order: major crosses first, then faster ones
  const candidates: Array<{ id: string; name: string; cross: any; maxAge: number; slower: number | null; weekly?: boolean }> = [
    { id: 'd_50x200', name: 'Daily 50/200 EMA', cross: d1.crosses?.e50x200, maxAge: 3, slower: d1.ema200 },
    { id: 'w_9x20',   name: 'Weekly 9/20 EMA',  cross: w1?.crosses?.e9x20,  maxAge: 1, slower: w1?.ema20 ?? null, weekly: true },
    { id: 'd_20x50',  name: 'Daily 20/50 EMA',  cross: d1.crosses?.e20x50,  maxAge: 2, slower: d1.ema50 },
    { id: 'd_9x20',   name: 'Daily 9/20 EMA',   cross: d1.crosses?.e9x20,   maxAge: 2, slower: d1.ema20 },
  ]
  for (const c of candidates) {
    if (!c.cross || c.cross.barsAgo > c.maxAge) continue
    const direction: 'LONG' | 'SHORT' = c.cross.dir === 'GOLDEN' ? 'LONG' : 'SHORT'
    // Structure must agree: golden needs bull-leaning MAs, death needs bear-leaning
    if (direction === 'LONG' && aboveFrac < 0.5) continue
    if (direction === 'SHORT' && aboveFrac > 0.5) continue
    return {
      id: `swing:${c.id}:${c.cross.dir}`,
      name: `${c.name} ${c.cross.dir === 'GOLDEN' ? 'golden' : 'death'} cross`,
      direction,
      basis: `${c.name} ${c.cross.dir} cross ${c.cross.barsAgo === 0 ? 'this bar' : c.cross.barsAgo + (c.weekly ? ' weeks' : ' days') + ' ago'}; structure ${Math.round(aboveFrac * 100)}% of MAs ${direction === 'LONG' ? 'below' : 'above'} price`,
      stopAnchor: c.slower,
      barsAgo: c.cross.barsAgo,
    }
  }
  return null
}
