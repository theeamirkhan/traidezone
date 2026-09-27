/**
 * day_detail.mjs — READ-ONLY. What actually happened today, row by row:
 * which fires TRADED vs which the gate held at observation-only, what each
 * would-have/did do, and what the day-type forecaster's raw inputs were.
 *
 * Run from repo root any evening:  node day_detail.mjs
 * Or for another date:             node day_detail.mjs 2026-09-24
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

const day = process.argv[2] || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const startUTC = new Date(`${day}T04:00:00Z`).toISOString()          // ~midnight ET
const endUTC   = new Date(new Date(`${day}T04:00:00Z`).getTime() + 86400000).toISOString()

const { data } = await sb.from('trade_alerts')
  .select('logged_at,signal,confidence,outcome,outcome_note,pts_to_t1,context_snapshot')
  .gte('logged_at', startUTC).lt('logged_at', endUTC).order('logged_at')

const rows = (data || []).map(a => {
  let ctx = {}
  try { ctx = JSON.parse(a.context_snapshot || '{}') } catch { if (a.context_snapshot && typeof a.context_snapshot === 'object') ctx = a.context_snapshot }
  return { ...a, ctx }
})
const isW = o => o === 'HIT_T1' || o === 'HIT_T2', isL = o => o === 'STOPPED_OUT'
const t = ts => new Date(ts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })

console.log(`\n══ ${day} — FIRE-BY-FIRE (mode: TRADED vs GATE-HELD observation) ══`)
const tally = { traded: { W: 0, L: 0, S: 0, P: 0, pts: 0 }, held: { W: 0, L: 0, S: 0, P: 0, pts: 0 } }
for (const a of rows) {
  const eng = a.ctx.engine || 'llm'
  if (eng === 'swing') continue
  const sup = !!a.ctx.suppressed
  const mode = sup ? `HELD(${a.ctx.suppressReason || '?'})` : eng === 'setup' ? 'TRADED' : eng.toUpperCase()
  const name = a.ctx.setupName || (eng === 'llm' ? 'AI signal' : '')
  const oc = a.outcome === 'PENDING' ? '○ pending' : isW(a.outcome) ? `✓ ${a.outcome}` : isL(a.outcome) ? `✗ stopped` : `◐ ${a.outcome}`
  console.log(`  ${t(a.logged_at).padStart(8)}  ${(a.signal || '?').padEnd(5)} ${mode.padEnd(16)} ${String(name).padEnd(26)} conf ${String(a.confidence ?? '—').padStart(3)}  ${oc}  ${a.outcome_note || ''}`)

  if (eng !== 'setup' || a.signal === 'WAIT') continue
  const b = sup ? tally.held : tally.traded
  const st = a.ctx.targetStructure || { t1: 9, stop: 7 }
  if (a.outcome === 'PENDING') b.P++
  else if (isW(a.outcome)) { b.W++; b.pts += Math.abs(parseFloat(a.pts_to_t1)) || st.t1 }
  else if (isL(a.outcome)) {
    b.L++
    const m = String(a.outcome_note || '').match(/([\d.]+)\s*pts?\s+through stop/)
    b.pts -= st.stop + (m ? parseFloat(m[1]) : 0)
  } else b.S++
}
console.log(`\n  TRADED (setup arm): ${tally.traded.W}W-${tally.traded.L}L-${tally.traded.S}S (${tally.traded.P} pending)  net ${tally.traded.pts >= 0 ? '+' : ''}${tally.traded.pts.toFixed(1)} pts`)
console.log(`  GATE-HELD:          ${tally.held.W}W-${tally.held.L}L-${tally.held.S}S (${tally.held.P} pending)  counterfactual ${tally.held.pts >= 0 ? '+' : ''}${tally.held.pts.toFixed(1)} pts (positive = gate COST us, negative = gate SAVED us)`)

console.log(`\n══ DAY-TYPE RAW INPUTS (last 3 locked forecasts) ══`)
const { data: dt } = await sb.from('day_type_signal_log')
  .select('log_date,day_type,trend_prob,range_prob,signals').order('log_date', { ascending: false }).limit(3)
for (const r of (dt || []).reverse()) {
  const inp = (Array.isArray(r.signals) ? r.signals : []).find(x => x.name === '_inputs')
  console.log(`  ${r.log_date}  ${r.day_type} T${r.trend_prob}/R${r.range_prob}`)
  console.log(`    inputs: ${inp ? inp.detail : '(no _inputs entry — pre-v12 row)'}`)
}
