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
  spotGex?:        any | null
  uwIV?:           any | null
  econSurprise?:   any | null
  volumeProfile?:  any | null
  mechanicalFlow?: any | null

  // From chart pattern recognition engine
  patternAnalysis: PatternAnalysis | null

  // TICK/TRIN/VVIX breadth + GEX
  breadthData?: { aiContext: string; tick: any; trin: any; vvix: any; consensus: string } | null
  gexData?:     { aiContext: string; gammaFlip?: number; callWall?: number; putWall?: number; totalGex?: number } | null
  marketIntel2?: any | null   // comprehensive market intelligence

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
  if (!candles?.length) return 'No candle data'
  const recent = candles.slice(-20)
  const cur    = recent[recent.length - 1]
  const prev   = recent[recent.length - 2]

  // Trend — are we making higher highs/lows or lower?
  const last10 = recent.slice(-10)
  const highs  = last10.map(c => c.h)
  const lows   = last10.map(c => c.l)
  const hhCount = highs.filter((h, i) => i > 0 && h > highs[i-1]).length
  const llCount = lows.filter((l, i) => i > 0 && l < lows[i-1]).length
  const trend   = hhCount >= 6 ? 'UPTREND (higher highs)' : llCount >= 6 ? 'DOWNTREND (lower lows)' : 'CHOPPY/RANGING'

  // Momentum — last 3 candles direction
  const last3   = recent.slice(-3)
  const last3Dir = last3.map(c => c.c > c.o ? '▲' : c.c < c.o ? '▼' : '–').join('')
  const momentum = last3.filter(c => c.c > c.o).length >= 2 ? 'Bullish momentum' : last3.filter(c => c.c < c.o).length >= 2 ? 'Bearish momentum' : 'Mixed'

  // Current candle detail
  const curBody  = Math.abs(cur.c - cur.o)
  const curRange = cur.h - cur.l
  const curBull  = cur.c > cur.o
  const upperWick = cur.h - Math.max(cur.o, cur.c)
  const lowerWick = Math.min(cur.o, cur.c) - cur.l

  // Key candle patterns in last 5
  const last5    = recent.slice(-5)
  const patterns: string[] = []
  if (cur.c > cur.o && curBody > curRange * 0.6) patterns.push('Strong bull candle')
  if (cur.c < cur.o && curBody > curRange * 0.6) patterns.push('Strong bear candle')
  if (lowerWick > curBody * 2 && curBull) patterns.push('Hammer/pin bar (bullish)')
  if (upperWick > curBody * 2 && !curBull) patterns.push('Shooting star (bearish)')
  if (curBody < curRange * 0.2) patterns.push('Doji — indecision')
  if (prev && cur.c > prev.h) patterns.push('Gap up / breakout candle')
  if (prev && cur.c < prev.l) patterns.push('Gap down / breakdown candle')

  // Price change context
  const chg5  = recent.length >= 5  ? ((cur.c - recent[recent.length-5].o)  / recent[recent.length-5].o * 100).toFixed(2) : null
  const chg20 = recent.length >= 20 ? ((cur.c - recent[0].o) / recent[0].o * 100).toFixed(2) : null

  return [
    `Current: ${cur.c?.toFixed(2)} | O:${cur.o?.toFixed(0)} H:${cur.h?.toFixed(0)} L:${cur.l?.toFixed(0)} C:${cur.c?.toFixed(0)} | ${curBull ? 'BULL' : 'BEAR'} candle`,
    `Range: ${curRange.toFixed(1)}pts | Body: ${curBody.toFixed(1)}pts (${Math.round(curBody/curRange*100)}% of range) | Upper wick: ${upperWick.toFixed(1)} | Lower wick: ${lowerWick.toFixed(1)}`,
    `10-bar trend: ${trend} | Last 3 candles: ${last3Dir} | Momentum: ${momentum}`,
    chg5  ? `5-bar change: ${parseFloat(chg5) > 0 ? '+' : ''}${chg5}%` : '',
    chg20 ? `20-bar change: ${parseFloat(chg20) > 0 ? '+' : ''}${chg20}%` : '',
    patterns.length > 0 ? `Patterns: ${patterns.join(', ')}` : '',
    `Last 5 candles: ${last5.map(c => `${c.c > c.o ? '▲' : '▼'}${c.c?.toFixed(0)}(${Math.abs(c.c-c.o).toFixed(0)})`).join(' ')}`,
  ].filter(Boolean).join('\n')
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
  "marketConditions": "1-2 sentences — what is price doing RIGHT NOW, not what could happen. Use actual levels.",
  "aiView": "YOUR quant read — cite 2-3 specific numbers (e.g. TICK +847, TRIN 0.68, GEX flip 5810, VWAP reclaim). No coaching.",
  "systemAlignment": "aligned" | "partial" | "divergent",
  "systemAlignmentNote": "1 sentence — where does your read match or differ from the morning plan?",
  "multiTFAlignment": "all-bullish | all-bearish | mixed | 5min-only — which timeframes agree/disagree",
  "ivContext": "cheap | normal | expensive — one line on premium-buying favorability",
  "sizingNote": "full | half | quarter — with reason (e.g. half — 72% conf, THETA RISK session)",
  "todaysEdge": "1 sentence — the SPECIFIC structural edge present right now",
  "accountability": "1 sentence — biggest rule violation risk for THIS trader right now",
  "riskFlag": "1 sentence — single biggest risk to this specific trade",
  "waitReason": "WAIT/NO TRADE only — what SPECIFIC trigger changes this to LONG or SHORT",
  "entryZone": { "high": 0.00, "low": 0.00 },
  "stopLevel": 0.00,
  "target1": 0.00,
  "target2": 0.00,
  "moveSize": 0,
  "buyZones": [{ "type": "buy", "high": 0.00, "low": 0.00 }, { "type": "nobuy", "high": 0.00, "low": 0.00 }]
}

