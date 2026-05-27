/**
 * /api/open-positions/migrate — creates open_positions table
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS open_positions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               text NOT NULL,
  signal_id             text,
  signal_direction      text NOT NULL,
  symbol                text DEFAULT 'SPX',
  strike                numeric,
  expiry                text,
  contracts             integer DEFAULT 1,
  entry_price           numeric NOT NULL,
  entry_premium         numeric,
  stop_level            numeric,
  target1               numeric,
  target2               numeric,
  setup_name            text,
  ai_confidence         integer,
  status                text DEFAULT 'open',
  exit_price            numeric,
  exit_premium          numeric,
  exit_reason           text,
  pnl                   numeric,
  pnl_pct               numeric,
  opened_at             timestamptz DEFAULT now(),
  closed_at             timestamptz,
  notes                 text,
  context_snapshot      jsonb,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_positions_user_status
  ON open_positions(user_id, status, opened_at DESC);
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { error: testErr } = await supabaseAdmin
      .from('open_positions')
      .select('id')
      .limit(1)

    if (!testErr) {
      return NextResponse.json({ ok: true, status: 'already_exists', message: 'open_positions table already exists' })
    }

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
