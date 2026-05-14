/**
 * buildContext.ts — assembles validated AI context from clean data sources
 *
 * Two contexts:
 *  - SignalContext: system prompt (cached) + live snapshot (dynamic) for runSignal
 *  - CompanionContext: full session context for companion chat
 *
 * Validation rules enforced here before any data reaches the AI:
 *  - Prices must be in valid SPX range (5000–12000)
 *  - VWAP must be within 5% of currentPrice (sanity check)
 *  - EMA must be within 10% of currentPrice
 *  - All fields default to safe fallback strings, never undefined
 *
 * This is the future home of the data validation agent.
 */

import type { MarketData } from '../hooks/useMarketData'
import { validateMarketData } from '../agents/dataValidator'
import type { PatternAnalysis } from '../lib/patternRecognition'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EdgeProfile {
  // From backtest (historical baseline)
  backtestWinRate:    number | null  // e.g. 61
  backtestPF:         number | null  // profit factor e.g. 1.8
  longWinRate:        number | null  // e.g. 67
  shortWinRate:       number | null  // e.g. 48
  bestDays:           string[]       // e.g. ['Monday','Tuesday']
  bestVixRegime:      string | null  // e.g. 'Normal 14-20'
  avgWinMins:         number | null  // avg time for winners
  avgLossMins:        number | null  // avg time for losers
  backtestDays:       number | null  // how many days backtest covers
  backtestDateRange:  string | null  // e.g. '2025-11-01 → 2026-04-25'
  // From live alert accuracy (Supabase)
  liveWinRate:        number | null
  livePF:             number | null
  liveScoredAlerts:   number | null
  liveRecentForm:     string | null  // 'Hot 🔥' | 'Solid' etc
  modelSuggestions:   string[]
}

export interface SignalInput {
  // From useMarketData hook
  market: Pick<MarketData, 'currentPrice' | 'levels' | 'candles' | 'vixPrice' | 'changes'>

  // Historical edge profile
  edgeProfile:     EdgeProfile | null

  // Human execution data (from trade outcome captures)
  executionStats?: {
    humanWinRate:  number | null
    aiWinRate:     number | null
    avgHumanPts:   number | null
    avgAiPts:      number | null
    skipRate:      number | null
    topSkipReason: string | null
    executionGap:  number | null
  }

  // From session state
  morningPlan:     any
  activePlaybook:  any | null
  tradeStats:      any | null
  aiTone:          number
  aiResult:        any | null   // previous signal — for continuity

  // From free data APIs (Unusual Whales, Tiingo)
  optionsFlow:     any[]
  marketTide:      any | null
  marketIntel:     any | null
  tiingoContext:   any | null
  zeroDTESkew:     any | null
  marketScore:     any | null
  tradePatterns:   any | null
  multiTFData:     any | null

  // From chart pattern recognition engine
  patternAnalysis: PatternAnalysis | null

  // TICK/TRIN/VVIX breadth + GEX
  breadthData?: { aiContext: string; tick: any; trin: any; vvix: any; consensus: string } | null
  gexData?:     { aiContext: string; gammaFlip?: number; callWall?: number; putWall?: number; totalGex?: number } | null

  // Market microstructure (cumulative delta, dark pool, volume, options imbalance)
  microstructure?: {
    aiContext:  string
    summary:    string
    cumulativeDelta: { strength: string; pct: number; value: number }
    darkPool:        { netBias: string; totalBuyNotional: number; totalSellNotional: number }
    volumeSpike?:    { detected: boolean; multiplier: number; direction: string } | null
    optionsImbalance: { bias: string; ratio: number; sweepCount: number; floorCount: number }
  } | null

  // From daily AI cache
  marketNews:       string
  economicCalendar: string
  macroRegime:      any | null
  earningsCalendar: any[]
  sessionMemory:    string
}

export interface SignalContext {
  systemPrompt: string   // cached by Anthropic
  liveContext:  string   // fresh each call
  isValid:      boolean  // false = data not ready, don't call AI
  warnings:     string[] // validation issues found
}

export interface CompanionContext {
  systemPrompt: string
  isValid:      boolean
  warnings:     string[]
}

// ── Tone instructions ─────────────────────────────────────────────────────────