CRITICAL OUTPUT RULES:
- aiView: SPECIFIC numbers only. "TICK +847, TRIN 0.68, gamma flip 5810, 15min BEARISH" not vague phrases.
- marketConditions: current structure, not prediction. "Price holding VWAP at 5821, 15min ranging 5815-5835" not "market could go either way".
- marketConditions + aiView combined: under 55 words total.
- entryZone: anchored to VWAP, 200EMA, or key S/R level — 3-5pt wide
- stopLevel: VWAP or 200 EMA — max 12pts from entry midpoint
- target1: ≥10pts from entry (scalp). target2: ≥25pts (swing)
- moveSize: target1 minus entry midpoint, nearest 5
- sizingNote: ALWAYS fill — even full size needs confirmation
- multiTFAlignment: check 15min vs 1hr vs daily — conflicts reduce confidence
- waitReason: must include the EXACT trigger (e.g. "VWAP reclaim + TICK cross +600")
- LONG → call, SHORT → put`

  const systemPrompt = [
    `You are an elite SPX intraday options trading AI. The trader buys ITM SPX options (calls for LONG, puts for SHORT) and closes same day — NOT swing trading, NOT holding overnight.

CRITICAL OPTIONS CONTEXT:
- These are 0-5 DTE SPX options. Theta decay accelerates after 2pm ET — late entries are high-risk.
- Optimal entry window: 10:00am-12:00pm ET (after opening noise settles, before theta decay bites).
- ITM options need LESS price movement to profit than OTM — focus on direction, not magnitude.
- Gamma risk is highest near strikes — GEX levels matter more than for stock traders.
- Liquidity drops sharply on SPX after 3pm — plan exits before then.
- A 5pt adverse move in SPX = meaningful P&L on ITM options. Stops matter.
- WAIT signals should reflect: is there enough time left in the session for this trade to work?

POSITION SIZING RULES:
- Confidence >= 80% + PRIME session: full size.
- Confidence 65-79% OR THETA RISK session: half size. Note this in riskFlag.
- Confidence < 65%: WAIT regardless of direction.
- DANGER session (after 3:30pm): no new entries unless confidence >= 85%.
- Cross-asset RISK_OFF confirmation: reduce size 50%.

MULTI-TIMEFRAME ALIGNMENT:
- 15-min + 1-hour + daily trend all agree = highest conviction.
- Only 5-min trend aligns = lower conviction, note in aiView.
- 1-hour and 15-min in opposite directions = WAIT.

