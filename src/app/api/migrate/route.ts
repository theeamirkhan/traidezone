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

  // Try to add morning_plan column to user_settings
  // First test if it already exists by trying to select it
  const { data: test, error: testErr } = await supabase
    .from('user_settings')
    .select('morning_plan')
    .eq('user_id', userId)
    .limit(1)

  if (!testErr) {
    return NextResponse.json({ alreadyExists: true, message: 'morning_plan column already exists' })
  }

  // Column doesn't exist — need to add it
  // We can do this via the Supabase pg REST /sql endpoint 
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

  // Try Supabase's internal SQL endpoint
  const sqlRes = await fetch(`https://${projectRef}.supabase.co/rest/v1/`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  })

  return NextResponse.json({
    columnMissing: true,
    testError: testErr.message,
    manual_sql: 'ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS morning_plan text;',
    note: 'Run this SQL in Supabase dashboard'
  })
}
