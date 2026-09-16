/**
 * monthly_review.mjs — "are we actually getting better?" with receipts.
 * READ-ONLY (no writes). Run from repo root:  node monthly_review.mjs
 * Env: .env.local (npx vercel env pull .env.local if missing).
 *
 * Answers, from the last 45 days of data:
 *  1. Primary-engine reliability: days the cockpit was alive (shadow ran)
 *     but the setup/LLM arms logged NOTHING — the silent-day count.
 *  2. Engine experiment: setup-arm vs llm-arm hit rates + per-setup table.
 *  3. Flow ablation: llm-arm signals with vs without UW flow context.
 *  4. Shadow trend by week: is the with-GEX arm improving vs the 21% baseline?
 *  5. Day-type forecast accuracy before vs after the v9 rework (Aug 4).
 *  6. Learning-loop freshness: when each artifact last actually updated.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = { ...process.env }
for (const f of ['.env.local', '.env.development.local', '.env']) {
  try { for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  } } catch {}
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('Missing Supabase env — npx vercel env pull .env.local'); process.exit(1) }
const sb = createClient(URL, KEY)

const DAYS = 45
const since = new Date(Date.now() - DAYS * 86400000).toISOString()
const V9_DATE = '2026-08-04'
const etDate = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const pct = (w, l) => (w + l) ? Math.round(w / (w + l) * 100) + '%' : '—'
const isWin = o => o === 'HIT_T1' || o === 'HIT_T2'
const isLoss = o => o === 'STOPPED_OUT'

// ── fetch ────────────────────────────────────────────────────────────────
const [{ data: alerts }, { data: shadows }, { data: recaps }, { data: rules }, { data: dtLog }] = await Promise.all([
  sb.from('trade_alerts').select('logged_at,signal,outcome,confidence,context_snapshot,auto_fired').gte('logged_at', since).order('logged_at'),
  sb.from('shadow_predictions').select('created_at,signal_direction,status,outcome_60m').gte('created_at', since).order('created_at'),
  sb.from('daily_recaps').select('recap_date,day_type_predicted,day_type_actual,win_rate,signals_count').gte('recap_date', new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0]).order('recap_date'),
  sb.from('user_discovered_rules').select('updated_at,rules'),
  sb.from('day_type_signal_log').select('log_date,day_type,signals').order('log_date'),
])

const A = alerts || [], S = shadows || [], R = recaps || [], DT = dtLog || []
const ctx = a => { try { return JSON.parse(a.context_snapshot || '{}') } catch { return typeof a.context_snapshot === 'object' && a.context_snapshot ? a.context_snapshot : {} } }
const eng = a => ctx(a).engine || (a.auto_fired ? 'llm-legacy' : 'manual')

// ── 1. silent days ──────────────────────────────────────────────────────
console.log(`\n══ 1. PRIMARY ENGINE RELIABILITY (last ${DAYS}d) ══`)
const shadowDays = new Set(S.map(s => etDate(s.created_at)))
const alertDays = new Set(A.filter(a => ['setup', 'llm', 'llm-legacy'].includes(eng(a))).map(a => etDate(a.logged_at)))
const silent = [...shadowDays].filter(d => !alertDays.has(d)).sort()
const active = [...shadowDays].filter(d => alertDays.has(d)).sort()
console.log(`Cockpit-alive days (shadow ran): ${shadowDays.size}`)
console.log(`  …with primary-engine signals:  ${active.length}`)
console.log(`  …SILENT (shadow ran, arms logged nothing): ${silent.length}${silent.length ? '  → ' + silent.join(', ') : ''}`)

// ── 2. engine experiment ────────────────────────────────────────────────
console.log(`\n══ 2. ENGINE EXPERIMENT (setup vs llm, scratch excluded) ══`)
const arms = {}
for (const a of A) {
  const e = eng(a); if (e === 'swing' || e === 'manual') continue
  arms[e] = arms[e] || { W: 0, L: 0, S: 0, P: 0, n: 0 }
  arms[e].n++
  if (a.outcome === 'PENDING') arms[e].P++
  else if (isWin(a.outcome)) arms[e].W++
  else if (isLoss(a.outcome)) arms[e].L++
  else arms[e].S++
}
for (const [e, t] of Object.entries(arms)) console.log(`  ${e.padEnd(11)} n=${String(t.n).padStart(3)}  ${t.W}W-${t.L}L-${t.S}S (${t.P} pending)  hit rate ${pct(t.W, t.L)} (n=${t.W + t.L})`)
const perSetup = {}
for (const a of A.filter(a => eng(a) === 'setup')) {
  const id = ctx(a).setupId || '?'
  perSetup[id] = perSetup[id] || { W: 0, L: 0, S: 0 }
  if (isWin(a.outcome)) perSetup[id].W++; else if (isLoss(a.outcome)) perSetup[id].L++; else if (a.outcome !== 'PENDING') perSetup[id].S++
}
if (Object.keys(perSetup).length) {
  console.log('  Per setup:')
  for (const [id, t] of Object.entries(perSetup).sort((x, y) => (y[1].W + y[1].L) - (x[1].W + x[1].L)))
    console.log(`    ${id.padEnd(20)} ${t.W}W-${t.L}L-${t.S}S  ${pct(t.W, t.L)}`)
}

// ── 3. flow ablation ────────────────────────────────────────────────────
console.log(`\n══ 3. UW FLOW ABLATION (llm arm) ══`)
const fl = { with: { W: 0, L: 0 }, without: { W: 0, L: 0 } }
for (const a of A.filter(a => ['llm', 'llm-legacy'].includes(eng(a)))) {
  const c = ctx(a); const k = (c.hadFlow || c.had_flow) ? 'with' : 'without'
  if (isWin(a.outcome)) fl[k].W++; else if (isLoss(a.outcome)) fl[k].L++
}
console.log(`  with flow:    ${fl.with.W}W-${fl.with.L}L  ${pct(fl.with.W, fl.with.L)}`)
console.log(`  without flow: ${fl.without.W}W-${fl.without.L}L  ${pct(fl.without.W, fl.without.L)}`)

// ── 4. shadow weekly trend ──────────────────────────────────────────────
console.log(`\n══ 4. SHADOW ARM WEEKLY TREND (60min grading, vs 21% no-GEX baseline) ══`)
const wk = {}
for (const s of S.filter(s => s.status === 'graded_60m' && s.outcome_60m)) {
  const d = new Date(s.created_at); const y = d.getFullYear()
  const week = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + new Date(y, 0, 1).getDay() + 1) / 7)
  const k = `${y}-W${String(week).padStart(2, '0')}`
  wk[k] = wk[k] || { W: 0, L: 0, S: 0 }
  wk[k][s.outcome_60m === 'WIN' ? 'W' : s.outcome_60m === 'LOSS' ? 'L' : 'S']++
}
for (const [k, t] of Object.entries(wk).sort()) console.log(`  ${k}  ${String(t.W).padStart(3)}W-${String(t.L).padStart(3)}L-${String(t.S).padStart(3)}S  WR ${pct(t.W, t.L)}`)

// ── 5. day-type accuracy pre/post v9 ────────────────────────────────────
console.log(`\n══ 5. DAY-TYPE FORECAST (v9 shipped ${V9_DATE}) ══`)
const dt = { pre: { hit: 0, miss: 0, ind: 0 }, post: { hit: 0, miss: 0, ind: 0 } }
for (const r of R) {
  if (!r.day_type_actual) continue
  const b = r.recap_date < V9_DATE ? dt.pre : dt.post
  if (!r.day_type_predicted || r.day_type_predicted === 'INDETERMINATE') b.ind++
  else if (r.day_type_predicted === r.day_type_actual) b.hit++
  else b.miss++
}
for (const [k, b] of Object.entries(dt)) console.log(`  ${k.padEnd(5)} committed: ${b.hit + b.miss} (${b.hit} right, ${b.miss} wrong → ${pct(b.hit, b.miss)})  INDETERMINATE: ${b.ind}`)
console.log(`  day_type_signal_log rows (vote tracking live?): ${DT.length}${DT.length ? ', latest ' + DT[DT.length - 1].log_date : ' — MIGRATION NOT RUN or never locked'}`)

// ── 6. learning-loop freshness ──────────────────────────────────────────
console.log(`\n══ 6. LEARNING-LOOP FRESHNESS ══`)
const freshness = []
freshness.push(['discovered rules', (rules || [])[0]?.updated_at || null, Array.isArray((rules || [])[0]?.rules) ? `${(rules || [])[0].rules.length} rules` : ''])
freshness.push(['last daily recap', R.length ? R[R.length - 1].recap_date : null, ''])
freshness.push(['last shadow grade', S.filter(s => s.status?.startsWith('graded')).slice(-1)[0]?.created_at || null, ''])
freshness.push(['last graded alert', A.filter(a => a.outcome && a.outcome !== 'PENDING').slice(-1)[0]?.logged_at || null, ''])
for (const t of ['user_edge_weights', 'edge_weights', 'stream_weights']) {
  const { data, error } = await sb.from(t).select('updated_at').order('updated_at', { ascending: false }).limit(1)
  if (!error && data?.length) freshness.push([`${t}`, data[0].updated_at, ''])
}
for (const [name, ts, extra] of freshness) {
  const age = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 86400000) : null
  console.log(`  ${name.padEnd(18)} ${ts ? ts.slice(0, 10) + ` (${age}d ago)` : 'NEVER / not found'} ${extra}`)
}

console.log(`\n══ VERDICT INPUTS ══`)
console.log(`Silent-day ratio: ${silent.length}/${shadowDays.size} cockpit-alive days produced no primary signals.`)
console.log(`Setup arm decided sample: n=${(arms.setup?.W || 0) + (arms.setup?.L || 0)} — below ~30, treat hit rates as provisional.`)
console.log(`Read section 4 top-to-bottom: rising WR = shadow learning transfers; flat ≈ baseline = GEX context not adding edge yet.`)