Your job: synthesize ALL available data into one clean signal. Be direct, specific, quantified. Reference actual price numbers from the data provided.`,
    `COACHING STYLE: ${tone}`,
    morningSection,
    playbookSection,
    `TRADER STATS: ${statsSection}`,
    // ── Logical signal prompt order: Macro → Structure → Micro → Options → Quality ──
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
    (input as any).marketIntel2?.aiContext ? `\n═══ MARKET INTELLIGENCE ═══\n${(input as any).marketIntel2.aiContext}` : '',
    (input as any).spotGex?.signal ? `\nUW SPOT GEX (live): ${(input as any).spotGex.signal}` : '',
    (input as any).uwIV?.signal ? `\nSPX IV RANK (UW): ${(input as any).uwIV.signal}` : '',
    (input as any).econSurprise?.signal ? `\nECONOMIC MACRO: ${(input as any).econSurprise.signal}` : '',
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
    `\n═══ 5-MIN CANDLE ANALYSIS (SPX) ═══\n${buildRecentCandles(market.candles)}`,
    (input as any).volumeProfile ? `\n═══ VOLUME PROFILE (SESSION) ═══\n${(input as any).volumeProfile.aiContext}` : '',
    (input as any).mechanicalFlow ? `\n═══ MECHANICAL FLOW (DEALER HEDGING) ═══\n${(input as any).mechanicalFlow.aiContext}` : '',
    `Flow:\n${buildFlowSection(optionsFlow)}`,
    zeroDTESkew   ? `0DTE: ${zeroDTESkew.skewLabel} P/C ${zeroDTESkew.pcRatio}` : '',
    marketScore   ? `Score: ${marketScore.score}/100 ${marketScore.label}` : '',
    multiTFData   ? [
      `═══ TECHNICAL ANALYSIS (Daily + Weekly) ═══`,
      `Confluence: ${multiTFData.confluence}`,
      multiTFData.daily ? [
        `Daily trend: ${multiTFData.daily.trend} | Structure: ${multiTFData.daily.structure}`,
        `Daily MAs: 20SMA ${multiTFData.daily.sma20} (${multiTFData.daily.pctFromSMA20}%) | 50SMA ${multiTFData.daily.sma50} (${multiTFData.daily.pctFromSMA50}%) | 200SMA ${multiTFData.daily.sma200} (${multiTFData.daily.pctFromSMA200}%)`,
        `Daily RSI: ${multiTFData.daily.rsi} | ATR: ${multiTFData.daily.atr}pts | ${multiTFData.daily.cross}`,
        `5-day trend: ${multiTFData.daily.fiveDayTrend}`,
      ].join('\n') : '',
      multiTFData.weekly ? [
        `Weekly trend: ${multiTFData.weekly.trend} | ${multiTFData.weekly.momentum}`,
        `Weekly RSI: ${multiTFData.weekly.rsi} | ${multiTFData.weekly.pctFrom52H}% from 52W high | ${multiTFData.weekly.pctFrom52L}% from 52W low`,
      ].join('\n') : '',
      multiTFData.recentCandles?.length ? `Recent daily candles:\n${multiTFData.recentCandles.join('\n')}` : '',
      multiTFData.m15  ? `\n15-MIN STRUCTURE: ${multiTFData.m15.signal}` : '',
      multiTFData.h1   ? `\n1-HOUR STRUCTURE: ${multiTFData.h1.signal}` : '',
      multiTFData.crossAsset ? `\nCROSS-ASSET: ${multiTFData.crossAsset.signal}` : '',
      multiTFData.patterns?.length ? `\n═══ DAILY CANDLE SIGNALS ═══\n${multiTFData.patterns.map((p: any) => `${p.strength === 'STRONG' ? '🔴 STRONG' : '🟡 MODERATE'} ${p.name} (${p.type})\n${p.description}\n→ ${p.actionable}${p.keyLevel ? '\n📍 ' + p.keyLevel : ''}${p.confirmed ? '\n✓ CONFIRMED' : '\n⚠ Needs confirmation'}`).join('\n\n')}` : '\nNo significant daily candle patterns',
    ].filter(Boolean).join('\n') : '',
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
    traderProfile?:  any
    customRules?:    string
    lastAITime?:     string | null
    marketIntel2?:   any | null
    activeTicket?:   any | null
    actionability?:  any | null
    setupEval?:      any | null
    dayTypeForecast?: any | null
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
${(() => {
  if (!input.aiResult) return 'No signal generated yet'
  const sig = input.aiResult
  const signalPrice = sig.currentPrice || sig.entryZone?.low || null
  const nowPrice = input.market?.currentPrice || null
  const signalTime = (input as any).lastAITime || null
  const priceDrift = signalPrice && nowPrice ? (nowPrice - signalPrice).toFixed(1) : null
  const driftFlag = priceDrift && Math.abs(parseFloat(priceDrift)) > 8
    ? ` ⚠ PRICE HAS MOVED ${priceDrift}pts SINCE SIGNAL — may be stale`
    : ''
  return [
    `${sig.signal} | Confidence: ${sig.confidence || 0}% ${signalTime ? '| Generated: ' + signalTime : ''}`,
    driftFlag,
    sig.marketConditions || '',
    sig.riskFlag ? `⚠ ${sig.riskFlag}` : '',
    sig.waitReason ? `Wait reason: ${sig.waitReason}` : '',
    sig.aiView ? `AI view: ${sig.aiView}` : '',
  ].filter(Boolean).join('\n')
})()}

═══ PRE-TRADE CHECKLIST: ${input.checklistScore}/13 (${input.checklistGrade}) ═══
MET: ${input.metChecks || 'None'}
UNMET: ${input.unmetChecks || 'All clear'}

═══ ACTIVE PLAYBOOK ═══
${input.activePlaybook ? `${input.activePlaybook.name}\nEntry: ${input.activePlaybook.entry}\nStop: ${input.activePlaybook.stop}` : 'No playbook selected'}

${input.sessionMemory ? `MEMORY: ${input.sessionMemory}` : ''}

═══ 5-MIN CANDLE ANALYSIS (what price is actually doing right now) ═══
${buildRecentCandles(market.candles)}

${(input as any).patternAnalysis?.aiContext ? `═══ CHART PATTERN & FIBONACCI ANALYSIS ═══\n${(input as any).patternAnalysis.aiContext}` : ''}

${(input as any).activeTicket?.status === 'open' ? `
═══ ⚠ ACTIVE OPEN TRADE — MANAGE THIS POSITION ═══
SPX ${(input as any).activeTicket.strike}${(input as any).activeTicket.optionType === 'call' ? ' CALL' : ' PUT'} ${(input as any).activeTicket.expiry || '0DTE'}
Entry: $${(input as any).activeTicket.entryPrice} × ${(input as any).activeTicket.qty} contract(s) = $${(parseFloat((input as any).activeTicket?.entryPrice || '0') * parseInt((input as any).activeTicket?.qty || '1') * 100).toFixed(0)} cost basis
Opened: ${(input as any).activeTicket.openedAt} ET | Current SPX: ${input.market.currentPrice?.toFixed(2) || 'n/a'}
COACHING PRIORITY: You are a live trade manager. Reference this position in every response.
Help with: hold vs exit decision, stop management, target levels, time decay risk, scaling.
Be specific: use current price vs entry strike, session time remaining, charm/vanna context.` : ''}

${(input as any).actionability ? `
═══ SIGNAL ACTIONABILITY ═══
Verdict: ${(input as any).actionability.verdict} — ${(input as any).actionability.headline}
Setup type: ${(input as any).actionability.setupType}
${(input as any).actionability.invalidationPrice ? `Invalidation: ${(input as any).actionability.invalidationPrice}` : ''}
Green lights (${(input as any).actionability.greenLights?.length || 0}): ${(input as any).actionability.greenLights?.slice(0,3).join(' | ') || 'none'}
Red flags (${(input as any).actionability.redFlags?.length || 0}): ${(input as any).actionability.redFlags?.slice(0,3).join(' | ') || 'none'}
${(input as any).actionability.verdict === 'NOISE' ? 'IMPORTANT: This signal is classified NOISE — strongly advise the trader to stand aside.' : ''}
${(input as any).actionability.verdict === 'WATCH' ? 'IMPORTANT: This signal is WATCH — wait for specific triggers, do not chase.' : ''}` : ''}

${(input as any).setupEval ? `
═══ TRADER'S NAMED PLAY ═══
The trader is evaluating: ${(input as any).setupEval.setup.name} (${(input as any).setupEval.setup.direction})
Score: ${(input as any).setupEval.score}/100 — ${(input as any).setupEval.rating}
${(input as any).setupEval.verdict}
Criteria passing: ${(input as any).setupEval.confirmingCount} | Failing: ${(input as any).setupEval.contradictingCount}
${(input as any).setupEval.triggerCondition ? `Waiting for: ${(input as any).setupEval.triggerCondition}` : ''}
COACHING PRIORITY: Reference this specific setup by name. Help them stay disciplined on entry criteria.
If score < 50, gently challenge whether the setup is actually present.
If score ≥ 70, confirm the setup but reinforce stop discipline.` : ''}

${(input as any).dayTypeForecast ? `
═══ DAY TYPE FORECAST (10am ET regime read) ═══
Type: ${(input as any).dayTypeForecast.dayType} (${(input as any).dayTypeForecast.confidence} confidence)
Probabilities: TREND ${(input as any).dayTypeForecast.trendProbability}% | CONSOLIDATION ${(input as any).dayTypeForecast.consolidationProbability}% | INDETERMINATE ${(input as any).dayTypeForecast.indeterminateProbability}%
${(input as any).dayTypeForecast.directionalLean !== 'NEUTRAL' ? `Directional lean: ${(input as any).dayTypeForecast.directionalLean}` : ''}
Reasoning: ${(input as any).dayTypeForecast.reasoning}
Recommended sizing: ${(input as any).dayTypeForecast.sizingRecommendation} | Stop width: ${(input as any).dayTypeForecast.stopWidthRecommendation}
${(input as any).dayTypeForecast.recommendedSetups?.length > 0 ? `Top plays today: ${(input as any).dayTypeForecast.recommendedSetups.slice(0, 3).map((s: any) => `${s.name} (${s.probability}%)`).join(', ')}` : ''}
${(input as any).dayTypeForecast.avoidSetups?.length > 0 ? `AVOID today: ${(input as any).dayTypeForecast.avoidSetups.map((s: any) => s.name).join(', ')} — these setups fail in this regime` : ''}
COACHING PRIORITY: If the trader's named play CONTRADICTS this regime forecast, gently flag the mismatch. If it ALIGNS, reinforce the high-probability setup.` : ''}

