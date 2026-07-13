/**
 * lib/regimeMemory.ts — the learning loop.
 *
 * Given the CURRENT market state components, retrieves the most similar
 * GRADED historical states from shadow_predictions and computes measured
 * outcome probabilities per direction. This converts the shadow dataset
 * from a passive scoreboard into active intelligence: instead of the LLM
 * guessing, it cites "in N similar states, LONG hit T1 X% of the time."
 *
 * Every graded prediction automatically sharpens these stats — the
 * system gets smarter with data, no retraining required.
 *
 * Similarity: weighted component matching (exact regime_signature hashes
 * are too brittle — 9 exact bucket matches almost never recur).
 */

import { supabaseAdmin } from '@/lib/supabase'

export interface RegimeComponents {
  sessionWindow?: string | null   // open_drive | mid_session | pre_power | power_hour
  mechBias?:      string | null   // BULLISH | BEARISH | NEUTRAL | TWO_WAY
  cumDelta?:      string | null   // STRONG_BUY | BUY | NEUTRAL | SELL | STRONG_SELL
  dayType?:       string | null   // TREND | CONSOLIDATION | ...
  m15Trend?:      string | null   // BULLISH | BEARISH | RANGING
  gexRegime?:     string | null   // positive | negative
  vwapDist?:      number | string | null  // signed distance; we use the SIGN
  vix?:           number | null
}

export interface DirStats {
  n: number
  wins: number
  losses: number
  scratches: number
  hitRate: number | null          // wins / (wins + losses), null if no decided
}

export interface RegimeMemoryResult {
  sampleSize: number              // similar states found (score >= threshold)
  scoreThreshold: number
  long:  { h30: DirStats; h60: DirStats; h90: DirStats }
  short: { h30: DirStats; h60: DirStats; h90: DirStats }
  wait:  { h60: DirStats }
  bestDirection: 'LONG' | 'SHORT' | 'WAIT' | null   // highest 60m hit rate w/ n>=5
  reliability: 'STRONG' | 'MODERATE' | 'THIN'       // sample-size confidence
  summaryText: string             // prompt-ready block
}

const WEIGHTS: Record<string, number> = {
  sessionWindow: 2,
  mechBias:      2,
  cumDelta:      2,
  dayType:       2,
  vwapSign:      2,
  m15Trend:      1,
  gexRegime:     1,
  vixBand:       1,
}
const MAX_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)  // 13
const SCORE_THRESHOLD = 6   // must match on the equivalent of ~3 core dims

function vixBand(v: number | null | undefined): string | null {
  if (v == null) return null
  if (v < 15) return 'low'
  if (v < 20) return 'normal'
  if (v < 26) return 'elevated'
  return 'high'
}

function vwapSign(d: number | string | null | undefined): string | null {
  if (d == null) return null
  const n = typeof d === 'string' ? parseFloat(d) : d
  if (isNaN(n)) return null
  return n >= 0 ? 'above' : 'below'
}

function similarity(cur: RegimeComponents, hist: any): number {
  let score = 0
  if (cur.sessionWindow && hist.sessionWindow === cur.sessionWindow) score += WEIGHTS.sessionWindow
  if (cur.mechBias && hist.mechBias === cur.mechBias)                score += WEIGHTS.mechBias
  if (cur.cumDelta && hist.cumDelta === cur.cumDelta)                score += WEIGHTS.cumDelta
  if (cur.dayType && hist.dayType === cur.dayType)                   score += WEIGHTS.dayType
  if (cur.m15Trend && hist.m15Trend === cur.m15Trend)                score += WEIGHTS.m15Trend
  if (cur.gexRegime && hist.gexRegime === cur.gexRegime)             score += WEIGHTS.gexRegime
  const cs = vwapSign(cur.vwapDist); const hs = vwapSign(hist.vwapDist)
  if (cs && hs && cs === hs)                                          score += WEIGHTS.vwapSign
  const cb = vixBand(cur.vix); const hb = vixBand(hist.vix)
  if (cb && hb && cb === hb)                                          score += WEIGHTS.vixBand
  return score
}

function emptyStats(): DirStats { return { n: 0, wins: 0, losses: 0, scratches: 0, hitRate: null } }

