/**
 * /api/agents/edge-discovery — AI-powered edge pattern finder
 *
 * Takes the full backtest result set and asks Claude to:
 *  1. Identify which combinations of conditions predict positive outcomes
 *  2. Find conditions that should be avoided
 *  3. Suggest specific rules that would improve the signal logic
 *  4. Compare AI signal edge vs your perceived edge
 *
 * Returns structured insights the companion can reference.
 * Cached in Supabase — re-runs when new backtest data is available.
 */

import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

async function runBacktest(origin: string, days: number) {
  const res  = await fetch(`${origin}/api/agents/backtest?days=${days}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}` },
    signal: AbortSignal.timeout(45000),
  })
  return res.json()
}

async function analyzeWithClaude(results: any[], summary: any): Promise<string> {
  const signaled = results.filter(r => r.signal !== 'WAIT')

  // Build a compact feature matrix for Claude
  const matrix = signaled.map(r => ({
    date:      r.date,
    dow:       r.dayOfWeek?.substring(0, 3),
    signal:    r.signal,
    outcome:   r.outcome,
    pts:       r.ptsToT1,
    vix:       r.vix?.toFixed(1),
    vixBucket: r.vix < 14 ? 'low' : r.vix < 20 ? 'normal' : r.vix < 28 ? 'elevated' : 'high',
    vwap:      r.vwapPos,
    ema:       r.emaPos,
    gap:       r.gapPts > 8 ? 'large_up' : r.gapPts > 3 ? 'small_up' : r.gapPts < -8 ? 'large_dn' : r.gapPts < -3 ? 'small_dn' : 'flat',
    time:      r.entryTime,
    mins:      r.outcomeMinutes,
  }))

  const prompt = `You are a quantitative trading analyst. Analyze this SPX intraday signal backtest data and identify the real edge — where the system actually works vs where it doesn't.

SYSTEM RULES APPLIED:
- Entry only after 10:00 AM ET
- LONG = price above both VWAP and 200 EMA
- SHORT = price below both VWAP and 200 EMA  
- Target 1: +10pts (scalp), Target 2: +25pts, Stop: -8pts
- 90 minute window
- Note: options flow NOT available historically (defaults NEUTRAL)

OVERALL STATS:
${JSON.stringify(summary, null, 2)}

SIGNAL DATA (${matrix.length} signals):
${JSON.stringify(matrix, null, 2)}

Analyze this data and provide:

1. STRONGEST EDGE CONDITIONS: Which specific combinations of conditions (VIX regime + day + gap + signal direction) show win rates above 50%? List each with sample size and win rate.

2. AVOID CONDITIONS: Which conditions consistently lose? Be specific.

3. KEY FINDING: What is the single most important pattern in this data that the trader is likely NOT aware of?

4. IMPROVED RULES: Based purely on this data, what 2-3 specific rule modifications would increase the win rate? (e.g., "Only take LONG signals when VIX < 20 and gap is flat or up")

5. AI EDGE ASSESSMENT: Given the limitations (no flow data), what is your honest assessment of the system's edge? Can it be improved to >50% win rate with rule modifications, or does it need flow data to be viable?

6. CONFIDENCE SCORE: Rate how confident you are in these findings on a scale of 1-10, given the sample size. Be honest about data limitations.

Be specific, cite actual numbers from the data, and be honest about small sample sizes.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json()
  return data.content?.[0]?.text || 'Analysis failed'
}

export async function GET(req: NextRequest) {
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const origin       = req.headers.get('origin') || req.headers.get('referer') || ''
  const isFromApp    = origin.includes('traidezone.ai') || origin.includes('localhost')
  if (!isCronSecret && !isFromApp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const host  = req.headers.get('host') || 'www.traidezone.ai'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const originUrl = `${proto}://${host}`

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '90'), 400)

  // Fetch backtest data
  const backtestData = await runBacktest(originUrl, days)
  if (!backtestData.summary) {
    return NextResponse.json({ error: 'Backtest failed' }, { status: 502 })
  }

  // Run AI analysis
  const analysis = await analyzeWithClaude(backtestData.results || [], backtestData.summary)

  return NextResponse.json({
    analysis,
    summary:     backtestData.summary,
    signalCount: backtestData.results?.filter((r: any) => r.signal !== 'WAIT').length,
    days,
    generatedAt: new Date().toISOString(),
  })
}
