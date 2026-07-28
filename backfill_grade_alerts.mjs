/**
 * backfill_grade_alerts.mjs — replay-grade the July 20-21 trade_alerts.
 *
 * The score-alerts grader polls CURRENT price, so it can only grade live.
 * The heartbeat wasn't running on Jul 20-21, so 27 signals sat PENDING.
 * This script grades them properly by replaying I:SPX 5-minute bars from
 * each signal's timestamp: strict stop-before-target within each bar,
 * 120-minute window, same PARTIAL/EXPIRED drift rules as the live scorer.
 *
 * OVERWRITES outcomes for rows logged Jul 20-21 even if already graded —
 * intentional, because any grade the live scorer applies retroactively to
 * these rows is wrong by construction.
 *
 * Run from repo root (needs node_modules + .env.local):
 *   node backfill_grade_alerts.mjs           (dry run — prints, writes nothing)
 *   node backfill_grade_alerts.mjs --write   (applies grades to Supabase)
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// ── env ──────────────────────────────────────────────────────────────────
const env = {}
try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { console.error('Could not read .env.local — run from repo root'); process.exit(1) }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const POLYGON_KEY  = env.POLYGON_API_KEY
if (!SUPABASE_URL || !SUPABASE_KEY || !POLYGON_KEY) {
  console.error('Missing env: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POLYGON_API_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const WRITE = process.argv.includes('--write')
const DAYS = ['2026-07-20', '2026-07-21']
const WINDOW_MIN = 120

// ── bars ─────────────────────────────────────────────────────────────────
async function fetchBars(day) {
  const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${day}/${day}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  return data.results || []   // { t, o, h, l, c }
}

// ── replay grader ────────────────────────────────────────────────────────
function replayGrade(alert, bars) {
  const signal  = (alert.signal || '').toUpperCase()
  const isLong  = signal === 'LONG'
  const isShort = signal === 'SHORT'
  const isWait  = signal === 'WAIT' || signal === 'NO TRADE'
  const entry   = parseFloat(alert.entry_mid)
  const stop    = parseFloat(alert.stop_level)
  const t1      = parseFloat(alert.target1)
  const t2      = parseFloat(alert.target2)
  const t0      = new Date(alert.logged_at).getTime()
  const windowEnd = t0 + WINDOW_MIN * 60000
  const path    = bars.filter(b => b.t >= t0 && b.t <= windowEnd)
  if (!path.length) return { outcome: 'EXPIRED', pts: 0, note: 'backfill: no bars in window (late-day signal)', at: new Date(windowEnd) }
  if (!isFinite(entry)) return { outcome: 'EXPIRED', pts: 0, note: 'backfill: no entry_mid', at: new Date(windowEnd) }

  if (isWait) {
    let correctHold = true
    for (const b of path) {
      const drift = Math.abs(b.c - entry)
      const min = Math.round((b.t - t0) / 60000)
      if (drift >= 10) return { outcome: 'STOPPED_OUT', pts: drift, note: `backfill replay: WAIT missed — ${(b.c - entry).toFixed(1)}pts at ${min}min`, at: new Date(b.t) }
      if (min <= 90 && drift > 5) correctHold = false
    }
    const endDrift = Math.abs(path[path.length - 1].c - entry)
    if (correctHold && (path[path.length - 1].t - t0) / 60000 >= 90) {
      return { outcome: 'HIT_T1', pts: endDrift, note: `backfill replay: WAIT correct — held ${endDrift.toFixed(1)}pts range`, at: new Date(path[path.length - 1].t) }
    }
    return { outcome: 'EXPIRED', pts: endDrift, note: `backfill replay: WAIT neutral — ${endDrift.toFixed(1)}pts drift`, at: new Date(path[path.length - 1].t) }
  }

  if (!isLong && !isShort) return { outcome: 'EXPIRED', pts: 0, note: `backfill: unknown signal ${signal}`, at: new Date(windowEnd) }
  if (!isFinite(stop) || !isFinite(t1)) return { outcome: 'EXPIRED', pts: 0, note: 'backfill: missing stop/t1', at: new Date(windowEnd) }

  let t1HitAt = null
  for (const b of path) {
    const min = Math.round((b.t - t0) / 60000)
    const stopped = isLong ? b.l <= stop : b.h >= stop
    const hit1    = isLong ? b.h >= t1  : b.l <= t1
    const hit2    = isFinite(t2) && (isLong ? b.h >= t2 : b.l <= t2)
    if (t1HitAt === null) {
      // STRICT: if stop and T1 touch in the same bar, stop wins
      if (stopped) return { outcome: 'STOPPED_OUT', pts: isLong ? b.l - entry : entry - b.h, note: `backfill replay: stopped at ${min}min`, at: new Date(b.t) }
      if (hit1) {
        t1HitAt = b.t
        if (hit2) return { outcome: 'HIT_T2', pts: Math.abs(t2 - entry), note: `backfill replay: T2 at ${min}min`, at: new Date(b.t) }
      }
    } else {
      if (stopped) return { outcome: 'HIT_T1', pts: Math.abs(t1 - entry), note: `backfill replay: T1 at ${Math.round((t1HitAt - t0) / 60000)}min, stopped after`, at: new Date(t1HitAt) }
      if (hit2) return { outcome: 'HIT_T2', pts: Math.abs(t2 - entry), note: `backfill replay: T2 at ${min}min`, at: new Date(b.t) }
    }
  }
  if (t1HitAt !== null) return { outcome: 'HIT_T1', pts: Math.abs(t1 - entry), note: `backfill replay: T1 at ${Math.round((t1HitAt - t0) / 60000)}min`, at: new Date(t1HitAt) }

  const endC = path[path.length - 1].c
  const mov = isLong ? endC - entry : entry - endC
  if (mov >= 8)  return { outcome: 'PARTIAL',     pts: mov, note: `backfill replay: +${mov.toFixed(1)}pts favorable, no T1 in ${WINDOW_MIN}min`, at: new Date(path[path.length - 1].t) }
  if (mov <= -5) return { outcome: 'STOPPED_OUT', pts: mov, note: `backfill replay: ${mov.toFixed(1)}pts adverse over ${WINDOW_MIN}min`, at: new Date(path[path.length - 1].t) }
  return { outcome: 'EXPIRED', pts: mov, note: `backfill replay: flat ${mov.toFixed(1)}pts over ${WINDOW_MIN}min`, at: new Date(path[path.length - 1].t) }
}

// ── main ─────────────────────────────────────────────────────────────────
const norm = o => (o === 'HIT_T1' || o === 'HIT_T2') ? 'WIN' : o === 'STOPPED_OUT' ? 'LOSS' : 'SCRATCH'

const { data: alerts, error } = await supabase
  .from('trade_alerts')
  .select('*')
  .gte('logged_at', '2026-07-20T04:00:00Z')
  .lt('logged_at', '2026-07-22T04:00:00Z')
  .order('logged_at', { ascending: true })
if (error) { console.error('fetch error:', error.message); process.exit(1) }

const rows = (alerts || []).filter(a => !(a.context_snapshot || '').includes('"engine":"swing"'))
console.log(`${rows.length} alerts to replay-grade (${WRITE ? 'WRITE MODE' : 'DRY RUN — add --write to apply'})\n`)

const barsByDay = {}
for (const day of DAYS) { barsByDay[day] = await fetchBars(day); console.log(`${day}: ${barsByDay[day].length} bars`) }
console.log()

const engineOf = a => {
  try { return JSON.parse(a.context_snapshot || '{}').engine || 'unstamped' } catch { return 'unstamped' }
}
const tally = {}
for (const a of rows) {
  const day = new Date(a.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const bars = barsByDay[day] || []
  const g = replayGrade(a, bars)
  const eng = engineOf(a)
  const timeET = new Date(a.logged_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
  const setupName = (() => { try { return JSON.parse(a.context_snapshot || '{}').setupName || '' } catch { return '' } })()
  console.log(`${day} ${timeET}  ${(a.signal || '?').padEnd(5)} [${eng}]${setupName ? ' ' + setupName : ''} → ${g.outcome} (${norm(g.outcome)})  ${g.note}`)

  const k = `${eng}|${day}`
  tally[k] = tally[k] || { W: 0, L: 0, S: 0 }
  tally[k][norm(g.outcome)[0]]++

  if (WRITE) {
    const { error: upErr } = await supabase.from('trade_alerts').update({
      outcome: g.outcome,
      outcome_normalized: norm(g.outcome),
      outcome_at: g.at.toISOString(),
      pts_to_t1: parseFloat((g.pts ?? 0).toFixed(1)),
      outcome_note: g.note,
      scored_at: new Date().toISOString(),
    }).eq('id', a.id)
    if (upErr) console.error(`  UPDATE FAILED for ${a.id}: ${upErr.message}`)
  }
}

console.log('\n══ SUMMARY (W-L-S, scratch excluded from hit rate) ══')
for (const [k, t] of Object.entries(tally).sort()) {
  const [eng, day] = k.split('|')
  const decided = t.W + t.L
  const hr = decided ? Math.round((t.W / decided) * 100) : null
  console.log(`${day}  engine:${eng.padEnd(9)} ${t.W}W-${t.L}L-${t.S}S${hr !== null ? `  hit rate ${hr}% (n=${decided})` : '  no decided'}`)
}
console.log(WRITE ? '\nGrades written to Supabase.' : '\nDry run complete — re-run with --write to apply.')
