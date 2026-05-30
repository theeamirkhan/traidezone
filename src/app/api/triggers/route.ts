/**
 * /api/triggers — CRUD for personal triggers
 *
 *  GET                      → list user's triggers
 *  POST  {action:'create'}  → save a new trigger (from parsed rule)
 *  POST  {action:'update'}  → edit / enable / disable
 *  POST  {action:'delete'}  → remove
 *  POST  {action:'fired'}   → increment fire count (called when a trigger fires live)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data, error } = await supabaseAdmin
      .from('personal_triggers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Map to camelCase TriggerRule shape for the client engine
    const triggers = (data || []).map(row => ({
      id:           row.id,
      name:         row.name,
      originalText: row.original_text,
      direction:    row.direction,
      conditions:   row.conditions,
      windowMins:   row.window_mins,
      confidence:   row.confidence,
      stopHint:     row.stop_hint,
      targetHint:   row.target_hint,
      enabled:      row.enabled,
      fireCount:    row.fire_count,
      lastFiredAt:  row.last_fired_at,
    }))

    return NextResponse.json({ triggers })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const action = body.action

    if (action === 'create') {
      const r = body.rule
      const { data, error } = await supabaseAdmin
        .from('personal_triggers')
        .insert({
          user_id:       userId,
          name:          r.name,
          original_text: r.originalText,
          direction:     r.direction,
          conditions:    r.conditions,
          window_mins:   r.windowMins,
          confidence:    r.confidence,
          stop_hint:     r.stopHint || null,
          target_hint:   r.targetHint || null,
          enabled:       true,
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    if (action === 'update') {
      const updates: Record<string, any> = {}
      if (body.enabled !== undefined) updates.enabled = body.enabled
      if (body.name !== undefined) updates.name = body.name
      if (body.confidence !== undefined) updates.confidence = body.confidence
      if (body.conditions !== undefined) updates.conditions = body.conditions
      if (body.windowMins !== undefined) updates.window_mins = body.windowMins
      updates.updated_at = new Date().toISOString()

      const { error } = await supabaseAdmin
        .from('personal_triggers')
        .update(updates)
        .eq('id', body.id)
        .eq('user_id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const { error } = await supabaseAdmin
        .from('personal_triggers')
        .delete()
        .eq('id', body.id)
        .eq('user_id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'fired') {
      // Increment fire count + timestamp
      const { data: existing } = await supabaseAdmin
        .from('personal_triggers')
        .select('fire_count')
        .eq('id', body.id)
        .eq('user_id', userId)
        .single()

      const { error } = await supabaseAdmin
        .from('personal_triggers')
        .update({
          fire_count: (existing?.fire_count || 0) + 1,
          last_fired_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .eq('user_id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
