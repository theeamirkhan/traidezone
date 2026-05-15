import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest) {
  try {
    // Create chat_sessions table
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       text NOT NULL,
        trading_date  date NOT NULL,
        role          text NOT NULL CHECK (role IN ('user','assistant','system')),
        content       text NOT NULL,
        metadata      jsonb,
        created_at    timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS chat_sessions_user_date ON chat_sessions(user_id, trading_date);
    ` })
    if (error && !error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ status: 'ok', table: 'chat_sessions' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