${(input as any).microstructure?.aiContext ? `═══ MARKET MICROSTRUCTURE ═══\n${(input as any).microstructure.aiContext}\nSUMMARY: ${(input as any).microstructure.summary}` : ''}

${(input as any).breadthData?.aiContext ? `═══ MARKET BREADTH ═══\n${(input as any).breadthData.aiContext}` : ''}

${(input as any).gexData?.aiContext ? `═══ DEALER GAMMA EXPOSURE ═══\n${(input as any).gexData.aiContext}` : ''}
${(input as any).marketIntel2?.aiContext ? `═══ MARKET INTELLIGENCE ═══\n${(input as any).marketIntel2.aiContext}` : ''}

${buildEdgeSection((input as any).edgeProfile ?? null, market.vixPrice ?? null) ? `═══ YOUR HISTORICAL EDGE ═══
${buildEdgeSection((input as any).edgeProfile ?? null, market.vixPrice ?? null)}` : ''}

${(() => {
  const learnings = input.traderProfile?.chat_learnings
  if (!learnings?.length) return ''
  const last3 = learnings.slice(-3)
  const lines = ['═══ WHAT YOU KNOW ABOUT THIS TRADER (from past sessions) ═══']
  last3.forEach((l: any) => {
    if (l.keyInsight)              lines.push(`${l.tradingDate}: ${l.keyInsight}`)
    if (l.emotionalState?.notes)  lines.push(`  Emotional: ${l.emotionalState.notes}`)
    if (l.executionPatterns?.length) lines.push(`  Execution patterns: ${l.executionPatterns.slice(0,2).join('; ')}`)
  })
  return lines.join('\n')
})()}

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
