/**
 * /api/triggers/overlay — the LLM context overlay for a fired trigger.
 *
 * When a personal trigger's chain completes, the cockpit calls this with
 * the trigger details + a snapshot of ALL current market context. The LLM
 * evaluates whether the broader picture CONFIRMS, cautions, or CONFLICTS
 * with the trader's setup — and returns its own conviction score so we can
 * track personal-setup vs AI-context attribution over time.
 *
 * This is the "desk analyst" layer: the trader's setup is never missed
 * (deterministic detection) and never traded blind (this overlay).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  try {
    const body = await req.json()
    const { trigger, context } = body
    if (!trigger || !context) {
      return NextResponse.json({ error: 'Missing trigger or context' }, { status: 400 })
    }

    const prompt = `You are the desk analyst on an SPX intraday options desk. The trader has a PRE-DEFINED personal setup that just triggered. Your job is NOT to second-guess whether their setup is valid — it is. Your job is to overlay the BROADER MARKET CONTEXT and tell them whether right now is a good moment to take it, or whether something in the wider picture is a red flag.

THE TRADER'S SETUP THAT JUST FIRED:
- Name: ${trigger.name}
- Direction: ${trigger.direction}
- Their conviction: ${trigger.confidence}%
- Conditions that completed: ${(trigger.firedConditions || []).map((c: any) => c.detail).join(' → ')}
- Their stop plan: ${trigger.stopHint || 'not specified'}

CURRENT FULL MARKET CONTEXT:
- SPX: ${context.currentSPX}
- Time: ${context.timeET} ET (${context.sessionWindow || 'session'})
- VIX: ${context.vix ?? 'unknown'}${context.vixChange ? ` (${context.vixChange > 0 ? '+' : ''}${context.vixChange}%)` : ''}
- VWAP: ${context.vwap ?? '?'} (price is ${context.currentSPX > (context.vwap || 0) ? 'above' : 'below'})
- Mechanical flow bias: ${context.mechBias ?? 'unknown'}
- Day type: ${context.dayType ?? 'unknown'} ${context.dayTypeConfidence ? `(${context.dayTypeConfidence})` : ''}
- Day directional lean: ${context.dayDirectionalLean ?? 'neutral'}
- GEX regime: ${context.gexRegime ?? 'unknown'} | Gamma flip: ${context.gammaFlip ?? '?'}
- Call wall / Put wall: ${context.callWall ?? '?'} / ${context.putWall ?? '?'}
- Cum delta: ${context.cumDelta ?? 'unknown'}
- 15-min trend: ${context.m15Trend ?? 'unknown'}
- Breadth: ${context.breadth ?? 'unknown'}
- Scheduled news within 30min: ${context.newsSoon ? `YES — ${context.newsSoon}` : 'none flagged'}
- Earnings/events today: ${context.earningsToday ?? 'none flagged'}
${context.regimeMemory ? `
${context.regimeMemory}
` : ''}
YOUR TASK:
Decide whether the broader context CONFIRMS, cautions, or CONFLICTS with the trader's ${trigger.direction} setup.

- CONFIRM: the wider picture aligns. Mechanical flow, day type, breadth, gamma all support (or at least don't oppose) this direction. No imminent news risk.
- CAUTION: the setup is valid but there are yellow flags — elevated VIX, mixed breadth, approaching a gamma wall, mid-session chop window, etc. Tradeable but size down or be nimble.
- CONFLICT: the broader context actively opposes this trade. Examples: mechanical flow strongly opposite, scheduled high-impact news in minutes, price about to slam into a major wall, day type says consolidation while this is a breakout bet.

Return ONLY JSON:
{
  "verdict": "CONFIRM" | "CAUTION" | "CONFLICT",
  "aiConfidence": 0-100,
  "agreement": "AGREE" | "PARTIAL" | "DISAGREE",
  "reasoning": "2-3 sentences. Lead with the verdict logic. Cite specific context. Speak directly to the trader.",
  "conflictFactors": [ { "factor": "short label", "note": "why it matters" } ]
}

RULES:
- aiConfidence is YOUR conviction in this direction given full context (separate from the trader's ${trigger.confidence}% setup conviction).
- agreement: AGREE if your verdict is CONFIRM and your direction matches; PARTIAL if CAUTION; DISAGREE if CONFLICT.
- Always include at least one conflictFactor for CAUTION/CONFLICT (empty array OK for clean CONFIRM).
- Be direct and specific. The trader is experienced — no hand-holding, just the read.
- Never tell them they can't trade their own setup. Give them the context and let them decide.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return NextResponse.json({ error: `AI error ${res.status}` }, { status: 500 })

    const data = await res.json()
    const raw = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const first = raw.indexOf('{'); const last = raw.lastIndexOf('}')
      if (first >= 0 && last > first) parsed = JSON.parse(raw.substring(first, last + 1))
      else return NextResponse.json({ error: 'Parse failed', raw }, { status: 500 })
    }

    const verdict = ['CONFIRM', 'CAUTION', 'CONFLICT'].includes(parsed.verdict) ? parsed.verdict : 'CAUTION'
    const agreement = verdict === 'CONFIRM' ? 'AGREE' : verdict === 'CAUTION' ? 'PARTIAL' : 'DISAGREE'

    return NextResponse.json({
      ok: true,
      verdict,
      aiConfidence: Math.min(100, Math.max(0, parsed.aiConfidence ?? 50)),
      agreement,
      reasoning: parsed.reasoning || '',
      conflictFactors: Array.isArray(parsed.conflictFactors) ? parsed.conflictFactors : [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