const TONE: Record<number, string> = {
  1: 'DRILL SERGEANT: Blunt, zero tolerance. Short sharp sentences. Military discipline.',
  2: 'DIRECT & FIRM: No fluff. Honest even when it stings. Tough love.',
  3: 'BALANCED: Direct but constructive. Mix accountability with support.',
  4: 'ENCOURAGING: Acknowledge progress. Frame corrections as learning.',
  5: 'LIFE COACH: Lead with empathy. Reframe mistakes as growth moments.',
}

// ── Validation ────────────────────────────────────────────────────────────────

function validatePrice(p: number | null, label: string, warnings: string[]): number | null {
  if (!p) { warnings.push(`${label}: missing`); return null }
  if (p < 5000 || p > 12000) { warnings.push(`${label}: ${p} out of valid SPX range`); return null }
  return p
}

function validateVwap(vwap: number | null, price: number | null, warnings: string[]): number | null {
  if (!vwap || !price) return vwap
  const pct = Math.abs(vwap - price) / price
  if (pct > 0.05) {
    warnings.push(`VWAP ${vwap?.toFixed(0)} is >5% from price ${price?.toFixed(0)} — may be stale`)
    return null  // don't trust it
  }
  return vwap
}

function validateEma(ema: number | null, price: number | null, warnings: string[]): number | null {
  if (!ema || !price) return ema
  const pct = Math.abs(ema - price) / price
  if (pct > 0.15) {
    warnings.push(`200 EMA ${ema?.toFixed(0)} is >15% from price — likely stale data`)
    return null
  }
  return ema
}

