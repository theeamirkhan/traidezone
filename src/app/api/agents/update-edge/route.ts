/**
 * /api/agents/update-edge — Edge Profile Update Agent
 *
 * Runs on Vercel cron daily at 4:30 PM ET (Mon-Fri).
 * Also callable on-demand from the cockpit.
 *
 * Process:
 *  1. Run 90-day backtest (3 Polygon API calls)
 *  2. Fetch live alert accuracy from Supabase trade_alerts
 *  3. Compute EdgeProfile
 *  4. Upsert into Supabase user_edge_profiles table
 *
 * The cockpit reads from Supabase — no browser-side computation.
 * Profile is per-user (each trader has their own alert history).
 * Backtest is shared (same historical data for all users).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

// ── Shared backtest cache (server memory, resets on cold start) ───────────────
let backtestCache: { summary: any; cachedAt: number } | null = null
const BACKTEST_CACHE_MS = 60 * 60 * 1000  // 1 hour server-side cache

// ── Fetch backtest from our own agent ────────────────────────────────────────
async function getBacktestSummary(origin: string): Promise<any | null> {
  // Use server-side cache to avoid re-running the expensive 3-call backtest
  if (backtestCache && Date.now() - backtestCache.cachedAt < BACKTEST_CACHE_MS) {
    console.log('[update-edge] Using cached backtest summary')
    return backtestCache.summary
  }

  try {
    const url = `${origin}/api/agents/backtest?days=90`
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}` },
      signal: AbortSignal.timeout(45000),
    })
    const data = await res.json()
    if (!data.summary) {
      console.error('[update-edge] Backtest returned no summary:', data.error)
      return null
    }
    backtestCache = { summary: data.summary, cachedAt: Date.now() }
    console.log(`[update-edge] Backtest complete: ${data.summary.totalDays} days, ${data.summary.winRate}% win rate`)
    return data.summary
  } catch (e: any) {
    console.error('[update-edge] Backtest fetch failed:', e.message)
    return null
  }
}

// ── Fetch live alert accuracy for a specific user ─────────────────────────────
async function getUserAlertAccuracy(userId: string): Promise<any> {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: alerts, error } = await supabaseAdmin
    .from('trade_alerts')
    .select('outcome, pts_to_t1, confidence, vix_at_signal, logged_at, proximity_breakout_pct')
    .eq('user_id', userId)
    .neq('outcome', 'PENDING')
    .gte('logged_at', cutoff)
    .order('logged_at', { ascending: false })
    .limit(200)

  if (error || !alerts?.length) {
    return { total: 0, winRate: null, profitFactor: null, recentForm: null, suggestions: [] }
  }

  const wins  = alerts.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
  const stops = alerts.filter(a => a.outcome === 'STOPPED_OUT')

  const avgWon  = wins.length  ? wins.reduce((s,a)  => s + Math.abs(a.pts_to_t1 || 0), 0) / wins.length  : 0
  const avgLost = stops.length ? stops.reduce((s,a) => s + Math.abs(a.pts_to_t1 || 0), 0) / stops.length : 0
  const pf      = avgLost > 0  ? avgWon / avgLost : wins.length > 0 ? 9.9 : 0

  const last10 = alerts.slice(0, 10)
  const l10w   = last10.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2').length
  const form   = l10w >= 8 ? 'Hot 🔥' : l10w >= 6 ? 'Solid' : l10w >= 4 ? 'Struggling' : 'Cold ❄️'

  const winRate = Math.round(wins.length / alerts.length * 100)

  const suggestions: string[] = []
  if (alerts.length >= 8) {
    if (pf < 1.0)     suggestions.push(`Profit factor ${pf.toFixed(2)} — losers outsize winners, widen targets or tighten stops`)
    if (winRate < 40) suggestions.push(`Win rate ${winRate}% — below system baseline, review entry conditions`)
    if (form === 'Cold ❄️') suggestions.push('Cold streak in last 10 signals — reduce size until form returns')
    if (form === 'Hot 🔥')  suggestions.push('Hot streak — edge is confirmed, trade with full conviction')
    if (pf > 2.5 && winRate >= 60) suggestions.push(`Strong edge: ${winRate}% win rate with ${pf.toFixed(1)}× profit factor — system is working`)
  }

  return {
    total:       alerts.length,
    winRate,
    profitFactor: parseFloat(pf.toFixed(2)),
    recentForm:  form,
    suggestions,
  }
}

// ── Build EdgeProfile from backtest + live accuracy ───────────────────────────
function buildEdgeProfile(backtestSummary: any, liveAccuracy: any, userId: string) {
  const s = backtestSummary

  // Best days (win rate ≥ 55% with ≥ 3 signals)
  const bestDays = Object.entries(s.byDow || {})
    .filter(([, v]: any) => v.total >= 3 && v.rate >= 55)
    .sort((a: any, b: any) => b[1].rate - a[1].rate)
    .slice(0, 3)
    .map(([day]) => day)

  // Best VIX regime
  const bestVix = Object.entries(s.byVix || {})
    .filter(([, v]: any) => v.total >= 3)
    .sort((a: any, b: any) => b[1].rate - a[1].rate)[0]

  const vixLabel = bestVix
    ? bestVix[0]
        .replace('Low<14', 'Low <14')
        .replace('Normal14-20', 'Normal 14-20')
        .replace('Elevated20-28', 'Elevated 20-28')
        .replace('High>28', 'High >28')
    : null

  return {
    user_id:              userId,
    // Backtest fields
    backtest_win_rate:    s.winRate,
    backtest_pf:          s.profitFactor,
    long_win_rate:        s.longWinRate,
    short_win_rate:       s.shortWinRate,
    best_days:            bestDays,
    best_vix_regime:      vixLabel,
    avg_win_mins:         s.avgWinMins,
    avg_loss_mins:        s.avgLossMins,
    backtest_days:        s.totalDays,
    backtest_date_range:  s.dateRange ? `${s.dateRange.from} → ${s.dateRange.to}` : null,
    // Live accuracy fields
    live_win_rate:        liveAccuracy.winRate,
    live_pf:              liveAccuracy.profitFactor,
    live_scored_alerts:   liveAccuracy.total,
    live_recent_form:     liveAccuracy.recentForm,
    model_suggestions:    liveAccuracy.suggestions,
    // Metadata
    updated_at:           new Date().toISOString(),
  }
}

// ── Ensure table exists ───────────────────────────────────────────────────────
async function ensureTable(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_edge_profiles')
    .select('user_id')
    .limit(1)

  if (!error) return true  // table exists

  // Table doesn't exist — try creating via RPC
  const { error: rpcErr } = await supabaseAdmin.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS user_edge_profiles (
        user_id              text PRIMARY KEY,
        backtest_win_rate    integer,
        backtest_pf          numeric,
        long_win_rate        integer,
        short_win_rate       integer,
        best_days            text[],
        best_vix_regime      text,
        avg_win_mins         integer,
        avg_loss_mins        integer,
        backtest_days        integer,
        backtest_date_range  text,
        live_win_rate        integer,
        live_pf              numeric,
        live_scored_alerts   integer,
        live_recent_form     text,
        model_suggestions    text[],
        updated_at           timestamptz NOT NULL DEFAULT now()
      );
    `
  })

  return !rpcErr
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const origin       = req.headers.get('origin') || req.headers.get('referer') || ''
  const isFromApp    = origin.includes('traidezone.ai') || origin.includes('localhost')

  // Block entirely if no valid auth
  if (!isVercelCron && !isCronSecret && !isFromApp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // isCron = server-initiated (Vercel cron OR cron secret without browser session)
  // When cron secret is present from the browser, still run in single-user mode
  const isCron = isVercelCron  // only true Vercel cron runs update all users

  const startTime = Date.now()
  const host      = req.headers.get('host') || 'www.traidezone.ai'
  const proto     = host.includes('localhost') ? 'http' : 'https'
  const originUrl = `${proto}://${host}`

  console.log(`[update-edge] Starting edge profile update (cron=${isCron})`)

  // Ensure table exists
  await ensureTable()

  // ── Run backtest (shared across all users) ────────────────────────────────
  const backtestSummary = await getBacktestSummary(originUrl)
  if (!backtestSummary) {
    return NextResponse.json({ error: 'Backtest failed — Polygon data unavailable' }, { status: 502 })
  }

  // ── Get users to update ───────────────────────────────────────────────────
  let userIds: string[] = []

  if (isCron) {
    // Vercel cron: update all users with recent activity
    const { data: activeUsers } = await supabaseAdmin
      .from('trade_alerts')
      .select('user_id')
      .gte('logged_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(500)
    userIds = [...new Set((activeUsers || []).map((u: any) => u.user_id))]
    console.log(`[update-edge] Cron: updating ${userIds.length} active users`)
  } else if (isCronSecret) {
    // Called with cron secret from browser — try to get user from session first,
    // fall back to all active users if no session (e.g. called from BacktestPanel)
    const { userId } = await auth().catch(() => ({ userId: null }))
    if (userId) {
      userIds = [userId]
      console.log(`[update-edge] On-demand: updating user ${userId}`)
    } else {
      // No session but valid cron secret — update all active users
      const { data: activeUsers } = await supabaseAdmin
        .from('trade_alerts')
        .select('user_id')
        .gte('logged_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(500)
      userIds = [...new Set((activeUsers || []).map((u: any) => u.user_id))]
      if (!userIds.length) {
        // No trades yet — still create a placeholder profile from backtest
        // Use a sentinel so the backtest data is available even before first trade
        console.log('[update-edge] No active users yet — skipping (no trade alerts to associate with)')
        return NextResponse.json({ status: 'complete', users: 0, message: 'No active users with trade alerts', backtest: { winRate: backtestSummary.winRate, days: backtestSummary.totalDays }, timestamp: new Date().toISOString() })
      }
    }
  } else {
    // From app without cron secret — use session auth
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userIds = [userId]
  }

  // ── Update each user ──────────────────────────────────────────────────────
  const results: any[] = []

  for (const userId of userIds) {
    try {
      const liveAccuracy = await getUserAlertAccuracy(userId)
      const profile      = buildEdgeProfile(backtestSummary, liveAccuracy, userId)

      const { error } = await supabaseAdmin
        .from('user_edge_profiles')
        .upsert(profile, { onConflict: 'user_id' })

      if (error) {
        console.error(`[update-edge] Upsert failed for ${userId}:`, error.message)
        results.push({ userId, status: 'error', error: error.message })
      } else {
        console.log(`[update-edge] Updated ${userId}: ${profile.backtest_win_rate}% win rate, ${liveAccuracy.total} live alerts`)
        results.push({ userId, status: 'ok', backtestWinRate: profile.backtest_win_rate, liveAlerts: liveAccuracy.total })
      }
    } catch (e: any) {
      console.error(`[update-edge] Error for ${userId}:`, e.message)
      results.push({ userId, status: 'error', error: e.message })
    }
  }

  return NextResponse.json({
    status:    'complete',
    users:     results.length,
    durationMs: Date.now() - startTime,
    backtest:  { winRate: backtestSummary.winRate, days: backtestSummary.totalDays },
    results,
    timestamp: new Date().toISOString(),
  })
}
