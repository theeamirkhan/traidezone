/**
 * /api/triggers/parse — converts plain-English trigger description into
 * a structured TriggerRule using Claude Sonnet.
 *
 * This runs ONCE when the user saves a trigger, NOT on every tick.
 * The deterministic engine evaluates the parsed rule live.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const PRIMITIVE_REFERENCE = `
Available primitives (use these exact ids):
- vwap_hold_above: price above VWAP and holding after testing it from above
- vwap_reclaim: price crossed back above VWAP from below
- vwap_hold_below: price below VWAP and holding (for shorts)
- pdh_break_hold: broke above prior day high and holding above
- pdl_break_hold: broke below prior day low and holding below
- prev_close_reclaim: price above yesterday's closing price ("above yesterday's close")
- orb_break_up: broke above opening range (first 15min) high
- orb_break_down: broke below opening range low
- ema200_reclaim: reclaimed the 200 EMA (5min) from below
- ema200_above: currently above 200 EMA (state)
- ema90_below: below the 90 EMA (warning/exit condition)
- tick_above: NYSE TICK above a threshold (default +600), set "threshold"
- tick_below: NYSE TICK below a threshold (default -600), set "threshold"
- after_time: after a time of day, set "minutesSinceOpen" (30 = 10:00am, 60 = 10:30am, 0 = 9:30am open)
- before_time: before a time of day, set "minutesSinceOpen"

mode field:
- "sequential": this condition is part of an ordered chain that builds over time (e.g. "hold THEN reclaim"). Sequential conditions must fire in the order listed within the window.
- "state": this condition just needs to be true at the moment of firing (e.g. "after 10am", "TICK above 600", "above 200 EMA").

Time gates (after_time/before_time) are almost always "state".
Hold/reclaim/break events that build a setup are usually "sequential".
`

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  try {
    const body = await req.json()
    const text = (body.text || '').trim()
    if (!text) return NextResponse.json({ error: 'No trigger text provided' }, { status: 400 })

    const prompt = `You are parsing a day trader's plain-English description of an SPX trade trigger into a structured rule.

${PRIMITIVE_REFERENCE}

TRADER'S TRIGGER DESCRIPTION:
"${text}"

Parse this into a JSON trigger rule. Return ONLY valid JSON, no preamble:
{
  "name": "short descriptive name (3-6 words)",
  "direction": "LONG" | "SHORT",
  "conditions": [
    { "primitive": "<id>", "mode": "sequential"|"state", "threshold": <number if TICK>, "minutesSinceOpen": <number if time gate> }
  ],
  "windowMins": <how many minutes the sequential chain has to complete, default 45>,
  "confidence": <50-85, the trader's conviction level for this setup; default 70>,
  "stopHint": "<where they'd put their stop, e.g. 'VWAP' or '200 EMA' or '8 points'>",
  "targetHint": "<their target if mentioned, else null>"
}

PARSING RULES:
1. Identify the direction (LONG for bullish setups, SHORT for bearish).
2. Break the description into discrete conditions, each mapping to ONE primitive.
3. Mark time gates ("after 10am") and threshold checks ("TICK above 600") as "state".
4. Mark sequential events ("hold then break", "reclaim and hold") as "sequential" in the order described.
5. "above yesterday's close" / "take above prev close" → prev_close_reclaim.
6. If the trader says "I'm already leaning bullish" that's context, not a condition — skip it.
7. windowMins: how long they'd wait for the whole setup to complete. Default 45 if unclear.
8. confidence: infer from language. "that's my trigger, I'm going" = high (75-80). Tentative = lower.
9. Extract stop location into stopHint.

EXAMPLE:
Input: "after 10am if I see a VWAP hold and then we take above yesterday's close that's my trigger, stop at VWAP"
Output:
{
  "name": "Morning VWAP hold + prev close break",
  "direction": "LONG",
  "conditions": [
    { "primitive": "after_time", "mode": "state", "minutesSinceOpen": 30 },
    { "primitive": "vwap_hold_above", "mode": "sequential" },
    { "primitive": "prev_close_reclaim", "mode": "sequential" }
  ],
  "windowMins": 45,
  "confidence": 78,
  "stopHint": "VWAP",
  "targetHint": null
}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `AI error ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const raw = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const first = raw.indexOf('{')
      const last = raw.lastIndexOf('}')
      if (first >= 0 && last > first) {
        parsed = JSON.parse(raw.substring(first, last + 1))
      } else {
        return NextResponse.json({ error: 'Could not parse AI response', raw }, { status: 500 })
      }
    }

    // Validate + sanitize
    const VALID_PRIMITIVES = [
      'vwap_hold_above', 'vwap_reclaim', 'vwap_hold_below',
      'pdh_break_hold', 'pdl_break_hold', 'prev_close_reclaim',
      'orb_break_up', 'orb_break_down',
      'ema200_reclaim', 'ema200_above', 'ema90_below',
      'tick_above', 'tick_below', 'after_time', 'before_time',
    ]
    const conditions = (parsed.conditions || []).filter((c: any) => VALID_PRIMITIVES.includes(c.primitive))
    if (conditions.length === 0) {
      return NextResponse.json({
        error: 'No recognizable conditions found. Try describing your setup using levels like VWAP, PDH, ORB, 200 EMA, TICK, or time of day.',
        raw,
      }, { status: 422 })
    }

    const rule = {
      name:         parsed.name || 'Custom trigger',
      direction:    parsed.direction === 'SHORT' ? 'SHORT' : 'LONG',
      conditions,
      windowMins:   Math.min(120, Math.max(5, parsed.windowMins || 45)),
      confidence:   Math.min(85, Math.max(50, parsed.confidence || 70)),
      stopHint:     parsed.stopHint || null,
      targetHint:   parsed.targetHint || null,
      originalText: text,
    }

    return NextResponse.json({ ok: true, rule })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
