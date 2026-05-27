/**
 * /api/open-positions — manage live open positions during the session
 *
 *  GET                     → list open positions for user
 *  POST     { action: 'open',  ... }  → open a new position
 *  POST     { action: 'close', ... }  → close an existing position (computes P&L, writes to trades table too)
 *  POST     { action: 'update', ... } → update notes / stop / target on existing
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'open'
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    const { data, error } = await supabaseAdmin
      .from('open_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .order('opened_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ positions: data || [] })
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

    // ── OPEN a new position ──────────────────────────────────────────────
    if (action === 'open') {
      const insert = {
        user_id:           userId,
        signal_id:         body.signalId || null,
        signal_direction:  body.signalDirection,     // 'LONG' or 'SHORT'
        symbol:            body.symbol || 'SPX',
        strike:            body.strike || null,
        expiry:            body.expiry || null,
        contracts:         body.contracts || 1,
        entry_price:       body.entryPrice,          // SPX index level at entry
        entry_premium:     body.entryPremium || null, // option price (e.g. $4.50)
        stop_level:        body.stopLevel || null,
        target1:           body.target1 || null,
        target2:           body.target2 || null,
        setup_name:        body.setupName || null,
        ai_confidence:     body.aiConfidence || null,
        notes:             body.notes || null,
        context_snapshot:  body.contextSnapshot || null,
        status:            'open',
        opened_at:         new Date().toISOString(),
      }

      const { data, error } = await supabaseAdmin
        .from('open_positions')
        .insert(insert)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, position: data })
    }

    // ── CLOSE an existing position ──────────────────────────────────────
    if (action === 'close') {
      if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      // Fetch existing for P&L calc
      const { data: existing } = await supabaseAdmin
        .from('open_positions')
        .select('*')
        .eq('id', body.id)
        .eq('user_id', userId)
        .single()

      if (!existing) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

      const exitPremium = body.exitPremium
      const entryPremium = existing.entry_premium
      const contracts = existing.contracts || 1
      const multiplier = 100  // standard options multiplier

      let pnl: number | null = null
      let pnlPct: number | null = null
      if (exitPremium != null && entryPremium != null) {
        // Premium difference × contracts × 100 (option multiplier)
        pnl = (exitPremium - entryPremium) * contracts * multiplier
        pnlPct = ((exitPremium - entryPremium) / entryPremium) * 100
      }

      const update = {
        status:       'closed',
        exit_price:   body.exitPrice || null,
        exit_premium: exitPremium || null,
        exit_reason:  body.exitReason || 'manual',
        pnl:          pnl,
        pnl_pct:      pnlPct,
        closed_at:    new Date().toISOString(),
        notes:        body.notes != null ? body.notes : existing.notes,
      }

      const { error: updateErr } = await supabaseAdmin
        .from('open_positions')
        .update(update)
        .eq('id', body.id)
        .eq('user_id', userId)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Also write to legacy trades table for Journal analytics
      try {
        await supabaseAdmin.from('trades').insert({
          user_id:   userId,
          date:      new Date(existing.opened_at).toISOString().split('T')[0],
          time:      new Date(existing.opened_at).toTimeString().slice(0, 5),
          symbol:    existing.symbol,
          direction: existing.signal_direction === 'LONG' ? 'call' : 'put',
          side:      existing.signal_direction === 'LONG' ? 'long' : 'short',
          qty:       contracts,
          price:     entryPremium,
          pnl:       pnl,
          in_system: !!existing.signal_id,
          playbook:  existing.setup_name,
          notes:     body.notes || `${existing.signal_direction} ${existing.symbol} ${existing.strike || ''}${existing.strike ? (existing.signal_direction === 'LONG' ? 'C' : 'P') : ''} — ${body.exitReason || 'manual'}`,
          raw:       { source: 'open_positions', position_id: body.id, exit_price: body.exitPrice, entry_price: existing.entry_price },
        })
      } catch (e) {
        console.warn('[open-positions] failed to write to trades table:', e)
      }

      return NextResponse.json({ ok: true, pnl, pnlPct })
    }

    // ── UPDATE notes / stop / target ────────────────────────────────────
    if (action === 'update') {
      if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

      const allowedFields: Record<string, any> = {}
      if (body.notes !== undefined)      allowedFields.notes = body.notes
      if (body.stopLevel !== undefined)  allowedFields.stop_level = body.stopLevel
      if (body.target1 !== undefined)    allowedFields.target1 = body.target1
      if (body.target2 !== undefined)    allowedFields.target2 = body.target2

      const { error } = await supabaseAdmin
        .from('open_positions')
        .update(allowedFields)
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
