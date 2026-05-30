/**
 * /api/triggers/migrate — creates personal_triggers table
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS personal_triggers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         text NOT NULL,
  name            text NOT NULL,
  original_text   text NOT NULL,
  direction       text NOT NULL,
  conditions      jsonb NOT NULL,
  window_mins     integer DEFAULT 45,
  confidence      integer DEFAULT 70,
  stop_hint       text,
  target_hint     text,
  enabled         boolean DEFAULT true,
  fire_count      integer DEFAULT 0,
  last_fired_at   timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_triggers_user
  ON personal_triggers(user_id, enabled);
`

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { error: testErr } = await supabaseAdmin.from('personal_triggers').select('id').limit(1)
    if (!testErr) {
      return NextResponse.json({ ok: true, status: 'already_exists' })
    }
    return NextResponse.json({ ok: false, status: 'needs_manual_creation', sql: CREATE_TABLE })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, sql: CREATE_TABLE })
  }
}
