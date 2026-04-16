import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Use Supabase's pg REST SQL execution endpoint
  // This is the correct endpoint for running raw SQL with service role
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      query: 'ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS morning_plan text;'
    })
  })

  if (res.ok) {
    return NextResponse.json({ success: true })
  }

  // exec_sql rpc doesn't exist — try pg extension approach
  // Use supabase-js to call a postgres function we create inline
  // Actually use the /pg/query endpoint available on paid plans

  // Fallback: use the Supabase dashboard REST API with the anon key won't work
  // Use the postgres connection via supabase's pg endpoint
  const pgRes = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: 'ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS morning_plan text;' })
  })

  if (pgRes.ok) {
    const pgData = await pgRes.json()
    return NextResponse.json({ success: true, pgData })
  }

  // Last resort: try creating a temporary function via supabase's schema
  const { error } = await supabase.rpc('migrate_add_morning_plan_column', {})
  if (!error) return NextResponse.json({ success: true, method: 'rpc' })

  return NextResponse.json({
    error: 'Could not run migration automatically',
    pgStatus: pgRes.status,
    manual_sql: 'ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS morning_plan text;',
    dashboard: 'https://supabase.com/dashboard/project/qqgfyhdqxwxizqybmsqd/sql/new'
  }, { status: 400 })
}
