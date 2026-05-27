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
function isMarketHoursET(): { open: boolean; reason: string } {
  const etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const parts = etFmt.formatToParts(new Date())
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value || ''
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const min = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = weekdayMap[weekdayShort] ?? 0

  if (dow === 0 || dow === 6) return { open: false, reason: 'weekend' }

  const minutesSinceOpen = (hour - 9) * 60 + (min - 30)
  // 9:35am (5 min after open — let prices settle) to 3:55pm (5 min before close)
  if (minutesSinceOpen < 5) return { open: false, reason: 'pre-market or first 5min' }
  if (minutesSinceOpen > 385) return { open: false, reason: 'after-hours' }

  return { open: true, reason: 'market open' }
}

// ── Fetch SPX current price from Polygon ──
async function fetchCurrentSPX(): Promise<number | null> {
  try {
    const polygonKey = process.env.POLYGON_API_KEY
    if (!polygonKey) return null
    const url = `https://api.polygon.io/v2/last/trade/I:SPX?apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.results?.p || null
  } catch (e) {
    console.warn('[shadow] SPX fetch failed:', e)
    return null
  }
}

// ── Fetch recent 5min bars (for VWAP, ORB, etc) ──
async function fetchRecentBars(): Promise<any[]> {
  try {
    const polygonKey = process.env.POLYGON_API_KEY
    if (!polygonKey) return []
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${yesterday}/${today}?adjusted=true&sort=asc&limit=200&apiKey=${polygonKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data: any = await res.json()
    return data?.results || []
  } catch (e) {
    console.warn('[shadow] bars fetch failed:', e)
    return []
  }
}

// ── Compute simple regime signature (used for dedup) ──
function regimeSignature(state: any): string {
  // Hash of major components — if these haven't changed, the prediction won't change much
  const components = [
    state.priceRange,       // SPX bucket of 5pts
    state.gexRegime,        // pos/neg
    state.mechBias,         // BULL/BEAR/NEUTRAL_*
    state.dayType,          // TREND/CONSOLIDATION/INDETERMINATE
    state.actionability,    // ACTIONABLE/WATCH/NOISE
    state.vixBucket,        // VIX in 1pt buckets
    state.sessionWindow,    // open/mid/power-hour
  ].join('|')
  return simpleHash(components)
}

// ── Compute session window from time ──
function getSessionWindow(): string {
  const etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
  })
  const parts = etFmt.formatToParts(new Date())
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const min = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
  const mins = hour * 60 + min
  if (mins >= 9 * 60 + 30 && mins < 10 * 60 + 30) return 'open_drive'
  if (mins >= 10 * 60 + 30 && mins < 14 * 60 + 30)  return 'mid_session'
  if (mins >= 14 * 60 + 30 && mins < 15 * 60)       return 'pre_power'
  if (mins >= 15 * 60)                              return 'power_hour'
  return 'unknown'
}

// ── Call Claude Haiku for prediction ──
async function generateShadowPrediction(context: any): Promise<any | null> {
  if (!ANTHROPIC_KEY) return null

  const prompt = `You are an SPX intraday options trading model. Given the market state below, make a directional prediction for the next 30-90 minutes.

CURRENT STATE:
- SPX: ${context.currentSPX}
- Time: ${context.timeET} ET (${context.sessionWindow})
- VIX: ${context.vix || 'unknown'}
- Mechanical bias: ${context.mechBias || 'unknown'}
- Day type: ${context.dayType || 'unknown'} (${context.dayTypeConfidence || 'unknown'})
- Actionability: ${context.actionability || 'unknown'}
- GEX regime: ${context.gexRegime || 'unknown'}
- Cum delta: ${context.cumDelta || 'unknown'}
- TICK: ${context.tick || 'unknown'}
- 15-min trend: ${context.m15Trend || 'unknown'}
- VWAP distance: ${context.vwapDist || 'unknown'}

LEVELS:
- ORB high/low: ${context.orbHigh || '—'} / ${context.orbLow || '—'}
- PDH/PDL: ${context.pdh || '—'} / ${context.pdl || '—'}
- POC: ${context.poc || '—'}

OUTPUT: Make a directional prediction. Be honest — if there's no clear edge, say WAIT.

Return JSON only:
{
  "signal": "LONG" | "SHORT" | "WAIT",
  "confidence": 50-90,
  "predictedT1": numeric or null (SPX target),
  "predictedStop": numeric or null (SPX stop),
  "predictedT2": numeric or null,
  "reasoning": "1-2 sentence rationale citing specific data"
}

Honesty rules:
- If conditions are mixed → WAIT, not a low-confidence directional bet
- If actionability is NOISE → bias toward WAIT
- Confidence floor 50 for WAIT, 55 for LONG/SHORT, ceiling 85 (no overconfidence)
- T1 should be 5-15 SPX points away in signal direction
- Stop should be 5-10 SPX points away against signal direction`

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
    // 1. Market hours check
    const marketCheck = isMarketHoursET()
    if (!marketCheck.open) {
      return NextResponse.json({ skipped: true, reason: marketCheck.reason })
    }

    // 2. Fetch current SPX
    const currentSPX = await fetchCurrentSPX()
    if (!currentSPX) {
      return NextResponse.json({ error: 'Could not fetch SPX price' }, { status: 500 })
    }

    // 3. Fetch recent bars for context
    const bars = await fetchRecentBars()

    // 4. Compute basic state (lightweight version — full state needs more data than we can compute here)
    //    For now we compute what's tractable; rest will be added as we wire in more APIs
    const sessionWindow = getSessionWindow()
    const etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit',
    })
    const timeET = etFmt.format(new Date())

    // 5. Build state for regime signature + prediction context
    const state = {
      priceRange:     Math.floor(currentSPX / 5) * 5,
      sessionWindow,
      gexRegime:      null,
      mechBias:       null,
      dayType:        null,
      actionability:  null,
      vixBucket:      null,
    }

    // 6. Compute regime signature
    const sig = regimeSignature(state)

    // 7. Dedup check — has this user had a prediction with the same signature in the last 10 minutes?
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
      })
    }

    // 8. Build context for the AI
    const context = {
      currentSPX,
      timeET,
      sessionWindow,
      vix:             null,
      mechBias:        null,
      dayType:         null,
      dayTypeConfidence: null,
      actionability:   null,
      gexRegime:       null,
      cumDelta:        null,
      tick:            null,
      m15Trend:        null,
      vwapDist:        null,
      orbHigh:         null,
      orbLow:          null,
      pdh:             null,
      pdl:             null,
      poc:             null,
    }

    // 9. Generate the prediction
    const prediction = await generateShadowPrediction(context)
    if (!prediction) {
      return NextResponse.json({ error: 'Prediction generation failed' }, { status: 500 })
    }

    // 10. Save to shadow_predictions
    const { error: insertErr, data: inserted } = await supabaseAdmin
      .from('shadow_predictions')
      .insert({
        user_id:           ADMIN_USER_ID,
        signal_direction:  prediction.signal || 'WAIT',
        confidence:        prediction.confidence || 50,
        current_spx:       currentSPX,
        predicted_t1:      prediction.predictedT1 || null,
        predicted_stop:    prediction.predictedStop || null,
        predicted_t2:      prediction.predictedT2 || null,
        ai_view:           prediction.reasoning || null,
        context_snapshot:  context,
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
        currentSPX,
        regimeSignature: sig,
      },
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
