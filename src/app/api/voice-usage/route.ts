import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { seconds } = await req.json()
  const minutes = seconds / 60

  // Get current billing period (month start)
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Upsert voice usage for this billing period
  const { data, error } = await supabase.rpc('increment_voice_usage', {
    p_user_id: userId,
    p_minutes: minutes,
    p_period_start: periodStart,
  })

  if (error) {
    // Fallback: manual upsert
    const { data: existing } = await supabase
      .from('voice_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', periodStart)
      .single()

    if (existing) {
      await supabase.from('voice_usage').update({
        minutes_used: existing.minutes_used + minutes,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('voice_usage').insert({
        user_id: userId,
        minutes_used: minutes,
        period_start: periodStart,
        updated_at: new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({ success: true, minutes_logged: minutes })
}

export async function GET(req: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data } = await supabase
    .from('voice_usage')
    .select('minutes_used')
    .eq('user_id', userId)
    .eq('period_start', periodStart)
    .single()

  return NextResponse.json({ minutes_used: data?.minutes_used || 0 })
}