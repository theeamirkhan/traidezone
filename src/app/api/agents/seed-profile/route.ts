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
  system_rules: [
    'ITM SPX options only — no OTM lottery tickets',
    'No trades before 10:00am ET — let the market settle first',
    'Entry requires VWAP + 200 EMA confluence — both must align',
    'Stop at VWAP loss or 200 EMA reclaim — no exceptions',
    'Size down in VIX > 25 — elevated vol means reduced position',
    'WAIT is correct more often than LONG or SHORT — patience is the edge',
    'No revenge trading after a stop — minimum 30 minute break',
  ],
  strengths: [
    'VWAP reclaim setups — price recovering above VWAP with volume confirmation',
    'EMA confluence entries — 200 EMA holding as support on pullbacks',
    'Post-10am breakouts — after morning chop resolves and direction established',
    'LONG setups when TICK > +400 and cumulative delta confirms',
    'Trending days with consistent directional flow in options',
  ],
  weaknesses: [
    'Trading before 10am — false breakouts, wide spreads, amateur hour',
    'PUT signals in low VIX (< 15) — structural market gravity is upward',
    'Trading into scheduled economic releases — binary event risk',
    'Chasing moves already extended 15+ points from VWAP',
    'Averaging into losing positions — the stop is the stop',
    'Trading when pre-trade checklist score is below 7/13',
  ],
  patterns: [
    'Best setups form between 10:00-11:30am ET after open volatility fades',
    'LONG bias is primary — system designed around call options',
    'Negative gamma (VIX > 20) amplifies moves in both directions',
    'Dark pool buying at key levels confirms institutional positioning',
    'Call sweeps in options flow are the strongest directional confirmation signal',
    'TICK extremes (> +800 or < -800) often signal exhaustion and reversal',
  ],
  edge_notes: [
    'LONG setups have higher probability than SHORT in this system',
    'Quality gate CONFIRMED/STRONG signals have meaningfully higher win rate than MARGINAL',
    'Holding to T1 is the primary execution discipline — cutting early leaks the most pts',
    'Microstructure confirmation (delta + flow + breadth aligned) = highest confidence setups',
  ],
  companion_context: [
    'Trader uses ITM SPX options — intraday day trading system',
    'Core rules: no trades before 10am ET, VWAP+EMA required, stops honored',
    'Primary goal: disciplined rule execution, not prediction',
    'Biggest risk patterns: overtrading, revenge trading, ignoring stops',
    'System has LONG bias — calls are primary instrument',
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
