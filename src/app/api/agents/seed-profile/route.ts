/**
 * /api/agents/seed-profile — New User Onboarding
 *
 * Called on first login. Seeds the new user's trader_profile with
 * the system's proven rules, edges, and behavioral patterns so the
 * AI companion and signal engine are immediately useful from day one.
 *
 * Philosophy: win rates are personal and emerge from trading.
 * What we seed is SYSTEM KNOWLEDGE — rules, conditions, setups.
 * Personal data overwrites defaults over time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const SYSTEM_SEED = {
  // Starting guidelines — advisory, not mandatory. Trader can customize these.
  system_rules: [
    'ITM SPX options are the primary instrument for this system',
    'The first 30 minutes (9:30-10am) tend to be choppy — consider waiting for clarity',
    'VWAP and 200 EMA confluence improves signal quality significantly',
    'Define your stop before entry — VWAP or 200 EMA are natural levels',
    'Consider sizing down when VIX is above 25 — volatility cuts both ways',
    'WAIT is a valid position — not every session needs a trade',
    'If you take a loss, stepping back for 30 minutes often prevents compounding it',
  ],
  strengths: [
    'VWAP reclaim setups — price recovering above VWAP with volume confirmation',
    'EMA confluence entries — 200 EMA holding as support on pullbacks',
    'Mid-morning setups (10-11:30am) — after the open volatility settles',
    'LONG setups when TICK > +400 and cumulative delta confirms buying',
    'Trending days with consistent directional flow confirmed by options',
  ],
  weaknesses: [
    'Early morning volatility (9:30-10am) — spreads are wide and moves are whippy',
    'PUT signals when VIX is below 15 — low-vol environments tend to drift up',
    'Trading into scheduled economic releases — results are binary and unpredictable',
    'Chasing moves already extended well beyond VWAP',
    'Averaging into losing positions rather than respecting the original stop',
  ],
  patterns: [
    'Mid-morning setups (10am-11:30am) often have the best risk/reward',
    'LONG bias tends to perform better in this system than SHORT',
    'Negative gamma environments (VIX > 20) amplify moves — adjust expectations',
    'Dark pool buying at key levels suggests institutional interest',
    'Call sweeps in options flow are a strong directional confirmation signal',
    'TICK extremes above +800 or below -800 can signal exhaustion',
  ],
  edge_notes: [
    'LONG setups have historically performed better in this system than SHORT',
    'Higher quality gate scores (CONFIRMED/STRONG) correlate with better outcomes',
    'Letting winners reach T1 rather than cutting early captures more of the move',
    'When delta, options flow, and breadth all align — that is the highest-confidence setup',
  ],
  companion_context: [
    'Trader uses a rules-based SPX options intraday system — their rules, their call',
    'AI companion role: provide context and perspective, not enforce rules',
    'The trader decides what trades to take — the AI informs that decision',
    'Flag concerns and patterns, but respect that the trader has final say',
    'Help them reflect on decisions after the fact — not lecture before',
  ],
  is_seeded:     true,
  seed_version:  '1.0',
  seeded_at:     new Date().toISOString(),
  chat_learnings: [],
  session_count:  0,
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Check existing profile
    const { data: existing } = await supabaseAdmin
      .from('trader_profiles')
      .select('user_id, is_seeded, session_count')
      .eq('user_id', userId)
      .single()

    // Don't overwrite real trading data (> 3 sessions = real user)
    if (existing && !existing.is_seeded && (existing.session_count || 0) > 3) {
      return NextResponse.json({ status: 'skipped', reason: 'user has real trading data' })
    }

    const { error } = await supabaseAdmin
      .from('trader_profiles')
      .upsert({
        user_id: userId,
        ...SYSTEM_SEED,
        session_count: existing?.session_count || 0,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) throw new Error(error.message)

    return NextResponse.json({
      status:  'seeded',
      userId,
      version: SYSTEM_SEED.seed_version,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return POST(req) }
