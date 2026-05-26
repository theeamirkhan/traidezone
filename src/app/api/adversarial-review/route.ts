/**
 * /api/adversarial-review
 *
 * Takes the current signal + market context, returns the strongest case
 * AGAINST taking this trade. Runs on Haiku for speed and cost.
 *
 * Purpose: forced opposition. If the counterargument is weak, conviction
 * grows. If it's strong, the trader reconsiders. Either way, better decisions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { signal, confidence, entryZone, stopLevel, target1, currentPrice,
            marketConditions, aiView, riskFlag, multiTFAlignment,
            mechanicalBias, asymmetricSetup, actionability, setupEval,
            dayTypeForecast, microstructure, vix, gexRegime } = body

    if (!signal || !currentPrice) {
      return NextResponse.json({ error: 'Missing signal or current price' }, { status: 400 })
    }

    const oppositeDirection = signal === 'LONG' ? 'SHORT' : signal === 'SHORT' ? 'LONG' : 'OPPOSITE DIRECTION OR WAIT'

    const prompt = `You are an adversarial risk analyst. Your ONLY job is to argue against the trade below — even if it looks compelling. Find the holes. Cite specific data.

CURRENT SIGNAL TO CHALLENGE:
${signal} at ${currentPrice}, ${confidence}% confidence
Entry zone: ${entryZone?.low}-${entryZone?.high} | Stop: ${stopLevel} | Target: ${target1}

WHAT THE AI ARGUED (the case FOR):
${aiView || marketConditions || 'No reasoning provided'}
${riskFlag ? `Risk flag they noted: ${riskFlag}` : ''}

DATA POINTS:
- Multi-TF: ${multiTFAlignment || 'unknown'}
- Mechanical bias: ${mechanicalBias || 'unknown'}
- Asymmetric setup: ${asymmetricSetup || 'unknown'}
- VIX: ${vix || 'unknown'}
- GEX regime: ${gexRegime || 'unknown'}
- Actionability: ${actionability?.verdict || 'unknown'}
- Setup eval: ${setupEval?.setup?.name || 'none'} score ${setupEval?.score || 'n/a'}/100
- Day type: ${dayTypeForecast?.dayType || 'unknown'} (${dayTypeForecast?.trendProbability || '?'}% trend / ${dayTypeForecast?.consolidationProbability || '?'}% range)
- Microstructure: ${microstructure?.summary || 'unknown'}

YOUR TASK:
Argue for ${oppositeDirection} or for staying flat. Be specific. Don't hedge. Find at least 3 concrete reasons this trade fails, citing the data above.

Output JSON only:
{
  "counterCase": "2-3 sentence summary of why this trade likely fails",
  "concerns": ["specific concern 1 with data citation", "specific concern 2", "specific concern 3"],
  "alternativeAction": "what to do instead (wait for X, take opposite, reduce size, etc)",
  "counterStrength": "WEAK | MODERATE | STRONG",
  "verdict": "PROCEED | REDUCE_SIZE | RECONSIDER | SKIP"
}

Be honest. If the counter is weak, say WEAK and PROCEED. If strong, say STRONG and SKIP. Don't manufacture concerns.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[adversarial] API error:', res.status, errText)
      return NextResponse.json({ error: `API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const text = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()

    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      // Try extracting JSON between first { and last }
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try { parsed = JSON.parse(text.substring(first, last + 1)) } catch {}
      }
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Could not parse adversarial response' }, { status: 500 })
    }

    return NextResponse.json({
      ...parsed,
      _generatedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[adversarial-review] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
