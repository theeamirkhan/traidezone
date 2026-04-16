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

  // Get the SQL to run from the request
  const { sql } = await req.json()
  if (!sql) return NextResponse.json({ error: 'Missing sql' }, { status: 400 })

  // Only allow ALTER TABLE morning_plans for safety
  if (!sql.includes('morning_plans')) {
    return NextResponse.json({ error: 'Only morning_plans migrations allowed' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('exec_sql', { query: sql })
  return NextResponse.json({ data, error: error?.message })
}
