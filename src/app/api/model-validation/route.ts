/**
 * /api/model-validation
 *
 * Returns model accuracy data for the validation dashboard:
 *  1. Confidence calibration — predicted vs actual win rate by confidence band
 *  2. Component accuracy — each feature's predictive accuracy independently
 *  3. Overall model health — recent accuracy, sample size, trend
 *
 * NOTE: This evaluates the MODEL's accuracy regardless of whether the user
 * executed the trade. We score every signal that fired against subsequent
 * SPX price action via the score-alerts cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

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
    // Pull all scored alerts (signals that have outcome set)
    const { data: alerts, error } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, confidence, outcome, outcome_normalized, ai_view, system_alignment, context_snapshot, vix_at_signal, logged_at, pts_to_t1')
      .eq('user_id', userId)
      .neq('outcome', 'PENDING')
      .order('logged_at', { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({
        ready: false,
        message: 'No scored signals yet — system needs to score signals via cron first',
        totalSignals: 0,
      })
    }

    // ── Helper: classify outcome as WIN / LOSS / SCRATCH ─────────────────
    const classify = (a: any): 'WIN' | 'LOSS' | 'SCRATCH' | null => {
      if (a.outcome_normalized) return a.outcome_normalized
      if (['HIT_T1', 'HIT_T2'].includes(a.outcome)) return 'WIN'
      if (a.outcome === 'STOPPED_OUT') return 'LOSS'
      if (['PARTIAL', 'EXPIRED'].includes(a.outcome)) return 'SCRATCH'
      return null
    }

    const scored = alerts.filter(a => classify(a) !== null).map(a => ({ ...a, _class: classify(a) }))
    const wins = scored.filter(a => a._class === 'WIN').length
    const losses = scored.filter(a => a._class === 'LOSS').length
    const scratch = scored.filter(a => a._class === 'SCRATCH').length
    const total = scored.length
    const winRate = total > 0 ? Math.round((wins / (wins + losses)) * 100) : 0

    // ── 1. CONFIDENCE CALIBRATION ────────────────────────────────────────
    const calibration = CONFIDENCE_BANDS.map(band => {
      const inBand = scored.filter(a => {
        const conf = parseFloat(a.confidence || '0')
        return conf >= band.min && conf < band.max
      })
      const bandWins = inBand.filter(a => a._class === 'WIN').length
      const bandLosses = inBand.filter(a => a._class === 'LOSS').length
      const sample = bandWins + bandLosses
      const actualRate = sample > 0 ? Math.round((bandWins / sample) * 100) : null
      const predictedRate = (band.min + band.max) / 2 - 0.5  // midpoint
      const calibrationGap = actualRate !== null ? actualRate - predictedRate : null
      return {
        range: band.range,
        predictedRate: Math.round(predictedRate),
        actualRate,
        sample,
        calibrationGap: calibrationGap !== null ? Math.round(calibrationGap) : null,
        verdict: calibrationGap === null ? 'no data' :
                 Math.abs(calibrationGap) <= 5 ? 'well-calibrated' :
                 calibrationGap > 5 ? 'under-confident (better than claimed)' :
                 'over-confident (worse than claimed)',
      }
    })

    // Overall calibration health
    const bandsWithData = calibration.filter(b => b.actualRate !== null)
    const avgGap = bandsWithData.length > 0
      ? Math.round(bandsWithData.reduce((sum, b) => sum + Math.abs(b.calibrationGap || 0), 0) / bandsWithData.length)
      : null
    const calibrationHealth = avgGap === null ? 'NO_DATA' :
                              avgGap <= 5 ? 'EXCELLENT' :
                              avgGap <= 10 ? 'GOOD' :
                              avgGap <= 15 ? 'FAIR' : 'POOR'

    // ── 2. COMPONENT ACCURACY ─────────────────────────────────────────────
    // Each "voter" in the signal — does it actually predict wins?
    const componentAccuracy = (() => {
      const components: Record<string, { wins: number; losses: number; total: number; predictions: number }> = {}

      const trackComponent = (name: string, predictedDirection: 'LONG' | 'SHORT' | null, actualSignal: string, won: boolean) => {
        if (!predictedDirection) return
        if (!components[name]) components[name] = { wins: 0, losses: 0, total: 0, predictions: 0 }
        const directionMatches = (predictedDirection === 'LONG' && actualSignal === 'LONG') ||
                                  (predictedDirection === 'SHORT' && actualSignal === 'SHORT')
        if (!directionMatches) return  // component didn't agree with this signal
        components[name].predictions++
        components[name].total++
        if (won) components[name].wins++
        else components[name].losses++
      }

      scored.forEach(a => {
        if (a._class === 'SCRATCH') return
        const won = a._class === 'WIN'
        const signal = (a.signal || '').toUpperCase()
        let ctx: any = {}
        try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}

        // Each component's direction prediction
        if (ctx.mechanicalBias) {
          const dir = ctx.mechanicalBias.includes('BULL') ? 'LONG' as const :
                      ctx.mechanicalBias.includes('BEAR') ? 'SHORT' as const : null
          trackComponent('Mechanical Bias', dir, signal, won)
        }
        if (ctx.asymmetricSetup) {
          const dir = ctx.asymmetricSetup.startsWith('BULLISH') ? 'LONG' as const :
                      ctx.asymmetricSetup.startsWith('BEARISH') ? 'SHORT' as const : null
          trackComponent('Asymmetric Setup', dir, signal, won)
        }
        if (ctx.dayDirectionalLean) {
          const dir = ctx.dayDirectionalLean === 'LONG' ? 'LONG' as const :
                      ctx.dayDirectionalLean === 'SHORT' ? 'SHORT' as const : null
          trackComponent('Day Type Lean', dir, signal, won)
        }
        if (ctx.optionsBias || ctx.flowBias) {
          const flow = ctx.optionsBias || ctx.flowBias
          const dir = (flow || '').includes('CALL') ? 'LONG' as const :
                      (flow || '').includes('PUT') ? 'SHORT' as const : null
          trackComponent('Options Flow', dir, signal, won)
        }
        if (ctx.deltaBias) {
          const dir = (ctx.deltaBias || '').includes('BUY') ? 'LONG' as const :
                      (ctx.deltaBias || '').includes('SELL') ? 'SHORT' as const : null
          trackComponent('Cumulative Delta', dir, signal, won)
        }
        if (a.system_alignment) {
          trackComponent('System Alignment (plan match)', signal as any, signal, won)
        }
        if (ctx.setupAlignsWithDayType !== undefined && ctx.setupAlignsWithDayType !== null) {
          if (ctx.setupAlignsWithDayType) {
            trackComponent('Setup × Day Type Match', signal as any, signal, won)
          }
        }
        // Actionability gate predictiveness
        if (ctx.actionabilityVerdict === 'ACTIONABLE') {
          trackComponent('Actionability ACTIONABLE', signal as any, signal, won)
        }
        // High setup score predictiveness
        if (ctx.setupScore !== null && ctx.setupScore !== undefined) {
          if (ctx.setupScore >= 70) trackComponent('Setup Score ≥70', signal as any, signal, won)
        }
      })

      return Object.entries(components)
        .filter(([_, d]) => d.total >= 3)
        .map(([name, d]) => ({
          component: name,
          accuracy: Math.round((d.wins / d.total) * 100),
          sample: d.total,
          edgeOverBaseline: Math.round((d.wins / d.total) * 100 - 50),  // edge over 50% coin flip
          verdict: d.wins / d.total >= 0.6 ? 'STRONG' :
                   d.wins / d.total >= 0.52 ? 'EDGE' :
                   d.wins / d.total >= 0.45 ? 'NEUTRAL' : 'INVERSE',
        }))
        .sort((a, b) => b.accuracy - a.accuracy)
    })()

    // ── 3. MODEL HEALTH OVER TIME ─────────────────────────────────────────
    const recentScored = scored.filter(a => {
      const ageMs = Date.now() - new Date(a.logged_at).getTime()
      return ageMs < 7 * 24 * 60 * 60 * 1000  // last 7 days
    })
    const recentWins = recentScored.filter(a => a._class === 'WIN').length
    const recentLosses = recentScored.filter(a => a._class === 'LOSS').length
    const recentWinRate = (recentWins + recentLosses) > 0
      ? Math.round((recentWins / (recentWins + recentLosses)) * 100)
      : null

    // Trend: last 7 days vs prior 7 days
    const priorScored = scored.filter(a => {
      const ageMs = Date.now() - new Date(a.logged_at).getTime()
      return ageMs >= 7 * 24 * 60 * 60 * 1000 && ageMs < 14 * 24 * 60 * 60 * 1000
    })
    const priorWins = priorScored.filter(a => a._class === 'WIN').length
    const priorLosses = priorScored.filter(a => a._class === 'LOSS').length
    const priorWinRate = (priorWins + priorLosses) > 0
      ? Math.round((priorWins / (priorWins + priorLosses)) * 100)
      : null
    const trendDelta = (recentWinRate !== null && priorWinRate !== null)
      ? recentWinRate - priorWinRate
      : null

    // ── 4. SIGNAL TYPE ACCURACY (LONG vs SHORT vs WAIT) ───────────────────
    const signalTypeAccuracy = (['LONG', 'SHORT', 'WAIT', 'NO TRADE'] as const).map(s => {
      const ofType = scored.filter(a => (a.signal || '').toUpperCase() === s)
      const w = ofType.filter(a => a._class === 'WIN').length
      const l = ofType.filter(a => a._class === 'LOSS').length
      const sample = w + l
      return {
        signal: s,
        winRate: sample > 0 ? Math.round((w / sample) * 100) : null,
        sample,
        total: ofType.length,
      }
    }).filter(s => s.total > 0)

    return NextResponse.json({
      ready: total >= 5,
      message: total < 10
        ? `${total} signals scored — need 20+ for reliable model validation`
        : total < 20
        ? `${total} signals scored — calibration improves at 30+`
        : `Good dataset: ${total} signals scored across confidence bands`,
      summary: {
        totalSignals: total,
        wins, losses, scratch,
        winRate,
        recentWinRate,
        priorWinRate,
        trendDelta,
      },
      calibration: {
        bands: calibration,
        avgGap,
        health: calibrationHealth,
        interpretation: calibrationHealth === 'EXCELLENT'
          ? 'Model confidence accurately predicts outcomes. Trust the confidence scores.'
          : calibrationHealth === 'GOOD'
          ? 'Model is well-calibrated overall with minor band drift. Small adjustments may help.'
          : calibrationHealth === 'FAIR'
          ? 'Confidence scores need calibration — some bands diverge from actual rates.'
          : calibrationHealth === 'POOR'
          ? 'Confidence scores are unreliable. Major calibration issue — investigate prompt or feature weights.'
          : 'Insufficient data to assess calibration',
      },
      componentAccuracy,
      signalTypeAccuracy,
      lastScoredAt: scored[0]?.logged_at || null,
    })
  } catch (e: any) {
    console.error('[model-validation] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
