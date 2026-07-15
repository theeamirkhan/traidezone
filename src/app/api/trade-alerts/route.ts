/**
 * /api/trade-alerts — CRUD for trade alert persistence
 *
 * POST /api/trade-alerts       → log a new alert
 * GET  /api/trade-alerts       → fetch alerts for this user (last 30 days)
 * PATCH /api/trade-alerts/:id  → update outcome (used by scoring agent)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

// ── POST: log a new alert ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('trade_alerts')
    .insert({
      user_id:               userId,
      signal:                body.signal,
      entry_low:             body.entryZone?.low,
      entry_high:            body.entryZone?.high,
      entry_mid:             ((body.entryZone?.low || 0) + (body.entryZone?.high || 0)) / 2,
      stop_level:            body.stopLevel != null ? Number(body.stopLevel) : null,
      target1:               body.target1 != null ? Number(body.target1) : null,
      target2:               body.target2 != null ? Number(body.target2) : null,
      price_at_signal:       body.currentPrice,
      vwap_at_signal:        body.vwap,
      ema200_at_signal:      body.ema200,
      vix_at_signal:         body.vix,
      // Integer columns — Postgres rejects floats/strings outright.
      // The AI can return confidence 62.5 or moveSize '10-15'; coerce hard.
      confidence:            Math.round(Number(body.confidence) || 0),
      move_size:             Math.round(parseFloat(String(body.moveSize ?? '').replace(/[^0-9.\-]/g, '')) || 0),
      proximity_level:       body.proximityLevel,
      proximity_breakout_pct: body.proximityBreakoutPct != null ? Math.round(Number(body.proximityBreakoutPct) || 0) : null,
      proximity_factors:     body.proximityFactors,
      ai_view:               body.ai_view,
      system_alignment:      body.system_alignment,
      system_alignment_note: body.system_alignment_note,
      wait_reason:           body.wait_reason,
      no_entry_zone:         body.no_entry_zone ?? false,
      auto_fired:            body.auto_fired ?? false,
      context_snapshot:      body.context_snapshot,
      outcome:               'PENDING',
      logged_at:             new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[trade-alerts POST]', error.message)
    // If table doesn't exist yet, return a graceful fallback
    if (error.message?.includes('does not exist')) {
      return NextResponse.json({ error: 'Table not created yet — run /api/trade-alerts/migrate first', needsMigration: true }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, logged: true })
}

// ── GET: fetch alerts for this user ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = parseInt(req.nextUrl.searchParams.get('days') || '30')
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('trade_alerts')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', cutoff)
    .order('logged_at', { ascending: false })
    .limit(200)

  if (error) {
    if (error.message?.includes('does not exist')) {
      return NextResponse.json({ alerts: [], needsMigration: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: data || [] })
}

// ── PATCH: update human trade outcome ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing alert id' }, { status: 400 })

  // Only allow updating human-side fields
  const allowed = [
    'human_took_trade', 'human_entry_price', 'human_exit_price',
    'human_outcome', 'human_pts', 'skip_reason', 'human_notes',
  ]
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  )

  const { error } = await supabaseAdmin
    .from('trade_alerts')
    .update({ ...safeUpdates, human_updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[trade-alerts] insert failed:', JSON.stringify(error))
    return NextResponse.json({ error: error.message, details: error.details ?? null, hint: error.hint ?? null, code: error.code ?? null }, { status: 500 })
  }
  return NextResponse.json({ updated: true })
}