function fmt(p: number | null | undefined): string {
  if (!p) return '—'
  return p >= 1000 ? p.toFixed(2) : p.toFixed(2)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFlowSection(flow: any[]): string {
  if (!flow?.length) return 'No options flow data'
  return flow.slice(0, 5).map(f =>
    `${f.ticker} ${(f.type||'').toUpperCase()} $${f.strike} ${f.expiry} — ${f.sentiment} ${f.premium}${f.unusual ? ' ⚡SWEEP' : ''}`
  ).join('\n')
}

function buildEarningsSection(calendar: any[]): string {
  if (!calendar?.length) return ''
  const todayStr    = new Date().toISOString().split('T')[0]
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const relevant = calendar
    .filter(d => d.date === todayStr || d.date === tomorrowStr)
    .map(d => {
      const label = d.date === todayStr ? 'TODAY' : 'TOMORROW'
      const items = d.earnings?.slice(0,3).map((e: any) =>
        `${e.symbol} ${e.time}${e.expectedMove ? ' ±' + e.expectedMove : ''}`
      ).join(', ')
      return items ? `${label}: ${items}` : null
    })
    .filter(Boolean)
  return relevant.length ? relevant.join('\n') : ''
}

function buildRecentCandles(candles: any[]): string {
  return (candles || []).slice(-5).map(c =>
    `O:${c.o?.toFixed(0)} H:${c.h?.toFixed(0)} L:${c.l?.toFixed(0)} C:${c.c?.toFixed(0)}`
  ).join(' | ')
}

// ── Edge profile section ─────────────────────────────────────────────────────

function buildEdgeSection(edge: EdgeProfile | null, vixPrice: number | null): string {
  if (!edge) return ''

  const lines: string[] = []

  // Baseline
  if (edge.backtestWinRate !== null) {
    lines.push(`SYSTEM BASELINE (${edge.backtestDays || '?'} day backtest, ${edge.backtestDateRange || ''}):`)
    lines.push(`  Overall: ${edge.backtestWinRate}% win rate | ${edge.backtestPF}× profit factor`)
    lines.push(`  LONG: ${edge.longWinRate}% | SHORT: ${edge.shortWinRate}%`)
    if (edge.bestDays?.length) lines.push(`  Best days: ${edge.bestDays.join(', ')}`)
    if (edge.bestVixRegime) lines.push(`  Best VIX regime: ${edge.bestVixRegime}`)
    if (edge.avgWinMins && edge.avgLossMins) {
      lines.push(`  Avg winner: ${edge.avgWinMins}min | Avg loser: ${edge.avgLossMins}min`)
    }
  }

  // Live accuracy
  if (edge.liveScoredAlerts && edge.liveScoredAlerts >= 5) {
    lines.push(`LIVE ACCURACY (last 30 days, ${edge.liveScoredAlerts} signals):`)
    lines.push(`  Win rate: ${edge.liveWinRate}% | PF: ${edge.livePF}× | Form: ${edge.liveRecentForm || '?'}`)
  }

  // Current conditions vs baseline
  if (vixPrice && edge.bestVixRegime) {
    const vixBucket = vixPrice < 14 ? 'Low <14' : vixPrice < 20 ? 'Normal 14-20' : vixPrice < 28 ? 'Elevated 20-28' : 'High >28'
    const isOptimal = edge.bestVixRegime.includes(vixBucket.split(' ')[0])
    lines.push(`CONDITIONS VS BASELINE:`)
    lines.push(`  VIX ${vixPrice.toFixed(1)} = ${vixBucket} regime${isOptimal ? ' ✓ (your best regime)' : ' (sub-optimal)'}`)
  }

  const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
  if (edge.bestDays?.length) {
    const isGoodDay = edge.bestDays.includes(todayDow)
    lines.push(`  Today is ${todayDow}${isGoodDay ? ' ✓ (historically strong day)' : ' (not your peak day)'}`)
  }

  // Model suggestions
  if (edge.modelSuggestions?.length) {
    lines.push(`MODEL INSIGHTS: ${edge.modelSuggestions[0]}`)
  }

  return lines.join('\n')
}

// ── buildSignalContext ────────────────────────────────────────────────────────

export async function buildSignalContext(input: SignalInput): Promise<SignalContext> {
  const warnings: string[] = []
  const { market, morningPlan, activePlaybook, tradeStats, aiTone,
          optionsFlow, marketTide, marketIntel, tiingoContext, zeroDTESkew,
          marketScore, tradePatterns, multiTFData,
          marketNews, economicCalendar, macroRegime, earningsCalendar, sessionMemory,
          patternAnalysis } = input

  // ── Step 1: basic validation ────────────────────────────────────────────────
  const price = validatePrice(market.currentPrice, 'SPX price', warnings)
  const vwap  = validateVwap(market.levels?.spyVwap ?? null, price, warnings)
  const ema   = validateEma(market.levels?.ema200 ?? null, price, warnings)

  // ── Step 2: Data Validation Agent — cross-check against Yahoo Finance ────────
  // Only runs during market hours when prices should match closely
  const agentResult = await validateMarketData(
    market.currentPrice,
    market.levels?.spyVwap ?? null,
    market.vixPrice ?? null,
  )

  // Merge agent warnings into context warnings
  if (agentResult.warnings.length > 0) {
    warnings.push(...agentResult.warnings)
  }

  // Agent can block the signal if price drift is too large
  // isValid = price exists AND agent didn't block it
  const isValid = !!price && agentResult.isValid

  // ── Static system prompt (Anthropic caches this) ──────────────────────────
  const tone = TONE[aiTone] || TONE[3]

  const morningSection = morningPlan
    ? `MORNING PLAN:
Bias: ${morningPlan.bias || 'Not set'}
Implied move: ±${morningPlan.impliedMove || '?'} pts
Key levels: ${morningPlan.keyLevels || 'Not set'}
Gap: ${morningPlan.gapDirection || 'Flat'} ${morningPlan.gapSize ? morningPlan.gapSize + 'pts' : ''}${morningPlan.notes ? `\nTrader's thesis: ${morningPlan.notes}` : ''}`
    : 'No morning plan — trading without a plan'

  const playbookSection = activePlaybook
    ? `ACTIVE PLAYBOOK: "${activePlaybook.name}"
Setup: ${activePlaybook.setup}
Entry: ${activePlaybook.entry}
Stop: ${activePlaybook.stop}
Target: ${activePlaybook.target}`
    : 'No playbook selected'

  const statsSection = tradeStats
    ? `Win rate: ${tradeStats.winRate}% (${tradeStats.totalTrades} trades) | In-system: ${tradeStats.inSystemWinRate}% | Best setup: ${tradeStats.bestSetup || 'Unknown'}`
    : 'No trade history'

  const edgeSection = buildEdgeSection(input.edgeProfile ?? null, market.vixPrice ?? null)

  const macroLine = macroRegime
    ? `MACRO: ${macroRegime.regime||''} — ${macroRegime.keyRisk||''}`
    : ''

  const tiingoLine = tiingoContext
    ? `GAP STATS: fill ${tiingoContext.gapFillRate||'N/A'}% | continuation ${tiingoContext.continueRate||'N/A'}%`
    : ''

  const earningsSection = buildEarningsSection(earningsCalendar)
  const newsLine    = marketNews ? `NEWS: ${String(marketNews).substring(0, 250)}` : ''
  const calLine     = economicCalendar ? `CALENDAR: ${String(economicCalendar).substring(0, 120)}` : ''
  const memLine     = sessionMemory ? `MEMORY: ${String(sessionMemory).substring(0, 150)}` : ''

  const JSON_SCHEMA = `Respond ONLY with this JSON (no markdown):
{
  "signal": "LONG" | "SHORT" | "WAIT" | "NO TRADE",
  "confidence": 0-100,
  "marketConditions": "2-3 sentences on what the market is doing right now",
  "aiView": "YOUR independent read — what do YOU see beyond the trader's plan? Cite specific data: microstructure, patterns, flow, fib levels, macro. Be direct even if it diverges from the plan.",
  "systemAlignment": "aligned" | "partial" | "divergent",
  "systemAlignmentNote": "1 sentence — where does your view match or differ from the morning plan/playbook?",
  "todaysEdge": "1-2 sentences on the specific edge present right now",
  "accountability": "1 sentence on the biggest rule violation risk",
  "riskFlag": "1 sentence on the single biggest risk to this trade",
  "waitReason": "if WAIT or NO TRADE — exactly what you are waiting for",
  "entryZone": { "high": 0.00, "low": 0.00 },
  "stopLevel": 0.00,
  "target1": 0.00,
  "target2": 0.00,
  "moveSize": 0,
  "buyZones": [{ "type": "buy", "high": 0.00, "low": 0.00 }, { "type": "nobuy", "high": 0.00, "low": 0.00 }]
}

CRITICAL RULES:
- aiView: cite 2-3 specific data points (e.g. "TICK +847, TRIN 0.68, GEX negative at 7380 flip — breakouts will run"). Be the quant, not the coach.
- systemAlignment: "aligned" = data confirms plan. "divergent" = data contradicts plan. "partial" = mixed.
- Keep marketConditions + aiView combined under 60 words. The trader wants signal, not analysis.
- entryZone: specific 3-5pt wide zone at key S/R
- stopLevel: below VWAP or 200 EMA — max 12pts from entry mid
- target1: minimum 10-15pts from entry (SCALP). target2: 25-30pts (SWING)
- moveSize: target1 minus entry midpoint, round to nearest 5
- LONG → call option, SHORT → put option
- For WAIT/NO TRADE: still populate entryZone/stopLevel/targets as levels to watch`

  const systemPrompt = [
    'You are an elite SPX intraday options trading AI. Your job: synthesize ALL available data (microstructure, GEX, TICK/TRIN/VVIX, options flow, patterns, dark pool, breadth) into one clean signal with high-confidence levels. The trader does NOT want to interpret data — they want your best read. Be direct, specific, and quantified. Your aiView should reference actual numbers from the data, not generic statements. System alignment matters but your independent read matters equally.',
    `COACHING STYLE: ${tone}`,
    morningSection,
    playbookSection,
    `TRADER STATS: ${statsSection}`,
    edgeSection ? `═══ HISTORICAL EDGE PROFILE ═══\n${edgeSection}` : '',
    tiingoLine,
    macroLine,
    newsLine,
    calLine,
    earningsSection ? `EARNINGS:\n${earningsSection}` : '',
    memLine,
    warnings.length ? `DATA WARNINGS: ${warnings.join('; ')}` : '',
    patternAnalysis?.aiContext ? `═══ CHART PATTERN & FIBONACCI ANALYSIS ═══\n${patternAnalysis.aiContext}` : '',
    (input as any).microstructure?.aiContext ? `═══ MARKET MICROSTRUCTURE ═══\n${(input as any).microstructure.aiContext}\nMICROSTRUCTURE SUMMARY: ${(input as any).microstructure.summary}` : '',
    (input as any).breadthData?.aiContext ? `═══ MARKET BREADTH (TICK/TRIN/VVIX) ═══\n${(input as any).breadthData.aiContext}` : '',
    // Quality gate context injected LAST so AI factors it into final output
    `═══ PRE-SIGNAL QUALITY CHECK ═══
The signal quality system has independently scored each data stream.
You MUST factor this into your confidence and signal.
If confirmation is <50% or blockers exist → signal WAIT, not LONG/SHORT.
If confirmation is 70%+ → you may increase confidence by up to 10pts.
Reference this scoring when setting your final confidence number.`,
    (input as any).gexData?.aiContext ? `═══ DEALER GAMMA EXPOSURE ═══\n${(input as any).gexData.aiContext}` : '',
    patternAnalysis?.structureSummary ? `PATTERN BIAS: ${patternAnalysis.structureSummary}` : '',
    JSON_SCHEMA,
  ].filter(Boolean).join('\n\n')

  // ── Dynamic live context (sent fresh each call, not cached) ───────────────
  const timeNow   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  const vwapPos   = price && vwap ? (price > vwap ? 'ABOVE' : 'BELOW') : '?'
  const emaPos    = price && ema  ? (price > ema  ? 'ABOVE' : 'BELOW') : '?'

  const liveContext = [
    `LIVE (${timeNow} ET): SPX ${fmt(price)} | VWAP ${fmt(vwap)} ${vwapPos} | 200EMA ${fmt(ema)} ${emaPos}`,
    `PDH ${fmt(market.levels?.pdh ?? null)} | PDL ${fmt(market.levels?.pdl ?? null)} | Open ${fmt(market.levels?.dayOpen ?? null)}`,
    `VIX ${market.vixPrice?.toFixed(2) || '?'} | Breadth ${marketIntel?.breadth?.bias || '?'} | Tide ${marketTide?.bias || '?'} P/C ${marketTide?.putCallRatio || '?'}`,
    `Candles: ${buildRecentCandles(market.candles)}`,
    `Flow:\n${buildFlowSection(optionsFlow)}`,
    zeroDTESkew   ? `0DTE: ${zeroDTESkew.skewLabel} P/C ${zeroDTESkew.pcRatio}` : '',
    marketScore   ? `Score: ${marketScore.score}/100 ${marketScore.label}` : '',
    multiTFData   ? `MTF: ${multiTFData.confluence}` : '',
    tradePatterns?.revengePatterns > 2 ? '⚠ REVENGE TRADING PATTERN ACTIVE' : '',
  ].filter(Boolean).join('\n')

  return { systemPrompt, liveContext, isValid, warnings }
}

// ── buildCompanionContext ─────────────────────────────────────────────────────

export function buildCompanionContext(
  input: SignalInput & {
    aiResult:    any | null
    probs:       { reversal: number; continuation: number; chop: number; dominant: string; confidence: string }
    checklistScore:  number
    checklistGrade:  string
    metChecks:       string
    unmetChecks:     string
    aiToneStr:       string
  }
): CompanionContext {
  const warnings: string[] = []
  const { market } = input

  const price = validatePrice(market.currentPrice, 'SPX price', warnings)
  const vwap  = validateVwap(market.levels?.spyVwap ?? null, price, warnings)
  const ema   = validateEma(market.levels?.ema200 ?? null, price, warnings)

  const earningsSection = buildEarningsSection(input.earningsCalendar)
  const flowSection     = buildFlowSection(input.optionsFlow)

  const tone = TONE[input.aiTone] || TONE[3]

  const systemPrompt = `You are an elite SPX intraday options trading AI companion — part trading desk partner, part coach, part risk manager. You have full market context and are expected to think independently.

WHAT YOU DO:
1. Enforce discipline and system rules when the trader is about to violate them
2. Proactively share relevant observations they may NOT have noticed — unusual flow, macro risk, pattern forming, fib level confluence, sector rotation, breadth divergence, anything the data shows
3. Give honest opinions on setups — even if they conflict with the morning plan. The plan is a guide, not a prison
4. Flag external risks: earnings nearby, Fed speakers, economic data, geopolitical events affecting SPX
5. Reference historical edge: if current conditions match high-win-rate historical setups, say so explicitly
6. Be a sounding board — engage with their questions fully, share your actual view

WHAT YOU DON'T DO:
- Give generic advice. Every response references actual prices, actual levels, actual conditions
- Repeat the same warnings. Say it once, clearly
- Pad responses. Be direct. Under 80 words unless the question genuinely needs more
- Validate bad trades to be supportive. Tell the truth

COACHING STYLE: ${tone}

═══ LIVE MARKET ═══
SPX: ${fmt(price)} | Change: ${market.changes?.spx ? (market.changes.spx >= 0 ? '+' : '') + market.changes.spx?.toFixed(2) : '—'}
VWAP ${fmt(vwap)} — SPX is ${price && vwap ? (price > vwap ? 'ABOVE ▲ bullish' : 'BELOW ▼ bearish') : '?'}
200 EMA ${fmt(ema)} — SPX is ${price && ema ? (price > ema ? 'ABOVE' : 'BELOW') : '?'}
PDH: ${fmt(market.levels?.pdh ?? null)} | PDL: ${fmt(market.levels?.pdl ?? null)} | Prev Close: ${fmt(market.levels?.prevClose ?? null)}
VIX: ${market.vixPrice?.toFixed(2) || '—'}
${warnings.length ? `⚠ DATA ISSUES: ${warnings.join('; ')}` : ''}

═══ MARKET INTELLIGENCE ═══
Breadth: ${input.marketIntel?.breadth?.bias || 'No data'}
Tide: ${input.marketTide?.bias || '?'} | P/C: ${input.marketTide?.putCallRatio || '—'}
${flowSection ? `Top flow:\n${flowSection}` : 'No flow data'}
${earningsSection ? `Earnings:\n${earningsSection}` : ''}
${input.macroRegime ? `Macro: ${input.macroRegime.regime||''} — ${input.macroRegime.keyRisk||''}` : ''}
${input.marketNews ? `News: ${String(input.marketNews).substring(0, 200)}` : ''}

═══ MORNING PLAN ═══
Bias: ${input.morningPlan?.bias || 'NOT SET'}
Implied Move: ±${input.morningPlan?.impliedMove || '?'} pts
Key Levels: ${input.morningPlan?.keyLevels || 'not set'}
${input.morningPlan?.notes ? `Notes: ${input.morningPlan.notes}` : ''}

═══ AI SIGNAL ═══
${input.aiResult?.signal || 'No signal'} | Confidence: ${input.aiResult?.confidence || 0}%
${input.aiResult?.marketConditions || ''}
${input.aiResult?.riskFlag ? `⚠ ${input.aiResult.riskFlag}` : ''}

═══ PRE-TRADE CHECKLIST: ${input.checklistScore}/13 (${input.checklistGrade}) ═══
MET: ${input.metChecks || 'None'}
UNMET: ${input.unmetChecks || 'All clear'}

═══ ACTIVE PLAYBOOK ═══
${input.activePlaybook ? `${input.activePlaybook.name}\nEntry: ${input.activePlaybook.entry}\nStop: ${input.activePlaybook.stop}` : 'No playbook selected'}

${input.sessionMemory ? `MEMORY: ${input.sessionMemory}` : ''}

${(input as any).patternAnalysis?.aiContext ? `═══ CHART PATTERN & FIBONACCI ANALYSIS ═══\n${(input as any).patternAnalysis.aiContext}` : ''}

${(input as any).microstructure?.aiContext ? `═══ MARKET MICROSTRUCTURE ═══\n${(input as any).microstructure.aiContext}\nSUMMARY: ${(input as any).microstructure.summary}` : ''}

${(input as any).breadthData?.aiContext ? `═══ MARKET BREADTH ═══\n${(input as any).breadthData.aiContext}` : ''}

${(input as any).gexData?.aiContext ? `═══ DEALER GAMMA EXPOSURE ═══\n${(input as any).gexData.aiContext}` : ''}

${buildEdgeSection((input as any).edgeProfile ?? null, market.vixPrice ?? null) ? `═══ YOUR HISTORICAL EDGE ═══
${buildEdgeSection((input as any).edgeProfile ?? null, market.vixPrice ?? null)}` : ''}

${(input as any).executionStats ? `═══ YOUR EXECUTION REALITY ═══
AI win rate: ${(input as any).executionStats.aiWinRate ?? '?'}% | Your actual: ${(input as any).executionStats.humanWinRate ?? 'tracking just started'}%
AI avg pts/trade: ${(input as any).executionStats.avgAiPts ?? '?'} | You capture: ${(input as any).executionStats.avgHumanPts ?? 'not yet tracked'}pts
Execution gap: ${(input as any).executionStats.executionGap != null ? (input as any).executionStats.executionGap + 'pts left on table per trade' : 'collecting data'}
Skip rate: ${(input as any).executionStats.skipRate != null ? (input as any).executionStats.skipRate + '%' : '?'} skipped | Top skip reason: ${(input as any).executionStats.topSkipReason ?? 'insufficient data'}
Reference specific execution patterns when relevant — not generic reminders.` : ''}`

  return { systemPrompt, isValid: !!price, warnings }
}
// force redeploy Mon Apr 27 11:51:40 UTC 2026
// deploy 1777295513
