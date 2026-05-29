/**
 * /api/shadow-predictions/raw-stats — diagnostic
 *
 * Returns raw counts/group-bys from shadow_predictions table WITHOUT
 * filtering by current user. Used to verify backfill data exists when
 * the authenticated stats endpoint returns 0.
 *
 * No Clerk auth — uses simple ?cron=1 bypass or app origin check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function isAuthorized(req: NextRequest): boolean {
  const url = new URL(req.url)
  const isManualBypass = url.searchParams.get('cron') === '1'
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || ''
  const isFromApp = origin.includes('traidezone') || origin.includes('localhost')
  return isManualBypass || isFromApp
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Total count
    const { count: totalCount } = await supabaseAdmin
      .from('shadow_predictions')
      .select('*', { count: 'exact', head: true })

    // User_id distribution
    const { data: allRows } = await supabaseAdmin
      .from('shadow_predictions')
      .select('user_id, signal_direction, confidence, status, outcome_60m, predicted_at')
      .limit(5000)

    const userIdCounts: Record<string, number> = {}
    const signalDist: Record<string, number> = {}
    const statusDist: Record<string, number> = {}
    const outcome60Dist: Record<string, number> = {}
    const dateCounts: Record<string, number> = {}

    for (const row of (allRows || [])) {
      userIdCounts[row.user_id] = (userIdCounts[row.user_id] || 0) + 1
      signalDist[row.signal_direction] = (signalDist[row.signal_direction] || 0) + 1
      statusDist[row.status] = (statusDist[row.status] || 0) + 1
      const oKey = row.outcome_60m || 'null'
      outcome60Dist[oKey] = (outcome60Dist[oKey] || 0) + 1
      const etDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(row.predicted_at))
      dateCounts[etDate] = (dateCounts[etDate] || 0) + 1
    }

    // Directional win rate (LONG/SHORT only, exclude WAIT and ungraded)
    const dirWins = (outcome60Dist['WIN'] || 0)
    const dirLosses = (outcome60Dist['LOSS'] || 0)
    const dirScratch = (outcome60Dist['SCRATCH'] || 0)
    const dirTotal = dirWins + dirLosses + dirScratch
    const winRateInclScratch = dirTotal > 0 ? Math.round((dirWins / dirTotal) * 100) : null
    const winRateExclScratch = (dirWins + dirLosses) > 0 ? Math.round((dirWins / (dirWins + dirLosses)) * 100) : null

    // Sample rows
    const { data: sample } = await supabaseAdmin
      .from('shadow_predictions')
      .select('user_id, predicted_at, signal_direction, confidence, current_spx, outcome_30m, outcome_60m, outcome_90m')
      .order('predicted_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      ok: true,
      totalCount,
      sampledRows: (allRows || []).length,
      winRate60_inclScratch: winRateInclScratch,
      winRate60_exclScratch: winRateExclScratch,
      userIdDistribution: userIdCounts,
      signalDistribution: signalDist,
      statusDistribution: statusDist,
      outcome60Distribution: outcome60Dist,
      dateDistribution: dateCounts,
      latestFiveRows: sample,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
