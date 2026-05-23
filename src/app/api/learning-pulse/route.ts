/**
 * /api/learning-pulse — Real-time learning loop diagnostic
 *
 * Shows exactly what the AI has learned, what's in the DB,
 * and whether each part of the learning loop is functioning.
 * Used by the Learn tab in cockpit to show learning progress.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const week  = new Date(Date.now() - 7 * 86400000).toISOString()

  const [
    alertsAll, alertsScored, alertsToday,
    profile, gapToday, chatSessions,
  ] = await Promise.allSettled([
    supabaseAdmin.from('trade_alerts')
      .select('id, signal, outcome, outcome_normalized, confidence, scored_at, context_snapshot, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('trade_alerts')
      .select('id, signal, outcome, outcome_normalized, confidence, pts_to_t1, created_at')
      .eq('user_id', userId).not('outcome', 'eq', 'PENDING').not('outcome', 'is', null)
      .order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('trade_alerts')
      .select('id, signal, outcome, confidence, created_at')
      .eq('user_id', userId).gte('created_at', today).order('created_at', { ascending: false }),
    supabaseAdmin.from('trader_profiles').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('gap_outcomes').select('*').eq('trading_date', today).single(),
    supabaseAdmin.from('chat_sessions')
      .select('id, trading_date, role').eq('user_id', userId)
      .gte('created_at', week).order('created_at', { ascending: false }).limit(200),
  ])

  const getVal = (r: PromiseSettledResult<any>) =>
    r.status === 'fulfilled' ? r.value?.data : null

  const allAlerts   = getVal(alertsAll)    || []
  const scored      = getVal(alertsScored) || []
  const todayAlerts = getVal(alertsToday)  || []
  const profileData = getVal(profile)
  const gapData     = getVal(gapToday)
  const chatData    = getVal(chatSessions) || []

  // Signal metrics
  const totalSignals = allAlerts.length
  const pendingCount = allAlerts.filter((a: any) => a.outcome === 'PENDING' || !a.outcome).length
  const scoredCount  = scored.length
  const winsCount    = scored.filter((a: any) =>
    a.outcome_normalized === 'WIN' || a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2').length
  const lossCount    = scored.filter((a: any) =>
    a.outcome_normalized === 'LOSS' || a.outcome === 'STOPPED_OUT').length
  const winRate      = scoredCount > 0 ? Math.round(winsCount / scoredCount * 100) : null
  const avgPts       = scored.length > 0
    ? (scored.reduce((s: number, a: any) => s + (a.pts_to_t1 || 0), 0) / scored.length).toFixed(1)
    : null

  // Context snapshot health
  const withSnapshot    = allAlerts.filter((a: any) => a.context_snapshot).length
  const withStreamVotes = allAlerts.filter((a: any) => {
    try { return JSON.parse(a.context_snapshot || '{}').streamVotes } catch { return false }
  }).length
  const withMarketIntel = allAlerts.filter((a: any) => {
    try {
      const c = JSON.parse(a.context_snapshot || '{}')
      return !!(c.vwapBandPos || c.termShape || c.sessionName)
    } catch { return false }
  }).length

  // Recent signal timeline
  const timeline = allAlerts.slice(0, 15).map((a: any) => {
    let hasIntel = false
    try {
      const c = JSON.parse(a.context_snapshot || '{}')
      hasIntel = !!(c.vwapBandPos || c.termShape || c.sessionName)
    } catch {}
    const norm = a.outcome_normalized || a.outcome || 'PENDING'
    return {
      date:       a.created_at?.split('T')[0],
      time:       a.created_at?.split('T')[1]?.substring(0, 5) + ' ET',
      signal:     a.signal,
      confidence: a.confidence,
      outcome:    norm,
      scoredAt:   a.scored_at ? a.scored_at.split('T')[1]?.substring(0, 5) : null,
      hasSnapshot: !!a.context_snapshot,
      hasIntel,
    }
  })

  // Stream weights
  const streamWts     = profileData?.stream_weights || {}
  const weightEntries = Object.entries(streamWts)
    .map(([name, w]: [string, any]) => ({
      name,
      weight:    parseFloat((w as number).toFixed(3)),
      direction: (w as number) > 1.05 ? 'BOOSTED' : (w as number) < 0.95 ? 'REDUCED' : 'EQUAL',
    }))
    .sort((a, b) => b.weight - a.weight)
  const hasLearned = weightEntries.some(w => w.direction !== 'EQUAL')

  // AI learnings
  const chatLearnings = profileData?.chat_learnings || []
  const weaknesses    = profileData?.weaknesses      || []
  const strengths     = profileData?.strengths       || []
  const chatDays      = [...new Set(chatData.map((c: any) => c.trading_date))].length
  const chatMsgCount  = chatData.filter((c: any) => c.role === 'user').length

  // Next steps
  const nextSteps: string[] = []
  if (totalSignals === 0)
    nextSteps.push('🔴 No signals yet — fire your first signal in the cockpit')
  else if (scoredCount === 0 && pendingCount > 0)
    nextSteps.push(`🟡 ${pendingCount} signals pending — score-alerts cron runs every 30min during market hours (2pm-10pm UTC)`)
  if (withMarketIntel === 0 && withSnapshot > 0)
    nextSteps.push('🟡 Existing snapshots lack market intel — new signals will auto-include it')
  if (!hasLearned && scoredCount > 0 && scoredCount < 20)
    nextSteps.push(`🟡 Stream weights need ${Math.max(0, 20 - scoredCount)} more scored signals to diverge from equal`)
  if (hasLearned)
    nextSteps.push('✅ Stream weights learning — high-accuracy streams getting more vote weight')
  if (chatLearnings.length === 0)
    nextSteps.push('🟡 No chat learnings yet — companion learns after market close (analyze-chat cron, 6pm ET)')
  if (chatLearnings.length > 0 && (weaknesses.length > 0 || strengths.length > 0))
    nextSteps.push(`✅ AI has learned from ${chatLearnings.length} sessions — ${weaknesses.length} weaknesses + ${strengths.length} strengths identified`)

  return NextResponse.json({
    signals: {
      total: totalSignals, today: todayAlerts.length,
      pending: pendingCount, scored: scoredCount,
      wins: winsCount, losses: lossCount, winRate, avgPts,
      message: totalSignals === 0
        ? 'No signals saved yet'
        : scoredCount === 0
        ? `${pendingCount} signals pending auto-scoring`
        : `${scoredCount} scored | ${winRate}% win rate | ${avgPts}pts avg`,
    },
    snapshots: {
      total: totalSignals, withSnapshot, withStreamVotes, withMarketIntel,
      snapshotRate: totalSignals > 0 ? Math.round(withSnapshot / totalSignals * 100) : 0,
      intelRate:    withSnapshot > 0 ? Math.round(withMarketIntel / withSnapshot * 100) : 0,
      message: withSnapshot === 0
        ? 'No snapshots saved'
        : withMarketIntel === 0
        ? `${withSnapshot} old-format snapshots — new signals include full market intel`
        : `${withMarketIntel}/${withSnapshot} snapshots have full market intelligence`,
    },
    streamWeights: {
      count: weightEntries.length, hasLearned,
      boosted: weightEntries.filter(w => w.direction === 'BOOSTED').map(w => `${w.name} (${w.weight}x)`),
      reduced: weightEntries.filter(w => w.direction === 'REDUCED').map(w => `${w.name} (${w.weight}x)`),
      weights: weightEntries,
      lastUpdated: profileData?.updated_at?.split('T')[0] || null,
      message: weightEntries.length === 0
        ? 'Not initialized — weights will calculate after first scoring run'
        : !hasLearned
        ? `All ${weightEntries.length} streams at equal weight — need ${Math.max(0, 20 - scoredCount)} more scored signals`
        : `${weightEntries.filter(w=>w.direction==='BOOSTED').length} boosted | ${weightEntries.filter(w=>w.direction==='REDUCED').length} reduced`,
    },
    aiLearnings: {
      sessionCount:        profileData?.session_count || 0,
      chatLearningsCount:  chatLearnings.length,
      weaknessCount:       weaknesses.length,
      strengthCount:       strengths.length,
      chatDaysThisWeek:    chatDays,
      chatMsgsThisWeek:    chatMsgCount,
      latestLearning:      chatLearnings[chatLearnings.length - 1] || null,
      recentWeaknesses:    weaknesses.slice(-3),
      recentStrengths:     strengths.slice(-3),
      message: chatLearnings.length === 0
        ? 'No learnings yet — companion needs conversations to learn from'
        : `${chatLearnings.length} session learnings | ${weaknesses.length} weaknesses | ${strengths.length} strengths`,
    },
    today: {
      signals: todayAlerts.length,
      gapRecorded: !!gapData,
      gapOutcome:  gapData?.gap_outcome || null,
      dayType:     gapData?.day_type    || null,
      trendScore:  gapData?.trend_score_predicted || null,
    },
    timeline,
    nextSteps,
  })
}
