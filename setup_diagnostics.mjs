/**
 * setup_diagnostics.mjs — READ-ONLY deep-dive on the setup engine's fires.
 * Run from repo root after the backfill:  node setup_diagnostics.mjs
 *
 *  A. level_rejection autopsy: hit rate BY LEVEL TYPE (wall vs PDH vs round
 *     number vs MA) — is the setup broken, or just some of its levels?
 *  B. Every setup split by gamma regime — does the short-side edge survive
 *     outside a falling tape?
 *  C. Target-structure backtest: replays every graded directional setup fire
 *     against alternative T1/stop structures on real 5m bars and prints
 *     expectancy per structure — is +7/−8 actually the right shape?
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
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY, PG = env.POLYGON_API_KEY
if (!URL || !KEY || !PG) { console.error('Missing env — npx vercel env pull .env.local'); process.exit(1) }
const sb = createClient(URL, KEY)

const since = new Date(Date.now() - 60 * 86400000).toISOString()
const { data } = await sb.from('trade_alerts').select('*').gte('logged_at', since).order('logged_at')
const fires = (data || []).filter(a => {
  try { return JSON.parse(a.context_snapshot || '{}').engine === 'setup' } catch { return false }
}).map(a => ({ ...a, ctx: JSON.parse(a.context_snapshot) }))
const graded = fires.filter(a => a.outcome && a.outcome !== 'PENDING')
const isW = o => o === 'HIT_T1' || o === 'HIT_T2', isL = o => o === 'STOPPED_OUT'
const pct = (w, l) => (w + l) ? Math.round(w / (w + l) * 100) + '%' : '—'
console.log(`${fires.length} setup fires, ${graded.length} graded (last 60d)\n`)

// ── A. level_rejection by level type ────────────────────────────────────
console.log('══ A. LEVEL_REJECTION BY LEVEL TYPE ══')
const byLevel = {}
for (const a of graded.filter(a => a.ctx.setupId === 'level_rejection')) {
  const raw = String(a.ctx.levelLabel ?? '?')
  const label = /^\d+$/.test(raw) ? `round-${raw.endsWith('00') ? '100s' : raw.endsWith('50') ? '50s' : '25s'}` : raw
  byLevel[label] = byLevel[label] || { W: 0, L: 0, S: 0 }
  if (isW(a.outcome)) byLevel[label].W++; else if (isL(a.outcome)) byLevel[label].L++; else byLevel[label].S++
}
for (const [k, t] of Object.entries(byLevel).sort((a, b) => (b[1].W + b[1].L) - (a[1].W + a[1].L)))
  console.log(`  ${k.padEnd(14)} ${t.W}W-${t.L}L-${t.S}S  ${pct(t.W, t.L)}`)
if (!Object.keys(byLevel).length) console.log('  (no graded level_rejection fires)')

// ── B. per-setup by gamma regime ────────────────────────────────────────
console.log('\n══ B. SETUP × GAMMA REGIME ══')
const byReg = {}
for (const a of graded) {
  const k = `${a.ctx.setupId || '?'} | ${a.ctx.gexRegime || 'unknown'}`
  byReg[k] = byReg[k] || { W: 0, L: 0, S: 0 }
  if (isW(a.outcome)) byReg[k].W++; else if (isL(a.outcome)) byReg[k].L++; else byReg[k].S++
}
for (const [k, t] of Object.entries(byReg).sort())
  console.log(`  ${k.padEnd(34)} ${t.W}W-${t.L}L-${t.S}S  ${pct(t.W, t.L)}`)

// ── C. target-structure backtest ────────────────────────────────────────
console.log('\n══ C. TARGET STRUCTURE BACKTEST (replayed on real 5m bars) ══')
const STRUCTS = [
  { t1: 7, stop: 8 }, { t1: 6, stop: 9 }, { t1: 8, stop: 6 },
  { t1: 9, stop: 7 }, { t1: 10, stop: 8 }, { t1: 12, stop: 8 },
]
const dirFires = graded.filter(a => (a.signal === 'LONG' || a.signal === 'SHORT') && a.entry_mid)
const days = [...new Set(dirFires.map(a => new Date(a.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })))]
const barsByDay = {}
for (const d of days) {
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${d}/${d}?adjusted=true&sort=asc&limit=500&apiKey=${PG}`).then(r => r.json())
  barsByDay[d] = r.results || []
  await new Promise(r => setTimeout(r, 150))
}
console.log(`Replaying ${dirFires.length} fires across ${days.length} days:`)
console.log('  T1/STOP    W    L   flat  WR    expectancy pts/trade')
for (const st of STRUCTS) {
  let W = 0, L = 0, F = 0, pts = 0
  for (const a of dirFires) {
    const d = new Date(a.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const t0 = new Date(a.logged_at).getTime()
    const entry = parseFloat(a.entry_mid)
    const long = a.signal === 'LONG'
    const t1 = long ? entry + st.t1 : entry - st.t1
    const stop = long ? entry - st.stop : entry + st.stop
    const path = (barsByDay[d] || []).filter(b => b.t >= t0 && b.t <= t0 + 120 * 60000)
    let done = false
    for (const b of path) {
      const stopped = long ? b.l <= stop : b.h >= stop
      const hit = long ? b.h >= t1 : b.l <= t1
      if (stopped) { L++; pts -= st.stop; done = true; break }   // strict: stop first in-bar
      if (hit) { W++; pts += st.t1; done = true; break }
    }
    if (!done && path.length) { F++; const end = path[path.length - 1].c; pts += long ? end - entry : entry - end }
  }
  const n = W + L
  console.log(`  +${st.t1}/−${st.stop}`.padEnd(11) + `${String(W).padStart(3)} ${String(L).padStart(4)} ${String(F).padStart(5)}  ${pct(W, L).padStart(4)}   ${(pts / Math.max(1, W + L + F)).toFixed(2)}`)
}
console.log('\nNote: strict stop-before-target within each bar (conservative); flat = neither hit in 120min, credited at 120min drift.')
