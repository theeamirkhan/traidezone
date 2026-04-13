import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('trader_profiles').select('*').eq('user_id', userId).single()
  if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || null })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { error } = await supabase.from('trader_profiles').upsert(
    { user_id: userId, updated_at: new Date().toISOString(), ...body },
    { onConflict: 'user_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Append session memories to the profile's memory log
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { memories } = await req.json()
  if (!Array.isArray(memories) || memories.length === 0) return NextResponse.json({ success: true })
  const { data: existing } = await supabase.from('trader_profiles').select('memory_log, session_count').eq('user_id', userId).single()
  const currentLog: string[] = existing?.memory_log || []
  const sessionCount: number = (existing?.session_count || 0) + 1
  const dated = memories.map((m: string) => `[${new Date().toLocaleDateString()}] ${m}`)
  const newLog = [...currentLog, ...dated].slice(-100) // keep last 100
  const { error } = await supabase.from('trader_profiles').upsert(
    { user_id: userId, memory_log: newLog, session_count: sessionCount, last_session_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, session_count: sessionCount })
}
