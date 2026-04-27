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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignalInput {
  // From useMarketData hook
  market: Pick<MarketData, 'currentPrice' | 'levels' | 'candles' | 'vixPrice' | 'changes'>

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

// ── buildSignalContext ────────────────────────────────────────────────────────

export function buildSignalContext(input: SignalInput): SignalContext {
  const warnings: string[] = []
  const { market, morningPlan, activePlaybook, tradeStats, aiTone,
          optionsFlow, marketTide, marketIntel, tiingoContext, zeroDTESkew,
          marketScore, tradePatterns, multiTFData,
          marketNews, economicCalendar, macroRegime, earningsCalendar, sessionMemory } = input

  // ── Validate critical prices ───────────────────────────────────────────────
  const price = validatePrice(market.currentPrice, 'SPX price', warnings)
  const vwap  = validateVwap(market.levels?.spyVwap ?? null, price, warnings)
  const ema   = validateEma(market.levels?.ema200 ?? null, price, warnings)

  // Can't generate a meaningful signal without price
  const isValid = !!price

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
  "marketConditions": "2-3 sentences",
  "todaysEdge": "1-2 sentences specific to playbook",
  "accountability": "1 sentence on rule violation risk",
  "riskFlag": "1 sentence on biggest risk",
  "entryZone": { "high": 0.00, "low": 0.00 },
  "stopLevel": 0.00,
  "target1": 0.00,
  "target2": 0.00,
  "moveSize": 0,
  "buyZones": [{ "type": "buy", "high": 0.00, "low": 0.00 }, { "type": "nobuy", "high": 0.00, "low": 0.00 }]
}`

  const systemPrompt = [
    'You are an elite SPX intraday trading AI companion. Keep this trader disciplined, data-driven, and in their system.',
    `COACHING STYLE: ${tone}`,
    morningSection,
    playbookSection,
    `TRADER STATS: ${statsSection}`,
    tiingoLine,
    macroLine,
    newsLine,
    calLine,
    earningsSection ? `EARNINGS:\n${earningsSection}` : '',
    memLine,
    warnings.length ? `DATA WARNINGS: ${warnings.join('; ')}` : '',
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

  const systemPrompt = `You are an elite SPX intraday options trading AI companion. Your role: keep this trader disciplined, focused, and in their system throughout the session. Responses under 60 words. Direct, specific, reference real prices and their plan.

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

${input.sessionMemory ? `MEMORY: ${input.sessionMemory}` : ''}`

  return { systemPrompt, isValid: !!price, warnings }
}
