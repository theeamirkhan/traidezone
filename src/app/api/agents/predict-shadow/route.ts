/**
 * /api/agents/predict-shadow — Shadow Prediction Agent
 *
 * Runs every 5 minutes during market hours (9:35am-3:55pm ET).
 * Captures the model's current view + makes a directional prediction.
 * NOT shown to the trader — purely for accumulating labeled training data.
 *
 * Dedup logic: only saves a new prediction if regime_signature has
 * meaningfully changed since the last one (within 10min window). This
 * prevents 78 correlated "LONG" predictions in a row.
 *
 * Cron: '*\/5 14-20 * * 1-5' (every 5min during 14:00-20:55 UTC = 10:00am-4:55pm ET in EST,
 * or 9:00am-3:55pm ET in EDT — covers both DST states)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildMarketState } from '../../../lib/buildMarketState'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ADMIN_USER_ID = 'user_3BKD6y0MW6t9rxyyZo3HlywvkqT'  // primary user receiving shadow predictions

// Simple deterministic hash without requiring 'crypto' types
function simpleHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

// ── Cron auth ──
function isAuthorized(req: NextRequest): boolean {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const url = new URL(req.url)
  const isManualBypass = url.searchParams.get('cron') === '1'
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || ''
  const isFromApp = origin.includes('traidezone') || origin.includes('localhost')
  return isVercelCron || isCronSecret || isManualBypass || isFromApp
}

// ── ET market-hours check ──
function isMarketHoursET(): { open: boolean; reason: string; debug?: any } {
  const etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const parts = etFmt.formatToParts(new Date())
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value || ''
  let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const min = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = weekdayMap[weekdayShort] ?? 0

  // Intl en-US returns "24" for midnight when hour12:false — normalize
  if (hour === 24) hour = 0

  const debug = { weekdayShort, dow, hour, min, rawParts: etFmt.format(new Date()) }

  if (dow === 0 || dow === 6) return { open: false, reason: 'weekend', debug }

  const minutesSinceOpen = (hour - 9) * 60 + (min - 30)
  // 9:30am to 4:00pm = 0 to 390 min. We allow 9:30am-3:55pm (5min before close) = 0-385.
  // Use >= 0 to capture 9:30 onwards, NOT > 5 (that was too strict and unnecessary)
  if (minutesSinceOpen < 0) return { open: false, reason: 'pre-market', debug }
  if (minutesSinceOpen > 385) return { open: false, reason: 'after-hours', debug }

  return { open: true, reason: 'market open', debug }
}

// ── Call Claude Haiku for prediction ──
async function generateShadowPrediction(context: any): Promise<any | null> {
  if (!ANTHROPIC_KEY) return null

  const prompt = `You are an SPX intraday options trading model. Given the full market state below, make a directional prediction for the next 30-90 minutes.

CURRENT STATE:
- SPX: ${context.currentSPX}
- Time: ${context.timeET} ET (${context.sessionWindow})
- VIX: ${context.vix || 'unknown'}${context.vixChange ? ` (${context.vixChange > 0 ? '+' : ''}${context.vixChange.toFixed(1)}%)` : ''}

MECHANICAL FLOW:
- Bias: ${context.mechBias || 'unknown'}
- Candidate direction: ${context.candidateSignal || 'unknown'}
- Asymmetric setup: ${context.mechAsymmetric || 'none'}
- Narrative: ${context.mechNarrative || 'none'}

DAY TYPE REGIME:
- Type: ${context.dayType || 'unknown'} (confidence: ${context.dayTypeConfidence || 'unknown'})
- TREND probability: ${context.dayTrendProb || '?'}%
- CONSOLIDATION probability: ${context.dayRangeProb || '?'}%
- Directional lean: ${context.dayDirectionalLean || 'neutral'}

ACTIONABILITY GATE:
- Verdict: ${context.actionability || 'unknown'}
- Rationale: ${context.actionabilityRationale || 'none'}

GAMMA & FLOW:
- GEX regime: ${context.gexRegime || 'unknown'}
- Net GEX: ${context.netGex ? `$${(context.netGex / 1e9).toFixed(1)}B` : 'unknown'}
- Gamma flip: ${context.gammaFlip || 'unknown'}
- Call wall: ${context.callWall || 'unknown'} | Put wall: ${context.putWall || 'unknown'}

MICROSTRUCTURE:
- Cum delta: ${context.cumDelta} (${context.cumDeltaTrend})
- 15-min trend: ${context.m15Trend || 'unknown'}

LEVELS:
- VWAP: ${context.vwap?.toFixed(2) || '?'} (distance: ${context.vwapDist || '?'})
- POC / VAH / VAL: ${context.poc || '?'} / ${context.vah || '?'} / ${context.val || '?'}
- ORB high/low: ${context.orbHigh || '?'} / ${context.orbLow || '?'}
- PDH/PDL: ${context.pdh || '?'} / ${context.pdl || '?'}
- Intraday high/low: ${context.intradayHigh || '?'} / ${context.intradayLow || '?'}

OUTPUT: Make a directional prediction for the next 30-90 minutes. Be honest — if there's no clear edge, say WAIT.

Return JSON only:
{
  "signal": "LONG" | "SHORT" | "WAIT",
  "confidence": 50-85,
  "predictedT1": numeric or null (SPX target, 5-15 points away in signal direction),
  "predictedStop": numeric or null (SPX stop, 5-10 points away against signal),
  "predictedT2": numeric or null (extended target),
  "reasoning": "1-2 sentence rationale citing the specific data above"
}

CRITICAL HONESTY RULES:
1. If actionability is NOISE → must be WAIT
2. If mechanical bias contradicts day type lean → bias toward WAIT
3. If conditions are mixed → WAIT, not a low-conviction LONG/SHORT
4. Confidence floor 50 (no point predicting if <50%), ceiling 85 (no overconfidence)
5. Cite SPECIFIC data points in reasoning (e.g. "POC at 5847 below price, GEX positive amplifies upside")
6. Match day type forecast — TREND day favors directional plays, CONSOLIDATION favors mean-revert`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.error('[shadow] Anthropic API error:', res.status)
      return null
    }

    const data = await res.json()
    const text = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()

    try {
      return JSON.parse(text)
    } catch {
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try { return JSON.parse(text.substring(first, last + 1)) } catch { return null }
      }
      return null
    }
  } catch (e) {
    console.error('[shadow] prediction failed:', e)
    return null
  }
}

// ── Main handler ──
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Market hours check (bypassable with ?debug=1 for diagnostics —
    //    lets us see the real prediction path error after market close)
    const debugBypass = new URL(req.url).searchParams.get('debug') === '1'
    const marketCheck = isMarketHoursET()
    if (!marketCheck.open && !debugBypass) {
      return NextResponse.json({ skipped: true, reason: marketCheck.reason, debug: marketCheck.debug })
    }

    // 2. Build full market state (parallel-fetches all data + runs all computations)
    const state = await buildMarketState()

    if (!state.currentSPX) {
      return NextResponse.json({ error: 'Could not fetch SPX', errors: state.errors }, { status: 500 })
    }

    // 3. Build regime signature for dedup
    //    Hash of the components that materially affect a prediction
    const sigComponents = [
      Math.floor(state.currentSPX / 5) * 5,                        // SPX bucket (5pts)
      state.sessionWindow,
      state.gexRegime || 'unk',
      state.mechanicalFlow?.mechanicalBias || 'unk',
      state.dayTypeForecast?.dayType || 'unk',
      state.actionability?.verdict || 'unk',
      state.vix ? Math.floor(state.vix) : 'unk',
      state.cumDelta,
      state.m15Trend || 'unk',
    ].join('|')
    const sig = simpleHash(sigComponents)

    // 4. Dedup check
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recent } = await supabaseAdmin
      .from('shadow_predictions')
      .select('id, regime_signature, predicted_at')
      .eq('user_id', ADMIN_USER_ID)
      .gte('predicted_at', tenMinAgo)
      .order('predicted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent && recent.regime_signature === sig) {
      return NextResponse.json({
        skipped: true,
        reason: 'regime unchanged from last prediction',
        last_predicted_at: recent.predicted_at,
        signature: sig,
      })
    }

    // 5. Build rich context for the AI prediction
    const context = {
      currentSPX:        state.currentSPX,
      timeET:            state.timeET,
      sessionWindow:     state.sessionWindow,
      vix:               state.vix,
      vixChange:         state.vixChange,
      mechBias:          state.mechanicalFlow?.mechanicalBias || null,
      mechAsymmetric:    state.mechanicalFlow?.asymmetricSetup || null,
      mechNarrative:     state.mechanicalFlow?.aiContext || null,
      candidateSignal:   state.candidateSignal,  // direction mech bias suggests
      dayType:           state.dayTypeForecast?.dayType || null,
      dayTypeConfidence: state.dayTypeForecast?.confidence || null,
      dayTrendProb:      state.dayTypeForecast?.trendProbability || null,
      dayRangeProb:      state.dayTypeForecast?.consolidationProbability || null,
      dayDirectionalLean: state.dayTypeForecast?.directionalLean || null,
      actionability:     state.actionability?.verdict || null,
      actionabilityRationale: state.actionability?.reasoning || null,
      gexRegime:         state.gexRegime,
      netGex:            state.netGex,
      gammaFlip:         state.gammaFlip,
      callWall:          state.callWall,
      putWall:           state.putWall,
      cumDelta:          state.cumDelta,
      cumDeltaTrend:     state.cumDeltaTrend,
      m15Trend:          state.m15Trend,
      vwap:              state.vwap,
      vwapDist:          state.vwap ? (state.currentSPX - state.vwap).toFixed(2) : null,
      orbHigh:           state.orbHigh,
      orbLow:            state.orbLow,
      pdh:               state.pdh,
      pdl:               state.pdl,
      poc:               state.volumeProfile?.poc || null,
      vah:               state.volumeProfile?.vah || null,
      val:               state.volumeProfile?.val || null,
      intradayHigh:      state.intradayHigh,
      intradayLow:       state.intradayLow,
    }

    // 6. Generate prediction
    const prediction = await generateShadowPrediction(context)
    if (!prediction) {
      return NextResponse.json({ error: 'Prediction generation failed', errors: state.errors }, { status: 500 })
    }

    // 7. Save to shadow_predictions with FULL context (not the lightweight version)
    const { error: insertErr, data: inserted } = await supabaseAdmin
      .from('shadow_predictions')
      .insert({
        user_id:           ADMIN_USER_ID,
        signal_direction:  prediction.signal || 'WAIT',
        confidence:        prediction.confidence || 50,
        current_spx:       state.currentSPX,
        predicted_t1:      prediction.predictedT1 || null,
        predicted_stop:    prediction.predictedStop || null,
        predicted_t2:      prediction.predictedT2 || null,
        ai_view:           prediction.reasoning || null,
        context_snapshot:  context,  // rich context now
        regime_signature:  sig,
        status:            'pending',
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[shadow] insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      prediction: {
        id: inserted?.id,
        signal: prediction.signal,
        confidence: prediction.confidence,
        currentSPX: state.currentSPX,
        regimeSignature: sig,
        components: {
          mechBias:      context.mechBias,
          dayType:       context.dayType,
          actionability: context.actionability,
          gexRegime:     context.gexRegime,
        },
      },
      stateErrors: state.errors.length > 0 ? state.errors : undefined,
    })
  } catch (e: any) {
    console.error('[shadow] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Cron sends GET — also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req)
}
