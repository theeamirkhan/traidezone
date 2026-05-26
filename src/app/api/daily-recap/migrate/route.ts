/**
 * /api/daily-recap/migrate — creates the daily_recaps table in Supabase
 * Call once: GET /api/daily-recap/migrate
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS daily_recaps (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               text NOT NULL,
  recap_date            date NOT NULL,
  recap_data            jsonb NOT NULL,
  signals_count         integer DEFAULT 0,
  wins                  integer DEFAULT 0,
  losses                integer DEFAULT 0,
  win_rate              integer,
  day_type_predicted    text,
  day_type_actual       text,
  generated_at          timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now(),
  UNIQUE(user_id, recap_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_recaps_user_date
  ON daily_recaps(user_id, recap_date DESC);
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Attempt to query the table — if it doesn't exist, Postgres will throw
    const { error: testErr } = await supabaseAdmin
      .from('daily_recaps')
      .select('id')
      .limit(1)

    if (!testErr) {
      return NextResponse.json({
        ok: true,
        status: 'already_exists',
        message: 'daily_recaps table already exists',
      })
    }

    // Table doesn't exist — provide SQL for manual creation
    return NextResponse.json({
      ok: false,
      status: 'needs_manual_creation',
      message: 'Run this SQL in your Supabase SQL editor:',
      sql: CREATE_TABLE,
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message,
      sql: CREATE_TABLE,
    })
  }
}
