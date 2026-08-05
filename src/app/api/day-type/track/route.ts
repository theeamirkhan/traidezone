/**
 * /api/day-type/track — persist the locked morning day-type forecast with
 * per-signal votes, so signal weights can be re-derived from measured
 * accuracy instead of hand-tuned guesses.
 *
 * daily_recaps already stores predicted vs actual per day; this table adds
 * WHICH of the 8 signals voted which way, enabling per-signal hit-rate
 * analysis (join on user_id + date) at the week-end review.
 *
 * Requires one-time migration (see migration_day_type_signal_log.sql).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.forecast) return NextResponse.json({ error: 'forecast required' }, { status: 400 })
  const f = body.forecast
  const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

  const { error } = await supabaseAdmin.from('day_type_signal_log').upsert({
    user_id:    userId,
    log_date:   todayET,
    day_type:   f.dayType ?? null,
    trend_prob: f.trendProbability ?? null,
    range_prob: f.consolidationProbability ?? null,
    confidence: f.confidence ?? null,
    directional_lean: f.directionalLean ?? null,
    signals:    f.trendSignals ?? [],
    locked_at:  new Date().toISOString(),
  }, { onConflict: 'user_id,log_date' })

  if (error) {
    if (error.message?.includes('does not exist')) return NextResponse.json({ ok: false, needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
