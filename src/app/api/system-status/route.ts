/**
 * /api/system-status — Complete system health and wiring audit
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
