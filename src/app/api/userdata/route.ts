import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table')

  if (!table) return NextResponse.json({ error: 'Missing table' }, { status: 400 })

  try {
    if (table === 'morning_plan') {
      // Stored in user_settings.morning_plan (text field) to avoid uuid schema issue
      const { data, error } = await supabase
        .from('user_settings')
        .select('morning_plan')
        .eq('user_id', userId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      if (data?.morning_plan) {
        try {
          return NextResponse.json({ data: JSON.parse(data.morning_plan) })
        } catch { return NextResponse.json({ data: null }) }
      }
      return NextResponse.json({ data: null })
    }

    if (table === 'trades') {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return NextResponse.json({ data: data || [] })
    }

    if (table === 'playbooks') {
      const { data, error } = await supabase
        .from('playbooks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ data: data || [] })
    }

    if (table === 'session_memory') {
      const { data, error } = await supabase
        .from('session_memory')
        .select('memory')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return NextResponse.json({ data: data?.map((d: any) => d.memory) || [] })
    }

    if (table === 'settings') {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return NextResponse.json({ data: data || null })
    }

    if (table === 'edge_profile') {
      const { data, error } = await supabase
        .from('user_edge_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return NextResponse.json({ data: data || null })
    }

    return NextResponse.json({ error: 'Unknown table' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { table, data } = body

  if (!table || !data) return NextResponse.json({ error: 'Missing table or data' }, { status: 400 })

  try {
    if (table === 'morning_plan') {
      // Store in user_settings.morning_plan column (avoids uuid schema issue on morning_plans table)
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          morning_plan: JSON.stringify(data),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'trade') {
      const { error } = await supabase
        .from('trades')
        .insert({
          user_id: userId,
          date: data.date,
          time: data.time,
          symbol: data.symbol,
          direction: data.direction,
          side: data.side,
          qty: data.qty,
          price: data.price,
          pnl: data.pnl,
          in_system: data.inSystem,
          playbook: data.playbook,
          notes: data.notes,
          raw: data.raw,
        })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'trades_bulk') {
      const rows = (data.trades || []).map((t: any) => ({
        user_id: userId,
        date: t.date,
        time: t.time,
        symbol: t.symbol,
        direction: t.direction,
        side: t.side,
        qty: t.qty,
        price: t.price,
        pnl: t.pnl,
        in_system: t.inSystem ?? true,
        playbook: t.playbook,
        notes: t.notes,
        raw: t.raw,
      }))
      const { error } = await supabase.from('trades').insert(rows)
      if (error) throw error
      return NextResponse.json({ success: true, count: rows.length })
    }

    if (table === 'playbook') {
      const { error } = await supabase
        .from('playbooks')
        .insert({
          user_id: userId,
          name: data.name,
          setup: data.setup,
          entry: data.entry,
          stop: data.stop,
          target: data.target,
          notes: data.notes,
        })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'session_memory') {
      const { error } = await supabase
        .from('session_memory')
        .insert({
          user_id: userId,
          memory: data.memory,
        })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'settings') {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          voice_id: data.voiceId,
          voice_speed: data.voiceSpeed,
          ai_tone: data.aiTone,
          dark_mode: data.darkMode,
          user_name: data.userName,
          welcome_message: data.welcomeMessage,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown table' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table')
  const id = searchParams.get('id')

  try {
    if (table === 'trade' && id) {
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'playbook' && id) {
      const { error } = await supabase
        .from('playbooks')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'session_memory') {
      const { error } = await supabase
        .from('session_memory')
        .delete()
        .eq('user_id', userId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (table === 'edge_profile') {
      const profileData = { ...data, user_id: userId, updated_at: new Date().toISOString() }
      const { error } = await supabase
        .from('user_edge_profiles')
        .upsert(profileData, { onConflict: 'user_id' })
      if (error) throw error
      return NextResponse.json({ saved: true })
    }

    return NextResponse.json({ error: 'Unknown table or missing id' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}