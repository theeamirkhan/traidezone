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
import { detectDailyCandlePatterns } from '../../cockpit/lib/dailyCandlePatterns'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      spxPrice, vixPrice, spxChange, vwap, ema200,
      macroRegime, marketNews, economicCalendar, earningsCalendar,
      gapData, gapPrediction, morningPlan,
      breadthData, tiingoContext, multiTFData, dailyPatterns,
      traderProfile, recentTrades,  // NEW: personalized learning context
    } = body

    // Fetch daily bars for pattern detection
    const cronPolyKey = process.env.POLYGON_API_KEY
    const cronToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const cronFrom  = new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0]
    let cronPatterns: any[] = []
    let cronPrevClose: number | null = null
    let cronPrevVix: number | null = null
    try {
      const [spxRes, vixRes] = await Promise.all([
        fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/day/${cronFrom}/${cronToday}?adjusted=true&sort=desc&limit=15&apiKey=${cronPolyKey}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
        fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/range/1/day/${cronFrom}/${cronToday}?adjusted=true&sort=desc&limit=2&apiKey=${cronPolyKey}`, { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
      ])
      const spxBars = spxRes.results || []
      cronPrevClose = spxBars[0]?.c || null
      cronPrevVix   = vixRes.results?.[0]?.c || null
      // Detect patterns on last 10 bars (sorted asc for pattern logic)
      if (spxBars.length >= 2) {
        cronPatterns = detectDailyCandlePatterns([...spxBars].reverse(), {
          sma50:  spxBars.length >= 10 ? spxBars.slice(0, 10).reduce((s: number, b: any) => s + b.c, 0) / 10 : undefined,
        })
      }
    } catch (e) { console.warn('[morning-brief] price fetch failed:', e) }

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

DAILY CANDLE PATTERN SIGNALS:
${cronPatterns?.length > 0
  ? cronPatterns.map((p: any) => `${p.strength} ${p.name} (${p.type}): ${p.description} → ${p.actionable}`).join('\n')
  : (dailyPatterns?.length > 0
    ? dailyPatterns.map((p: any) => `${p.strength} ${p.name} (${p.type}): ${p.description} → ${p.actionable}`).join('\n')
    : 'No significant patterns detected')}

RECENT DAILY CANDLES:
${multiTFData?.recentCandles?.join('\n') || 'Not available'}

KEY MAs: Daily 20SMA: ${multiTFData?.daily?.sma20 || 'n/a'} | 50SMA: ${multiTFData?.daily?.sma50 || 'n/a'} | 200SMA: ${multiTFData?.daily?.sma200 || 'n/a'}
Daily RSI: ${multiTFData?.daily?.rsi || 'n/a'} | ATR: ${multiTFData?.daily?.atr || 'n/a'}pts | ${multiTFData?.daily?.cross || ''}
Price structure: ${multiTFData?.daily?.structure || 'n/a'}
Weekly: ${multiTFData?.weekly?.trend || 'n/a'} | RSI ${multiTFData?.weekly?.rsi || 'n/a'} | ${multiTFData?.weekly?.pctFrom52H || 'n/a'}% from 52W high

MARKET BREADTH:
${breadthData?.tick?.value ? `TICK: ${breadthData.tick.value} (${breadthData.tick.regime}) | TRIN: ${breadthData.trin?.value?.toFixed(2) || 'n/a'} | VVIX: ${breadthData.vvix?.value?.toFixed(1) || 'n/a'} (${breadthData.vvix?.regime || ''})` : 'Breadth not loaded'}

${traderProfile ? `═══ TRADER'S HISTORICAL EDGE ═══
${traderProfile.strengths?.length > 0 ? `Strengths (what works): ${traderProfile.strengths.slice(-3).map((s: any) => typeof s === 'string' ? s : s.description || s).join(' | ')}` : ''}
${traderProfile.weaknesses?.length > 0 ? `Weaknesses (what to avoid): ${traderProfile.weaknesses.slice(-3).map((w: any) => typeof w === 'string' ? w : w.description || w).join(' | ')}` : ''}
${traderProfile.stream_weights ? `Highest-accuracy data streams: ${Object.entries(traderProfile.stream_weights).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([n, w]: any) => `${n} (${w.toFixed(2)}x)`).join(', ')}` : ''}
${traderProfile.edge_notes?.length > 0 ? `Recent edge notes: ${traderProfile.edge_notes.slice(-2).join(' | ')}` : ''}` : ''}

${recentTrades?.length > 0 ? `═══ LAST 3 SESSIONS' OBSERVATIONS ═══
${recentTrades.slice(0, 3).map((t: any) => `${t.date}: ${t.symbol} ${t.direction} P&L $${t.pnl?.toFixed(0)} ${t.notes?.includes('Mech:') ? '— ' + (t.notes.match(/Mech: \\w+ -?\\d+/)?.[0] || '') : ''} ${t.notes?.includes('Play:') ? '— ' + (t.notes.match(/Play: [^|]+/)?.[0] || '').trim() : ''}`).join('\\n')}` : ''}

Write the morning brief now. Reference specific MAs, RSI levels, and candle patterns from the technical data above. Be specific to today's conditions.
${traderProfile?.weaknesses?.length > 0 ? `IMPORTANT: Tailor the tradingPlan field to address the trader's specific weaknesses listed above — remind them what to avoid.` : ''}
${traderProfile?.strengths?.length > 0 ? `Reinforce the trader's strengths — connect today's conditions to where they have historical edge.` : ''}`

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
