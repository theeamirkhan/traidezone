/**
 * /api/daily-recap — Retrieve most recent recap(s) for display in the cockpit
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')  // optional specific date

    let query = supabaseAdmin
      .from('daily_recaps')
      .select('recap_date, recap_data, signals_count, wins, losses, win_rate, day_type_predicted, day_type_actual, generated_at')
      .eq('user_id', userId)
      .order('recap_date', { ascending: false })

    if (date) {
      query = query.eq('recap_date', date)
    } else {
      query = query.limit(5)  // last 5 recaps
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      recaps: data || [],
      mostRecent: data && data.length > 0 ? data[0] : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
