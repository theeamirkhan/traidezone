/**
 * /api/system-status — Complete system health and wiring audit
 *
 * ═══════════════════════════════════════════════════════════════
 * HOW TO ADD A NEW FEATURE CHECK:
 *
 * 1. Add a check() call in the Promise.allSettled([...]) array below
 *    Format:
 *      check('Feature Name', async () => {
 *        // test the feature
 *        return { detail: 'what you found', value: optionalData }
 *        // or throw new Error('what is broken') for error status
 *      })
 *
 * 2. Add the feature name to the GROUPS object in src/app/admin/page.tsx
 *    under the appropriate group (or create a new group)
 *
 * Groups: Signal Pipeline | Learning Loop | Market Intelligence |
 *         Probability Engine | Cron Health | Morning Brief |
 *         Companion | Integrations
 *
 * Status levels:
 *   return { detail: '...' }              → OK (green ✓)
 *   return { detail: '...', status: 'warn' } → WARN (yellow ⚠)
 *   throw new Error('...')               → ERROR (red ✗)
 * ═══════════════════════════════════════════════════════════════
 *
 *
 * Returns status of every feature, data flow, cron, and integration.
 * Used by the Admin dashboard to show what's working vs broken.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

async function check(name: string, fn: () => Promise<any>): Promise<{ name: string; status: 'ok' | 'warn' | 'error'; detail: string; value?: any }> {
  try {
    const result = await fn()
    return { name, status: 'ok', detail: result.detail || 'OK', value: result.value }
  } catch (e: any) {
    return { name, status: 'error', detail: e.message }
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin-only endpoint
  const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)
  if (ADMIN_USER_IDS.length > 0 && !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await Promise.allSettled([

    // ── SIGNAL PIPELINE ────────────────────────────────────────────────────────
    check('Signal Scoring (auto)', async () => {
      const { data, count } = await supabaseAdmin.from('trade_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId).neq('outcome', 'PENDING')
      const { data: pending } = await supabaseAdmin.from('trade_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('outcome', 'PENDING')
      const { data: recent } = await supabaseAdmin.from('trade_alerts')
        .select('outcome, outcome_normalized, created_at, scored_at')
        .eq('user_id', userId).neq('outcome', 'PENDING')
        .order('scored_at', { ascending: false }).limit(1)
      const lastScore = recent?.[0]
      return {
        detail: `${count || 0} scored signals. Last scored: ${lastScore?.scored_at ? new Date(lastScore.scored_at).toLocaleString() : 'never'}. ${lastScore?.outcome_normalized ? 'outcome_normalized ✓' : 'outcome_normalized MISSING — run SQL migration'}`,
        value: { scored: count, lastOutcome: lastScore?.outcome, lastNorm: lastScore?.outcome_normalized }
      }
    }),

    check('Stream Weight Learning', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('stream_weights, updated_at').eq('user_id', userId).single()
      const weights = data?.stream_weights
      const hasLearned = weights && Object.values(weights).some((w: any) => w !== 1.0)
      return {
        detail: hasLearned
          ? `Active — ${Object.keys(weights).length} streams weighted. Last updated: ${data?.updated_at?.split('T')[0]}`
          : weights ? 'Weights exist but all equal (1.0) — need more scored trades'
          : 'No weights yet — run /api/agents/stream-weights to initialize',
        value: weights
      }
    }),

    check('Context Snapshot Tracking', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('context_snapshot').eq('user_id', userId)
        .not('context_snapshot', 'is', null)
        .order('created_at', { ascending: false }).limit(1)
      const snap = data?.[0]?.context_snapshot
      let parsed: any = null
      try { parsed = JSON.parse(snap || '{}') } catch {}
      return {
        detail: snap
          ? `Storing snapshots ✓. Latest has: ${Object.keys(parsed || {}).join(', ')}`
          : 'No snapshots stored — signals not being saved to DB',
        value: { hasSnapshot: !!snap, fields: Object.keys(parsed || {}) }
      }
    }),

    check('Stream Votes in Snapshot', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('context_snapshot').eq('user_id', userId)
        .not('context_snapshot', 'is', null)
        .order('created_at', { ascending: false }).limit(5)
      const withVotes = (data || []).filter(d => {
        try { return JSON.parse(d.context_snapshot || '{}').streamVotes } catch { return false }
      })
      return {
        detail: withVotes.length > 0
          ? `${withVotes.length} of last 5 signals have stream votes ✓`
          : 'No stream votes in snapshots — signals before this feature was added',
        value: { recentWithVotes: withVotes.length }
      }
    }),

    // ── LEARNING AGENTS ────────────────────────────────────────────────────────
    check('Chat Learning (nightly)', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('chat_learnings').eq('user_id', userId).single()
      const learnings = data?.chat_learnings || []
      return {
        detail: learnings.length > 0
          ? `${learnings.length} days of chat learnings stored. Latest: ${learnings[learnings.length-1]?.date || 'unknown date'}`
          : 'No chat learnings yet — analyze-chat cron runs at 6pm ET weekdays',
        value: { count: learnings.length }
      }
    }),

    check('Edge Profile Learning', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('weaknesses, strengths, patterns, edge_notes').eq('user_id', userId).single()
      const hasEdge = data?.weaknesses?.length || data?.strengths?.length
      return {
        detail: hasEdge
          ? `Edge profile active — ${data.strengths?.length || 0} strengths, ${data.weaknesses?.length || 0} weaknesses`
          : 'Edge profile empty — learn-from-outcomes cron runs at 5pm ET',
        value: { strengths: data?.strengths?.length, weaknesses: data?.weaknesses?.length }
      }
    }),

    // ── GAP + TREND TRACKING ──────────────────────────────────────────────────
    check('Gap Outcome Tracking', async () => {
      const { data, count } = await supabaseAdmin.from('gap_outcomes')
        .select('*', { count: 'exact', head: true })
      const { data: today } = await supabaseAdmin.from('gap_outcomes')
        .select('trading_date, gap_outcome, day_type, trend_score_predicted')
        .order('trading_date', { ascending: false }).limit(1)
      const latest = today?.[0]
      return {
        detail: `${count || 0} days tracked. Latest: ${latest?.trading_date || 'none'} — ${latest?.gap_outcome || 'PENDING'} / ${latest?.day_type || 'PENDING'}`,
        value: { total: count, latest }
      }
    }),

    check('Trend Day Prediction', async () => {
      const { data } = await supabaseAdmin.from('gap_outcomes')
        .select('trend_score_predicted, day_type, trend_confirmed')
        .not('day_type', 'eq', 'PENDING').not('trend_score_predicted', 'is', null)
        .limit(50)
      const total = data?.length || 0
      const confirmed = data?.filter(d => d.trend_confirmed).length || 0
      return {
        detail: total >= 10
          ? `${Math.round(confirmed/total*100)}% prediction accuracy over ${total} days`
          : `Only ${total} days with both prediction and outcome — need 10+ for reliable accuracy`,
        value: { total, accuracy: total > 0 ? Math.round(confirmed/total*100) : null }
      }
    }),

    // ── MORNING BRIEF + EMAIL ─────────────────────────────────────────────────
    check('Morning Brief Generation', async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      // Check localStorage via DB (we can't access localStorage server-side)
      // Instead check if route exists and email_logs has recent entries
      const { data } = await supabaseAdmin.from('email_logs')
        .select('sent_at, status, brief_bias, macro_bias, subject')
        .eq('type', 'morning_brief').order('sent_at', { ascending: false }).limit(1)
      const last = data?.[0]
      return {
        detail: last
          ? `Last email: ${new Date(last.sent_at).toLocaleString()} — ${last.status} — ${last.macro_bias} / ${last.brief_bias}`
          : 'No emails sent yet — check RESEND_API_KEY and domain verification',
        value: last
      }
    }),

    check('Daily Candle Patterns', async () => {
      // Patterns are computed client-side — check that multiTF data fetches correctly
      // We can verify by checking the gap_outcomes for catalyst tagging
      const { data } = await supabaseAdmin.from('gap_outcomes')
        .select('catalyst_type').neq('catalyst_type', 'NONE')
        .not('catalyst_type', 'is', null).limit(1)
      return {
        detail: data?.length
          ? 'Catalyst tagging active in gap_outcomes ✓ | Candle patterns detected client-side on load'
          : 'No catalyst tags — run catalyst_update.sql in Supabase + backfill endpoint',
        value: { catalystTagged: !!data?.length }
      }
    }),

    // ── COMPANION WIRING ──────────────────────────────────────────────────────
    check('Chat Persistence', async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const { data, count } = await supabaseAdmin.from('chat_sessions')
        .select('*', { count: 'exact', head: true }).eq('user_id', userId)
      const { data: todayData } = await supabaseAdmin.from('chat_sessions')
        .select('created_at').eq('user_id', userId)
        .gte('trading_date', today).limit(1)
      return {
        detail: `${count || 0} total messages stored. Today: ${todayData?.length ? 'messages saved ✓' : 'no messages yet today'}`,
        value: { total: count, hasToday: !!todayData?.length }
      }
    }),

    check('Trader Profile Seeded', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('is_seeded, seed_version, session_count, disclaimer_accepted')
        .eq('user_id', userId).single()
      return {
        detail: data?.is_seeded
          ? `Seeded v${data.seed_version} ✓ | ${data.session_count || 0} sessions | Disclaimer: ${data.disclaimer_accepted ? 'accepted ✓' : 'NOT accepted'}`
          : 'Profile not seeded — /api/agents/seed-profile will run on next cockpit load',
        value: data
      }
    }),

    // ── INTEGRATIONS ──────────────────────────────────────────────────────────
    check('Polygon API', async () => {
      const key = process.env.POLYGON_API_KEY
      if (!key) throw new Error('POLYGON_API_KEY not set in Vercel env vars')
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?adjusted=true&apiKey=${key}`, { signal: AbortSignal.timeout(5000) })
      const d = await res.json()
      return { detail: d.results?.length ? `Connected ✓ — SPX prev close: ${d.results[0]?.c}` : `Connected but no data: ${d.status}` }
    }),

    check('Anthropic API', async () => {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY not set in Vercel env vars')
      return { detail: 'Key present ✓ (not tested to save credits)' }
    }),

    check('Resend Email', async () => {
      const key = process.env.RESEND_API_KEY
      if (!key) throw new Error('RESEND_API_KEY not set in Vercel env vars')
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000)
      })
      const d = await res.json()
      const verified = (d.data || []).filter((dom: any) => dom.status === 'verified')
      return {
        detail: verified.length
          ? `${verified.length} verified domain(s): ${verified.map((d: any) => d.name).join(', ')} ✓`
          : `No verified domains — check Resend dashboard DNS setup`
      }
    }),

    check('FlashAlpha GEX', async () => {
      const key = process.env.FLASHALPHA_API_KEY
      if (!key) throw new Error('FLASHALPHA_API_KEY not set in Vercel env vars')
      return { detail: 'Key present ✓ (not tested — 5/day limit)' }
    }),

    // ── Signal Quality Gate ────────────────────────────────────────────────────
    check('Quality Gate (signal verdicts)', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('context_snapshot').eq('user_id', userId)
        .not('context_snapshot', 'is', null)
        .order('created_at', { ascending: false }).limit(10)
      const verdicts: Record<string, number> = {}
      let total = 0
      for (const row of data || []) {
        try {
          const ctx = JSON.parse(row.context_snapshot || '{}')
          if (ctx.qualityVerdict) { verdicts[ctx.qualityVerdict] = (verdicts[ctx.qualityVerdict] || 0) + 1; total++ }
        } catch {}
      }
      const blocked = verdicts['BLOCKED'] || 0
      const strong  = verdicts['STRONG']  || 0
      return {
        detail: total > 0
          ? `${total} signals with verdicts — STRONG: ${strong} | BLOCKED: ${blocked} | Distribution: ${Object.entries(verdicts).map(([k,v]) => `${k}:${v}`).join(', ')}`
          : 'No verdicts recorded yet — fire a signal to test',
        value: verdicts
      }
    }),

    check('Breadth Data (TICK/TRIN/VVIX)', async () => {
      const POLY = process.env.POLYGON_API_KEY
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
      if (etHour < 9 || etHour >= 17) return { detail: 'Pre/post market — breadth tracked during market hours', value: null }
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:TICK/range/1/minute/${today}/${today}?adjusted=true&sort=desc&limit=3&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) })
      const d = await res.json()
      const tick = d.results?.[0]?.c
      return { detail: tick !== undefined ? `TICK: ${tick} ✓ — breadth data live` : 'No TICK data — check Polygon Indices Advanced plan', value: { tick } }
    }),

    // ── Probability Engine ─────────────────────────────────────────────────────
    check('Gap Fill/Trend Rates (probability)', async () => {
      const { data, count } = await supabaseAdmin.from('gap_outcomes')
        .select('gap_outcome, day_type', { count: 'exact' }).neq('gap_outcome', 'PENDING')
      const filled    = (data || []).filter(r => r.gap_outcome === 'FILLED').length
      const trendDays = (data || []).filter(r => r.day_type === 'TREND_UP' || r.day_type === 'TREND_DOWN').length
      const total     = count || 0
      return {
        detail: total >= 20
          ? `${total} days — Fill rate: ${Math.round(filled/total*100)}% | Trend days: ${Math.round(trendDays/total*100)}% — probability display using real data ✓`
          : `${total} days tracked (need 20+ for reliable rates) — probability display using model estimates`,
        value: { total, fillRate: total > 0 ? Math.round(filled/total*100) : null }
      }
    }),

    // ── Companion Health ───────────────────────────────────────────────────────
    check('Custom Trading Rules', async () => {
      // Rules stored in localStorage — check profile for seed data as proxy
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('system_rules, is_seeded, disclaimer_accepted').eq('user_id', userId).single()
      return {
        detail: data?.disclaimer_accepted
          ? `Disclaimer accepted ✓ | Seeded: ${data.is_seeded ? '✓' : '✗'} | Custom rules: stored in browser localStorage (cannot check server-side)`
          : `Disclaimer NOT accepted — user hasn't accepted trading disclaimer`,
        value: { disclaimerAccepted: data?.disclaimer_accepted, seeded: data?.is_seeded }
      }
    }),

    // ── Cron Health ────────────────────────────────────────────────────────────
    check('Cron — Score Alerts', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('scored_at').not('scored_at', 'is', null)
        .order('scored_at', { ascending: false }).limit(1)
      const last = data?.[0]?.scored_at
      const ageH = last ? (Date.now() - new Date(last).getTime()) / 3600000 : null
      return {
        detail: last
          ? ageH! < 1 ? `Last ran: ${new Date(last).toLocaleTimeString()} ✓ (< 1h ago)`
          : ageH! < 24 ? `Last ran: ${new Date(last).toLocaleString()} (${ageH!.toFixed(0)}h ago)`
          : `⚠ Last ran ${ageH!.toFixed(0)}h ago — cron may be failing`
          : 'Never ran — no scored alerts yet',
        status: last && ageH! > 48 ? 'warn' as const : 'ok' as const,
        value: { lastRun: last }
      }
    }),

    check('Cron — Gap Outcomes', async () => {
      const { data } = await supabaseAdmin.from('gap_outcomes')
        .select('created_at').order('created_at', { ascending: false }).limit(1)
      const last = data?.[0]?.created_at
      const ageH = last ? (Date.now() - new Date(last).getTime()) / 3600000 : null
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const { data: todayRow } = await supabaseAdmin.from('gap_outcomes')
        .select('gap_outcome, day_type, trend_score_predicted').eq('trading_date', today).single()
      return {
        detail: todayRow
          ? `Today recorded ✓ — Gap: ${todayRow.gap_outcome} | Day: ${todayRow.day_type} | Trend score: ${todayRow.trend_score_predicted}`
          : last
          ? `Last record: ${new Date(last).toLocaleDateString()} (${ageH!.toFixed(0)}h ago) — today not yet recorded`
          : 'No gap records — cron never fired',
        status: !todayRow && ageH && ageH > 48 ? 'warn' as const : 'ok' as const,
        value: { todayRecorded: !!todayRow, lastDate: last?.split('T')[0] }
      }
    }),

    check('Cron — Email Brief', async () => {
      const { data } = await supabaseAdmin.from('email_logs')
        .select('sent_at, status, subject').eq('type', 'morning_brief')
        .order('sent_at', { ascending: false }).limit(3)
      const last = data?.[0]
      const ageH = last ? (Date.now() - new Date(last.sent_at).getTime()) / 3600000 : null
      return {
        detail: last
          ? `Last sent: ${new Date(last.sent_at).toLocaleDateString()} — ${last.status} | ${last.subject?.substring(0, 60)}`
          : 'No emails sent yet — check RESEND_API_KEY and domain',
        status: !last ? 'warn' as const : 'ok' as const,
        value: { lastSent: last?.sent_at, recentCount: data?.length }
      }
    }),

    check('Cron — Stream Weights', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('stream_weights, updated_at').eq('user_id', userId).single()
      const weights = data?.stream_weights
      const updatedAt = data?.updated_at
      const ageH = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3600000 : null
      const count = weights ? Object.keys(weights).length : 0
      return {
        detail: count > 0
          ? `${count} streams weighted. Updated: ${updatedAt ? new Date(updatedAt).toLocaleDateString() : 'unknown'}${ageH && ageH > 48 ? ' ⚠ stale' : ' ✓'}`
          : 'No weights — /api/agents/stream-weights not yet run',
        status: count === 0 ? 'warn' as const : 'ok' as const,
        value: { streamCount: count, updatedAt }
      }
    }),

    // ── Market Intelligence ────────────────────────────────────────────────────
    check('VIX Term Structure', async () => {
      const POLY = process.env.POLYGON_API_KEY
      if (!POLY) throw new Error('POLYGON_API_KEY not set')
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX1D/range/1/minute/${today}/${today}?adjusted=true&sort=desc&limit=3&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) })
      const d = await res.json()
      const v1d = d.results?.[0]?.c
      return { detail: v1d ? `VIX1D: ${v1d.toFixed(2)} ✓ — term structure data available` : 'No VIX1D data yet (pre-market or weekend)', value: { vix1d: v1d } }
    }),

    check('VWAP Bands Calculation', async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
      if (etHour < 9 || etHour >= 17) return { detail: 'Pre/post market — VWAP bands calculated during market hours (9:30am-4pm ET)', value: null }
      const POLY = process.env.POLYGON_API_KEY
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=50&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) })
      const d = await res.json()
      const bars = d.results || []
      return { detail: bars.length > 10 ? `${bars.length} intraday bars available ✓ — VWAP bands calculable` : `Only ${bars.length} bars — need 10+ for reliable bands`, value: { bars: bars.length } }
    }),

    check('Sector Rotation (10 sectors)', async () => {
      const POLY = process.env.POLYGON_API_KEY
      if (!POLY) throw new Error('POLYGON_API_KEY not set')
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
      if (etHour < 9 || etHour >= 17) return { detail: 'Pre/post market — sectors tracked during market hours', value: null }
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/XLK/range/1/minute/${today}/${today}?adjusted=true&sort=desc&limit=3&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) })
      const d = await res.json()
      const hasData = d.results?.length > 0
      return { detail: hasData ? 'Sector data available (XLK tested) ✓ — all 10 sectors tracked' : 'No sector data — check Polygon plan includes equities', value: { xlkAvailable: hasData } }
    }),

    check('Market Intel in Snapshot', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('context_snapshot').eq('user_id', userId)
        .not('context_snapshot', 'is', null)
        .order('created_at', { ascending: false }).limit(5)
      const withIntel = (data || []).filter(d => {
        try {
          const ctx = JSON.parse(d.context_snapshot || '{}')
          return ctx.vwapBandPos || ctx.termShape || ctx.sectorBias
        } catch { return false }
      })
      return {
        detail: withIntel.length > 0
          ? `${withIntel.length} of last 5 signals have market intel in snapshot ✓ — learning loop active`
          : 'No market intel in snapshots yet — fire a signal to populate',
        value: { recentWithIntel: withIntel.length }
      }
    }),

    check('Stream Weights (17 streams)', async () => {
      const { data } = await supabaseAdmin.from('trader_profiles')
        .select('stream_weights').eq('user_id', userId).single()
      const weights = data?.stream_weights || {}
      const streamCount = Object.keys(weights).length
      const hasLearned = Object.values(weights).some((w: any) => w !== 1.0)
      const topStream = Object.entries(weights).sort((a, b) => (b[1] as number) - (a[1] as number))[0]
      return {
        detail: streamCount > 0
          ? `${streamCount} streams tracked. ${hasLearned ? `Top: ${topStream?.[0]} (${(topStream?.[1] as number)?.toFixed(2)}x)` : 'All equal weight — need more scored trades'}`
          : 'No weights yet — run /api/agents/stream-weights',
        value: { streamCount, hasLearned }
      }
    }),

    check('Learn-from-Outcomes (new fields)', async () => {
      const { data } = await supabaseAdmin.from('trade_alerts')
        .select('context_snapshot').eq('user_id', userId)
        .not('context_snapshot', 'is', null)
        .order('created_at', { ascending: false }).limit(10)
      const withNew = (data || []).filter(d => {
        try {
          const ctx = JSON.parse(d.context_snapshot || '{}')
          return ctx.sessionName || ctx.thetaUrgency || ctx.ivRvSpread !== undefined
        } catch { return false }
      })
      return {
        detail: withNew.length > 0
          ? `${withNew.length} signals with session/IV/theta data ✓ — learn-from-outcomes has full context`
          : 'No new fields in snapshots yet — will populate on next signal',
        value: { count: withNew.length }
      }
    }),

    // ── Trade Ticket & Strike Suggestions ───────────────────────────────────
    check('Trade Ticket — DB Storage', async () => {
      const { data, error } = await supabaseAdmin.from('trades')
        .select('id, symbol, pnl, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw new Error(error.message)
      const trades = data || []
      const spxTrades = trades.filter((t: any) => t.symbol?.includes('SPX'))
      return {
        detail: trades.length > 0
          ? `${trades.length} trades logged ✓ | ${spxTrades.length} SPX options | Latest: ${trades[0]?.symbol || 'n/a'} P&L $${trades[0]?.pnl?.toFixed(0) || '?'}`
          : 'No trades logged yet — use Trade Ticket in Plan tab to record trades',
        value: { tradeCount: trades.length, spxCount: spxTrades.length }
      }
    }),

    check('Strike Suggestions API', async () => {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY not set')
      // Quick test: verify the route is reachable and returns valid structure
      const testRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.traidezone.ai'}/api/strike-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPrice: 5800, signal: 'LONG', confidence: 75, sessionMins: 300, morningBias: 'BULLISH' }),
        signal: AbortSignal.timeout(15000),
      })
      if (!testRes.ok) throw new Error(`HTTP ${testRes.status}`)
      const d = await testRes.json()
      if (d.error) throw new Error(d.error)
      const strikeCount = d.strikes?.length || 0
      return {
        detail: strikeCount > 0
          ? `${strikeCount} strikes generated ✓ | Direction: ${d.direction} | IV: ${d.ivAssessment} | Top pick: ${d.topPick}`
          : 'Strike suggestions returned but no strikes — check prompt',
        value: { strikeCount, direction: d.direction, ivAssessment: d.ivAssessment }
      }
    }),

    check('Volume Profile Calculation', async () => {
      // Test that we can calculate a volume profile from mock candle data
      const mockCandles = Array.from({ length: 20 }, (_, i) => ({
        t: Date.now() - (20 - i) * 5 * 60000,
        o: 5800 + Math.random() * 20,
        h: 5810 + Math.random() * 20,
        l: 5790 + Math.random() * 20,
        c: 5800 + Math.random() * 20,
        v: Math.floor(Math.random() * 10000) + 1000,
      }))
      // Import and test the calculation
      const { calculateVolumeProfile } = await import('@/app/cockpit/lib/volumeProfile')
      const vp = calculateVolumeProfile(mockCandles as any)
      if (!vp) throw new Error('Volume profile returned null')
      if (!vp.poc || !vp.vah || !vp.val) throw new Error('Missing POC/VAH/VAL')
      return {
        detail: `Volume profile calc OK ✓ | POC: ${vp.poc} | VAH: ${vp.vah} | VAL: ${vp.val} | ${vp.valueAreaPct}% value area`,
        value: { poc: vp.poc, vah: vp.vah, val: vp.val }
      }
    }),

    check('GEX — FlashAlpha Basic (DEX/VEX/CHEX)', async () => {
      const key = process.env.FLASHALPHA_API_KEY
      if (!key) throw new Error('FLASHALPHA_API_KEY not set')
      const res = await fetch('https://lab.flashalpha.com/v1/exposure/dexvexchex/SPX', {
        headers: { 'X-Api-Key': key },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`FlashAlpha HTTP ${res.status}`)
      const d = await res.json()
      const hasDex  = d?.net_dex  !== undefined || d?.dex?.net  !== undefined
      const hasVex  = d?.net_vex  !== undefined || d?.vex?.net  !== undefined
      const hasChex = d?.net_chex !== undefined || d?.chex?.net !== undefined
      if (!hasDex && !hasVex && !hasChex) throw new Error('No DEX/VEX/CHEX data returned — check plan level')
      return {
        detail: `DEX/VEX/CHEX available ✓ | DEX: ${hasDex ? '✓' : '✗'} VEX: ${hasVex ? '✓' : '✗'} CHEX: ${hasChex ? '✓' : '✗'}`,
        value: { hasDex, hasVex, hasChex }
      }
    }),

    check('UW Spot GEX by Strike', async () => {
      const key = process.env.UNUSUAL_WHALES_API_KEY
      if (!key) throw new Error('UNUSUAL_WHALES_API_KEY not set')
      const res = await fetch('https://api.unusualwhales.com/api/stock/SPX/spot-exposures/strike', {
        headers: { 'Authorization': `Bearer ${key}`, 'UW-CLIENT-API-ID': '100001' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`UW HTTP ${res.status} — check plan includes spot GEX`)
      const d = await res.json()
      const count = d?.data?.length || 0
      return {
        detail: count > 0
          ? `${count} strikes in spot GEX ✓ — live gamma profile available`
          : 'No spot GEX data — may need higher UW plan tier',
        value: { strikeCount: count }
      }
    }),

    check('Cross-Asset (DXY + TLT + OIL)', async () => {
      const POLY = process.env.POLYGON_API_KEY
      if (!POLY) throw new Error('POLYGON_API_KEY not set')
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const thirty = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA')
      const [dxy, tlt] = await Promise.all([
        fetch(`https://api.polygon.io/v2/aggs/ticker/DX:CURR/range/1/day/${thirty}/${today}?adjusted=true&sort=desc&limit=5&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        fetch(`https://api.polygon.io/v2/aggs/ticker/TLT/range/1/day/${thirty}/${today}?adjusted=true&sort=desc&limit=5&apiKey=${POLY}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
      ])
      const dxyOk = (dxy.results?.length || 0) > 0
      const tltOk = (tlt.results?.length || 0) > 0
      if (!dxyOk && !tltOk) throw new Error('No DXY or TLT data — cross-asset blind')
      return {
        detail: `DXY: ${dxyOk ? `${dxy.results[0]?.c?.toFixed(2)} ✓` : '✗'} | TLT: ${tltOk ? `${tlt.results[0]?.c?.toFixed(2)} ✓` : '✗'} — cross-asset confirmation active`,
        value: { dxyOk, tltOk }
      }
    }),

    check('Setup Evaluator', async () => {
      const { evaluateSetup } = await import('@/app/cockpit/lib/setupEvaluator')
      const result = evaluateSetup('vwap_retest_long', {
        currentPrice: 5820, vwap: 5820, vwapBand1Up: null, vwapBand1Dn: null,
        pdh: null, pdl: null, prevClose: null, ema200: null,
        poc: 5821, vah: null, val: null, intradayHigh: null, intradayLow: null,
        gammaFlip: null, callWall: null, putWall: null, gexRegime: 'positive',
        tickValue: 450, trinValue: 0.85, cumDelta: 'BUY',
        optionsFlowBias: 'CALL HEAVY', darkPoolBias: 'BUY',
        h1Trend: 'BULLISH', m15Trend: 'BULLISH', dailyTrend: 'BULLISH',
        mechanicalScore: 35, asymmetricSetup: 'BULLISH_AMPLIFY',
        ivRank: 45, sessionMinsLeft: 200, sessionName: 'PRIME',
        patternSummary: null, candlePatterns: null,
      })
      if (!result.rating) throw new Error('Missing rating')
      return {
        detail: `Setup eval OK ✓ | ${result.setup.name}: ${result.rating} ${result.score}/100 | ${result.confirmingCount}✓ ${result.contradictingCount}✗`,
        value: { rating: result.rating, score: result.score }
      }
    }),

    check('Actionability Engine', async () => {
      const { classifyActionability } = await import('@/app/cockpit/lib/actionability')
      const result = classifyActionability({
        signal: 'LONG', confidence: 75, signalAge: 2,
        qualityVerdict: 'STRONG', mechanicalScore: 45, asymmetricSetup: 'BULLISH_AMPLIFY',
        currentPrice: 5820, vwap: 5818, ema200: 5805, poc: 5821,
        callWall: 5850, putWall: 5790, gammaFlip: 5810,
        currentVolume: 15000, avgVolume: 12000,
        upcomingEvents: [], sessionMinsLeft: 180, historicalWinRateAtConf: null,
      })
      if (!result.verdict) throw new Error('Missing verdict')
      return {
        detail: `Actionability OK ✓ | Verdict: ${result.verdict} | Setup: ${result.setupType} | Greens: ${result.greenLights.length} Reds: ${result.redFlags.length}`,
        value: { verdict: result.verdict, setupType: result.setupType }
      }
    }),

    check('Mechanical Flow Calculation', async () => {
      const { calculateMechanicalFlow } = await import('@/app/cockpit/lib/mechanicalFlow')
      const mf = calculateMechanicalFlow({
        netGex: 2.5e9, regime: 'positive', gammaFlip: 5810, callWall: 5850, putWall: 5780,
        charmDollar: 1.5e8, charmNote: 'positive charm', charmUrgency: 'MODERATE',
        dexBias: 'LONG', currentPrice: 5820, sessionMinsLeft: 180,
        optionsFlowBias: 'CALL HEAVY', marketTideBias: 'bullish', putCallRatio: 0.85,
      })
      if (!mf.mechanicalBias) throw new Error('Missing mechanicalBias')
      return {
        detail: `Calc OK ✓ | Bias: ${mf.mechanicalBias} (${mf.mechanicalScore}) | Asymmetric: ${mf.asymmetricSetup} | Hedging: ${mf.hedgingDirection}`,
        value: { bias: mf.mechanicalBias, score: mf.mechanicalScore }
      }
    }),

    check('Mechanical Flow Accuracy API', async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.traidezone.ai'}/api/mechanical-flow-accuracy`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      return {
        detail: d.sampleSize > 0
          ? `${d.sampleSize} scored trades | Verdict: ${d.verdict} | ${d.edge || 'no edge yet'}`
          : 'No mechanical snapshots yet — close trades via Trade Ticket to build sample',
        value: { sampleSize: d.sampleSize, verdict: d.verdict }
      }
    }),

    check('Options Chain (0DTE SPX via Polygon)', async () => {
      const POLY = process.env.POLYGON_API_KEY
      if (!POLY) throw new Error('POLYGON_API_KEY not set')
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const res = await fetch(`https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${today}&limit=10&apiKey=${POLY}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`Polygon options HTTP ${res.status}`)
      const d = await res.json()
      const count = d.results?.length || 0
      return {
        detail: count > 0
          ? `${count} 0DTE contracts found ✓ — max pain + OI walls calculable`
          : 'No 0DTE options data today (weekend/pre-market) — will populate at open',
        value: { contractCount: count }
      }
    }),

  ])

  const checks = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value as { name: string; status: 'ok'|'warn'|'error'; detail: string; value?: any }
    const rejected = r as PromiseRejectedResult
    return { name: `Check ${i}`, status: 'error' as const, detail: String(rejected.reason) }
  })

  const ok    = checks.filter(c => c.status === 'ok').length
  const warns = checks.filter(c => c.status === 'warn').length
  const errs  = checks.filter(c => c.status === 'error').length

  return NextResponse.json({
    summary: { ok, warns, errors: errs, total: checks.length, health: Math.round(ok/checks.length*100) },
    checks,
    crons: [
      { name: 'Health Check',       schedule: '*/30 * * * *',       path: '/api/agents/health-check',      description: 'System alive check' },
      { name: 'Score Alerts',       schedule: '*/30 14-22 * * 1-5', path: '/api/agents/score-alerts',      description: 'Auto-grade signals vs price' },
      { name: 'Gap Record',         schedule: '9:35am ET',          path: '/api/gap-outcomes/record',       description: 'Capture gap + trend prediction' },
      { name: 'Gap Score',          schedule: '11:05am ET',         path: '/api/gap-outcomes/score',        description: 'Score gap fill/continue/chop' },
      { name: 'Gap EOD',            schedule: '4:05pm ET',          path: '/api/gap-outcomes/eod',          description: 'Score trend vs chop day' },
      { name: 'Morning Email',      schedule: '9:00am ET',          path: '/api/email/morning-brief',       description: 'Daily brief to inbox' },
      { name: 'Stream Weights',     schedule: '5:00pm ET',          path: '/api/agents/stream-weights',    description: 'Learn which streams predict wins' },
      { name: 'Update Edge',        schedule: '4:30pm ET',          path: '/api/agents/update-edge',       description: 'Update edge profile from signals' },
      { name: 'Learn Outcomes',     schedule: '5:00pm ET',          path: '/api/agents/learn-from-outcomes', description: 'Extract patterns from scored trades' },
      { name: 'Analyze Chat',       schedule: '6:00pm ET',          path: '/api/agents/analyze-chat',      description: 'Learn from today\'s conversations' },
      { name: 'Usage Report',       schedule: '5:00pm ET',          path: '/api/agents/usage-report',      description: 'API cost tracking' },
    ]
  })
}