function tally(rows: any[], horizon: 'outcome_30m' | 'outcome_60m' | 'outcome_90m'): DirStats {
  const s = emptyStats()
  for (const r of rows) {
    const o = r[horizon]
    if (!o) continue
    s.n++
    if (o === 'WIN') s.wins++
    else if (o === 'LOSS') s.losses++
    else s.scratches++
  }
  const decided = s.wins + s.losses
  s.hitRate = decided > 0 ? Math.round((s.wins / decided) * 100) : null
  return s
}

/**
 * Retrieve regime memory for the current state. Server-side only
 * (uses supabaseAdmin). Loads graded rows' components once and scores
 * in memory — fine up to tens of thousands of rows.
 */
export async function getRegimeMemory(current: RegimeComponents): Promise<RegimeMemoryResult> {
  const empty: RegimeMemoryResult = {
    sampleSize: 0, scoreThreshold: SCORE_THRESHOLD,
    long:  { h30: emptyStats(), h60: emptyStats(), h90: emptyStats() },
    short: { h30: emptyStats(), h60: emptyStats(), h90: emptyStats() },
    wait:  { h60: emptyStats() },
    bestDirection: null, reliability: 'THIN',
    summaryText: 'REGIME MEMORY: no graded history yet.',
  }

  try {
    const { data: rows } = await supabaseAdmin
      .from('shadow_predictions')
      .select('signal_direction, outcome_30m, outcome_60m, outcome_90m, context_snapshot')
      .not('outcome_60m', 'is', null)
      .limit(10000)

    if (!rows || rows.length === 0) return empty

    // Score similarity of each historical state to the current one
    const matched = rows
      .map(r => ({ row: r, score: similarity(current, r.context_snapshot || {}) }))
      .filter(m => m.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 300)   // cap: nearest 300 states

    if (matched.length === 0) {
      return { ...empty, summaryText: 'REGIME MEMORY: no sufficiently similar historical states (novel regime).' }
    }

    const mrows = matched.map(m => m.row)
    const longs  = mrows.filter(r => r.signal_direction === 'LONG')
    const shorts = mrows.filter(r => r.signal_direction === 'SHORT')
    const waits  = mrows.filter(r => r.signal_direction === 'WAIT')

    const result: RegimeMemoryResult = {
      sampleSize: matched.length,
      scoreThreshold: SCORE_THRESHOLD,
      long:  { h30: tally(longs, 'outcome_30m'), h60: tally(longs, 'outcome_60m'), h90: tally(longs, 'outcome_90m') },
      short: { h30: tally(shorts, 'outcome_30m'), h60: tally(shorts, 'outcome_60m'), h90: tally(shorts, 'outcome_90m') },
      wait:  { h60: tally(waits, 'outcome_60m') },
      bestDirection: null,
      reliability: matched.length >= 60 ? 'STRONG' : matched.length >= 20 ? 'MODERATE' : 'THIN',
      summaryText: '',
    }

    // Best direction: highest 60m hit rate among options with n >= 5 decided
    const candidates: Array<['LONG' | 'SHORT' | 'WAIT', DirStats]> = [
      ['LONG', result.long.h60], ['SHORT', result.short.h60], ['WAIT', result.wait.h60],
    ]
    let best: ['LONG' | 'SHORT' | 'WAIT', number] | null = null
    for (const [dir, s] of candidates) {
      if (s.hitRate !== null && (s.wins + s.losses) >= 5) {
        if (!best || s.hitRate > best[1]) best = [dir, s.hitRate]
      }
    }
    result.bestDirection = best ? best[0] : null

    const fmt = (s: DirStats) => s.hitRate !== null ? `${s.hitRate}% (n=${s.wins + s.losses})` : `insufficient (n=${s.wins + s.losses})`
    result.summaryText =
`REGIME MEMORY — measured outcomes from ${result.sampleSize} similar historical states [${result.reliability} sample]:
- LONG T1-hit rate @60min: ${fmt(result.long.h60)} | @30min: ${fmt(result.long.h30)}
- SHORT T1-hit rate @60min: ${fmt(result.short.h60)}
- WAIT correct @60min: ${fmt(result.wait.h60)}${result.bestDirection ? `
- Historically best call in this regime: ${result.bestDirection}` : ''}
NOTE: These are MEASURED frequencies from graded history, not opinions. Weight them accordingly — especially when they contradict your intuition.`

    return result
  } catch {
    return empty
  }
}
