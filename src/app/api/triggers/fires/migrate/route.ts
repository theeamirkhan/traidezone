/**
 * /api/triggers/fires/migrate — creates trigger_fires table
 *
 * Logs every time a personal trigger fires, capturing BOTH the trader's
 * setup conviction AND the AI overlay verdict, plus the eventual outcome.
 * This is the attribution dataset: over time it reveals whose read
 * (personal setup vs AI context) wins, especially on disagreements.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS trigger_fires (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             text NOT NULL,
  trigger_id          uuid,
  trigger_name        text,
  fired_at            timestamptz DEFAULT now() NOT NULL,
  direction           text NOT NULL,

  -- Trader's setup side
  setup_confidence    integer,
  entry_spx           numeric NOT NULL,
  predicted_t1        numeric,
  predicted_stop      numeric,

  -- AI overlay side
  ai_verdict          text,          -- CONFIRM | CAUTION | CONFLICT
  ai_confidence       integer,
  ai_reasoning        text,
  ai_conflict_factors jsonb,         -- list of {factor, note}
  agreement           text,          -- AGREE | PARTIAL | DISAGREE

  -- Outcome (graded later, same T1-before-stop rules as shadow)
  outcome_30m         text,
  outcome_60m         text,
  outcome_90m         text,
  actual_spx_60m      numeric,
  graded_at           timestamptz,

  -- Did the trader actually take it?
  taken               boolean,

  context_snapshot    jsonb,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trigger_fires_user
  ON trigger_fires(user_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_trigger_fires_grading
  ON trigger_fires(fired_at)
  WHERE outcome_90m IS NULL;
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { error: testErr } = await supabaseAdmin.from('trigger_fires').select('id').limit(1)
    if (!testErr) return NextResponse.json({ ok: true, status: 'already_exists' })
    return NextResponse.json({ ok: false, status: 'needs_manual_creation', sql: CREATE_TABLE })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, sql: CREATE_TABLE })
  }
}
