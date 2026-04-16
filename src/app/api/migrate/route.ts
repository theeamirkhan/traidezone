import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { Pool } from 'pg'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: Record<string, any> = {}

  // Try pg direct connection if DATABASE_URL is set
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (dbUrl) {
    try {
      const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
      const client = await pool.connect()
      await client.query('ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS morning_plan text;')
      await client.query('ALTER TABLE morning_plans ALTER COLUMN user_id TYPE text USING user_id::text;')
      client.release()
      await pool.end()
      results.pg = 'success'
    } catch (e: any) {
      results.pgError = e.message
    }
  }

  // Check if morning_plan column exists in user_settings
  const { data, error } = await supabase
    .from('user_settings')
    .select('morning_plan')
    .eq('user_id', userId)
    .limit(1)

  results.columnExists = !error || !error.message?.includes('does not exist')
  results.columnError = error?.message

  return NextResponse.json(results)
}
