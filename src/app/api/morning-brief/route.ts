/**
 * /api/morning-brief — AI Morning Brief with Macro Trend Bias
 *
 * Generates a comprehensive daily write-up covering:
 *   1. Macro trend bias (Fed, rates, risk regime)
 *   2. What's driving the market this week
 *   3. AI's recommended directional bias with reasoning
 *   4. Key levels and catalysts to watch today
 *   5. The one thing that could change everything
 *
 * Cached daily in localStorage (client) and generated fresh each morning.
 * Uses Haiku for cost efficiency — this runs once per day.
 * Triggered on cockpit load after 9am ET.
 */

import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      spxPrice, vixPrice, spxChange, vwap, ema200,
      macroRegime, marketNews, economicCalendar, earningsCalendar,
      gapData, gapPrediction, morningPlan,
      breadthData, tiingoContext, multiTFData,
    } = body

    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })

    const systemPrompt = `You are an elite institutional trading analyst writing the morning brief for a disciplined SPX intraday options day trader.

Your brief is read at market open. It should be sharp, specific, and immediately actionable — not generic commentary.
The trader uses ITM SPX options, entries after 10am, VWAP+EMA confluence, stops at VWAP or 200 EMA.
Primary instrument: LONG (calls) bias, but you give an honest read regardless.

Format your response as JSON only. No markdown, no backticks, no preamble:
{
  "macroBias": "BULLISH | BEARISH | NEUTRAL",
  "macroSentence": "One crisp sentence on the macro trend (Fed, rates, regime)",
  "weeklyNarrative": "2-3 sentences: what is driving the market THIS week specifically",
  "todaysBias": "LONG | SHORT | NEUTRAL",
  "biasReasoning": "2-3 sentences explaining AI's recommended directional bias for today with specific reasons",
  "keyLevels": "Specific SPX levels to watch today (VWAP, prior close, key support/resistance)",
  "catalystWatch": "What economic events or news could move the market today",
  "biggestRisk": "The single most important risk to be aware of today — the thing that could invalidate the bias",
  "tradingPlan": "2 sentences: specific guidance for how to approach today given all of the above"
}`

    const userContent = `Today: ${today}
SPX: ${spxPrice?.toFixed(2) || 'n/a'} (${spxChange > 0 ? '+' : ''}${spxChange?.toFixed(2) || '0'}% today)
VIX: ${vixPrice?.toFixed(2) || 'n/a'}
VWAP: ${vwap?.toFixed(2) || 'n/a'}
200 EMA: ${ema200?.toFixed(2) || 'n/a'}

MACRO REGIME:
${macroRegime ? `Fed: ${macroRegime.fedStance} (${macroRegime.rateLevel}) | ${macroRegime.regime}
${macroRegime.regimeSummary}
Key Risk: ${macroRegime.keyRisk}` : 'Not loaded — use web search for current Fed stance'}

GAP CONDITIONS TODAY:
${gapData?.gap_direction ? `${gapData.gap_direction} ${gapData.gap_size?.toFixed(1)}pts | VIX open: ${gapData.vix_open?.toFixed(1)} | Catalyst: ${gapData.catalyst_type || 'None'}` : 'Market not open yet'}
${gapPrediction?.interpretation ? `Trend prediction: ${gapPrediction.interpretation} (score: ${gapPrediction.trendScorePredicted}/100)` : ''}

ECONOMIC CALENDAR TODAY:
${economicCalendar || 'No major events'}

EARNINGS THIS WEEK:
${earningsCalendar?.length ? earningsCalendar.slice(0, 5).map((e: any) => `${e.symbol || e.ticker} (${e.time || 'TBD'})`).join(', ') : 'None significant'}

MARKET NEWS:
${marketNews ? marketNews.substring(0, 500) : 'No news loaded'}

MORNING PLAN (trader-set):
Bias: ${morningPlan?.bias || 'NOT SET'}
Implied Move: ±${morningPlan?.impliedMove || 'n/a'} pts
Gap: ${morningPlan?.gapDirection || 'n/a'} ${morningPlan?.gapSize || ''}pts

${tiingoContext?.summary ? `HISTORICAL CONTEXT:\n${tiingoContext.summary.substring(0, 200)}` : ''}

MULTI-TIMEFRAME TECHNICAL ANALYSIS:
${multiTFData?.summary || 'Technical data not loaded'}

RECENT DAILY CANDLES:
${multiTFData?.recentCandles?.join('\n') || 'Not available'}

KEY MAs: Daily 20SMA: ${multiTFData?.daily?.sma20 || 'n/a'} | 50SMA: ${multiTFData?.daily?.sma50 || 'n/a'} | 200SMA: ${multiTFData?.daily?.sma200 || 'n/a'}
Daily RSI: ${multiTFData?.daily?.rsi || 'n/a'} | ATR: ${multiTFData?.daily?.atr || 'n/a'}pts | ${multiTFData?.daily?.cross || ''}
Price structure: ${multiTFData?.daily?.structure || 'n/a'}
Weekly: ${multiTFData?.weekly?.trend || 'n/a'} | RSI ${multiTFData?.weekly?.rsi || 'n/a'} | ${multiTFData?.weekly?.pctFrom52H || 'n/a'}% from 52W high

MARKET BREADTH:
${breadthData?.tick?.value ? `TICK: ${breadthData.tick.value} (${breadthData.tick.regime}) | TRIN: ${breadthData.trin?.value?.toFixed(2) || 'n/a'} | VVIX: ${breadthData.vvix?.value?.toFixed(1) || 'n/a'} (${breadthData.vvix?.regime || ''})` : 'Breadth not loaded'}

Write the morning brief now. Reference specific MAs, RSI levels, and candle patterns from the technical data above. Be specific to today's conditions.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    const data = await res.json()

    // Extract text from response (web search may add tool_use blocks)
    const textBlocks = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    // Parse JSON from response
    const clean = textBlocks.replace(/```json|```/g, '').trim()
    const brief = JSON.parse(clean)

    return NextResponse.json({
      ...brief,
      generatedAt: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    })

  } catch (e: any) {
    console.error('[morning-brief]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
