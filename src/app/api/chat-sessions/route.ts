/**
 * /api/chat-sessions — Persistent AI companion chat storage
 *
 * GET  ?date=YYYY-MM-DD  — load messages for a trading date (defaults to today ET)
 * POST                   — save a message (or batch of messages)
 *
 * Schema: chat_sessions table
 *   id, user_id, trading_date, role, content, created_at, metadata
 *
 * The nightly analyze-chat agent reads these to extract:
 *   - Did you take/skip signals and why
 *   - Emotional states that preceded decisions
 *   - Market observations you made
 *   - Execution gaps vs AI signals
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') || todayET()

  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('id, role, content, created_at, metadata')
    .eq('user_id', userId)
    .eq('trading_date', date)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    // Table might not exist yet — return empty gracefully
    if (error.code === '42P01') return NextResponse.json({ messages: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: data || [], date })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const messages = Array.isArray(body) ? body : [body]
  const date = todayET()

  const rows = messages.map((m: any) => ({
    user_id:      userId,
    trading_date: date,
    role:         m.role,         // 'user' | 'assistant'
    content:      m.content,
    metadata:     m.metadata || null,  // optional: { signalActive, spxPrice, vixPrice }
  }))

  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert(rows)
    .select('id')

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: data?.length, ids: data?.map((r: any) => r.id) })
}
