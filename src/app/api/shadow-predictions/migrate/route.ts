/**
 * /api/shadow-predictions/migrate — creates shadow_predictions table
 *
 * Run once via GET. Returns SQL to paste into Supabase SQL editor.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS shadow_predictions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               text NOT NULL,
  predicted_at          timestamptz DEFAULT now() NOT NULL,
  signal_direction      text NOT NULL,
  confidence            integer NOT NULL,
  current_spx           numeric NOT NULL,
  predicted_t1          numeric,
  predicted_stop        numeric,
  predicted_t2          numeric,
  ai_view               text,
  context_snapshot      jsonb,
  regime_signature      text,
  status                text DEFAULT 'pending',
  outcome_30m           text,
  outcome_60m           text,
  outcome_90m           text,
  actual_spx_30m        numeric,
  actual_spx_60m        numeric,
  actual_spx_90m        numeric,
  max_favorable_move    numeric,
  max_adverse_move      numeric,
  graded_at             timestamptz,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_predictions_user_time
  ON shadow_predictions(user_id, predicted_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_predictions_status
  ON shadow_predictions(status, predicted_at)
  WHERE status != 'graded_90m';

CREATE INDEX IF NOT EXISTS idx_shadow_predictions_regime
  ON shadow_predictions(user_id, regime_signature, predicted_at DESC);
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { error: testErr } = await supabaseAdmin
      .from('shadow_predictions')
      .select('id')
      .limit(1)

    if (!testErr) {
      return NextResponse.json({
        ok: true,
        status: 'already_exists',
        message: 'shadow_predictions table already exists',
      })
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
