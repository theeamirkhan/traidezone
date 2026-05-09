/**
 * /api/trade-alerts/migrate — creates the trade_alerts table in Supabase
 * Call once: GET /api/trade-alerts/migrate
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS trade_alerts (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               text NOT NULL,
  signal                text NOT NULL CHECK (signal IN ('LONG','SHORT')),
  entry_low             numeric,
  entry_high            numeric,
  entry_mid             numeric,
  stop_level            numeric,
  target1               numeric,
  target2               numeric,
  price_at_signal       numeric,
  vwap_at_signal        numeric,
  ema200_at_signal      numeric,
  vix_at_signal         numeric,
  confidence            integer,
  move_size             integer,
  proximity_level       text,
  proximity_breakout_pct integer,
  proximity_factors     jsonb,
  outcome               text NOT NULL DEFAULT 'PENDING',
  outcome_at            timestamptz,
  pts_to_t1             numeric,
  outcome_note          text,
  -- Human trade tracking
  human_took_trade      boolean,
  human_entry_price     numeric,
  human_exit_price      numeric,
  human_outcome         text,
  human_pts             numeric,
  skip_reason           text,
  human_notes           text,
  human_updated_at      timestamptz
                        CHECK (outcome IN ('PENDING','HIT_T1','HIT_T2','STOPPED_OUT','PARTIAL','EXPIRED')),
  outcome_at            timestamptz,
  pts_to_t1             numeric,
  max_favorable         numeric,
  max_adverse           numeric,
  outcome_note          text,
  logged_at             timestamptz NOT NULL DEFAULT now(),
  scored_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_alerts_user_id_idx ON trade_alerts(user_id);
CREATE INDEX IF NOT EXISTS trade_alerts_outcome_idx ON trade_alerts(outcome);
CREATE INDEX IF NOT EXISTS trade_alerts_logged_at_idx ON trade_alerts(logged_at DESC);
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Use rpc to run raw SQL
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: CREATE_TABLE })

  // Add human outcome columns to existing tables (ALTER IF NOT EXISTS — safe)
  const humanCols = [
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_took_trade boolean',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_entry_price numeric',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_exit_price numeric',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_outcome text',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_pts numeric',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS skip_reason text',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_notes text',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS human_updated_at timestamptz',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS outcome_at timestamptz',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS pts_to_t1 numeric',
    'ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS outcome_note text',
  ]
  for (const sql of humanCols) {
    try { await supabaseAdmin.rpc('exec_sql', { sql }) } catch {}
  }

    if (error && !error.message?.includes('already exists')) {
      // Try direct insert to check if table already exists
      const { error: checkErr } = await supabaseAdmin
        .from('trade_alerts')
        .select('id')
        .limit(1)

      if (!checkErr) {
        return NextResponse.json({ status: 'table already exists', ready: true })
      }

      console.error('[migrate]', error.message)
      return NextResponse.json({
        error: error.message,
        hint: 'Run this SQL manually in Supabase SQL Editor',
        sql: CREATE_TABLE
      }, { status: 500 })
    }

    return NextResponse.json({ status: 'created', ready: true })
  } catch (e: any) {
    // Fallback: check if table exists anyway
    const { error: checkErr } = await supabaseAdmin
      .from('trade_alerts')
      .select('id')
      .limit(1)

    if (!checkErr) {
      return NextResponse.json({ status: 'table already exists', ready: true })
    }

    return NextResponse.json({
      error: e.message,
      hint: 'Run this SQL manually in Supabase SQL Editor',
      sql: CREATE_TABLE
    }, { status: 500 })
  }
}
