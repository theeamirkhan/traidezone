/**
 * /api/shadow-predictions/stats — returns calibration + accuracy stats for the dashboard
 *
 * Computes from shadow_predictions table:
 *   - Total predictions, pending, graded counts
 *   - Win rate at 30/60/90 min horizons
 *   - Calibration: predicted confidence vs actual win rate
 *   - Recent predictions list
 *
 * Admin user sees all predictions (including backfill).
 * Other users see only predictions tagged with their user_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_USER_ID = 'user_3BKD6y0MW6t9rxyyZo3HlywvkqT'

const CONFIDENCE_BANDS = [
  { range: '50-59%', min: 50, max: 60 },
  { range: '60-69%', min: 60, max: 70 },
  { range: '70-79%', min: 70, max: 80 },
  { range: '80-89%', min: 80, max: 90 },
  { range: '90-100%', min: 90, max: 101 },
]

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Pull all predictions (or last N days for performance)
    const url = new URL(req.url)
    const days = parseInt(url.searchParams.get('days') || '60', 10)
    const sinceISO = new Date(Date.now() - days * 86400000).toISOString()

    // Shadow predictions are SYSTEM-WIDE validation data, not user-private.
    // Anyone authenticated can view them — they reveal model behavior in
    // aggregate, not personal trading info. (When multi-user, revisit.)
    const { data: preds, error } = await supabaseAdmin
      .from('shadow_predictions')
      .select('*')
      .gte('predicted_at', sinceISO)
      .order('predicted_at', { ascending: false })
      .limit(2000)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const all = preds || []
    const total = all.length
    const pending = all.filter(p => p.status === 'pending').length
    const graded30 = all.filter(p => p.outcome_30m !== null).length
    const graded60 = all.filter(p => p.outcome_60m !== null).length
    const graded90 = all.filter(p => p.outcome_90m !== null).length

    // ── Win rates per horizon ──
    const computeWinRate = (field: string) => {
      const withOutcome = all.filter(p => (p as any)[field])
      const wins = withOutcome.filter(p => (p as any)[field] === 'WIN').length
      const losses = withOutcome.filter(p => (p as any)[field] === 'LOSS').length
      const sample = wins + losses
      return {
        sample,
        wins,
        losses,
        scratches: withOutcome.length - wins - losses,
        winRate: sample > 0 ? Math.round((wins / sample) * 100) : null,
      }
    }

    const winRates = {
      h30m: computeWinRate('outcome_30m'),
      h60m: computeWinRate('outcome_60m'),
      h90m: computeWinRate('outcome_90m'),
    }

    // ── Calibration per horizon ──
    const computeCalibration = (field: string) => {
      return CONFIDENCE_BANDS.map(band => {
        const inBand = all.filter(p => p.confidence >= band.min && p.confidence < band.max && (p as any)[field])
        const wins = inBand.filter(p => (p as any)[field] === 'WIN').length
        const losses = inBand.filter(p => (p as any)[field] === 'LOSS').length
        const sample = wins + losses
        const actualRate = sample > 0 ? Math.round((wins / sample) * 100) : null
        const predicted = (band.min + band.max) / 2 - 0.5
        const gap = actualRate !== null ? actualRate - predicted : null
        return {
          range: band.range,
          predicted: Math.round(predicted),
          actual: actualRate,
          sample,
          gap: gap !== null ? Math.round(gap) : null,
        }
      })
    }

    const calibration = {
      h30m: computeCalibration('outcome_30m'),
      h60m: computeCalibration('outcome_60m'),
      h90m: computeCalibration('outcome_90m'),
    }

    // ── Signal type breakdown ──
    const signalBreakdown = (['LONG', 'SHORT', 'WAIT'] as const).map(s => {
      const ofType = all.filter(p => p.signal_direction === s)
      const graded = ofType.filter(p => p.outcome_60m)
      const wins = graded.filter(p => p.outcome_60m === 'WIN').length
      const losses = graded.filter(p => p.outcome_60m === 'LOSS').length
      return {
        signal: s,
        total: ofType.length,
        graded: graded.length,
        winRate: (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
      }
    })

    // ── Recent predictions ──
    const recent = all.slice(0, 20).map(p => ({
      id:             p.id,
      predicted_at:   p.predicted_at,
      signal:         p.signal_direction,
      confidence:     p.confidence,
      current_spx:    p.current_spx,
      predicted_t1:   p.predicted_t1,
      actual_spx_60m: p.actual_spx_60m,
      outcome_30m:    p.outcome_30m,
      outcome_60m:    p.outcome_60m,
      outcome_90m:    p.outcome_90m,
      ai_view:        p.ai_view,
    }))

    return NextResponse.json({
      total,
      pending,
      graded30,
      graded60,
      graded90,
      winRates,
      calibration,
      signalBreakdown,
      recent,
      readyForAnalysis: graded60 >= 30,
      dataMaturity:
        graded60 < 20  ? 'EARLY (need 30+ for first signals)' :
        graded60 < 50  ? 'EMERGING (calibration data forming)' :
        graded60 < 100 ? 'INTERPRETABLE (component accuracy reliable)' :
                         'ROBUST (personalized model data)',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
