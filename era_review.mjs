/**
 * era_review.mjs — READ-ONLY. Old targets (+7/−8) vs new targets (+9/−7),
 * judged on LIVE grades including actual through-stop overshoot.
 * Run from repo root:  node era_review.mjs
 *
 *  1. Era split: every setup-engine fire, old-era vs new-era (the v11
 *     targetStructure stamp is the divider), W-L-S, hit rate, and realized
 *     expectancy using recorded points (stop losses counted at stop +
 *     through-stop overshoot parsed from the grader's note — the honest
 *     number, not the nominal −7).
 *  2. Direction × era: is the LONG-side failure structural or old-era?
 *  3. Day-type vote autopsy: the last 10 locked forecasts' per-signal votes,
 *     to see WHY it keeps calling INDETERMINATE on trend days.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = { ...process.env }
for (const f of ['.env.local', '.env']) {
  try { for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  } } catch {}
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing env — npx vercel env pull .env.local'); process.exit(1) }
const sb = createClient(URL, KEY)

const since = new Date(Date.now() - 75 * 86400000).toISOString()
const { data } = await sb.from('trade_alerts')
  .select('logged_at,signal,outcome,confidence,pts_to_t1,outcome_note,context_snapshot')
  .gte('logged_at', since).order('logged_at')

const rows = (data || []).map(a => {
  let ctx = {}
  try { ctx = JSON.parse(a.context_snapshot || '{}') } catch { if (a.context_snapshot && typeof a.context_snapshot === 'object') ctx = a.context_snapshot }
  return { ...a, ctx }
}).filter(a => a.ctx.engine === 'setup' && (a.signal === 'LONG' || a.signal === 'SHORT'))

const isW = o => o === 'HIT_T1' || o === 'HIT_T2', isL = o => o === 'STOPPED_OUT'
const era = a => a.ctx.targetStructure ? 'new (+9/-7)' : 'old (+7/-8)'
const pct = (w, l) => (w + l) ? Math.round(w / (w + l) * 100) + '%' : '—'

// Realized pts: wins use recorded pts (or nominal T1); losses use stop + overshoot from note.
function realizedPts(a) {
  const st = a.ctx.targetStructure || { t1: 7, stop: 8 }
  if (isW(a.outcome)) {
    const p = Math.abs(parseFloat(a.pts_to_t1))
    return isFinite(p) && p > 0 ? p : st.t1
  }
  if (isL(a.outcome)) {
    const m = String(a.outcome_note || '').match(/([\d.]+)\s*pts?\s+through stop/)
    const over = m ? parseFloat(m[1]) : 0
    return -(st.stop + over)
  }
  return null   // scratch/expired — excluded from expectancy
}

console.log(`\n══ 1. ERA COMPARISON (setup engine, directional fires, live grades) ══`)
const eras = {}
for (const a of rows) {
  const e = era(a)
  eras[e] = eras[e] || { n: 0, W: 0, L: 0, S: 0, P: 0, pts: 0, decided: 0, overshoot: [], days: new Set() }
  const t = eras[e]
  t.n++; t.days.add(new Date(a.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
  if (a.outcome === 'PENDING') { t.P++; continue }
  if (isW(a.outcome)) t.W++
  else if (isL(a.outcome)) {
    t.L++
    const m = String(a.outcome_note || '').match(/([\d.]+)\s*pts?\s+through stop/)
    if (m) t.overshoot.push(parseFloat(m[1]))
  } else t.S++
  const p = realizedPts(a)
  if (p !== null) { t.pts += p; t.decided++ }
}
for (const [e, t] of Object.entries(eras).sort()) {
  const avgOver = t.overshoot.length ? (t.overshoot.reduce((s, v) => s + v, 0) / t.overshoot.length).toFixed(1) : '—'
  console.log(`  ${e.padEnd(12)} n=${String(t.n).padStart(3)} over ${t.days.size}d  ${t.W}W-${t.L}L-${t.S}S (${t.P} pending)  hit ${pct(t.W, t.L)}  realized ${t.decided ? (t.pts / t.decided).toFixed(2) : '—'} pts/decided  avg stop overshoot ${avgOver}pts`)
}

console.log(`\n══ 2. DIRECTION × ERA ══`)
const dx = {}
for (const a of rows) {
  if (a.outcome === 'PENDING') continue
  const k = `${era(a)} | ${a.signal}`
  dx[k] = dx[k] || { W: 0, L: 0, S: 0 }
  if (isW(a.outcome)) dx[k].W++; else if (isL(a.outcome)) dx[k].L++; else dx[k].S++
}
for (const [k, t] of Object.entries(dx).sort()) console.log(`  ${k.padEnd(22)} ${t.W}W-${t.L}L-${t.S}S  ${pct(t.W, t.L)}`)

console.log(`\n══ 3. DAY-TYPE VOTE AUTOPSY (last 10 locked forecasts) ══`)
const { data: dt, error: dtErr } = await sb.from('day_type_signal_log')
  .select('log_date,day_type,trend_prob,range_prob,signals').order('log_date', { ascending: false }).limit(10)
if (dtErr) console.log(`  (table unreadable: ${dtErr.message})`)
else if (!dt?.length) console.log('  (no rows — migration not run or 10:45 lock never fired)')
else for (const r of dt.reverse()) {
  const sig = Array.isArray(r.signals) ? r.signals : []
  const vote = s => s.status === 'SUPPORTS_TREND' ? 'T' : s.status === 'SUPPORTS_RANGE' ? 'R' : '·'
  console.log(`  ${r.log_date}  ${String(r.day_type).padEnd(13)} T${r.trend_prob}/R${r.range_prob}  [${sig.map(s => vote(s)).join('')}]  ${sig.filter(s => s.status === 'NEUTRAL').map(s => s.name).join(', ') || 'no neutrals'}`)
}
console.log('\n  Vote key: T=trend R=range ·=neutral, in signal order (gamma, drive, VIX, term, TICK, OR, cross-asset, calendar).')
console.log('  Names listed after each row are the signals that went NEUTRAL — repeat offenders are dead feeds.')
