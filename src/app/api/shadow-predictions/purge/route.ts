/**
 * /api/shadow-predictions/purge — admin diagnostic
 *
 * Deletes shadow predictions in a date range (or all backfill-tagged).
 * Used when the backfill produces bad data and we need to re-run with
 * a fixed prompt.
 *
 * Usage:
 *   POST /api/shadow-predictions/purge?from=2026-04-29&to=2026-05-28&cron=1
 *   POST /api/shadow-predictions/purge?backfillOnly=true&cron=1   ← deletes only context_snapshot._backfill flagged rows
 *   POST /api/shadow-predictions/purge?confirm=DELETE_ALL&cron=1  ← wipes entire table
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

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const backfillOnly = url.searchParams.get('backfillOnly') === 'true'
  const confirmAll = url.searchParams.get('confirm') === 'DELETE_ALL'

  try {
    if (confirmAll) {
      const { count: beforeCount } = await supabaseAdmin
        .from('shadow_predictions')
        .select('*', { count: 'exact', head: true })

      const { error } = await supabaseAdmin
        .from('shadow_predictions')
        .delete()
        .gt('id', '00000000-0000-0000-0000-000000000000')

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, mode: 'all', deletedApprox: beforeCount })
    }

    if (backfillOnly) {
      // Only deletes rows where context_snapshot._backfill = true
      const { data, error } = await supabaseAdmin
        .from('shadow_predictions')
        .delete()
        .eq('context_snapshot->_backfill', true)
        .select('id')

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, mode: 'backfillOnly', deleted: data?.length || 0 })
    }

    if (!fromParam || !toParam) {
      return NextResponse.json({
        error: 'Specify either ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?backfillOnly=true or ?confirm=DELETE_ALL',
      }, { status: 400 })
    }

    const fromISO = new Date(fromParam + 'T00:00:00Z').toISOString()
    const toISO = new Date(toParam + 'T23:59:59Z').toISOString()

    const { data, error } = await supabaseAdmin
      .from('shadow_predictions')
      .delete()
      .gte('predicted_at', fromISO)
      .lte('predicted_at', toISO)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      mode: 'dateRange',
      from: fromParam,
      to: toParam,
      deleted: data?.length || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
