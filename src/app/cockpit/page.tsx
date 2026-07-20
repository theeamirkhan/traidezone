'use client'
import TutorialModal from './TutorialModal'
import { TakeTradeModal, CloseTradeModal, ExitPromptModal, OpenPositionsStrip } from './PositionTracker'
import { ShadowValidationStream } from './ShadowValidationStream'
import { TriggerManager } from './TriggerManager'
import { processTick, newAccumulator } from './lib/triggerEngine'
import { processSetupTick, newSetupState, recommendDayContract, recommendSwingContract, detectSwingFromStructure, type SetupEngineState, type SetupFire } from './lib/setupEngine'
import { SetupStatsCard } from './SetupStatsCard'
import { FocusPanel } from './FocusPanel'
import SettingsModal from './components/SettingsModal'
import AgentStatus from './components/AgentStatus'
import AlertHistory from './components/AlertHistory'
import TradeOutcomeModal from './components/TradeOutcomeModal'
// Dynamic import — AvatarCompanion uses WebRTC/LiveKit which are browser-only
// This prevents Next.js from attempting SSR of this component
import dynamic from 'next/dynamic'
import type { AvatarCompanionHandle } from './components/AvatarCompanion'
const AvatarCompanion = dynamic(() => import('./components/AvatarCompanion'), { ssr: false })
import BacktestPanel from './components/BacktestPanel'
import EdgeDiscovery from './components/EdgeDiscovery'
import UsageReport from './components/UsageReport'
import ToneTesterComponent from './components/ToneTester'
import { useMarketData } from './hooks/useMarketData'
import { runSignal } from './ai/runSignal'
import { trackUsage } from './agents/usageTracker'
import { loadEdgeProfile, clearEdgeCache } from './agents/edgeLoader'
import { analyzePatterns, type PatternAnalysis } from './lib/patternRecognition'
import { analyzeMicrostructure, type MicrostructureResult } from './lib/marketMicrostructure'
import { scoreSignalQuality, type SignalQualityResult } from './agents/signalQuality'
import type { EdgeProfile } from './ai/buildContext'
import { buildCompanionContext } from './ai/buildContext'
import { calcProbabilities, CHECKLIST as CHECKLIST_LIB } from './lib/utils'
import { calcMarketScore, analyzeTradePatterns, analyzeTradeHistory, parseBrokerCSV } from './lib/tradeAnalysis'
import { calculateVolumeProfile } from './lib/volumeProfile'
import { calculateMechanicalFlow } from './lib/mechanicalFlow'
import { classifyActionability, type ActionabilityResult } from './lib/actionability'
import { evaluateSetup, SETUPS, type SetupEvaluation, type SetupId } from './lib/setupEvaluator'
import { forecastDayType, type DayTypeForecast } from './lib/dayTypeForecaster'
import { loadSessionMemory, addMemory, extractMemoryFromSession } from './lib/memory'
import {
  fetchMarketNews, fetchEconomicCalendar, fetchMacroRegime, fetchEarningsCalendar,
  fetchOptionsFlow, fetchMarketTide, fetchMultiTFConfluence, fetchMTFStructure, fetchZeroDTESkew, fetchMarketIntel,
  fetchTiingoContext
} from './lib/marketData'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const POLY_KEY = 'tz-polygon-key'
const ANTH_KEY = 'tz-anthropic-key'
const UW_KEY = 'tz-uw-key'
const EL_KEY = 'tz-elevenlabs-key'
const TIINGO_KEY = 'tz-tiingo-key'
const VOICE_ID = 'tz-voice-id'

// ── COLOR SYSTEM — NEURAL BLACK ────────────────────────────────────────────
// ── COLOR SYSTEM — PEARL WHITE ────────────────────────────────────────────
const C_DARK = {
  // Backgrounds — deep layered hierarchy
  bg: '#060810',
  deep: '#030408',
  surface: '#0c0f1a',
  surface2: '#111827',
  surface3: '#1a2235',
  // Borders — much more visible, teal-tinted
  border: 'rgba(0,212,160,0.10)',
  border2: 'rgba(0,212,160,0.25)',
  // Text — clear 3-tier contrast
  text: '#f0f4ff',
  textDim: '#8899bb',
  textMuted: '#4a5568',
  // PRIMARY: cyan-teal (data, prices, key info)
  teal: '#00e5ff',
  tealDim: 'rgba(0,229,255,0.08)',
  tealBorder: 'rgba(0,229,255,0.25)',
  tealGlow: 'rgba(0,229,255,0.20)',
  // SECONDARY: green (bullish, positive, confirmed)
  violet: '#00d4a0',
  violetDim: 'rgba(0,212,160,0.08)',
  violetBorder: 'rgba(0,212,160,0.25)',
  violetGlow: 'rgba(0,212,160,0.15)',
  // ACCENT: magenta (alerts, AI, special)
  pink: '#ff2d78',
  pinkDim: 'rgba(255,45,120,0.08)',
  pinkBorder: 'rgba(255,45,120,0.25)',
  // POSITIVE
  synapse: '#00ff88',
  // RISK/ALERT
  fire: '#ff6b00',
  fireDim: 'rgba(255,107,0,0.08)',
  fireBorder: 'rgba(255,107,0,0.25)',
  // NEGATIVE
  red: '#ff1a4a',
  redDim: 'rgba(255,26,74,0.08)',
  redBorder: 'rgba(255,26,74,0.25)',
  // CAUTION
  yellow: '#ffb700',
  yellowDim: 'rgba(255,183,0,0.08)',
  blue: '#1a5fa8',
  // Legacy aliases (keep for compatibility)
  purple: '#00d4a0',
  purpleDim: 'rgba(0,212,160,0.08)',
  purpleBorder: 'rgba(0,212,160,0.25)',
  purpleGlow: 'rgba(0,212,160,0.10)',
  redBorderLegacy: 'rgba(255,26,74,0.25)',
}
const C = C_DARK  // Module-level fallback; component overrides with const C = CC
// Admin user IDs — only these users see the admin link in the header
const ADMIN_USER_IDS = ['user_3BKD6y0MW6t9rxyyZo3HlywvkqT']

const font = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"

// Neural background animation injected once
if (typeof window !== 'undefined' && !document.getElementById('tz-white-style')) {
  const s = document.createElement('style')
  s.id = 'tz-white-style'
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
    * { box-sizing: border-box; }
    body { background: #060810 !important; }

    body::before {
      content: '';
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image: radial-gradient(circle, rgba(0,229,255,0.035) 1px, transparent 1px);
      background-size: 28px 28px;
    }
    body::after {
      content: '';
      position: fixed; inset: 0; z-index: 1; pointer-events: none;
      background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 4px);
    }
    #__next { position: relative; z-index: 2; }

    @keyframes priceFlashGreen { 0%{color:#00ff88 !important;text-shadow:0 0 14px rgba(0,255,136,0.9)} 100%{} }
    @keyframes priceFlashRed   { 0%{color:#ff1a4a !important;text-shadow:0 0 14px rgba(255,26,74,0.9)}  100%{} }
    .price-up   { animation: priceFlashGreen 1.2s ease-out }
    .price-down { animation: priceFlashRed   1.2s ease-out }

    @keyframes neuralSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    @keyframes neuralPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes headerScan { 0%{left:-100%;right:100%} 100%{left:100%;right:-100%} }
    @keyframes signalBreath { 0%,100%{opacity:0.4} 50%{opacity:1} }
    @keyframes aiGlow { 0%,100%{box-shadow:0 2px 8px rgba(0,229,255,0.06)} 50%{box-shadow:0 4px 20px rgba(0,229,255,0.18)} }
    @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    @keyframes scanBeam { 0%{top:-1px;opacity:0} 5%{opacity:0.6} 95%{opacity:0.3} 100%{top:100%;opacity:0} }
    @keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes brainRing { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    @keyframes lightArc { 0%{opacity:0.7} 60%{opacity:0.3} 100%{opacity:0} }
    @keyframes waveAnim { 0%,100%{height:2px;opacity:0.2} 50%{height:var(--wh,10px);opacity:0.85} }
    @keyframes listeningPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes micGlow { 0%,100%{box-shadow:0 0 12px rgba(255,26,74,0.15)} 50%{box-shadow:0 0 24px rgba(255,26,74,0.4),0 0 0 4px rgba(255,26,74,0.06)} }
    @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes probTip { 0%,100%{opacity:0.3} 50%{opacity:0.8} }
    @keyframes coreGlow { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:0.8;transform:scale(1.15)} }

    ::-webkit-scrollbar{width:3px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.18);border-radius:2px}
    ::-webkit-scrollbar-thumb:hover{background:rgba(0,229,255,0.35)}

    .header-scan::after{content:'';position:absolute;bottom:0;left:-100%;right:100%;height:1px;background:linear-gradient(90deg,transparent,#00e5ff,#00e5ff,transparent);animation:headerScan 4s linear infinite;pointer-events:none}

    input, textarea { font-family: 'JetBrains Mono','Share Tech Mono',monospace !important; caret-color: #00e5ff; }
    input:focus, textarea:focus { outline: none; border-color: rgba(0,229,255,0.45) !important; box-shadow: 0 0 0 2px rgba(0,229,255,0.08) !important; }
    button:not(:disabled):hover { filter: brightness(1.2); }
  `
  document.head.appendChild(s)
}
// ── HELPERS ────────────────────────────────────────────────────────────────
function getEST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
}
function fmt(p: number | null | undefined) {
  if (!p) return '—'
  return parseFloat(String(p)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function calcVWAP(candles: any[]) {
  let cumTPV = 0, cumVol = 0
  return candles.map(c => {
    const tp = (c.h + c.l + c.c) / 3
    cumTPV += tp * (c.v || 1)
    cumVol += (c.v || 1)
    return cumTPV / cumVol
  })
}
function calcEMA(candles: any[], period: number) {
  if (candles.length < period) return candles.map(() => null)
  const k = 2 / (period + 1)
  const result: (number | null)[] = candles.map(() => null)
  let ema = candles.slice(0, period).reduce((s: number, c: any) => s + c.c, 0) / period
  result[period - 1] = ema
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

// ── PROBABILITY ENGINE ─────────────────────────────────────────────────────
// Calculates reversal / continuation / chop probabilities from morning inputs
// Based on historical SPX/SPY behavior patterns
function __unusedCalcProbabilities({
  bias, gapDirection, gapSize, impliedMove, vixPrice, tiingoContext
}: {
  bias: string, gapDirection: string, gapSize: string,
  impliedMove: string, vixPrice: number | null, tiingoContext: any
}) {
  const gap = parseFloat(gapSize) || 0
  const im = parseFloat(impliedMove) || 0
  const vix = vixPrice || 18

  // Base probabilities — empirical SPX tendencies
  let reversal = 38, continuation = 40, chop = 22

  // Gap direction adjustments
  if (gapDirection === 'gap up') {
    reversal += 8     // Gap ups fill more often than gap downs
    continuation -= 5
    chop -= 3
  } else if (gapDirection === 'gap down') {
    reversal += 4
    continuation += 2
    chop -= 6
  }

  // Gap size adjustments
  if (gap > 0 && im > 0) {
    const gapVsIM = gap / im
    if (gapVsIM > 0.6) {
      // Large gap relative to implied move — high reversal odds
      reversal += 12
      continuation -= 8
      chop -= 4
    } else if (gapVsIM > 0.3) {
      reversal += 5
      continuation -= 3
      chop -= 2
    } else if (gap > 0 && gap < 10) {
      // Small gap — more likely to continue or chop
      reversal -= 5
      chop += 8
      continuation -= 3
    }
  }

  // Bias vs gap direction conflict/alignment
  if (bias === 'long' && gapDirection === 'gap up') {
    continuation += 8   // Aligned — continuation more likely
    reversal -= 5
    chop -= 3
  } else if (bias === 'short' && gapDirection === 'gap down') {
    continuation += 8
    reversal -= 5
    chop -= 3
  } else if (bias === 'long' && gapDirection === 'gap down') {
    reversal += 10    // Bias conflicts with gap — fade setup
    continuation -= 8
    chop -= 2
  } else if (bias === 'short' && gapDirection === 'gap up') {
    reversal += 10
    continuation -= 8
    chop -= 2
  } else if (bias === 'neutral') {
    chop += 8
    reversal -= 4
    continuation -= 4
  }

  // VIX adjustments
  if (vix > 30) {
    reversal += 8; chop += 5; continuation -= 13
  } else if (vix > 22) {
    reversal += 4; chop += 2; continuation -= 6
  } else if (vix < 14) {
    continuation += 6; chop += 3; reversal -= 9
  }

  // Tiingo historical override — if we have real data, blend it in
  if (tiingoContext?.gapFillRate && tiingoContext?.continueRate) {
    const histFill = parseFloat(tiingoContext.gapFillRate)
    const histCont = parseFloat(tiingoContext.continueRate)
    const histChop = 100 - histFill - histCont
    // Blend 40% historical, 60% model
    reversal = Math.round(reversal * 0.6 + histFill * 0.4)
    continuation = Math.round(continuation * 0.6 + histCont * 0.4)
    chop = Math.round(chop * 0.6 + Math.max(histChop, 5) * 0.4)
  }

  // Normalize to 100%
  const total = reversal + continuation + chop
  reversal = Math.round(reversal / total * 100)
  continuation = Math.round(continuation / total * 100)
  chop = 100 - reversal - continuation

  // Dominant scenario
  const max = Math.max(reversal, continuation, chop)
  const dominant = max === reversal ? 'REVERSAL' : max === continuation ? 'CONTINUATION' : 'CHOP'
  const dominantColor = dominant === 'REVERSAL' ? '#ff4d6d' : dominant === 'CONTINUATION' ? '#00d4a0' : '#f59e0b'
  const confidence = max >= 55 ? 'HIGH' : max >= 45 ? 'MODERATE' : 'LOW'

  return { reversal, continuation, chop, dominant, dominantColor, confidence, hasData: !!(bias || gap || im) }
}


const CHECKLIST = [
  { id: 'timing1', category: 'TIMING', label: 'After 10:00 AM EST' },
  { id: 'timing2', category: 'TIMING', label: 'Intraday high/low established' },
  { id: 'conf1', category: 'CONFLUENCE', label: 'Price at key level' },
  { id: 'conf2', category: 'CONFLUENCE', label: 'VWAP aligned with bias' },
  { id: 'conf3', category: 'CONFLUENCE', label: '200 EMA aligned with bias' },
  { id: 'conf4', category: 'CONFLUENCE', label: 'SPY/ES confirming direction' },
  { id: 'conf5', category: 'CONFLUENCE', label: 'VIX not spiking (< 25)' },
  { id: 'conf6', category: 'CONFLUENCE', label: 'Sector breadth aligned' },
  { id: 'risk1', category: 'RISK', label: 'Stop level defined' },
  { id: 'risk2', category: 'RISK', label: 'Max daily loss not hit' },
  { id: 'risk3', category: 'RISK', label: 'Not averaging into loser' },
  { id: 'system1', category: 'SYSTEM', label: 'Matches morning plan bias' },
  { id: 'system2', category: 'SYSTEM', label: 'Matches active playbook' },
]

// ── AI ENGINE ──────────────────────────────────────────────────────────────
async function runAI({
  candles, levels, currentPrice, impliedMove, anthKey,
  morningPlan, activePlaybook, tradeStats, optionsFlow, marketTide, marketIntel, tiingoContext,
  marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory, earningsCalendar,
  aiTone
}: any) {
  // Use last candle close if live price not yet loaded (weekend/after-hours)
  const effectivePrice = currentPrice || candles?.slice(-1)[0]?.c || null
  if (!effectivePrice) return null
  currentPrice = effectivePrice
  const recent = (candles || []).slice(-5).map((c: any) =>
    `O:${c.o?.toFixed(0)} H:${c.h?.toFixed(0)} L:${c.l?.toFixed(0)} C:${c.c?.toFixed(0)}`
  ).join(' | ')

  const playbookSection = activePlaybook
    ? `ACTIVE PLAYBOOK: "${activePlaybook.name}"
Setup: ${activePlaybook.setup}
Entry trigger: ${activePlaybook.entry}
Stop rule: ${activePlaybook.stop}
Target: ${activePlaybook.target}
Notes: ${activePlaybook.notes || 'None'}`
    : 'No playbook selected — general analysis mode'

  const morningSection = morningPlan
    ? `MORNING PLAN:
Bias: ${morningPlan.bias || 'Not set'}
Implied move: ±${morningPlan.impliedMove || '?'} pts
Key levels: ${morningPlan.keyLevels || 'Not set'}
Gap: ${morningPlan.gapDirection || 'Flat'} ${morningPlan.gapSize ? morningPlan.gapSize + 'pts' : ''}${morningPlan.notes ? `\nTrader's thesis: ${morningPlan.notes}` : ''}`
    : 'No morning plan entered'

  const statsSection = tradeStats
    ? `Overall win rate: ${tradeStats.winRate}% (${tradeStats.totalTrades} trades)
In-system: ${tradeStats.inSystemWinRate}% | Out-of-system: ${tradeStats.outSystemWinRate}%
Best setup: ${tradeStats.bestSetup || 'Unknown'}
Recent: ${tradeStats.recentForm || 'Unknown'}`
    : 'No trade history uploaded yet'

  const flowSection = optionsFlow?.length
    ? optionsFlow.slice(0, 5).map((f: any) =>
        `${f.ticker} ${(f.type||'').toUpperCase()} $${f.strike} ${f.expiry} — ${f.sentiment} ${f.premium}${f.unusual ? ' ⚡SWEEP' : ''}`
      ).join('\n')
    : 'No options flow data'

  // Format earnings for AI prompt
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = new Date(Date.now()+86400000).toISOString().split('T')[0]
  const earningsSection = earningsCalendar?.length
    ? earningsCalendar
        .filter((day: any) => day.date === todayStr || day.date === tomorrowStr)
        .map((day: any) => {
          const label = day.date === todayStr ? 'TODAY' : 'TOMORROW'
          const items = day.earnings.slice(0,3).map((e: any) => `${e.symbol} ${e.time}${e.expectedMove ? ' ±' + e.expectedMove : ''}`).join(', ')
          return `${label}: ${items}`
        }).join('\n') || 'No earnings today/tomorrow'
    : 'No earnings data'

  const tiingoSection = tiingoContext
    ? `GAP STATS: fill ${tiingoContext.gapFillRate||'N/A'}% | continuation ${tiingoContext.continueRate||'N/A'}% | avg return ${tiingoContext.avgDayReturn||'N/A'}%`
    : ''

  const toneInstructions: Record<number, string> = {
    1: "You are a DRILL SERGEANT. Be direct, blunt, and brutally honest. Call out mistakes immediately. No sugarcoating. Short sharp sentences. Hold this trader to military-level discipline.",
    2: "You are direct and firm. No fluff. Call out bad habits clearly. Be honest even when it stings. Keep the trader accountable with a tough-love approach.",
    3: "You are balanced — direct but supportive. Call out mistakes clearly but constructively. Mix accountability with encouragement based on what the trader needs.",
    4: "You are encouraging and supportive. Acknowledge progress. Frame corrections as learning opportunities. Keep energy positive while maintaining accountability.",
    5: "You are a LIFE COACH. Lead with empathy and encouragement. Reframe mistakes as growth moments. Keep the trader confident and emotionally regulated. Celebrate small wins.",
  }

  // ── PROMPT CACHING: static system prompt (cached) + dynamic user message ──
  // Static: persona, coaching style, morning plan, playbook, stats, macro, news
  // These change at most once per session → cached at $0.30/M vs $3/M (90% savings)
  // Dynamic: live price, candles, VIX, flow → fresh each call

  const aiToneVal = aiTone || 3
  // Defensive: wrap each field to prevent .length/.map crashes on undefined params
  const safeMorning = morningSection || ''
  const safePlaybook = playbookSection || ''
  const safeStats = statsSection || ''
  const safeTiingo = tiingoSection || ''
  const safeNews = marketNews ? String(marketNews).substring(0, 250) : ''
  const safeCal = economicCalendar ? String(economicCalendar).substring(0, 120) : ''
  const safeEarnings = earningsSection || ''
  const safeMem = sessionMemory ? String(sessionMemory).substring(0, 150) : ''
  const safeMacro = macroRegime ? `MACRO: ${macroRegime.regime||''} — ${macroRegime.keyRisk||''}` : ''
  const safeTone = (toneInstructions && toneInstructions[aiToneVal]) ? toneInstructions[aiToneVal] : 'Be direct and balanced.'

  const systemPrompt = [
    'You are an elite SPX intraday trading AI companion. Keep this trader disciplined, data-driven, and in their system.',
    `COACHING STYLE: ${safeTone}`,
    safeMorning,
    safePlaybook,
    `TRADER STATS:\n${safeStats}`,
    safeTiingo,
    safeMacro,
    safeNews ? `NEWS: ${safeNews}` : '',
    safeCal ? `CALENDAR: ${safeCal}` : '',
    safeEarnings ? `EARNINGS:\n${safeEarnings}` : '',
    safeMem ? `MEMORY: ${safeMem}` : '',
    `Respond ONLY with this JSON (no markdown):
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
}`,
  ].filter(Boolean).join('\n\n')

  const timeNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  const effectiveVwap = levels?.spyVwap || null
  const vwapPos = currentPrice && effectiveVwap ? (currentPrice > effectiveVwap ? 'ABOVE' : 'BELOW') : '?'
  const emaPos = currentPrice && levels?.ema200 ? (currentPrice > levels.ema200 ? 'ABOVE' : 'BELOW') : '?'  // keep for backward compat
  const ema200Daily = levels?.ema200Daily || multiTFData?.daily?.ema200 || null
  const ema200DailyPos = currentPrice && ema200Daily ? (currentPrice > ema200Daily ? 'ABOVE' : 'BELOW') : '?'

  const liveContext = `LIVE (${timeNow} ET): SPX ${fmt(currentPrice)} | VWAP ${fmt(effectiveVwap)} ${vwapPos} | 200EMA(5m) ${fmt(levels?.ema200)} ${emaPos} | 200EMA(1D) ${fmt(ema200Daily)} ${ema200DailyPos}
PDH ${fmt(levels?.pdh)} | PDL ${fmt(levels?.pdl)} | Open ${fmt(levels?.dayOpen)}
VIX ${marketIntel?.vix?.current || '?'} (${marketIntel?.vix?.level || '?'}) | Breadth ${marketIntel?.breadth?.bias || '?'} | Tide ${marketTide?.bias || '?'} P/C ${marketTide?.putCallRatio || '?'}
Candles: ${recent}
Flow: ${flowSection}${zeroDTESkew ? `\n0DTE: ${zeroDTESkew.skewLabel} P/C ${zeroDTESkew.pcRatio}` : ''}${marketScore ? `\nScore: ${marketScore.score}/100 ${marketScore.label}` : ''}${tradePatterns?.revengePatterns > 2 ? '\n⚠ REVENGE TRADING PATTERN ACTIVE' : ''}${multiTFData ? `\nMTF: ${multiTFData.confluence}` : ''}`

  let systemPromptSafe = systemPrompt
  let liveContextSafe = liveContext
  try { systemPromptSafe = systemPrompt } catch { systemPromptSafe = 'You are a trading AI companion.' }
  try { liveContextSafe = liveContext } catch { liveContextSafe = `SPX at ${effectivePrice}` }

  try {
    // 20s timeout — if Anthropic doesn't respond, fail fast
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    let res: Response
    try {
      res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          system: [{ type: 'text', text: systemPromptSafe, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: liveContextSafe }],
        }),
      })
    } finally {
      clearTimeout(timeout)
    }
    const data = await res.json()
    if (data.error || data?.error?.type === 'overloaded_error') return null
    const text = (data.content || []).map((i: any) => i.text || '').join('').replace(/```json|```/g, '').trim()
    if (!text) return null
    return JSON.parse(text)
  } catch { return null }
}


// ── #1 REAL-TIME NEWS ──────────────────────────────────────────────────────
async function _legacyFetchMarketNews(anthKey: string): Promise<string> {
  if (!anthKey) anthKey = 'server'
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for the top 3-4 US stock market news headlines right now for today ${new Date().toLocaleDateString('en-US')}. Focus on: Fed/economic data, macro events, SPX/SPY moves, anything that affects intraday trading today. Return ONLY a brief bullet summary like:
• [headline 1 in 1 sentence]
• [headline 2 in 1 sentence]
• [headline 3 in 1 sentence]
No preamble, just the bullets.` }]
      })
    })
    const data = await res.json()
    if (data?.error?.type === 'overloaded_error') return 'AI busy — news unavailable'
    const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    return text || 'No market news retrieved'
  } catch { return 'News unavailable' }
}

// ── #2 ECONOMIC CALENDAR ───────────────────────────────────────────────────
async function _legacyFetchEconomicCalendar(anthKey: string): Promise<string> {
  if (!anthKey) anthKey = 'server'
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for the US economic calendar events for today ${today}. Include: FOMC meetings/Fed speakers, CPI/PPI/NFP/GDP releases, Treasury auctions, major earnings (if pre/post market). Return ONLY in this format:
• HH:MM ET — Event Name (Impact: High/Med/Low)
• HH:MM ET — Event Name (Impact: High/Med/Low)
If no major events, say "No major catalysts today". No preamble.` }]
      })
    })
    const data = await res.json()
    const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    return text || 'No calendar events found'
  } catch { return 'Calendar unavailable' }
}

// ── #3 COMPOSITE MARKET SCORE (0-100) ──────────────────────────────────────
function _legacyCalcMarketScore({
  vixPrice, marketIntel, marketTide, optionsFlow, currentPrice, levels
}: any): { score: number, label: string, color: string, breakdown: any } {
  let score = 50 // neutral baseline
  const breakdown: any = {}

  // VIX component (20pts) — lower VIX = better conditions
  if (vixPrice) {
    const vixScore = vixPrice < 14 ? 20 : vixPrice < 18 ? 15 : vixPrice < 22 ? 10 : vixPrice < 28 ? 5 : 0
    score += (vixScore - 10) // center around 0
    breakdown.vix = { score: vixScore, label: vixPrice < 14 ? 'Calm' : vixPrice < 18 ? 'Normal' : vixPrice < 22 ? 'Elevated' : 'High' }
  }

  // Breadth component (20pts)
  if (marketIntel?.breadth) {
    const { advancing, declining } = marketIntel.breadth
    const breadthScore = advancing >= 7 ? 20 : advancing >= 5 ? 14 : advancing >= 4 ? 8 : 3
    score += (breadthScore - 10)
    breakdown.breadth = { score: breadthScore, label: marketIntel.breadth.bias }
  }

  // Market tide (15pts) — call heavy = bullish
  if (marketTide) {
    const tideScore = marketTide.bias === 'CALL HEAVY' ? 15 : marketTide.bias === 'PUT HEAVY' ? 3 : 9
    score += (tideScore - 7)
    breakdown.tide = { score: tideScore, label: marketTide.bias }
  }

  // Options flow sentiment (15pts)
  if (optionsFlow?.length > 0) {
    const bullish = optionsFlow.filter((f: any) => f.sentiment === 'BULLISH').length
    const bearish = optionsFlow.filter((f: any) => f.sentiment === 'BEARISH').length
    const flowScore = bullish > bearish * 1.5 ? 15 : bearish > bullish * 1.5 ? 3 : 9
    score += (flowScore - 7)
    breakdown.flow = { score: flowScore, label: `${bullish}↑ ${bearish}↓` }
  }

  // VWAP position (10pts)
  if (currentPrice && levels?.spyVwap) {
    const vwapScore = currentPrice > levels.spyVwap ? 10 : 3
    score += (vwapScore - 5)
    breakdown.vwap = { score: vwapScore, label: currentPrice > levels.spyVwap ? 'Above' : 'Below' }
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score))
  const label = score >= 75 ? 'STRONG BULL' : score >= 60 ? 'BULLISH' : score >= 45 ? 'NEUTRAL' : score >= 30 ? 'BEARISH' : 'STRONG BEAR'
  const color = score >= 65 ? '#00aa55' : score >= 45 ? '#e05000' : '#cc1040'

  return { score: Math.round(score), label, color, breakdown }
}

// ── #4 MULTI-TIMEFRAME CONFLUENCE ──────────────────────────────────────────
async function _legacyFetchMultiTFConfluence(polyKey: string, ticker: string): Promise<any> {
  if (!polyKey) return null
  try {
    const today = new Date()
    const oneYearAgo = new Date(today); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const threeMonthsAgo = new Date(today); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const proxy = (path: string) => fetch(`/api/polygon?apiKey=${polyKey || 'env'}&path=${encodeURIComponent(path)}`)

    const [weeklyRes, dailyRes] = await Promise.all([
      proxy(`/v2/aggs/ticker/${ticker}/range/1/week/${fmt(oneYearAgo)}/${fmt(today)}?adjusted=true&sort=asc&limit=60`),
      proxy(`/v2/aggs/ticker/${ticker}/range/1/day/${fmt(threeMonthsAgo)}/${fmt(today)}?adjusted=true&sort=asc&limit=65`),
    ])
    const [weeklyData, dailyData] = await Promise.all([weeklyRes.json(), dailyRes.json()])

    const weekly = weeklyData.results || []
    const daily = dailyData.results || []
    if (!weekly.length || !daily.length) return null

    // Weekly trend — is price above 20-week MA?
    const w20 = weekly.slice(-20).reduce((s: number, c: any) => s + c.c, 0) / Math.min(20, weekly.length)
    const latestWeekClose = weekly[weekly.length - 1]?.c
    const weeklyTrend = latestWeekClose > w20 ? 'BULLISH' : 'BEARISH'
    const weeklyTrendStrength = Math.abs(((latestWeekClose - w20) / w20) * 100).toFixed(1)

    // Daily trend — 20-day MA direction
    const d20 = daily.slice(-20).reduce((s: number, c: any) => s + c.c, 0) / Math.min(20, daily.length)
    const d5 = daily.slice(-5).reduce((s: number, c: any) => s + c.c, 0) / Math.min(5, daily.length)
    const dailyTrend = d5 > d20 ? 'BULLISH' : 'BEARISH'

    // Key weekly levels
    const highestHigh = Math.max(...weekly.slice(-20).map((c: any) => c.h))
    const lowestLow = Math.min(...weekly.slice(-20).map((c: any) => c.l))

    // Confluence check
    const allAligned = weeklyTrend === dailyTrend
    const confluenceLabel = allAligned
      ? (weeklyTrend === 'BULLISH' ? 'ALL TIMEFRAMES BULLISH ✓' : 'ALL TIMEFRAMES BEARISH ✓')
      : `MIXED — Weekly ${weeklyTrend}, Daily ${dailyTrend}`

    return {
      weekly: { trend: weeklyTrend, ma20: Math.round(w20), strength: weeklyTrendStrength + '%' },
      daily: { trend: dailyTrend, ma20: Math.round(d20), ma5: Math.round(d5) },
      confluence: confluenceLabel,
      aligned: allAligned,
      weeklyRange: { high: Math.round(highestHigh), low: Math.round(lowestLow) }
    }
  } catch { return null }
}

// ── #5 SPX 0DTE OPTIONS SKEW ───────────────────────────────────────────────
async function _legacyFetchZeroDTESkew(uwKey: string): Promise<any> {
  // Always use server-side proxy
  uwKey = 'server'
  try {
    // Fetch today's SPX 0DTE options flow specifically
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/flow?path=/api/option-trades/flow-alerts?ticker=SPXW&date=${today}&limit=30`, {
      headers: {}
    })
    if (!res.ok) return null
    const data = await res.json()
    const alerts = data.data || data || []

    if (!alerts.length) return null

    // Analyze call vs put volume and premium
    let callVol = 0, putVol = 0, callPremium = 0, putPremium = 0
    let unusualCalls = 0, unusualPuts = 0
    alerts.forEach((a: any) => {
      const isCall = (a.type || a.option_type || '').toUpperCase().startsWith('C')
      const vol = parseFloat(a.volume || a.contracts || 0)
      const prem = parseFloat(a.premium || a.total_premium || 0)
      if (isCall) { callVol += vol; callPremium += prem; if (a.unusual) unusualCalls++ }
      else { putVol += vol; putPremium += prem; if (a.unusual) unusualPuts++ }
    })

    const totalPremium = callPremium + putPremium
    const callPct = totalPremium > 0 ? Math.round((callPremium / totalPremium) * 100) : 50
    const pcRatio = putVol > 0 ? (putVol / callVol).toFixed(2) : 'N/A'
    const skewLabel = callPct > 60 ? 'CALL SKEWED — bullish 0DTE flow' : callPct < 40 ? 'PUT SKEWED — bearish 0DTE flow' : 'BALANCED 0DTE flow'

    return {
      callPct, putPct: 100 - callPct,
      callPremium: '$' + (callPremium / 1000).toFixed(0) + 'K',
      putPremium: '$' + (putPremium / 1000).toFixed(0) + 'K',
      pcRatio, skewLabel, unusualCalls, unusualPuts,
      totalAlerts: alerts.length
    }
  } catch { return null }
}

// ── #6 TRADE PATTERN ANALYSIS ──────────────────────────────────────────────
function _legacyAnalyzeTradePatterns(trades: any[]): any {
  if (!trades || trades.length < 5) return null

  const patterns: any = {
    byHour: {} as any,
    byDay: {} as any,
    bySetup: {} as any,
    streaks: { current: 0, longest: 0, currentType: '' },
    avgWinnerSize: 0, avgLoserSize: 0,
    bestHour: '', worstHour: '',
    revengePatterns: 0,
    cutWinnersEarly: false,
    holdingLosers: false
  }

  // By hour analysis
  trades.forEach((t: any) => {
    if (!t.pnl) return
    const hour = t.time ? new Date('1970-01-01T' + t.time).getHours() : null
    if (hour !== null) {
      if (!patterns.byHour[hour]) patterns.byHour[hour] = { wins: 0, losses: 0, pnl: 0 }
      if (t.pnl > 0) patterns.byHour[hour].wins++
      else patterns.byHour[hour].losses++
      patterns.byHour[hour].pnl += parseFloat(t.pnl)
    }

    // By setup
    if (t.setup || t.notes) {
      const key = (t.setup || 'unknown').toLowerCase().substring(0, 20)
      if (!patterns.bySetup[key]) patterns.bySetup[key] = { wins: 0, losses: 0, pnl: 0, count: 0 }
      patterns.bySetup[key].count++
      if (t.pnl > 0) patterns.bySetup[key].wins++
      else patterns.bySetup[key].losses++
      patterns.bySetup[key].pnl += parseFloat(t.pnl)
    }
  })

  // Revenge trading detection — loss followed by trade within 10 mins
  for (let i = 1; i < trades.length; i++) {
    if (trades[i-1].pnl < 0 && trades[i].time && trades[i-1].time) {
      const timeDiff = Math.abs(new Date('1970-01-01T' + trades[i].time).getTime() - new Date('1970-01-01T' + trades[i-1].time).getTime())
      if (timeDiff < 600000) patterns.revengePatterns++
    }
  }

  // Best/worst hour
  const hourEntries = Object.entries(patterns.byHour) as [string, any][]
  if (hourEntries.length > 0) {
    const bestHourEntry = hourEntries.sort((a, b) => b[1].pnl - a[1].pnl)[0]
    const worstHourEntry = hourEntries.sort((a, b) => a[1].pnl - b[1].pnl)[0]
    patterns.bestHour = `${bestHourEntry[0]}:00 (${bestHourEntry[1].pnl >= 0 ? '+' : ''}$${Math.round(bestHourEntry[1].pnl)})`
    patterns.worstHour = `${worstHourEntry[0]}:00 (${worstHourEntry[1].pnl >= 0 ? '+' : ''}$${Math.round(worstHourEntry[1].pnl)})`
  }

  // Winner/loser size
  const winners = trades.filter(t => t.pnl > 0).map(t => parseFloat(t.pnl))
  const losers = trades.filter(t => t.pnl < 0).map(t => Math.abs(parseFloat(t.pnl)))
  patterns.avgWinnerSize = winners.length ? Math.round(winners.reduce((a,b) => a+b,0) / winners.length) : 0
  patterns.avgLoserSize = losers.length ? Math.round(losers.reduce((a,b) => a+b,0) / losers.length) : 0
  patterns.cutWinnersEarly = patterns.avgWinnerSize < patterns.avgLoserSize * 0.7

  // Win streak
  let currentStreak = 0, longestStreak = 0, lastType = ''
  trades.forEach((t: any) => {
    const type = t.pnl > 0 ? 'win' : 'loss'
    if (type === lastType) { currentStreak++; longestStreak = Math.max(longestStreak, currentStreak) }
    else { currentStreak = 1; lastType = type }
  })
  patterns.streaks = { current: currentStreak, longest: longestStreak, currentType: lastType }

  return patterns
}

// ── #7 MACRO REGIME ────────────────────────────────────────────────────────
async function _legacyFetchEarningsCalendar(): Promise<any[]> {
  try {
    // Fetch next 5 trading days of earnings
    const today = new Date()
    const results: any[] = []
    for (let i = 0; i <= 5; i++) {
      const d = new Date(today.getTime() + i * 86400000)
      const dateStr = d.toISOString().split('T')[0]
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue // skip weekends
      try {
        const res = await fetch(`/api/flow?path=/api/earnings/afterhours?date=${dateStr}`)
        const data = await res.json()
        const dayEarnings = (data.data || [])
          .filter((e: any) => e.is_s_p_500 || parseFloat(e.marketcap || 0) > 5e9) // S&P500 or large cap
          .sort((a: any, b: any) => parseFloat(b.marketcap || 0) - parseFloat(a.marketcap || 0))
          .slice(0, 8)
          .map((e: any) => ({
            symbol: e.symbol,
            name: e.full_name,
            date: dateStr,
            time: e.report_time === 'premarket' ? 'BMO' : e.report_time === 'postmarket' ? 'AMC' : 'AH',
            epsEst: e.street_mean_est ? '$' + parseFloat(e.street_mean_est).toFixed(2) : null,
            expectedMove: e.expected_move_perc ? (parseFloat(e.expected_move_perc) * 100).toFixed(1) + '%' : null,
            isSP500: e.is_s_p_500,
          }))
        if (dayEarnings.length) results.push({ date: dateStr, earnings: dayEarnings })
      } catch {}
    }
    return results
  } catch { return [] }
}

async function _legacyFetchMacroRegime(anthKey: string): Promise<any> {
  if (!anthKey) anthKey = 'server'
  // Only refresh once per day — cache in localStorage
  const cacheKey = 'tz-macro-regime'
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    try {
      const { date, data } = JSON.parse(cached)
      if (date === new Date().toISOString().split('T')[0]) return data
    } catch {}
  }

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for the current Fed monetary policy stance and US market macro regime as of today ${new Date().toLocaleDateString()}. Answer these 4 questions in JSON only:
{
  "fedStance": "HIKING | CUTTING | HOLDING | PAUSING",
  "rateLevel": "current fed funds rate as string e.g. 5.25-5.50%",
  "regime": "RISK-ON | RISK-OFF | TRANSITIONING",
  "regimeSummary": "1 sentence about current macro environment",
  "keyRisk": "1 sentence on biggest macro risk right now"
}
Respond with ONLY valid JSON.` }]
      })
    })
    const data = await res.json()
    const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').replace(/\`\`\`json|\`\`\`/g, '').trim()
    const regime = JSON.parse(text)
    localStorage.setItem(cacheKey, JSON.stringify({ date: new Date().toISOString().split('T')[0], data: regime }))
    return regime
  } catch { return null }
}

// ── #8 SESSION MEMORY ──────────────────────────────────────────────────────
const SESSION_MEMORY_KEY = 'tz-session-memory'

function _legacyLoadSessionMemory(): string {
  try {
    const mem = localStorage.getItem(SESSION_MEMORY_KEY)
    return mem ? JSON.parse(mem).join('\n') : ''
  } catch { return '' }
}

function _legacySaveSessionMemory(memories: string[]): void {
  try {
    // Keep last 20 memory entries
    localStorage.setItem(SESSION_MEMORY_KEY, JSON.stringify(memories.slice(-20)))
  } catch {}
}

function _legacyAddMemory(entry: string): void {
  try {
    const existing = JSON.parse(localStorage.getItem(SESSION_MEMORY_KEY) || '[]')
    const dated = `[${new Date().toLocaleDateString()}] ${entry}`
    _legacySaveSessionMemory([...existing, dated])
  } catch {}
}

async function _legacyExtractMemoryFromSession(anthKey: string, chatHistory: any[], tradePatterns: any, traderProfile: any): Promise<void> {
  if (!anthKey || chatHistory.length < 3) return
  try {
    const recentChat = chatHistory.slice(-8).map((m: any) => `${m.role}: ${m.content}`).join('\n')
    const patternNote = tradePatterns?.revengePatterns > 2 ? 'Note: user shows revenge trading patterns.' : ''
    const existingWeaknesses = traderProfile?.weaknesses?.join(', ') || ''
    const existingStrengths = traderProfile?.strengths?.join(', ') || ''

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Analyze this trading session conversation and extract insights about the trader's psychology and behavior patterns.

Known weaknesses: ${existingWeaknesses || 'none yet'}
Known strengths: ${existingStrengths || 'none yet'}
${patternNote}

Session chat:
${recentChat}

Return ONLY a JSON object with these fields (omit fields with no new data):
{
  "memories": ["short dated fact about trader", "another fact"],
  "new_strengths": ["if new strength observed"],
  "new_weaknesses": ["if new weakness observed"],
  "new_triggers": ["emotional trigger if observed"],
  "tone_suggestion": "direct|coaching|analytical|tough-love (only if chat reveals preference)"
}
Return {} if nothing notable. No markdown, no explanation.` }]
      })
    })
    const data = await res.json()
    const raw = data.content?.[0]?.text?.replace(/\`\`\`json|\`\`\`/g, '').trim() || '{}'
    const extracted = JSON.parse(raw)

    // Save memories to localStorage (backward compat)
    if (Array.isArray(extracted.memories) && extracted.memories.length > 0) {
      extracted.memories.forEach((m: string) => addMemory(m))
    }

    // Save richer profile data to Supabase
    const profileUpdate: any = {}
    if (extracted.memories?.length > 0) {
      // PATCH appends memories to memory_log in Supabase
      fetch('/api/trader-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: extracted.memories })
      }).catch(() => {})
    }
    if (extracted.new_strengths?.length > 0) profileUpdate.strengths = [...(traderProfile?.strengths || []), ...extracted.new_strengths].slice(-10)
    if (extracted.new_weaknesses?.length > 0) profileUpdate.weaknesses = [...(traderProfile?.weaknesses || []), ...extracted.new_weaknesses].slice(-10)
    if (extracted.new_triggers?.length > 0) profileUpdate.emotional_triggers = [...(traderProfile?.emotional_triggers || []), ...extracted.new_triggers].slice(-10)
    if (extracted.tone_suggestion) profileUpdate.companion_tone = extracted.tone_suggestion

    if (Object.keys(profileUpdate).length > 0) {
      fetch('/api/trader-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileUpdate)
      }).catch(() => {})
    }
  } catch {}
}

// ── MARKET INTEL ───────────────────────────────────────────────────────────
async function _legacyFetchMarketIntel(polyKey: string) {
  if (!polyKey) return {}
  try {
    const est = getEST()
    const fmt2 = (d: Date) => d.toISOString().split('T')[0]
    const today = fmt2(est)
    const weekAgo = new Date(est); weekAgo.setDate(weekAgo.getDate() - 7)
    const proxy = (path: string) =>
      fetch(`/api/polygon?apiKey=${polyKey || 'env'}&path=${encodeURIComponent(path)}`).then(r => r.json()).catch(() => null)
    const sectors = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'QQQ', 'IWM', 'TLT']
    const results = await Promise.all(
      sectors.map(t => proxy(`/v2/aggs/ticker/${t}/range/1/day/${fmt2(weekAgo)}/${today}?adjusted=true&sort=asc&limit=10`))
    )
    const sectorData: any = {}
    sectors.forEach((ticker, i) => {
      const d = results[i]
      if (d?.results?.length >= 2) {
        const r = d.results
        sectorData[ticker] = {
          weekChange: ((r[r.length-1].c - r[0].c) / r[0].c * 100).toFixed(2),
          todayChange: ((r[r.length-1].c - r[r.length-1].o) / r[r.length-1].o * 100).toFixed(2),
        }
      }
    })
    const vixRes = await proxy(`/v2/aggs/ticker/I:VIX/range/1/day/${fmt2(weekAgo)}/${today}?adjusted=true&sort=asc&limit=10`)
    const vix: any = {}
    if (vixRes?.results?.length >= 2) {
      const vr = vixRes.results
      const vixLast = vr[vr.length-1].c
      const vixPrev = vr[vr.length-2].c
      vix.current = vixLast.toFixed(2)
      vix.dayChange = (vixLast - vixPrev).toFixed(2)
      vix.level = vixLast > 30 ? 'EXTREME' : vixLast > 20 ? 'ELEVATED' : vixLast > 15 ? 'NORMAL' : 'LOW'
      vix.trend = vixLast > vixPrev ? 'RISING' : 'FALLING'
    }
    const coreSectors = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU']
    const advancing = coreSectors.filter(s => sectorData[s] && parseFloat(sectorData[s].todayChange) > 0).length
    const declining = coreSectors.filter(s => sectorData[s] && parseFloat(sectorData[s].todayChange) < 0).length
    const breadth = {
      advancing, declining,
      bias: advancing >= 6 ? 'BROAD STRENGTH' : declining >= 6 ? 'BROAD WEAKNESS' : advancing > declining ? 'SLIGHT BULLISH' : 'SLIGHT BEARISH',
    }
    return { sectors: sectorData, vix, breadth }
  } catch { return {} }
}

async function _legacyFetchOptionsFlow(uwKey: string) {
  try {
    const res = await fetch('/api/flow?path=/api/option-trades/flow-alerts?limit=50')
    if (!res.ok) return []
    const data = await res.json()
    const all = data.data || []

    // Sort by total premium — biggest money first
    all.sort((a: any, b: any) => parseFloat(b.total_premium || 0) - parseFloat(a.total_premium || 0))

    return all
      .slice(0, 15)
      .map((a: any) => {
        const askPrem = parseFloat(a.total_ask_side_prem || 0)
        const bidPrem = parseFloat(a.total_bid_side_prem || 0)
        const total = parseFloat(a.total_premium || 0)
        // Ask-side = aggressive buyer (bullish for calls, bearish for puts)
        // Bid-side = aggressive seller
        const askPct = total > 0 ? askPrem / total : 0.5
        const isBullish = a.type === 'call' ? askPct > 0.6 : askPct < 0.4
        const isBearish = a.type === 'call' ? askPct < 0.4 : askPct > 0.6
        const sentiment = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL'
        const premK = Math.round(total / 1000)
        return {
          ticker: a.ticker,
          type: a.type || a.put_call,
          strike: a.strike,
          expiry: a.expiry ? a.expiry.substring(5) : '',  // MM-DD
          sentiment,
          premium: premK + 'K',
          unusual: a.has_sweep || a.alert_rule === 'UnusualActivity',
          size: a.total_size,
        }
      })
  } catch { return [] }
}

async function _legacyFetchMarketTide(uwKey: string) {
  try {
    const res = await fetch('/api/flow?path=/api/market/market-tide', {
      headers: {}
    })
    if (!res.ok) return null
    const data = await res.json()
    const tide = (data.data || [])
    if (!tide.length) return null
    const latest = tide[tide.length - 1]
    const callP = parseFloat(latest.net_call_premium || latest.call_premium || 0)
    const putP = parseFloat(latest.net_put_premium || latest.put_premium || 0)
    const ratio = callP > 0 ? (putP / callP).toFixed(2) : null
    return {
      callPremium: (callP / 1e6).toFixed(1) + 'M',
      putPremium: (putP / 1e6).toFixed(1) + 'M',
      putCallRatio: ratio,
      callPremiumM: (callP / 1e6).toFixed(1),
      putPremiumM: (putP / 1e6).toFixed(1),
      bias: ratio && parseFloat(ratio) > 1.2 ? 'PUT HEAVY (bearish)' : ratio && parseFloat(ratio) < 0.8 ? 'CALL HEAVY (bullish)' : 'BALANCED',
    }
  } catch { return null }
}

// ── TIINGO HISTORICAL CONTEXT ──────────────────────────────────────────────
async function _legacyFetchTiingoContext(tiingoKey: string, gapDirection: string, gapSize: string, impliedMove: string) {
  if (!tiingoKey) return null
  try {
    const today = new Date()
    const oneYearAgo = new Date(today)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    // Fetch 1 year of SPY daily data from Tiingo
    const res = await fetch(
      `https://api.tiingo.com/tiingo/daily/SPY/prices?startDate=${fmt(oneYearAgo)}&endDate=${fmt(today)}&token=${tiingoKey}`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length < 50) return null

    // Analyze gap behavior
    const gaps: any[] = []
    for (let i = 1; i < data.length; i++) {
      const prevClose = data[i-1].adjClose
      const open = data[i].adjOpen
      const close = data[i].adjClose
      const gapPct = ((open - prevClose) / prevClose) * 100
      const dayReturn = ((close - open) / open) * 100
      const filled = gapPct > 0 ? close < prevClose : close > prevClose
      gaps.push({ date: data[i].date, gapPct, dayReturn, filled, open, close, prevClose })
    }

    // Filter relevant gap scenarios
    const gapSizePts = parseFloat(gapSize) || 0
    const gapSizePct = gapSizePts > 0 ? (gapSizePts / 580) * 100 : 0 // approx SPY price
    const isGapUp = gapDirection === 'gap up'
    const relevantGaps = gaps.filter(g =>
      isGapUp ? (g.gapPct > 0.2 && g.gapPct < gapSizePct + 0.3) : (g.gapPct < -0.2 && g.gapPct > -(gapSizePct + 0.3))
    )

    // Implied move accuracy
    const imPts = parseFloat(impliedMove) || 0
    const imPct = imPts > 0 ? (imPts / 580) * 100 : 0
    const imAccuracy = gaps.filter(g => Math.abs(g.dayReturn) <= imPct).length / gaps.length * 100

    const gapFillRate = relevantGaps.length
      ? relevantGaps.filter(g => g.filled).length / relevantGaps.length * 100
      : null

    const avgDayReturn = relevantGaps.length
      ? relevantGaps.reduce((s, g) => s + g.dayReturn, 0) / relevantGaps.length
      : null

    const continueRate = relevantGaps.length
      ? relevantGaps.filter(g => isGapUp ? g.dayReturn > 0 : g.dayReturn < 0).length / relevantGaps.length * 100
      : null

    return {
      sampleSize: relevantGaps.length,
      gapFillRate: gapFillRate ? gapFillRate.toFixed(1) : null,
      avgDayReturn: avgDayReturn ? avgDayReturn.toFixed(2) : null,
      continueRate: continueRate ? continueRate.toFixed(1) : null,
      imAccuracy: imAccuracy.toFixed(1),
      totalDays: gaps.length,
      summary: relevantGaps.length >= 5
        ? `Based on ${relevantGaps.length} similar ${gapDirection || 'gap'} sessions in past year: gap fills ${gapFillRate?.toFixed(0)}% of time, continues ${continueRate?.toFixed(0)}%. Implied move accurate ${imAccuracy.toFixed(0)}% of days.`
        : `Limited historical data for this gap size (${relevantGaps.length} matches). Implied move accurate ${imAccuracy.toFixed(0)}% of days historically.`
    }
  } catch (e) { return null }
}
function _legacyParseBrokerCSV(text: string): any[] {
  // Detect delimiter: TOS Account Statement uses tabs, generic CSVs use commas
  const firstDataLine = text.split('\n').find(l => l.trim() && !l.startsWith(' ') && l.includes('\t'))
  const delim = firstDataLine ? '\t' : ','

  const rawLines = text.split('\n')

  // Find the header row — look for DATE/TIME/TYPE or similar columns
  let headerIdx = -1
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]
    const cols = l.split(delim).map(c => c.trim().toLowerCase())
    if (cols.includes('date') || cols.includes('exec time') || cols.includes('exec_time')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const headers = rawLines[headerIdx].split(delim).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, ''))
  const dataLines = rawLines.slice(headerIdx + 1)

  const trades: any[] = []
  // Group by date for consolidating multi-leg fills into single trade P&L
  const byDate: Record<string, number> = {}
  const byDateDesc: Record<string, string> = {}

  for (const line of dataLines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const cols = trimmed.split(delim)
    const row: any = {}
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim().replace(/^"|"$/g, '') })

    // TOS Account Statement format: has DATE, TIME, TYPE, DESCRIPTION, AMOUNT columns
    const type = (row.type || '').trim().toUpperCase()

    // Only process TRD (trade) rows, skip BAL, RAD, DOI, WIN, JRN, CDB, EXP etc
    if (type && type !== 'TRD') continue

    // Parse date — normalize M/D/YY or M/D/YYYY to YYYY-MM-DD
    const rawDate = (row.date || row.exec_time || row.time || row.trade_date || '').split(' ')[0]
    const time = row.time || (row.exec_time || '').split(' ')[1] || ''
    let date = rawDate
    const dm = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (dm) {
      const yr = dm[3].length === 2 ? '20' + dm[3] : dm[3]
      date = yr + '-' + dm[1].padStart(2, '0') + '-' + dm[2].padStart(2, '0')
    }
    if (!date) continue

    // Get AMOUNT — this is the actual dollar P&L for this execution line
    const amountStr = (row.amount || row.net_amount || row.p_l || row.pnl || '').replace(/,/g, '')
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount === 0) continue

    // Parse description to get symbol and direction
    const desc = row.description || ''
    // TOS desc format: "SOLD -1 SPX 100 (Weeklys) 17 MAR 25 5700 CALL @4.00 CBOE"
    //                  "BOT +6 NVDA 100 21 MAR 25 120 PUT @3.95"
    const descUpper = desc.toUpperCase()
    const isSold = descUpper.startsWith('SOLD')
    const isBot = descUpper.startsWith('BOT')
    const isCall = descUpper.includes(' CALL')
    const isPut = descUpper.includes(' PUT')

    // Extract symbol (first word after BOT/SOLD +/-N)
    const symbolMatch = desc.match(/(?:BOT|SOLD)\s+[+-]?\d+\s+(\w+)/i)
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : (row.symbol || row.ticker || '')
    if (!symbol) continue

    // For TOS: each SOLD adds to account (credit), each BOT subtracts (debit)
    // AMOUNT already reflects this — positive = received cash (could be sell-to-open OR sell-to-close)
    // We want P&L per round-trip. Since we have AMOUNT directly, accumulate by date+symbol+expiry
    const expMatch = desc.match(/(\d{1,2}\s+\w{3}\s+\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i)
    const exp = expMatch ? expMatch[0].replace(/\s+/g, '-') : ''
    const strikeMatch = desc.match(/(\d{4,5}(?:\.\d+)?)\s+(CALL|PUT)/i)
    const strike = strikeMatch ? strikeMatch[1] : ''
    const optType = strikeMatch ? strikeMatch[2].toUpperCase() : ''

    // Key = date + symbol + exp + strike + type to group related fills
    const tradeKey = date + '|' + symbol + '|' + exp + '|' + strike + '|' + optType

    if (!byDate[tradeKey]) {
      byDate[tradeKey] = 0
      byDateDesc[tradeKey] = symbol + (optType ? ' ' + strike + optType[0] : '') + ' ' + date
    }
    byDate[tradeKey] += amount
  }

  // Convert aggregated P&L to trade records
  for (const [key, pnl] of Object.entries(byDate)) {
    const parts = key.split('|')
    const date = parts[0]
    const symbol = parts[1]
    const optType = parts[4]
    const direction = optType === 'CALL' ? 'call' : optType === 'PUT' ? 'put' : 'other'
    const desc = byDateDesc[key]
    // Only include if there's a net P&L (completed round-trip or partial)
    trades.push({
      date,
      symbol,
      direction,
      pnl: parseFloat(pnl.toFixed(2)),
      notes: desc,
      playbook: '',
    })
  }

  // Sort by date
  trades.sort((a, b) => a.date.localeCompare(b.date))
  return trades
}
function _legacyAnalyzeTradeHistory(trades: any[]) {
  if (!trades.length) return null
  const winners = trades.filter(t => t.pnl > 0)
  const losers = trades.filter(t => t.pnl < 0)
  const winRate = Math.round(winners.length / trades.length * 100)
  const avgWin = winners.length ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0
  const avgLoss = losers.length ? Math.abs(losers.reduce((s, t) => s + t.pnl, 0) / losers.length) : 0
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  return {
    totalTrades: trades.length,
    winRate,
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '≈',
    totalPnl: totalPnl.toFixed(2),
    inSystemWinRate: winRate, // simplified — user can tag later
    outSystemWinRate: Math.max(0, winRate - 15),
    recentForm: trades.slice(-5).filter(t => t.pnl > 0).length + '/5 recent winners',
  }
}

// ── BRAND LOGO COMPONENT ───────────────────────────────────────────────────
const TZ = () => (
  <span>tr<span style={{color:'#00d4a0',fontWeight:900}}>AI</span>de Zone</span>
)

// ── SETTINGS MODAL ─────────────────────────────────────────────────────────
// ── TONE TESTER (legacy — moved to components/ToneTester.tsx) ──────────────
const TONE_SCENARIOS = [
  "I just revenge traded after hitting my daily loss limit. Took 3 extra trades and gave back everything.",
  "SPX is sitting right at VWAP. I want to go long but my checklist score is 4/13.",
  "I had a perfect setup at 10:15 and missed the entry because I hesitated. Now it's moved 30 points without me.",
  "I'm up $800 on the day. Should I take one more trade? The setup looks good.",
  "I've been staring at the screen for 2 hours and haven't taken a trade. I'm second-guessing everything.",
]

const TONE_NAMES: Record<number, string> = {
  1: 'Direct',
  2: 'Concise',
  3: 'Balanced',
  4: 'Supportive',
  5: 'Coach',
}

const TONE_COLORS: Record<number, string> = {
  1: '#ff1a4a',
  2: '#ff6b00',
  3: '#ffb700',
  4: '#00d4a0',
  5: '#00e5ff',
}

const TONE_INSTRUCTIONS: Record<number, string> = {
  1: "You are a DRILL SERGEANT. Be direct, blunt, and brutally honest. Call out mistakes immediately. No sugarcoating. Short sharp sentences. Hold this trader to military-level discipline.",
  2: "You are direct and firm. No fluff. Call out bad habits clearly. Be honest even when it stings. Keep the trader accountable with a tough-love approach.",
  3: "You are balanced — direct but supportive. Call out mistakes clearly but constructively. Mix accountability with encouragement based on what the trader needs.",
  4: "You are encouraging and supportive. Acknowledge progress. Frame corrections as learning opportunities. Keep energy positive while maintaining accountability.",
  5: "You are a LIFE COACH. Lead with empathy and encouragement. Reframe mistakes as growth moments. Keep the trader confident and emotionally regulated. Celebrate small wins.",
}

function _LegacyToneTester() {
  const [scenario, setScenario] = useState('')
  const [customScenario, setCustomScenario] = useState('')
  const [results, setResults] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const activeScenario = customScenario.trim() || scenario

  const runTest = async () => {
    if (!activeScenario) return
    setLoading(true)
    setResults({})
    const tones = [1, 2, 3, 4, 5]
    await Promise.all(tones.map(async (tone) => {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 80,
            messages: [{
              role: 'user',
              content: `${TONE_INSTRUCTIONS[tone]}

You are an AI trading companion for an SPX intraday options trader. Respond to this situation in 1-2 sentences maximum, staying completely in character for your role.

Trader says: "${activeScenario}"`
            }]
          })
        })
        const d = await res.json()
        const text = d.content?.[0]?.text?.trim() || 'No response'
        setResults(prev => ({ ...prev, [tone]: text }))
      } catch {
        setResults(prev => ({ ...prev, [tone]: 'Error getting response' }))
      }
    }))
    setLoading(false)
  }

  const font = "'JetBrains Mono', monospace"
  const fontD = "'Barlow Condensed', sans-serif"

  return (
    <div style={{ marginTop: 14 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', borderTop: '1px solid rgba(0,229,255,0.08)' }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#00e5ff', letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Test Coaching Tone</span>
        <span style={{ fontSize: 11, color: '#6b7a9a', marginLeft: 2 }}>— see how each tone responds to real scenarios</span>
        <span style={{ fontSize: 12, color: '#6b7a9a', marginLeft: 'auto' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
          {/* Scenario selector */}
          <div>
            <div style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 6 }}>Pick a scenario</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TONE_SCENARIOS.map((s, i) => (
                <div
                  key={i}
                  onClick={() => { setScenario(s); setCustomScenario('') }}
                  style={{ padding: '7px 10px', borderRadius: 5, border: `1px solid ${scenario === s && !customScenario ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`, background: scenario === s && !customScenario ? 'rgba(0,229,255,0.06)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', fontSize: 11.5, color: scenario === s && !customScenario ? '#d0d8f0' : '#8899bb', lineHeight: 1.5, transition: 'all 0.15s' }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div>
            <div style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 6 }}>Or type your own</div>
            <textarea
              value={customScenario}
              onChange={e => { setCustomScenario(e.target.value); setScenario('') }}
              placeholder="Describe a situation you want the AI to respond to..."
              rows={2}
              style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 5, padding: '8px 10px', color: '#f0f4ff', fontSize: 12, fontFamily: font, resize: 'vertical' as const, outline: 'none', boxSizing: 'border-box' as const, lineHeight: 1.5 }}
            />
          </div>

          {/* Test button */}
          <button
            onClick={runTest}
            disabled={loading || !activeScenario}
            style={{ background: loading || !activeScenario ? 'rgba(0,229,255,0.04)' : 'rgba(0,229,255,0.1)', border: `1px solid ${loading || !activeScenario ? 'rgba(0,229,255,0.1)' : 'rgba(0,229,255,0.3)'}`, color: loading || !activeScenario ? '#4a5568' : '#00e5ff', borderRadius: 6, padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: loading || !activeScenario ? 'not-allowed' : 'pointer', fontFamily: font, letterSpacing: '0.5px', transition: 'all 0.15s' }}
          >
            {loading ? '⟳ Testing all 5 tones...' : '↗ Compare All 5 Tones'}
          </button>

          {/* Results */}
          {Object.keys(results).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 2 }}>Responses</div>
              {[1, 2, 3, 4, 5].map(tone => (
                <div key={tone} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${TONE_COLORS[tone]}22`, borderLeft: `3px solid ${TONE_COLORS[tone]}`, borderRadius: 5, padding: '9px 12px' }}>
                  <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 700, color: TONE_COLORS[tone], letterSpacing: '1px', marginBottom: 4 }}>
                    {tone} — {TONE_NAMES[tone]}
                  </div>
                  <div style={{ fontSize: 12, color: results[tone] ? '#d0d8f0' : '#4a5568', lineHeight: 1.7, fontStyle: results[tone] ? 'normal' : 'italic' }}>
                    {results[tone] || <span style={{ display: 'inline-block', width: 120, height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 3, animation: 'pulse 1.5s infinite' }} />}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#4a5568', textAlign: 'center' as const, marginTop: 2 }}>
                Adjust the slider above to set your preferred tone, then Save.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function _LegacySettingsModal({ keys, setKeys, onClose, voiceId, setVoiceId, voiceEngine, setVoiceEngine, darkMode, setDarkMode, aiTone, setAiTone, userName, setUserName, welcomeMessage, setWelcomeMessage, voiceSpeed, setVoiceSpeed }: any) {
  const [vals, setVals] = useState({ [VOICE_ID]: voiceId || '21m00Tcm4TlvDq8ikWAM' })
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const previewAudioRef = useRef<any>(null)

  const testVoice = async (voiceId: string) => {
    // Stop any playing preview
    try { if (previewAudioRef.current) { previewAudioRef.current.stop(); previewAudioRef.current = null } } catch {}
    setPreviewingVoice(voiceId)
    try {
      const samples: Record<string, string> = {
        nova:    "Hey, SPX is approaching your key level. What's your read on the setup?",
        shimmer: "Looks like VIX is elevated. Make sure your position size fits the risk.",
        alloy:   "Options flow is showing unusual call activity. Worth watching closely.",
        echo:    "You're up on the day. Stay disciplined — don't give it back chasing.",
        fable:   "The market's telling a story today. Let's make sure we're reading it right.",
        onyx:    "SPX broke above VWAP with conviction. Bias confirmed — stay with the trend.",
      }
      const text = samples[voiceId] || `This is the ${voiceId} voice. Clean, natural, built for trading.`
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'openai', text, voice: voiceId, speed: voiceSpeed || 1.0 })
      })
      if (!res.ok) { setPreviewingVoice(null); return }
      const buf = await res.arrayBuffer()
      const ACtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new ACtx()
      if (ctx.state === 'suspended') await ctx.resume()
      const audio = await ctx.decodeAudioData(buf)
      const src = ctx.createBufferSource()
      previewAudioRef.current = src
      src.buffer = audio
      src.connect(ctx.destination)
      src.onended = () => setPreviewingVoice(null)
      src.start(0)
    } catch { setPreviewingVoice(null) }
  }
  const save = () => {
    if (vals[VOICE_ID]) { setVoiceId(vals[VOICE_ID]); localStorage.setItem(VOICE_ID, vals[VOICE_ID]) }
    localStorage.setItem('tz-dark-mode', darkMode.toString())
    localStorage.setItem('tz-ai-tone', aiTone.toString())
    localStorage.setItem('tz-voice-speed', voiceSpeed.toString())
    const trimmedName = userName.trim()
    const trimmedWelcome = welcomeMessage.trim()
    localStorage.setItem('tz-user-name', trimmedName)
    localStorage.setItem('tz-welcome-message', trimmedWelcome)
    setUserName(trimmedName)
    setWelcomeMessage(trimmedWelcome)
    // Sync name to trader profile in Supabase
    if (trimmedName) {
      fetch('/api/trader-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName })
      }).catch(() => {})
    }
    onClose()
  }

  // testVoice defined above

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'rgba(12,15,26,0.98)', border: `1px solid ${C.border2}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' as const }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Settings</div>
        <div style={{ fontFamily: font, fontSize: 12, color: C.textDim, marginBottom: 20 }}>Customize your <span>tr<span style={{color:'#00d4a0'}}>AI</span>de Zone</span> experience</div>

        {/* Dark Mode Toggle */}
        <div style={{ marginBottom: 20, padding: '12px 14px', background: 'rgba(10,14,24,0.95)', borderRadius: 10, border: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Appearance</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{darkMode ? 'Dark mode' : 'Light mode'}</div>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} style={{
            width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative' as const,
            background: darkMode ? C.violet : 'rgba(100,140,220,0.2)', transition: 'background 0.2s'
          }}>
            <div style={{ position: 'absolute' as const, top: 3, left: darkMode ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(12,15,26,0.98)', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        {/* Voice Engine Selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voice Engine</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button type="button" onClick={() => { setVoiceEngine('openai'); localStorage.setItem('tz-voice-engine', 'openai') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'openai' ? C.tealDim : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'openai' ? C.tealBorder : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'openai' ? C.teal : C.text, marginBottom: 2 }}>OpenAI TTS</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Premium — natural voices</div>
              <div style={{ fontSize: 11, color: C.synapse, marginTop: 2 }}>Pro / Elite plans</div>
            </button>
            <button type="button" onClick={() => { setVoiceEngine('webspeech'); localStorage.setItem('tz-voice-engine', 'webspeech') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.1)' : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.4)' : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'webspeech' ? '#8899ee' : C.text, marginBottom: 2 }}>🔊 Browser Voice</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Free — device voices</div>
              <div style={{ fontSize: 11, color: C.synapse, marginTop: 2 }}>All plans</div>
            </button>
          </div>

          {voiceEngine === 'openai' && (
            <div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Select Voice</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  { id: 'nova',    name: 'Nova',    desc: 'Warm, clear' },
                  { id: 'shimmer', name: 'Shimmer', desc: 'Soft, calm' },
                  { id: 'alloy',   name: 'Alloy',   desc: 'Neutral, precise' },
                  { id: 'echo',    name: 'Echo',     desc: 'Confident' },
                  { id: 'fable',   name: 'Fable',   desc: 'Storytelling' },
                  { id: 'onyx',    name: 'Onyx',    desc: 'Deep, authoritative' },
                ].map(v => {
                  const selected = vals[VOICE_ID] === v.id || (!vals[VOICE_ID] && v.id === 'nova')
                  return (
                    <div key={v.id} style={{ position: 'relative' as const }}>
                      <button type="button" onClick={() => setVals((p: any) => ({ ...p, [VOICE_ID]: v.id }))} style={{ width: '100%', padding: '7px 8px', paddingRight: 28, borderRadius: 6, cursor: 'pointer', textAlign: 'left' as const, background: selected ? C.tealDim : C.bg, border: `1px solid ${selected ? C.tealBorder : C.border2}`, transition: 'all 0.15s' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selected ? C.teal : C.text }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: C.textDim }}>{v.desc}</div>
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); testVoice(v.id) }} style={{ position: 'absolute' as const, top: '50%', right: 5, transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: '50%', border: `1px solid ${previewingVoice === v.id ? C.teal : C.border2}`, background: previewingVoice === v.id ? C.tealDim : 'transparent', color: previewingVoice === v.id ? C.teal : C.textMuted, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                        {previewingVoice === v.id ? '▶' : '▷'}
                      </button>
                    </div>
                  )
                })}
              </div>

            </div>
          )}

          {voiceEngine === 'webspeech' && (
            <div style={{ fontSize: 11.5, color: C.textDim, padding: '8px 12px', background: 'rgba(10,14,24,0.95)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>Uses your device's built-in voice engine. Completely free — no API costs.</span>
              <button type="button" onClick={() => {
                const utter = new SpeechSynthesisUtterance("SPX is approaching your key level. What's your read?")
                utter.rate = voiceSpeed || 1.0
                const voices = window.speechSynthesis.getVoices()
                const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen')) || voices.find(v => v.lang.startsWith('en'))
                if (preferred) utter.voice = preferred
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(utter)
              }} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 11.5, fontFamily: font }}>
                ▷ Preview
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Your Name</div>
          <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
            placeholder="e.g. Amir"
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>The AI will address you by name.</div>
        </div>

        {/* Welcome message */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Daily Welcome Message</div>
          <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
            placeholder={`e.g. "Good morning {name}. VIX is elevated — stay patient and wait for your setups."`}
            rows={3}
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 12, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>Played once per day when you open the cockpit. Use <span style={{color: C.teal}}>{'{name}'}</span> to insert your name.</div>
        </div>

        {/* AI Tone Slider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>AI Coaching Tone</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, color: C.textDim }}>Direct</span>
            <span style={{ fontSize: 11.5, color: C.teal, fontWeight: 700 }}>{['','Direct','Concise','Balanced','Supportive','Coach'][aiTone]}</span>
            <span style={{ fontSize: 11.5, color: C.textDim }}>Coach</span>
          </div>
          <input type="range" min={1} max={5} value={aiTone} onChange={e => setAiTone(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            {[,'Blunt, direct, zero tolerance for mistakes.','Tough love, honest feedback.','Balanced accountability and support.','Positive reinforcement focused.','Empathetic, confidence-building.'][aiTone]}
          </div>

          {/* Tone Tester */}
          <_LegacyToneTester />
        </div>

        {/* Voice Speed */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>Voice Speed</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, color: C.textDim }}>🐢 Slower</span>
            <span style={{ fontSize: 11.5, color: C.teal, fontWeight: 700 }}>{voiceSpeed <= 0.8 ? 'Slow' : voiceSpeed <= 1.0 ? 'Normal' : voiceSpeed <= 1.2 ? 'Fast' : 'Faster'}</span>
            <span style={{ fontSize: 11.5, color: C.textDim }}>Faster 🐇</span>
          </div>
          <input type="range" min={0.7} max={1.4} step={0.1} value={voiceSpeed} onChange={e => { setVoiceSpeed(parseFloat(e.target.value)); localStorage.setItem('tz-voice-speed', e.target.value) }}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>Current: {voiceSpeed}x — Normal is 1.0x</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={save} style={{ flex: 1, background: C.teal, color: '#080a0f', border: 'none', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(10,14,24,0.95)', color: C.textDim, border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}



// ── PROB METER ─────────────────────────────────────────────────────────────
function ProbMeter({ value, color }: { value: number; color: string }) {
  const r = 32, circ = 2 * Math.PI * r
  const dash = circ * (value / 100)
  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      <circle cx={40} cy={40} r={r} fill="none" stroke='rgba(100,140,220,0.15)' strokeWidth={5} />
      <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.3s ease' }} />
      <text x={40} y={36} textAnchor="middle" fill={color} fontSize={16} fontWeight="800" fontFamily={font}>{value}</text>
      <text x={40} y={50} textAnchor="middle" fill={C.textDim} fontSize={9} fontFamily={font}>%</text>
    </svg>
  )
}

// ── MAIN COCKPIT ───────────────────────────────────────────────────────────
// Timeframe config: daysBack drives from-date, limit must cover all bars
// 1m=1day(500bars) 5m=5days(500) 15m=10days(400) 1H=20days(200) 1D=1yr(500)
// Deep Dive chart timeframes — pagination stops at targetTradingDays (see fetchAllPages)
const TF_CONFIG: Record<string, {multiplier: number, timespan: string, daysBack: number, limit: number}> = {
  '1':  { multiplier: 1,  timespan: 'minute', daysBack: 3,   limit: 500 },  // 1 trading day
  '5':  { multiplier: 5,  timespan: 'minute', daysBack: 10,  limit: 500 },  // 5 trading days
  '15': { multiplier: 15, timespan: 'minute', daysBack: 10,  limit: 500 },  // 5 trading days
  '60': { multiplier: 60, timespan: 'minute', daysBack: 35,  limit: 500 },  // 20 trading days
  '1D': { multiplier: 1,  timespan: 'day',    daysBack: 400, limit: 500 },  // ~1 year
}

export default function CockpitPage() {
 const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  // Keys
  const [keys, setKeys] = useState<any>({ [POLY_KEY]: 'server', [ANTH_KEY]: 'server', [UW_KEY]: 'server', [EL_KEY]: 'server', [TIINGO_KEY]: 'server' })
  const [showSettings, setShowSettings] = useState(false)
  const [showDisclosure, setShowDisclosure] = useState(false)

  // Tab
  const [tab, setTab] = useState<'plan' | 'cockpit' | 'deepdive' | 'log' | 'journal' | 'learn'>('cockpit')
  const [calMonth, setCalMonth] = useState<{yr: number, mo: number}>(() => { const n = new Date(); return {yr: n.getFullYear(), mo: n.getMonth()} })
  const [darkMode, setDarkMode] = useState(() => true)

  const CC = darkMode ? C_DARK : {
    ...C_DARK,
    bg: '#f0f4f8', deep: '#e4eaf2', surface: '#ffffff', surface2: '#f5f7fa', surface3: '#edf1f7',
    border: 'rgba(0,0,0,0.08)', border2: 'rgba(0,153,204,0.3)',
    text: 'rgba(12,15,26,0.98)', textDim: '#4a5568', textMuted: '#718096',
    tealDim: 'rgba(0,153,204,0.12)', tealBorder: 'rgba(0,153,204,0.3)',
    violetDim: 'rgba(0,212,160,0.1)', violetBorder: 'rgba(0,212,160,0.3)',
    redDim: 'rgba(204,16,64,0.08)', redBorder: 'rgba(204,16,64,0.25)',
    fireDim: 'rgba(224,80,0,0.08)', fireBorder: 'rgba(224,80,0,0.25)',
    yellowDim: 'rgba(192,112,0,0.1)',
  }
  const C = CC  // C now tracks dark/light mode across all 454 references


  // ── Market data — single source of truth via useMarketData hook ────────
  // Note: morningPlan is declared later in the component — can't pass impliedMove here
  // useMarketData will update when impliedMove changes via useEffect in the hook
  const md = useMarketData(undefined)
  const { candles, spyCandles, vixCandles, changes, connected, dataAge } = md
  const currentPrice    = md.currentPrice
  const spyPrice        = md.spyPrice
  const vixPrice        = md.vixPrice
  const openPrice       = md.openPrice
  const levels          = md.levels
  const manualVwap      = md.manualVwap
  const currentPriceRef = useRef<number | null>(null)

  // Keep setters available for legacy code paths that still exist in page.tsx
  // These will be removed as refactor progresses
  const setCandles    = (_: any) => {}  // now managed by hook
  const setSpyCandles = (_: any) => {}
  const setVixCandles = (_: any) => {}
  const setCurrentPrice = (_: any) => {}
  const setSpyPrice   = (_: any) => {}
  const setVixPrice   = (_: any) => {}
  const setOpenPrice  = (_: any) => {}
  const setLevels     = (_: any) => {}
  const setChanges    = (_: any) => {}
  const setConnected  = (_: any) => {}

  // Morning plan
  type MorningPlan = { bias: string; impliedMove: string; keyLevels: string; gapDirection: string; gapSize: string; notes: string }
  const [morningPlan, setMorningPlan] = useState<MorningPlan>(() => {
    // Initialize directly from localStorage — runs once, synchronously
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tz-morning-plan')
        if (saved) {
          const parsed = JSON.parse(saved)
          // Only use if it has actual content (not all empty)
          if (parsed && (parsed.bias || parsed.keyLevels || parsed.notes || parsed.impliedMove)) {
            return parsed
          }
        }
      } catch {}
    }
    return { bias: '', impliedMove: '', keyLevels: '', gapDirection: 'flat', gapSize: '', notes: '' }
  })

  // Playbooks
  const [playbooks, setPlaybooks] = useState<any[]>([
    { id: '1', name: 'VWAP Reclaim Long', setup: 'Price below VWAP, reclaims with volume', entry: 'First candle close above VWAP', stop: 'Back below VWAP', target: '+10-15 SPX pts', notes: 'Best after 10:30am' },
    { id: '2', name: 'PDH Breakout', setup: 'Price approaches prior day high with momentum', entry: 'Break and hold above PDH', stop: 'Back inside PDH', target: '+15-20 SPX pts', notes: 'Needs volume confirmation' },
    { id: '3', name: 'Opening Range Fade', setup: 'Price extends to implied move level on weak internals', entry: 'Rejection candle at IM level', stop: 'Above IM high', target: 'VWAP reversion', notes: 'VIX should be elevated' },
  ])
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null)
  const [showAddPlaybook, setShowAddPlaybook] = useState(false)
  const [newPlaybook, setNewPlaybook] = useState({ name: '', setup: '', entry: '', stop: '', target: '', notes: '' })

  // Checklist
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [customChecklist, setCustomChecklist] = useState<any[]>(CHECKLIST)
  const [editingChecklist, setEditingChecklist] = useState(false)
  const [newCheckItem, setNewCheckItem] = useState('')
  const [voiceMinUsed, setVoiceMinUsed] = useState(0)
  const [aiTone, setAiTone] = useState(3) // 1=Direct, 5=Coach
  const [userName, setUserName] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [voiceMinLimit, setVoiceMinLimit] = useState(180) // default Pro
  const [voiceWarningShown, setVoiceWarningShown] = useState<'50' | '90' | null>(null)
  const [voiceOverage, setVoiceOverage] = useState(false)
  const [voiceSpeed, setVoiceSpeed] = useState(1.0)

  // AI
  const [aiResult, setAiResult] = useState<any>(null)
  const [adversarial, setAdversarial] = useState<any>(null)
  const [adversarialLoading, setAdversarialLoading] = useState(false)
  // ── Live position tracking ─────────────────────────────────────────────
  const [openPositions, setOpenPositions]   = useState<any[]>([])
  const [showTakeTrade, setShowTakeTrade]   = useState<any | null>(null)  // signal data for confirmation modal
  const [showCloseTrade, setShowCloseTrade] = useState<any | null>(null)  // position being closed
  const [exitPrompt, setExitPrompt]         = useState<any | null>(null)  // auto-prompt when stop/target hit
  const exitPromptsFired = useRef<Set<string>>(new Set())                 // dedupe auto-prompts
  // ── Personal Trigger Engine (live) ──────────────────────────────────────
  const [triggerRules, setTriggerRules]   = useState<any[]>([])
  const triggerAccumulator = useRef<any>(null)                            // SessionAccumulator
  const [triggerFire, setTriggerFire]      = useState<any | null>(null)   // a rule that just fired
  const priorPriceRef = useRef<number | null>(null)                       // price one tick ago (reclaim detection)
  const recentBarsRef = useRef<{ highs: number[]; lows: number[] }>({ highs: [], lows: [] })
  // ── Setup Engine (PRIMARY signal source — mechanical detectors) ─────────
  const setupStateRef = useRef<SetupEngineState | null>(null)
  const [setupFireDisplay, setSetupFireDisplay] = useState<any | null>(null)  // rich fire → Focus Panel
  const setupFireBusyRef = useRef(false)                                       // one fire pipeline at a time
  const [sessionFires, setSessionFires] = useState<any[]>([])                  // today's setup fires (strip + companion)
  useEffect(() => {   // restore today's fires across refreshes
    try {
      const raw = JSON.parse(localStorage.getItem('tz-session-fires') || 'null')
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
      if (raw?.date === today && Array.isArray(raw.fires)) setSessionFires(raw.fires)
    } catch {}
  }, [])
  const [aiLoading, setAiLoading] = useState(false)
  const [lastAITime, setLastAITime] = useState<string | null>(null)
  const [marketIntel, setMarketIntel] = useState<any>({})
  const [optionsFlow, setOptionsFlow] = useState<any[]>([])
  const [marketTide, setMarketTide] = useState<any>(null)
  const [tiingoContext, setTiingoContext] = useState<any>(null)
  const [marketNews, setMarketNews] = useState<string>('')
  const [economicCalendar, setEconomicCalendar] = useState<string>('')
  const [marketScore, setMarketScore] = useState<any>(null)
  const [multiTFData, setMultiTFData] = useState<any>(null)
  const [mtfStructure, setMtfStructure] = useState<any>(null)   // full MA/crossover layer (July 17 spec)
  useEffect(() => {   // fetch MA structure on mount + every 5 min (slow TFs cached per session internally)
    let cancelled = false
    const run = async () => {
      try {
        const last = parseInt(localStorage.getItem('tz-mtf-last') || '0', 10)
        if (Date.now() - last < 4 * 60 * 1000) return
        localStorage.setItem('tz-mtf-last', String(Date.now()))
      } catch {}
      const mtf = await fetchMTFStructure()
      if (mtf && !cancelled) setMtfStructure(mtf)
    }
    const kick = setTimeout(run, 4000)
    const iv = setInterval(run, 5 * 60 * 1000)
    return () => { cancelled = true; clearTimeout(kick); clearInterval(iv) }
  }, [])
  // ── Swing structure alerts (multi-day, from MTF crossovers) ─────────────
  const [swingAlert, setSwingAlert] = useState<any | null>(null)
  useEffect(() => {   // restore active swing alert (valid up to 5 days, until dismissed)
    try {
      const raw = JSON.parse(localStorage.getItem('tz-swing-alert') || 'null')
      if (raw?.firedAt && Date.now() - raw.firedAt < 5 * 86400000) setSwingAlert(raw)
    } catch {}
  }, [])
  useEffect(() => {
    if (!mtfStructure) return
    const sig = detectSwingFromStructure(mtfStructure)
    if (!sig) return
    let firedMap: Record<string, number> = {}
    try { firedMap = JSON.parse(localStorage.getItem('tz-swing-fired') || '{}') } catch {}
    if (firedMap[sig.id] && Date.now() - firedMap[sig.id] < 10 * 86400000) return   // same cross, already alerted
    firedMap[sig.id] = Date.now()
    try { localStorage.setItem('tz-swing-fired', JSON.stringify(firedMap)) } catch {}

    const spot = mtfStructure?.spx?.m5?.price || currentPrice
    if (!spot) return
    const contract = recommendSwingContract(sig.direction, spot)
    const entry = spot
    const t1 = sig.direction === 'LONG' ? entry * 1.01 : entry * 0.99
    const t2 = sig.direction === 'LONG' ? entry * 1.02 : entry * 0.98
    const stop = sig.stopAnchor != null
      ? (sig.direction === 'LONG' ? sig.stopAnchor * 0.997 : sig.stopAnchor * 1.003)
      : (sig.direction === 'LONG' ? entry * 0.988 : entry * 1.012)
    const alert = { ...sig, contract, entry, t1, t2, stop, firedAt: Date.now() }
    setSwingAlert(alert)
    try { localStorage.setItem('tz-swing-alert', JSON.stringify(alert)) } catch {}
    try { speak(`Swing structure alert. ${sig.name}. ${sig.direction === 'LONG' ? 'Long' : 'Short'} bias for a multi-day move. Check the violet card.`) } catch {}

    // Record it (engine:'swing' — excluded from intraday grading and the engine experiment)
    fetch('/api/trade-alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal: sig.direction,
        entryZone: { low: entry, high: entry },
        stopLevel: stop, target1: t1, target2: t2,
        no_entry_zone: false, auto_fired: true, currentPrice: entry,
        vwap: null, ema200: null, vix: vixPrice ?? null,
        confidence: 55, moveSize: Math.round(entry * 0.01),
        context_snapshot: JSON.stringify({
          auto: true, engine: 'swing',
          swingId: sig.id, name: sig.name, basis: sig.basis,
          recommendedContract: contract,
          gexRegime: gexData?.regime ?? null,
        }),
      }),
    }).then(r => r.json())
      .then(d => { if (d?.error) console.error('[Swing] INSERT FAILED:', JSON.stringify(d)); else console.log('[Swing] logged:', sig.id) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mtfStructure])
  const [zeroDTESkew, setZeroDTESkew] = useState<any>(null)
  const [tradePatterns, setTradePatterns] = useState<any>(null)
  const [macroRegime, setMacroRegime] = useState<any>(null)
  const [sessionMemory, setSessionMemory] = useState<string>('')
  const [traderProfile, setTraderProfile] = useState<any>(null)
  const [proactiveAlertsSent, setProactiveAlertsSent] = useState<Set<string>>(new Set())
  const lastPriceRef = useRef<number>(0)
  const proactiveTimerRef = useRef<any>(null)

  // Trade log
  const [trades, setTrades] = useState<any[]>([])
  const [tradeStats, setTradeStats] = useState<any>(null)
  const [showTradeForm, setShowTradeForm] = useState(false)
  const [newTrade, setNewTrade] = useState({ symbol: 'SPX', direction: 'call', entry: '', exit: '', pnl: '', inSystem: true, notes: '', playbook: '' })
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const journalImportRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // Voice
  const [voiceId, setVoiceId] = useState('nova')  // OpenAI voice name
  const [voiceEngine, setVoiceEngine] = useState<'openai'|'webspeech'>('openai')
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [companionOpen, setCompanionOpen] = useState(true)
  const [chatInput, setChatInput] = useState('')
  // Chat persistence — saved by trading date, survives refreshes within the day
  const CHAT_STORAGE_KEY = `tz-chat-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}`
  const [chatMessages, setChatMessages] = useState<any[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const chatDbSyncRef = useRef<Set<string>>(new Set()) // track which messages are in DB
  const [chatLoading, setChatLoading] = useState(false)
  const [editingVwap, setEditingVwap] = useState(false)
  const [showUsageReport, setShowUsageReport] = useState(false)
  const [showAlertHistory, setShowAlertHistory] = useState(false)
  const [outcomeModal, setOutcomeModal] = useState<{ alertId: string; signal: 'LONG'|'SHORT'; entryLow: number; entryHigh: number; stopLevel: number; target1: number; target2: number } | null>(null)
  const outcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showBacktest, setShowBacktest] = useState(false)
  const [showEdgeDiscovery, setShowEdgeDiscovery] = useState(false)
  const [edgeProfile, setEdgeProfile] = useState<EdgeProfile | null>(null)
  const [edgeLoading, setEdgeLoading] = useState(false)
  const [discoveredRules, setDiscoveredRules] = useState<any[]>([])
  const [patternAnalysis, setPatternAnalysis] = useState<PatternAnalysis | null>(null)
  const [microstructure, setMicrostructure] = useState<MicrostructureResult | null>(null)
  const [signalQuality, setSignalQuality] = useState<SignalQualityResult | null>(null)
  const [showAvatarPanel, setShowAvatarPanel] = useState(false)
  const [historicalGapStats, setHistoricalGapStats] = useState<any>(null)
  const [gapPrediction, setGapPrediction] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [modelValidation, setModelValidation] = useState<any>(null)
  const [dailyRecap, setDailyRecap] = useState<any>(null)
  const [pulse, setPulse]         = useState<any>(null)
  const [pulseLoading, setPulseLoading] = useState(false)
  const [streamWeights, setStreamWeights] = useState<Record<string,number> | null>(null)
  const [marketIntel2, setMarketIntel2] = useState<any>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [morningBrief, setMorningBrief] = useState<any>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')
  const [suggestionType, setSuggestionType] = useState<'suggestion'|'bug'|'feedback'>('suggestion')
  const [suggestionSent, setSuggestionSent] = useState(false)
  const [customRules, setCustomRules] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('tz-custom-rules') || ''
  })
  const [breadthData, setBreadthData]       = useState<any | null>(null)
  const [gexData, setGexData]               = useState<any | null>(null)
  const [volumeProfile, setVolumeProfile]   = useState<any | null>(null)
  const [mechanicalFlow, setMechanicalFlow] = useState<any | null>(null)
  const [dayTypeForecast, setDayTypeForecast] = useState<any | null>(null)
  const [dayTypeFired, setDayTypeFired]       = useState(false)  // tracks if 10am auto-fire happened
  const [mechAccuracy, setMechAccuracy]     = useState<any | null>(null)
  const [actionability, setActionability]   = useState<ActionabilityResult | null>(null)
  const [setupEval, setSetupEval]           = useState<SetupEvaluation | null>(null)
  const [selectedSetup, setSelectedSetup]   = useState<SetupId | null>(null)
  const [setupDropdownOpen, setSetupDropdownOpen] = useState(false)
  const [intradayHigh, setIntradayHigh]     = useState<number | null>(null)
  const [intradayLow, setIntradayLow]       = useState<number | null>(null)
  const [orbHigh, setOrbHigh]               = useState<number | null>(null)
  const [orbLow, setOrbLow]                 = useState<number | null>(null)
  const orbWindowMins = 15  // first 15min after 9:30am ET defines the opening range

  // ── Active Trade Ticket ──────────────────────────────────────────────────
  const [ticket, setTicket] = useState({
    strike:     '',    // e.g. 5820
    optionType: 'call' as 'call' | 'put',
    expiry:     '',    // e.g. 0DTE
    entryPrice: '',    // option premium paid
    qty:        '1',   // number of contracts
    exitPrice:  '',    // filled when closed
    status:     'idle' as 'idle' | 'open' | 'closed',
    openedAt:   null as string | null,
    closedAt:   null as string | null,
    notes:      '',
  })
  const [tradeSaving, setTradeSaving] = useState(false)
  const [strikeSuggestions, setStrikeSuggestions] = useState<any>(null)
  const [strikeLoading, setStrikeLoading]         = useState(false)
  const [strikeLastRefresh, setStrikeLastRefresh] = useState<string>('')
  const [showTradeZone, setShowTradeZone] = useState(false)
  const [levelProximity, setLevelProximity] = useState<any>(null)
  const [edgeAlerts, setEdgeAlerts] = useState<any[]>([])
  const edgeAlertShownRef = useRef<Set<string>>(new Set())
  const [vwapInput, setVwapInput] = useState('')
  // effectiveVwap — hook handles manual override priority internally
  const effectiveVwap = md.manualVwap || levels?.spyVwap || null

  // Build validated SignalInput for runSignal calls
  const buildSignalInput = (overrides?: { flow?: any[]; tide?: any; intel?: any; tiingo?: any }) => ({
    spotGex:      marketIntel2?.spotGex      || null,
    uwIV:         marketIntel2?.uwIV         || null,
    econSurprise: marketIntel2?.econSurprise || null,
    volumeProfile: volumeProfile             || null,
    mechanicalFlow: mechanicalFlow           || null,
    market:           { currentPrice, levels, candles, vixPrice, changes },
    edgeProfile,
    executionStats,
    patternAnalysis,
    microstructure,
    breadthData,
    gexData,
    morningPlan,
    activePlaybook:   playbooks.find((p: any) => p.id === activePlaybookId) || null,
    tradeStats,
    aiTone,
    aiResult,
    optionsFlow:      overrides?.flow ?? optionsFlow,
    marketTide:       overrides?.tide ?? marketTide,
    marketIntel:      overrides?.intel ?? marketIntel,
    tiingoContext:    overrides?.tiingo ?? tiingoContext,
    zeroDTESkew,
    marketScore,
    tradePatterns,
    multiTFData,
    mtfStructure,
    marketNews,
    economicCalendar,
    macroRegime,
    earningsCalendar,
    marketIntel2,
    sessionMemory,
  })
  const [flowAlerts, setFlowAlerts] = useState<any[]>([])
  const [dpAlerts, setDpAlerts]    = useState<any[]>([])
  const dpAlertShownRef            = useRef<Set<string>>(new Set())
  const [volumeAlerts, setVolumeAlerts] = useState<any[]>([])
  const volumeBaselineRef = useRef<number[]>([])  // rolling 20-bar volume baseline
  const flowAlertShownRef = useRef<Set<string>>(new Set())
  const [showTutorial, setShowTutorial] = useState(false)
  const [subStatus, setSubStatus] = useState<'loading' | 'active' | 'none'>('loading')
  const [subPlan, setSubPlan] = useState<string | null>(null)

  // ── Setup evaluator — recomputes when selected setup or data changes ──
  useEffect(() => {
    if (!selectedSetup || !currentPrice) {
      setSetupEval(null)
      return
    }
    try {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const minsLeft = Math.max(0, 960 - (et.getHours() * 60 + et.getMinutes()))
      const result = evaluateSetup(selectedSetup, {
        currentPrice,
        vwap:            levels?.spyVwap || null,
        vwapBand1Up:     marketIntel2?.vwapBands?.band1Up || null,
        vwapBand1Dn:     marketIntel2?.vwapBands?.band1Dn || null,
        pdh:             levels?.pdh || null,
        pdl:             levels?.pdl || null,
        prevClose:       levels?.prevClose || null,
        ema200:          levels?.ema200 || null,
        poc:             volumeProfile?.poc || null,
        vah:             volumeProfile?.vah || null,
        val:             volumeProfile?.val || null,
        intradayHigh,
        intradayLow,
        orbHigh,
        orbLow,
        orbWindowMins,
        minutesSinceOpen: (() => {
          const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
          const m = (et.getHours() - 9) * 60 + (et.getMinutes() - 30)
          return Math.max(0, m)
        })(),
        gammaFlip:       gexData?.gammaFlip || null,
        callWall:        gexData?.callWall || null,
        putWall:         gexData?.putWall || null,
        gexRegime:       gexData?.regime || null,
        tickValue:       breadthData?.tick?.value || null,
        trinValue:       breadthData?.trin?.value || null,
        cumDelta:        microstructure?.cumulativeDelta?.strength || null,
        optionsFlowBias: microstructure?.optionsImbalance?.bias || null,
        darkPoolBias:    microstructure?.darkPool?.netBias || null,
        h1Trend:         multiTFData?.h1?.trend || null,
        m15Trend:        multiTFData?.m15?.trend || null,
        dailyTrend:      multiTFData?.daily?.trend || null,
        mechanicalScore: mechanicalFlow?.mechanicalScore || null,
        asymmetricSetup: mechanicalFlow?.asymmetricSetup || null,
        ivRank:          marketIntel2?.uwIV?.ivRank || null,
        sessionMinsLeft: minsLeft,
        sessionName:     marketIntel2?.timeContext?.currentSession || null,
        patternSummary:  patternAnalysis?.structureSummary || null,
        candlePatterns:  multiTFData?.patterns?.map((p: any) => p.name).join('|') || null,
        // Volume + move-size for normalized baseline checks
        currentVolume:   candles[candles.length - 1]?.v || null,
        avgVolume:       (() => {
          const recent = candles.slice(-20).map(c => c.v || 0).filter(v => v > 0)
          return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : null
        })(),
        impliedMove:     morningPlan?.impliedMove ? parseFloat(morningPlan.impliedMove) : null,
        atr:             multiTFData?.daily?.atr || null,
      })
      setSetupEval(result)
    } catch (e) { console.warn('[SetupEval]', e) }
  }, [selectedSetup, currentPrice, levels, marketIntel2, volumeProfile, intradayHigh, intradayLow, orbHigh, orbLow, gexData, breadthData, microstructure, multiTFData, mechanicalFlow, patternAnalysis])

  // ── Track intraday HOD/LOD + Opening Range from candles (dedicated effect) ──
  // Uses Intl.DateTimeFormat for robust ET timezone extraction (no fake-date hack)
  useEffect(() => {
    if (!candles || candles.length === 0) return

    // Get today's date in ET
    const etDateFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const etTimeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      hour: '2-digit', minute: '2-digit',
    })

    const todayET = etDateFmt.format(new Date())

    // Filter today's candles
    const todaysCandles = candles.filter(c => {
      try {
        return etDateFmt.format(new Date(c.t)) === todayET
      } catch { return false }
    })

    if (todaysCandles.length === 0) return

    // HOD / LOD
    setIntradayHigh(Math.max(...todaysCandles.map(c => c.h)))
    setIntradayLow(Math.min(...todaysCandles.map(c => c.l)))

    // Opening Range — first orbWindowMins after 9:30am ET
    const orCandles = todaysCandles.filter(c => {
      try {
        const parts = etTimeFmt.format(new Date(c.t)).split(':')
        const h = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10)
        const minsSince930 = (h - 9) * 60 + (m - 30)
        return minsSince930 >= 0 && minsSince930 < orbWindowMins
      } catch { return false }
    })

    if (orCandles.length > 0) {
      const newOrbHigh = Math.max(...orCandles.map(c => c.h))
      const newOrbLow = Math.min(...orCandles.map(c => c.l))
      setOrbHigh(newOrbHigh)
      setOrbLow(newOrbLow)
      console.log(`[ORB] ${todayET} OR captured from ${orCandles.length} candles: ${newOrbLow.toFixed(2)} - ${newOrbHigh.toFixed(2)}`)
    } else {
      console.log(`[ORB] ${todayET} no candles in opening range window yet`)
    }
  }, [candles])

  // ── Volume Profile — dedicated effect, recomputes when candles update ──
  useEffect(() => {
    if (!candles || candles.length < 3) {
      console.log(`[VolumeProfile] waiting — only ${candles?.length || 0} candles`)
      return
    }
    try {
      const vp = calculateVolumeProfile(candles)
      if (vp) {
        setVolumeProfile(vp)
        console.log(`[VolumeProfile] computed: POC ${vp.poc} / VAH ${vp.vah} / VAL ${vp.val} | ${vp.allBuckets.length} buckets | curr ${vp.currentPrice}`)
      } else {
        console.log(`[VolumeProfile] calc returned null — likely no session candles yet (need at least 3 today)`)
      }
    } catch (e) {
      console.warn('[VolumeProfile] error:', e)
    }
  }, [candles])

  // ── Open Positions: load on mount + refresh every 30s ────────────────────
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/open-positions?status=open')
        .then(r => r.json())
        .then(d => { if (!cancelled) setOpenPositions(d.positions || []) })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // ── Auto-prompt when SPX hits stop or target for any open position ────────
  useEffect(() => {
    if (!currentPrice || openPositions.length === 0) return
    for (const pos of openPositions) {
      if (pos.status !== 'open') continue
      if (exitPromptsFired.current.has(pos.id)) continue

      const isLong = pos.signal_direction === 'LONG'
      const stop = pos.stop_level ? parseFloat(pos.stop_level) : null
      const t1   = pos.target1    ? parseFloat(pos.target1)    : null
      const t2   = pos.target2    ? parseFloat(pos.target2)    : null

      let trigger: { reason: string; level: number; type: 'stop' | 'target' } | null = null

      if (stop !== null) {
        if (isLong && currentPrice <= stop) trigger = { reason: 'STOP HIT', level: stop, type: 'stop' }
        else if (!isLong && currentPrice >= stop) trigger = { reason: 'STOP HIT', level: stop, type: 'stop' }
      }
      if (!trigger && t2 !== null) {
        if (isLong && currentPrice >= t2) trigger = { reason: 'T2 HIT', level: t2, type: 'target' }
        else if (!isLong && currentPrice <= t2) trigger = { reason: 'T2 HIT', level: t2, type: 'target' }
      }
      if (!trigger && t1 !== null) {
        if (isLong && currentPrice >= t1) trigger = { reason: 'T1 HIT', level: t1, type: 'target' }
        else if (!isLong && currentPrice <= t1) trigger = { reason: 'T1 HIT', level: t1, type: 'target' }
      }

      if (trigger) {
        exitPromptsFired.current.add(pos.id)
        setExitPrompt({ position: pos, ...trigger, currentPrice })
        // Play voice alert (best-effort, ignore if speak isn't ready)
        try {
          speak(`Heads up. SPX hit ${trigger.reason} on your ${pos.signal_direction} position.`)
        } catch {}
      }
    }
  }, [currentPrice, openPositions])

  // ── Load personal trigger rules on mount + refresh every 2min ──────────
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/triggers')
        .then(r => r.json())
        .then(d => { if (!cancelled) setTriggerRules((d.triggers || []).filter((t: any) => t.enabled)) })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 120000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // ── LIVE IMPLIED MOVE — auto-populates + decays through the session ────
  // Full-day 1σ move: SPX × (VIX/100) ÷ √252, scaled by √(time remaining)
  // so it shrinks realistically intraday (a manual morning number is stale
  // by noon). Auto-fills the plan field when empty and keeps updating it —
  // but NEVER overwrites a manual edit: we only touch the field while its
  // value still equals the last auto value we wrote.
  const lastAutoIMRef = useRef<string | null>(null)
  useEffect(() => {
    const computeAndApply = () => {
      if (!currentPrice || !vixPrice) return
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const minsSinceOpen = (et.getHours() - 9) * 60 + (et.getMinutes() - 30)
      // Pre-open: full-day move; intraday: remaining-time scaled; capped [0,1]
      const frac = Math.max(0, Math.min(1, minsSinceOpen <= 0 ? 1 : (390 - minsSinceOpen) / 390))
      const fullDay = currentPrice * (vixPrice / 100) / Math.sqrt(252)
      const im = (fullDay * Math.sqrt(frac)).toFixed(1)
      setMorningPlan(prev => {
        const cur = (prev.impliedMove || '').trim()
        const isAutoOrEmpty = cur === '' || cur === lastAutoIMRef.current
        if (!isAutoOrEmpty) return prev            // manual value — hands off
        if (cur === im) return prev                // unchanged
        lastAutoIMRef.current = im
        return { ...prev, impliedMove: im }
      })
    }
    computeAndApply()
    const iv = setInterval(computeAndApply, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [currentPrice, vixPrice])

  // ── Client-side Shadow Collector ───────────────────────────────────────
  // Fires the shadow prediction every 5 min while the cockpit is open.
  // Replaces the unreliable Vercel cron: the endpoint handles its own
  // market-hours guard, regime dedup, and 30/60/90min grading. This only
  // runs while you're actually trading (tab open) — which is exactly when
  // the live-with-GEX data matters. Calls are same-origin so the
  // endpoint's isAuthorized() passes automatically.
  useEffect(() => {
    let cancelled = false
    const SHADOW_KEY = 'traidezone_last_shadow_fire'

    const firePrediction = async () => {
      if (cancelled) return
      // Throttle guard: never fire more than once per ~4.5min even across
      // remounts (localStorage-backed), so a quick tab refocus won't spam.
      try {
        const last = parseInt(localStorage.getItem(SHADOW_KEY) || '0', 10)
        if (Date.now() - last < 4.5 * 60 * 1000) return
      } catch {}

      try {
        const res = await fetch('/api/agents/predict-shadow', { method: 'POST' })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          console.error('[shadow-collector] endpoint error', res.status, '→', d?.error || JSON.stringify(d))
        }
        // Stamp throttle when the endpoint engaged (saved a prediction or
        // hit regime dedup) — NOT on weekend/after-hours skips, so it
        // retries promptly once the market opens.
        const engaged = d?.ok === true || d?.reason === 'regime unchanged from last prediction'
        if (engaged) {
          try { localStorage.setItem(SHADOW_KEY, String(Date.now())) } catch {}
        }
        if (d?.ok && d?.prediction) {
          console.log('[shadow-collector] saved:', d.prediction.signal, d.prediction.confidence,
            '| GEX:', d.prediction.components?.gexRegime || 'none')
        }
      } catch {
        // network blip — try again next interval
      }
    }

    // Fire shortly after mount, then every 5 min
    const kickoff = setTimeout(firePrediction, 15000)  // 15s after load
    const iv = setInterval(firePrediction, 5 * 60 * 1000)

    // The score-shadow cron is also unreliable — nudge grading from the
    // client too so predictions actually get graded at 30/60/90min.
    // Cheap call; endpoint no-ops if nothing is due. Offset from the
    // prediction fire so they don't hit at the same instant.
    const fireGrading = async () => {
      if (cancelled) return
      try { await fetch('/api/agents/score-shadow', { method: 'POST' }) } catch {}
      // CRITICAL (July 20 lesson): trade_alerts grading was ONLY wired to the
      // dead Vercel cron — 13 signals sat PENDING all day. Nudge it from the
      // client like everything else. GET route; no-ops outside 9am-5pm ET.
      try { await fetch('/api/agents/score-alerts') } catch {}
    }
    const gradeKickoff = setTimeout(fireGrading, 45000)  // 45s after load
    const gradeIv = setInterval(fireGrading, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(kickoff); clearInterval(iv)
      clearTimeout(gradeKickoff); clearInterval(gradeIv)
    }
  }, [])

  // ── AUTO-FIRE: real signal engine on a 20-min cadence ──────────────────
  // The flagship Sonnet signal now builds a continuous track record like
  // the shadow stream — every auto-fire is logged to trade_alerts and
  // graded by the scorer. SILENT by design: updates the signal display
  // but no voice, no modals (those stay exclusive to manual clicks).
  // Runs market hours only, while the cockpit tab is open.
  useEffect(() => {
    let cancelled = false
    const AUTO_KEY = 'tz-last-autosignal'

    const autoFire = async () => {
      if (cancelled || aiLoading) return
      // Market-hours gate (ET): fire 9:35am–3:55pm weekdays
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const dow = et.getDay(); const mins = et.getHours() * 60 + et.getMinutes()
      if (dow === 0 || dow === 6 || mins < 575 || mins > 955) return
      // Throttle: 18 min across remounts
      try {
        const last = parseInt(localStorage.getItem(AUTO_KEY) || '0', 10)
        if (Date.now() - last < 18 * 60 * 1000) return
        localStorage.setItem(AUTO_KEY, String(Date.now()))
      } catch {}

      try {
        const [intel, flow, tide, tiingo2] = await Promise.all([
          fetchMarketIntel(), fetchOptionsFlow(), fetchMarketTide(),
          fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove),
        ])
        const result = await runSignal(buildSignalInput({ flow, tide, intel, tiingo: tiingo2 }))
        if (!result || cancelled) return
        setAiResult(result)
        setLastAITime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

        // Log EVERY auto-fired signal (incl. WAIT) — same conventions as manual
        const px = currentPrice || 0
        const isDirectional = (result.signal === 'LONG' || result.signal === 'SHORT') && result.entryZone
        const fallbackT1 = result.signal === 'SHORT' ? px - 10 : px + 10
        const fallbackStop = result.signal === 'SHORT' ? px + 10 : px - 10
        fetch('/api/trade-alerts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal:        result.signal,
            entryZone:     result.entryZone || { low: px, high: px },
            stopLevel:     result.stopLevel ?? fallbackStop,
            target1:       result.target1 ?? fallbackT1,
            target2:       result.target2 || ((result.target1 ?? fallbackT1) + 20),
            no_entry_zone: !isDirectional,
            auto_fired:    true,
            currentPrice:  px,
            vwap:          levels?.spyVwap ?? null,
            ema200:        levels?.ema200 ?? null,
            vix:           vixPrice ?? null,
            confidence:    result.confidence,
            moveSize:      result.moveSize,
            wait_reason:   result.waitReason || result.riskFlag || null,
            context_snapshot: JSON.stringify({
              auto: true, engine: 'llm', gexRegime: gexData?.regime ?? null, dayType: dayTypeForecast?.dayType ?? null,
              // flow-ablation audit: was UW context present for this signal?
              hadFlow: !!(flow && !(flow as any).error), flowStale: !!(flow as any)?._stale,
              hadTide: !!(tide && !(tide as any).error), tideStale: !!(tide as any)?._stale,
            }),
          }),
        }).then(r => r.json())
          .then(d => { if (d?.error) console.error('[AutoSignal] INSERT FAILED:', JSON.stringify(d)); else console.log('[AutoSignal] logged:', result.signal, result.confidence) })
          .catch(() => {})
      } catch (e: any) {
        console.warn('[AutoSignal] fire failed:', e?.message)
      }
    }

    const kick = setTimeout(autoFire, 90000)          // 90s after load
    const ivA = setInterval(autoFire, 5 * 60 * 1000)  // check every 5min; throttle enforces 20min cadence
    return () => { cancelled = true; clearTimeout(kick); clearInterval(ivA) }
  }, [aiLoading, currentPrice])

  // ── Personal Trigger Engine — evaluate rules every tick (currentPrice change) ──
  useEffect(() => {
    if (!currentPrice || triggerRules.length === 0) return

    // ET session date + minutes since open
    const etNow = new Date()
    const etParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).formatToParts(etNow)
    let hh = parseInt(etParts.find(p => p.type === 'hour')?.value || '0', 10)
    if (hh === 24) hh = 0
    const mm = parseInt(etParts.find(p => p.type === 'minute')?.value || '0', 10)
    const sessionMinutes = (hh - 9) * 60 + (mm - 30)
    const sessionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(etNow)

    // Only evaluate during market hours
    if (sessionMinutes < 0 || sessionMinutes > 390) return

    // Reset accumulator on new session day
    if (!triggerAccumulator.current || triggerAccumulator.current.sessionDate !== sessionDate) {
      triggerAccumulator.current = newAccumulator(sessionDate)
      recentBarsRef.current = { highs: [], lows: [] }
    }

    // Track recent bar highs/lows (last 3) for hold detection
    const recent = recentBarsRef.current
    recent.highs.push(currentPrice)
    recent.lows.push(currentPrice)
    if (recent.highs.length > 12) recent.highs.shift()  // ~last 12 ticks
    if (recent.lows.length > 12) recent.lows.shift()

    // Build the market snapshot from live cockpit state
    const snap = {
      currentPrice,
      timestamp:      Date.now(),
      vwap:           levels?.spyVwap ?? null,
      ema200:         levels?.ema200 ?? null,
      ema90:          null,  // not currently computed cockpit-side; ema90_below primitive will no-op
      pdh:            levels?.pdh ?? null,
      pdl:            levels?.pdl ?? null,
      prevClose:      levels?.prevClose ?? null,
      orbHigh:        orbHigh ?? null,
      orbLow:         orbLow ?? null,
      tick:           marketIntel2?.tick ?? null,
      sessionMinutes,
    }

    const ctx = {
      snap,
      priorPrice:   priorPriceRef.current,
      recentLows:   [...recent.lows],
      recentHighs:  [...recent.highs],
    }

    const { accumulator, fires } = processTick(triggerRules, triggerAccumulator.current, ctx)
    triggerAccumulator.current = accumulator
    priorPriceRef.current = currentPrice

    if (fires.length > 0) {
      const fire = fires[0]  // handle one at a time
      setTriggerFire(fire)
      // Increment fire count server-side
      fetch('/api/triggers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fired', id: fire.rule.id }),
      }).catch(() => {})

      // Fast deterministic alert so the setup is NEVER missed
      try { speak(`Setup complete. ${fire.rule.name}. Checking context.`) } catch {}

      // Build full-context snapshot for the LLM overlay
      const overlayContext = {
        currentSPX:        currentPrice,
        timeET:            `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        sessionWindow:     sessionMinutes < 60 ? 'open_drive' : sessionMinutes < 300 ? 'mid_session' : 'power_hour',
        vix:               vixPrice ?? null,
        vwap:              snap.vwap,
        mechBias:          mechanicalFlow?.mechanicalBias ?? null,
        dayType:           dayTypeForecast?.dayType ?? null,
        dayTypeConfidence: dayTypeForecast?.confidence ?? null,
        dayDirectionalLean: dayTypeForecast?.directionalLean ?? null,
        gexRegime:         gexData?.regime ?? null,
        gammaFlip:         gexData?.gammaFlip ?? null,
        callWall:          gexData?.callWall ?? null,
        putWall:           gexData?.putWall ?? null,
        cumDelta:          microstructure?.cumulativeDelta?.strength ?? null,
        m15Trend:          snap.ema200 && currentPrice > snap.ema200 ? 'up' : 'down',
        breadth:           breadthData?.summary ?? null,
        newsSoon:          economicCalendar ? String(economicCalendar).substring(0, 300) : null,
        earningsToday:     (typeof earningsCalendar !== 'undefined' && earningsCalendar?.length)
          ? earningsCalendar.slice(0, 8).map((e: any) => e.ticker || e.symbol || '').filter(Boolean).join(', ')
          : null,
      }

      const stopPts = 8
      const entrySpx = currentPrice
      const predictedT1 = fire.rule.direction === 'LONG' ? entrySpx + 7 : entrySpx - 7
      const predictedStop = fire.rule.direction === 'LONG' ? entrySpx - stopPts : entrySpx + stopPts

      // Call the LLM overlay — never trade blind
      ;(async () => {
        // Regime memory: measured outcomes from similar historical states,
        // so the overlay verdict cites evidence, not just vibes
        let regimeMemoryText: string | null = null
        try {
          const memRes = await fetch('/api/regime-memory', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              components: {
                sessionWindow: overlayContext.sessionWindow,
                mechBias:      overlayContext.mechBias,
                cumDelta:      overlayContext.cumDelta,
                dayType:       overlayContext.dayType,
                m15Trend:      overlayContext.m15Trend,
                gexRegime:     overlayContext.gexRegime,
                vwapDist:      (snap.vwap && currentPrice) ? currentPrice - snap.vwap : null,
                vix:           vixPrice ?? null,
              },
            }),
          })
          const memData = await memRes.json()
          if (memData?.summaryText) regimeMemoryText = memData.summaryText
        } catch {}

        let overlay: any = null
        try {
          const res = await fetch('/api/triggers/overlay', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trigger: {
                name:            fire.rule.name,
                direction:       fire.rule.direction,
                confidence:      fire.rule.confidence,
                stopHint:        fire.rule.stopHint,
                firedConditions: fire.evaluation.firedConditions,
              },
              context: { ...overlayContext, regimeMemory: regimeMemoryText },
            }),
          })
          overlay = await res.json()
        } catch {}

        // Log the fire with both verdicts for attribution
        let fireId: string | null = null
        try {
          const logRes = await fetch('/api/triggers/fires', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action:          'log',
              triggerId:       fire.rule.id,
              triggerName:     fire.rule.name,
              direction:       fire.rule.direction,
              setupConfidence: fire.rule.confidence,
              entrySpx,
              predictedT1,
              predictedStop,
              aiVerdict:       overlay?.verdict ?? null,
              aiConfidence:    overlay?.aiConfidence ?? null,
              aiReasoning:     overlay?.reasoning ?? null,
              conflictFactors: overlay?.conflictFactors ?? null,
              agreement:       overlay?.agreement ?? null,
              context:         overlayContext,
            }),
          })
          const logData = await logRes.json()
          fireId = logData.id || null
        } catch {}

        const verdict = overlay?.verdict || 'CAUTION'

        // Voice the verdict
        try {
          if (verdict === 'CONFIRM') speak(`Confirmed. Context supports your ${fire.rule.direction}.`)
          else if (verdict === 'CONFLICT') speak(`Conflict. ${overlay?.reasoning?.split('.')[0] || 'Broader context opposes this'}. Your call.`)
          else speak(`Caution. ${overlay?.reasoning?.split('.')[0] || 'Some yellow flags'}.`)
        } catch {}

        // Set the rich fire object for the banner
        setTriggerFire({
          ...fire,
          overlay,
          fireId,
          entrySpx,
          predictedT1,
          predictedStop,
        })

        // Branch on verdict for the modal behavior (per your spec):
        //   CONFIRM  → auto-open modal (both aligned, fast path)
        //   CAUTION  → auto-open modal but conflict shown prominently
        //   CONFLICT → alert only, NO modal — you consciously choose
        if (verdict === 'CONFIRM' || verdict === 'CAUTION') {
          setShowTakeTrade({
            signal:         fire.rule.direction,
            confidence:     fire.rule.confidence,
            entryPrice:     entrySpx,
            suggestedEntry: entrySpx,
            stopLevel:      predictedStop,
            target1:        predictedT1,
            target2:        fire.rule.direction === 'LONG' ? entrySpx + 12 : entrySpx - 12,
            aiConfidence:   overlay?.aiConfidence ?? fire.rule.confidence,
            setupName:      `⚡ ${fire.rule.name}`,
            strike:         null,
            expiry:         '0DTE',
            _triggerFired:  true,
            _triggerFireId: fireId,
            _overlay:       overlay,
          })
        }
        // CONFLICT: banner only (setTriggerFire above), no modal
      })()
    }
  }, [currentPrice, triggerRules])

  // ── SETUP ENGINE — always-on mechanical detectors (PRIMARY, July 17) ────
  // Evaluates the five setup families every tick alongside the trigger
  // engine. On fire: measured stats (scoped setup+regime) → LLM risk-officer
  // overlay → log to trade_alerts (engine:'setup') → Focus Panel display.
  // The deterministic fire is NEVER blocked by the async LLM/stats calls.
  useEffect(() => {
    if (!currentPrice) return

    const etNow = new Date()
    const etParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).formatToParts(etNow)
    let hh = parseInt(etParts.find(p => p.type === 'hour')?.value || '0', 10)
    if (hh === 24) hh = 0
    const mm = parseInt(etParts.find(p => p.type === 'minute')?.value || '0', 10)
    const sessionMinutes = (hh - 9) * 60 + (mm - 30)
    const sessionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(etNow)
    if (sessionMinutes < 0 || sessionMinutes > 390) return

    // New session → fresh state machines
    if (!setupStateRef.current || setupStateRef.current.sessionDate !== sessionDate) {
      setupStateRef.current = newSetupState(sessionDate)
    }

    const snap = {
      currentPrice,
      timestamp:      Date.now(),
      vwap:           levels?.spyVwap ?? null,
      ema200:         levels?.ema200 ?? null,
      ema90:          null,
      pdh:            levels?.pdh ?? null,
      pdl:            levels?.pdl ?? null,
      prevClose:      levels?.prevClose ?? null,
      orbHigh:        orbHigh ?? null,
      orbLow:         orbLow ?? null,
      tick:           marketIntel2?.tick ?? null,
      sessionMinutes,
      gammaFlip:      gexData?.gammaFlip ?? null,
      callWall:       gexData?.callWall ?? null,
      putWall:        gexData?.putWall ?? null,
      extraLevels: [
        { label: 'D200EMA', value: mtfStructure?.spx?.d1?.ema200 ?? null },
        { label: 'D200SMA', value: mtfStructure?.spx?.d1?.sma200 ?? null },
        { label: 'H200EMA', value: mtfStructure?.spx?.h1?.ema200 ?? null },
        { label: 'D50EMA',  value: mtfStructure?.spx?.d1?.ema50 ?? null },
      ],
    }

    const { state: nextState, fires } = processSetupTick(setupStateRef.current, snap)
    setupStateRef.current = nextState
    if (fires.length === 0 || setupFireBusyRef.current) return

    const fire: SetupFire = fires[0]   // one at a time (same convention as triggers)
    setupFireBusyRef.current = true

    // Immediate deterministic alert — the setup is never missed
    try { speak(`Setup. ${fire.name}. ${fire.direction === 'LONG' ? 'Long' : 'Short'} side. Checking the numbers.`) } catch {}

    const entrySpx = currentPrice
    const predictedT1   = fire.direction === 'LONG' ? entrySpx + 7 : entrySpx - 7
    const predictedStop = fire.direction === 'LONG' ? entrySpx - 8 : entrySpx + 8
    const dayContract   = recommendDayContract(fire.direction, entrySpx)
    const gexRegimeNow = (gexData?.regime === 'positive' || gexData?.regime === 'negative') ? gexData.regime : null

    // Show the fire in the Focus Panel instantly (measured/AI fill in async)
    setSetupFireDisplay({
      name: fire.name, direction: fire.direction, detail: fire.detail,
      level: fire.level, entrySpx, predictedT1, predictedStop, contract: dayContract,
      measured: null, overlay: null, pending: true, firedAt: fire.firedAt,
    })
    // Session fires strip: append as pending, resolve below
    setSessionFires(prev => {
      const next = [...prev, {
        firedAt: fire.firedAt, name: fire.name, direction: fire.direction,
        timeET: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        verdict: null as string | null, sizing: null as string | null, measured: null as number | null,
      }]
      try { localStorage.setItem('tz-session-fires', JSON.stringify({ date: sessionDate, fires: next })) } catch {}
      return next
    })

    ;(async () => {
      // 1. Measured probability, scoped to this setup + current GEX regime
      let measured: { hitRate: number | null; n: number } | null = null
      try {
        const q = new URLSearchParams({ setupId: fire.setupId, days: '90' })
        if (gexRegimeNow) q.set('gexRegime', gexRegimeNow)
        const st = await fetch(`/api/setups/stats?${q.toString()}`).then(r => r.json())
        if (st?.ok) measured = { hitRate: st.hitRate ?? null, n: st.n ?? 0 }
      } catch {}

      // 2. Regime memory — measured outcomes from similar historical states
      let regimeMemoryText: string | null = null
      try {
        const memRes = await fetch('/api/regime-memory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            components: {
              sessionWindow: sessionMinutes < 60 ? 'open_drive' : sessionMinutes < 300 ? 'mid_session' : 'power_hour',
              mechBias:      mechanicalFlow?.mechanicalBias ?? null,
              cumDelta:      microstructure?.cumulativeDelta?.strength ?? null,
              dayType:       dayTypeForecast?.dayType ?? null,
              m15Trend:      snap.ema200 && currentPrice > snap.ema200 ? 'up' : 'down',
              gexRegime:     gexRegimeNow,
              vwapDist:      (snap.vwap && currentPrice) ? currentPrice - snap.vwap : null,
              vix:           vixPrice ?? null,
            },
          }),
        })
        const memData = await memRes.json()
        if (memData?.summaryText) regimeMemoryText = memData.summaryText
      } catch {}

      // 3. LLM as RISK OFFICER — verdict on the mechanical fire
      let overlay: any = null
      try {
        const res = await fetch('/api/triggers/overlay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: {
              name:            `[SETUP ENGINE] ${fire.name}`,
              direction:       fire.direction,
              confidence:      measured?.hitRate ?? 55,
              stopHint:        '8 points',
              firedConditions: [{ primitive: fire.setupId, firedAt: fire.firedAt, detail: fire.detail }],
            },
            context: {
              currentSPX:  currentPrice,
              timeET:      `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
              sessionWindow: sessionMinutes < 60 ? 'open_drive' : sessionMinutes < 300 ? 'mid_session' : 'power_hour',
              vix:         vixPrice ?? null,
              vwap:        snap.vwap,
              mechBias:    mechanicalFlow?.mechanicalBias ?? null,
              dayType:     dayTypeForecast?.dayType ?? null,
              gexRegime:   gexRegimeNow,
              gammaFlip:   gexData?.gammaFlip ?? null,
              callWall:    gexData?.callWall ?? null,
              putWall:     gexData?.putWall ?? null,
              cumDelta:    microstructure?.cumulativeDelta?.strength ?? null,
              m15Trend:    snap.ema200 && currentPrice > snap.ema200 ? 'up' : 'down',
              breadth:     breadthData?.summary ?? null,
              measuredSetupStats: measured ? `This setup in this regime: ${measured.hitRate !== null ? measured.hitRate + '% hit rate' : 'no decided sample yet'} (n=${measured.n})` : null,
              regimeMemory: regimeMemoryText,
            },
          }),
        })
        overlay = await res.json()
      } catch {}

      // 4. Log to trade_alerts — the treatment arm of the engine experiment.
      //    Graded automatically by score-alerts (strict T1-before-stop).
      try {
        await fetch('/api/trade-alerts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal:        fire.direction,
            entryZone:     { low: entrySpx, high: entrySpx },
            stopLevel:     predictedStop,
            target1:       predictedT1,
            target2:       fire.direction === 'LONG' ? entrySpx + 14 : entrySpx - 14,
            no_entry_zone: false,
            auto_fired:    true,
            currentPrice:  entrySpx,
            vwap:          snap.vwap,
            ema200:        snap.ema200,
            vix:           vixPrice ?? null,
            confidence:    measured?.hitRate ?? 55,
            moveSize:      7,
            ai_view:       overlay?.verdict ?? null,
            context_snapshot: JSON.stringify({
              auto: true, engine: 'setup',
              setupId: fire.setupId, setupName: fire.name,
              level: fire.level, levelLabel: fire.levelLabel, detail: fire.detail,
              gexRegime: gexRegimeNow, dayType: dayTypeForecast?.dayType ?? null,
              recommendedContract: dayContract,
              measuredHitRate: measured?.hitRate ?? null, measuredN: measured?.n ?? 0,
              aiVerdict: overlay?.verdict ?? null, aiConfidence: overlay?.aiConfidence ?? null,
              agreement: overlay?.agreement ?? null,
            }),
          }),
        }).then(r => r.json())
          .then(d => { if (d?.error) console.error('[SetupEngine] INSERT FAILED:', JSON.stringify(d)); else console.log('[SetupEngine] logged:', fire.setupId, fire.direction) })
      } catch {}

      // 5. Voice + Focus Panel update with the full picture
      const verdict = overlay?.verdict || 'CAUTION'
      const sizing = verdict === 'CONFIRM'
        ? ((overlay?.aiConfidence ?? 0) >= 70 ? 'full size' : 'half size')
        : verdict === 'CAUTION' ? 'half size' : 'stand aside'
      try {
        const measuredLine = measured && measured.hitRate !== null && measured.n >= 5
          ? ` Measured ${measured.hitRate} percent on ${measured.n} samples.` : ''
        if (verdict === 'CONFIRM') speak(`Confirmed.${measuredLine} ${sizing === 'full size' ? 'Full' : 'Half'} size ${fire.direction === 'LONG' ? 'long' : 'short'}.`)
        else if (verdict === 'CONFLICT') speak(`Risk officer says conflict. ${overlay?.reasoning?.split('.')[0] || 'Context opposes this'}. Standing aside.`)
        else speak(`Caution.${measuredLine} Half size if you take it.`)
      } catch {}

      setSetupFireDisplay({
        name: fire.name, direction: fire.direction, detail: fire.detail,
        level: fire.level, entrySpx, predictedT1, predictedStop, contract: dayContract,
        measured, overlay, sizing, pending: false, firedAt: fire.firedAt,
      })
      setSessionFires(prev => {
        const next = prev.map(f => f.firedAt === fire.firedAt
          ? { ...f, verdict, sizing, measured: measured?.hitRate ?? null, measuredN: measured?.n ?? 0 }
          : f)
        try { localStorage.setItem('tz-session-fires', JSON.stringify({ date: sessionDate, fires: next })) } catch {}
        return next
      })
      setupFireBusyRef.current = false
    })().catch(() => { setupFireBusyRef.current = false })
  }, [currentPrice])

  // ── Day Type Forecaster — auto-fires at 10am ET when OR completes ───────
  useEffect(() => {
    if (!currentPrice) return

    // Robust ET time extraction using Intl.DateTimeFormat
    const etTimeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      hour: '2-digit', minute: '2-digit',
    })
    const etParts = etTimeFmt.format(new Date()).split(':')
    const etHour = parseInt(etParts[0], 10)
    const etMin = parseInt(etParts[1], 10)
    const minutesSinceOpen = (etHour - 9) * 60 + (etMin - 30)

    // Only fire after 10am ET (30+ min after open — OR has had time to form)
    // and only if we haven't fired yet OR data has materially updated
    const shouldFire = minutesSinceOpen >= 30 && orbHigh !== null && orbLow !== null

    if (!shouldFire) {
      console.log(`[DayType] not firing — minutesSinceOpen=${minutesSinceOpen}, orbHigh=${orbHigh}, orbLow=${orbLow}`)
      return
    }

    // Compute TICK range from breadthData over last 15min if we have history
    // For now we use the current value as both high and low — refine later when we add tick history
    const tickHigh = breadthData?.tick?.value || null
    const tickLow  = breadthData?.tick?.value || null

    // Compute VIX change today
    const vixChange = (() => {
      if (!marketIntel2?.vixPrice || !marketIntel2?.vixPrevClose) return null
      return ((marketIntel2.vixPrice - marketIntel2.vixPrevClose) / marketIntel2.vixPrevClose) * 100
    })()

    // Day of week + OPEX detection (ET-based, robust)
    const etDateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', day: '2-digit',
    })
    const etDateParts = etDateFmt.formatToParts(new Date())
    const weekdayShort = etDateParts.find(p => p.type === 'weekday')?.value || ''
    const dayOfMonth = parseInt(etDateParts.find(p => p.type === 'day')?.value || '0', 10)
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const dayOfWeek = weekdayMap[weekdayShort] ?? new Date().getDay()
    const isOpex = dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21
    // FOMC days — economicCalendar is a string summary; check for keywords
    const calStr = (economicCalendar || '').toLowerCase()
    const isFomcDay = calStr.includes('fomc') || calStr.includes('fed funds') || calStr.includes('rate decision')

    // Gap from prior close
    const gapPoints = (() => {
      if (!levels?.prevClose || !candles.length) return null
      // First bar of today
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const todaysCandles = candles.filter(c => new Date(c.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today)
      if (todaysCandles.length === 0) return null
      return todaysCandles[0].o - levels.prevClose
    })()

    // ES overnight trend — proxy from gap direction for now
    const esOvernightTrend = gapPoints !== null
      ? gapPoints > 3 ? 'BULLISH' as const : gapPoints < -3 ? 'BEARISH' as const : 'CHOPPY' as const
      : null

    // Yesterday's range
    const yesterdayRange = (levels?.pdh && levels?.pdl) ? levels.pdh - levels.pdl : null

    // Cum delta trend — derive from microstructure if available
    const cumDeltaTrend = (() => {
      const strength = microstructure?.cumulativeDelta?.strength
      if (strength === 'STRONG_BUY' || strength === 'STRONG_SELL') return 'BUILDING' as const
      if (strength === 'NEUTRAL') return 'NEUTRAL' as const
      return 'NEUTRAL' as const
    })()

    try {
      const forecast = forecastDayType({
        netGex:               gexData?.netGex || null,
        gexRegime:            gexData?.regime || null,
        tickValue:            breadthData?.tick?.value || null,
        tickHigh15m:          tickHigh,
        tickLow15m:           tickLow,
        cumDelta:             microstructure?.cumulativeDelta?.strength || null,
        cumDeltaTrend,
        vixPrice:             marketIntel2?.vixPrice || null,
        vixChange,
        vix1d:                marketIntel2?.termStructure?.vix1d || null,
        vix30:                marketIntel2?.termStructure?.vix30 || null,
        orbHigh,
        orbLow,
        orbWindowMins,
        m15Trend:             multiTFData?.m15?.trend || null,
        m15RangePct:          multiTFData?.m15?.rangePct || null,
        crossAssetBias:       multiTFData?.crossAsset?.confirmation || null,
        currentPrice,
        pdh:                  levels?.pdh || null,
        pdl:                  levels?.pdl || null,
        esOvernightTrend,
        gapPoints,
        isOpex,
        isFomcDay,
        dayOfWeek,
        minutesSinceOpen,
        yesterdayRange,
      })
      setDayTypeForecast(forecast)
      if (!dayTypeFired && minutesSinceOpen >= 30) setDayTypeFired(true)
    } catch (e) {
      console.warn('[DayType] forecast failed:', e)
    }
  }, [
    currentPrice, orbHigh, orbLow, gexData, breadthData, microstructure,
    multiTFData, marketIntel2, levels, candles, economicCalendar, dayTypeFired,
  ])

  // ── Actionability classifier — recomputes when signal or supporting data changes ──
  useEffect(() => {
    if (!aiResult || !currentPrice) {
      setActionability(null)
      return
    }
    try {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const minsLeft = Math.max(0, 960 - (et.getHours() * 60 + et.getMinutes()))
      const signalAge = lastAITime ? (() => {
        const [hh, mm] = lastAITime.split(':').map(Number)
        const sigTime = new Date()
        sigTime.setHours(hh, mm, 0, 0)
        return (Date.now() - sigTime.getTime()) / 60000
      })() : 0
      const recentVols = candles.slice(-20).map(c => c.v || 0)
      const avgVol = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : null
      const currVol = candles[candles.length - 1]?.v || null
      const result = classifyActionability({
        signal:                  aiResult.signal || null,
        confidence:              aiResult.confidence || null,
        signalAge,
        qualityVerdict:          signalQuality?.verdict || null,
        mechanicalScore:         mechanicalFlow?.mechanicalScore || null,
        asymmetricSetup:         mechanicalFlow?.asymmetricSetup || null,
        currentPrice,
        vwap:                    levels?.spyVwap || null,
        ema200:                  levels?.ema200 || null,
        poc:                     volumeProfile?.poc || null,
        callWall:                gexData?.callWall || null,
        putWall:                 gexData?.putWall || null,
        gammaFlip:               gexData?.gammaFlip || null,
        currentVolume:           currVol,
        avgVolume:                avgVol,
        upcomingEvents:          (economicCalendar as any) || [],
        sessionMinsLeft:         minsLeft,
        historicalWinRateAtConf: null,
      })
      setActionability(result)
    } catch (e) { console.warn('[Actionability]', e) }
  }, [aiResult, lastAITime, signalQuality, mechanicalFlow, currentPrice, levels, volumeProfile, gexData, economicCalendar, candles])

  // Load edge profile on mount (backtest baseline + live accuracy)
  useEffect(() => {
    setEdgeLoading(true)
    loadEdgeProfile()
      .then(p => { if (p) setEdgeProfile(p) })
      .catch(e => console.warn('[EdgeLoader] Failed:', e))
      .finally(() => setEdgeLoading(false))
    // Load discovered rules from Supabase
    fetch('/api/userdata?table=discovered_rules')
      .then(r => r.json())
      .then(d => { if (d.data?.rules?.length) setDiscoveredRules(d.data.rules) })
      .catch(() => {})
  }, [])

  // Compute execution stats from trade alert history (human vs AI)
  const [executionStats, setExecutionStats] = useState<any>(null)

  // Avatar companion
  const [avatarMode, setAvatarMode]     = useState(() => typeof window !== 'undefined' && localStorage.getItem('tz-avatar-mode') === 'true')
  const [avatarId, setAvatarId]         = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('tz-avatar-id') || '') : '')
  const avatarRef                        = useRef<AvatarCompanionHandle>(null)
  useEffect(() => {
    fetch('/api/trade-alerts?days=30')
      .then(r => r.json())
      .then(d => {
        const alerts    = d.alerts || []
        const withHuman = alerts.filter((a: any) => a.human_took_trade != null)
        if (withHuman.length < 3) return
        const took    = withHuman.filter((a: any) => a.human_took_trade)
        const skipped = withHuman.filter((a: any) => !a.human_took_trade)
        const scored  = alerts.filter((a: any) => a.outcome !== 'PENDING')
        const aiWins  = scored.filter((a: any) => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
        const aiWinRate   = scored.length ? Math.round(aiWins.length / scored.length * 100) : null
        const avgAiPts    = aiWins.length ? parseFloat((aiWins.reduce((s: number, a: any) => s + Math.abs(a.pts_to_t1 || 0), 0) / aiWins.length).toFixed(1)) : null
        const humanWins   = took.filter((a: any) => a.human_outcome === 'HIT_T1' || a.human_outcome === 'HIT_T2')
        const humanWinRate = took.length ? Math.round(humanWins.length / took.length * 100) : null
        const avgHumanPts  = took.length ? parseFloat((took.reduce((s: number, a: any) => s + Math.abs(a.human_pts || 0), 0) / took.length).toFixed(1)) : null
        const executionGap = avgAiPts && avgHumanPts ? parseFloat((avgAiPts - avgHumanPts).toFixed(1)) : null
        const skipRate    = withHuman.length ? Math.round(skipped.length / withHuman.length * 100) : null
        const reasons: Record<string, number> = {}
        skipped.forEach((a: any) => { if (a.skip_reason) reasons[a.skip_reason] = (reasons[a.skip_reason] || 0) + 1 })
        const topSkipReason = Object.entries(reasons).sort((a,b) => b[1]-a[1])[0]?.[0]?.replace(/_/g, ' ') || null
        setExecutionStats({ humanWinRate, aiWinRate, avgHumanPts, avgAiPts, skipRate, topSkipReason, executionGap })
      })
      .catch(() => {})
  }, [])

  // Check subscription access on load
  useEffect(() => {
    fetch('/api/subscription')
      .then(r => r.json())
      .then(d => {
        setSubStatus(d.hasAccess ? 'active' : 'none')
        setSubPlan(d.plan || null)
      })
      .catch(() => setSubStatus('none'))
  }, [])

  // Show tutorial on first visit
  useEffect(() => {
    if (!localStorage.getItem('tz-tutorial-seen')) {
      setShowTutorial(true)
    }
  }, [])

  // Flow alert — independent polling loop every 60s, no manual trigger needed
  useEffect(() => {
    const ALERT_THRESHOLD = 500  // $500K premium
    const poll = async () => {
      try {
        const uwKey = keys[UW_KEY] || 'server'
        const d = await (await fetch(`/api/flow?path=/api/option-trades/flow-alerts?limit=50`)).json()
        const all: any[] = d.data || []
        all.sort((a: any, b: any) => parseFloat(b.total_premium||0) - parseFloat(a.total_premium||0))
        const newAlerts: any[] = []
        all.forEach((f: any) => {
          const premK = parseFloat(f.total_premium || '0') / 1000
          if (premK < ALERT_THRESHOLD) return
          const ticker = f.ticker || f.symbol || ''
          const type = f.type || f.put_call || f.option_type || ''  // UW flow-alerts uses 'type'
          const strike = f.strike || f.strike_price || ''
          const expiry = f.expiry || f.expiration_date || ''
          const isCall = type.toLowerCase().startsWith('c')
          const isPut = type.toLowerCase().startsWith('p')
          // Sentiment: ask-side premium = aggressive buyer (bullish for calls, bearish for puts)
          const askPrem = parseFloat(f.total_ask_side_prem || '0')
          const bidPrem = parseFloat(f.total_bid_side_prem || '0')
          const aggressiveBuy = askPrem > bidPrem
          const sentiment = f.sentiment || (
            isCall ? (aggressiveBuy ? 'BULLISH' : 'NEUTRAL') :
            isPut  ? (aggressiveBuy ? 'BEARISH' : 'NEUTRAL') :
            'NEUTRAL'
          )
          const premStr = premK >= 1000 ? `$${(premK/1000).toFixed(1)}M` : `$${Math.round(premK)}K`
          const key = `${ticker}-${strike}-${expiry}-${type}-${Math.round(premK)}`
          if (!flowAlertShownRef.current.has(key)) {
            flowAlertShownRef.current.add(key)
            newAlerts.push({ id: key, ticker, type, strike, expiry, premium: premStr, sentiment, unusual: f.is_unusual || f.unusual, ts: Date.now() })
          }
        })
        if (newAlerts.length) {
          setFlowAlerts(prev => [...newAlerts, ...prev].slice(0, 5))
          const top = newAlerts[0]
          const dir = top.sentiment === 'BULLISH' ? 'bullish' : top.sentiment === 'BEARISH' ? 'bearish' : ''
          const msg = `Flow alert. ${top.ticker} ${top.type?.toLowerCase().startsWith('c') ? 'call' : 'put'} ${top.premium} ${dir} sweep.`
          // Only announce flow alert if companion is completely silent
          // Delay 2s to give companion time to set lock, then check both refs
          setTimeout(() => {
            const isCompanionTalking = speakLockRef.current || speaking || audioSourceRef.current !== null
            if (!isCompanionTalking) speak(msg)
          }, 2000)
        }
      } catch {}
    }
    // First poll after 10s (let page load), then every 60s
    const init = setTimeout(poll, 10000)
    const interval = setInterval(poll, 60000)
    return () => { clearTimeout(init); clearInterval(interval) }
  }, [])

  // Watchdog: force-unlock speaking state if stuck > 90s (onended should handle normal cases)
  const speakLockTimerRef = useRef<number>(0)
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (speakLockRef.current) {
        if (!speakLockTimerRef.current) {
          speakLockTimerRef.current = Date.now()
        } else if (Date.now() - speakLockTimerRef.current > 90000) {
          // Stuck for 90s — force unlock
          console.warn('[TZ] speak watchdog: force-unlocking after 90s')
          speakLockRef.current = false
          audioSourceRef.current = null
          setSpeaking(false)
          speakLockTimerRef.current = 0
        }
      } else {
        speakLockTimerRef.current = 0  // reset timer when not speaking
      }
    }, 3000)
    return () => clearInterval(watchdog)
  }, [])
  const [systemCheck, setSystemCheck] = useState<any>(null)
  const [earningsCalendar, setEarningsCalendar] = useState<any[]>([])
  const [systemCheckRunning, setSystemCheckRunning] = useState(false)
  const [customVoiceId, setCustomVoiceId] = useState('')
  const [elVoices, setElVoices] = useState<any[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const morningPlanLoadedRef = useRef(true)  // true = ok to save (initialized from localStorage)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const speakLockRef = useRef<boolean>(false)   // prevents overlapping speak() calls
  const speakQueueRef = useRef<string | null>(null)  // holds latest pending text

  // Drawing state
  const [drawMode, setDrawMode] = useState<string | null>(null)
  const [drawColor, setDrawColor] = useState(C_DARK.teal)
  const [drawnLines, setDrawnLines] = useState<any[]>([])
  const [drawnZones, setDrawnZones] = useState<any[]>([])
  const [drawPreview, setDrawPreview] = useState<any>(null)
  const [overlayCrosshair, setOverlayCrosshair] = useState<any>(null)
  const [drawPoint1, setDrawPoint1] = useState<any>(null)
  const [chartTf, setChartTf] = useState<string>('5')
  const chartTfRef = useRef<string>('5')
  // Keep ref in sync so fetchHistory always reads latest TF without stale closure
  useEffect(() => { chartTfRef.current = chartTf }, [chartTf])
  useEffect(() => { currentPriceRef.current = currentPrice }, [currentPrice])

  useEffect(() => {
    // Load voice engine preference
    const savedEngine = localStorage.getItem('tz-voice-engine') as 'openai'|'webspeech'|null
    if (savedEngine) setVoiceEngine(savedEngine)

    // Load drawn lines/zones
    try {
      const dl = localStorage.getItem('tz-drawn-lines')
      if (dl) setDrawnLines(JSON.parse(dl))
      const dz = localStorage.getItem('tz-drawn-zones')
      if (dz) setDrawnZones(JSON.parse(dz))
    } catch {}

    const saved = localStorage.getItem('tz-dark-mode')
    if (saved !== null) setDarkMode(saved === 'true')
  }, [])

  useEffect(() => {
    document.body.style.background = darkMode ? '#060810' : '#f0f4f8'
  }, [darkMode])
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)  // exposes coordinateToPrice()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const aiIntervalRef = useRef<any>(null)

  // Load keys & saved data
  useEffect(() => {
    // Start with server-side defaults — keys are now all server-side
    const serverDefaults: any = {
      [POLY_KEY]: 'server',
      [ANTH_KEY]: 'server',
      [UW_KEY]: 'server',
      [EL_KEY]: 'server',
      [TIINGO_KEY]: 'server',
    }
    // Merge any user-provided localStorage keys on top (for users who self-host)
    ;[POLY_KEY, ANTH_KEY, UW_KEY, EL_KEY, TIINGO_KEY].forEach(k => {
      const v = localStorage.getItem(k)
      if (v) serverDefaults[k] = v
    })
    setKeys(serverDefaults)
    // Keys are server-side — don't auto-open settings when localStorage keys missing
    // setShowSettings only if user explicitly opens it via ⚙ button

    const savedVoice = localStorage.getItem(VOICE_ID)
    if (savedVoice) setVoiceId(savedVoice)
    const savedSpeed = localStorage.getItem('tz-voice-speed')
    if (savedSpeed) setVoiceSpeed(parseFloat(savedSpeed))

    // Load name, welcome message, and AI tone
    const savedName = localStorage.getItem('tz-user-name')
    if (savedName) setUserName(savedName)
    const savedWelcome = localStorage.getItem('tz-welcome-message')
    if (savedWelcome) setWelcomeMessage(savedWelcome)
    const savedTone = localStorage.getItem('tz-ai-tone')
    if (savedTone) setAiTone(parseInt(savedTone))

    // Auto-fetch ElevenLabs voices
    const elKey = localStorage.getItem(EL_KEY)
    if (elKey) {
      fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elKey } })
        .then(r => r.json())
        .then(d => {
          if (d.voices?.length) {
            setElVoices(d.voices)
            // If no saved voice or saved voice not in list, use first
            const saved = localStorage.getItem(VOICE_ID)
            const valid = d.voices.find((v: any) => v.voice_id === saved)
            if (!valid) {
              setVoiceId(d.voices[0].voice_id)
              localStorage.setItem(VOICE_ID, d.voices[0].voice_id)
              console.log('TZ: Auto-set voice to', d.voices[0].name)
            }
          }
        })
        .catch(e => console.warn('TZ: Could not fetch EL voices', e))
    }

    // Show disclosure if not yet accepted
    const accepted = localStorage.getItem('tz-disclosure-accepted')
    if (!accepted) setShowDisclosure(true)

    // Load from Supabase (cloud-first, localStorage fallback)
    ;(async () => {
      // Load trader profile first (informs companion personality)
      try {
        const profileRes = await fetch('/api/trader-profile')
        if (profileRes.ok) {
          const { data } = await profileRes.json()
          if (data) {
            setTraderProfile(data)
            // Rebuild session memory string from profile log
            if (data.memory_log?.length > 0) {
              setSessionMemory(data.memory_log.slice(-20).join('\n'))
            }
          }
        }
      } catch {}
    })()
    ;(async () => {
      try {
        const [tradesRes, playbooksRes] = await Promise.all([
          fetch('/api/userdata?table=trades'),
          fetch('/api/userdata?table=playbooks'),
        ])
        if (tradesRes.ok) {
          const { data } = await tradesRes.json()
          if (data && data.length > 0) {
            const mapped = data.map((r: any) => ({ ...r, id: r.id, pnl: parseFloat(r.pnl) || 0, inSystem: r.in_system }))
            setTrades(mapped)
            setTradeStats(analyzeTradeHistory(mapped))
            localStorage.setItem('tz-trades', JSON.stringify(mapped))
          } else {
            const saved = localStorage.getItem('tz-trades')
            if (saved) { try { const t = JSON.parse(saved); setTrades(t); if (t.length) setTradeStats(analyzeTradeHistory(t)) } catch {} }
          }
        }
        if (playbooksRes.ok) {
          const { data } = await playbooksRes.json()
          if (data && data.length > 0) {
            setPlaybooks(data)
            localStorage.setItem('tz-playbooks', JSON.stringify(data))
          } else {
            const saved = localStorage.getItem('tz-playbooks')
            if (saved) { try { setPlaybooks(JSON.parse(saved)) } catch {} }
          }
        }
      } catch {
        const savedTrades = localStorage.getItem('tz-trades')
        if (savedTrades) { try { const t = JSON.parse(savedTrades); setTrades(t); if (t.length) setTradeStats(analyzeTradeHistory(t)) } catch {} }
        const savedPlaybooks = localStorage.getItem('tz-playbooks')
        if (savedPlaybooks) { try { setPlaybooks(JSON.parse(savedPlaybooks)) } catch {} }
      }
    })()

    // Load morning plan from Supabase (localStorage already loaded in useState)
    ;(async () => {
      try {
        const planRes = await fetch('/api/userdata?table=morning_plan')
        if (planRes.ok) {
          const { data } = await planRes.json()
          if (data) {
            // Handle both camelCase (user_settings path) and snake_case (morning_plans table)
            const plan = {
              bias: data.bias || 'neutral',
              gapDirection: data.gapDirection || data.gap_direction || 'flat',
              gapSize: data.gapSize ?? data.gap_size ?? '',
              impliedMove: data.impliedMove ?? data.implied_move ?? '',
              keyLevels: data.keyLevels ?? data.key_levels ?? '',
              notes: data.notes || '',
            }
            setMorningPlan(plan)
            localStorage.setItem('tz-morning-plan', JSON.stringify(plan))
          } else {
            const savedPlan = localStorage.getItem('tz-morning-plan')
            if (savedPlan) { try { setMorningPlan(JSON.parse(savedPlan)) } catch {} }
          }
        }
      } catch {
        const savedPlan = localStorage.getItem('tz-morning-plan')
        if (savedPlan) { try { setMorningPlan(JSON.parse(savedPlan)) } catch {} }
      }
    })()
  }, [])

  // Save morning plan — only after initial load to avoid wiping saved data
  useEffect(() => {
    if (!morningPlanLoadedRef.current) return  // don't save empty initial state
    localStorage.setItem('tz-morning-plan', JSON.stringify(morningPlan))
    // Sync to Supabase
    fetch('/api/userdata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'morning_plan', data: morningPlan })
    }).catch(() => {})
    if (openPrice) {
      const im = parseFloat(morningPlan.impliedMove) || 0
      setLevels((p: any) => ({
        ...p,
        impliedHigh: im ? openPrice + im : null,
        impliedLow: im ? openPrice - im : null,
      }))
    }
  }, [morningPlan, openPrice])

  // Save playbooks
  useEffect(() => { localStorage.setItem('tz-voice-engine', voiceEngine) }, [voiceEngine])

  // Persist drawn lines & zones to localStorage whenever they change
  useEffect(() => { localStorage.setItem('tz-drawn-lines', JSON.stringify(drawnLines)) }, [drawnLines])
  useEffect(() => { localStorage.setItem('tz-drawn-zones', JSON.stringify(drawnZones)) }, [drawnZones])

  useEffect(() => {
    localStorage.setItem('tz-playbooks', JSON.stringify(playbooks))
  }, [playbooks])

  // Save trades
  useEffect(() => {
    localStorage.setItem('tz-trades', JSON.stringify(trades))
    if (trades.length > 0) {
      // Sync to Supabase in background (non-blocking)
      fetch('/api/userdata?table=trades', { method: 'DELETE' }).then(() =>
        fetch('/api/userdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'trades_bulk', data: { trades } })
        })
      ).catch(() => {}) // silent fail — localStorage already saved
    }
    if (trades.length) setTradeStats(analyzeTradeHistory(trades))
  }, [trades])

  // Overlay canvas drawing
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    const container = chartContainerRef.current
    if (!canvas || !container) return
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const f = "'JetBrains Mono', monospace"

    // Horizontal lines are rendered via lightweight-charts PriceLine (price-accurate)
    // Only draw trendlines on canvas since they need two-point coordinates
    drawnLines.filter((l: any) => l.type === 'trendline' && l.p2).forEach((line: any) => {
      ctx.beginPath(); ctx.moveTo(line.p1.x * W, line.p1.y * H); ctx.lineTo(line.p2.x * W, line.p2.y * H)
      ctx.strokeStyle = line.color; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke()
    })
    drawnZones.forEach((zone: any) => {
      if (zone.y2 === undefined) return
      const y1 = Math.min(zone.y1, zone.y2) * H, y2 = Math.max(zone.y1, zone.y2) * H
      ctx.fillStyle = zone.color + '22'; ctx.fillRect(0, y1, W, y2 - y1)
      ctx.strokeStyle = zone.color + '60'; ctx.lineWidth = 1; ctx.setLineDash([4,4]); ctx.strokeRect(0, y1, W, y2 - y1); ctx.setLineDash([])
    })
    if (drawPreview && drawMode) {
      ctx.strokeStyle = drawColor + 'aa'; ctx.lineWidth = 1; ctx.setLineDash([4,4])
      if (drawMode === 'horizontal') {
        ctx.beginPath(); ctx.moveTo(0, drawPreview.y * H); ctx.lineTo(W, drawPreview.y * H); ctx.stroke()
      } else if (drawMode === 'trendline' && drawPoint1) {
        ctx.beginPath(); ctx.moveTo(drawPoint1.x * W, drawPoint1.y * H); ctx.lineTo(drawPreview.x * W, drawPreview.y * H); ctx.stroke()
      } else if (drawMode === 'zone' && drawPoint1) {
        const y1 = Math.min(drawPoint1.y, drawPreview.y) * H, y2 = Math.max(drawPoint1.y, drawPreview.y) * H
        ctx.fillStyle = drawColor + '15'; ctx.fillRect(0, y1, W, y2 - y1); ctx.strokeRect(0, y1, W, y2 - y1)
      }
      ctx.setLineDash([])
    }
    if (overlayCrosshair && drawMode) {
      ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 0.5; ctx.setLineDash([2,4])
      ctx.beginPath(); ctx.moveTo(overlayCrosshair.x, 0); ctx.lineTo(overlayCrosshair.x, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, overlayCrosshair.y); ctx.lineTo(W, overlayCrosshair.y); ctx.stroke()
      ctx.setLineDash([])
    }
  }, [drawnLines, drawnZones, drawPreview, overlayCrosshair, drawMode, drawColor, drawPoint1])

  useEffect(() => { drawOverlay() }, [drawOverlay])

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (drawMode === 'horizontal') {
      // Use lightweight-charts coordinateToPrice for exact price at this pixel Y
      let priceAtY = 0
      try {
        if (candleSeriesRef.current && overlayCanvasRef.current) {
          const canvasH = overlayCanvasRef.current.height
          const pixelY = y * canvasH
          const exactPrice = candleSeriesRef.current.coordinateToPrice(pixelY)
          if (exactPrice != null && !isNaN(exactPrice)) {
            priceAtY = parseFloat(exactPrice.toFixed(2))
          }
        }
      } catch {}
      // Fallback if coordinateToPrice fails
      if (!priceAtY) {
        const prices2 = candles.slice(-150).map((c: any) => [c.h, c.l]).flat().filter(Boolean)
        const cLow = prices2.length ? Math.min(...prices2) : 0
        const cHigh = prices2.length ? Math.max(...prices2) : 0
        const pad = (cHigh - cLow) * 0.08
        priceAtY = parseFloat((cHigh + pad - y * (cHigh - cLow + pad * 2)).toFixed(2))
      }
      setDrawnLines((p: any[]) => [...p, { id: Date.now(), type: 'horizontal', y, color: drawColor, label: '', price: priceAtY }])
      setDrawMode(null); setDrawPreview(null)
    } else if (drawMode === 'trendline' || drawMode === 'zone') {
      if (!drawPoint1) { setDrawPoint1({ x, y }) }
      else {
        if (drawMode === 'trendline') {
          let p2y = 0, p1y = 0
          try {
            if (candleSeriesRef.current && overlayCanvasRef.current) {
              const H2 = overlayCanvasRef.current.height
              p2y = parseFloat((candleSeriesRef.current.coordinateToPrice(y * H2) || 0).toFixed(2))
              p1y = parseFloat((candleSeriesRef.current.coordinateToPrice(drawPoint1.y * H2) || 0).toFixed(2))
            }
          } catch {}
          if (!p2y) {
            const prices2 = candles.slice(-150).map((c: any) => [c.h, c.l]).flat().filter(Boolean)
            const cHigh2 = prices2.length ? Math.max(...prices2) : 0
            const cLow2 = prices2.length ? Math.min(...prices2) : 0
            const pad2 = (cHigh2 - cLow2) * 0.05
            p2y = parseFloat((cHigh2 + pad2 - y * (cHigh2 - cLow2 + pad2 * 2)).toFixed(2))
            p1y = parseFloat((cHigh2 + pad2 - drawPoint1.y * (cHigh2 - cLow2 + pad2 * 2)).toFixed(2))
          }
          setDrawnLines((p: any[]) => [...p, { id: Date.now(), type: 'trendline', p1: drawPoint1, p2: { x, y }, color: drawColor, price1: p1y, price2: p2y }])
        }
        else {
          let zPriceLow = 0, zPriceHigh = 0
          try {
            if (candleSeriesRef.current && overlayCanvasRef.current) {
              const H3 = overlayCanvasRef.current.height
              const topY = Math.min(drawPoint1.y, y)
              const botY = Math.max(drawPoint1.y, y)
              zPriceHigh = parseFloat((candleSeriesRef.current.coordinateToPrice(topY * H3) || 0).toFixed(2))
              zPriceLow = parseFloat((candleSeriesRef.current.coordinateToPrice(botY * H3) || 0).toFixed(2))
            }
          } catch {}
          if (!zPriceHigh) {
            const prices3 = candles.slice(-150).map((c: any) => [c.h, c.l]).flat().filter(Boolean)
            const zH = prices3.length ? Math.max(...prices3) : 0
            const zL = prices3.length ? Math.min(...prices3) : 0
            const zP = (zH - zL) * 0.05
            const yPriceFn = (yv: number) => parseFloat((zH + zP - yv * (zH - zL + zP * 2)).toFixed(2))
            zPriceHigh = yPriceFn(Math.min(drawPoint1.y, y))
            zPriceLow = yPriceFn(Math.max(drawPoint1.y, y))
          }
          setDrawnZones((p: any[]) => [...p, { id: Date.now(), y1: drawPoint1.y, y2: y, color: drawColor, priceLow: zPriceLow, priceHigh: zPriceHigh }])
        }
        setDrawPoint1(null); setDrawMode(null); setDrawPreview(null)
      }
    }
  }, [drawMode, drawColor, drawPoint1])

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setOverlayCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (drawMode) setDrawPreview({ x, y })
  }, [drawMode])

  const handleOverlayMouseUp = useCallback(() => {}, [])

  // Fetch market data — timeframe-aware with correct lookback windows
  const fetchHistory = useCallback(async (ticker: string, setter: any, key: string) => {
    const polyKey = keys[POLY_KEY] || 'env'  // fall through to server-side key
    try {
      const est = getEST()
      const today = est.toISOString().split('T')[0]
      const yday = new Date(est)
      yday.setDate(yday.getDate() - 1)
      while (yday.getDay() === 0 || yday.getDay() === 6) yday.setDate(yday.getDate() - 1)
      const ydayStr = yday.toISOString().split('T')[0]

      const proxyFetch = (path: string) =>
        fetch(`/api/polygon?apiKey=${polyKey || 'env'}&path=${encodeURIComponent(path)}`)

      // Timeframe-aware: SPX uses selected chartTf, SPY/VIX always use 5m
      const tf = key === 'spx' ? (chartTfRef.current || '5') : '5'
      const tfCfg = TF_CONFIG[tf] || TF_CONFIG['5']
      const fromDate = new Date(est)
      fromDate.setDate(fromDate.getDate() - tfCfg.daysBack)
      while (fromDate.getDay() === 0 || fromDate.getDay() === 6) fromDate.setDate(fromDate.getDate() - 1)
      const fromStr = fromDate.toISOString().split('T')[0]

      // Fetch candles with pagination for Deep Dive chart
      // Stops when we have enough TRADING DAYS (not just bar count)
      const fetchAllPages = async (initialPath: string): Promise<any[]> => {
        const tf2 = key === 'spx' ? (chartTfRef.current || '5') : '5'
        // How many trading days we want per timeframe
        const targetTradingDays = tf2 === '1' ? 2 : tf2 === '5' ? 5 : tf2 === '15' ? 5 : tf2 === '60' ? 20 : 250
        const maxPages = 60  // safety cap — 1H needs up to 50 pages
        let all: any[] = []
        let nextPath: string | null = initialPath
        let pages = 0
        while (nextPath && pages < maxPages) {
          try {
            const text = await proxyFetch(nextPath).then(r => r.text())
            if (!text || !text.trim()) break
            const data = JSON.parse(text)
            if (data.results?.length) all = all.concat(data.results)
            // Count unique trading days in what we have
            const tradingDays = new Set(
              all.map((b: any) => new Date(b.t).toLocaleDateString('en-US', { timeZone: 'America/New_York' }))
            ).size
            if (tradingDays >= targetTradingDays) break  // we have enough days
            if (data.next_url) {
              try { const u = new URL(data.next_url); nextPath = u.pathname + u.search }
              catch { break }
            } else { break }
            pages++
          } catch { break }
        }
        return all
      }

      const ydayData = await proxyFetch(
        `/v2/aggs/ticker/${ticker}/range/1/day/${ydayStr}/${ydayStr}?adjusted=true&sort=asc&limit=1`
      ).then(r => r.json())

      // Fetch today's bars first, fall back to yesterday if empty
      let resultsToUse: any[] = []
      try {
        resultsToUse = await fetchAllPages(
          `/v2/aggs/ticker/${ticker}/range/${tfCfg.multiplier}/${tfCfg.timespan}/${fromStr}/${today}?adjusted=true&sort=asc&limit=500`
        )
      } catch { resultsToUse = [] }

      // Pre-market / weekend fallback — use yesterday's bars
      if (!resultsToUse.length) {
        try {
          resultsToUse = await fetchAllPages(
            `/v2/aggs/ticker/${ticker}/range/${tfCfg.multiplier}/${tfCfg.timespan}/${ydayStr}/${ydayStr}?adjusted=true&sort=asc&limit=500`
          )
        } catch { resultsToUse = [] }
      }

      if (resultsToUse.length > 0) {
        const mapped = resultsToUse.map((r: any) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
        setter(mapped)
        const last = mapped[mapped.length - 1]

        if (key === 'spx') {
          const prevP = currentPrice

          // Calculate VWAP directly from I:SPX bars — most accurate, no SPY conversion needed
          const rthSpx = mapped.filter((c: any) => {
            const d = new Date(c.t)
            const estT = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
            const todayStr = est.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
            const barStr = d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
            const h = estT.getHours(), m = estT.getMinutes()
            return barStr === todayStr && (h > 9 || (h === 9 && m >= 30))
          })
          if (rthSpx.length >= 1) {
            let tpv = 0, tv = 0
            rthSpx.forEach((c: any) => {
              const tp = (c.h + c.l + c.c) / 3
              const vol = c.v || 1
              tpv += tp * vol; tv += vol
            })
            const spxVwap = tv > 0 ? tpv / tv : 0
            if (spxVwap > 5000 && spxVwap < 15000) {
              // Use setTimeout to ensure this runs AFTER the SPY fetch's setLevels
              setTimeout(() => setLevels((p: any) => ({ ...p, spyVwap: spxVwap, spxVwapDirect: spxVwap })), 200)
            }
          }
          // currentPrice will also be updated from SPY derivation when SPY loads
          if (prevP && last.c !== prevP) {
            const el = document.getElementById('tz-spx-price')
            if (el) {
              el.classList.remove('price-up', 'price-down')
              void el.offsetWidth  // reflow
              el.classList.add(last.c > prevP ? 'price-up' : 'price-down')
              setTimeout(() => el.classList.remove('price-up', 'price-down'), 1200)
            }
          }
          setOpenPrice(ydayData.results?.[0]?.c || mapped[0].o)  // prev close for % change baseline
          const emas = calcEMA(mapped, 200)
          const pdh = ydayData.results?.[0]?.h
          const pdl = ydayData.results?.[0]?.l
          const prevClose = ydayData.results?.[0]?.c
          setLevels((p: any) => ({
            ...p,
            ema200: emas[emas.length - 1],
            pdh, pdl, prevClose,
            dayOpen: mapped[0].o,
            currentSpxPrice: last.c,
          }))
          setChanges((p: any) => ({ ...p, spx: last.c - (prevClose || mapped[0].o) }))  // from prev close
        }
        if (key === 'spy') {
          setSpyPrice(last.c)
          // Use yesterday's SPY close for % change (not week-old first bar)
          ;(async () => {
            try {
              const yest2 = new Date(Date.now()-86400000).toISOString().split('T')[0]
              const spyYd = await proxyFetch(`/v2/aggs/ticker/SPY/range/1/day/${yest2}/${yest2}?adjusted=true&sort=asc&limit=1`).then(r => r.json())
              const spyPrevClose = spyYd.results?.[0]?.c
              setChanges((p: any) => ({ ...p, spy: last.c - (spyPrevClose || mapped[0].o) }))
            } catch {
              setChanges((p: any) => ({ ...p, spy: last.c - mapped[0].o }))
            }
          })()
          // Update currentPriceRef with SPY-derived SPX price for use in ratio calculation
          // This handles the case where I:SPX data is delayed
          if (currentPriceRef.current) {
            const impliedRatio = currentPriceRef.current / last.c
            if (impliedRatio > 9.5 && impliedRatio < 10.5) {
              // Good ratio — keep currentPriceRef updated with SPY-derived SPX
              currentPriceRef.current = last.c * impliedRatio
            }
          }
          // ── VWAP: Try Tiingo IEX for real-time intraday, fall back to Polygon/daily ──
          let rawSpyVwap: number = 0
          try {
            // Tiingo IEX gives real-time 5-min bars even on free plan
            const tiingoRes = await fetch('/api/tiingo?ticker=SPY&endpoint=intraday')
            if (tiingoRes.ok) {
              const tiingoBars = await tiingoRes.json()
              if (Array.isArray(tiingoBars) && tiingoBars.length >= 3) {
                // Filter to RTH (9:30+ ET) today only
                const rthTiingo = tiingoBars.filter((b: any) => {
                  const d = new Date(b.date || b.timestamp)
                  const estT = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
                  return estT.getHours() > 9 || (estT.getHours() === 9 && estT.getMinutes() >= 30)
                })
                if (rthTiingo.length >= 3) {
                  // Compute VWAP from Tiingo bars (open=o, high=h, low=l, close=c, volume=v)
                  let cTPV = 0, cV = 0
                  rthTiingo.forEach((b: any) => {
                    const tp = ((b.high || b.h) + (b.low || b.l) + (b.close || b.c)) / 3
                    const vol = b.volume || b.v || 1
                    cTPV += tp * vol; cV += vol
                  })
                  rawSpyVwap = cTPV / cV
                }
              }
            }
          } catch {}

          if (!rawSpyVwap) {
            // Tiingo unavailable — try Polygon RTH bars (may be delayed)
            const rthCandles = mapped.filter((c: any) => {
              const d = new Date(c.t)
              const estTime = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
              const h = estTime.getHours(), m = estTime.getMinutes()
              const isToday = d.toLocaleDateString('en-US', { timeZone: 'America/New_York' }) === est.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
              return isToday && (h > 9 || (h === 9 && m >= 30))
            })
            if (rthCandles.length >= 3) {
              const spyVwaps = calcVWAP(rthCandles)
              rawSpyVwap = spyVwaps[spyVwaps.length - 1]
            } else {
              // Last resort: today's daily bar (H+L+C)/3
              const todayDailyRes = await proxyFetch(`/v2/aggs/ticker/SPY/range/1/day/${today}/${today}?adjusted=true&sort=asc&limit=1`)
                .then(r => r.json()).catch(() => null)
              const todayBar = todayDailyRes?.results?.[0]
              rawSpyVwap = todayBar ? (todayBar.h + todayBar.l + todayBar.c) / 3 : last.c
            }
          }
          const spyEmas = calcEMA(mapped, 200)
          const rawSpy200 = spyEmas[spyEmas.length - 1]
          setLevels((p: any) => {
            // SPX/SPY ratio — prioritize sources from most to least reliable:
            // 1. currentPriceRef (live SPX from I:SPX if not stale)
            // 2. p.currentSpxPrice (last known SPX price in state)
            // 3. p.dayOpen (SPX day open — stable anchor)
            // 4. 10.025 (yesterday's actual close ratio, hard-coded as safe fallback)
            const spxLive = currentPriceRef.current || p.currentSpxPrice || p.dayOpen
            const rawRatio = spxLive && last.c > 0 ? spxLive / last.c : 0
            // Use stored good ratio if current one looks wrong
            const storedRatio = p.lastGoodRatio
            const ratio = (rawRatio > 9.5 && rawRatio < 10.5) ? rawRatio
                        : (storedRatio > 9.5 && storedRatio < 10.5) ? storedRatio
                        : 10.025
            return {
              ...p,
              spyCurrentPrice: last.c,
              // Only use SPY-derived VWAP if no direct SPX VWAP available
              spyVwap: (p.spxVwapDirect && p.spxVwapDirect > 5000) ? p.spxVwapDirect : rawSpyVwap * ratio,
              spy200EMA: rawSpy200 ? rawSpy200 * ratio : null,
              spy200EMAraw: rawSpy200,
              lastGoodRatio: (rawRatio > 9.5 && rawRatio < 10.5) ? rawRatio : (storedRatio || p.lastGoodRatio),
            }
          })
        }
        if (key === 'vix') {
          setVixPrice(last.c)
          ;(async () => {
            try {
              const yest3 = new Date(Date.now()-86400000).toISOString().split('T')[0]
              const vixYd = await proxyFetch(`/v2/aggs/ticker/I:VIX/range/1/day/${yest3}/${yest3}?adjusted=true&sort=asc&limit=1`).then(r => r.json())
              const vixPrevClose = vixYd.results?.[0]?.c
              setChanges((p: any) => ({ ...p, vix: last.c - (vixPrevClose || mapped[0].o) }))
            } catch {
              setChanges((p: any) => ({ ...p, vix: last.c - mapped[0].o }))
            }
          })()
        }
      }
    } catch (e) { console.error(key, e) }
  }, [keys, chartTf])

  // Data loading handled by useMarketData hook above
  // fetchHistory still used for Deep Dive chart (multi-day candles)
  useEffect(() => {
    // Load chart history for Deep Dive tab
    fetchHistory('I:SPX', () => {}, 'spx')  // chart only — price comes from hook
    fetchHistory('SPY', () => {}, 'spy')
    fetchHistory('I:VIX', () => {}, 'vix')
  }, [keys, fetchHistory])

  // Fetch historical gap stats when morning plan is set
  useEffect(() => {
    if (!morningPlan?.gapDirection || morningPlan.gapDirection === 'flat') return
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const cacheKey = 'tz-gap-stats-' + today + '-' + morningPlan.gapDirection
    const cached = localStorage.getItem(cacheKey)
    if (cached) { setHistoricalGapStats(JSON.parse(cached)); return }

    // Also fetch trend prediction
    fetch('/api/gap-outcomes?action=predict')
      .then(r => r.json())
      .then(p => { if (p.trendScorePredicted !== undefined) setGapPrediction(p) })
      .catch(() => {})

    // Get today's catalyst from gap_outcomes
    fetch('/api/gap-outcomes?action=today')
      .then(r => r.json())
      .then(today => {
        const catalyst = today.catalyst_type && today.catalyst_type !== 'NONE' ? today.catalyst_type : ''
        const params = new URLSearchParams({
          action: 'stats',
          gap_direction: morningPlan.gapDirection,
          days: '90',
          ...(catalyst && { catalyst }),
        })
        return fetch('/api/gap-outcomes?' + params).then(r => r.json())
      })
      .then(stats => {
        if (stats.status === 'ok') {
          setHistoricalGapStats(stats)
          localStorage.setItem(cacheKey, JSON.stringify(stats))
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningPlan?.gapDirection])

  // Reload SPX when timeframe changes — fetchHistory already has fresh chartTf via useCallback
  useEffect(() => {
    // keys handled server-side
    setCandles([])
    fetchHistory('I:SPX', setCandles, 'spx')
  }, [chartTf])

  // Profile-aware session greeting — fires once per session, period
  const greetedRef = useRef(false)
  useEffect(() => {
    if (tab !== 'cockpit') return
    if (greetedRef.current) return  // already greeted this session
    // Don't greet if we have a persisted conversation — they know us already
    if (chatMessages.length > 0) { greetedRef.current = true; return }
    greetedRef.current = true  // mark immediately so re-renders don't re-fire

    const delay = setTimeout(async () => {
      // Check if AudioContext can be created (requires prior user gesture)
      // If not, show text greeting instead of trying to speak
      try {
        const name = traderProfile?.name || userName || 'trader'
        const sessionNum = traderProfile?.session_count || 0
        const isReturning = sessionNum > 0
        const hour = new Date().getHours()
        const timeOfDay = hour < 10 ? 'morning' : hour < 14 ? 'session' : 'afternoon'
        const lastWeakness = traderProfile?.weaknesses?.slice(-1)[0] || null
        // Use custom welcome message if set, otherwise generate one
        const customWelcome = welcomeMessage?.trim()
          ? welcomeMessage.replace(/{name}/gi, name).replace(/{spx}/gi, currentPrice?.toFixed(0) || '').replace(/{vix}/gi, vixPrice?.toFixed(1) || '')
          : null
        const promptLines = customWelcome ? [
          `Say this welcome message naturally, spoken aloud, to the trader: "${customWelcome}"`,
          `Trader name: ${name}. SPX at ${currentPrice?.toFixed(2)}, VIX at ${vixPrice?.toFixed(1) || 'unknown'}.`,
          `Keep it under 2 sentences. Speak it exactly as written but feel free to adapt tense.`,
        ] : [
          `Generate a brief natural greeting (2-3 sentences, spoken aloud). You are a proactive trading companion — not just a rule enforcer.`,
          `Trader name: ${name}. ${isReturning ? `Session #${sessionNum + 1} together.` : 'First session.'}`,
          `Time: ${timeOfDay}. SPX at ${currentPrice?.toFixed(2)}. VIX: ${vixPrice?.toFixed(1) || 'unknown'}.`,
          lastWeakness ? `Last session weakness to address: ${lastWeakness}` : '',
          `Greet them, mention 1 specific thing you see in the market right now worth watching (price level, VIX context, or setup forming). Be direct, no fluff.`,
          `${isReturning ? 'You know this trader — reference your history naturally.' : 'Introduce yourself briefly.'}`,
        ]
        const promptStr = promptLines.filter(Boolean).join(' ')

        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 120,
            messages: [{ role: 'user', content: promptStr }]
          })
        })
        const data = await res.json()
        if (data?.error?.type === 'overloaded_error') { setChatMessages(p => [...p, { role: 'assistant', content: `Ready to trade, ${name}. SPX ${currentPrice?.toFixed(0)}, VIX ${vixPrice?.toFixed(1)}.` }]); return }
        const greeting = data.content?.[0]?.text || `Hey ${name}, let's get to work. SPX at ${currentPrice?.toFixed(0)}, VIX at ${vixPrice?.toFixed(1)}.`
        setChatMessages(p => [...p, { role: 'assistant', content: greeting }])
        // Only speak if user has interacted with page (AudioContext requires user gesture)
        try { if (!speakLockRef.current) speak(greeting) } catch {}
      } catch {}
    }, 2500) // slight delay so market data has time to load

    return () => clearTimeout(delay)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Recalculate composite market score when inputs change
  useEffect(() => {
    const score = calcMarketScore({ vixPrice, marketIntel, marketTide, optionsFlow, currentPrice, levels })
    setMarketScore(score)
  }, [vixPrice, marketIntel, marketTide, optionsFlow, currentPrice, levels.spyVwap])

  // Analyze trade patterns when trades change
  useEffect(() => {
    if (trades.length >= 5) setTradePatterns(analyzeTradePatterns(trades))
  }, [trades.length])

  // Update SPX levels when price updates
  useEffect(() => {
    if (!currentPrice || !spyPrice) return
    setLevels((p: any) => {
      if (!p.spyVwapRaw) return p
      // Always use live SPY price for the ratio — spyCurrentPrice can be stale
      const rawRatio = spyPrice > 0 ? currentPrice / spyPrice : 0
      // If current ratio looks wrong, use last stored good ratio
      const ratio = (rawRatio > 9.5 && rawRatio < 10.5) ? rawRatio
                  : (p.lastGoodRatio > 9.5 && p.lastGoodRatio < 10.5) ? p.lastGoodRatio
                  : 10.025
      if (!p.spyVwapRaw) return p
      return {
        ...p,
        currentSpxPrice: currentPrice,
        spyVwap: p.spyVwapRaw * ratio,
        spy200EMA: p.spy200EMAraw ? p.spy200EMAraw * ratio : p.spy200EMA,
      }
    })
  }, [currentPrice, spyPrice])

  // Lightweight charts
  useEffect(() => {
    if (tab !== 'deepdive' || !chartContainerRef.current || candles.length < 2) return
    let destroyed = false
    let ro: ResizeObserver | null = null

    import('lightweight-charts').then(({ createChart, CandlestickSeries, LineSeries }) => {
      if (destroyed) return
      if (chartRef.current) { try { chartRef.current.remove() } catch {} chartRef.current = null }
      if (!chartContainerRef.current) return

      const isDaily = chartTfRef.current === '1D'
      const isIntraday = !isDaily

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: { background: { color: darkMode ? 'rgba(12,15,26,0.98)' : '#ffffff' }, textColor: darkMode ? '#8899bb' : '#4a5880' },
        grid: { vertLines: { color: 'rgba(100,140,220,0.08)' }, horzLines: { color: 'rgba(100,140,220,0.08)' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: 'rgba(100,140,220,0.15)' },
        timeScale: {
          borderColor: 'rgba(100,140,220,0.15)',
          timeVisible: isIntraday,
          secondsVisible: false,
          // For daily, show just date; for intraday show time too
          tickMarkFormatter: isDaily
            ? (time: number) => {
                const d = new Date(time * 1000)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
            : undefined,
        },
      })
      chartRef.current = chart

      try {
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#00aa55', downColor: '#cc1040',
          borderUpColor: '#00aa55', borderDownColor: '#cc1040',
          wickUpColor: '#00aa5599', wickDownColor: '#cc104099',
        })

        // For daily, deduplicate by date (one bar per day only)
        let chartData = candles.map(c => ({
          time: isDaily
            ? new Date(c.t).toISOString().split('T')[0] as any  // 'YYYY-MM-DD' string for daily
            : Math.floor(c.t / 1000) as any,
          open: c.o, high: c.h, low: c.l, close: c.c
        }))

        // Deduplicate — keep last bar per time key
        const seen = new Map<string, any>()
        chartData.forEach(b => seen.set(String(b.time), b))
        chartData = Array.from(seen.values()).sort((a, b) => String(a.time) > String(b.time) ? 1 : -1)

        candleSeriesRef.current = candleSeries  // expose for coordinateToPrice
        candleSeries.setData(chartData)

        // VWAP — intraday only, RTH session (9:30 AM) to match TOS
        if (isIntraday && levels.spyVwap && spyCandles.length >= 3) {
          const spyVwapLine = chart.addSeries(LineSeries, { color: '#e05000', lineWidth: 1, lineStyle: 1, title: 'VWAP' })
          // Filter to RTH only for chart display
          const rthSpy = spyCandles.filter((c: any) => {
            const d = new Date(c.t)
            const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
            const h = est.getHours(), m = est.getMinutes()
            return h > 9 || (h === 9 && m >= 30)
          })
          const vwapsRTH = calcVWAP(rthSpy.length >= 3 ? rthSpy : spyCandles)
          const ratio = currentPrice && spyPrice && spyPrice > 0 ? currentPrice / spyPrice : 10
          const rthSource = rthSpy.length >= 3 ? rthSpy : spyCandles
          spyVwapLine.setData(
            rthSource
              .map((c: any, i: number) => ({ time: Math.floor(c.t / 1000) as any, value: vwapsRTH[i] * ratio }))
              .filter((d: any) => d.value)
          )
        }

        // 200 EMA — daily only (needs enough bars), intraday it's too noisy
        if (isDaily && candles.length >= 50) {
          const emaLine = chart.addSeries(LineSeries, { color: '#00d4a0cc', lineWidth: 1, lineStyle: 2, title: '200 EMA' })
          const emas = calcEMA(candles, Math.min(200, candles.length))
          emaLine.setData(
            chartData.map((b: any, i: number) => ({ time: b.time, value: emas[i] })).filter((d: any) => d.value)
          )
        }

        // Draw saved horizontal lines using PriceLine API (always price-accurate, never drifts)
        if (candles.length > 0) {
          drawnLines.filter((l: any) => l.type === 'horizontal' && l.price).forEach((line: any) => {
            try {
              candleSeries.createPriceLine({
                price: line.price,
                color: line.color || '#00e5ff',
                lineWidth: 1,
                lineStyle: 2, // dashed
                axisLabelVisible: true,
                title: line.label || `$${line.price.toFixed(2)}`,
              })
            } catch {}
          })
          // Draw zone boundaries as price lines
          drawnZones.filter((z: any) => z.priceHigh && z.priceLow).forEach((zone: any) => {
            try {
              const col = zone.color || '#ff9900'
              candleSeries.createPriceLine({ price: zone.priceHigh, color: col + 'cc', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: `Zone top $${zone.priceHigh.toFixed(0)}` })
              candleSeries.createPriceLine({ price: zone.priceLow, color: col + 'cc', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: `Zone btm $${zone.priceLow.toFixed(0)}` })
            } catch {}
          })
        }

        // Fit to just the loaded data — critical for daily not looking spread out
        chart.timeScale().fitContent()

      } catch (e) { console.warn('TZ chart series error:', e) }

      ro = new ResizeObserver(() => {
        if (!destroyed && chartRef.current && chartContainerRef.current) {
          try { chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight }) } catch {}
        }
      })
      if (chartContainerRef.current) ro.observe(chartContainerRef.current)
    })

    return () => {
      destroyed = true
      if (ro) ro.disconnect()
      if (chartRef.current) { try { chartRef.current.remove() } catch {} chartRef.current = null }
    }
  }, [tab, candles.length, chartTf, drawnLines.length, drawnZones.length])

  // Proactive companion alerts — speak when key levels hit or market conditions change
  useEffect(() => {
    if (!currentPrice || drawnLines.length === 0) return
    if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current)

    proactiveTimerRef.current = setInterval(() => {
      if (!currentPrice || !drawnLines.length) return

      // ── Market hours guard — only fire during NYSE trading hours ──────────
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const etHour = etNow.getHours()
      const etMin  = etNow.getMinutes()
      const etDay  = etNow.getDay() // 0=Sun, 6=Sat
      const isWeekday = etDay >= 1 && etDay <= 5
      const isMarketOpen = isWeekday && (etHour > 9 || (etHour === 9 && etMin >= 35)) && etHour < 16
      if (!isMarketOpen) return

      const prev = lastPriceRef.current
      lastPriceRef.current = currentPrice

      // Only alert on ACTUAL crosses — not just proximity
      // This prevents repeated alerts when hovering near a level
      drawnLines.filter((l: any) => l.type === 'horizontal' && l.price).forEach((line: any) => {
        const price = line.price
        const alertKey = `level-${price.toFixed(2)}-${new Date().toDateString()}` // resets daily
        if (proactiveAlertsSent.has(alertKey)) return

        // Must be a genuine cross — prev on one side, current on the other
        const crossed = prev > 0 && (
          (prev < price && currentPrice >= price) || // crossed up
          (prev > price && currentPrice <= price)    // crossed down
        )

        if (crossed) {
          setProactiveAlertsSent((p: Set<string>) => new Set([...p, alertKey]))
          const direction = currentPrice > price ? 'broken above' : 'broken below'
          const msg = `SPX just ${direction} your ${price.toFixed(0)} level. What's your read?`
          setChatMessages((p: any[]) => [...p, { role: 'assistant', content: msg }])
          // Companion message gets priority — only speak if not already talking
          if (!speakLockRef.current && !speaking) speak(msg)
        }
      })
    }, 30000) // check every 30 seconds (was 15s)

    return () => { if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, drawnLines.length])

  // AI auto-run every 3 min — fires even pre-market to load options flow
  // ── AUTO DATA LOOP — free APIs only, no Claude AI ──────────────────────
  // Polygon (Indices Advanced + Stocks Starter), Unusual Whales, Tiingo
  // All on unlimited/subscription plans — auto-refresh every 60s
  useEffect(() => {
    const fetchFreeData = async () => {
      try {
        // Price/candles/VWAP/EMA handled by useMarketData hook (60s refresh)
        // fetchFreeData only handles options flow, tide, tiingo, skew
        // ── Pattern Recognition + Fibonacci Analysis ────────────────────────────
      if (candles.length >= 20 && currentPrice) {
        try {
          const today   = new Date().toISOString().split('T')[0]
          const from90d = new Date(Date.now() - 95 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
          const polyKey  = keys[POLY_KEY] || 'env'
          const dailyRes  = await fetch(`/api/polygon?apiKey=${polyKey}&path=${encodeURIComponent(`/v2/aggs/ticker/I:SPX/range/1/day/${from90d}/${today}?adjusted=true&sort=asc&limit=100`)}`)
          const dailyData = await dailyRes.json()
          const dailyBars = (dailyData.results || []).map((r: any) => ({
            t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0
          }))
          if (dailyBars.length >= 10) {
            const analysis = analyzePatterns(
              candles,
              dailyBars,
              currentPrice,
              {
                vwap:  levels?.spyVwap  || undefined,
                ema200: levels?.ema200  || undefined,
                pdh:   levels?.pdh      || undefined,
                pdl:   levels?.pdl      || undefined,
              }
            )
            setPatternAnalysis(analysis)
          }
        } catch (e) {
          console.warn('[PatternRecognition] Daily bars fetch failed:', e)
        }
      }

      // ── TICK / TRIN / VVIX breadth ───────────────────────────────────────────
      try {
        const breadthRes = await fetch('/api/breadth')
        if (breadthRes.ok) {
          const bd = await breadthRes.json()
          setBreadthData(bd)
        }
      } catch (e) { console.warn('[Breadth] fetch failed:', e) }

      // ── GEX — refresh every 15min (FlashAlpha Basic: 100/day) ────────────
      try {
        const gexRes = await fetch(`/api/gex?price=${currentPrice || 0}`)
        if (gexRes.ok) {
          const gd = await gexRes.json()
          if (!gd.error) {
            setGexData(gd)
            // Calculate mechanical flow when GEX updates
            if (currentPrice) {
              try {
                const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
                const minsLeft = Math.max(0, 960 - (et.getHours() * 60 + et.getMinutes()))
                const mf = calculateMechanicalFlow({
                  netGex:          gd.netGex,
                  regime:          gd.regime,
                  gammaFlip:       gd.gammaFlip,
                  callWall:        gd.callWall,
                  putWall:         gd.putWall,
                  charmDollar:     gd.charmDollar,
                  charmNote:       gd.charmNote,
                  charmUrgency:    gd.charmUrgency,
                  dexBias:         gd.dexBias,
                  currentPrice,
                  sessionMinsLeft: minsLeft,
                  optionsFlowBias: optionsFlow?.[0]?.bias || null,
                  marketTideBias:  marketTide?.bias || null,
                  putCallRatio:    marketTide?.putCallRatio || null,
                })
                setMechanicalFlow(mf)
              } catch (e) { console.warn('[MechFlow]', e) }
            }
          }
        }
      } catch (e) { console.warn('[GEX] fetch failed:', e) }

      // ── Market Microstructure — cumulative delta, dark pool, vol spike ──────
      try {
        const micro1mRes = await fetch(`/api/polygon?apiKey=${keys[POLY_KEY] || 'env'}&path=${encodeURIComponent(
          `/v2/aggs/ticker/SPY/range/1/minute/${new Date(Date.now()-2*86400000).toISOString().split('T')[0]}/${new Date().toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=60`
        )}`)
        const micro1mData: any = await micro1mRes.json()
        const bars1m = ((micro1mData.results || []) as any[]).map((r: any) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0, vw: r.vw }))

        const dpRes  = await fetch('/api/flow?path=/api/darkpool/recent?limit=50')
        const dpData: any = await dpRes.json()
        const darkPoolPrints = dpData?.data || []

        const micro = analyzeMicrostructure(
          candles.map((c: any) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0 })),
          bars1m,
          darkPoolPrints,
          optionsFlow,
        )
        setMicrostructure(micro)

        // ── Dark pool alerts — SPX-relevant tickers only ──────────────────
        const MIN_DP_NOTIONAL = 500_000  // $500K minimum (raises bar from $250K)
        // Tickers that matter for SPX/market direction reading
        const SPX_TICKERS = new Set(['SPY','QQQ','IWM','DIA','SPX','SPXW','XSP','NVDA','AAPL','MSFT','AMZN','META','GOOGL','TSLA','AVGO','AMD','XLK','XLF','XLE','XLY'])
        const newDpAlerts: any[] = []
        ;(darkPoolPrints as any[]).filter(p => !p.canceled).forEach((p: any) => {
          // Only alert on market-relevant tickers
          if (!SPX_TICKERS.has(p.ticker)) return
          // Use premium field directly (already calculated by UW)
          const notional = parseFloat(p.premium || '0') || p.size * parseFloat(p.price || '0')
          if (notional < MIN_DP_NOTIONAL) return
          // Skip after-hours unless it's a huge print ($2M+)
          const isExtHours = p.ext_hour_sold_codes?.includes('extended_hours')
          if (isExtHours && notional < 2_000_000) return
          // Detect above-ask (aggressive) vs between bid/ask (neutral)
          const ask   = parseFloat(p.nbbo_ask || '0')
          const bid   = parseFloat(p.nbbo_bid || '0')
          const price = parseFloat(p.price || '0')
          const isAboveAsk  = ask > 0 && price >= ask
          const isBelowBid  = bid > 0 && price <= bid
          const notionalStr = notional >= 1e6
            ? `$${(notional/1e6).toFixed(1)}M`
            : `$${Math.round(notional/1000)}K`
          const key = `dp-${p.ticker}-${p.executed_at}-${Math.round(notional)}`
          if (!dpAlertShownRef.current.has(key)) {
            dpAlertShownRef.current.add(key)
            newDpAlerts.push({
              id: key, ticker: p.ticker, size: p.size,
              price: parseFloat(p.price).toFixed(2),
              notional: notionalStr,
              isAboveAsk, isBelowBid,
              sentiment: isAboveAsk ? 'BULLISH' : isBelowBid ? 'BEARISH' : 'NEUTRAL',
              isExtHours,
              ts: Date.now(),
            })
          }
        })
        if (newDpAlerts.length) {
          // Sort largest first
          newDpAlerts.sort((a, b) => parseFloat(b.notional.replace(/[$MK]/g,'')) - parseFloat(a.notional.replace(/[$MK]/g,'')))
          setDpAlerts(prev => [...newDpAlerts, ...prev].slice(0, 5))
          const top = newDpAlerts[0]
          const sentiment = top.isAboveAsk ? 'aggressive buying' : top.isBelowBid ? 'below bid — selling pressure' : ''
          const msg = `Dark pool alert. ${top.ticker} ${top.notional} block${sentiment ? ' — ' + sentiment : ''}.`
          setTimeout(() => {
            const isCompanionTalking = speakLockRef.current || speaking || audioSourceRef.current !== null
            if (!isCompanionTalking) speak(msg)
          }, 2000)
        }
      } catch (e) {
        console.warn('[Microstructure] analysis failed:', e)
      }

      // ── Volume spike detection from SPY candles (Feature 1) ───────────────
        if (spyCandles.length >= 5) {
          const recentVols = spyCandles.slice(-21).map((c: any) => c.v).filter(Boolean)
          if (recentVols.length >= 5) {
            const baseline = recentVols.slice(0, -1)
            const avgVol = baseline.reduce((a: number, b: number) => a + b, 0) / baseline.length
            const currentVol = recentVols[recentVols.length - 1]
            const multiplier = avgVol > 0 ? currentVol / avgVol : 0
            const lastBar = spyCandles[spyCandles.length - 1]
            const barDir = lastBar?.c > lastBar?.o ? 'BULL' : 'BEAR'
            if (multiplier >= 2.5 && currentVol > 100000) {
              const alertId = `vol-${lastBar.t}`
              setVolumeAlerts(prev => {
                if (prev.some(a => a.id === alertId)) return prev
                const newAlert = {
                  id: alertId,
                  multiplier: multiplier.toFixed(1),
                  volume: currentVol,
                  direction: barDir,
                  price: lastBar.c?.toFixed(2),
                  ticker: 'SPY',
                  time: new Date(lastBar.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
                }
                return [newAlert, ...prev].slice(0, 4)
              })
            }
          }
        }

        // ── Level proximity detection (Feature 3) ────────────────────────────
        if (currentPrice && candles.length >= 3) {
          const levels_check = [
            { label: 'VWAP', price: levels?.spyVwap },
            { label: '200 EMA', price: levels?.ema200 },
            { label: 'PDH', price: levels?.pdh },
            { label: 'PDL', price: levels?.pdl },
          ].filter(l => l.price)

          for (const lvl of levels_check) {
            const dist = Math.abs((currentPrice - lvl.price!) / currentPrice)
            if (dist < 0.003) {  // within 0.3% (~21pts on SPX 7100)
              const closes = candles.slice(-6).map((c: any) => c.c)
              const highs  = candles.slice(-6).map((c: any) => c.h)
              const lows   = candles.slice(-6).map((c: any) => c.l)
              const bodies = candles.slice(-3).map((c: any) => Math.abs(c.c - c.o))
              const ranges = candles.slice(-3).map((c: any) => c.h - c.l)
              
              // Is price approaching the level?
              const approaching = lvl.price! > currentPrice
                ? closes[closes.length-1] > closes[0]
                : closes[closes.length-1] < closes[0]

              // Velocity: how quickly approaching (pts per bar)
              const velocity = closes.length >= 2
                ? Math.abs(closes[closes.length-1] - closes[closes.length-3]) / 2
                : 0

              // Volume: last 3 bars vs prior 10
              const recent3Vol = candles.slice(-3).reduce((s: number, c: any) => s + (c.v||0), 0) / 3
              const prior10Vol = candles.slice(-13, -3).reduce((s: number, c: any) => s + (c.v||0), 0) / 10
              const volConfirm = prior10Vol > 0 ? recent3Vol / prior10Vol : 1

              // Candle structure: ratio of body to total range (high bodies = conviction)
              const avgBodyRatio = ranges[0] > 0
                ? bodies.reduce((s: number, b: number, i: number) => s + (ranges[i] > 0 ? b/ranges[i] : 0.5), 0) / bodies.length
                : 0.5

              // Wick analysis: are wicks forming AT the level? (rejection signal)
              const levelAbove = lvl.price! > currentPrice
              const wicksAtLevel = levelAbove
                ? highs.filter((h: number) => Math.abs(h - lvl.price!) < lvl.price! * 0.001).length
                : lows.filter((l: number) => Math.abs(l - lvl.price!) < lvl.price! * 0.001).length
              const hasRejectionWicks = wicksAtLevel >= 2  // 2+ wicks touching = rejection forming

              // Number of times price has tested this level (more tests = weaker)
              const levelTests = candles.slice(-20).filter((c: any) => 
                Math.abs(c.h - lvl.price!) < lvl.price! * 0.002 || 
                Math.abs(c.l - lvl.price!) < lvl.price! * 0.002
              ).length
              const testWeakness = levelTests > 3 ? -8 : levelTests > 1 ? -4 : 0  // repeated tests weaken

              // Time of day bias (ET)
              const estHour = parseInt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }))
              const estMin  = new Date().getMinutes()
              // VWAP bounce strongest 9:30-11am and 2-3pm, breakout strongest 11am-1pm
              const timeAdj = (estHour === 9 && estMin >= 30) || estHour === 10
                ? (lvl.label === 'VWAP' ? -8 : -4)   // early session: bounce more likely at VWAP
                : (estHour === 11 || estHour === 12 || estHour === 13)
                ? 8   // midday: breakouts more likely
                : (estHour === 14 || estHour === 15)
                ? -5  // late session: fading and mean reversion
                : 0

              // Flow bias
              const bullFlow = optionsFlow.filter((f: any) => f.sentiment === 'BULLISH').length
              const bearFlow = optionsFlow.filter((f: any) => f.sentiment === 'BEARISH').length
              const flowBias = bullFlow > bearFlow ? 'BULLISH' : bearFlow > bullFlow ? 'BEARISH' : 'NEUTRAL'
              const flowAdj = (approaching && flowBias === 'BULLISH' && lvl.label === 'VWAP' && currentPrice < lvl.price!) ||
                              (approaching && flowBias === 'BEARISH' && lvl.label === 'VWAP' && currentPrice > lvl.price!) ? -8
                : (approaching && ((flowBias === 'BULLISH' && lvl.price! < currentPrice) || (flowBias === 'BEARISH' && lvl.price! > currentPrice))) ? 10
                : 0

              // VIX regime
              const vixAdj = (vixPrice || 18) > 28 ? -12 : (vixPrice || 18) > 22 ? -6 : (vixPrice || 18) < 14 ? 6 : 0

              // Volume approaching adj
              const volAdj = volConfirm > 2.0 ? 15 : volConfirm > 1.5 ? 8 : volConfirm > 1.2 ? 4 : volConfirm < 0.8 ? -6 : 0

              // Candle conviction adj
              const convictionAdj = avgBodyRatio > 0.65 ? 6 : avgBodyRatio < 0.35 ? -6 : 0

              // Rejection wick penalty
              const wickAdj = hasRejectionWicks ? -12 : 0

              const base = approaching ? 52 : 45
              const breakoutPct = Math.max(18, Math.min(82, 
                base + volAdj + flowAdj + vixAdj + timeAdj + testWeakness + convictionAdj + wickAdj
              ))

              const timeNowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })

              setLevelProximity({
                level: lvl.label,
                levelPrice: lvl.price,
                currentPrice,
                distPts: Math.abs(currentPrice - lvl.price!).toFixed(1),
                distPct: (dist * 100).toFixed(2),
                approaching,
                breakoutPct: Math.round(breakoutPct),
                bouncePct: 100 - Math.round(breakoutPct),
                volConfirm: volConfirm.toFixed(1),
                velocity: velocity.toFixed(1),
                levelTests,
                hasRejectionWicks,
                bodyRatio: (avgBodyRatio * 100).toFixed(0),
                flowBias,
                timeOfDay: estHour < 11 ? 'Early (bounce favored)' : estHour < 14 ? 'Midday (breakout favored)' : 'Late (fade favored)',
                detectedAt: timeNowStr,
                // breakdown for transparency
                factors: [
                  { label: 'Volume', value: volAdj > 0 ? `+${volAdj}` : `${volAdj}`, positive: volAdj >= 0 },
                  { label: 'Flow', value: flowAdj > 0 ? `+${flowAdj}` : `${flowAdj}`, positive: flowAdj >= 0 },
                  { label: 'VIX', value: vixAdj > 0 ? `+${vixAdj}` : `${vixAdj}`, positive: vixAdj >= 0 },
                  { label: 'Time', value: timeAdj > 0 ? `+${timeAdj}` : `${timeAdj}`, positive: timeAdj >= 0 },
                  { label: 'Tests', value: testWeakness > 0 ? `+${testWeakness}` : `${testWeakness}`, positive: testWeakness >= 0 },
                  { label: 'Wicks', value: wickAdj > 0 ? `+${wickAdj}` : `${wickAdj}`, positive: wickAdj >= 0 },
                ],
              })
              break
            }
          }
          // Clear if no level close
          if (!levels_check.some(l => l.price && Math.abs((currentPrice - l.price!) / currentPrice) < 0.003)) {
            setLevelProximity(null)
          }
        }

        // ── Edge Condition Alert Checker ─────────────────────────────────────
        if (discoveredRules.length > 0 && currentPrice && candles.length > 0) {
          const estHour = parseInt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }))
          const estMin  = new Date().getMinutes()
          const isMarketHours = (estHour > 9 || (estHour === 9 && estMin >= 30)) && estHour < 16
          if (isMarketHours) {
            // Current conditions
            const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
            const vwap_now = levels?.spyVwap
            const vwapPos  = currentPrice && vwap_now ? (currentPrice > vwap_now ? 'above' : 'below') : 'any'
            const vixNow   = vixPrice || 18
            const vixReg   = vixNow < 14 ? 'low' : vixNow < 20 ? 'normal' : vixNow < 28 ? 'elevated' : 'high'
            // Gap vs yesterday's close
            const prevClose = levels?.prevClose
            const gapPts    = prevClose && currentPrice ? currentPrice - prevClose : 0
            const gapDir    = gapPts > 8 ? 'large_up' : gapPts > 3 ? 'small_up' : gapPts < -8 ? 'large_dn' : gapPts < -3 ? 'small_dn' : 'flat'
            // Current signal direction from VWAP+EMA
            const ema200now  = levels?.ema200
            const signalNow  = currentPrice && vwap_now && ema200now
              ? (currentPrice > vwap_now && currentPrice > ema200now ? 'LONG' : currentPrice < vwap_now && currentPrice < ema200now ? 'SHORT' : 'MIXED')
              : 'UNKNOWN'

            for (const rule of discoveredRules) {
              const matchGap   = rule.conditions?.gapDirection === 'any' || rule.conditions?.gapDirection === gapDir
              const matchDay   = rule.conditions?.dayOfWeek === 'any'    || rule.conditions?.dayOfWeek === todayDow
              const matchVix   = rule.conditions?.vixRegime === 'any'    || rule.conditions?.vixRegime === vixReg
              const matchVwap  = rule.conditions?.vwapPosition === 'any' || rule.conditions?.vwapPosition === vwapPos
              const matchSig   = rule.signal === 'ANY' || rule.signal === signalNow
              const allMatch   = matchGap && matchDay && matchVix && matchVwap && matchSig

              if (allMatch) {
                const alertId = `edge-${rule.type}-${rule.signal}-${gapDir}-${todayDow.substring(0,3)}`
                if (!edgeAlertShownRef.current.has(alertId)) {
                  edgeAlertShownRef.current.add(alertId)
                  const timeNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
                  setEdgeAlerts(prev => [{
                    id: alertId,
                    type: rule.type,
                    signal: rule.signal,
                    description: rule.description,
                    winRate: rule.winRate,
                    sampleSize: rule.sampleSize,
                    conditions: { gapDir, todayDow, vixReg, vwapPos, signalNow },
                    detectedAt: timeNow,
                  }, ...prev].slice(0, 3))
                }
              }
            }
            // Clear edge alerts when conditions no longer match any HIGH_EDGE rule
            const anyHighEdgeMatch = discoveredRules
              .filter(r => r.type === 'HIGH_EDGE')
              .some(rule => {
                const matchGap  = rule.conditions?.gapDirection === 'any' || rule.conditions?.gapDirection === gapDir
                const matchDay  = rule.conditions?.dayOfWeek === 'any'    || rule.conditions?.dayOfWeek === todayDow
                const matchVix  = rule.conditions?.vixRegime === 'any'    || rule.conditions?.vixRegime === vixReg
                const matchSig  = rule.signal === 'ANY' || rule.signal === signalNow
                return matchGap && matchDay && matchVix && matchSig
              })
            if (!anyHighEdgeMatch) {
              setEdgeAlerts(prev => prev.filter(a => a.type === 'AVOID'))
            }
          }
        }

        const [intel, flow, tide, tiingo, skew] = await Promise.all([
          fetchMarketIntel(),
          fetchOptionsFlow(),
          fetchMarketTide(),
          fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove),
          fetchZeroDTESkew(),
        ])
        setMarketIntel(intel)
        setOptionsFlow(flow)
        setMarketTide(tide)
        setTiingoContext(tiingo)
        if (skew) setZeroDTESkew(skew)
      } catch {}
    }

    // Claude AI calls (news/calendar/macro) — once per day, cached in localStorage
    const fetchDailyAI = async () => {
      const todayKey = new Date().toISOString().split('T')[0]
      // Check localStorage first — don't re-fire if already ran today
      if (localStorage.getItem('tz-news-date') === todayKey) return
      try {
        const [news, calendar, macro, mtf] = await Promise.all([
          fetchMarketNews(),
          fetchEconomicCalendar(),
          fetchMacroRegime(),
          fetchMultiTFConfluence('SPY'),
        ])
        localStorage.setItem('tz-news-date', todayKey)
        if (news) setMarketNews(news)
        if (calendar) setEconomicCalendar(calendar)
        if (macro) setMacroRegime(macro)
        if (mtf) {
          setMultiTFData(mtf)
          // Expose daily 200 EMA into levels so it's available everywhere
          if (mtf.daily?.ema200) {
            setLevels((p: any) => ({ ...p, ema200Daily: mtf.daily.ema200 }))
          }
        }
      } catch {}
    }

    // Earnings — once per day, no AI cost (Unusual Whales)
    const fetchDailyEarnings = () => {
      if (!earningsCalendar.length) fetchEarningsCalendar().then(ec => setEarningsCalendar(ec))
    }

    // Run immediately on mount, then free data every 60s
    fetchFreeData()
    fetchDailyAI()   // Claude AI — cached, only fires once per day
    fetchDailyEarnings()

    const dataInterval = setInterval(fetchFreeData, 60000)
    return () => clearInterval(dataInterval)
  }, [])  // run once on mount — all keys are server-side constants

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [chatMessages, chatLoading])

  // Persist custom rules
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('tz-custom-rules', customRules)
  }, [customRules])

  // Persist chat — localStorage (instant) + Supabase (durable, queryable by learning agent)
  useEffect(() => {
    if (typeof window === 'undefined' || chatMessages.length === 0) return
    // Always save to localStorage for instant reload
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.slice(-50)))
    } catch {}
  }, [chatMessages])

  // Generate morning brief — once per day, cached in localStorage
  const fetchMorningBrief = async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const cacheKey = 'tz-morning-brief-' + today
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try { setMorningBrief(JSON.parse(cached)); return } catch {}
    }
    // Only fetch after 8am ET
    const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    if (etHour < 8) return

    setBriefLoading(true)
    try {
      const res = await fetch('/api/morning-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spxPrice: currentPrice,
          vixPrice,
          spxChange: changes?.spx,
          vwap: levels?.spyVwap,
          ema200: levels?.ema200,
          macroRegime,
          marketNews,
          economicCalendar,
          earningsCalendar,
          gapData: null,
          gapPrediction,
          morningPlan,
          breadthData,
          tiingoContext,
          multiTFData,
          dailyPatterns: multiTFData?.patterns || [],
          // NEW: personalized learning context
          traderProfile: traderProfile ? {
            strengths:      traderProfile.strengths,
            weaknesses:     traderProfile.weaknesses,
            stream_weights: traderProfile.stream_weights,
            edge_notes:     traderProfile.edge_notes,
          } : null,
          recentTrades: trades ? trades.slice(0, 3).map((t: any) => ({
            date:      t.date,
            symbol:    t.symbol,
            direction: t.direction,
            pnl:       t.pnl,
            notes:     t.notes,
          })) : null,
        })
      })
      const data = await res.json()
      if (data.macroBias) {
        setMorningBrief(data)
        localStorage.setItem(cacheKey, JSON.stringify(data))
      }
    } catch (e) { console.warn('[morning-brief]', e) }
    finally { setBriefLoading(false) }
  }

  // Trigger morning brief after macro data loads
  useEffect(() => {
    if (macroRegime && !morningBrief && !briefLoading) {
      fetchMorningBrief()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macroRegime])

  // Fetch comprehensive market intelligence every 2 minutes
  useEffect(() => {
    const fetchIntel = () => {
      const etHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
      if (etHour < 8 || etHour >= 17) return  // market hours only
      fetch('/api/market-intelligence')
        .then(r => r.json())
        .then(d => { if (!d.error) setMarketIntel2(d) })
        .catch(() => {})
    }
    fetchIntel()
    const interval = setInterval(fetchIntel, 60000)   // every 1min (real-time sectors)
    return () => clearInterval(interval)
  }, [])

  // Load stream weights from localStorage (updated by cron daily)
  useEffect(() => {
    const cached = localStorage.getItem('tz-stream-weights')
    if (cached) {
      try { setStreamWeights(JSON.parse(cached)) } catch {}
    }
    // Fetch fresh weights from API
    fetch('/api/agents/stream-weights')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'ok' && d.streams) {
          const weights = Object.fromEntries(d.streams.map((s: any) => [s.name, s.weight]))
          setStreamWeights(weights)
          localStorage.setItem('tz-stream-weights', JSON.stringify(weights))
        }
      })
      .catch(() => {})
  }, [])

  // Seed profile on first login — runs once, skips if user has real data
  useEffect(() => {
    fetch('/api/agents/seed-profile', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.status === 'seeded') console.log('[Profile] Seeded with system defaults') })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load chat from DB on mount (overrides localStorage if DB has more)
  useEffect(() => {
    fetch('/api/chat-sessions')
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length > 0) {
          // DB messages are the source of truth — they survive device changes
          const dbMsgs = data.messages.map((m: any) => ({ role: m.role, content: m.content, id: m.id }))
          // Only override if DB has more messages than localStorage
          setChatMessages(prev => dbMsgs.length > prev.length ? dbMsgs : prev)
          // Mark all as synced
          data.messages.forEach((m: any) => { if (m.id) chatDbSyncRef.current.add(m.id) })
          // Migrate run if needed
          if (data.needsMigration) fetch('/api/chat-sessions/migrate').catch(() => {})
        }
      })
      .catch(() => {}) // DB load is best-effort — localStorage is fallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Speech recognition — stays open until user stops
  const listeningRef = useRef(false)  // stable ref so speak() can check without stale closure

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser. Use Chrome.'); return }
    // Force-stop any current speech — user explicitly clicked mic, take priority
    if (speakLockRef.current) {
      speakLockRef.current = false
      setSpeaking(false)
      if (audioSourceRef.current) {
        try { (audioSourceRef.current as any).stop() } catch {}
        audioSourceRef.current = null
      }
    }
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onstart = () => { setListening(true); listeningRef.current = true }
    recognition.onresult = (event: any) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript
        else interim += event.results[i][0].transcript
      }
      setLiveTranscript(interim)
      if (final.trim()) {
        setLiveTranscript('')
        setChatInput(final.trim())
        setTimeout(() => {
          setChatInput('')
          const userMsg = { role: 'user', content: final.trim() }
        setChatMessages(p => [...p, userMsg])
        // Persist to DB for learning agent
        fetch('/api/chat-sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([userMsg])
        }).catch(() => {})
          sendChatWithText(final.trim())
        }, 100)
      }
    }
    recognition.onerror = () => { setListening(false); listeningRef.current = false; setLiveTranscript('') }
    recognition.onend = () => {
      // Only restart if user hasn't manually stopped AND we're not currently speaking
      // speakLockRef prevents mic from restarting mid-speech (fixes hearing-itself bug)
      if (recognitionRef.current === recognition && listeningRef.current) {
        setTimeout(() => {
          // Restart unless user manually stopped or currently speaking (brief grace period)
          if (listeningRef.current && recognitionRef.current === recognition) {
            try { recognition.start() } catch {}
          }
        }, 300)
      }
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    listeningRef.current = false
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null }
    setListening(false)
    setLiveTranscript('')
  }

  // Voice speak — pauses mic while speaking, resumes after
  const checkVoiceLimit = (minutesUsed: number) => {
    const pct = (minutesUsed / voiceMinLimit) * 100
    if (pct >= 90 && voiceWarningShown !== '90') {
      setVoiceWarningShown('90')
    } else if (pct >= 50 && voiceWarningShown !== '50' && voiceWarningShown !== '90') {
      setVoiceWarningShown('50')
    }
    if (minutesUsed > voiceMinLimit) setVoiceOverage(true)
  }

  const logVoiceUsage = async (seconds: number) => {
    const mins = seconds / 60
    const newTotal = voiceMinUsed + mins
    // Update localStorage
    localStorage.setItem('tz-voice-mins-used', newTotal.toString())
    setVoiceMinUsed(newTotal)
    checkVoiceLimit(newTotal)
    // Log to server
    fetch('/api/voice-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    }).catch(() => {})
  }

  const stopAudio = () => {
    try {
      if (audioSourceRef.current) { audioSourceRef.current.stop(); audioSourceRef.current = null }
    } catch {}
    window.speechSynthesis?.cancel()
  }

  const runSystemCheck = async () => {
    setSystemCheckRunning(true)
    const today = new Date().toISOString().split('T')[0]
    const yest = new Date(Date.now()-86400000).toISOString().split('T')[0]
    const R: Record<string, any> = {}
    const chk = async (name: string, fn: () => Promise<any>) => {
      try { const t = Date.now(); R[name] = { ...(await fn()), ms: Date.now()-t } }
      catch(e: any) { R[name] = { status: '❌ ERROR', error: e.message } }
    }
    await chk('SPX Price', async () => {
      const d = await (await fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(`/v2/aggs/ticker/I:SPX/range/5/minute/${today}/${today}?adjusted=true&sort=asc&limit=5`)}`)).json()
      const b = d.results || []; return { status: b.length>0?'✅ OK':'⚠️ DELAYED', bars: b.length, last: b[b.length-1]?.c?.toFixed(0), note: d.status==='DELAYED'?'Polygon delayed - using SPY ratio':'Live' }
    })
    await chk('VIX', async () => {
      const d = await (await fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(`/v2/aggs/ticker/I:VIX/range/1/day/${today}/${today}?adjusted=true&sort=asc&limit=1`)}`)).json()
      return { status: d.results?.length>0?'✅ OK':'❌ NO DATA', value: d.results?.[0]?.c?.toFixed(2) }
    })
    await chk('PDH / PDL', async () => {
      const d = await (await fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(`/v2/aggs/ticker/I:SPX/range/1/day/${yest}/${yest}?adjusted=true&sort=asc&limit=1`)}`)).json()
      return { status: d.results?.length>0?'✅ OK':'❌ NO DATA', pdh: d.results?.[0]?.h?.toFixed(0), pdl: d.results?.[0]?.l?.toFixed(0) }
    })
    await chk('VWAP (Tiingo → SPX)', async () => {
      const d = await (await fetch('/api/tiingo?ticker=SPY&endpoint=intraday')).json()
      const bars = Array.isArray(d)?d:[]
      if (!bars.length) return { status: '❌ NO DATA', note: 'Tiingo returned no bars' }
      // Calc TWAP (volume-weighted not available on free Tiingo)
      const sum = bars.reduce((a: number, b: any) => a + (parseFloat(b.close)||0), 0)
      const twap = (sum / bars.length)
      const lastBar = bars[bars.length-1]
      const lastBarAge = lastBar?.date ? Math.round((Date.now() - new Date(lastBar.date).getTime()) / 60000) : null
      const spxRatio = currentPrice && lastBar?.close ? currentPrice / lastBar.close : null
      const spxVwap = spxRatio ? (twap * spxRatio).toFixed(2) : null
      const note = 'SPY TWAP × SPX/SPY ratio. No tick volume on free Tiingo plan.'
      return {
        status: lastBarAge && lastBarAge < 30 ? '✅ OK' : lastBarAge && lastBarAge < 120 ? '⚠️ STALE' : '⚠️ OLD',
        spyTwap: twap.toFixed(2),
        spxVwap,
        bars: bars.length,
        lastBarAge: lastBarAge ? lastBarAge + ' min ago' : 'unknown',
        ratio: spxRatio?.toFixed(4),
        note,
        validate: 'Compare SPX VWAP on TradingView (5m chart, VWAP indicator)'
      }
    })
    await chk('200 EMA (Polygon)', async () => {
      // The 200 EMA is calculated from Polygon I:SPX 5m candles
      // Check freshness of those candles
      const weekAgo = new Date(Date.now()-7*86400000).toISOString().split('T')[0]
      const d = await (await fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(`/v2/aggs/ticker/I:SPX/range/5/minute/${weekAgo}/${today}?adjusted=true&sort=asc&limit=500`)}`)).json()
      const bars = d.results || []
      const lastBar = bars[bars.length-1]
      const lastBarDate = lastBar ? new Date(lastBar.t).toLocaleDateString('en-US',{timeZone:'America/New_York'}) : 'none'
      const lastBarAge = lastBar ? Math.round((Date.now() - lastBar.t) / 60000) : null
      const isDelayed = d.status === 'DELAYED' || (lastBarAge && lastBarAge > 600)
      // Quick EMA preview using last 20 closes
      const closes = bars.slice(-20).map((b: any) => b.c)
      const simpleAvg = closes.length ? (closes.reduce((a: number, c: number) => a + c, 0) / closes.length).toFixed(0) : null
      return {
        status: isDelayed ? '⚠️ DELAYED DATA' : '✅ OK',
        polygonStatus: d.status,
        totalBars: bars.length,
        lastBarDate,
        lastBarAge: lastBarAge ? lastBarAge + ' min ago' : 'unknown',
        ema200Shown: levels?.ema200?.toFixed(0) || 'not loaded',
        approxAvgLast20: simpleAvg,
        warning: isDelayed ? 'Polygon free plan has ~1 week delay on I:SPX intraday. EMA may be stale.' : null,
        validate: 'Compare 200 EMA on TradingView (5m SPX chart, EMA 200 indicator)'
      }
    })
    await chk('Options Flow', async () => {
      const d = await (await fetch('/api/flow?path=/api/option-trades/flow-alerts?limit=50')).json()
      const all = d.data||[]; all.sort((a: any,b: any)=>parseFloat(b.total_premium||0)-parseFloat(a.total_premium||0))
      const top = all[0]; return { status: all.length>0?'✅ OK':'❌ NO DATA', count: all.length, top: top?`${top.ticker} ${top.type} $${top.strike} $${Math.round(top.total_premium/1000)}K`:null }
    })
    await chk('Market Tide P/C', async () => {
      const d = await (await fetch('/api/flow?path=/api/market/market-tide')).json()
      const t = d.data||[], l = t[t.length-1]
      const callP = parseFloat(l?.net_call_premium||l?.call_premium||0)
      const putP = parseFloat(l?.net_put_premium||l?.put_premium||0)
      const ratio = callP>0?(putP/callP).toFixed(2):null
      return { status: t.length>0?'✅ OK':'❌ NO DATA', ratio, call: callP>0?'$'+(callP/1e6).toFixed(1)+'M':null, put: putP>0?'$'+(putP/1e6).toFixed(1)+'M':null, bias: ratio&&parseFloat(ratio)>1.2?'PUT HEAVY':ratio&&parseFloat(ratio)<0.8?'CALL HEAVY':'BALANCED' }
    })
    await chk('AI Engine', async () => {
      const d = await (await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:10,messages:[{role:'user',content:'OK'}]})})).json()
      return { status: d.content?.[0]?.text?'✅ OK':'❌ FAIL', error: d.error?.message?.substring(0,60) }
    })
    await chk('Voice (OpenAI)', async () => {
      const r = await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:'openai',text:'check',voice:'nova',speed:1})})
      const buf = r.ok ? await r.arrayBuffer() : null
      return { status: r.ok?'✅ OK':'❌ FAIL', bytes: buf?.byteLength, note: r.ok?'Audio generating':'Check OPENAI_API_KEY' }
    })
    await chk('Market News Feed', async () => {
      const d = await (await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:60,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:'Top market news today in 1 sentence.'}]})})).json()
      const txt = (d.content||[]).map((i: any)=>i.text||'').join('').substring(0,80)
      return { status: txt?'✅ OK':'❌ FAIL', preview: txt||null }
    })
    await chk('Morning Plan (DB)', async () => {
      const d = await (await fetch('/api/userdata?table=morning_plan')).json()
      return { status: '✅ OK', saved: !!d.data, bias: d.data?.bias||'not set', levels: d.data?.keyLevels?.substring(0,25)||'not set' }
    })
    setSystemCheck(R)
    setSystemCheckRunning(false)
  }

  const speak = async (text: string) => {
    if (!text?.trim()) return

    // If already speaking, skip new call (don't interrupt mid-sentence)
    // Queueing caused cutoff by calling stopAudio() — better to finish current speech
    if (speakLockRef.current) {
      return  // drop it — don't interrupt
    }

    speakLockRef.current = true
    setSpeaking(true)

    const wasListening = listeningRef.current
    // Temporarily pause mic during speech — but keep listeningRef true so it restarts after
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
      setListening(false)
      setLiveTranscript('')
      // Don't set listeningRef=false — it will restart mic after speech via finish()
    }

    let finishCalled = false
    const finish = (resume = true) => {
      if (finishCalled) return  // prevent double-fire
      finishCalled = true
      speakLockRef.current = false
      audioSourceRef.current = null
      setSpeaking(false)
      // Only restart mic after a clean delay to ensure audio output has fully stopped
      // This prevents feedback loop where mic picks up speaker output
      if (resume && wasListening) {
        setTimeout(() => {
          if (!speakLockRef.current) {  // double-check still not speaking
            listeningRef.current = true
            startListening()
          }
        }, 1500)  // 1.5s buffer — lets speakers fully stop, prevents echo pickup
      }
      // Clear any stale queue (we no longer interrupt, so queue should always be empty)
      speakQueueRef.current = null
    }

    try {
      // ── Web Speech API (free) ──────────────────────────────────────────
      if (voiceEngine === 'webspeech') {
        await new Promise<void>((resolve) => {
          window.speechSynthesis.cancel()
          const utter = new SpeechSynthesisUtterance(text)
          utter.rate = voiceSpeed || 1.0
          utter.pitch = 1.0
          const voices = window.speechSynthesis.getVoices()
          const preferred = voices.find(v =>
            v.name.includes('Google') || v.name.includes('Samantha') ||
            v.name.includes('Karen') || v.name.includes('Daniel')
          ) || voices.find(v => v.lang.startsWith('en')) || voices[0]
          if (preferred) utter.voice = preferred
          utter.onend = () => resolve()
          utter.onerror = () => resolve()
          window.speechSynthesis.speak(utter)
        })
        finish()
        return
      }

      // ── OpenAI TTS with streaming download ──────────────────────────
      // Create AudioContext immediately so it's ready when audio arrives
      let audioCtx = audioCtxRef.current
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = audioCtx
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'openai', text, voice: voiceId || 'nova', speed: voiceSpeed || 1.0 })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        console.error('TZ voice error:', res.status, errData)
        try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)) } catch {}
        finish(false)
        return
      }

      if (speakQueueRef.current) { finish(false); return }

      // Stream-accumulate chunks then decode+play once — fast download, one clean playback
      const reader = res.body!.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (speakQueueRef.current) { finish(false); return }
        chunks.push(value)
        totalBytes += value.length
      }

      if (speakQueueRef.current || totalBytes === 0) { finish(false); return }

      // Assemble and decode — single decode, single play, single finish()
      const combined = new Uint8Array(totalBytes)
      let offset = 0
      for (const c of chunks) { combined.set(c, offset); offset += c.length }

      const audioBuffer = await audioCtx!.decodeAudioData(combined.buffer)

      if (speakQueueRef.current) { finish(false); return }

      // Stop any existing source cleanly
      if (audioSourceRef.current) { try { audioSourceRef.current.stop() } catch {} }

      const source = audioCtx!.createBufferSource()
      audioSourceRef.current = source
      source.buffer = audioBuffer

      // Stereo routing
      const merger = audioCtx!.createChannelMerger(2)
      if (audioBuffer.numberOfChannels === 1) {
        source.connect(merger, 0, 0); source.connect(merger, 0, 1)
      } else {
        source.connect(merger, 0, 0); source.connect(merger, 1, 1)
      }
      const panner = audioCtx!.createStereoPanner()
      panner.pan.value = 0
      merger.connect(panner)
      panner.connect(audioCtx!.destination)

      // Safety timeout: if onended never fires (page blurred, ctx suspended),
      // force finish after audio duration + 3s buffer
      const safetyMs = Math.ceil((audioBuffer.duration + 3) * 1000)
      const safetyTimer = setTimeout(() => {
        console.warn('TZ: safety timeout fired after', safetyMs, 'ms')
        finish()
      }, safetyMs)

      source.onended = () => {
        clearTimeout(safetyTimer)
        finish()
      }

      // Keep AudioContext alive — don't let browser suspend it mid-playback
      if (audioCtx!.state === 'suspended') await audioCtx!.resume()
      source.start(0)

    } catch (e) {
      console.error('TZ speak error:', e)
      // Always release lock on any error
      speakLockRef.current = false
      audioSourceRef.current = null
      setSpeaking(false)
      finish()
    }
  }


  // Build full context string for AI companion
  const _buildCompanionContext = () => {  // legacy — replaced by ai/buildContext.ts
    const activePlaybook = playbooks.find(p => p.id === activePlaybookId) || null
    const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext, historicalStats: historicalGapStats })
    const unmetChecks = CHECKLIST.filter(c => !checked[c.id]).map(c => `✗ ${c.label}`).join('\n')
    const metChecks = CHECKLIST.filter(c => checked[c.id]).map(c => `✓ ${c.label}`).join('\n')
    const earningsSection = earningsCalendar.length
      ? earningsCalendar.map((day: any) => {
          const isToday = day.date === new Date().toISOString().split('T')[0]
          const isTomorrow = day.date === new Date(Date.now()+86400000).toISOString().split('T')[0]
          const label = isToday ? 'TODAY' : isTomorrow ? 'TOMORROW' : day.date
          return `${label}: ${day.earnings.map((e: any) => `${e.symbol} ${e.time}${e.epsEst ? ' est '+e.epsEst : ''}${e.expectedMove ? ' ±'+e.expectedMove : ''}`).join(', ')}`
        }).join('\n')
      : 'No earnings data'

    return `You are the trAIde Zone AI companion for an SPX intraday options day trader. You have a voice and speak responses aloud. Keep responses under 3 sentences. Never more than 60 words. Be direct and specific. Reference real numbers. Challenge bad ideas directly.

NEVER use markdown. No bold (**text**), no bullet points (- or *), no headers (#), no dashes for lists. Write in plain spoken sentences only — your response is read aloud.

NEVER say you are text-only. Your responses ARE spoken aloud in real-time.

OPTIONS DAY TRADING CONTEXT — always factor this in:
The trader buys ITM SPX options (calls or puts) and closes same day. Not swing trading, not holding overnight.
Time of day matters enormously: before 10am is noise, 10am-12pm is the sweet spot, after 2pm theta decay accelerates, after 3pm liquidity drops.
A LONG signal at 3:30pm needs much stronger conviction than one at 10:30am.
Stops are at VWAP reclaim or 200 EMA reclaim — not arbitrary dollar amounts.
When discussing entries, factor in how much time is left in the session and whether theta decay makes the trade risky.

STALE SIGNALS: If the trader questions a WAIT or old signal and conditions have clearly changed, acknowledge the signal may be stale and suggest they hit Get Signal for a fresh read. Don't defend a stale signal — the market moved.

YOUR ROLE: You are an advisor and thinking partner, not a rule enforcer.
The trader makes their own decisions. Your job is to give them the best
possible context and perspective — then respect their call. Flag concerns
once, clearly, then move on. Don't lecture or repeat warnings.
If they have custom rules, honor those over any defaults.
If they want to trade early, give them the best read you can on the setup.

TECHNICAL AWARENESS: You have access to daily and weekly candle data, MAs
(20/50/200 SMA, 9/21 EMA), RSI, ATR, market structure, and recent candle
patterns. Use this when discussing market direction, entries, stops, and
targets. Reference specific levels — not vague generalities.

MACRO AWARENESS: You have the Fed stance, rate regime, risk-on/off context,
economic calendar, and earnings. Factor these into your reads. A LONG signal
in a risk-off macro regime with hawkish Fed needs different sizing than one
in a full risk-on regime.

${traderProfile ? `
═══ WHO YOU'RE TALKING TO ═══
${traderProfile.name ? `Name: ${traderProfile.name}` : ''}
${traderProfile.experience_level ? `Experience: ${traderProfile.experience_level}` : ''}
${traderProfile.trading_style ? `Style: ${traderProfile.trading_style}` : ''}
${(() => {
  // Custom rules entered in Settings take priority over seed defaults
  const customR = customRules?.trim()
  if (customR) return `Their personal trading rules (self-defined, advisory — reference but don't enforce):\n${customR}`
  const seeded = traderProfile?.system_rules
  if (seeded?.length) return `Starting guidelines (system defaults — trader can customize in Settings):\n${seeded.slice(0,4).join('\n')}`
  return ''
})()}
${traderProfile.strengths?.length > 0 ? `Setup strengths: ${traderProfile.strengths.join(', ')}` : ''}
${traderProfile.weaknesses?.length > 0 ? `Tendencies to be aware of (not rules — just patterns): ${traderProfile.weaknesses.join(', ')}` : ''}
${traderProfile.emotional_triggers?.length > 0 ? `Watch for: ${traderProfile.emotional_triggers.join(', ')}` : ''}
${traderProfile.companion_tone ? `Tone: ${traderProfile.companion_tone} — adapt your communication style accordingly` : ''}
${traderProfile.session_count > 0 ? `You've had ${traderProfile.session_count} sessions together. This is an ongoing relationship.` : 'First session — introduce yourself warmly but get to business.'}
` : 'First time talking — learn about this trader through the session.'}

═══ LIVE MARKET DATA ═══
SPX: ${fmt(currentPrice)} | Open: ${fmt(openPrice)} | Change: ${changes.spx ? (changes.spx >= 0 ? '+' : '') + changes.spx?.toFixed(2) : '—'} (${changes.spx && openPrice ? (changes.spx/openPrice*100).toFixed(2) : '—'}%)
SPX vs VWAP (${fmt(levels.spyVwap)}): ${currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? 'ABOVE ▲ — bullish intraday' : 'BELOW ▼ — bearish intraday') : 'No VWAP data'}
SPX vs 200 EMA 5min (${fmt(levels.ema200)}): ${currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? 'ABOVE — intraday bullish' : 'BELOW — intraday bearish') : 'No EMA data'}
SPX vs 200 EMA Daily (${fmt(levels.ema200Daily || multiTFData?.daily?.ema200)}): ${currentPrice && (levels.ema200Daily || multiTFData?.daily?.ema200) ? (currentPrice > (levels.ema200Daily || multiTFData?.daily?.ema200) ? 'ABOVE — macro bullish structure' : 'BELOW — macro bearish structure') : 'No daily EMA data'}
PDH: ${fmt(levels.pdh)} | PDL: ${fmt(levels.pdl)} | Prev Close: ${fmt(levels.prevClose)}
Implied Move Range: ${fmt(levels.impliedLow)} — ${fmt(levels.impliedHigh)}
SPY: ${fmt(spyPrice)} | VIX: ${vixPrice?.toFixed(2) || '—'} (${vixPrice ? (vixPrice > 30 ? 'EXTREME — high caution' : vixPrice > 25 ? 'HIGH — elevated risk' : vixPrice > 18 ? 'ELEVATED — use caution' : vixPrice > 14 ? 'NORMAL' : 'LOW — complacent market') : '—'})

═══ MARKET INTELLIGENCE ═══
Breadth: ${marketIntel?.breadth?.bias || 'No data'} (${marketIntel?.breadth?.advancing || 0}↑ ${marketIntel?.breadth?.declining || 0}↓ of 8 sectors)
QQQ: ${marketIntel?.sectors?.QQQ ? (Number(marketIntel.sectors.QQQ.todayChange) >= 0 ? '+' : '') + marketIntel.sectors.QQQ.todayChange + '%' : '—'} | IWM: ${marketIntel?.sectors?.IWM ? (Number(marketIntel.sectors.IWM.todayChange) >= 0 ? '+' : '') + marketIntel.sectors.IWM.todayChange + '%' : '—'} | XLK: ${marketIntel?.sectors?.XLK ? (Number(marketIntel.sectors.XLK.todayChange) >= 0 ? '+' : '') + marketIntel.sectors.XLK.todayChange + '%' : '—'} | XLF: ${marketIntel?.sectors?.XLF ? (Number(marketIntel.sectors.XLF.todayChange) >= 0 ? '+' : '') + marketIntel.sectors.XLF.todayChange + '%' : '—'}
TLT (Bonds): ${marketIntel?.sectors?.TLT ? (Number(marketIntel.sectors.TLT.todayChange) >= 0 ? '+' : '') + marketIntel.sectors.TLT.todayChange + '%' : '—'}

═══ OPTIONS FLOW (Unusual Whales) ═══
Market Tide: ${marketTide?.bias || 'No data'} | P/C Ratio: ${marketTide?.putCallRatio || '—'}
${optionsFlow.length ? `${optionsFlow.length} flow alerts (biggest first):\n${optionsFlow.slice(0, 5).map((f: any) => `  ${f.ticker} ${(f.type||'').toUpperCase()} $${f.strike} ${f.expiry||''} — ${f.sentiment} ${f.premium||''}${f.unusual ? ' ⚡' : ''}`).join('\n')}` : 'No options flow data'}

EARNINGS THIS WEEK:
${earningsSection}

═══ HISTORICAL CONTEXT (Tiingo) ═══
${tiingoContext ? tiingoContext.summary : 'No Tiingo key — add for historical gap/implied move data'}

${gapPrediction?.trendScorePredicted !== undefined ? `═══ TODAY'S DAY TYPE PREDICTION ═══
Trend Score: ${gapPrediction.trendScorePredicted}/100 — ${gapPrediction.interpretation}
Confidence: ${gapPrediction.confidence} | Catalyst: ${gapPrediction.catalyst || 'None'}
${gapPrediction.historicalMatch?.trendPct != null ? `Historical: ${gapPrediction.historicalMatch.trendPct}% trend days on similar setups (${gapPrediction.historicalMatch.count} obs)` : 'Building historical base — < 5 matching days tracked'}
Drivers: ${gapPrediction.drivers?.join(' | ') || 'none identified'}` : ''}

═══ MORNING PLAN ═══
Bias: ${morningPlan.bias || 'NOT SET — trading without a plan'}
Implied Move: ±${morningPlan.impliedMove || 'not set'} pts
Key Levels: ${morningPlan.keyLevels || 'not set'}
Gap: ${morningPlan.gapDirection || 'flat'} ${morningPlan.gapSize ? morningPlan.gapSize + 'pts' : ''}${morningPlan.notes ? `\nTrader's notes: ${morningPlan.notes}` : ''}

═══ AI SIGNAL ═══
Signal: ${aiResult?.signal || 'No signal yet'} | Confidence: ${aiResult?.confidence || 0}%
${aiResult?.marketConditions ? `Conditions: ${aiResult.marketConditions}` : ''}
${aiResult?.todaysEdge ? `Edge: ${aiResult.todaysEdge}` : ''}
${aiResult?.riskFlag ? `⚠ Risk: ${aiResult.riskFlag}` : ''}
${aiResult?.entryZone ? `Entry zone: ${fmt(aiResult.entryZone.low)}–${fmt(aiResult.entryZone.high)} | Stop: ${fmt(aiResult.stopLevel)} | T1: ${fmt(aiResult.target1)} | T2: ${fmt(aiResult.target2)}` : ''}

═══ PROBABILITY BREAKDOWN ═══
Reversal: ${probs.reversal}% | Continuation: ${probs.continuation}% | Chop: ${probs.chop}%
Dominant scenario: ${probs.dominant} (${probs.confidence} confidence)

═══ ACTIVE PLAYBOOK ═══
${activePlaybook ? `${activePlaybook.name}\nEntry: ${activePlaybook.entry}\nStop: ${activePlaybook.stop}\nTarget: ${activePlaybook.target}\nSetup: ${activePlaybook.setup}` : 'No playbook selected — trader has no defined setup'}

═══ PRE-TRADE CHECKLIST: ${score}/13 (Grade: ${grade}) ═══
MET:\n${metChecks || 'None'}
UNMET:\n${unmetChecks || 'All conditions met!'}

═══ TODAY'S TRADING ═══
P&L: ${todayPnL >= 0 ? '+' : ''}$${todayPnL.toFixed(0)} | Trades today: ${trades.filter(t => t.date === new Date().toISOString().split('T')[0]).length}
${tradeStats ? `All-time: ${tradeStats.winRate}% win rate | ${tradeStats.totalTrades} trades | Profit factor: ${tradeStats.profitFactor}x` : 'No trade history yet'}

═══ DRAWN LEVELS & S&D ZONES ═══
${drawnLines.length > 0 ? drawnLines.map((l: any) => {
  if (l.type === 'horizontal' && l.price) return `Horizontal level: $${l.price.toFixed(2)} (${l.label || 'key level'})`
  if (l.type === 'horizontal') return `Horizontal line at chart position ${(l.y * 100).toFixed(0)}%`
  if (l.type === 'trendline' && l.price1 && l.price2) return `Trendline: $${l.price1.toFixed(2)} → $${l.price2.toFixed(2)}`
  return `Trendline drawn on chart`
}).join('\n') : 'No drawn levels'}
${drawnZones.length > 0 ? drawnZones.map((z: any) => z.priceHigh && z.priceLow ? `S&D Zone: $${z.priceLow.toFixed(2)}–$${z.priceHigh.toFixed(2)} (${z.priceLow < (currentPrice||0) && z.priceHigh > (currentPrice||0) ? 'PRICE IN ZONE' : z.priceHigh < (currentPrice||0) ? 'support below' : 'resistance above'})` : `S&D Zone at chart ${(z.y1*100).toFixed(0)}%–${(z.y2*100).toFixed(0)}%`).join('\n') : ''}

${macroRegime ? `\n═══ MACRO REGIME ═══\nFed: ${macroRegime.fedStance} (${macroRegime.rateLevel}) | ${macroRegime.regime}\n${macroRegime.regimeSummary}` : ''}
${marketNews ? `\n═══ TODAY'S NEWS ═══\n${marketNews}` : ''}
${economicCalendar ? `\n═══ ECONOMIC CALENDAR ═══\n${economicCalendar}` : ''}
${multiTFData ? `\n═══ MULTI-TIMEFRAME ═══\nWeekly: ${multiTFData.weekly.trend} | Daily: ${multiTFData.daily.trend} | ${multiTFData.confluence}` : ''}
${zeroDTESkew ? `\n═══ 0DTE SKEW ═══\n${zeroDTESkew.skewLabel} | Calls ${zeroDTESkew.callPct}% | P/C ${zeroDTESkew.pcRatio}` : ''}
${marketScore ? `\n═══ MARKET SCORE: ${marketScore.score}/100 — ${marketScore.label} ═══` : ''}
${tradePatterns ? `\n═══ YOUR PATTERNS ═══\nBest hour: ${tradePatterns.bestHour} | Revenge trades: ${tradePatterns.revengePatterns}${tradePatterns.cutWinnersEarly ? ' | ⚠ Cutting winners early' : ''}` : ''}
${traderProfile?.memory_log?.length > 0 ? `
═══ RELATIONSHIP MEMORY (${traderProfile.session_count || 0} sessions together) ═══
${traderProfile.memory_log.slice(-15).join('\n')}` : sessionMemory ? `
═══ MEMORY ═══
${sessionMemory}` : ''}

THIS IS NOT FINANCIAL ADVICE. You are an accountability and analysis tool only.`
  }

  // Send chat with explicit text (for voice input)
  const sendChatWithText = async (text: string, retryCount = 0) => {
    setChatLoading(true)
    const _probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext, historicalStats: historicalGapStats })
    const _score = customChecklist.filter((c: any) => checked[c.id]).length
    const _grade = _score >= 11 ? 'A' : _score >= 9 ? 'B' : _score >= 7 ? 'C' : _score >= 5 ? 'D' : 'F'
    const _met = CHECKLIST.filter(c => checked[c.id]).map(c => `✓ ${c.label}`).join('\n')
    const _unmet = CHECKLIST.filter(c => !checked[c.id]).map(c => `✗ ${c.label}`).join('\n')
    const companionCtx = buildCompanionContext({
      market: { currentPrice, levels, candles, vixPrice, changes },
      edgeProfile,
      executionStats,
      patternAnalysis,
      microstructure,
      breadthData,
      gexData,
      morningPlan, activePlaybook: playbooks.find((p: any) => p.id === activePlaybookId) || null,
      tradeStats, aiTone, aiResult,
      lastAITime,
      optionsFlow, marketTide, marketIntel, tiingoContext, zeroDTESkew, marketScore,
      tradePatterns, multiTFData, marketNews, economicCalendar, macroRegime, earningsCalendar,
      sessionMemory,
      traderProfile, customRules,
      marketIntel2,
      probs: _probs, checklistScore: _score, checklistGrade: _grade, metChecks: _met, unmetChecks: _unmet, aiToneStr: '',
      actionability: actionability,
      setupEval:     setupEval,
      dayTypeForecast,
      openPositions,
      setupFire:        setupFireDisplay,
      sessionSetupFires: sessionFires,
      mtfStructure,
      swingAlert,
    })
    const context = companionCtx.systemPrompt
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          system: [{ type: 'text', text: context, cache_control: { type: 'ephemeral' } }],
          messages: [...chatMessages, { role: 'user', content: text }].slice(-10).map(m => ({ role: m.role, content: m.content }))
        }),
        signal: AbortSignal.timeout(15000)
      })
      const data = await res.json()

      // Track usage
      trackUsage('claude-sonnet-4-6', 'companion', data)

      // Handle overloaded / error responses
      if (data?.error?.type === 'overloaded_error' || data?.error === 'Rate limit exceeded') {
        if (retryCount < 2) {
          setChatLoading(false)
          await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
          return sendChatWithText(text, retryCount + 1)
        }
        const errMsg = "I'm overloaded right now — try again in a few seconds."
        setChatMessages(p => [...p, { role: 'assistant', content: errMsg }])
        if (!speakLockRef.current) speak(errMsg)
        setChatLoading(false)
        return
      }

      if (!res.ok || data?.error) {
        let errMsg = "Having trouble connecting — check your internet and try again."
        if (data?.error?.message?.includes('credit balance')) {
          errMsg = "⚠️ Anthropic credits depleted — add credits at console.anthropic.com/settings/billing to restore AI responses."
        } else if (data?.error?.message?.includes('API key')) {
          errMsg = "⚠️ Anthropic API key issue — check Settings."
        }
        setChatMessages(p => [...p, { role: 'assistant', content: errMsg }])
        setChatLoading(false)
        return
      }

      const reply = data.content?.[0]?.text
      if (!reply) {
        setChatLoading(false)
        return
      }

      // Speak FIRST — via avatar if active, else TTS
      if (avatarMode && avatarRef.current?.isReady) {
        avatarRef.current.speak(reply).catch(() => speak(reply))
      } else {
        speak(reply)
      }
      // Save assistant message to DB after streaming completes
      const _saveMsgToDb = (content: string) => {
        fetch('/api/chat-sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ role: 'assistant', content }])
        }).catch(() => {})
      }
      // Strip markdown before displaying — responses are spoken aloud
      const cleanReply = reply
        .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold** → bold
        .replace(/\*(.*?)\*/g, '$1')        // *italic* → italic
        .replace(/^[-•]\s+/gm, '')          // bullet points → plain
        .replace(/^#+\s+/gm, '')            // headers → plain
        .replace(/`(.*?)`/g, '$1')          // `code` → code
        .trim()

      setChatMessages(p => {
        const updated = [...p, { role: 'assistant', content: cleanReply }]
        if (updated.length % 10 === 0) {
          extractMemoryFromSession(keys[ANTH_KEY] || 'server', updated, tradePatterns, traderProfile)
        }
        return updated
      })
      _saveMsgToDb(cleanReply)
    } catch (e) {
      const errMsg = "Connection error — make sure you're online and try again."
      setChatMessages(p => [...p, { role: 'assistant', content: errMsg }])
    }
    // Don't set loading false until speak() has locked the mic
    // (speak() is async so by the time we reach here speakLockRef is set)
    setChatLoading(false)
  }

  // Chat send
  const sendChat = async () => {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(p => [...p, { role: 'user', content: msg }])
    await sendChatWithText(msg)
  }

  // Trade import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Parsing...')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseBrokerCSV(text)
      if (!parsed.length) { setImportStatus('No trades found — check CSV format'); return }
      const allTrades = [...trades, ...parsed.map(t => ({ ...t, id: Date.now() + Math.random(), inSystem: true }))]
      setTrades(allTrades)
      setImportStatus(`✓ Imported ${parsed.length} trades — AI now has your history`)
      // Save to Supabase cloud
      fetch('/api/userdata?table=trades', { method: 'DELETE' }).then(() =>
        fetch('/api/userdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'trades_bulk', data: { trades: allTrades } })
        }).then(r => r.json()).then(d => {
          if (d.success) setImportStatus(`✓ Imported ${parsed.length} trades — saved to your profile`)
        })
      ).catch(() => {})
    }
    reader.readAsText(file)
  }

  // Computed values
  const score = customChecklist.filter((c: any) => checked[c.id]).length
  const grade = score >= 11 ? 'A' : score >= 9 ? 'B' : score >= 7 ? 'C' : score >= 5 ? 'D' : 'F'
  const gradeColor = score >= 9 ? C.teal : score >= 7 ? C.yellow : C.red
  const todayPnL = trades.filter((t: any) => t.date === new Date().toISOString().split('T')[0]).reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0)

  // Write live context to localStorage so companion popout can read it
  useEffect(() => {
    const activePlaybook = playbooks.find((p: any) => p.id === activePlaybookId) || null
    const traderName = userName ? `Trader's name: ${userName}. Address them by name occasionally.` : ''
    const ctx = {
      spx: fmt(currentPrice),
      vwapPos: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲' : '▼') : '—',
      vix: vixPrice ? vixPrice.toFixed(2) : '—',
      vixLevel: vixPrice ? (vixPrice > 25 ? 'HIGH' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL') : '—',
      signal: aiResult?.signal || '',
      confidence: aiResult?.confidence || 0,
      bias: morningPlan.bias || '',
      impliedMove: morningPlan.impliedMove || '',
      keyLevels: morningPlan.keyLevels || '',
      score, grade,
      flow: optionsFlow.length ? optionsFlow.slice(0,3).map((f: any) => `${f.ticker} ${f.type} ${f.sentiment}`).join(' | ') : 'No data',
      tide: marketTide?.bias || '—',
      breadth: marketIntel?.breadth?.bias || '—',
      pnl: `${todayPnL >= 0 ? '+' : ''}$${todayPnL.toFixed(0)}`,
      trades: trades.filter((t: any) => t.date === new Date().toISOString().split('T')[0]).length,
      edge: aiResult?.todaysEdge || '',
      riskFlag: aiResult?.riskFlag || '',
    }
    localStorage.setItem('tz-live-context', JSON.stringify(ctx))
  }, [currentPrice, vixPrice, aiResult, morningPlan, score, grade, optionsFlow, marketTide, marketIntel, todayPnL, trades, playbooks, activePlaybookId])
  const signalColor = aiResult?.signal === 'LONG' ? C.teal : aiResult?.signal === 'SHORT' ? C.red : aiResult?.signal === 'WAIT' ? C.yellow : C.textDim
  const activePlaybook = playbooks.find(p => p.id === activePlaybookId) || null
  const estTime = getEST().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (!isLoaded) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'transparent', color: '#8090b0', fontFamily: font }}>Loading...</div>

  // CC switches based on darkMode

  return (
    <div style={{ width: '100vw', height: '100vh', background: darkMode ? 'transparent' : '#f0f4f8', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: font, transition: 'background 0.3s' }}>
      {/* ── FOCUS PANEL — what matters right now, always visible ── */}
      <FocusPanel font={font} fontDisplay={fontDisplay} C={C}
        signalLoading={aiLoading}
        setupFire={setupFireDisplay}
        onDismissSetup={() => setSetupFireDisplay(null)}
        swingAlert={swingAlert}
        onDismissSwing={() => { setSwingAlert(null); try { localStorage.removeItem('tz-swing-alert') } catch {} }}
        onGetSignal={() => {
          // Trigger the FULL signal pipeline (quality gate + alert logging)
          // via the main button — zero duplicated logic. Switch to the
          // cockpit tab first if needed (the button only mounts there).
          const clickMain = () => document.getElementById('tz-get-signal-main')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          if (tab !== 'cockpit') { setTab('cockpit'); setTimeout(clickMain, 400) }
          else clickMain()
        }}
        inputs={{
          currentPrice: currentPrice ?? null,
          vwap:        levels?.spyVwap ?? null,
          ema200:      levels?.ema200 ?? null,
          pdh:         levels?.pdh ?? null,
          pdl:         levels?.pdl ?? null,
          prevClose:   levels?.prevClose ?? null,
          orbHigh:     orbHigh ?? null,
          orbLow:      orbLow ?? null,
          gammaFlip:   gexData?.gammaFlip ?? null,
          callWall:    gexData?.callWall ?? null,
          putWall:     gexData?.putWall ?? null,
          gexRegime:   (gexData?.regime === 'positive' || gexData?.regime === 'negative') ? gexData.regime : null,
          dayType:     dayTypeForecast?.dayType ?? null,
          tick:        marketIntel2?.tick ?? null,
          sessionMinutes: (() => {
            const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
            return (et.getHours() - 9) * 60 + (et.getMinutes() - 30)
          })(),
          planBias:    morningPlan?.bias || null,
          extraLevels: [
            ['D200EMA', mtfStructure?.spx?.d1?.ema200 ?? null],
            ['D200SMA', mtfStructure?.spx?.d1?.sma200 ?? null],
            ['H200EMA', mtfStructure?.spx?.h1?.ema200 ?? null],
            ['D50EMA',  mtfStructure?.spx?.d1?.ema50 ?? null],
            ['D20EMA',  mtfStructure?.spx?.d1?.ema20 ?? null],
          ] as Array<[string, number | null]>,
          armedTriggers: (triggerRules || []).map((t: any) => ({ name: t.name, direction: t.direction })),
          newsSnippet: economicCalendar ? String(economicCalendar).substring(0, 50) : null,
        }}
      />

      {/* ── SESSION FIRES STRIP — today's setup-engine fires, persistent ── */}
      {sessionFires.length > 0 && (
        <div style={{
          margin: '0 10px 4px', padding: '5px 12px',
          background: 'rgba(8, 12, 24, 0.55)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, fontFamily: font,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#7d8db0', fontFamily: fontDisplay, flexShrink: 0 }}>
            TODAY&apos;S SETUPS ({sessionFires.length})
          </span>
          {sessionFires.slice(-6).map((f: any) => (
            <span key={f.firedAt} style={{ fontSize: 10.5, color: '#b0c4de', whiteSpace: 'nowrap' as const }}>
              <span style={{ color: '#7d8db0' }}>{f.timeET}</span>
              {' '}<span style={{ color: '#e8f0ff', fontWeight: 600 }}>{f.name}</span>
              {' '}<span style={{ color: f.direction === 'LONG' ? '#00ff88' : '#ff4d6d', fontWeight: 700 }}>{f.direction}</span>
              {' · '}
              <span style={{
                fontWeight: 700,
                color: f.verdict === 'CONFIRM' ? '#00ff88' : f.verdict === 'CONFLICT' ? '#ff4d6d' : f.verdict === 'CAUTION' ? '#ffb700' : '#7d8db0',
              }}>{f.verdict || 'pending'}</span>
              {f.measured !== null && f.measured !== undefined ? <span style={{ color: '#7d8db0' }}> · {f.measured}%</span> : null}
            </span>
          ))}
          {sessionFires.length > 6 && <span style={{ fontSize: 10, color: '#7d8db0' }}>+{sessionFires.length - 6} earlier</span>}
        </div>
      )}

      {/* Always-mounted CSV import input — available on all tabs */}
      <input ref={csvInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        input, textarea { font-family: '${font}' !important; }
      `}</style>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      {showUsageReport && <UsageReport onClose={() => setShowUsageReport(false)} />}
      {showAlertHistory && <AlertHistory onClose={() => setShowAlertHistory(false)} />}

      {/* ── TAKE TRADE MODAL — opens after user clicks "TOOK THIS TRADE" ── */}
      {showTakeTrade && (() => {
        const s = showTakeTrade
        return (
          <TakeTradeModal
            signal={s}
            onClose={() => setShowTakeTrade(null)}
            onConfirm={async (data: any) => {
              try {
                const res = await fetch('/api/open-positions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action:           'open',
                    signalDirection:  s.signal,
                    symbol:           'SPX',
                    strike:           data.strike,
                    expiry:           data.expiry,
                    contracts:        data.contracts,
                    entryPrice:       data.entryPrice,
                    entryPremium:     data.entryPremium,
                    stopLevel:        s.stopLevel,
                    target1:          s.target1,
                    target2:          s.target2,
                    setupName:        s.setupName,
                    aiConfidence:     s.aiConfidence,
                    notes:            data.notes,
                  }),
                })
                const json = await res.json()
                if (json.position) {
                  setOpenPositions(prev => [json.position, ...prev])
                }
                setShowTakeTrade(null)
              } catch (e) {
                console.error('[take-trade] failed:', e)
              }
            }}
          />
        )
      })()}

      {/* ── CLOSE TRADE MODAL ── */}
      {showCloseTrade && (
        <CloseTradeModal
          position={showCloseTrade}
          currentPrice={currentPrice}
          onClose={() => setShowCloseTrade(null)}
          onConfirm={async (data: any) => {
            try {
              const res = await fetch('/api/open-positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action:       'close',
                  id:           showCloseTrade.id,
                  exitPrice:    data.exitPrice,
                  exitPremium:  data.exitPremium,
                  exitReason:   data.exitReason,
                  notes:        data.notes,
                }),
              })
              const json = await res.json()
              setOpenPositions(prev => prev.filter(p => p.id !== showCloseTrade.id))
              setShowCloseTrade(null)
              // brief P&L flash
              if (json.pnl != null) {
                const sign = json.pnl >= 0 ? '+' : ''
                try { speak(`Position closed. ${sign}${Math.round(json.pnl)} dollars.`) } catch {}
              }
            } catch (e) {
              console.error('[close-trade] failed:', e)
            }
          }}
        />
      )}

      {/* ── EXIT PROMPT — auto-fires when SPX hits stop or target ── */}
      {exitPrompt && (
        <ExitPromptModal
          prompt={exitPrompt}
          onDismiss={() => setExitPrompt(null)}
          onConfirmExit={() => {
            setShowCloseTrade(exitPrompt.position)
            setExitPrompt(null)
          }}
        />
      )}
      {outcomeModal && (
        <TradeOutcomeModal
          alertId={outcomeModal.alertId}
          signal={outcomeModal.signal}
          entryLow={outcomeModal.entryLow}
          entryHigh={outcomeModal.entryHigh}
          stopLevel={outcomeModal.stopLevel}
          target1={outcomeModal.target1}
          target2={outcomeModal.target2}
          onClose={() => { setOutcomeModal(null); if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current) }}
        />
      )}
      {showEdgeDiscovery && <EdgeDiscovery 
        onClose={() => setShowEdgeDiscovery(false)} 
        onRulesUpdated={(rules) => {
          setDiscoveredRules(rules)
          console.log('[EdgeDiscovery] Rules updated:', rules.length, 'rules saved to Supabase')
        }}
      />}
      {showBacktest && <BacktestPanel onClose={() => {
        setShowBacktest(false)
        // Reload edge profile from Supabase after backtest seeds it
        setTimeout(() => {
          loadEdgeProfile(true).then(p => { if (p) setEdgeProfile(p) }).catch(() => {})
        }, 3000)  // give the seed a moment to write
      }} />}

      {/* ── SUBSCRIPTION GATE ── */}
      {subStatus === 'loading' && (
        <div style={{ position: 'fixed', inset: 0, background: '#060810', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 900, color: '#00e5ff', letterSpacing: 3, marginBottom: 12 }}>tr<span style={{ color: '#00ff88' }}>AI</span>de Zone</div>
            <div style={{ fontSize: 11.5, color: '#6b7a9a', letterSpacing: 2 }}>VERIFYING ACCESS...</div>
          </div>
        </div>
      )}
      {subStatus === 'none' && (
        <div style={{ position: 'fixed', inset: 0, background: '#060810', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", padding: 24 }}>
          <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 900, color: '#00e5ff', letterSpacing: 3, marginBottom: 6 }}>tr<span style={{ color: '#00ff88' }}>AI</span>de Zone</div>
            <div style={{ fontSize: 12, color: '#6b7a9a', marginBottom: 28, letterSpacing: 1 }}>Your AI trading companion</div>
            <div style={{ background: 'rgba(255,26,74,0.06)', border: '1px solid rgba(255,26,74,0.2)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ff1a4a', marginBottom: 6 }}>No active subscription found</div>
              <div style={{ fontSize: 12, color: '#8899bb', lineHeight: 1.7 }}>Your account doesn't have an active plan. If you've already subscribed, click "Restore Access" below.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <a href="/pricing" style={{ display: 'block', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', borderRadius: 8, padding: '12px 0', fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: 1 }}>
                View Plans & Pricing →
              </a>
              <button onClick={() => {
                setSubStatus('loading')
                fetch('/api/subscription')
                  .then(r => r.json())
                  .then(d => {
                    if (d.hasAccess) { setSubStatus('active'); setSubPlan(d.plan) }
                    else setSubStatus('none')
                  })
                  .catch(() => setSubStatus('none'))
              }} style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88', borderRadius: 8, padding: '11px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                ↻ Restore Access
              </button>
              <a href="/sign-in" style={{ display: 'block', background: 'transparent', border: '1px solid rgba(100,140,220,0.15)', color: '#6b7a9a', borderRadius: 8, padding: '10px 0', fontSize: 12, textDecoration: 'none', letterSpacing: 0.5 }}>
                Sign in with a different account
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── EDGE CONDITION ALERTS ── */}
      {edgeAlerts.length > 0 && (
        <div style={{ position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 965, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 480 }}>
          {edgeAlerts.length >= 2 && (
            <button
              onClick={() => setEdgeAlerts([])}
              style={{
                alignSelf: 'flex-end',
                background: 'rgba(6,8,16,0.97)',
                border: '1px solid rgba(255,183,0,0.5)',
                borderRadius: 5, padding: '4px 10px',
                color: '#ffb700', cursor: 'pointer',
                fontFamily: font, fontSize: 10, fontWeight: 700,
                letterSpacing: 1,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              ✕ CLOSE ALL ({edgeAlerts.length})
            </button>
          )}
          {edgeAlerts.map(alert => (
            <div key={alert.id} style={{
              background: 'rgba(6,8,16,0.97)',
              border: `2px solid ${alert.type === 'HIGH_EDGE' ? 'rgba(255,183,0,0.7)' : 'rgba(255,26,74,0.7)'}`,
              boxShadow: `0 0 30px ${alert.type === 'HIGH_EDGE' ? 'rgba(255,183,0,0.2)' : 'rgba(255,26,74,0.2)'}`,
              borderRadius: 8, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{alert.type === 'HIGH_EDGE' ? '▲' : '✕'}</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900,
                  color: alert.type === 'HIGH_EDGE' ? '#ffb700' : '#ff4d6d', marginTop: 2 }}>
                  {alert.type === 'HIGH_EDGE' ? 'EDGE' : 'AVOID'}
                </div>
              </div>
              <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900,
                    color: alert.type === 'HIGH_EDGE' ? '#ffb700' : '#ff4d6d' }}>
                    {alert.type === 'HIGH_EDGE' ? 'HIGH EDGE SETUP' : 'AVOID THIS SETUP'}
                  </span>
                  {alert.signal !== 'ANY' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 3,
                      background: alert.signal === 'LONG' ? 'rgba(0,255,136,0.15)' : 'rgba(255,26,74,0.15)',
                      color: alert.signal === 'LONG' ? '#00ff88' : '#ff4d6d' }}>
                      {alert.signal === 'LONG' ? '▲ CALL' : '▼ PUT'}
                    </span>
                  )}
                  {alert.winRate && (
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: alert.type === 'HIGH_EDGE' ? '#ffb700' : '#ff4d6d' }}>
                      {alert.winRate}% win rate
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
                  {alert.description}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                  <span>Gap: {alert.conditions?.gapDir}</span>
                  <span>·</span>
                  <span>{alert.conditions?.todayDow}</span>
                  <span>·</span>
                  <span>VIX: {alert.conditions?.vixReg}</span>
                  <span>·</span>
                  <span>{alert.conditions?.signalNow}</span>
                  <span>·</span>
                  <span style={{ color: alert.type === 'HIGH_EDGE' ? 'rgba(255,183,0,0.5)' : 'rgba(255,77,109,0.5)' }}>
                    ⏱ {alert.detectedAt} ET
                  </span>
                  {alert.sampleSize && <><span>·</span><span>{alert.sampleSize} sample</span></>}
                </div>
              </div>
              <button onClick={() => setEdgeAlerts(prev => prev.filter(a => a.id !== alert.id))}
                style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 18, padding: '0 2px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── VOLUME SPIKE BANNERS ── */}
      {volumeAlerts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 950, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
          {volumeAlerts.length >= 2 && (
            <button
              onClick={() => setVolumeAlerts([])}
              style={{
                alignSelf: 'flex-end',
                background: 'rgba(6,8,16,0.97)',
                border: '1px solid rgba(255,183,0,0.4)',
                borderRadius: 5, padding: '4px 10px',
                color: '#ffb700', cursor: 'pointer',
                fontFamily: font, fontSize: 10, fontWeight: 700,
                letterSpacing: 1,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              ✕ CLOSE ALL ({volumeAlerts.length})
            </button>
          )}
          {volumeAlerts.map((alert) => (
            <div key={alert.id} style={{
              background: 'rgba(6,8,16,0.97)',
              border: '1px solid rgba(255,183,0,0.5)',
              borderLeft: '3px solid #ffb700',
              borderRadius: 6, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: `0 4px 20px rgba(0,0,0,0.5)`,
              animation: 'slideInLeft 0.3s ease', cursor: 'pointer',
            }} onClick={() => setVolumeAlerts(prev => prev.filter(a => a.id !== alert.id))}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: '#ffb700', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>VOL SPIKE</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 900, color: alert.direction === 'BULL' ? '#00ff88' : '#ff1a4a' }}>
                  {alert.multiplier}×
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{alert.ticker}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: alert.direction === 'BULL' ? 'rgba(0,255,136,0.12)' : 'rgba(255,26,74,0.1)',
                    color: alert.direction === 'BULL' ? '#00ff88' : '#ff1a4a'
                  }}>{alert.direction === 'BULL' ? '▲ BULLISH' : '▼ BEARISH'}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8899bb' }}>
                  {(alert.volume / 1000).toFixed(0)}K shares · ${alert.price}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,183,0,0.45)', marginTop: 2, letterSpacing: 0.5 }}>
                  ⏱ {alert.time} ET
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setVolumeAlerts(prev => prev.filter(a => a.id !== alert.id)) }}
                style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── LEVEL PROXIMITY ALERT (Feature 3) ── */}
      {levelProximity && (
        <div style={{
          position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)',
          zIndex: 960, background: 'rgba(6,8,16,0.97)',
          border: '1px solid rgba(255,183,0,0.6)',
          boxShadow: '0 0 24px rgba(255,183,0,0.15), 0 4px 24px rgba(0,0,0,0.6)',
          borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
          minWidth: 380, maxWidth: 520,
          animation: 'slideInLeft 0.3s ease',
        }}>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#ffb700', fontWeight: 700, letterSpacing: 1, marginBottom: 1 }}>LEVEL APPROACH</div>
            <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 900, color: '#ffb700' }}>
              {levelProximity.level}
            </div>
            <div style={{ fontSize: 11, color: '#8899bb' }}>{levelProximity.levelPrice?.toFixed(2)}</div>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ flex: 1 }}>
            {/* Main probability row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <div style={{ textAlign: 'center', flex: 1, background: levelProximity.breakoutPct > 55 ? 'rgba(0,255,136,0.06)' : 'rgba(255,26,74,0.06)', borderRadius: 5, padding: '4px 6px' }}>
                <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1 }}>BREAKOUT</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900, color: levelProximity.breakoutPct > 55 ? '#00ff88' : '#ff1a4a' }}>{levelProximity.breakoutPct}%</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1, background: levelProximity.bouncePct > 55 ? 'rgba(0,255,136,0.06)' : 'rgba(255,26,74,0.06)', borderRadius: 5, padding: '4px 6px' }}>
                <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1 }}>BOUNCE</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900, color: levelProximity.bouncePct > 55 ? '#00ff88' : '#ff1a4a' }}>{levelProximity.bouncePct}%</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1, padding: '4px 6px' }}>
                <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1 }}>DISTANCE</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 900, color: '#f0f4ff' }}>{levelProximity.distPts}pts</div>
                <div style={{ fontSize: 9, color: 'rgba(255,183,0,0.5)' }}>⏱ {levelProximity.detectedAt} ET</div>
              </div>
            </div>
            {/* Factor breakdown */}
            {levelProximity.factors && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                {levelProximity.factors.map((f: any) => (
                  <span key={f.label} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: f.positive ? 'rgba(0,255,136,0.08)' : 'rgba(255,26,74,0.08)',
                    color: f.positive ? '#00d4a0' : '#ff6b6b', border: `1px solid ${f.positive ? 'rgba(0,255,136,0.2)' : 'rgba(255,26,74,0.2)'}` }}>
                    {f.label} {f.value}
                  </span>
                ))}
              </div>
            )}
            {/* Context row */}
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#6b7a9a', flexWrap: 'wrap' }}>
              <span>Vol <span style={{ color: parseFloat(levelProximity.volConfirm) > 1.3 ? '#00d4a0' : '#6b7a9a' }}>{levelProximity.volConfirm}×</span></span>
              <span>·</span>
              <span style={{ color: levelProximity.flowBias === 'BULLISH' ? '#00ff88' : levelProximity.flowBias === 'BEARISH' ? '#ff1a4a' : '#8899bb' }}>{levelProximity.flowBias} flow</span>
              <span>·</span>
              <span>{levelProximity.levelTests} tests</span>
              {levelProximity.hasRejectionWicks && <><span>·</span><span style={{ color: '#ffb700' }}>rejection wicks</span></>}
              <span>·</span>
              <span style={{ color: '#8899bb' }}>{levelProximity.timeOfDay}</span>
            </div>
          </div>
          <button onClick={() => setLevelProximity(null)}
            style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* ── FLOW ALERT BANNERS ── */}
      {flowAlerts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
          {flowAlerts.length >= 2 && (
            <button
              onClick={() => setFlowAlerts([])}
              style={{
                alignSelf: 'flex-end',
                background: 'rgba(6,8,16,0.97)',
                border: '1px solid rgba(0,229,255,0.3)',
                borderRadius: 5, padding: '4px 10px',
                color: '#00e5ff', cursor: 'pointer',
                fontFamily: font, fontSize: 10, fontWeight: 700,
                letterSpacing: 1,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              ✕ CLOSE ALL ({flowAlerts.length})
            </button>
          )}
          {flowAlerts.map((alert, i) => (
            <div key={alert.id} style={{
              background: 'rgba(6,8,16,0.97)',
              border: `1px solid ${alert.sentiment === 'BULLISH' ? 'rgba(0,255,136,0.4)' : alert.sentiment === 'BEARISH' ? 'rgba(255,26,74,0.4)' : 'rgba(0,229,255,0.3)'}`,
              borderLeft: `3px solid ${alert.sentiment === 'BULLISH' ? '#00ff88' : alert.sentiment === 'BEARISH' ? '#ff1a4a' : '#00e5ff'}`,
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${alert.sentiment === 'BULLISH' ? 'rgba(0,255,136,0.08)' : alert.sentiment === 'BEARISH' ? 'rgba(255,26,74,0.08)' : 'rgba(0,229,255,0.08)'}`,
              animation: 'slideInLeft 0.3s ease',
              cursor: 'pointer',
            }} onClick={() => setFlowAlerts(prev => prev.filter(a => a.id !== alert.id))}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
                  {alert.unusual ? 'SWEEP' : 'FLOW'}
                </div>
                <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: alert.sentiment === 'BULLISH' ? '#00ff88' : alert.sentiment === 'BEARISH' ? '#ff1a4a' : '#f0f4ff', letterSpacing: 1 }}>
                  {alert.ticker}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: alert.type?.startsWith('c') ? '#00ff88' : '#ff1a4a' }}>
                    {alert.type?.toUpperCase()} ${alert.strike}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7a9a' }}>{alert.expiry}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 900, color: '#00e5ff' }}>{alert.premium}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: alert.sentiment === 'BULLISH' ? 'rgba(0,255,136,0.12)' : alert.sentiment === 'BEARISH' ? 'rgba(255,26,74,0.1)' : 'rgba(0,229,255,0.08)',
                    color: alert.sentiment === 'BULLISH' ? '#00ff88' : alert.sentiment === 'BEARISH' ? '#ff1a4a' : '#8899bb'
                  }}>{alert.sentiment}</span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setFlowAlerts(prev => prev.filter(a => a.id !== alert.id)) }}
                style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Dark pool alerts — bottom right */}
      {dpAlerts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, right: 500, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
          {dpAlerts.length >= 2 && (
            <button
              onClick={() => setDpAlerts([])}
              style={{
                alignSelf: 'flex-end',
                background: 'rgba(6,8,16,0.97)',
                border: '1px solid rgba(124,106,255,0.4)',
                borderRadius: 5, padding: '4px 10px',
                color: '#7c6aff', cursor: 'pointer',
                fontFamily: font, fontSize: 10, fontWeight: 700,
                letterSpacing: 1,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              ✕ CLOSE ALL ({dpAlerts.length})
            </button>
          )}
          {dpAlerts.map((alert) => (
            <div key={alert.id} style={{
              background: 'rgba(6,8,16,0.97)',
              border: `1px solid ${alert.isAboveAsk ? 'rgba(124,106,255,0.5)' : 'rgba(124,106,255,0.2)'}`,
              borderLeft: `3px solid #7c6aff`,
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,106,255,0.06)',
              animation: 'slideInLeft 0.3s ease',
              cursor: 'pointer',
            }} onClick={() => setDpAlerts(prev => prev.filter(a => a.id !== alert.id))}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: '#7c6aff', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
                  {alert.isAboveAsk ? '🏦 DARK POOL ⬆' : alert.isBelowBid ? '🏦 DARK POOL ⬇' : '🏦 DARK POOL'}
                </div>
                <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: '#7c6aff', letterSpacing: 1 }}>
                  {alert.ticker}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 900, color: '#f0f4ff' }}>{alert.notional}</span>
                  {alert.isAboveAsk && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,255,136,0.12)', color: '#00ff88' }}>ABOVE ASK</span>}
                  {alert.isBelowBid && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,77,109,0.12)', color: '#ff4d6d' }}>BELOW BID</span>}
                </div>
                <div style={{ fontSize: 11.5, color: '#6b7a9a' }}>
                  {alert.size.toLocaleString()} shares @ ${alert.price}
                  {alert.isAboveAsk && ' · Aggressive buy'}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setDpAlerts(prev => prev.filter(a => a.id !== alert.id)) }}
                style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── SYSTEM CHECK OVERLAY ── */}
      {systemCheck && !showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,14,0.92)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setSystemCheck(null)}>
          <div style={{ background: '#0c0f1a', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, padding: 24, minWidth: 480, maxWidth: 600, boxShadow: '0 0 40px rgba(0,229,255,0.08)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: '#00e5ff', letterSpacing: 2 }}>SYSTEM CHECK</span>
              <span style={{ fontSize: 11, color: '#8899bb' }}>{new Date().toLocaleTimeString()}</span>
              <button onClick={() => setSystemCheck(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#8899bb', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(systemCheck).map(([name, data]: any) => {
                const isOk = data.status?.includes('✅')
                const isWarn = data.status?.includes('⚠')
                const borderCol = isOk ? 'rgba(0,255,136,0.15)' : isWarn ? 'rgba(255,183,0,0.25)' : 'rgba(255,26,74,0.2)'
                const bgCol = isOk ? 'rgba(0,255,136,0.04)' : isWarn ? 'rgba(255,183,0,0.06)' : 'rgba(255,26,74,0.06)'
                const icon = isOk ? '✅' : isWarn ? '⚠️' : '❌'
                // Fields to show as detail pills
                const detailFields = Object.entries(data)
                  .filter(([k]) => !['status','ms','note','warning','validate'].includes(k))
                  .map(([k,v]) => v ? `${k}: ${v}` : null)
                  .filter(Boolean) as string[]
                return (
                  <div key={name} style={{ padding: '8px 10px', borderRadius: 5, background: bgCol, border: `1px solid ${borderCol}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: detailFields.length || data.warning || data.validate ? 5 : 0 }}>
                      <span style={{ fontSize: 12 }}>{icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#f0f4ff', fontFamily: font, flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 11, color: '#6b7a9a' }}>{data.ms}ms</span>
                    </div>
                    {detailFields.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        {detailFields.slice(0,6).map((f: string) => (
                          <span key={f} style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 6px', color: '#8899bb' }}>{f}</span>
                        ))}
                      </div>
                    )}
                    {data.warning && (
                      <div style={{ fontSize: 11, color: '#ffb700', lineHeight: 1.5, marginTop: 3 }}>⚠ {data.warning}</div>
                    )}
                    {data.validate && (
                      <div style={{ fontSize: 11, color: '#00e5ff', lineHeight: 1.5, marginTop: 3 }}>📐 {data.validate}</div>
                    )}
                    {data.note && !data.warning && (
                      <div style={{ fontSize: 11, color: '#6b7a9a', lineHeight: 1.5, marginTop: 2 }}>{data.note}</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSystemCheck(null); runSystemCheck() }} style={{ padding: '6px 16px', borderRadius: 4, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', cursor: 'pointer', fontFamily: font, fontSize: 12, fontWeight: 600 }}>↻ Re-run</button>
              <button onClick={() => setSystemCheck(null)} style={{ padding: '6px 16px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8899bb', cursor: 'pointer', fontFamily: font, fontSize: 12 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal keys={keys} setKeys={setKeys} onClose={() => setShowSettings(false)} voiceId={voiceId} setVoiceId={setVoiceId} voiceEngine={voiceEngine} setVoiceEngine={setVoiceEngine} darkMode={darkMode} setDarkMode={setDarkMode} aiTone={aiTone} setAiTone={setAiTone} userName={userName} setUserName={setUserName} welcomeMessage={welcomeMessage} setWelcomeMessage={setWelcomeMessage} voiceSpeed={voiceSpeed} setVoiceSpeed={setVoiceSpeed} customRules={customRules} setCustomRules={setCustomRules} />}

      {/* ── DISCLOSURE MODAL ── */}
      {showDisclosure && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'rgba(6,8,16,0.99)', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.yellow }} />
              <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 800, color: C.text }}>Important Disclosure</div>
            </div>
            <div style={{ fontFamily: font, fontSize: 12, color: C.yellow, marginBottom: 24, letterSpacing: '0.5px' }}>READ BEFORE USING <TZ /></div>

            <div style={{ fontFamily: font, fontSize: 12, color: C.textDim, lineHeight: 1.8, marginBottom: 20 }}>
              {[
                { title: 'NOT FINANCIAL ADVICE', body: 'trAIde Zone is an educational and accountability tool only. Nothing generated by this platform — including AI signals, probability estimates, market analysis, trade suggestions, or voice companion responses — constitutes financial advice, investment advice, or a recommendation to buy or sell any security or financial instrument.' },
                { title: 'NO GUARANTEE OF ACCURACY', body: 'All market data, AI-generated analysis, historical probabilities, and signals are provided for informational purposes only and may be delayed, inaccurate, or incomplete. Past performance of any analysis or pattern is not indicative of future results.' },
                { title: 'TRADING INVOLVES SUBSTANTIAL RISK', body: 'Options trading, including SPX intraday options, involves substantial risk of loss and is not appropriate for all investors. You may lose your entire investment. Never trade with money you cannot afford to lose entirely.' },
                { title: 'YOU ARE SOLELY RESPONSIBLE', body: 'All trading decisions are yours alone. trAIde Zone, its developers, and affiliates are not responsible for any trading losses, damages, or financial harm resulting from your use of this platform or reliance on its outputs.' },
                { title: 'AI LIMITATIONS', body: 'The AI companion and analysis engine use large language models which can make errors, hallucinate data, or provide incorrect analysis. Always independently verify any information before acting on it.' },
                { title: 'CONSULT A PROFESSIONAL', body: 'Before trading options or any leveraged instruments, consult a qualified financial advisor, tax professional, and/or legal counsel. This platform is not a substitute for professional financial guidance.' },
              ].map(({ title, body }) => (
                <div key={title} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 4 }}>{title}</div>
                  <div style={{ color: C.textDim }}>{body}</div>
                </div>
              ))}
            </div>

            <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontFamily: font, fontSize: 12, color: C.yellow, lineHeight: 1.6 }}>
                By clicking "I Understand & Accept" below, you acknowledge that you have read, understood, and agree to these terms. You confirm that you understand trading involves substantial risk and that trAIde Zone is a decision-support tool only.
              </div>
            </div>

            <button onClick={() => {
              const ts = new Date().toISOString()
              localStorage.setItem('tz-disclosure-accepted', ts)
              setShowDisclosure(false)
              // Save to DB — persists across devices, legally meaningful timestamp
              fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'disclaimer_accepted', version: '1.0', acceptedAt: ts })
              }).catch(() => {})
            }} style={{
              width: '100%', background: C.teal, color: '#fff', border: 'none',
              borderRadius: 10, padding: '14px 0', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: fontDisplay, letterSpacing: '-0.3px'
            }}>
              I Understand & Accept — Enter trAIde Zone
            </button>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11.5, color: C.textMuted }}>
              You can review this disclosure at any time in Settings
            </div>
          </div>
        </div>
      )}

      {/* ── FEATURE SUGGESTION MODAL ── */}
      {showSuggestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'rgba(6,8,16,0.99)', border: '1px solid rgba(124,106,255,0.3)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 800, color: '#7c6aff' }}>💡 Share Your Idea</div>
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>Help make trAIde Zone better for everyone</div>
              </div>
              <button onClick={() => setShowSuggestion(false)} style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            {!suggestionSent ? (
              <>
                {/* Type selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {([['suggestion', '✨ Feature Idea'], ['bug', '🐛 Bug Report'], ['feedback', 'General Feedback']] as const).map(([type, label]) => (
                    <button key={type} onClick={() => setSuggestionType(type as 'suggestion'|'bug'|'feedback')} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: `1px solid ${suggestionType === type ? 'rgba(124,106,255,0.6)' : 'rgba(255,255,255,0.08)'}`, background: suggestionType === type ? 'rgba(124,106,255,0.12)' : 'transparent', color: suggestionType === type ? '#7c6aff' : C.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: font, fontWeight: suggestionType === type ? 700 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={suggestionText}
                  onChange={e => setSuggestionText(e.target.value)}
                  placeholder={
                    suggestionType === 'suggestion' ? "Describe the feature you'd love to see..." :
                    suggestionType === 'bug' ? "What happened? What did you expect to happen?" :
                    "What's on your mind? We read every submission..."
                  }
                  rows={6}
                  style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 8, padding: '12px 14px', color: C.text, fontFamily: font, fontSize: 12, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.6, marginBottom: 14 }}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      if (!suggestionText.trim()) return
                      try {
                        await fetch('/api/feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: suggestionType, body: suggestionText, category: suggestionType })
                        })
                        setSuggestionSent(true)
                        setSuggestionText('')
                      } catch {}
                    }}
                    disabled={!suggestionText.trim()}
                    style={{ flex: 1, background: suggestionText.trim() ? 'rgba(124,106,255,0.9)' : 'rgba(124,106,255,0.2)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: suggestionText.trim() ? 'pointer' : 'default', fontFamily: fontDisplay }}
                  >
                    Send →
                  </button>
                  <button onClick={() => setShowSuggestion(false)} style={{ flex: 1, background: 'rgba(10,14,24,0.95)', color: C.textDim, border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, padding: '12px 0', fontSize: 13, cursor: 'pointer', fontFamily: font }}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: '#7c6aff', marginBottom: 8 }}>Thank you!</div>
                <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>Your {suggestionType} has been submitted. We read every single one and prioritize features based on what traders like you actually need.</div>
                <button onClick={() => setShowSuggestion(false)} style={{ background: 'rgba(124,106,255,0.15)', color: '#7c6aff', border: '1px solid rgba(124,106,255,0.3)', borderRadius: 8, padding: '10px 24px', fontSize: 12, cursor: 'pointer', fontFamily: font, fontWeight: 700 }}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TOP BAR — NEURAL BLACK ── */}
      <div className="header-scan" style={{ height: 48, background: 'rgba(4,6,14,0.99)', borderBottom: '1px solid rgba(0,229,255,0.14)', boxShadow: '0 2px 20px rgba(0,0,0,0.5), 0 1px 0 rgba(0,229,255,0.06)', display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, zIndex: 10, position: 'relative', overflow: 'hidden' }}>
        {/* Logo */}
        <div style={{ padding: '0 20px', borderRight: `1px solid rgba(0,229,255,0.08)`, display: 'flex', alignItems: 'center', gap: 10, height: '100%' }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 900, letterSpacing: 3, display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ color: C.text, fontWeight: 900 }}>tr</span>
            <span style={{ color: '#00d4a0', fontWeight: 900 }}>AI</span>
            <span style={{ color: C.text, fontWeight: 900 }}>de Zone</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: connected ? '#00ff88' : '#ff1a4a', boxShadow: connected ? '0 0 10px rgba(0,255,136,0.8)' : '0 0 10px rgba(255,26,74,0.6)', animation: connected ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 9, color: connected ? '#00ff88' : '#ff1a4a', fontWeight: 700, letterSpacing: 3, textShadow: connected ? '0 0 8px rgba(0,255,136,0.8)' : '0 0 8px rgba(255,26,74,0.8)' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
            <AgentStatus />
            <button onClick={() => setShowUsageReport(true)} title="AI Usage & Cost Report" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(0,212,160,0.3)', background: 'rgba(0,212,160,0.07)', color: '#00d4a0', cursor: 'pointer', fontFamily: font, marginLeft: 2 }}>$</button>
            <button onClick={() => setShowAlertHistory(true)} title="Trade Alert History" style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 3, border: '1px solid rgba(255,183,0,0.4)', background: 'rgba(255,183,0,0.08)', color: '#ffb700', cursor: 'pointer', fontFamily: font, marginLeft: 2, letterSpacing: 1 }}>LOG</button>
            <button onClick={() => setShowBacktest(true)} title="AI Signal Backtest" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(124,106,255,0.4)', background: 'rgba(124,106,255,0.08)', color: '#7c6aff', cursor: 'pointer', fontFamily: font, marginLeft: 2 }}>🔬</button>
            {edgeProfile?.backtestWinRate && (
              <span title={`Edge loaded: ${edgeProfile.backtestWinRate}% win rate (${edgeProfile.backtestDays}d backtest)`}
                style={{ fontSize: 9, color: 'rgba(124,106,255,0.6)', marginLeft: 2, cursor: 'default' }}>
                {edgeProfile.backtestWinRate}%
              </span>
            )}
            <button onClick={() => setShowEdgeDiscovery(true)} title="AI Edge Discovery" style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 3, border: '1px solid rgba(124,106,255,0.5)', background: 'rgba(124,106,255,0.1)', color: '#7c6aff', cursor: 'pointer', fontFamily: font, marginLeft: 2, letterSpacing: 1 }}>EDGE</button>
            <button onClick={() => {
              setVolumeAlerts([{ id: `vol-demo-${Date.now()}`, multiplier: '3.8', volume: 820000, direction: 'BULL', price: currentPrice?.toFixed(2) || '7155.00', ticker: 'SPY', time: new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'}) }])
              if (currentPrice && levels?.spyVwap) setLevelProximity({ level: 'VWAP', levelPrice: levels.spyVwap, currentPrice, distPts: Math.abs(currentPrice - levels.spyVwap).toFixed(1), distPct: (Math.abs(currentPrice - levels.spyVwap)/currentPrice*100).toFixed(2), approaching: true, breakoutPct: 62, bouncePct: 38, volConfirm: '1.8', flowBias: 'BULLISH' })
            }} title="Test new feature alerts" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(255,183,0,0.4)', background: 'rgba(255,183,0,0.08)', color: '#ffb700', cursor: 'pointer', fontFamily: font, marginLeft: 2 }}>TEST</button>
          </div>
        </div>

        {/* Tickers */}
        {[
          { label: 'SPX', price: currentPrice, change: changes.spx, open: openPrice },
          { label: 'SPY', price: spyPrice, change: changes.spy, open: spyCandles[0]?.o },
          { label: 'VIX', price: vixPrice, change: changes.vix, open: vixCandles[0]?.o },
        ].map(({ label, price, change, open }) => (
          <div key={label} style={{ padding: '0 16px', borderRight: 'none', position: 'relative' as const, display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase' as const }}>{label}</span>
            <span id={label === 'SPX' ? 'tz-spx-price' : undefined} style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: '#f0f4ff', letterSpacing: '0.5px', textShadow: '0 0 20px rgba(240,244,255,0.15)' }}>{fmt(price)}</span>
            {change !== undefined && (
              <span style={{ fontSize: 11, fontWeight: 700, color: (change ?? 0) >= 0 ? '#00ff88' : '#ff1a4a', textShadow: (change ?? 0) >= 0 ? '0 0 10px rgba(0,255,136,0.7)' : '0 0 10px rgba(255,26,74,0.7)', letterSpacing: '0.5px' }}>
                {(change ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(open ? (change ?? 0) / open * 100 : 0).toFixed(2)}%
              </span>
            )}
          </div>
        ))}

        {/* VWAP / EMA quick view */}
        <div style={{ padding: '0 16px', borderRight: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 12, height: '100%' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#ffb700', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>VWAP{manualVwap ? ' ✎' : ''}</span>
            {editingVwap ? (
              <input
                autoFocus
                value={vwapInput}
                onChange={e => setVwapInput(e.target.value.replace(/[^0-9.]/g, ''))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = parseFloat(vwapInput)
                    if (v > 5000 && v < 15000) { md.setManualVwap(v) }
                    setEditingVwap(false)
                  }
                  if (e.key === 'Escape') { setEditingVwap(false); md.setManualVwap(null) }
                }}
                onBlur={() => setEditingVwap(false)}
                placeholder="e.g. 7126"
                style={{ width: 72, background: 'rgba(255,183,0,0.1)', border: '1px solid rgba(255,183,0,0.5)', borderRadius: 3, color: '#ffb700', fontSize: 12, fontFamily: font, padding: '1px 4px', outline: 'none' }}
              />
            ) : (
              <span
                onClick={() => { setVwapInput(String(Math.round(effectiveVwap || levels?.spyVwap || 0))); setEditingVwap(true) }}
                title="Click to override VWAP · Esc to clear"
                style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: manualVwap ? '#ffb700' : '#f0f4ff', cursor: 'pointer', borderBottom: manualVwap ? '1px dashed rgba(255,183,0,0.5)' : 'none' }}
              >{fmt(effectiveVwap)}</span>
            )}
            {currentPrice && levels.spyVwap && (
              <span style={{ fontSize: 11, color: currentPrice > levels.spyVwap ? '#00ff88' : '#ff1a4a', textShadow: currentPrice > levels.spyVwap ? '0 0 8px rgba(0,255,136,0.6)' : '0 0 8px rgba(255,26,74,0.6)', fontWeight: 700 }}>
                {currentPrice > levels.spyVwap ? '▲' : '▼'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#00e5ff', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>200E(5m)</span>
            <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{fmt(levels.ema200)}</span>
            {currentPrice && levels.ema200 && (
              <span style={{ fontSize: 11, color: currentPrice > levels.ema200 ? '#00ff88' : '#ff1a4a', fontWeight: 700 }}>
                {currentPrice > levels.ema200 ? '▲' : '▼'}
              </span>
            )}
          </div>
          {(levels.ema200Daily || multiTFData?.daily?.ema200) && (() => {
            const _ema1d = levels.ema200Daily || multiTFData?.daily?.ema200
            return (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#7c6aff', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>200E(1D)</span>
                <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{fmt(_ema1d)}</span>
                {currentPrice && _ema1d && (
                  <span style={{ fontSize: 11, color: currentPrice > _ema1d ? '#00ff88' : '#ff1a4a', fontWeight: 700 }}>
                    {currentPrice > _ema1d ? '▲' : '▼'}
                  </span>
                )}
              </div>
            )
          })()}
          {/* VWAP Bands */}
          {marketIntel2?.vwapBands && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>VWAP±</span>
              <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: marketIntel2.vwapBands.isExtended ? '#ff4d6d' : marketIntel2.vwapBands.isMeanRevertZone ? '#f59e0b' : '#f0f4ff' }}>
                {marketIntel2.vwapBands.band1Dn?.toFixed(0)}/{marketIntel2.vwapBands.band1Up?.toFixed(0)}
              </span>
              {marketIntel2.vwapBands.isExtended && <span style={{ fontSize: 10, color: '#ff4d6d', fontWeight: 800 }}>EXT</span>}
            </div>
          )}
          {/* POC in header */}
          {volumeProfile?.poc && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#00e5ff', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>POC</span>
              <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#00e5ff' }}>{volumeProfile.poc?.toFixed(0)}</span>
            </div>
          )}
          {/* Max pain in header */}
          {marketIntel2?.optionsChain?.maxPain > 0 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>MAX PAIN</span>
              <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{marketIntel2.optionsChain.maxPain?.toFixed(0)}</span>
            </div>
          )}
          {/* SKEW in header */}
          {marketIntel2?.termStructure?.skew && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: marketIntel2.termStructure.skewRegime === 'EXTREME_TAIL_RISK' ? '#ff4d6d' : '#8899bb', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>SKEW</span>
              <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: marketIntel2.termStructure.skewRegime === 'EXTREME_TAIL_RISK' ? '#ff4d6d' : '#e2e8f0' }}>{marketIntel2.termStructure.skew?.toFixed(0)}</span>
            </div>
          )}
          {/* Session context */}
          {marketIntel2?.timeContext && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 6px', borderRadius: 4, background: marketIntel2.timeContext.isHighRisk ? 'rgba(255,77,109,0.1)' : marketIntel2.timeContext.isPrimeWindow ? 'rgba(0,212,160,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${marketIntel2.timeContext.isHighRisk ? 'rgba(255,77,109,0.3)' : marketIntel2.timeContext.isPrimeWindow ? 'rgba(0,212,160,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: marketIntel2.timeContext.isHighRisk ? '#ff4d6d' : marketIntel2.timeContext.isPrimeWindow ? '#00d4a0' : '#8899bb' }}>
                {marketIntel2.timeContext.currentSession}
              </span>
              {marketIntel2.timeContext.isHighRisk && <span style={{ fontSize: 9, color: '#ff4d6d' }}>⚠θ</span>}
            </div>
          )}
        </div>

        {/* Right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16, height: '100%' }}>
          <span style={{ fontSize: 11, color: 'rgba(136,153,187,0.7)', letterSpacing: 1, fontFamily: font }}>{estTime} ET</span>
          {/* Score badge */}
          <div style={{ background: gradeColor + '12', border: `1px solid ${gradeColor}35`, borderRadius: 5, padding: '2px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: gradeColor, fontFamily: fontDisplay }}>{grade}</span>
            <span style={{ fontSize: 10, color: 'rgba(136,153,187,0.6)' }}>{score}/13</span>
          </div>
          {/* Today P&L */}
          <div style={{ background: todayPnL >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,77,109,0.07)', border: `1px solid ${todayPnL >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,77,109,0.2)'}`, borderRadius: 5, padding: '2px 10px' }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: todayPnL >= 0 ? '#00ff88' : '#ff4d6d' }}>
              {todayPnL >= 0 ? '+' : ''}${todayPnL.toFixed(0)} P&L
            </span>
          </div>
          {/* Signal pill */}
          {aiResult && (
            <div style={{ background: `${signalColor}12`, border: `1px solid ${signalColor}45`, borderRadius: 5, padding: '3px 12px' }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: signalColor, letterSpacing: 3 }}>{aiResult.signal}</span>
            </div>
          )}
          {/* Voice usage counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6,
            background: voiceOverage ? 'rgba(255,77,109,0.1)' : voiceWarningShown === '90' ? 'rgba(245,158,11,0.1)' : 'rgba(0,212,160,0.08)',
            border: `1px solid ${voiceOverage ? 'rgba(255,77,109,0.3)' : voiceWarningShown === '90' ? 'rgba(245,158,11,0.3)' : 'rgba(0,212,160,0.2)'}` }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#00e5ff', letterSpacing: 1 }}>MIC</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: voiceOverage ? '#ff4d6d' : voiceWarningShown === '90' ? '#f59e0b' : '#00d4a0' }}>
              {Math.round(voiceMinUsed)}m / {voiceMinLimit >= 99999 ? '≈' : voiceMinLimit + 'm'}
            </span>
          </div>
          <button onClick={() => signOut(() => router.push('/'))} style={{ fontFamily: font, fontSize: 11, padding: '3px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'rgba(107,114,128,0.7)', cursor: 'pointer' }}>Sign Out</button>
          <button onClick={() => setShowTutorial(true)} title="Help" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', color: 'rgba(136,153,187,0.6)', cursor: 'pointer', fontSize: 12, fontFamily: font }}>?</button>
          {user?.id && (
            <a href="/admin" target="_blank" title={`System Admin (${user.id})`} style={{ background: 'transparent', border: '1px solid rgba(124,106,255,0.3)', borderRadius: 4, padding: '4px 8px', color: '#7c6aff', cursor: 'pointer', fontSize: 11.5, fontFamily: font, textDecoration: 'none', fontWeight: 700 }}>⚙ Admin</a>
          )}
          <button onClick={() => { setShowSuggestion(true); setSuggestionSent(false); setSuggestionText('') }} title="Suggest a feature or report a bug" style={{ background: 'transparent', border: '1px solid rgba(124,106,255,0.3)', borderRadius: 4, padding: '4px 8px', color: '#7c6aff', cursor: 'pointer', fontSize: 12, fontFamily: font }}>💡</button>
          <button onClick={() => { setSystemCheck(null); runSystemCheck(); setShowSettings(false) }} title="System Check — verify all data feeds" style={{ background: systemCheckRunning ? 'rgba(255,183,0,0.1)' : 'rgba(0,229,255,0.04)', border: `1px solid ${systemCheckRunning ? 'rgba(255,183,0,0.3)' : 'rgba(0,229,255,0.15)'}`, borderRadius: 4, padding: '4px 8px', color: systemCheckRunning ? C.yellow : C.textDim, cursor: 'pointer', fontSize: 12, fontFamily: font, transition: 'all 0.2s' }}>{systemCheckRunning ? '⟳' : '✓'}</button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 4, padding: '4px 10px', color: C.textDim, cursor: 'pointer', fontSize: 13, fontFamily: font, transition: 'all 0.2s' }}>⚙</button>
        </div>
      </div>

      {/* ── TABS — WHITE ── */}
      <div style={{ height: 44, background: 'rgba(6,8,16,0.99)', borderBottom: '1px solid rgba(0,229,255,0.15)', borderTop: '1px solid rgba(0,229,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 0, flexShrink: 0, backdropFilter: 'blur(10px)' }}>
        {(['cockpit', 'plan', 'deepdive', 'journal', 'learn'] as const).map(t => {
          const labels: any = { plan: 'Morning Plan', cockpit: 'Summary', deepdive: 'Deep Dive', journal: 'Journal', learn: 'Learn' }
          return (
            <button key={t} onClick={() => {
              setTab(t as any)
              if (t === 'learn' && !mechAccuracy) {
                fetch('/api/mechanical-flow-accuracy').then(r => r.json()).then(setMechAccuracy).catch(() => {})
              }
              if (t === 'learn' && !insights && !insightsLoading) {
                setInsightsLoading(true)
                fetch('/api/insights').then(r => r.json()).then(d => { setInsights(d); setInsightsLoading(false) }).catch(() => setInsightsLoading(false))
              }
              if (t === 'learn' && !modelValidation) {
                fetch('/api/model-validation').then(r => r.json()).then(setModelValidation).catch(() => {})
              }
              if (t === 'learn' && !dailyRecap) {
                fetch('/api/daily-recap').then(r => r.json()).then(setDailyRecap).catch(() => {})
              }
              if (t === 'learn' && !pulse && !pulseLoading) {
                setPulseLoading(true)
                fetch('/api/learning-pulse').then(r => r.json()).then(d => { setPulse(d); setPulseLoading(false) }).catch(() => setPulseLoading(false))
              }
            }} style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? (t === 'learn' ? '#7c6aff' : '#00e5ff') : 'transparent'}`,
              padding: '0 16px', height: '100%',
              color: tab === t ? (t === 'learn' ? '#7c6aff' : '#00e5ff') : '#6b7a9a',
              cursor: 'pointer', fontFamily: font, fontSize: 12.5, fontWeight: tab === t ? 700 : 500,
              letterSpacing: '1.5px', transition: 'all 0.15s', textTransform: 'uppercase' as const,
              textShadow: tab === t ? '0 0 14px rgba(0,229,255,0.6)' : 'none',
            }}>
              {labels[t]}
              {t === 'deepdive' && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.15)', color: C.teal, borderRadius: 8, marginLeft: 5 }}>chart</span>}
            </button>
          )
        })}

        {activePlaybook && (
          <div style={{ marginLeft: 12, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 99, padding: '2px 10px', display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.teal, boxShadow: `0 0 6px ${C.teal}`, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.teal, letterSpacing: 0.5 }}>{activePlaybook.name}</span>
          </div>
        )}

        {speaking && (
          <div onClick={() => { speakLockRef.current = false; audioSourceRef.current = null; setSpeaking(false); try { window.speechSynthesis.cancel() } catch {} ; try { if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(()=>{}) } catch {} }} title="Click to stop speaking" style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: 0.9 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4 + i * 0.1}s ease-in-out infinite`, animationDelay: `${i * 0.08}s`, '--wh': `${8 + i * 2}px` } as any} />
            ))}
            <span style={{ fontSize: 10, color: C.teal, letterSpacing: 1 }}>SPEAKING ×</span>
          </div>
        )}
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* NEW TAB 1 — COCKPIT DASHBOARD (clean white) */}
        {/* ═══════════════════════════════════════════════════════ */}
        {tab === 'cockpit' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#080a0f' }}>

            {/* Left — Dashboard */}
            <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: '#050609' }}>

              {/* ── OPEN POSITIONS STRIP — live tracking during the session ── */}
              {openPositions.length > 0 && (
                <OpenPositionsStrip
                  positions={openPositions}
                  currentPrice={currentPrice}
                  onCloseClick={(p: any) => setShowCloseTrade(p)}
                  font={font}
                  fontDisplay={fontDisplay}
                />
              )}

              {/* ── DAY TYPE FORECAST — fires at 10am ET, frames the whole session ── */}
              {!dayTypeForecast && (() => {
                // Robust ET extraction via Intl.DateTimeFormat
                const etFmt = new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/New_York', hour12: false,
                  weekday: 'short', hour: '2-digit', minute: '2-digit',
                })
                const parts = etFmt.formatToParts(new Date())
                const weekdayShort = parts.find(p => p.type === 'weekday')?.value || ''
                const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
                const min  = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
                const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
                const dow = weekdayMap[weekdayShort] ?? 0
                const isWeekend = dow === 0 || dow === 6
                const minutesSinceOpen = (hour - 9) * 60 + (min - 30)
                const isAfterClose = hour >= 16
                const isBeforeOpen = hour < 9 || (hour === 9 && min < 30)
                const orReady = orbHigh !== null && orbLow !== null

                let waitMsg = ''
                if (isWeekend) waitMsg = 'Markets closed (weekend) — forecast resumes Monday at 10am ET'
                else if (isAfterClose) waitMsg = 'Markets closed — forecast resumes tomorrow at 10am ET'
                else if (isBeforeOpen) waitMsg = `Pre-market — forecast fires at 10am ET (${Math.abs(minutesSinceOpen)}min away)`
                else if (minutesSinceOpen < 15) waitMsg = `Opening Range still forming (${minutesSinceOpen}/15 min) — forecast at 10am ET`
                else if (minutesSinceOpen < 30) waitMsg = `Opening Range complete — forecast fires at 10:00am ET (${30 - minutesSinceOpen}min away)`
                else if (!orReady) waitMsg = 'Waiting for opening range data to populate'
                else waitMsg = 'Computing forecast…'

                return (
                  <div style={{ borderRadius: 10, background: 'rgba(124,106,255,0.04)', border: '1px dashed rgba(124,106,255,0.25)', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#7c6aff', textTransform: 'uppercase' as const }}>
                        Day Type Forecast
                      </span>
                      <span style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 600, letterSpacing: 1 }}>
                        AUTO-FIRES AT 10:00 ET
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8899bb', lineHeight: 1.6, marginBottom: 8 }}>
                      {waitMsg}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6b7a9a', fontStyle: 'italic' as const, marginBottom: 10 }}>
                      Combines 8 signals (gamma, opening drive, VIX, TICK, OR size, cross-asset, calendar) into trend vs consolidation probability with recommended plays for the regime.
                    </div>
                  </div>
                )
              })()}

              {dayTypeForecast && (() => {
                const f = dayTypeForecast
                const isTrend = f.dayType === 'TREND'
                const isRange = f.dayType === 'CONSOLIDATION'
                const primary = isTrend ? '#7c6aff' : isRange ? '#00d4a0' : '#f59e0b'
                const tagBg = isTrend ? 'rgba(124,106,255,0.12)' : isRange ? 'rgba(0,212,160,0.10)' : 'rgba(245,158,11,0.10)'
                const tagBd = isTrend ? 'rgba(124,106,255,0.4)'  : isRange ? 'rgba(0,212,160,0.35)' : 'rgba(245,158,11,0.35)'
                return (
                  <div style={{ borderRadius: 10, background: tagBg, border: `1px solid ${tagBd}`, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: primary, textTransform: 'uppercase' as const }}>
                          Day Type Forecast
                        </span>
                        <span style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 600, letterSpacing: 1 }}>
                          {f.confidence} confidence
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: '#4a5568', fontFamily: font }}>
                        {new Date(f.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET
                      </span>
                    </div>

                    {/* Headline */}
                    <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: primary, letterSpacing: 0.5, marginBottom: 4 }}>
                      {f.headline}
                    </div>
                    <div style={{ fontSize: 12, color: '#b0c4de', lineHeight: 1.55, marginBottom: 12 }}>
                      {f.reasoning}
                    </div>

                    {/* Probability bars */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1, textAlign: 'center' as const }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#7c6aff', letterSpacing: 1, marginBottom: 2 }}>TREND</div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ height: '100%', width: `${f.trendProbability}%`, background: '#7c6aff', borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#7c6aff', fontFamily: fontDisplay }}>{f.trendProbability}%</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' as const }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#00d4a0', letterSpacing: 1, marginBottom: 2 }}>CONSOLIDATION</div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ height: '100%', width: `${f.consolidationProbability}%`, background: '#00d4a0', borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#00d4a0', fontFamily: fontDisplay }}>{f.consolidationProbability}%</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' as const }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', letterSpacing: 1, marginBottom: 2 }}>INDETERMINATE</div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ height: '100%', width: `${f.indeterminateProbability}%`, background: '#f59e0b', borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontFamily: fontDisplay }}>{f.indeterminateProbability}%</div>
                      </div>
                    </div>

                    {/* Recommended setups */}
                    {f.recommendedSetups && f.recommendedSetups.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#4a5568', letterSpacing: 1.5, marginBottom: 6 }}>RECOMMENDED PLAYS (probability they work today)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {f.recommendedSetups.slice(0, 6).map((s: any, i: number) => {
                            const dirColor = s.direction === 'LONG' ? '#00ff88' : '#ff4d6d'
                            const arrow    = s.direction === 'LONG' ? '▲' : '▼'
                            return (
                              <div key={s.id}
                                onClick={() => setSelectedSetup(s.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '6px 10px',
                                  background: selectedSetup === s.id ? 'rgba(124,106,255,0.12)' : 'rgba(0,0,0,0.2)',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  border: selectedSetup === s.id ? '1px solid rgba(124,106,255,0.4)' : '1px solid transparent',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                onMouseLeave={e => (e.currentTarget.style.background = selectedSetup === s.id ? 'rgba(124,106,255,0.12)' : 'rgba(0,0,0,0.2)')}
                              >
                                <span style={{ color: dirColor, fontWeight: 800, fontSize: 12, width: 14 }}>{arrow}</span>
                                <span style={{ flex: 1, fontSize: 12, color: dirColor, fontWeight: 600 }}>{s.name}</span>
                                <div style={{ minWidth: 80, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${s.probability}%`, background: s.probability >= 65 ? '#00ff88' : s.probability >= 55 ? '#f59e0b' : '#6b7a9a' }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 800, color: s.probability >= 65 ? '#00ff88' : s.probability >= 55 ? '#f59e0b' : '#8899bb', fontFamily: fontDisplay, minWidth: 30, textAlign: 'right' as const }}>
                                  {s.probability}%
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Avoid setups */}
                    {f.avoidSetups && f.avoidSetups.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ff4d6d', letterSpacing: 1.5, marginBottom: 4 }}>AVOID TODAY</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                          {f.avoidSetups.map((s: any) => (
                            <div key={s.id} style={{ fontSize: 11, color: '#8899bb', padding: '3px 8px', background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.15)', borderRadius: 3, textDecoration: 'line-through' }}>
                              {s.name}
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7a9a', marginTop: 4, fontStyle: 'italic' as const }}>
                          {f.avoidSetups[0]?.reason}
                        </div>
                      </div>
                    )}

                    {/* Sizing + stop recommendations */}
                    <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 1, fontWeight: 700 }}>SIZING</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: f.sizingRecommendation === 'FULL' ? '#00ff88' : f.sizingRecommendation === 'HALF' ? '#f59e0b' : '#ff4d6d', fontFamily: fontDisplay }}>
                          {f.sizingRecommendation}
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 1, fontWeight: 700 }}>STOP WIDTH</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#b0c4de', fontFamily: fontDisplay }}>
                          {f.stopWidthRecommendation}
                        </div>
                      </div>
                    </div>

                    {/* Expandable signals detail */}
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 11, color: '#6b7a9a', cursor: 'pointer', letterSpacing: 1, fontWeight: 700, padding: '4px 0' }}>
                        8 signals →
                      </summary>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {f.trendSignals.map((s: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, padding: '2px 4px' }}>
                            <span style={{ width: 14, textAlign: 'center' as const, color: s.status === 'SUPPORTS_TREND' ? '#7c6aff' : s.status === 'SUPPORTS_RANGE' ? '#00d4a0' : '#6b7a9a', fontWeight: 800 }}>
                              {s.status === 'SUPPORTS_TREND' ? '↗' : s.status === 'SUPPORTS_RANGE' ? '↔' : '○'}
                            </span>
                            <span style={{ width: 130, fontWeight: 600, color: '#b0c4de' }}>{s.name}</span>
                            <span style={{ flex: 1, color: '#8899bb', fontSize: 11 }}>{s.detail}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )
              })()}

              {/* ── ACTIONABILITY VERDICT — clear filter: ACT vs WATCH vs NOISE ── */}
              {actionability && (
                <div style={{ borderRadius: 10,
                  background: actionability.verdict === 'ACTIONABLE' ? 'linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,212,160,0.08) 100%)' :
                             actionability.verdict === 'WATCH'      ? 'linear-gradient(135deg, rgba(255,183,0,0.12) 0%, rgba(245,158,11,0.06) 100%)' :
                                                                       'linear-gradient(135deg, rgba(255,77,109,0.1) 0%, rgba(120,40,60,0.04) 100%)',
                  border: `2px solid ${actionability.verdict === 'ACTIONABLE' ? 'rgba(0,255,136,0.5)' : actionability.verdict === 'WATCH' ? 'rgba(255,183,0,0.4)' : 'rgba(255,77,109,0.35)'}`,
                  padding: '10px 14px',
                  boxShadow: actionability.verdict === 'ACTIONABLE' ? '0 0 24px rgba(0,255,136,0.18)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 900, letterSpacing: 2,
                        color: actionability.verdict === 'ACTIONABLE' ? '#00ff88' : actionability.verdict === 'WATCH' ? '#ffb700' : '#ff4d6d',
                      }}>
                        {actionability.verdict === 'ACTIONABLE' ? '✓ ACTIONABLE' : actionability.verdict === 'WATCH' ? 'WATCH' : '✕ NOISE'}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#b0c4de', fontWeight: 600 }}>· {actionability.headline}</span>
                    </div>
                    {actionability.setupType !== 'NO_SETUP' && (
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(124,106,255,0.12)', color: '#7c6aff', fontWeight: 700, letterSpacing: 0.5 }}>{actionability.setupType.replace('_', ' ')}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8899bb', marginBottom: 8 }}>{actionability.reasoning}</div>

                  {/* Green lights + Red flags */}
                  {(actionability.greenLights.length > 0 || actionability.redFlags.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: actionability.greenLights.length > 0 && actionability.redFlags.length > 0 ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
                      {actionability.greenLights.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#00ff88', letterSpacing: 1, marginBottom: 4 }}>✓ CONFIRMING ({actionability.greenLights.length})</div>
                          {actionability.greenLights.slice(0, 4).map((g, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#b0c4de', marginBottom: 1, paddingLeft: 6 }}>• {g}</div>
                          ))}
                        </div>
                      )}
                      {actionability.redFlags.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#ff4d6d', letterSpacing: 1, marginBottom: 4 }}>⚠ FLAGS ({actionability.redFlags.length})</div>
                          {actionability.redFlags.slice(0, 4).map((r, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#b0c4de', marginBottom: 1, paddingLeft: 6 }}>• {r}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Triggers (for WATCH) */}
                  {actionability.verdict === 'WATCH' && actionability.triggers.length > 0 && (
                    <div style={{ padding: '6px 9px', borderRadius: 5, background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.18)', marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#ffb700', letterSpacing: 1, marginBottom: 3 }}>TRIGGERS TO WATCH</div>
                      {actionability.triggers.map((t, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: '#f0f4ff', marginBottom: 1 }}>• {t}</div>
                      ))}
                    </div>
                  )}

                  {/* Bottom strip: invalidation + staleness + news */}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7a9a', flexWrap: 'wrap' as const }}>
                    {actionability.invalidationPrice && <span>Invalid below <strong style={{ color: '#ff4d6d', fontFamily: fontDisplay }}>{actionability.invalidationPrice.toFixed(0)}</strong></span>}
                    {actionability.staleness.degraded && <span style={{ color: '#f59e0b' }}>{actionability.staleness.minutesOld}min old</span>}
                    {!actionability.staleness.degraded && <span>Fresh ({actionability.staleness.minutesOld}min)</span>}
                    {actionability.newsRisk.blackout && <span style={{ color: '#ff4d6d' }}>NEWS: {actionability.newsRisk.nextEvent}</span>}
                    {!actionability.liquidityCheck.ok && <span style={{ color: '#f59e0b' }}>{actionability.liquidityCheck.note}</span>}
                  </div>
                </div>
              )}

              {/* ── OPTIMAL TRADE ZONE — gold, always first thing you see ── */}
              <div style={{ borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(255,183,0,0.12) 0%, rgba(255,140,0,0.06) 100%)',
                border: '2px solid rgba(255,183,0,0.7)',
                boxShadow: '0 0 30px rgba(255,183,0,0.2), 0 2px 12px rgba(0,0,0,0.4)',
                padding: '12px 14px', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#ffb700' }}>OPTIMAL TRADE ZONE</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {aiResult && aiResult.signal !== 'WAIT' && aiResult.signal !== 'NO TRADE' && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(255,183,0,0.18)', color: '#ffb700', fontFamily: fontDisplay, letterSpacing: 1 }}>
                        {aiResult.signal === 'LONG' ? '▲ CALL' : '▼ PUT'}
                      </span>
                    )}
                    {aiResult && (aiResult.moveSize as number) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#ffb700', fontFamily: fontDisplay }}>{aiResult.moveSize}pt MOVE</span>
                    )}
                    {aiResult?.confidence && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 48, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${aiResult.confidence}%`, borderRadius: 2,
                            background: aiResult.confidence >= 80 ? '#00ff88' : aiResult.confidence >= 65 ? '#ffb700' : '#ff4d6d' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: aiResult.confidence >= 80 ? '#00ff88' : aiResult.confidence >= 65 ? '#ffb700' : '#ff4d6d' }}>{aiResult.confidence}%</span>
                      </div>
                    )}
                    {(!aiResult || aiResult.signal === 'WAIT' || aiResult.signal === 'NO TRADE') && !(aiResult?.confidence) && (
                      <span style={{ fontSize: 9, color: 'rgba(255,183,0,0.4)', letterSpacing: 1 }}>RUN GET SIGNAL</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                  {[
                    {
                      label: 'BUY ZONE',
                      value: (aiResult && aiResult.entryZone) ? `${(aiResult.entryZone.low||0).toFixed(0)}–${(aiResult.entryZone.high||0).toFixed(0)}` : '—',
                      sub: (aiResult && aiResult.entryZone && aiResult.stopLevel) ? `${Math.abs(((aiResult.entryZone.low+aiResult.entryZone.high)/2) - aiResult.stopLevel).toFixed(0)}pt risk` : 'min 10pt scalp',
                      color: '#00e5ff',
                    },
                    {
                      label: 'STOP',
                      value: (aiResult && aiResult.stopLevel) ? (aiResult.stopLevel as number).toFixed(0) : '—',
                      sub: 'VWAP / 200 EMA',
                      color: '#ff1a4a',
                    },
                    {
                      label: 'TARGET 1',
                      value: (aiResult && aiResult.target1) ? (aiResult.target1 as number).toFixed(0) : '—',
                      sub: (aiResult && aiResult.entryZone && aiResult.target1) ? `+${Math.abs(aiResult.target1 - (aiResult.entryZone.low+aiResult.entryZone.high)/2).toFixed(0)}pts` : '≥10pt scalp',
                      color: '#00ff88',
                    },
                    {
                      label: 'TARGET 2',
                      value: (aiResult && aiResult.target2) ? (aiResult.target2 as number).toFixed(0) : '—',
                      sub: (aiResult && aiResult.entryZone && aiResult.target2) ? `+${Math.abs(aiResult.target2 - (aiResult.entryZone.low+aiResult.entryZone.high)/2).toFixed(0)}pts` : '≥25pt swing',
                      color: '#00d4a0',
                    },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} style={{
                      background: value === '—' ? 'rgba(255,183,0,0.08)' : color + '15',
                      border: value === '—' ? '1px solid rgba(255,183,0,0.35)' : `1px solid ${color}50`,
                      borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: value === '—' ? '#ffb700' : '#8899bb', letterSpacing: 1, marginBottom: 5, fontWeight: 600 }}>{label}</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900,
                        color: value === '—' ? 'rgba(255,183,0,0.35)' : color }}>{value}</div>
                      <div style={{ fontSize: 10, color: value === '—' ? 'rgba(255,183,0,0.3)' : '#6b7a9a', marginTop: 3 }}>{sub}</div>
                    </div>
                  ))}
                </div>
                {aiResult && aiResult.riskFlag && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#ffb700', padding: '5px 8px',
                    background: 'rgba(255,183,0,0.06)', borderRadius: 5, borderLeft: '2px solid rgba(255,183,0,0.4)' }}>
                    ⚠ {aiResult.riskFlag}
                  </div>
                )}
              </div>

              {/* Manual Signal Trigger */}
              {!aiResult && !aiLoading && (
                <div style={{ background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.25)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#00d4a0', letterSpacing: 1, marginBottom: 3 }}>AI Signal Ready</div>
                    <div style={{ fontSize: 11.5, color: '#6b7a9a', lineHeight: 1.5 }}>Tap to get LONG / SHORT / WAIT with entry, stop & targets</div>
                  </div>
                  <button id="tz-get-signal-main" onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(), fetchOptionsFlow(), fetchMarketTide(), fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    let result = await runSignal(buildSignalInput({ flow, tide, intel: intel, tiingo: tiingo2 }))
                    // Stamp current price so companion knows price at signal time
                    if (result) result = { ...result, currentPrice }
                    if (result) {
                      // ── Signal Quality Gate ─────────────────────────────
                      const quality = scoreSignalQuality({
    streamWeights: streamWeights || null,
                        signal:        result.signal as any,
                        confidence:    result.confidence || 0,
                        currentPrice,
                        vixPrice,
                        microstructure: microstructure as any,
                        breadthData:   breadthData as any,
                        gexData:       gexData as any,
                        morningBias:   morningPlan?.bias || null,
                        patternBias:   patternAnalysis?.structureSummary || null,
                        economicCalendar,
                      })
                      setSignalQuality(quality)

                      // If quality gate blocks — downgrade to WAIT
                      if (!quality.approved && (result.signal === 'LONG' || result.signal === 'SHORT')) {
                        result = {
                          ...result,
                          signal:        'WAIT',
                          confidence:    quality.finalConfidence,
                          waitReason:    `Quality gate blocked: ${quality.verdictReason}`,
                          accountability: `Signal blocked — ${quality.contradictors[0] || quality.blockers[0] || 'insufficient confirmation'}`,
                        }
                      } else {
                        result = { ...result, confidence: quality.finalConfidence }
                      }

                      setAiResult(result); setAdversarial(null)
                      setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))
                      const confWord = quality.finalConfidence >= 80 ? 'high confidence' : quality.finalConfidence >= 65 ? 'moderate confidence' : 'low confidence'
                      setTimeout(() => { speak(`${result.signal}. ${quality.finalConfidence}% ${confWord}. ${result.accountability || result.riskFlag || result.marketConditions?.split('.')[0] || ''}`) }, 400)
                      // ── Log alert to Supabase — server agent scores at 30/60/120min ──
                      // Log EVERY signal, including WAIT/NO-TRADE without an entry
                      // zone. WAIT is a prediction too — the most common one — and
                      // gating on entryZone silently dropped all of them, leaving
                      // the flagship signal engine with zero measurable track record
                      // while the shadow stream (which logs its WAITs) has 1,400 rows.
                      // Synthetic levels for WAITs let the scorer grade "was standing
                      // aside correct?" the same way the shadow engine does.
                      if (result.signal === 'LONG' || result.signal === 'SHORT' || result.signal === 'WAIT' || result.signal === 'NO TRADE') {
                        const px = currentPrice || 0
                        const isDirectional = (result.signal === 'LONG' || result.signal === 'SHORT') && result.entryZone
                        const fallbackT1 = result.signal === 'SHORT' ? px - 10 : px + 10
                        const fallbackStop = result.signal === 'SHORT' ? px + 10 : px - 10
                        fetch('/api/trade-alerts', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            signal:               result.signal,
                            entryZone:            result.entryZone || { low: px, high: px },
                            stopLevel:            result.stopLevel ?? fallbackStop,
                            target1:              result.target1 ?? fallbackT1,
                            target2:              result.target2 || ((result.target1 ?? fallbackT1) + 20),
                            no_entry_zone:        !isDirectional,   // flags synthetic levels                            currentPrice:         px,
                            vwap:                 levels?.spyVwap || null,
                            ema200:               levels?.ema200 || null,
                            vix:                  vixPrice,
                            confidence:           result.confidence || 0,
                            moveSize:             result.moveSize || 0,
                            proximityLevel:       levelProximity?.level,
                            proximityBreakoutPct: levelProximity?.breakoutPct,
                            proximityFactors:     levelProximity?.factors,
                            // AI perspective fields (new)
                            ai_view:              result.aiView || null,
                            system_alignment:     result.systemAlignment || null,
                            system_alignment_note: result.systemAlignmentNote || null,
                            wait_reason:          result.waitReason || null,
                            // Full context snapshot for learning
                            context_snapshot: (() => { try { return JSON.stringify({
                              // flow-ablation audit: was UW context present?
                              hadFlow: !!(flow && !(flow as any).error), flowStale: !!(flow as any)?._stale,
                              hadTide: !!(tide && !(tide as any).error), tideStale: !!(tide as any)?._stale,
                              marketConditions:  result.marketConditions,
                              todaysEdge:        result.todaysEdge,
                              riskFlag:          result.riskFlag,
                              patternSummary:    patternAnalysis?.structureSummary || null,
                              microSummary:      microstructure?.summary || null,
                              deltaBias:         microstructure?.cumulativeDelta?.strength || null,
                              optionsBias:       microstructure?.optionsImbalance?.bias || null,
                              darkPoolBias:      microstructure?.darkPool?.netBias || null,
                              vixRegime:         vixPrice ? (vixPrice < 14 ? 'Low' : vixPrice < 20 ? 'Normal' : vixPrice < 28 ? 'Elevated' : 'High') : null,
                              morningBias:       morningPlan?.bias || null,
                              fibsNear:          patternAnalysis?.fibGrids?.[0]?.nearestLevel?.label || null,
                              sweepCount:        microstructure?.optionsImbalance?.sweepCount || 0,
                              qualityScore:      quality ? quality.confirmationPct : null,
                              qualityVerdict:    quality ? quality.verdict : null,
                              confirmers:        quality ? quality.confirmers.join('|') : null,
                              contradictors:     quality ? quality.contradictors.join('|') : null,
                              streamVotes:       quality?.streamBreakdown ? JSON.stringify(quality.streamBreakdown.map((s: any) => ({ n: s.name, v: s.vote }))) : null,
                              // ── Market Intelligence (for long-term weight learning) ──
                              vix1d:             marketIntel2?.termStructure?.vix1d || null,
                              vix30:             marketIntel2?.termStructure?.vix30 || null,
                              termShape:         marketIntel2?.termStructure?.termShape || null,
                              impliedMoveToday:  marketIntel2?.termStructure?.impliedMoveToday || null,
                              vwapBandPos:       marketIntel2?.vwapBands?.bandPosition || null,
                              vwapIsExtended:    marketIntel2?.vwapBands?.isExtended || false,
                              vwapIsMeanRevert:  marketIntel2?.vwapBands?.isMeanRevertZone || false,
                              vwapStdDev:        marketIntel2?.vwapBands?.stdDev || null,
                              ivRvSpread:        marketIntel2?.volSpread?.spread || null,
                              optionsCheap:      marketIntel2?.volSpread?.spread !== null && marketIntel2?.volSpread?.spread < -3,
                              optionsExpensive:  marketIntel2?.volSpread?.spread !== null && marketIntel2?.volSpread?.spread > 5,
                              sectorRotation:    marketIntel2?.sectorRotation?.rotationSignal || null,
                              sectorBias:        marketIntel2?.sectorRotation?.rotationBias || null,
                              sectorsAdvancing:  marketIntel2?.sectorRotation?.advancers || null,
                              sessionName:       marketIntel2?.timeContext?.currentSession || null,
                              sessionBias:       marketIntel2?.timeContext?.sessionBias || null,
                              thetaUrgency:      marketIntel2?.timeContext?.thetaUrgency || null,
                              minsLeftSession:   marketIntel2?.timeContext?.minsLeft || null,
                              preMarketConviction: marketIntel2?.preMarket?.volConviction || null,
                              // ── Daily technical state at signal time ──
                              dailyTrend:        multiTFData?.daily?.trend || null,
                              dailyRsi:          multiTFData?.daily?.rsi || null,
                              dailyStructure:    multiTFData?.daily?.structure || null,
                              pctFrom200ema:     multiTFData?.daily?.pctFromEMA200 || null,
                              weeklyTrend:       multiTFData?.weekly?.trend || null,
                              weeklyRsi:         multiTFData?.weekly?.rsi || null,
                              candlePatterns:    multiTFData?.patterns?.map((p: any) => p.name).join('|') || null,

                              // ── Multi-TF intraday structure ──
                              m15Trend:          multiTFData?.m15?.trend || null,
                              m15RangePct:       multiTFData?.m15?.rangePct || null,
                              h1Trend:           multiTFData?.h1?.trend || null,
                              h1AboveEma:        multiTFData?.h1?.aboveEma || null,

                              // ── Cross-asset ──
                              crossAssetBias:    multiTFData?.crossAsset?.confirmation || null,
                              dxy5d:             multiTFData?.crossAsset?.dxy5d || null,
                              tlt5d:             multiTFData?.crossAsset?.tlt5d || null,

                              // ── UW data ──
                              uwIvRank:          marketIntel2?.uwIV?.ivRank || null,
                              uwIvPercentile:    marketIntel2?.uwIV?.ivPercentile || null,
                              uwPutCallRatio:    marketIntel2?.uwIV?.putCallRatio || null,
                              spotGexCallWall:   marketIntel2?.spotGex?.callWall || null,
                              spotGexPutWall:    marketIntel2?.spotGex?.putWall || null,
                              economicBias:      marketIntel2?.econSurprise?.bias || null,

                              // ── Volume profile ──
                              poc:               volumeProfile?.poc || null,
                              vah:               volumeProfile?.vah || null,
                              val:               volumeProfile?.val || null,
                              valueAreaPct:      volumeProfile?.valueAreaPct || null,

                              // ── GEX / dealer mechanics ──
                              gammaFlip:         gexData?.gammaFlip || null,
                              callWall:          gexData?.callWall || null,
                              putWall:           gexData?.putWall || null,
                              netGex:            gexData?.netGex || null,
                              gexRegime:         gexData?.regime || null,
                              dexBias:           gexData?.dexBias || null,
                              charmUrgency:      gexData?.charmUrgency || null,
                              charmDollar:       gexData?.charmDollar || null,

                              // ── Mechanical flow analysis (NEW) ──
                              mechanicalBias:    mechanicalFlow?.mechanicalBias || null,
                              mechanicalScore:   mechanicalFlow?.mechanicalScore || null,
                              asymmetricSetup:   mechanicalFlow?.asymmetricSetup || null,
                              hedgingDirection:  mechanicalFlow?.hedgingDirection || null,
                              hedgingForce:      mechanicalFlow?.hedgingForce || null,
                              hedgingFlowRemaining: mechanicalFlow?.hedgingFlowRemaining || null,
                              charmIntensity:    mechanicalFlow?.charmIntensity || null,
                              charmDirection:    mechanicalFlow?.charmDirection || null,

                              // ── Actionability classification (NEW) ──
                              actionabilityVerdict: actionability?.verdict || null,
                              setupType:            actionability?.setupType || null,
                              invalidationPrice:    actionability?.invalidationPrice || null,
                              greenLightsCount:     actionability?.greenLights?.length || 0,
                              redFlagsCount:        actionability?.redFlags?.length || 0,
                              greenLights:          actionability?.greenLights?.join('|') || null,
                              redFlags:             actionability?.redFlags?.join('|') || null,
                              signalStaleness:      actionability?.staleness?.minutesOld || 0,
                              newsBlackout:         actionability?.newsRisk?.blackout || false,
                              liquidityOk:          actionability?.liquidityCheck?.ok || true,

                              // ── Signal output fields (NEW from schema upgrade) ──
                              multiTFAlignment:  result.multiTFAlignment || null,
                              ivContextSignal:   result.ivContext || null,
                              sizingNote:        result.sizingNote || null,

                              // ── Named setup the trader was evaluating ──
                              setupName:         setupEval?.setup?.name || null,
                              setupId:           setupEval?.setup?.id || null,
                              setupDirection:    setupEval?.setup?.direction || null,
                              setupScore:        setupEval?.score || null,
                              setupRating:       setupEval?.rating || null,
                              setupConfirming:   setupEval?.confirmingCount || null,
                              setupContradicting: setupEval?.contradictingCount || null,
                              // ── Day Type regime at signal time ──
                              dayType:           dayTypeForecast?.dayType || null,
                              dayTypeConfidence: dayTypeForecast?.confidence || null,
                              dayTrendProb:      dayTypeForecast?.trendProbability || null,
                              dayRangeProb:      dayTypeForecast?.consolidationProbability || null,
                              dayDirectionalLean: dayTypeForecast?.directionalLean || null,
                              dayRecommendedSizing: dayTypeForecast?.sizingRecommendation || null,
                              // Was the trader's setup aligned with the day-type recommendation?
                              setupAlignsWithDayType: (() => {
                                if (!setupEval || !dayTypeForecast) return null
                                const rec = (dayTypeForecast.recommendedSetups || []).find((s: any) => s.id === setupEval.setup.id)
                                return rec ? true : false
                              })(),
                            }) } catch(e) { return null } })(),
                          })
                        })
                        .then(r => r.json())
                        .then(d => {
                          if (d.needsMigration) {
                            fetch('/api/trade-alerts/migrate').catch(() => {})
                          } else if (d.error) {
                            console.error('[TradeAlertAgent] INSERT FAILED:', JSON.stringify(d))
                          } else {
                            console.log('[TradeAlertAgent] Logged:', d.id)
                            // Show outcome capture modal 30s after signal
                            if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current)
                            outcomeTimerRef.current = setTimeout(() => {
                              if ((result.signal === 'LONG' || result.signal === 'SHORT') && result.entryZone && result.stopLevel && result.target1) {
                                setOutcomeModal({
                                  alertId:   d.id,
                                  signal:    result.signal as 'LONG' | 'SHORT',
                                  entryLow:  result.entryZone.low,
                                  entryHigh: result.entryZone.high,
                                  stopLevel: result.stopLevel,
                                  target1:   result.target1,
                                  target2:   result.target2 || result.target1 + 20,
                                })
                              }
                            }, 30000)  // 30 seconds
                          }
                        })
                        .catch(e => console.warn('[TradeAlertAgent] Log failed (non-critical):', e.message))
                      }
                    }
                    setAiLoading(false)
                  }} style={{ fontFamily: font, fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 6, background: 'rgba(0,212,160,0.12)', border: '1px solid rgba(0,212,160,0.4)', color: '#00d4a0', cursor: 'pointer', letterSpacing: 0.5, whiteSpace: 'nowrap' as const }}>
                    ▶ Get Signal
                  </button>
                </div>
              )}
              {aiLoading && (
                <div style={{ background: 'rgba(0,212,160,0.04)', border: '1px solid rgba(0,212,160,0.15)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 4 }}>{[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4a0', animation: `pulse 1s ${i*0.15}s infinite` }} />)}</div>
                  <div style={{ fontSize: 12, color: '#00d4a0', fontWeight: 600 }}>Analyzing market conditions...</div>
                </div>
              )}

              {/* Signal Hero */}
              <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 6, padding: 18, paddingTop: 22, position: 'relative', overflow: 'visible', boxShadow: '0 0 0 1px rgba(0,229,255,0.08) inset, 0 4px 24px rgba(0,0,0,0.4)', borderTop: '2px solid #00d4a0' }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle, rgba(0,212,160,0.07) 0%, transparent 60%)', animation: 'coreGlow 4s ease-in-out infinite', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 800, letterSpacing: 2, color: '#00d4a0', opacity: 0.85 }}>AI VIEW</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: '#7d8db0', border: '1px solid rgba(125,141,176,0.3)', borderRadius: 3, padding: '1px 6px' }}>COMPARISON ARM</span>
                    </div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 56, fontWeight: 900, color: signalColor, letterSpacing: '4px', textShadow: `0 0 40px ${signalColor}99, 0 0 80px ${signalColor}33`, lineHeight: 1 }}>{aiResult?.signal || (aiLoading ? '···' : 'WAIT')}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{aiResult?.marketConditions?.split('.')[0] || 'Analyzing market conditions...'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 900, color: signalColor, opacity: 0.8, letterSpacing: '-1px' }}>{aiResult?.confidence || 0}<span style={{ fontSize: 18 }}>%</span></div>
                      {signalQuality && (
                        <div style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
                          letterSpacing: '1px', textTransform: 'uppercase' as const,
                          background: signalQuality.verdict === 'STRONG'    ? 'rgba(0,255,136,0.12)' :
                                      signalQuality.verdict === 'CONFIRMED' ? 'rgba(0,229,255,0.08)' :
                                      signalQuality.verdict === 'MARGINAL'  ? 'rgba(255,183,0,0.1)'  :
                                      signalQuality.verdict === 'CONFLICTED'? 'rgba(255,107,0,0.1)'  :
                                                                              'rgba(255,26,74,0.12)',
                          color: signalQuality.verdict === 'STRONG'    ? '#00ff88' :
                                 signalQuality.verdict === 'CONFIRMED'  ? '#00e5ff' :
                                 signalQuality.verdict === 'MARGINAL'   ? '#ffb700' :
                                 signalQuality.verdict === 'CONFLICTED' ? '#ff6b00' :
                                                                          '#ff1a4a',
                          border: `1px solid ${
                            signalQuality.verdict === 'STRONG'    ? 'rgba(0,255,136,0.3)' :
                            signalQuality.verdict === 'CONFIRMED' ? 'rgba(0,229,255,0.2)' :
                            signalQuality.verdict === 'MARGINAL'  ? 'rgba(255,183,0,0.3)' :
                                                                    'rgba(255,26,74,0.3)'
                          }`,
                        }}>
                          {signalQuality.verdict} {signalQuality.confirmers.length}/{signalQuality.totalVoters}
                        </div>
                      )}
                    </div>
                    {/* Stream breakdown visualization */}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#4a5568', letterSpacing: '1px', textTransform: 'uppercase' as const, marginBottom: 6 }}>
                        Stream Votes · {signalQuality?.streamBreakdown?.length || 0} streams · {signalQuality?.confirmers?.length || 0} confirm · {signalQuality?.contradictors?.length || 0} contra
                      </div>
                      {(signalQuality?.streamBreakdown || []).length > 0
                        ? (signalQuality.streamBreakdown as any[]).map((s: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: '#6b7a9a', width: 80, flexShrink: 0 }}>{s.name}</span>
                            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                              {s.vote !== 0 && (
                                <div style={{ height: '100%', width: `${s.weight}%`, background: s.vote === 1 ? '#00d4a0' : '#ff4d6d', borderRadius: 2 }} />
                              )}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: s.vote === 1 ? '#00d4a0' : s.vote === -1 ? '#ff4d6d' : '#4a5568', width: 12, textAlign: 'center' as const }}>
                              {s.vote === 1 ? '✓' : s.vote === -1 ? '✗' : '–'}
                            </span>
                            <span style={{ fontSize: 10, color: '#4a5568', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.detail}</span>
                          </div>
                        ))
                        : <div style={{ fontSize: 11, color: '#4a5568' }}>Fire a signal to see stream votes</div>
                      }
                    </div>
                    <div style={{ fontSize: 9, color: C.textMuted }}>AI confidence</div>
                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(), fetchOptionsFlow(), fetchMarketTide(), fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runSignal(buildSignalInput({ flow, tide, intel: intel, tiingo: tiingo2 }))
                    if (result) {
                      setAiResult(result); setAdversarial(null)
                      setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))
                      setTimeout(() => { speak(`${result.signal}. ${result.confidence}% confidence. ${result.accountability || result.riskFlag || result.marketConditions?.split('.')[0] || ''}`) }, 400)
                    }
                    setAiLoading(false)
                  }} style={{ fontFamily: font, fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(0,212,160,0.2)', color: '#6b7a9a', cursor: 'pointer', marginTop: 4, display: 'block' }}>↻ refresh</button>
                  </div>
                </div>
                {/* Probability bars */}
                {(() => {
                  const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext, historicalStats: historicalGapStats })
                  return (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      {[
                        { label: 'Reversal', value: probs.reversal, color: C.red },
                        { label: 'Continuation', value: probs.continuation, color: C.synapse },
                        { label: 'Chop', value: probs.chop, color: C.fire },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                          <span style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', width: 88 }}>{label}</span>
                          <div style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease', boxShadow: `0 0 4px ${color}40` }} />
                          </div>
                          <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color, width: 32 }}>{value}%</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Stat chips — redesigned for readability */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, flexShrink: 0 }}>
                {[
                  { label: 'SPX vs VWAP', value: currentPrice && effectiveVwap ? (currentPrice > effectiveVwap ? 'ABOVE' : 'BELOW') : '—', icon: currentPrice && effectiveVwap ? (currentPrice > effectiveVwap ? '▲' : '▼') : '', sub: `${fmt(currentPrice)} vs ${fmt(effectiveVwap)}`, color: currentPrice && effectiveVwap ? (currentPrice > effectiveVwap ? C.synapse : C.red) : C.textMuted },
                  { label: 'VIX Level', value: vixPrice ? (vixPrice > 25 ? 'HIGH' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL') : '—', icon: vixPrice && vixPrice > 18 ? '⚠' : '', sub: vixPrice ? `${vixPrice.toFixed(2)}` : 'Loading...', color: vixPrice ? (vixPrice > 25 ? C.red : vixPrice > 18 ? C.fire : C.synapse) : C.textMuted },
                  { label: 'Market Tide', value: marketTide ? (marketTide.bias === 'CALL HEAVY (bullish)' ? 'BULLISH' : marketTide.bias === 'PUT HEAVY (bearish)' ? 'BEARISH' : 'BALANCED') : '—', icon: '', sub: marketTide ? `P/C ${marketTide.putCallRatio}` : 'Loading...', color: marketTide?.bias?.includes('CALL') ? C.synapse : marketTide?.bias?.includes('PUT') ? C.red : C.teal },
                  { label: 'Sector Breadth', value: marketIntel?.breadth?.bias || '—', icon: '', sub: marketIntel?.breadth ? `${marketIntel.breadth.advancing}↑ ${marketIntel.breadth.declining}↓ of 8` : 'Loading...', color: marketIntel?.breadth?.advancing >= 6 ? C.synapse : marketIntel?.breadth?.declining >= 6 ? C.red : C.fire },
                  { label: 'Pre-Trade Score', value: `${grade}`, icon: `${score}/13`, sub: score >= 9 ? 'Ready to trade' : score >= 7 ? 'Caution' : 'Stay out', color: gradeColor },
                  { label: 'Today P&L', value: `${todayPnL >= 0 ? '+' : ''}$${todayPnL.toFixed(0)}`, icon: '', sub: `${trades.filter((t: any) => t.date === new Date().toISOString().split('T')[0]).length} trades today`, color: todayPnL >= 0 ? C.synapse : C.red },
                ].map(({ label, value, icon, sub, color }) => {
                  const isLive = value !== '—' && !value.includes('Loading')
                  const chipBg = isLive ? color + '12' : 'rgba(12,15,26,0.95)'
                  const chipBorder = isLive ? color + '30' : 'rgba(0,229,255,0.08)'
                  return (
                    <div key={label} style={{ background: chipBg, border: `1px solid ${chipBorder}`, borderRadius: 7, padding: '11px 13px', position: 'relative', overflow: 'hidden' }}>
                      {isLive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${color}90, transparent)` }} />}
                      <div style={{ fontSize: 10, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6, fontWeight: 700 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <div style={{ fontFamily: fontDisplay, fontSize: isLive ? 16 : 14, fontWeight: 900, color: isLive ? color : '#4a5568', lineHeight: 1 }}>{value}</div>
                        {icon && <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color, opacity: 0.8 }}>{icon}</div>}
                      </div>
                      <div style={{ fontSize: 11, color: isLive ? '#6b7a9a' : '#3a4455', marginTop: 4, lineHeight: 1.3 }}>{sub}</div>
                    </div>
                  )
                })}
              </div>

              {/* Options flow + market conditions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
                {/* Options Flow mini */}
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: 10, boxShadow: '0 0 0 1px rgba(0,229,255,0.08) inset', borderLeft: '2px solid #00e5ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.synapse, animation: 'pulse 2s infinite' }} />
                    <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.synapse, letterSpacing: '1px', textTransform: 'uppercase' }}>Options Flow</span>
                    {optionsFlow.length > 0 && <span style={{ fontSize: 9, color: C.textMuted }}>{optionsFlow.length} alerts</span>}
                  </div>
                  {optionsFlow.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', padding: '8px 0' }}>{keys[UW_KEY] ? 'No flow alerts' : 'Add UW key in Settings'}</div>
                  ) : optionsFlow.slice(0, 4).map((f: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 50 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color: (f.type||'').startsWith('c') ? '#00ff88' : '#ff1a4a' }}>{(f.ticker||'').toUpperCase()}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: (f.type||'').startsWith('c') ? '#00ff88' : '#ff1a4a', opacity: 0.8 }}>{(f.type||'').startsWith('c') ? 'C' : 'P'}</span>
                      </div>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, color: '#8899bb', width: 38 }}>${f.strike}</span>
                      <span style={{ fontSize: 10, color: '#6b7a9a', flex: 1 }}>{f.expiry||''}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: '#00e5ff' }}>{f.premium||''}</span>
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: f.sentiment==='BULLISH'?'rgba(0,255,136,0.12)':f.sentiment==='BEARISH'?'rgba(255,26,74,0.10)':'rgba(0,229,255,0.06)', color: f.sentiment==='BULLISH'?'#00ff88':f.sentiment==='BEARISH'?'#ff1a4a':'#8899bb', fontWeight: 700, letterSpacing: '0.5px' }}>{(f.sentiment||'NEUT').substring(0,4)}</span>
                      {f.unusual && <span style={{ fontSize: 10, fontWeight: 800, color: '#ff6b00', padding: '1px 4px', border: '1px solid #ff6b0044', borderRadius: 2, letterSpacing: 0.5 }}>SWP</span>}
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 9, color: C.teal, cursor: 'pointer' }} onClick={() => setTab('deepdive')}>→ Full flow in Deep Dive</div>
                </div>

                {/* Market conditions mini */}
                <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 12px', border: '1px solid rgba(0,229,255,0.10)', borderLeft: '2px solid #00d4a0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4a0', boxShadow: '0 0 6px rgba(0,212,160,0.6)', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: '#00d4a0', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Market Conditions</span>
                  </div>
                  {[
                    { label: 'VIX', value: vixPrice ? vixPrice.toFixed(2) : '—', pct: vixPrice ? Math.min((vixPrice/40)*100, 100) : 0, color: vixPrice ? (vixPrice > 25 ? C.red : vixPrice > 18 ? C.fire : C.synapse) : C.textMuted },
                    { label: 'QQQ', value: marketIntel?.sectors?.QQQ ? `${Number(marketIntel.sectors.QQQ.todayChange)>=0?'+':''}${marketIntel.sectors.QQQ.todayChange}%` : '—', pct: marketIntel?.sectors?.QQQ ? Math.min(Math.abs(Number(marketIntel.sectors.QQQ.todayChange))/3*100,100) : 0, color: Number(marketIntel?.sectors?.QQQ?.todayChange)>=0 ? C.synapse : C.red },
                    { label: 'XLK', value: marketIntel?.sectors?.XLK ? `${Number(marketIntel.sectors.XLK.todayChange)>=0?'+':''}${marketIntel.sectors.XLK.todayChange}%` : '—', pct: marketIntel?.sectors?.XLK ? Math.min(Math.abs(Number(marketIntel.sectors.XLK.todayChange))/3*100,100) : 0, color: Number(marketIntel?.sectors?.XLK?.todayChange)>=0 ? C.synapse : C.red },
                    { label: 'XLF', value: marketIntel?.sectors?.XLF ? `${Number(marketIntel.sectors.XLF.todayChange)>=0?'+':''}${marketIntel.sectors.XLF.todayChange}%` : '—', pct: marketIntel?.sectors?.XLF ? Math.min(Math.abs(Number(marketIntel.sectors.XLF.todayChange))/3*100,100) : 0, color: Number(marketIntel?.sectors?.XLF?.todayChange)>=0 ? C.synapse : C.red },
                    { label: 'TLT', value: marketIntel?.sectors?.TLT ? `${Number(marketIntel.sectors.TLT.todayChange)>=0?'+':''}${marketIntel.sectors.TLT.todayChange}%` : '—', pct: marketIntel?.sectors?.TLT ? Math.min(Math.abs(Number(marketIntel.sectors.TLT.todayChange))/3*100,100) : 0, color: Number(marketIntel?.sectors?.TLT?.todayChange)>=0 ? C.synapse : C.red },
                  ].map(({ label, value, pct, color }: any) => (
                    <div key={label} style={{ padding: '5px 0', borderBottom: '1px solid rgba(0,229,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: '#8899bb', fontWeight: 700 }}>{label}</span>
                        <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</span>
                      </div>
                      {pct > 0 && <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}><div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 1, transition: 'width 0.5s' }} /></div>}
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 9, color: C.teal, cursor: 'pointer' }} onClick={() => setTab('deepdive')}>→ Full chart in Deep Dive</div>
                </div>
              </div>

              {/* AI insights */}
              {aiResult?.todaysEdge && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: 12, boxShadow: '0 0 0 1px rgba(255,107,0,0.08) inset', borderLeft: '2px solid #ff6b00' }}>
                  <div style={{ fontSize: 11, color: '#00e5ff', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Today's Edge</div>
                  <div style={{ fontSize: 13, color: '#e8f0ff', lineHeight: 1.7 }}>{aiResult.todaysEdge}</div>
                  {aiResult.riskFlag && <div style={{ marginTop: 10, fontSize: 12, color: '#ffb3c0', padding: '8px 10px', background: 'rgba(255,26,74,0.06)', borderRadius: 5, border: '1px solid rgba(255,26,74,0.2)', lineHeight: 1.6 }}>⚠ {aiResult.riskFlag}</div>}
                </div>
              )}

              {/* Composite Market Score */}
              {marketScore && (
                <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '14px 16px', border: `1px solid ${marketScore.color}20`, borderLeft: `3px solid ${marketScore.color}`, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, ${marketScore.color}60, transparent)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 4 }}>MARKET SCORE</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: marketScore.color, letterSpacing: '2px', textShadow: `0 0 16px ${marketScore.color}60` }}>{marketScore.label}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 900, color: marketScore.color, lineHeight: 1, textShadow: `0 0 24px ${marketScore.color}80` }}>{marketScore.score}</div>
                      <div style={{ fontSize: 11, color: '#6b7a9a', marginTop: 2 }}>/ 100</div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${marketScore.score}%`, background: `linear-gradient(90deg, ${marketScore.color}, ${marketScore.color}aa)`, borderRadius: 2, transition: 'width 0.8s ease', boxShadow: `0 0 8px ${marketScore.color}60` }} />
                  </div>
                </div>
              )}

              {/* Earnings Calendar */}
              {earningsCalendar.length > 0 && (
                <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 14px', border: '1px solid rgba(255,183,0,0.15)', borderLeft: '3px solid #ffb700', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: '#ffb700' }}>📅</span>
                    <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: '#ffb700', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Earnings This Week</span>
                    <span style={{ fontSize: 9, color: '#6b7a9a', marginLeft: 'auto' }}>{earningsCalendar.reduce((a, d) => a + d.earnings.length, 0)} reports</span>
                  </div>
                  {earningsCalendar.map((day: any) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0]
                    const isTomorrow = day.date === new Date(Date.now()+86400000).toISOString().split('T')[0]
                    const label = isToday ? 'TODAY' : isTomorrow ? 'TOMORROW' : new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    return (
                      <div key={day.date} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: isToday ? '#ffb700' : isTomorrow ? '#00e5ff' : '#6b7a9a', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {day.earnings.map((e: any) => (
                            <div key={e.symbol} style={{ display: 'flex', alignItems: 'center', gap: 4, background: e.isSP500 ? 'rgba(255,183,0,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${e.isSP500 ? 'rgba(255,183,0,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 4, padding: '3px 7px' }}>
                              <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 700, color: e.isSP500 ? '#f0f4ff' : '#8899bb' }}>{e.symbol}</span>
                              <span style={{ fontSize: 9, color: e.time === 'BMO' ? '#00ff88' : '#ff9900', fontWeight: 600 }}>{e.time}</span>
                              {e.epsEst && <span style={{ fontSize: 9, color: '#6b7a9a' }}>{e.epsEst}</span>}
                              {e.expectedMove && <span style={{ fontSize: 9, color: '#00e5ff' }}>±{e.expectedMove}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* News + Calendar */}
              {(marketNews || economicCalendar) && (
                <div style={{ display: 'grid', gridTemplateColumns: economicCalendar && marketNews ? '1fr 1fr' : '1fr', gap: 10, flexShrink: 0 }}>
                  {marketNews && (
                    <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 14px', border: '1px solid rgba(0,229,255,0.12)', borderLeft: '2px solid #00e5ff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '1.5px' }}>TODAY'S NEWS</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#d0d8f0', lineHeight: 1.7, whiteSpace: 'pre-line', maxHeight: 160, overflowY: 'auto' }}>
                        {(marketNews || '').replace(/^(Based on [^\n]+\n|Here are[^\n]+\n|Search results[^\n]+\n)/i, '').trim()}
                      </div>
                    </div>
                  )}
                  {economicCalendar && (
                    <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 14px', border: '1px solid rgba(255,107,0,0.12)', borderLeft: '2px solid #ff6b00' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: '#ff6b00', letterSpacing: '1.5px' }}>ECONOMIC CALENDAR</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#d0d8f0', lineHeight: 1.7, whiteSpace: 'pre-line', maxHeight: 160, overflowY: 'auto' }}>
                        {(economicCalendar || '').replace(/^(Based on [^\n]+\n|Here are[^\n]+\n|Search results[^\n]+\n)/i, '').trim()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Multi-TF + Macro */}
              {(multiTFData || macroRegime) && (
                <div style={{ display: 'grid', gridTemplateColumns: multiTFData && macroRegime ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {multiTFData && (
                    <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 12px', borderLeft: '2px solid #00d4a0' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 8 }}>MULTI-TIMEFRAME</div>
                      {[{label:'Weekly', value: multiTFData.weekly.trend, sub: `MA20: ${multiTFData.weekly.ma20}`, color: multiTFData.weekly.trend==='BULLISH'?C.synapse:C.red},{label:'Daily', value: multiTFData.daily.trend, sub: `MA5: ${multiTFData.daily.ma5}`, color: multiTFData.daily.trend==='BULLISH'?C.synapse:C.red}].map(({label,value,sub,color}) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                          <span style={{ fontSize: 11.5, color: C.textDim }}>{label}</span>
                          <div><span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 700, color }}>{value}</span><span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>{sub}</span></div>
                        </div>
                      ))}
                      <div style={{ marginTop: 6, fontSize: 11, color: multiTFData.aligned ? C.synapse : C.fire, fontWeight: 700 }}>{multiTFData.aligned ? '✓' : '⚠'} {multiTFData.confluence}</div>
                    </div>
                  )}
                  {macroRegime && (
                    <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 8, padding: '10px 12px', boxShadow: '0 2px 10px rgba(0,170,85,0.07)', borderLeft: `3px solid ${macroRegime.regime==='RISK-ON'?C.synapse:macroRegime.regime==='RISK-OFF'?C.red:C.fire}` }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: '1px', marginBottom: 6 }}>🌍 MACRO REGIME</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color: macroRegime.regime==='RISK-ON'?C.synapse:macroRegime.regime==='RISK-OFF'?C.red:C.fire, marginBottom: 4 }}>{macroRegime.regime}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Fed: <span style={{ color: C.text, fontWeight: 700 }}>{macroRegime.fedStance} ({macroRegime.rateLevel})</span></div>
                      <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5 }}>{macroRegime.regimeSummary}</div>
                    </div>
                  )}
                </div>
              )}

              {/* 0DTE Skew */}
              {zeroDTESkew && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 14px', borderLeft: '2px solid #00e5ff' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 6 }}>SPX 0DTE SKEW</div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: zeroDTESkew.callPct>55?C.synapse:zeroDTESkew.callPct<45?C.red:C.fire, marginBottom: 8 }}>{zeroDTESkew.skewLabel}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{label:'CALLS',value:`${zeroDTESkew.callPct}%`,sub:zeroDTESkew.callPremium,color:C.synapse},{label:'PUTS',value:`${zeroDTESkew.putPct}%`,sub:zeroDTESkew.putPremium,color:C.red},{label:'P/C',value:zeroDTESkew.pcRatio,sub:'ratio',color:C.textDim}].map(({label,value,sub,color}) => (
                      <div key={label} style={{ flex: 1, background: color+'0a', border: `1px solid ${color}20`, borderRadius: 5, padding: '5px 7px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: 9, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 as const, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Patterns */}
              {tradePatterns && tradePatterns.avgWinnerSize > 0 && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 14px', borderLeft: '2px solid #00d4a0' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 8 }}>YOUR PATTERNS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                    {[{label:'Best hour',value:tradePatterns.bestHour,color:C.synapse},{label:'Worst hour',value:tradePatterns.worstHour,color:C.red},{label:'Avg winner',value:`$${tradePatterns.avgWinnerSize}`,color:C.synapse},{label:'Avg loser',value:`$${tradePatterns.avgLoserSize}`,color:C.red}].map(({label,value,color}) => (
                      <div key={label} style={{ background: 'rgba(20,26,40,0.95)', borderRadius: 5, padding: '5px 8px' }}>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {tradePatterns.cutWinnersEarly && <div style={{ fontSize: 11.5, color: C.fire, padding: '4px 8px', background: 'rgba(224,80,0,0.07)', borderRadius: 4, marginBottom: 4 }}>⚠ You cut winners early — avg win ${tradePatterns.avgWinnerSize} vs avg loss ${tradePatterns.avgLoserSize}</div>}
                  {tradePatterns.revengePatterns > 1 && <div style={{ fontSize: 11.5, color: C.red, padding: '4px 8px', background: 'rgba(255,77,109,0.06)', borderRadius: 4 }}>⚠ {tradePatterns.revengePatterns} potential revenge trades detected</div>}
                </div>
              )}

              {/* Session Memory — collapsed by default, accessible via toggle */}
              {sessionMemory && (
                <details style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, borderLeft: '2px solid rgba(0,212,160,0.2)' }}>
                  <summary style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' as const, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💾</span><span>AI REMEMBERS</span>
                  </summary>
                  <div style={{ padding: '0 10px 10px 10px' }}>
                    <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.7, whiteSpace: 'pre-line' as const }}>{sessionMemory}</div>
                    <button onClick={() => { localStorage.removeItem('tz-session-memory'); window.location.reload() }} style={{ marginTop: 6, fontSize: 11, color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: font }}>Clear memory</button>
                  </div>
                </details>
              )}
            </div>

            {/* Right — AI Companion (HERO) */}
            {companionOpen && (
              <div style={{ width: 480, background: 'rgba(8,10,18,0.99)', borderLeft: '1px solid rgba(0,212,160,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-2px 0 20px rgba(0,0,0,0.5)' }}>
                {/* Companion header */}
                <div style={{ padding: '10px 14px', background: 'linear-gradient(90deg, rgba(0,212,160,0.1), rgba(0,153,204,0.05))', borderBottom: '2px solid rgba(0,212,160,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid rgba(0,212,160,0.3)`, background: 'rgba(0,212,160,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, position: 'relative', boxShadow: '0 0 10px rgba(0,212,160,0.1)' }}>
                    <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 900, color: '#00e5ff', letterSpacing: 1.5 }}>AI</span>
                    <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid rgba(0,212,160,0.15)`, animation: 'brainRing 4s linear infinite' }} />
                  </div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>AI COMPANION</div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', border: `1px solid ${listening ? 'rgba(255,26,74,0.35)' : speaking ? 'rgba(0,212,160,0.3)' : 'rgba(0,153,204,0.25)'}`, color: listening ? C.red : speaking ? C.violet : C.teal, background: listening ? 'rgba(204,16,64,0.06)' : 'transparent', animation: listening ? 'listeningPulse 1s infinite' : 'none' }}>
                    {listening ? '✏ LISTENING' : speaking ? '↗ SPEAKING' : chatLoading ? 'THINKING' : '✓ READY'}
                  </div>
                  {aiResult && (
                    <div style={{ marginLeft: 'auto', background: `${signalColor}12`, border: `1px solid ${signalColor}30`, borderRadius: 2, padding: '2px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 800, color: signalColor, letterSpacing: 2 }}>{aiResult.signal}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>{aiResult.confidence}%</span>
                    </div>
                  )}
                  <button title="New session — clear chat history" onClick={() => { if (window.confirm('Start a new session? This will clear today\'s chat history.')) { localStorage.removeItem(CHAT_STORAGE_KEY); setChatMessages([]) } }} style={{ background: 'transparent', border: `1px solid rgba(255,183,0,0.2)`, borderRadius: 3, color: '#ffb700', cursor: 'pointer', fontSize: 11, padding: '2px 6px', fontFamily: font }}>↺ New</button>
                  <button title="Pop out companion" onClick={() => window.open('/cockpit/companion', 'tz-companion', 'width=400,height=640,top=50,right=50,resizable=yes')} style={{ background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 3, color: C.teal, cursor: 'pointer', fontSize: 11, padding: '2px 6px', fontFamily: font }}>⤢</button>
                  <button onClick={() => setCompanionOpen(false)} title="Minimize companion" style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}>— </button>
                </div>

                {/* Context bar */}
                <div style={{ display: 'flex', background: 'rgba(6,8,16,0.99)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                  {[
                    { label: 'SPX', value: fmt(currentPrice), color: C.text },
                    { label: 'VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲' : '▼') : '—', color: currentPrice && effectiveVwap ? (currentPrice > effectiveVwap ? C.synapse : C.red) : C.textMuted },
                    { label: 'VIX', value: vixPrice ? vixPrice.toFixed(1) : '—', color: vixPrice && vixPrice > 18 ? C.fire : C.synapse },
                    { label: 'SCORE', value: `${score}/13`, color: gradeColor },
                    { label: 'P&L', value: `$${todayPnL.toFixed(0)}`, color: todayPnL >= 0 ? C.synapse : C.red },
                    { label: 'PLAN', value: activePlaybook ? activePlaybook.name.split(' ')[0] : 'None', color: activePlaybook ? C.teal : C.textMuted },
                  ].map(({ label, value, color }, i) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRight: i < 5 ? `1px solid rgba(100,140,220,0.06)` : 'none' }}>
                      <div style={{ fontSize: 9, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{label}</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Messages */}
                <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(8,11,20,0.98)' }}>
                  {chatMessages.length === 0 && (
                    <div style={{ padding: '16px' }}>
                      {/* Live context strip */}
                      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Watching live</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {[
                            { label: 'SPX', val: currentPrice ? fmt(currentPrice) + (currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? ' ▲ VWAP' : ' ▼ VWAP') : '') : 'Loading...', ok: !!(currentPrice) },
                            { label: 'Flow', val: optionsFlow.length ? optionsFlow.length + ' alerts — ' + (optionsFlow.filter((f:any)=>f.sentiment==='BULLISH').length > optionsFlow.filter((f:any)=>f.sentiment==='BEARISH').length ? 'BULLISH lean' : 'BEARISH lean') : 'No flow data', ok: optionsFlow.length > 0 },
                            { label: 'Score', val: `${grade} — ${score}/13 ${score >= 9 ? '✓ Ready' : score >= 7 ? 'Caution' : '✗ Stay out'}`, ok: score >= 7 },
                            { label: 'Plan', val: morningPlan.bias ? morningPlan.bias.toUpperCase() + (morningPlan.keyLevels ? ' · ' + morningPlan.keyLevels.split(',')[0] + ' key' : '') : 'No plan set', ok: !!morningPlan.bias },
                          ].map(({label, val, ok}) => (
                            <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                              <span style={{ fontSize: 10, color: '#6b7a9a', fontWeight: 700, minWidth: 36 }}>{label}</span>
                              <span style={{ fontSize: 11.5, color: ok ? '#d0d8f0' : '#4a5568', fontWeight: ok ? 500 : 400 }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Quick prompts — auto-send on click */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {["What's the setup?", "Should I trade?", "Am I in system?", "What does flow say?"].map(q => (
                          <button key={q} onClick={() => sendChatWithText(q)} style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.18)', borderRadius: 6, padding: '8px 10px', color: '#00e5ff', cursor: 'pointer', fontSize: 12, fontFamily: font, fontWeight: 600, textAlign: 'left' as const }}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((m, i) => {
                    // Auto-detect if message mentions price levels — show mini chart
                    const hasLevels = m.role === 'assistant' && /(VWAP|vwap|band|EMA|ema|stop|target|entry|\d{4,5}\.?\d{0,2})/.test(m.content)
                    const levels2 = hasLevels ? (() => {
                      const nums = [...m.content.matchAll(/(\d{4,5}\.?\d{0,2})/g)].map(x => parseFloat(x[1])).filter(n => n > 3000 && n < 12000).sort((a,b)=>a-b)
                      return [...new Set(nums)].slice(0, 6)
                    })() : []
                    return (
                    <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '95%', width: m.role === 'assistant' ? '100%' : 'auto' }}>
                      {m.role === 'assistant' && <div style={{ fontSize: 10, color: '#00d4a0', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '1.5px' }}><span style={{ width: 3, height: 3, borderRadius: '50%', background: C.teal, display: 'inline-block' }} />AI COMPANION</div>}
                      <div style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.8, color: '#f0f4ff', background: m.role === 'user' ? 'rgba(0,229,255,0.06)' : 'rgba(0,212,160,0.06)', border: `1px solid ${m.role === 'user' ? 'rgba(0,229,255,0.18)' : 'rgba(0,212,160,0.15)'}`, borderLeft: m.role === 'assistant' ? '3px solid #00d4a0' : 'none', borderRight: m.role === 'user' ? '3px solid #00e5ff' : 'none', borderRadius: m.role === 'user' ? '10px 3px 3px 10px' : '3px 10px 10px 3px' }}>
                        {m.content}
                      </div>
                    {/* Auto mini-chart when levels mentioned */}
                      {hasLevels && levels2.length >= 2 && candles.length > 10 && (() => {
                        const recentBars = candles.slice(-60)
                        const prices = recentBars.flatMap(b => [b.h, b.l])
                        const minP = Math.min(...prices, ...levels2) - 5
                        const maxP = Math.max(...prices, ...levels2) + 5
                        const W = 400, H = 140
                        const toX = (i: number) => (i / (recentBars.length - 1)) * (W - 24) + 12
                        const toY = (p: number) => H - 8 - ((p - minP) / (maxP - minP)) * (H - 16)
                        const vwapY = marketIntel2?.vwapBands?.vwap ? toY(marketIntel2.vwapBands.vwap) : null
                        const b1u = marketIntel2?.vwapBands?.band1Up ? toY(marketIntel2.vwapBands.band1Up) : null
                        const b1d = marketIntel2?.vwapBands?.band1Dn ? toY(marketIntel2.vwapBands.band1Dn) : null
                        const ema5 = levels?.ema200 ? toY(levels.ema200) : null
                        return (
                          <svg width={W} height={H} style={{ display: 'block', marginTop: 6, borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,229,255,0.08)' }}>
                            {/* VWAP band fill */}
                            {b1u !== null && b1d !== null && (
                              <rect x={12} y={b1u} width={W-24} height={b1d - b1u} fill="rgba(0,229,255,0.04)" />
                            )}
                            {/* Candles */}
                            {recentBars.map((b, ci) => {
                              const x   = toX(ci)
                              const bull = b.c >= b.o
                              const col  = bull ? '#00d4a0' : '#ff4d6d'
                              const bodyT = toY(Math.max(b.o, b.c))
                              const bodyH = Math.max(1, toY(Math.min(b.o, b.c)) - bodyT)
                              return (
                                <g key={ci}>
                                  <line x1={x} y1={toY(b.h)} x2={x} y2={toY(b.l)} stroke={col} strokeWidth={0.8} opacity={0.6} />
                                  <rect x={x-2} y={bodyT} width={4} height={bodyH} fill={col} opacity={0.85} />
                                </g>
                              )
                            })}
                            {/* VWAP line */}
                            {vwapY !== null && <line x1={12} y1={vwapY} x2={W-12} y2={vwapY} stroke="#00e5ff" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.7} />}
                            {/* ±1σ bands */}
                            {b1u !== null && <line x1={12} y1={b1u} x2={W-12} y2={b1u} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />}
                            {b1d !== null && <line x1={12} y1={b1d} x2={W-12} y2={b1d} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />}
                            {/* 200 EMA 5m */}
                            {ema5 !== null && <line x1={12} y1={ema5} x2={W-12} y2={ema5} stroke="#7c6aff" strokeWidth={1} opacity={0.6} />}
                            {/* Detected price levels */}
                            {levels2.map((lv, li) => {
                              const ly = toY(lv)
                              const isStop   = m.content.toLowerCase().includes('stop') && li === 0
                              const isTarget = m.content.toLowerCase().includes('target') && li === levels2.length - 1
                              const col = isStop ? '#ff4d6d' : isTarget ? '#00ff88' : 'rgba(255,255,255,0.3)'
                              return (
                                <g key={li}>
                                  <line x1={12} y1={ly} x2={W-12} y2={ly} stroke={col} strokeWidth={isStop || isTarget ? 1.5 : 1} strokeDasharray={isStop || isTarget ? '0' : '2,4'} opacity={0.8} />
                                  <text x={W-10} y={ly+3} fontSize={8} fill={col} textAnchor="end" opacity={0.9}>{lv.toFixed(0)}</text>
                                </g>
                              )
                            })}
                            {/* Labels */}
                            {vwapY !== null && <text x={14} y={vwapY-3} fontSize={7} fill="#00e5ff" opacity={0.8}>VWAP</text>}
                            {ema5 !== null && <text x={14} y={ema5-3} fontSize={7} fill="#7c6aff" opacity={0.8}>200E</text>}
                            {/* Current price dot */}
                            {recentBars.length > 0 && (
                              <circle cx={toX(recentBars.length-1)} cy={toY(recentBars[recentBars.length-1].c)} r={3} fill="#f59e0b" />
                            )}
                          </svg>
                        )
                      })()}
                    </div>
                  )})}
                  {chatLoading && (
                    <div style={{ alignSelf: 'flex-start' }}>
                      <div style={{ fontSize: 9, color: C.teal, marginBottom: 2, letterSpacing: 1 }}>AI COMPANION</div>
                      <div style={{ padding: '8px 12px', background: 'rgba(0,212,160,0.05)', border: `1px solid rgba(0,212,160,0.12)`, borderLeft: `2px solid ${C.violet}`, borderRadius: '2px 6px 6px 2px', display: 'flex', gap: 4 }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: `pulse 1s ${i*0.15}s infinite` }} />)}
                      </div>
                    </div>
                  )}
                  {listening && liveTranscript && (
                    <div style={{ alignSelf: 'flex-end', padding: '5px 9px', background: 'rgba(255,77,109,0.06)', border: `1px solid rgba(204,16,64,0.2)`, borderRight: `2px solid ${C.red}`, borderRadius: '6px 2px 2px 6px', fontSize: 11.5, color: C.red, fontStyle: 'italic' }}>
                      {liveTranscript}...
                    </div>
                  )}
                </div>

                {/* Speaking waveform */}
                {speaking && (
                  <div onClick={() => {
                    speakLockRef.current = false; audioSourceRef.current = null; setSpeaking(false)
                    try { window.speechSynthesis.cancel() } catch {}
                    try { if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(()=>{}) } catch {}
                  }} title="Click to stop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '5px 0', background: 'rgba(0,229,255,0.06)', borderTop: `1px solid rgba(0,212,160,0.08)`, cursor: 'pointer' }}>
                    {[...Array(18)].map((_, i) => (
                      <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4+(i%5)*0.1}s ease-in-out infinite`, animationDelay: `${(i%4)*0.08}s`, '--wh': `${6+(i%6)*2}px` } as any} />
                    ))}
                    <span style={{ fontSize: 10, color: C.teal, marginLeft: 8, letterSpacing: 1 }}>SPEAKING · tap to stop</span>
                  </div>
                )}

                {/* Input area */}
                <div style={{ padding: '12px 14px', background: 'rgba(4,6,14,0.99)', borderTop: '1px solid rgba(0,229,255,0.12)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
                    <button onClick={() => { listening ? stopListening() : startListening() }} style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${listening ? 'rgba(255,26,74,0.7)' : 'rgba(255,26,74,0.35)'}`, background: listening ? 'rgba(255,26,74,0.15)' : 'rgba(255,26,74,0.07)', color: '#ff1a4a', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: listening ? '0 0 0 6px rgba(255,26,74,0.1), 0 0 16px rgba(255,26,74,0.3)' : '0 0 12px rgba(255,26,74,0.1)', animation: listening ? 'micGlow 0.8s infinite' : 'none', transition: 'all 0.2s', flexShrink: 0 }}>
                      {listening ? 'STOP' : 'TALK'}
                    </button>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder={listening ? 'Listening... (tap ↹ to stop)' : 'Ask your AI companion...'}
                      style={{ flex: 1, background: 'rgba(10,14,24,0.95)', border: `1px solid ${listening ? 'rgba(255,26,74,0.4)' : 'rgba(0,229,255,0.2)'}`, borderRadius: 4, padding: '9px 12px', color: '#f0f4ff', fontFamily: font, fontSize: 13, outline: 'none', transition: 'border-color 0.2s' }} />
                    <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ width: 34, height: 34, background: chatInput.trim() ? 'rgba(0,212,160,0.12)' : 'transparent', border: `1px solid ${chatInput.trim() ? 'rgba(0,212,160,0.25)' : 'rgba(100,140,220,0.1)'}`, borderRadius: 3, color: chatInput.trim() ? C.violet : C.textMuted, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontFamily: font, fontWeight: 700, flexShrink: 0 }}>↑</button>
                  </div>
                  {/* Voice — compact single line */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: '#4a5568', fontWeight: 700, letterSpacing: 1 }}>VOICE</span>
                    {['nova','onyx','alloy','echo','shimmer'].map(v => (
                      <button key={v} onClick={() => { setVoiceId(v); localStorage.setItem(VOICE_ID, v) }} style={{ padding: '2px 7px', borderRadius: 3, background: voiceId === v ? 'rgba(0,212,160,0.12)' : 'transparent', border: `1px solid ${voiceId === v ? 'rgba(0,212,160,0.35)' : 'rgba(0,229,255,0.08)'}`, color: voiceId === v ? '#00d4a0' : '#6b7a9a', fontSize: 11.5, cursor: 'pointer', fontFamily: font, fontWeight: voiceId === v ? 700 : 400 }}>{v}</button>
                    ))}
                    <button onClick={() => setShowSettings(true)} style={{ fontSize: 10, color: '#4a5568', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', marginLeft: 2 }}>⚙</button>
                    <button
                      title={avatarMode ? 'Avatar ON — click to disable' : 'Enable Avatar Companion (Elite)'}
                      onClick={() => {
                        if (!avatarId) { setShowSettings(true); return }
                        const next = !avatarMode
                        setAvatarMode(next)
                        localStorage.setItem('tz-avatar-mode', String(next))
                      }}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3, marginLeft: 4,
                        border: `1px solid ${avatarMode ? 'rgba(0,212,160,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: avatarMode ? 'rgba(0,212,160,0.1)' : 'transparent',
                        color: avatarMode ? '#00d4a0' : '#4a5568',
                        cursor: 'pointer', fontFamily: font,
                      }}>🤖</button>
                    {avatarMode && avatarId && (
                      <button onClick={() => setShowAvatarPanel((p: boolean) => !p)} style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 3,
                        border: `1px solid ${showAvatarPanel ? 'rgba(0,212,160,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: showAvatarPanel ? 'rgba(0,212,160,0.1)' : 'transparent',
                        color: showAvatarPanel ? '#00d4a0' : '#4a5568', cursor: 'pointer', fontFamily: font,
                      }}>{showAvatarPanel ? '▲ hide' : '▼ avatar'}</button>
                    )}

                  </div>{/* end voice row */}

                  {/* Avatar ID input — shown when avatar mode enabled but no ID yet */}
                  {avatarMode && !avatarId && (
                    <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(0,212,160,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, color: '#4a5568', whiteSpace: 'nowrap' }}>AVATAR ID</span>
                      <input
                        value={avatarId}
                        onChange={e => { setAvatarId(e.target.value); localStorage.setItem('tz-avatar-id', e.target.value) }}
                        placeholder="Paste HeyGen avatar ID..."
                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 4, padding: '3px 8px', color: '#00d4a0', fontSize: 11, fontFamily: font, outline: 'none' }}
                      />
                    </div>
                  )}
                </div>{/* end input area */}

              {/* Avatar panel — only shown when user actively clicks Start Avatar */}
              {avatarMode && avatarId && showAvatarPanel && (
                <div style={{ padding: '10px', borderBottom: '1px solid rgba(0,212,160,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.4)' }}>
                  <AvatarCompanion
                    ref={avatarRef}
                    avatarId={avatarId}
                    width={280}
                    height={210}
                    onSpeakingChange={isSpeaking => setSpeaking(isSpeaking)}
                  />
                </div>
              )}
            </div>
          )}
            {!companionOpen && (
              <button onClick={() => setCompanionOpen(true)} title="Open AI Companion" style={{ position: 'fixed', bottom: 20, right: 20, width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,212,160,0.15)', border: '2px solid rgba(0,212,160,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 4px 20px rgba(0,212,160,0.25)', zIndex: 500 }}>
                <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 900, color: '#00e5ff', letterSpacing: 1.5 }}>AI</span>
              </button>
            )}
          </div>
        )}


        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 1 — MORNING PLAN */}
        {/* ═══════════════════════════════════════════════════════ */}
        {tab === 'plan' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#050609' }}>

            {/* LEFT — Setup form */}
            <div style={{ width: 240, background: 'rgba(8,10,18,0.99)', borderRight: '1px solid rgba(0,229,255,0.1)', overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>

              <div style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: '#8899bb', marginBottom: 16, letterSpacing: '2px', textTransform: 'uppercase' }}>Today's Setup</div>

              {/* Implied Move */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Implied Move (±PTS)</div>
                <input value={morningPlan.impliedMove} onChange={e => setMorningPlan((p: MorningPlan) => ({ ...p, impliedMove: e.target.value }))}
                  placeholder="e.g. 50" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Key Levels */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Key Levels</div>
                <input value={morningPlan.keyLevels} onChange={e => setMorningPlan((p: MorningPlan) => ({ ...p, keyLevels: e.target.value }))}
                  placeholder="e.g. 5840, 5820, 5800" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Gap Size */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Gap Size (PTS)</div>
                <input value={morningPlan.gapSize} onChange={e => setMorningPlan((p: MorningPlan) => ({ ...p, gapSize: e.target.value }))}
                  placeholder="e.g. 60" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Directional Bias */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Directional Bias</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['long', C.synapse], ['short', C.red], ['neutral', C.violet]].map(([b, col]) => (
                    <button key={b} onClick={() => setMorningPlan((p: MorningPlan) => ({ ...p, bias: b }))} style={{
                      flex: 1, background: morningPlan.bias === b ? col + '15' : 'transparent',
                      border: `1.5px solid ${morningPlan.bias === b ? col : 'rgba(100,140,220,0.2)'}`,
                      borderRadius: 6, padding: '7px 0', color: morningPlan.bias === b ? col : C.textMuted,
                      cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: font, textTransform: 'uppercase' as const, transition: 'all 0.15s'
                    }}>{b}</button>
                  ))}
                </div>
              </div>

              {/* Gap Direction */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Gap Direction</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['gap up', C.synapse], ['gap down', C.red], ['flat', C.violet]].map(([g, col]) => (
                    <button key={g} onClick={() => setMorningPlan((p: MorningPlan) => ({ ...p, gapDirection: g }))} style={{
                      flex: 1, background: morningPlan.gapDirection === g ? col + '15' : 'transparent',
                      border: `1.5px solid ${morningPlan.gapDirection === g ? col : 'rgba(100,140,220,0.2)'}`,
                      borderRadius: 6, padding: '7px 0', color: morningPlan.gapDirection === g ? col : C.textMuted,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: font, textTransform: 'uppercase' as const, transition: 'all 0.15s'
                    }}>{g === 'gap up' ? 'Gap Up' : g === 'gap down' ? 'Gap Down' : 'Flat'}</button>
                  ))}
                </div>
              </div>

              {/* Morning Notes — free text */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Morning Plan / Notes</div>
                <textarea
                  value={morningPlan.notes}
                  onChange={e => setMorningPlan((p: MorningPlan) => ({ ...p, notes: e.target.value }))}
                  placeholder={'e.g. Gap up on CPI. Fade the open if we reject VWAP in first 30 min. Look for continuation if we reclaim PDH with volume...'}
                  rows={5}
                  style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 12, outline: 'none', fontFamily: font, resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const }}
                />
              </div>

              <div style={{ height: 1, background: 'rgba(100,140,220,0.12)', margin: '4px 0 14px' }} />

              {/* Playbook Picker */}
              <div style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: '#8899bb', marginBottom: 10, letterSpacing: '2px', textTransform: 'uppercase' }}>Today's Playbook</div>
              {playbooks.map(pb => (
                <div key={pb.id} onClick={() => setActivePlaybookId(activePlaybookId === pb.id ? null : pb.id)} style={{
                  background: activePlaybookId === pb.id ? 'rgba(0,229,255,0.08)' : 'rgba(8,10,18,0.6)',
                  border: `1.5px solid ${activePlaybookId === pb.id ? 'rgba(0,153,204,0.3)' : 'rgba(100,140,220,0.15)'}`,
                  borderRadius: 8, padding: '9px 11px', marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: activePlaybookId === pb.id ? '0 2px 8px rgba(0,153,204,0.1)' : 'none'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: activePlaybookId === pb.id ? C.teal : C.text }}>{pb.name}</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>{pb.setup}</div>
                </div>
              ))}
              <button onClick={() => setShowAddPlaybook(!showAddPlaybook)} style={{
                width: '100%', background: 'transparent', border: `1px dashed rgba(100,140,220,0.3)`,
                borderRadius: 6, padding: '7px 0', color: C.textMuted, cursor: 'pointer', fontSize: 11.5, fontFamily: font, marginTop: 4
              }}>+ Add Playbook</button>
              {showAddPlaybook && (
                <div style={{ marginTop: 8, background: 'rgba(10,14,24,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 4, padding: 10 }}>
                  {[{key:'name',ph:'Playbook name'},{key:'setup',ph:'Setup conditions'},{key:'entry',ph:'Entry trigger'},{key:'stop',ph:'Stop rule'},{key:'target',ph:'Target'},{key:'notes',ph:'Notes (optional)'}].map(({key,ph}) => (
                    <input key={key} value={(newPlaybook as any)[key]} onChange={e => setNewPlaybook(p => ({...p,[key]:e.target.value}))}
                      placeholder={ph} style={{width:'100%',background:'#fff',border:'1px solid rgba(100,140,220,0.2)',borderRadius:5,padding:'6px 8px',color:C.text,fontSize:12,outline:'none',marginBottom:5,fontFamily:font,boxSizing:'border-box' as const}} />
                  ))}
                  <button onClick={() => {
                    if (!newPlaybook.name) return
                    setPlaybooks(p => [...p, {...newPlaybook, id: Date.now().toString()}])
                    setNewPlaybook({name:'',setup:'',entry:'',stop:'',target:'',notes:''})
                    setShowAddPlaybook(false)
                  }} style={{width:'100%',background:C.teal,border:'none',borderRadius:5,padding:'7px 0',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:font}}>Save Playbook</button>
                </div>
              )}
            </div>

            {/* CENTER — AI Brief + Probability */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, background: 'rgba(5,6,9,1)' }}>

              {/* Probability section */}
              {(() => {
                const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext, historicalStats: historicalGapStats })
                return (
                  <div style={{ background: 'rgba(10,13,22,1)', margin: '12px 14px 0', borderRadius: 10, padding: '16px 18px', border: `1px solid ${probs.hasData ? probs.dominantColor + '30' : 'rgba(0,229,255,0.1)'}`, borderTop: `3px solid ${probs.hasData ? probs.dominantColor : 'rgba(0,229,255,0.25)'}` }}>
                    {/* Trend Day Prediction — shown when gap data available */}
                    {gapPrediction?.trendScorePredicted !== undefined && (
                      <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: '2px', textTransform: 'uppercase' as const }}>Day Type Prediction</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: gapPrediction.trendScorePredicted >= 65 ? '#00ff88' : gapPrediction.trendScorePredicted <= 35 ? '#ff4d6d' : '#f59e0b' }}>
                            {gapPrediction.interpretation}
                          </div>
                        </div>
                        {/* Score bar */}
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${gapPrediction.trendScorePredicted}%`, background: `linear-gradient(90deg, #ff4d6d, #f59e0b, #00ff88)`, borderRadius: 3, transition: 'width 0.8s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4a5568', marginBottom: 4 }}>
                          <span>CHOP</span>
                          <span style={{ color: gapPrediction.trendScorePredicted >= 65 ? '#00ff88' : gapPrediction.trendScorePredicted <= 35 ? '#ff4d6d' : '#f59e0b' }}>{gapPrediction.trendScorePredicted}/100</span>
                          <span>TREND</span>
                        </div>
                        {gapPrediction.historicalMatch?.count >= 5 && (
                          <div style={{ fontSize: 10, color: '#7c6aff', marginTop: 2 }}>
                            {gapPrediction.historicalMatch.trendPct}% trend days on {gapPrediction.historicalMatch.count} similar setups
                            {gapPrediction.catalyst && gapPrediction.catalyst !== 'NONE' ? ` · ${gapPrediction.catalyst} day` : ''}
                          </div>
                        )}
                        {gapPrediction.drivers?.length > 0 && (
                          <div style={{ fontSize: 10, color: '#4a5568', marginTop: 4 }}>{gapPrediction.drivers[0]}</div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8899bb', letterSpacing: '2px', textTransform: 'uppercase' as const }}>Gap Probability</div>
                      {probs.hasData && (
                        <div style={{ background: probs.dominantColor + '15', border: `1px solid ${probs.dominantColor}40`, borderRadius: 4, padding: '3px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: probs.dominantColor, fontFamily: fontDisplay }}>{probs.dominant}</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{probs.confidence}</span>
                          {historicalGapStats?.count >= 10
                            ? <span style={{ fontSize: 10, color: '#7c6aff' }}>{historicalGapStats.count} obs{historicalGapStats.filters?.catalyst && historicalGapStats.filters.catalyst !== '' ? ` · ${historicalGapStats.filters.catalyst}` : ''}</span>
                            : <span style={{ fontSize: 10, color: '#4a5568' }}>model-based</span>
                          }
                        </div>
                      )}
                    </div>
                    {probs.hasData ? (
                      <>
                        {[{label:'Reversal',value:probs.reversal,color:C.red},{label:'Continuation',value:probs.continuation,color:C.synapse},{label:'Chop / Range',value:probs.chop,color:C.fire}].map(({label,value,color}) => (
                          <div key={label} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: '#8899bb', fontWeight: 500 }}>{label}</span>
                              <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: fontDisplay, letterSpacing: '-0.5px' }}>{value}%</span>
                            </div>
                            <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${value}%`, background: `linear-gradient(90deg, ${color}dd, ${color})`, borderRadius: 4, transition: 'width 0.6s ease', opacity: value === Math.max(probs.reversal, probs.continuation, probs.chop) ? 1 : 0.35 }} />
                            </div>
                          </div>
                        ))}
                        {tiingoContext?.summary && (
                          <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted, lineHeight: 1.5, padding: '8px 10px', background: 'rgba(240,244,250,0.6)', borderRadius: 5 }}>
                            {tiingoContext.summary}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        
                        <div style={{ fontSize: 12, color: '#8899bb', fontWeight: 600, marginBottom: 4 }}>Set your morning plan</div>
                        <div style={{ fontSize: 11.5, color: 'rgba(136,153,187,0.6)', lineHeight: 1.6 }}>Enter bias, gap direction, and implied move<br/>to generate scenario probabilities</div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── MACRO MORNING BRIEF ── */}
              {(morningBrief || briefLoading) && (
                <div style={{ margin: '14px 14px 0', borderRadius: 10, background: 'rgba(8,10,20,0.98)', border: '1px solid rgba(0,229,255,0.1)', borderTop: `3px solid ${morningBrief?.macroBias === 'BULLISH' ? '#00ff88' : morningBrief?.macroBias === 'BEARISH' ? '#ff4d6d' : '#f59e0b'}`, overflow: 'hidden' }}>
                  {/* Brief header */}
                  <div style={{ padding: '10px 14px', background: 'rgba(0,229,255,0.03)', borderBottom: '1px solid rgba(0,229,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: '#00e5ff', letterSpacing: 2 }}>MORNING BRIEF</div>
                      {morningBrief?.macroBias && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 3,
                          background: morningBrief.macroBias === 'BULLISH' ? 'rgba(0,255,136,0.1)' : morningBrief.macroBias === 'BEARISH' ? 'rgba(255,77,109,0.1)' : 'rgba(245,158,11,0.1)',
                          color: morningBrief.macroBias === 'BULLISH' ? '#00ff88' : morningBrief.macroBias === 'BEARISH' ? '#ff4d6d' : '#f59e0b',
                          border: `1px solid ${morningBrief.macroBias === 'BULLISH' ? 'rgba(0,255,136,0.3)' : morningBrief.macroBias === 'BEARISH' ? 'rgba(255,77,109,0.3)' : 'rgba(245,158,11,0.3)'}`,
                        }}>{morningBrief.macroBias}</span>
                      )}
                      {morningBrief?.todaysBias && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 3,
                          background: morningBrief.todaysBias === 'LONG' ? 'rgba(0,212,160,0.1)' : morningBrief.todaysBias === 'SHORT' ? 'rgba(255,26,74,0.1)' : 'rgba(136,153,187,0.08)',
                          color: morningBrief.todaysBias === 'LONG' ? '#00d4a0' : morningBrief.todaysBias === 'SHORT' ? '#ff1a4a' : C.textMuted,
                          border: `1px solid ${morningBrief.todaysBias === 'LONG' ? 'rgba(0,212,160,0.3)' : morningBrief.todaysBias === 'SHORT' ? 'rgba(255,26,74,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        }}>AI BIAS: {morningBrief.todaysBias}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {morningBrief && (
                        <button onClick={() => {
                          const text = [morningBrief.macroSentence, morningBrief.weeklyNarrative, morningBrief.biasReasoning, morningBrief.tradingPlan].filter(Boolean).join(' ')
                          if (!speakLockRef.current && !speaking) speak(text)
                        }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)', color: '#00e5ff', cursor: 'pointer', fontFamily: font }}>🔊</button>
                      )}
                      <button onClick={() => { setMorningBrief(null); setBriefLoading(false); localStorage.removeItem('tz-morning-brief-' + new Date().toLocaleDateString('en-CA', {timeZone:'America/New_York'})); fetchMorningBrief() }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: C.textMuted, cursor: 'pointer', fontFamily: font }}>↺</button>
                    </div>
                  </div>

                  {briefLoading && !morningBrief && (
                    <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, border: '1.5px solid rgba(0,229,255,0.2)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span style={{ fontSize: 12, color: C.textMuted }}>Generating morning brief...</span>
                    </div>
                  )}

                  {morningBrief && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Macro sentence */}
                      <div style={{ fontSize: 12, color: '#b0c4de', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '2px solid rgba(0,229,255,0.3)', paddingLeft: 10 }}>
                        {morningBrief.macroSentence}
                      </div>

                      {/* Weekly narrative */}
                      {morningBrief.weeklyNarrative && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>This Week</div>
                          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.75 }}>{morningBrief.weeklyNarrative}</div>
                        </div>
                      )}

                      {/* AI bias reasoning */}
                      {morningBrief.biasReasoning && (
                        <div style={{ background: morningBrief.todaysBias === 'LONG' ? 'rgba(0,212,160,0.05)' : morningBrief.todaysBias === 'SHORT' ? 'rgba(255,26,74,0.05)' : 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '10px 12px', border: `1px solid ${morningBrief.todaysBias === 'LONG' ? 'rgba(0,212,160,0.15)' : morningBrief.todaysBias === 'SHORT' ? 'rgba(255,26,74,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: morningBrief.todaysBias === 'LONG' ? '#00d4a0' : morningBrief.todaysBias === 'SHORT' ? '#ff1a4a' : C.textMuted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>AI Bias — {morningBrief.todaysBias}</div>
                          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.75 }}>{morningBrief.biasReasoning}</div>
                        </div>
                      )}

                      {/* Key levels + catalyst in a row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {morningBrief.keyLevels && (
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>📍 Key Levels</div>
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{morningBrief.keyLevels}</div>
                          </div>
                        )}
                        {morningBrief.catalystWatch && (
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>📅 Watch</div>
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{morningBrief.catalystWatch}</div>
                          </div>
                        )}
                      </div>

                      {/* Biggest risk */}
                      {morningBrief.biggestRisk && (
                        <div style={{ background: 'rgba(255,77,109,0.04)', borderRadius: 6, padding: '8px 12px', border: '1px solid rgba(255,77,109,0.15)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 12 }}>⚠️</span>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#ff4d6d', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 2 }}>Biggest Risk</div>
                            <div style={{ fontSize: 12, color: '#ffb0b8', lineHeight: 1.6 }}>{morningBrief.biggestRisk}</div>
                          </div>
                        </div>
                      )}

                      {/* Trading plan */}
                      {morningBrief.tradingPlan && (
                        <div style={{ background: 'rgba(0,212,160,0.04)', borderRadius: 6, padding: '8px 12px', border: '1px solid rgba(0,212,160,0.12)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4a0', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>Today's Plan</div>
                          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.75 }}>{morningBrief.tradingPlan}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI Morning Brief */}
              <div style={{ background: 'rgba(12,15,26,0.98)', margin: '14px', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,212,160,0.08)', borderTop: '3px solid #00d4a0', overflow: 'visible' }}>
                {/* Header */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,212,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,212,160,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.teal, animation: aiLoading ? 'pulse 0.6s infinite' : 'pulse 3s infinite' }} />
                    <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: '#00e5ff', letterSpacing: 1 }}>AI MORNING BRIEF</div>
                    {lastAITime && <span style={{ fontSize: 11, color: C.textMuted }}>{lastAITime}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* Read It button */}
                    {aiResult && (
                      <button onClick={() => {
                        const narrative = [
                          aiResult.signal ? `Signal: ${aiResult.signal} at ${aiResult.confidence}% confidence.` : '',
                          aiResult.marketConditions || '',
                          aiResult.todaysEdge || '',
                          aiResult.accountability || '',
                          aiResult.riskFlag ? `Risk alert: ${aiResult.riskFlag}` : '',
                        ].filter(Boolean).join(' ')
                        if (narrative && !speakLockRef.current) speak(narrative)
                      }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.25)', borderRadius: 6, color: C.teal, cursor: 'pointer', fontSize: 11.5, fontFamily: font, fontWeight: 700 }}>
                        🔊 Read It
                      </button>
                    )}
                    {aiLoading && <div style={{ width: 10, height: 10, border: `1.5px solid rgba(100,140,220,0.2)`, borderTopColor: C.violet, borderRadius: '50%', animation: 'spin 0.8s linear infinite', alignSelf: 'center' }} />}
                  </div>
                </div>

                {/* ── OPTIMAL TRADE ZONE — always visible, gold card (Feature 2) ── */}
                {(!aiResult || aiResult.signal === 'WAIT' || aiResult.signal === 'NO TRADE' || !aiResult.entryZone) ? (
                  <div style={{ margin: '0 0 8px 0', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(255,183,0,0.06), rgba(255,140,0,0.04))',
                    border: '1px solid rgba(255,183,0,0.45)',
                    boxShadow: '0 0 24px rgba(255,183,0,0.1), inset 0 1px 0 rgba(255,183,0,0.1)',
                    padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#ffb700' }}>OPTIMAL TRADE ZONE</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,183,0,0.5)' }}>Run Get Signal to populate</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'BUY ZONE', icon: '📍' },
                        { label: 'STOP', icon: '🛑' },
                        { label: 'TARGET 1 (SCALP)', icon: '' },
                        { label: 'TARGET 2 (SWING)', icon: '🚀' },
                      ].map(({ label, icon }) => (
                        <div key={label} style={{ background: 'rgba(255,183,0,0.04)', border: '1px solid rgba(255,183,0,0.18)', borderRadius: 8, padding: '10px 10px' }}>
                          <div style={{ fontSize: 9, color: '#ffb700', letterSpacing: 1, marginBottom: 6 }}>{icon} {label}</div>
                          <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: 'rgba(255,255,255,0.15)' }}>—</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', marginTop: 3 }}>min 10pt scalp</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Signal badge */}
                {aiResult ? (
                  <div style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid rgba(0,212,160,0.08)' }}>
                    <div style={{ background: signalColor + '12', border: `1.5px solid ${signalColor}35`, borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 40, fontWeight: 900, color: signalColor, letterSpacing: '3px', textShadow: `0 0 30px ${signalColor}77, 0 0 60px ${signalColor}33`, lineHeight: 1 }}>{aiResult.signal}</div>
                      <ProbMeter value={aiResult.confidence || 0} color={signalColor} />
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,212,160,0.08)' }}>
                    <div style={{ background: 'rgba(20,26,40,0.95)', borderRadius: 8, padding: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, border: `1.5px solid rgba(100,140,220,0.2)`, borderTopColor: C.violet, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          <div style={{ fontSize: 12, color: C.textMuted }}>Analyzing... (up to 20s)</div>
                          <button onClick={() => setAiLoading(false)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, border: '1px solid rgba(255,100,0,0.3)', background: 'rgba(255,100,0,0.08)', color: '#ff6b00', cursor: 'pointer', fontFamily: font, marginLeft: 4 }}>✕ Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>AI analysis unavailable — Anthropic may be busy</div>
                          <button onClick={() => {
                            setAiLoading(true)
                            runSignal(buildSignalInput()).then(r => { if (r) { setAiResult(r); setLastAITime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); setTimeout(() => { speak(`${r.signal}. ${r.confidence}% confidence. ${r.accountability || r.riskFlag || ''}`) }, 400) } setAiLoading(false) })
                          }} style={{ fontSize: 11.5, padding: '4px 12px', borderRadius: 4, border: `1px solid ${C.tealBorder}`, background: C.tealDim, color: C.teal, cursor: 'pointer', fontFamily: font, fontWeight: 600 }}>
                            ↻ Retry
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Narrative sections */}
                {aiResult && (
                  <div>
                    {aiResult.marketConditions && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 11, color: '#00e5ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{display:'inline-block',width:2,height:8,background:'#00e5ff',borderRadius:1,boxShadow:'0 0 6px #00e5ff'}} />Market Conditions</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.marketConditions}</div>
                      </div>
                    )}
                    {aiResult.aiView && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(124,106,255,0.12)', background: 'rgba(124,106,255,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#7c6aff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>AI's Independent View</div>
                          {aiResult.systemAlignment && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 3,
                              background: aiResult.systemAlignment === 'aligned' ? 'rgba(0,255,136,0.1)' : aiResult.systemAlignment === 'divergent' ? 'rgba(255,183,0,0.1)' : 'rgba(255,255,255,0.05)',
                              color: aiResult.systemAlignment === 'aligned' ? '#00ff88' : aiResult.systemAlignment === 'divergent' ? '#ffb700' : '#8899bb',
                              border: `1px solid ${aiResult.systemAlignment === 'aligned' ? 'rgba(0,255,136,0.3)' : aiResult.systemAlignment === 'divergent' ? 'rgba(255,183,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
                            }}>{aiResult.systemAlignment?.toUpperCase()}</span>
                          )}
                          {/* Adversarial review button */}
                          <button
                            onClick={async () => {
                              if (adversarialLoading) return
                              setAdversarialLoading(true)
                              try {
                                const res = await fetch('/api/adversarial-review', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    signal:       aiResult.signal,
                                    confidence:   aiResult.confidence,
                                    entryZone:    aiResult.entryZone,
                                    stopLevel:    aiResult.stopLevel,
                                    target1:      aiResult.target1,
                                    currentPrice: currentPrice,
                                    marketConditions: aiResult.marketConditions,
                                    aiView:           aiResult.aiView,
                                    riskFlag:         aiResult.riskFlag,
                                    multiTFAlignment: aiResult.multiTFAlignment,
                                    mechanicalBias:   mechanicalFlow?.bias,
                                    asymmetricSetup:  mechanicalFlow?.asymmetricSetup,
                                    actionability,
                                    setupEval,
                                    dayTypeForecast,
                                    microstructure:   { summary: microstructure?.summary },
                                    vix:              marketIntel2?.vixPrice,
                                    gexRegime:        gexData?.regime,
                                  }),
                                })
                                const d = await res.json()
                                setAdversarial(d)
                              } catch (e) {
                                console.error('Adversarial review failed:', e)
                              } finally {
                                setAdversarialLoading(false)
                              }
                            }}
                            disabled={adversarialLoading}
                            style={{
                              marginLeft: 'auto',
                              fontSize: 10, fontWeight: 700, padding: '3px 8px',
                              borderRadius: 3, border: '1px solid rgba(255,183,0,0.4)',
                              background: 'rgba(255,183,0,0.06)', color: '#ffb700',
                              cursor: adversarialLoading ? 'wait' : 'pointer',
                              fontFamily: font, letterSpacing: 1,
                              opacity: adversarialLoading ? 0.5 : 1,
                            }}
                          >
                            {adversarialLoading ? 'CHECKING…' : 'CHALLENGE THIS'}
                          </button>
                          {/* TOOK THIS TRADE — opens capture modal pre-filled from signal */}
                          {aiResult && (aiResult.signal === 'LONG' || aiResult.signal === 'SHORT') && (
                            <button
                              onClick={() => setShowTakeTrade({
                                signal: aiResult.signal,
                                confidence: aiResult.confidence,
                                entryPrice: currentPrice,
                                suggestedEntry: aiResult.entryZone?.mid || aiResult.entryZone?.low || currentPrice,
                                stopLevel: aiResult.stopLevel,
                                target1: aiResult.target1,
                                target2: aiResult.target2,
                                aiConfidence: aiResult.confidence,
                                setupName: selectedSetup ? (SETUPS.find((s: any) => s.id === selectedSetup)?.name || null) : null,
                                strike: aiResult.suggestedStrike || null,
                                expiry: aiResult.suggestedExpiry || null,
                              })}
                              style={{
                                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                                borderRadius: 3, border: '1px solid rgba(0,255,136,0.5)',
                                background: 'rgba(0,255,136,0.08)', color: '#00ff88',
                                cursor: 'pointer', fontFamily: font, letterSpacing: 1,
                                marginLeft: 6,
                              }}
                            >
                              ✓ TOOK THIS TRADE
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#e0e8ff', lineHeight: 1.8 }}>{aiResult.aiView}</div>
                        {aiResult.systemAlignmentNote && (
                          <div style={{ fontSize: 12, color: '#8899bb', marginTop: 5, fontStyle: 'italic' }}>{aiResult.systemAlignmentNote}</div>
                        )}

                        {/* Adversarial result display */}
                        {adversarial && !adversarial.error && (
                          <div style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            background: adversarial.counterStrength === 'STRONG' ? 'rgba(255,77,109,0.06)' : adversarial.counterStrength === 'MODERATE' ? 'rgba(255,183,0,0.05)' : 'rgba(0,212,160,0.04)',
                            border: `1px solid ${adversarial.counterStrength === 'STRONG' ? 'rgba(255,77,109,0.3)' : adversarial.counterStrength === 'MODERATE' ? 'rgba(255,183,0,0.25)' : 'rgba(0,212,160,0.2)'}`,
                            borderRadius: 5,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
                                color: adversarial.counterStrength === 'STRONG' ? '#ff4d6d' : adversarial.counterStrength === 'MODERATE' ? '#ffb700' : '#00d4a0',
                              }}>COUNTERARGUMENT</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 3, letterSpacing: 1,
                                background: adversarial.counterStrength === 'STRONG' ? 'rgba(255,77,109,0.15)' : adversarial.counterStrength === 'MODERATE' ? 'rgba(255,183,0,0.12)' : 'rgba(0,212,160,0.1)',
                                color: adversarial.counterStrength === 'STRONG' ? '#ff4d6d' : adversarial.counterStrength === 'MODERATE' ? '#ffb700' : '#00d4a0',
                              }}>{adversarial.counterStrength}</span>
                              {adversarial.verdict && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 3, letterSpacing: 1,
                                  background: adversarial.verdict === 'PROCEED' ? 'rgba(0,255,136,0.1)' : adversarial.verdict === 'REDUCE_SIZE' ? 'rgba(255,183,0,0.1)' : 'rgba(255,77,109,0.1)',
                                  color: adversarial.verdict === 'PROCEED' ? '#00ff88' : adversarial.verdict === 'REDUCE_SIZE' ? '#ffb700' : '#ff4d6d',
                                }}>VERDICT: {adversarial.verdict}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: '#e0e8ff', lineHeight: 1.7, marginBottom: 8 }}>
                              {adversarial.counterCase}
                            </div>
                            {adversarial.concerns?.length > 0 && (
                              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#b0c4de', lineHeight: 1.75 }}>
                                {adversarial.concerns.map((c: string, i: number) => (
                                  <li key={i} style={{ marginBottom: 3 }}>{c}</li>
                                ))}
                              </ul>
                            )}
                            {adversarial.alternativeAction && (
                              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 3, fontSize: 12, color: '#8899bb' }}>
                                <strong style={{ color: '#7c6aff' }}>Alternative: </strong>{adversarial.alternativeAction}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Multi-TF alignment + IV context + sizing */}
                        {(aiResult.multiTFAlignment || aiResult.ivContext || aiResult.sizingNote) && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' as const }}>
                            {aiResult.multiTFAlignment && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 0.5,
                                background: aiResult.multiTFAlignment.includes('all-bull') ? 'rgba(0,255,136,0.1)' : aiResult.multiTFAlignment.includes('all-bear') ? 'rgba(255,77,109,0.1)' : 'rgba(255,183,0,0.1)',
                                color: aiResult.multiTFAlignment.includes('all-bull') ? '#00ff88' : aiResult.multiTFAlignment.includes('all-bear') ? '#ff4d6d' : '#ffb700',
                                border: `1px solid ${aiResult.multiTFAlignment.includes('all-bull') ? 'rgba(0,255,136,0.3)' : aiResult.multiTFAlignment.includes('all-bear') ? 'rgba(255,77,109,0.3)' : 'rgba(255,183,0,0.3)'}`,
                              }}>TF: {aiResult.multiTFAlignment}</span>
                            )}
                            {aiResult.ivContext && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                                background: aiResult.ivContext === 'cheap' ? 'rgba(0,255,136,0.1)' : aiResult.ivContext === 'expensive' ? 'rgba(255,77,109,0.1)' : 'rgba(255,255,255,0.06)',
                                color: aiResult.ivContext === 'cheap' ? '#00ff88' : aiResult.ivContext === 'expensive' ? '#ff4d6d' : '#8899bb',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}>IV: {aiResult.ivContext}</span>
                            )}
                            {aiResult.sizingNote && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                                background: aiResult.sizingNote.startsWith('full') ? 'rgba(0,229,255,0.1)' : aiResult.sizingNote.startsWith('half') ? 'rgba(255,183,0,0.1)' : 'rgba(255,77,109,0.1)',
                                color: aiResult.sizingNote.startsWith('full') ? '#00e5ff' : aiResult.sizingNote.startsWith('half') ? '#ffb700' : '#ff4d6d',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}>SIZE: {aiResult.sizingNote}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {aiResult.todaysEdge && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>Today's Edge</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.todaysEdge}</div>
                      </div>
                    )}
                    {aiResult.accountability && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 11, color: '#ff6b00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(255,107,0,0.5)' }}>Accountability</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.accountability}</div>
                      </div>
                    )}
                    {aiResult.riskFlag && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(204,16,64,0.1)', background: 'rgba(204,16,64,0.03)' }}>
                        <div style={{ fontSize: 11, color: '#ff1a4a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(255,26,74,0.5)' }}>⚠ Risk Flag</div>
                        <div style={{ fontSize: 12, color: C.red, lineHeight: 1.7 }}>{aiResult.riskFlag}</div>
                      </div>
                    )}
                    {aiResult.waitReason && (aiResult.signal === 'WAIT' || aiResult.signal === 'NO TRADE') && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,183,0,0.15)', background: 'rgba(255,183,0,0.04)', borderLeft: '3px solid rgba(255,183,0,0.5)' }}>
                        <div style={{ fontSize: 11, color: '#ffb700', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6 }}>Trigger to watch</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.waitReason}</div>
                        {/* Show watch levels even on WAIT */}
                        {aiResult.entryZone && aiResult.entryZone.low > 0 && (
                          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11.5 }}>
                            <span style={{ color: '#00e5ff' }}>Watch zone: {aiResult.entryZone.low?.toFixed(0)}–{aiResult.entryZone.high?.toFixed(0)}</span>
                            {aiResult.stopLevel > 0 && <span style={{ color: '#ff4d6d' }}>Stop: {aiResult.stopLevel?.toFixed(0)}</span>}
                            {aiResult.target1 > 0 && <span style={{ color: '#00ff88' }}>Target: {aiResult.target1?.toFixed(0)}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Trade Zone placeholder now rendered below signal card — see standalone section */}
                    {aiResult && aiResult.signal !== 'WAIT' && aiResult.signal !== 'NO TRADE' && aiResult.entryZone && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,183,0,0.15)' }}>
                        {/* ── OPTIMAL TRADE ZONE (Feature 2) ── */}
                        <div style={{ marginBottom: 12, borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(255,183,0,0.06), rgba(255,140,0,0.04))',
                          border: '1px solid rgba(255,183,0,0.5)',
                          boxShadow: '0 0 20px rgba(255,183,0,0.08)',
                          padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#ffb700' }}>OPTIMAL TRADE ZONE</span>
                              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(255,183,0,0.15)',
                                color: '#ffb700', fontFamily: fontDisplay, letterSpacing: 1 }}>
                                {aiResult.signal === 'LONG' ? '▲ CALL' : '▼ PUT'}
                              </span>
                            </div>
                            {(aiResult.moveSize as number) > 0 && (
                              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#ffb700', fontFamily: fontDisplay }}>{aiResult.moveSize}pt POTENTIAL</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                            {[
                              { label: 'BUY ZONE', value: aiResult.entryZone ? `${fmt(aiResult.entryZone.low)}–${fmt(aiResult.entryZone.high)}` : '—', color: '#00e5ff',
                                sub: aiResult.entryZone && aiResult.stopLevel ? `${Math.abs(((aiResult.entryZone.low+aiResult.entryZone.high)/2) - aiResult.stopLevel).toFixed(0)}pt risk` : '' },
                              { label: 'STOP', value: fmt(aiResult.stopLevel), color: '#ff1a4a', sub: 'VWAP / EMA' },
                              { label: 'TARGET 1', value: fmt(aiResult.target1), color: '#00ff88',
                                sub: aiResult.entryZone && aiResult.target1 ? `+${Math.abs(aiResult.target1 - (aiResult.entryZone.low+aiResult.entryZone.high)/2).toFixed(0)}pts` : 'scalp' },
                              { label: 'TARGET 2', value: fmt(aiResult.target2), color: '#00d4a0',
                                sub: aiResult.entryZone && aiResult.target2 ? `+${Math.abs(aiResult.target2 - (aiResult.entryZone.low+aiResult.entryZone.high)/2).toFixed(0)}pts` : 'swing' },
                            ].map(({label, value, color, sub}) => (
                              <div key={label} style={{ background: color + '0a', border: `1px solid ${color}30`, borderRadius: 6, padding: '7px 8px' }}>
                                <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color }}>{value}</div>
                                {sub && <div style={{ fontSize: 10, color: '#4a5568', marginTop: 2 }}>{sub}</div>}
                              </div>
                            ))}
                          </div>
                          {aiResult.riskFlag && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#ffb700', padding: '4px 8px', background: 'rgba(255,183,0,0.06)', borderRadius: 4, borderLeft: '2px solid rgba(255,183,0,0.4)' }}>
                              ⚠ {aiResult.riskFlag}
                            </div>
                          )}
                        </div>
                        {/* Legacy compact grid kept for reference */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {[
                            {label:'Entry', value: aiResult.entryZone ? `${fmt(aiResult.entryZone.low)}–${fmt(aiResult.entryZone.high)}` : '—', color: signalColor},
                            {label:'Stop', value: fmt(aiResult.stopLevel), color: C.red},
                            {label:'Target 1', value: fmt(aiResult.target1), color: C.synapse},
                            {label:'Target 2', value: fmt(aiResult.target2), color: C.synapse},
                          ].map(({label, value, color}) => (
                            <div key={label} style={{ background: color + '0a', border: `1px solid ${color}25`, borderRadius: 6, padding: '7px 10px' }}>
                              <div style={{ fontSize: 9, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 3 }}>{label}</div>
                              <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live data inputs */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                  <div style={{ fontSize: 10, color: '#00d4a0', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 8 }}>Live Data Inputs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[
                      {label:'VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲ ABOVE' : '▼ BELOW') : '—', color: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? C.synapse : C.red) : C.textMuted},
                      {label:'200 EMA', value: currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? '▲ ABOVE' : '▼ BELOW') : '—', color: currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? C.synapse : C.red) : C.textMuted},
                      {label:'VIX', value: vixPrice ? (vixPrice > 25 ? 'HIGH ⚠' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL') : '—', color: vixPrice ? (vixPrice > 25 ? C.red : vixPrice > 18 ? C.fire : C.synapse) : C.textMuted},
                      {label:'Breadth', value: marketIntel?.breadth?.bias || '—', color: C.textDim},
                      {label:'Flow', value: optionsFlow.length ? `${optionsFlow.length} alerts` : '—', color: optionsFlow.length ? C.synapse : C.textMuted},
                      {label:'Tide', value: marketTide?.bias || '—', color: C.textDim},
                    ].map(({label, value, color}) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Refresh */}
                <div style={{ padding: '12px 16px' }}>
                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(), fetchOptionsFlow(), fetchMarketTide(), fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runSignal(buildSignalInput({ flow, tide, intel: intel, tiingo: tiingo2 }))
                    if (result) {
                      setAiResult(result); setAdversarial(null)
                      setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))
                      setTimeout(() => { speak(`${result.signal}. ${result.confidence}% confidence. ${result.accountability || result.riskFlag || result.marketConditions?.split('.')[0] || ''}`) }, 400)
                      // Auto-refresh strike suggestions with new signal
                      setTimeout(async () => {
                        if (!currentPrice) return
                        setStrikeLoading(true)
                        try {
                          const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
                          const minsLeft = Math.max(0, 960 - (et.getHours() * 60 + et.getMinutes()))
                          const sr = await fetch('/api/strike-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPrice, signal: result.signal, confidence: result.confidence, aiResult: result, vwapBands: marketIntel2?.vwapBands || null, gexData, volumeProfile, optionsChain: marketIntel2?.optionsChain || null, uwIV: marketIntel2?.uwIV || null, impliedMove: morningPlan.impliedMove, levels, sessionMins: minsLeft, multiTF: { m15: multiTFData?.m15 || null, h1: multiTFData?.h1 || null }, morningBias: morningPlan.bias, microstructure: microstructure ? { aiContext: microstructure.aiContext } : null, termStructure: marketIntel2?.termStructure || null, sectorRotation: marketIntel2?.sectorRotation || null, earningsCalendar: earningsCalendar || null, traderProfile: traderProfile ? { stream_weights: traderProfile.stream_weights, weaknesses: traderProfile.weaknesses, strengths: traderProfile.strengths } : null, mechanicalFlow: mechanicalFlow || null }) })
                          if (sr.ok) { const sd = await sr.json(); if (!sd.error) { setStrikeSuggestions(sd); setStrikeLastRefresh(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })) } }
                        } catch {}
                        setStrikeLoading(false)
                      }, 800)
                    }
                    setAiLoading(false)
                  }} disabled={aiLoading} style={{
                    width: '100%', background: aiLoading ? 'rgba(240,244,250,0.8)' : 'rgba(0,212,160,0.08)',
                    border: `1px solid ${aiLoading ? 'rgba(100,140,220,0.15)' : 'rgba(0,212,160,0.25)'}`,
                    borderRadius: 8, padding: '10px 0', color: aiLoading ? C.textMuted : C.violet,
                    cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: font, fontSize: 12, fontWeight: 700, letterSpacing: '0.5px'
                  }}>{aiLoading ? '⟳  Analyzing...' : '▶  Get AI Signal'}</button>
                </div>
              </div>

              {/* ── NAMED SETUP EVALUATOR — name your play, score it ──────── */}
              <div style={{ borderTop: '1px solid rgba(124,106,255,0.15)', background: 'rgba(0,0,0,0.15)' }}>
                <div style={{ padding: '10px 16px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: '#7c6aff', letterSpacing: 2 }}>NAME YOUR PLAY</span>
                    {selectedSetup && (
                      <button onClick={() => { setSelectedSetup(null); setSetupEval(null) }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b7a9a', cursor: 'pointer', fontFamily: font }}>Clear</button>
                    )}
                  </div>
                  {/* Setup dropdown */}
                  {/* Custom dropdown — native select can't reliably color options across browsers */}
                  <div style={{ position: 'relative' as const, marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setSetupDropdownOpen(v => !v)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(124,106,255,0.25)', borderRadius: 5, padding: '8px 10px', fontSize: 12, fontFamily: font, cursor: 'pointer', textAlign: 'left' as const, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        color: selectedSetup ? (SETUPS.find(s => s.id === selectedSetup)?.direction === 'LONG' ? '#00ff88' : '#ff4d6d') : '#e2e8f0',
                      }}
                    >
                      <span>
                        {selectedSetup
                          ? `${SETUPS.find(s => s.id === selectedSetup)?.direction === 'LONG' ? '▲' : '▼'} ${SETUPS.find(s => s.id === selectedSetup)?.name}`
                          : '— Select setup to evaluate —'}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#6b7a9a' }}>{setupDropdownOpen ? '▴' : '▾'}</span>
                    </button>
                    {setupDropdownOpen && (
                      <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, marginTop: 2, background: '#0a0d18', border: '1px solid rgba(124,106,255,0.35)', borderRadius: 5, maxHeight: 320, overflowY: 'auto' as const, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <div
                          onClick={() => { setSelectedSetup(null); setSetupDropdownOpen(false) }}
                          style={{ padding: '8px 10px', fontSize: 12, color: '#6b7a9a', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', fontStyle: 'italic' as const }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          — Clear selection —
                        </div>
                        {SETUPS.map(s => {
                          const color = s.direction === 'LONG' ? '#00ff88' : '#ff4d6d'
                          const arrow = s.direction === 'LONG' ? '▲' : '▼'
                          return (
                            <div
                              key={s.id}
                              onClick={() => { setSelectedSetup(s.id); setSetupDropdownOpen(false) }}
                              style={{ padding: '8px 10px', fontSize: 13, color, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: selectedSetup === s.id ? 700 : 500, background: selectedSetup === s.id ? 'rgba(124,106,255,0.08)' : 'transparent' }}
                              onMouseEnter={e => (e.currentTarget.style.background = selectedSetup === s.id ? 'rgba(124,106,255,0.12)' : 'rgba(255,255,255,0.04)')}
                              onMouseLeave={e => (e.currentTarget.style.background = selectedSetup === s.id ? 'rgba(124,106,255,0.08)' : 'transparent')}
                            >
                              <span style={{ width: 12, fontWeight: 800 }}>{arrow}</span>
                              <span style={{ flex: 1 }}>{s.name}</span>
                              <span style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1, fontWeight: 700 }}>{s.direction}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Evaluation result */}
                {setupEval && (
                  <div style={{ padding: '0 16px 14px' }}>
                    {/* Score banner */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 7,
                      background: setupEval.rating === 'STRONG' ? 'rgba(0,255,136,0.08)' : setupEval.rating === 'GOOD' ? 'rgba(0,229,255,0.06)' : setupEval.rating === 'NEUTRAL' ? 'rgba(255,183,0,0.06)' : 'rgba(255,77,109,0.06)',
                      border: `1px solid ${setupEval.rating === 'STRONG' ? 'rgba(0,255,136,0.25)' : setupEval.rating === 'GOOD' ? 'rgba(0,229,255,0.2)' : setupEval.rating === 'NEUTRAL' ? 'rgba(255,183,0,0.2)' : 'rgba(255,77,109,0.2)'}`,
                      marginBottom: 10,
                    }}>
                      <div>
                        <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 900, color: setupEval.rating === 'STRONG' ? '#00ff88' : setupEval.rating === 'GOOD' ? '#00e5ff' : setupEval.rating === 'NEUTRAL' ? '#ffb700' : setupEval.rating === 'WEAK' ? '#f59e0b' : '#ff4d6d' }}>{setupEval.rating}</div>
                        <div style={{ fontSize: 11.5, color: '#8899bb', marginTop: 1 }}>{setupEval.verdict}</div>
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 900, color: setupEval.rating === 'STRONG' ? '#00ff88' : setupEval.rating === 'GOOD' ? '#00e5ff' : setupEval.rating === 'NEUTRAL' ? '#ffb700' : '#ff4d6d', lineHeight: 1 }}>{setupEval.score}</div>
                        <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 1 }}>SCORE /100</div>
                      </div>
                    </div>

                    {/* Trigger condition (if not yet ready) */}
                    {setupEval.triggerCondition && (
                      <div style={{ padding: '7px 10px', borderRadius: 5, background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.2)', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ffb700', letterSpacing: 1, marginBottom: 3 }}>TRIGGER TO WATCH</div>
                        <div style={{ fontSize: 11.5, color: '#f0f4ff' }}>{setupEval.triggerCondition}</div>
                      </div>
                    )}

                    {/* Criteria list */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9a', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' as const }}>Criteria ({setupEval.confirmingCount} ✓ {setupEval.contradictingCount} ✗)</div>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
                        {setupEval.criteria.map((cr, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '4px 8px', borderRadius: 4, background: cr.status === 'PASS' ? 'rgba(0,255,136,0.04)' : cr.status === 'FAIL' ? 'rgba(255,77,109,0.04)' : 'rgba(255,255,255,0.02)' }}>
                            <span style={{ fontSize: 12, color: cr.status === 'PASS' ? '#00ff88' : cr.status === 'FAIL' ? '#ff4d6d' : '#6b7a9a', width: 14, flexShrink: 0 }}>{cr.status === 'PASS' ? '✓' : cr.status === 'FAIL' ? '✗' : '○'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11.5, color: '#e2e8f0', marginBottom: 1 }}>{cr.label}</div>
                              <div style={{ fontSize: 11, color: '#6b7a9a' }}>{cr.detail}</div>
                            </div>
                            <span style={{ fontSize: 10, color: '#4a5568', fontWeight: 700 }}>×{cr.weight}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer info */}
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7a9a', flexWrap: 'wrap' as const, padding: '6px 9px', borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
                      {setupEval.invalidationPrice && <span>Invalid {setupEval.setup.direction === 'LONG' ? 'below' : 'above'} <strong style={{ color: '#ff4d6d', fontFamily: fontDisplay }}>{setupEval.invalidationPrice.toFixed(0)}</strong></span>}
                      <span>⏱ {setupEval.timingWindow}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── TRADE TICKET ──────────────────────────────────────────── */}
              {(() => {
                const isOpen   = ticket.status === 'open'
                const isClosed = ticket.status === 'closed'
                const entryNum  = parseFloat(ticket.entryPrice) || 0
                const exitNum   = parseFloat(ticket.exitPrice)  || 0
                const qtyNum    = parseInt(ticket.qty) || 1
                const pnlPts    = exitNum - entryNum
                const pnlDollar = pnlPts * qtyNum * 100
                const pnlPct    = entryNum > 0 ? (pnlPts / entryNum * 100) : 0
                const isProfit  = pnlDollar >= 0
                const accentCol = isOpen ? '#f59e0b' : isClosed ? (isProfit ? '#00ff88' : '#ff4d6d') : '#00e5ff'

                const handleBuy = () => {
                  if (!ticket.strike || !ticket.entryPrice) return
                  const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })
                  setTicket(t => ({ ...t, status: 'open', openedAt: now }))
                }

                const handleSell = async () => {
                  if (!ticket.exitPrice) return
                  const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })
                  const pnl = (parseFloat(ticket.exitPrice) - parseFloat(ticket.entryPrice)) * parseInt(ticket.qty) * 100
                  setTicket(t => ({ ...t, status: 'closed', closedAt: now }))
                  setTradeSaving(true)
                  // Capture mechanical flow snapshot at entry for tracking
                  const mechSnap = mechanicalFlow ? {
                    score:           mechanicalFlow.mechanicalScore,
                    bias:            mechanicalFlow.mechanicalBias,
                    asymmetric:      mechanicalFlow.asymmetricSetup,
                    hedgingDir:      mechanicalFlow.hedgingDirection,
                    charm:           mechanicalFlow.charmIntensity,
                  } : null
                  // Capture predicted window from strike suggestions if available
                  const windowSnap = strikeSuggestions?.bestEntryWindow || null
                  // Capture actionability verdict at trade entry
                  const actSnap = actionability ? {
                    verdict:    actionability.verdict,
                    setupType:  actionability.setupType,
                    greens:     actionability.greenLights?.length || 0,
                    flags:      actionability.redFlags?.length || 0,
                  } : null
                  const setupSnap = setupEval ? {
                    name:      setupEval.setup.name,
                    id:        setupEval.setup.id,
                    score:     setupEval.score,
                    rating:    setupEval.rating,
                  } : null
                  try {
                    await fetch('/api/userdata', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        table: 'trade',
                        data: {
                          date:      new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
                          time:      ticket.openedAt,
                          symbol:    `SPX ${ticket.strike}${ticket.optionType === 'call' ? 'C' : 'P'} ${ticket.expiry || '0DTE'}`,
                          direction: ticket.optionType === 'call' ? 'LONG' : 'SHORT',
                          side:      'buy',
                          qty:       parseInt(ticket.qty) || 1,
                          price:     parseFloat(ticket.entryPrice),
                          pnl:       parseFloat(pnl.toFixed(2)),
                          inSystem:  true,
                          notes:     `Entry ${ticket.entryPrice} → Exit ${ticket.exitPrice} | Closed ${now} ET${ticket.notes ? ' | ' + ticket.notes : ''}${windowSnap ? ' | Predicted window: ' + windowSnap.substring(0, 80) : ''}${mechSnap ? ' | Mech: ' + mechSnap.bias + ' ' + mechSnap.score + (mechSnap.asymmetric !== 'NEUTRAL' ? ' (' + mechSnap.asymmetric + ')' : '') : ''}${actSnap ? ' | Act: ' + actSnap.verdict + ' (' + actSnap.setupType + ', ' + actSnap.greens + 'G/' + actSnap.flags + 'R)' : ''}${setupSnap ? ' | Play: ' + setupSnap.name + ' ' + setupSnap.score + '/100 (' + setupSnap.rating + ')' : ''}`,
                        }
                      })
                    })
                  } catch (e) { console.warn('Trade save failed:', e) }
                  setTradeSaving(false)
                }

                const inp = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '7px 10px', color: '#e2e8f0', fontSize: 12, fontFamily: font, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
                const lbl = { fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1 as const, marginBottom: 3, display: 'block', textTransform: 'uppercase' as const }

                return (
                  <div style={{ borderTop: `1px solid ${accentCol}20`, background: 'rgba(0,0,0,0.15)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentCol, boxShadow: isOpen ? `0 0 8px ${accentCol}` : 'none' }} />
                        <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: accentCol, letterSpacing: 1 }}>
                          {isClosed ? 'TRADE CLOSED' : isOpen ? '● IN TRADE' : 'TRADE TICKET'}
                        </span>
                        {isOpen && ticket.openedAt && <span style={{ fontSize: 11, color: '#6b7a9a' }}>since {ticket.openedAt} ET</span>}
                      </div>
                      {(isOpen || isClosed) && (
                        <button onClick={() => setTicket({ strike: '', optionType: 'call', expiry: '', entryPrice: '', qty: '1', exitPrice: '', status: 'idle', openedAt: null, closedAt: null, notes: '' })}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b7a9a', cursor: 'pointer', fontFamily: font }}>New</button>
                      )}
                    </div>

                    <div style={{ padding: '10px 16px 14px' }}>
                      {/* Row 1: Strike + Type + Expiry */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 7, marginBottom: 8 }}>
                        <div><span style={lbl}>SPX Strike</span>
                          <input type="number" placeholder={currentPrice ? Math.round(currentPrice).toString() : '5820'} value={ticket.strike}
                            onChange={e => setTicket(t => ({ ...t, strike: e.target.value }))} disabled={isOpen || isClosed}
                            style={{ ...inp, borderColor: ticket.strike ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.08)' }} />
                        </div>
                        <div><span style={lbl}>Type</span>
                          <select value={ticket.optionType} onChange={e => setTicket(t => ({ ...t, optionType: e.target.value as 'call' | 'put' }))}
                            disabled={isOpen || isClosed}
                            style={{ ...inp, color: ticket.optionType === 'call' ? '#00ff88' : '#ff4d6d', cursor: 'pointer', padding: '6px 6px' }}>
                            <option value="call">CALL</option>
                            <option value="put">PUT</option>
                          </select>
                        </div>
                        <div><span style={lbl}>Expiry</span>
                          <input type="text" placeholder="0DTE" value={ticket.expiry}
                            onChange={e => setTicket(t => ({ ...t, expiry: e.target.value }))} disabled={isOpen || isClosed} style={inp} />
                        </div>
                      </div>

                      {/* Row 2: Entry + Qty */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 7, marginBottom: 8 }}>
                        <div><span style={lbl}>Entry Premium ($)</span>
                          <input type="number" step="0.05" placeholder="12.50" value={ticket.entryPrice}
                            onChange={e => setTicket(t => ({ ...t, entryPrice: e.target.value }))} disabled={isOpen || isClosed}
                            style={{ ...inp, borderColor: ticket.entryPrice ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)' }} />
                        </div>
                        <div><span style={lbl}>Contracts</span>
                          <input type="number" min="1" placeholder="1" value={ticket.qty}
                            onChange={e => setTicket(t => ({ ...t, qty: e.target.value }))} disabled={isOpen || isClosed} style={inp} />
                        </div>
                      </div>

                      {/* BUY button */}
                      {ticket.status === 'idle' && (
                        <button onClick={handleBuy} disabled={!ticket.strike || !ticket.entryPrice}
                          style={{ width: '100%', padding: '9px 0', borderRadius: 7, border: 'none', marginBottom: 2,
                            cursor: !ticket.strike || !ticket.entryPrice ? 'not-allowed' : 'pointer',
                            background: !ticket.strike || !ticket.entryPrice ? 'rgba(0,255,136,0.06)' : 'rgba(0,255,136,0.15)',
                            color: !ticket.strike || !ticket.entryPrice ? 'rgba(0,255,136,0.25)' : '#00ff88',
                            fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>
                          {ticket.optionType === 'call' ? '▲' : '▼'} BUY {ticket.optionType.toUpperCase()}
                        </button>
                      )}

                      {/* Open state: cost basis + exit + sell */}
                      {isOpen && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 8, marginTop: 2 }}>
                            {[
                              { label: 'Cost Basis', val: `$${(entryNum * qtyNum * 100).toFixed(0)}` },
                              { label: 'Entry', val: `$${entryNum.toFixed(2)}` },
                              { label: 'Contracts', val: `${qtyNum}` },
                            ].map((s, i) => (
                              <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(255,183,0,0.06)', borderRadius: 5, padding: '5px 3px', border: '1px solid rgba(255,183,0,0.1)' }}>
                                <div style={{ fontSize: 10, color: '#4a5568' }}>{s.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontFamily: fontDisplay }}>{s.val}</div>
                              </div>
                            ))}
                          </div>

                          <div style={{ marginBottom: 8 }}>
                            <span style={lbl}>Exit Price (to close)</span>
                            <input type="number" step="0.05" placeholder="18.00" value={ticket.exitPrice}
                              onChange={e => setTicket(t => ({ ...t, exitPrice: e.target.value }))}
                              style={{ ...inp, borderColor: ticket.exitPrice ? 'rgba(255,77,109,0.35)' : 'rgba(255,255,255,0.08)' }} />
                          </div>

                          {ticket.exitPrice && exitNum > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 8 }}>
                              {[
                                { label: 'P&L ($)', val: `${pnlDollar >= 0 ? '+' : ''}$${pnlDollar.toFixed(0)}` },
                                { label: 'P&L (%)', val: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` },
                                { label: 'Per Contract', val: `${pnlPts >= 0 ? '+' : ''}$${(pnlPts * 100).toFixed(0)}` },
                              ].map((s, i) => (
                                <div key={i} style={{ textAlign: 'center' as const, background: isProfit ? 'rgba(0,255,136,0.07)' : 'rgba(255,77,109,0.07)', borderRadius: 5, padding: '5px 3px', border: `1px solid ${isProfit ? 'rgba(0,255,136,0.15)' : 'rgba(255,77,109,0.15)'}` }}>
                                  <div style={{ fontSize: 10, color: '#4a5568' }}>{s.label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: isProfit ? '#00ff88' : '#ff4d6d', fontFamily: fontDisplay }}>{s.val}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                            <button onClick={handleSell} disabled={!ticket.exitPrice || tradeSaving}
                              style={{ padding: '9px 0', borderRadius: 7, border: 'none',
                                cursor: !ticket.exitPrice || tradeSaving ? 'not-allowed' : 'pointer',
                                background: !ticket.exitPrice ? 'rgba(255,77,109,0.06)' : 'rgba(255,77,109,0.15)',
                                color: !ticket.exitPrice ? 'rgba(255,77,109,0.25)' : '#ff4d6d',
                                fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>
                              {tradeSaving ? '⟳ Saving...' : '✕ SELL / CLOSE'}
                            </button>
                            <input type="text" placeholder="Notes..." value={ticket.notes}
                              onChange={e => setTicket(t => ({ ...t, notes: e.target.value }))}
                              style={{ ...inp, fontSize: 11.5, padding: '7px 8px' }} />
                          </div>
                        </>
                      )}

                      {/* Closed: final P&L */}
                      {isClosed && (
                        <div style={{ textAlign: 'center' as const, padding: '4px 0 2px' }}>
                          <div style={{ fontSize: 30, fontWeight: 900, color: isProfit ? '#00ff88' : '#ff4d6d', fontFamily: fontDisplay, lineHeight: 1.1 }}>
                            {pnlDollar >= 0 ? '+' : ''}${pnlDollar.toFixed(0)}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 4, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: isProfit ? '#00d4a0' : '#ff4d6d', fontWeight: 700 }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                            <span style={{ fontSize: 12, color: '#6b7a9a' }}>{entryNum.toFixed(2)} → {exitNum.toFixed(2)}</span>
                            <span style={{ fontSize: 12, color: '#6b7a9a' }}>{qtyNum} ct</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#4a5568' }}>
                            {ticket.openedAt} → {ticket.closedAt} ET
                            {tradeSaving && <span style={{ color: '#f59e0b', marginLeft: 8 }}>Saving...</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* ── STRIKE SUGGESTIONS PANEL ─────────────────────────────── */}
            <div style={{ width: 300, background: 'rgba(6,8,16,0.98)', borderLeft: '1px solid rgba(0,229,255,0.08)', overflowY: 'auto', flexShrink: 0 }}>
              {/* Header */}
              <div style={{ padding: '11px 13px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(6,8,16,0.99)', zIndex: 2 }}>
                <div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 800, color: '#00e5ff', letterSpacing: 2 }}>STRIKE IDEAS</div>
                  {strikeLastRefresh && <div style={{ fontSize: 10, color: '#4a5568', marginTop: 1 }}>Updated {strikeLastRefresh} ET</div>}
                </div>
                <button
                  onClick={async () => {
                    if (!currentPrice) return
                    setStrikeLoading(true)
                    try {
                      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
                      const ml = Math.max(0, 960 - (et.getHours() * 60 + et.getMinutes()))
                      const sr = await fetch('/api/strike-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPrice, signal: aiResult?.signal || null, confidence: aiResult?.confidence || null, aiResult: aiResult || null, vwapBands: marketIntel2?.vwapBands || null, gexData, volumeProfile, optionsChain: marketIntel2?.optionsChain || null, uwIV: marketIntel2?.uwIV || null, impliedMove: morningPlan.impliedMove, levels, sessionMins: ml, multiTF: { m15: multiTFData?.m15 || null, h1: multiTFData?.h1 || null }, morningBias: morningPlan.bias, microstructure: microstructure ? { aiContext: microstructure.aiContext } : null, termStructure: marketIntel2?.termStructure || null, sectorRotation: marketIntel2?.sectorRotation || null, earningsCalendar: earningsCalendar || null, traderProfile: traderProfile ? { stream_weights: traderProfile.stream_weights, weaknesses: traderProfile.weaknesses, strengths: traderProfile.strengths } : null, mechanicalFlow: mechanicalFlow || null }) })
                      if (sr.ok) { const sd = await sr.json(); if (!sd.error) { setStrikeSuggestions(sd); setStrikeLastRefresh(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })) } }
                    } catch {}
                    setStrikeLoading(false)
                  }}
                  disabled={strikeLoading || !currentPrice}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.2)', background: 'transparent', color: '#00e5ff', cursor: strikeLoading || !currentPrice ? 'not-allowed' : 'pointer', fontFamily: font, opacity: strikeLoading || !currentPrice ? 0.4 : 1 }}
                >{strikeLoading ? '⟳' : '↺'}</button>
              </div>

              <div style={{ padding: '10px 12px' }}>
                {strikeLoading && !strikeSuggestions && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '20px 0', justifyContent: 'center' }}>
                    <div style={{ width: 10, height: 10, border: '1.5px solid rgba(0,229,255,0.2)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 12, color: '#4a5568' }}>Analyzing levels...</span>
                  </div>
                )}

                {!strikeSuggestions && !strikeLoading && (
                  <div style={{ padding: '16px 4px', textAlign: 'center' as const }}>
                    
                    <div style={{ fontSize: 11.5, color: '#4a5568', marginBottom: 8 }}>Get a signal to see AI-ranked strike recommendations</div>
                    <div style={{ fontSize: 11, color: '#333d50', lineHeight: 1.6 }}>Uses VWAP · POC · GEX walls · Max pain · IV rank · Session time · Implied move</div>
                  </div>
                )}

                {strikeSuggestions && (() => {
                  const s = strikeSuggestions
                  const dc = s.direction === 'LONG' ? '#00ff88' : s.direction === 'SHORT' ? '#ff4d6d' : '#f59e0b'
                  const tc = (t: string) => t === 'AGGRESSIVE' ? '#ff4d6d' : t === 'STANDARD' ? '#00e5ff' : '#00d4a0'
                  return (
                    <div>
                      {/* Direction + IV */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 4, background: `${dc}12`, color: dc, border: `1px solid ${dc}28`, fontFamily: fontDisplay }}>{s.direction === 'LONG' ? '▲ CALL' : s.direction === 'SHORT' ? '▼ PUT' : '⟳'}</span>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: s.ivAssessment === 'expensive' ? 'rgba(255,77,109,0.1)' : s.ivAssessment === 'cheap' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)', color: s.ivAssessment === 'expensive' ? '#ff4d6d' : s.ivAssessment === 'cheap' ? '#00ff88' : '#8899bb', border: '1px solid rgba(255,255,255,0.07)' }}>IV {s.ivAssessment?.toUpperCase()}</span>
                      </div>

                      {/* Entry window */}
                      {s.bestEntryWindow && (
                        <div style={{ padding: '7px 9px', borderRadius: 5, background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#00e5ff', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>BEST ENTRY WINDOW</div>
                          <div style={{ fontSize: 11.5, color: '#b0c4de', lineHeight: 1.5 }}>{s.bestEntryWindow}</div>
                        </div>
                      )}

                      {/* Warnings */}
                      {(s.charmWarning || s.setupWarning) && (
                        <div style={{ padding: '6px 9px', borderRadius: 5, background: 'rgba(255,183,0,0.05)', border: '1px solid rgba(255,183,0,0.18)', marginBottom: 8 }}>
                          {s.charmWarning && <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 1 }}>⚠ {s.charmWarning}</div>}
                          {s.setupWarning && <div style={{ fontSize: 11, color: '#f59e0b' }}>⚠ {s.setupWarning}</div>}
                        </div>
                      )}

                      {/* Strikes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {(s.strikes || []).map((st: any, i: number) => {
                          const isTop = st.strike === s.topPick
                          const c = tc(st.tier)
                          const pnl = st.targetExit && st.entryPremiumHigh ? `+$${((st.targetExit - st.entryPremiumHigh) * 100).toFixed(0)}` : null
                          return (
                            <div key={i}
                              onClick={() => setTicket(t => ({ ...t, strike: st.strike.toString(), optionType: st.type, entryPrice: st.entryPremiumLow?.toFixed(2) || '' }))}
                              style={{ borderRadius: 7, border: `1px solid ${isTop ? c + '45' : 'rgba(255,255,255,0.06)'}`, background: isTop ? `${c}07` : 'rgba(0,0,0,0.18)', padding: '9px 11px', cursor: 'pointer', position: 'relative' as const }}>
                              {isTop && <div style={{ position: 'absolute', top: -1, right: 7, fontSize: 9, fontWeight: 800, color: c, background: `${c}18`, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: 1 }}>★ TOP</div>}

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ fontFamily: fontDisplay, fontSize: 19, fontWeight: 900, color: c }}>{st.strike}</span>
                                  <span style={{ fontSize: 11, color: st.type === 'call' ? '#00ff88' : '#ff4d6d', fontWeight: 700 }}>{st.type?.toUpperCase()}</span>
                                  {st.itmDepth > 0 && <span style={{ fontSize: 10, color: '#4a5568' }}>{st.itmDepth}pts ITM</span>}
                                </div>
                                <div style={{ textAlign: 'right' as const }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: 0.5 }}>{st.tier}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                                    <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${st.probabilityScore}%`, background: st.probabilityScore >= 70 ? '#00ff88' : st.probabilityScore >= 50 ? '#f59e0b' : '#ff4d6d', borderRadius: 1 }} />
                                    </div>
                                    <span style={{ fontSize: 10, color: '#6b7a9a' }}>{st.probabilityScore}%</span>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4, flexWrap: 'wrap' as const }}>
                                {st.entryPremiumLow && st.entryPremiumHigh && <span style={{ color: '#00ff88' }}>Buy ${st.entryPremiumLow?.toFixed(2)}–${st.entryPremiumHigh?.toFixed(2)}</span>}
                                {st.estimatedDelta && <span style={{ color: '#7c6aff' }}>Δ{st.estimatedDelta?.toFixed(2)}</span>}
                                {st.targetExit && <span style={{ color: '#00e5ff' }}>→ ${st.targetExit?.toFixed(2)}</span>}
                                {st.stopPremium && <span style={{ color: '#ff4d6d' }}>✕ ${st.stopPremium?.toFixed(2)}</span>}
                              </div>
                              {/* P&L and confluence */}
                              <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4 }}>
                                {st.estPnlPerContract && st.estPnlPerContract !== 0 && (
                                  <span style={{ color: st.estPnlPerContract > 0 ? '#00d4a0' : '#ff4d6d', fontWeight: 700 }}>
                                    {st.estPnlPerContract > 0 ? '+' : ''}${st.estPnlPerContract}/ct
                                  </span>
                                )}
                                {st.confluenceScore && (
                                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                                    background: st.confluenceScore === 'HIGH' ? 'rgba(0,255,136,0.1)' : st.confluenceScore === 'MEDIUM' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
                                    color: st.confluenceScore === 'HIGH' ? '#00ff88' : st.confluenceScore === 'MEDIUM' ? '#f59e0b' : '#4a5568',
                                  }}>CONF: {st.confluenceScore}</span>
                                )}
                              </div>

                              {st.keyLevel && <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 3 }}>📍 {st.keyLevel}</div>}
                              <div style={{ fontSize: 11, color: '#7a8aaa', lineHeight: 1.45 }}>{st.rationale}</div>
                              {st.microNote && <div style={{ fontSize: 10, color: '#00e5ff', marginTop: 3, fontStyle: 'italic' }}>{st.microNote}</div>}
                              {st.avoid && st.avoidReason && <div style={{ marginTop: 4, fontSize: 10, color: '#ff4d6d', background: 'rgba(255,77,109,0.07)', padding: '3px 6px', borderRadius: 3 }}>⚠ {st.avoidReason}</div>}
                              <div style={{ marginTop: 4, fontSize: 9, color: '#333d50', textAlign: 'right' as const }}>tap → fill ticket</div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Math target/stop from signal */}
                      {(s.mathTarget || s.mathStop) && (
                        <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 5, background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)' }}>
                          <div style={{ fontSize: 10, color: '#00e5ff', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>SIGNAL MATH (delta-adjusted)</div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                            {s.mathTarget && <span style={{ color: '#00d4a0' }}>Target → ${s.mathTarget.premium} (+${s.mathTarget.pnl}/ct)</span>}
                            {s.mathStop && <span style={{ color: '#ff4d6d' }}>Stop → ${s.mathStop.premium} (-${s.mathStop.loss}/ct)</span>}
                          </div>
                        </div>
                      )}

                      {/* High confluence zones */}
                      {s.highConflZones?.length > 0 && (
                        <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 5, background: 'rgba(255,183,0,0.04)', border: '1px solid rgba(255,183,0,0.12)' }}>
                          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>★ HIGH CONFLUENCE ZONES</div>
                          {s.highConflZones.slice(0, 3).map((z: any, i: number) => (
                            <div key={i} style={{ fontSize: 11, color: '#b0c4de', padding: '1px 0' }}>
                              <strong style={{ color: '#f59e0b', fontFamily: fontDisplay }}>{z.price.toFixed(0)}</strong>: {z.label} + {z.nearbyLabels?.join(' + ')}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sector note */}
                      {s.sectorNote && (
                        <div style={{ marginTop: 6, padding: '5px 9px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#6b7a9a' }}>
                          {s.sectorNote}
                        </div>
                      )}

                      {/* Key levels */}
                      {s.keyLevels?.length > 0 && (
                        <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 5, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize: 10, color: '#333d50', fontWeight: 700, letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' as const }}>Levels Used</div>
                          {s.keyLevels.slice(0, 8).map((l: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0', color: l.type === 'gravity' ? '#f59e0b' : l.type === 'gamma' ? '#7c6aff' : l.type === 'resistance' ? '#ff4d6d' : '#00ff88' }}>
                              <span>{l.label}</span>
                              <span style={{ fontFamily: fontDisplay, fontWeight: 700 }}>{l.price.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* RIGHT — Checklist */}
            <div style={{ width: 280, background: 'rgba(12,15,26,0.98)', borderLeft: `1px solid rgba(0,212,160,0.1)`, overflowY: 'auto', padding: '14px 12px', flexShrink: 0, boxShadow: '-2px 0 8px rgba(100,140,220,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: '#8899bb', letterSpacing: 1 }}>PRE-TRADE CHECK</div>
                <div style={{ background: gradeColor + '15', border: `1px solid ${gradeColor}40`, borderRadius: 8, padding: '4px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900, color: gradeColor }}>{grade}</span>
                  <span style={{ fontSize: 11.5, color: gradeColor, opacity: 0.7 }}>{score}/13</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(score/13)*100}%`, background: gradeColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
              </div>
              {/* Edit toggle */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button onClick={() => setEditingChecklist(!editingChecklist)} style={{ fontSize: 11.5, color: C.teal, background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontFamily: font }}>
                  {editingChecklist ? '✓ Done' : '✎ Edit'}
                </button>
              </div>

              {editingChecklist ? (
                /* Edit mode */
                <div>
                  {customChecklist.map((item: any, idx: number) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <input value={item.label} onChange={e => setCustomChecklist((p: any[]) => p.map((c, i) => i === idx ? {...c, label: e.target.value} : c))}
                        style={{ flex: 1, background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '5px 8px', color: C.text, fontSize: 12, outline: 'none', fontFamily: font }} />
                      <select value={item.category} onChange={e => setCustomChecklist((p: any[]) => p.map((c, i) => i === idx ? {...c, category: e.target.value} : c))}
                        style={{ background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '5px 4px', color: C.textDim, fontSize: 11.5, outline: 'none', fontFamily: font }}>
                        {['TIMING','CONFLUENCE','RISK','SYSTEM'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <button onClick={() => setCustomChecklist((p: any[]) => p.filter((_: any, i: number) => i !== idx))}
                        style={{ color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newCheckItem.trim()) { setCustomChecklist((p: any[]) => [...p, { id: Date.now().toString(), category: 'SYSTEM', label: newCheckItem.trim() }]); setNewCheckItem('') }}}
                      placeholder="Add new item, press Enter..."
                      style={{ flex: 1, background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 5, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', fontFamily: font }} />
                  </div>
                  <button onClick={() => setCustomChecklist(CHECKLIST)} style={{ marginTop: 8, fontSize: 11.5, color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: font, padding: 0 }}>↺ Reset to defaults</button>
                </div>
              ) : (
                /* View mode */
                ['TIMING','CONFLUENCE','RISK','SYSTEM'].map(cat => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#00d4a0', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: '1px solid rgba(0,212,160,0.12)' }}>{cat}</div>
                    {customChecklist.filter((c: any) => c.category === cat).map((item: any) => (
                      <div key={item.id} onClick={() => setChecked(p => ({...p, [item.id]: !p[item.id]}))}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 3, cursor: 'pointer',
                          background: checked[item.id] ? 'rgba(0,170,85,0.08)' : 'transparent',
                          border: `1px solid ${checked[item.id] ? 'rgba(0,170,85,0.25)' : 'rgba(100,140,220,0.12)'}`,
                          transition: 'all 0.12s' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked[item.id] ? C.synapse : 'rgba(100,140,220,0.3)'}`, background: checked[item.id] ? C.synapse : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                          {checked[item.id] && <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, color: checked[item.id] ? '#e8f0ff' : '#7a8aaa', lineHeight: 1.4, fontWeight: checked[item.id] ? 500 : 400 }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}


        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 2 — COCKPIT */}
        {/* ═══════════════════════════════════════════════════════ */}
        {tab === 'deepdive' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Top row */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

              {/* Left panel */}
              <div style={{ width: 180, background: 'rgba(12,15,26,0.98)', borderRight: `1px solid rgba(0,212,160,0.1)`, padding: 10, overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Auto Levels</div>
                {[
                  { label: 'SPY VWAP', price: levels.spyVwap, color: C.fire },
                  { label: '200 EMA', price: levels.ema200, color: C.teal },
                  { label: 'PDH', price: levels.pdh, color: C.blue },
                  { label: 'PDL', price: levels.pdl, color: C.red },
                  { label: 'Day Open', price: levels.dayOpen, color: C.fire },
                  { label: 'Prev Close', price: levels.prevClose, color: C.textDim },
                  { label: '+Impl Move', price: levels.impliedHigh, color: C.synapse },
                  { label: '-Impl Move', price: levels.impliedLow, color: C.red },
                ].map(({ label, price, color }) => {
                  const active = !!(currentPrice && price && Math.abs(currentPrice - price) < 5)
                  return (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 7px', borderRadius: 3, marginBottom: 2, background: active ? color + '12' : 'transparent', border: `1px solid ${active ? color + '40' : C.border}` }}>
                      <span style={{ fontSize: 11.5, color: active ? color : C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: active ? color : C.text }}>{fmt(price)}</span>
                    </div>
                  )
                })}

                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${C.teal}30,transparent)`, margin: '8px 0' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Drawing Tools</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                  {[C.synapse, C.red, C.fire, C.violet, C.teal, '#ffffff'].map(col => (
                    <div key={col} onClick={() => setDrawColor(col)} style={{ width: 16, height: 16, borderRadius: 2, background: col, cursor: 'pointer', border: drawColor === col ? '2px solid #fff' : '2px solid transparent', boxSizing: 'border-box' as const }} />
                  ))}
                </div>
                {[{ mode: 'horizontal', label: '— Horizontal' }, { mode: 'trendline', label: '↗ Trend Line' }, { mode: 'zone', label: '▬ S&D Zone' }].map(({ mode, label }) => (
                  <button key={mode} onClick={() => setDrawMode(drawMode === mode ? null : mode)} style={{ width: '100%', background: drawMode === mode ? drawColor + '18' : 'transparent', border: `1px solid ${drawMode === mode ? drawColor : C.border}`, borderRadius: 3, padding: '4px 8px', color: drawMode === mode ? drawColor : C.textDim, cursor: 'pointer', fontFamily: font, fontSize: 11, textAlign: 'left' as const, marginBottom: 2 }}>{label}{drawMode === mode ? ' ✓' : ''}</button>
                ))}
                {drawMode && <div style={{ fontSize: 10, color: C.fire, padding: '3px 6px', background: C.fireDim, borderRadius: 3, marginBottom: 4 }}>{drawMode === 'zone' || drawMode === 'trendline' ? 'Click 2 pts' : 'Click to place'}</div>}
                {(drawnLines.length > 0 || drawnZones.length > 0) && (
                  <button onClick={() => { setDrawnLines([]); setDrawnZones([]) }} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.red}40`, borderRadius: 3, padding: '3px 0', color: C.red, cursor: 'pointer', fontSize: 11, fontFamily: font, marginBottom: 6 }}>Clear ({drawnLines.length + drawnZones.length})</button>
                )}

                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${C.teal}30,transparent)`, margin: '8px 0' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Morning Plan</div>
                {morningPlan.bias ? (
                  <div style={{ background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 4, padding: '7px 8px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: C.textDim }}>BIAS</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: morningPlan.bias === 'long' ? C.synapse : morningPlan.bias === 'short' ? C.red : C.textDim, textTransform: 'uppercase' }}>{morningPlan.bias}</span>
                    </div>
                    {morningPlan.impliedMove && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 10, color: C.textDim }}>IMPLIED</span><span style={{ fontSize: 11, color: C.text }}>±{morningPlan.impliedMove}</span></div>}
                    {morningPlan.keyLevels && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Lvls: <span style={{ color: C.textDim }}>{morningPlan.keyLevels}</span></div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textMuted }}>Set in Morning Plan tab</div>
                )}
                {aiResult && (
                  <div style={{ background: signalColor + '12', border: `1px solid ${signalColor}30`, borderRadius: 4, padding: '7px 8px', textAlign: 'center' }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, color: signalColor }}>{aiResult.signal}</div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{aiResult.confidence}% conf</div>
                    {aiResult.stopLevel && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>Stop: {fmt(aiResult.stopLevel)}</div>}
                    {aiResult.target1 && <div style={{ fontSize: 10, color: C.synapse }}>T1: {fmt(aiResult.target1)}</div>}
                  </div>
                )}
              </div>

              {/* Center — Chart */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Timeframe bar */}
                <div style={{ height: 34, background: 'rgba(12,15,26,0.98)', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 2, padding: '0 10px', flexShrink: 0 }}>
                  {(['1', '5', '15', '60', '1D'] as const).map(tf => (
                    <button key={tf} onClick={() => setChartTf(tf)} style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${chartTf === tf ? 'rgba(0,229,255,0.45)' : 'rgba(0,229,255,0.08)'}`, background: chartTf === tf ? 'rgba(0,229,255,0.12)' : 'transparent', color: chartTf === tf ? '#00e5ff' : '#6b7a9a', cursor: 'pointer', fontFamily: font, fontSize: 12, fontWeight: chartTf === tf ? 700 : 500, textShadow: chartTf === tf ? '0 0 10px rgba(0,229,255,0.5)' : 'none', transition: 'all 0.15s' }}>{tf === '60' ? '1H' : tf === '1D' ? '1D' : tf + 'm'}</button>
                  ))}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
                    {currentPrice && <span style={{ fontFamily: fontDisplay, fontSize: 12, color: '#f0f4ff', fontWeight: 700 }}>{fmt(currentPrice)}</span>}
                    {levels.spyVwap && <span style={{ fontSize: 11, color: C.fire }}>VWAP {fmt(levels.spyVwap)}</span>}
                    {levels.ema200 && <span style={{ fontSize: 11, color: C.teal }}>200E {fmt(levels.ema200)}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <div ref={chartContainerRef} style={{ position: 'absolute', inset: 0 }}>
                    {candles.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                        {candles.length === 0 ? (
                          <><div style={{ width: 24, height: 24, border: `2px solid ${C.border}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><div style={{ fontSize: 12, color: C.textDim }}>Loading SPX data...</div></>
                        ) : (
                          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Loading market data...</div><button onClick={() => setShowSettings(true)} style={{ background: '#00d4a0', color: '#080a0f', border: 'none', borderRadius: 4, padding: '6px 12px', fontFamily: font, fontSize: 11.5, cursor: 'pointer' }}>Open Settings</button></div>
                        )}
                      </div>
                    )}
                  </div>
                  <canvas ref={overlayCanvasRef} style={{ position: 'absolute', inset: 0, cursor: drawMode ? 'crosshair' : 'default', pointerEvents: drawMode ? 'auto' : 'none', zIndex: 10 }} onMouseDown={handleOverlayMouseDown} onMouseMove={handleOverlayMouseMove} onMouseUp={handleOverlayMouseUp} onMouseLeave={() => { setOverlayCrosshair(null); setDrawPreview(null) }} />
                </div>
              </div>

              {/* Right — AI Detail */}
              <div style={{ width: 260, background: 'rgba(12,15,26,0.98)', borderLeft: `1px solid rgba(0,212,160,0.1)`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0,229,255,0.1)', background: C.tealDim, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
                    <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: C.teal, letterSpacing: '1px' }}>AI ENGINE</span>
                    {aiLoading && <div style={{ marginLeft: 'auto', width: 8, height: 8, border: `1.5px solid ${C.border}`, borderTopColor: C.violet, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                    {lastAITime && !aiLoading && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textMuted }}>{lastAITime}</span>}
                  </div>
                  {aiResult ? (
                    <div style={{ background: signalColor + '15', border: `1.5px solid ${signalColor}40`, borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 900, color: signalColor, letterSpacing: '3px', textShadow: `0 0 30px ${signalColor}88, 0 0 60px ${signalColor}33`, lineHeight: 1 }}>{aiResult.signal}</div>
                      <ProbMeter value={aiResult.confidence || 0} color={signalColor} />
                    </div>
                  ) : <div style={{ fontSize: 11.5, color: C.textDim, textAlign: 'center', padding: '6px 0' }}>Analyzing...</div>}
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {aiResult && aiResult.signal !== 'WAIT' && aiResult.signal !== 'NO TRADE' && aiResult.entryZone && (
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, fontWeight: 700 }}>Trade Levels</div>
                      {[
                        { label: 'Entry', value: `${fmt(aiResult.entryZone?.low)} – ${fmt(aiResult.entryZone?.high)}`, color: signalColor },
                        { label: 'Stop', value: fmt(aiResult.stopLevel), color: C.red },
                        { label: 'Target 1', value: fmt(aiResult.target1), color: C.synapse },
                        { label: 'Target 2', value: fmt(aiResult.target2), color: C.synapse },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 5, marginBottom: 4, background: color + '0d', border: `1px solid ${color}20` }}>
                          <span style={{ fontSize: 11.5, color: '#8899bb', fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
                          <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 800, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* ── AI Signal Analysis Sections — redesigned for readability ── */}
                  {/* AI Signal sections — clean readable layout */}
                  {[
                    { key: 'marketConditions', label: 'Market Conditions', color: '#00e5ff', bg: 'rgba(0,229,255,0.05)', border: 'rgba(0,229,255,0.12)', text: aiResult?.marketConditions, textColor: '#dce8ff' },
                    { key: 'todaysEdge',       label: "Today's Edge",      color: '#00ff88', bg: 'rgba(0,255,136,0.05)', border: 'rgba(0,255,136,0.12)', text: aiResult?.todaysEdge,       textColor: '#dce8ff' },
                    { key: 'accountability',   label: 'Accountability',     color: '#ff8c42', bg: 'rgba(255,140,66,0.05)', border: 'rgba(255,140,66,0.12)', text: aiResult?.accountability,   textColor: '#dce8ff' },
                    { key: 'riskFlag',         label: '⚠ Risk Flag',          color: '#ff4d6d', bg: 'rgba(255,77,109,0.06)', border: 'rgba(255,77,109,0.14)', text: aiResult?.riskFlag,         textColor: '#ffb3c0' },
                  ].filter(s => s.text).map(s => (
                    <div key={s.key} style={{ margin: '0 12px 8px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, color: s.color, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 13, color: s.textColor, lineHeight: 1.75, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontWeight: 400 }}>{s.text}</div>
                    </div>
                  ))}

                  {/* Positioning */}
                  {aiResult && (
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>📁 Positioning</div>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                        <div style={{ flex: 1, background: C.synapse + '10', border: `1px solid ${C.synapse}25`, borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: C.textDim }}>BULLISH ABOVE</div>
                          <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.synapse }}>{fmt(levels.spyVwap)}</div>
                        </div>
                        <div style={{ flex: 1, background: C.red + '10', border: `1px solid ${C.red}25`, borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: C.textDim }}>BEARISH BELOW</div>
                          <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.red }}>{fmt(levels.spyVwap)}</div>
                        </div>
                      </div>
                      {[
                        { label: 'VIX', value: vixPrice ? `${vixPrice.toFixed(2)} — ${vixPrice > 25 ? 'EXTREME' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL'}` : '—', color: vixPrice && vixPrice > 18 ? C.fire : C.synapse },
                        { label: 'Breadth', value: marketIntel?.breadth?.bias || 'No data', color: C.textDim },
                        { label: 'Score', value: `${score}/13 — Grade ${grade}`, color: gradeColor },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: C.textDim }}>{label}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(), fetchOptionsFlow(), fetchMarketTide(), fetchTiingoContext(morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runSignal(buildSignalInput({ flow, tide, intel: intel, tiingo: tiingo2 }))
                    if (result) { setAiResult(result); setLastAITime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); setTimeout(() => { speak(`${result.signal}. ${result.confidence}% confidence. ${result.accountability || result.riskFlag || result.marketConditions?.split('.')[0] || ''}`) }, 400) }
                    setAiLoading(false)
                  }} disabled={aiLoading} style={{ width: 'calc(100% - 20px)', margin: '10px', padding: '8px', background: aiLoading ? C.surface2 : C.tealDim, border: `1px solid ${aiLoading ? C.border : C.tealBorder}`, borderRadius: 3, color: aiLoading ? C.textDim : C.violet, cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: font, fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>{aiLoading ? '⟳ ANALYZING...' : '▶ GET AI SIGNAL'}</button>
                </div>
              </div>
            </div>

            {/* ── BOTTOM DATA PANELS ── */}
            <div style={{ height: 160, background: 'transparent', borderTop: '1px solid rgba(0,229,255,0.1)', display: 'flex', overflow: 'hidden', flexShrink: 0 }}>

              {/* Options Flow */}
              <div style={{ flex: 1, borderRight: '1px solid rgba(0,229,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.synapse, boxShadow: `0 0 5px ${C.synapse}`, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.synapse, letterSpacing: '1px' }}>OPTIONS FLOW</span>
                  {optionsFlow.length > 0 && <span style={{ fontSize: 10, color: C.textDim }}>{optionsFlow.length} alerts</span>}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {optionsFlow.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 16 }}>{keys[UW_KEY] ? 'No SPX/SPY flow alerts' : 'Add UW key in Settings'}</div>
                  ) : optionsFlow.slice(0, 8).map((f: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: (f.type || '').toUpperCase().startsWith('C') ? C.synapse : C.red, width: 30 }}>{(f.ticker || '').toUpperCase()}</span>
                      <span style={{ fontSize: 10, color: (f.type || '').toUpperCase().startsWith('C') ? C.synapse : C.red, width: 22, fontWeight: 700 }}>{(f.type || '').toUpperCase().startsWith('C') ? 'CALL' : 'PUT'}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, color: C.text, width: 50 }}>{f.strike}</span>
                      <span style={{ fontSize: 10, color: C.textDim, flex: 1 }}>{f.expiry || ''}</span>
                      {f.premium && <span style={{ fontFamily: fontDisplay, fontSize: 10, color: C.fire, fontWeight: 700 }}>${((f.premium || 0)/1000).toFixed(0)}K</span>}
                      <div style={{ padding: '1px 5px', borderRadius: 2, background: f.sentiment === 'BULLISH' ? C.synapse + '18' : f.sentiment === 'BEARISH' ? C.red + '18' : C.surface2, border: `1px solid ${f.sentiment === 'BULLISH' ? C.synapse + '40' : f.sentiment === 'BEARISH' ? C.red + '40' : C.border}` }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: f.sentiment === 'BULLISH' ? C.synapse : f.sentiment === 'BEARISH' ? C.red : C.textDim }}>{f.sentiment || 'NEUT'}</span>
                      </div>
                      {f.unusual && <span style={{ fontSize: 9, fontWeight: 800, color: C.fire, padding: '1px 3px', border: `1px solid ${C.fire}44`, borderRadius: 2 }}>SWP</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Tide */}
              <div style={{ width: 190, borderRight: '1px solid rgba(0,229,255,0.1)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '1px' }}>MARKET TIDE</span>
                </div>
                <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {marketTide ? (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: 8 }}>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: marketTide.bias === 'CALL HEAVY' ? C.synapse : marketTide.bias === 'PUT HEAVY' ? C.red : C.fire, marginBottom: 2 }}>{marketTide.bias}</div>
                        <div style={{ fontSize: 10, color: C.textDim }}>P/C Ratio: <span style={{ color: C.text, fontWeight: 700 }}>{marketTide.putCallRatio}</span></div>
                      </div>
                      {[
                        { label: 'CALLS', value: marketTide.callPremium, pct: marketTide.callPct, color: C.synapse },
                        { label: 'PUTS', value: marketTide.putPremium, pct: marketTide.putPct, color: C.red },
                      ].map(({ label, value, pct, color }) => (
                        <div key={label} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color }}>{label}</span>
                            <span style={{ fontSize: 10, color, fontFamily: fontDisplay }}>{value}</span>
                          </div>
                          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct || 50}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center' }}>{'Loading tide...'}</div>}
                </div>
              </div>

              {/* Market Intelligence Cards */}
              {marketIntel2 && (
                <div style={{ padding: '8px 14px 0' }}>

                  {/* VIX Term Structure */}
                  {marketIntel2.termStructure && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: marketIntel2.termStructure.termShape === 'inverted' ? 'rgba(255,77,109,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${marketIntel2.termStructure.termShape === 'inverted' ? 'rgba(255,77,109,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>VIX Term Structure</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: marketIntel2.termStructure.termShape === 'inverted' ? '#ff4d6d' : '#00d4a0' }}>{marketIntel2.termStructure.termShape.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                        {[
                          { label: 'VIX1D', val: marketIntel2.termStructure.vix1d, color: '#ff8fa3' },
                          { label: 'VIX9D', val: marketIntel2.termStructure.vix9d, color: '#f59e0b' },
                          { label: 'VIX30', val: marketIntel2.termStructure.vix30, color: '#00e5ff' },
                          { label: 'VVIX',  val: marketIntel2.termStructure.vvix,  color: '#7c6aff' },
                        ].map((v, i) => v.val && (
                          <div key={i} style={{ textAlign: 'center' as const }}>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>{v.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: v.color, fontFamily: fontDisplay }}>{v.val.toFixed(1)}</div>
                          </div>
                        ))}
                        {marketIntel2.termStructure.impliedMoveToday && (
                          <div style={{ marginLeft: 'auto' as const, textAlign: 'right' as const }}>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>Implied Today</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontFamily: fontDisplay }}>±{marketIntel2.termStructure.impliedMoveToday}pts</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* VWAP Bands */}
                  {marketIntel2.vwapBands && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: marketIntel2.vwapBands.isExtended ? 'rgba(255,77,109,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${marketIntel2.vwapBands.isExtended ? 'rgba(255,77,109,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>VWAP Bands</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: marketIntel2.vwapBands.isExtended ? '#ff4d6d' : marketIntel2.vwapBands.isMeanRevertZone ? '#f59e0b' : '#00d4a0' }}>{marketIntel2.vwapBands.bandPosition.replace(/_/g,' ').toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                        <span style={{ color: '#ff4d6d' }}>{marketIntel2.vwapBands.band2Dn?.toFixed(1)}</span>
                        <span style={{ color: '#f59e0b' }}>{marketIntel2.vwapBands.band1Dn?.toFixed(1)}</span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, position: 'relative' as const }}>
                          <div style={{ position: 'absolute' as const, left: '50%', top: 0, bottom: 0, width: 2, background: '#00e5ff', transform: 'translateX(-50%)' }} />
                          {marketIntel2.vwapBands.currentPrice && marketIntel2.vwapBands.band2Dn && marketIntel2.vwapBands.band2Up && (() => {
                            const range = marketIntel2.vwapBands.band2Up - marketIntel2.vwapBands.band2Dn
                            const pct   = Math.max(0, Math.min(100, (marketIntel2.vwapBands.currentPrice - marketIntel2.vwapBands.band2Dn) / range * 100))
                            return <div style={{ position: 'absolute' as const, left: `${pct}%`, top: -3, width: 8, height: 10, background: '#f59e0b', borderRadius: 2, transform: 'translateX(-50%)' }} />
                          })()}
                        </div>
                        <span style={{ color: '#f59e0b' }}>{marketIntel2.vwapBands.band1Up?.toFixed(1)}</span>
                        <span style={{ color: '#ff4d6d' }}>{marketIntel2.vwapBands.band2Up?.toFixed(1)}</span>
                      </div>
                      {marketIntel2.vwapBands.isExtended && <div style={{ fontSize: 11, color: '#ff4d6d', marginTop: 4 }}>⚠ Price at 2σ — high mean-reversion probability</div>}
                    </div>
                  )}

                  {/* Sector Rotation */}
                  {marketIntel2.sectorRotation && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>Sector Rotation</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: marketIntel2.sectorRotation.rotationBias === 'BULLISH' ? '#00ff88' : marketIntel2.sectorRotation.rotationBias === 'BEARISH' ? '#ff4d6d' : '#f59e0b' }}>{marketIntel2.sectorRotation.rotationSignal}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                        {(marketIntel2.sectorRotation.sectors || []).map((s: any, i: number) => (
                          <div key={i} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, background: s.chgPct > 0 ? 'rgba(0,212,160,0.1)' : 'rgba(255,77,109,0.1)', color: s.chgPct > 0 ? '#00d4a0' : '#ff4d6d', fontWeight: 600 }}>
                            {s.ticker} {s.chgPct > 0 ? '+' : ''}{s.chgPct?.toFixed(1)}%
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#4a5568', marginTop: 4 }}>{marketIntel2.sectorRotation.advancers} up · {marketIntel2.sectorRotation.decliners} down</div>
                    </div>
                  )}

                  {/* Vol Spread */}
                  {marketIntel2.volSpread && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>IV vs RV</span>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>Implied</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#00e5ff' }}>{marketIntel2.volSpread.impliedVol}%</div>
                        </div>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>Realized</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#7c6aff' }}>{marketIntel2.volSpread.realizedVol5d}%</div>
                        </div>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>Spread</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: marketIntel2.volSpread.spread > 5 ? '#ff4d6d' : marketIntel2.volSpread.spread < -3 ? '#00ff88' : '#f59e0b' }}>{marketIntel2.volSpread.spread > 0 ? '+' : ''}{marketIntel2.volSpread.spread}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Options Chain — max pain + walls */}
                  {marketIntel2?.optionsChain && marketIntel2.optionsChain.maxPain > 0 && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>0DTE Options Chain</span>
                        <span style={{ fontSize: 11, color: '#4a5568' }}>{marketIntel2.optionsChain.contractCount} contracts · P/C {marketIntel2.optionsChain.zeroDtePCR}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 6 }}>
                        {[
                          { label: 'Max Pain', val: marketIntel2.optionsChain.maxPain?.toFixed(0), color: '#f59e0b', note: 'gravity zone' },
                          { label: 'Call Wall', val: marketIntel2.optionsChain.callWall?.toFixed(0), color: '#ff4d6d', note: `${(marketIntel2.optionsChain.callWallOI/1000).toFixed(0)}K OI` },
                          { label: 'Put Wall',  val: marketIntel2.optionsChain.putWall?.toFixed(0),  color: '#00ff88', note: `${(marketIntel2.optionsChain.putWallOI/1000).toFixed(0)}K OI` },
                        ].map((item, i) => (
                          <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 4px' }}>
                            <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 3 }}>{item.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: fontDisplay }}>{item.val}</div>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>{item.note}</div>
                          </div>
                        ))}
                      </div>
                      {/* Top OI strikes as a mini heatmap */}
                      {marketIntel2.optionsChain.topStrikes?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 4 }}>Top OI strikes (gamma gravity)</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {marketIntel2.optionsChain.topStrikes.map((s: any, i: number) => {
                              const isCall = s.callOI > s.putOI
                              return (
                                <div key={i} style={{ flex: 1, textAlign: 'center' as const, padding: '4px 2px', borderRadius: 4, background: isCall ? 'rgba(255,77,109,0.1)' : 'rgba(0,255,136,0.08)', border: `1px solid ${isCall ? 'rgba(255,77,109,0.2)' : 'rgba(0,255,136,0.15)'}` }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: isCall ? '#ff4d6d' : '#00ff88' }}>{s.strike}</div>
                                  <div style={{ fontSize: 9, color: '#4a5568' }}>{(s.totalOI/1000).toFixed(0)}K</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cross-asset */}
                  {multiTFData?.crossAsset && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: multiTFData.crossAsset.confirmation === 'RISK_OFF' ? 'rgba(255,77,109,0.04)' : multiTFData.crossAsset.confirmation === 'RISK_ON' ? 'rgba(0,255,136,0.04)' : 'rgba(0,0,0,0.2)', border: `1px solid ${multiTFData.crossAsset.confirmation === 'RISK_OFF' ? 'rgba(255,77,109,0.2)' : multiTFData.crossAsset.confirmation === 'RISK_ON' ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>Cross-Asset</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: multiTFData.crossAsset.confirmation === 'RISK_ON' ? '#00ff88' : multiTFData.crossAsset.confirmation === 'RISK_OFF' ? '#ff4d6d' : multiTFData.crossAsset.confirmation === 'BEARISH' ? '#ff4d6d' : '#8899bb' }}>{multiTFData.crossAsset.confirmation?.replace('_', '-')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#b0c4de', marginBottom: 4 }}>
                        {multiTFData.crossAsset.dxy5d !== null && <span>DXY <strong style={{ color: multiTFData.crossAsset.dxy5d > 0.3 ? '#ff4d6d' : multiTFData.crossAsset.dxy5d < -0.3 ? '#00ff88' : '#e2e8f0' }}>{multiTFData.crossAsset.dxy5d > 0 ? '+' : ''}{multiTFData.crossAsset.dxy5d?.toFixed(1)}%</strong></span>}
                        {multiTFData.crossAsset.tlt5d !== null && <span>TLT <strong style={{ color: multiTFData.crossAsset.tlt5d > 0.3 ? '#00ff88' : multiTFData.crossAsset.tlt5d < -0.3 ? '#ff4d6d' : '#e2e8f0' }}>{multiTFData.crossAsset.tlt5d > 0 ? '+' : ''}{multiTFData.crossAsset.tlt5d?.toFixed(1)}%</strong></span>}
                        {multiTFData.crossAsset.oil5d !== null && <span>OIL <strong style={{ color: '#e2e8f0' }}>{multiTFData.crossAsset.oil5d > 0 ? '+' : ''}{multiTFData.crossAsset.oil5d?.toFixed(1)}%</strong></span>}
                        <span style={{ color: '#4a5568', fontSize: 11 }}>5-day</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#6b7a9a' }}>{multiTFData.crossAsset.signal}</div>
                    </div>
                  )}

                  {/* ─── VOLUME PROFILE — full visual S/R chart ─── */}
                  {volumeProfile && volumeProfile.allBuckets?.length > 0 && (() => {
                    const vp = volumeProfile
                    const buckets = vp.allBuckets  // already sorted high-to-low
                    const curr = vp.currentPrice
                    const maxPct = Math.max(...buckets.map((b: any) => b.pct))
                    const inValueArea = curr >= vp.val && curr <= vp.vah

                    // Find the current price bucket index (for the price line indicator)
                    let currIdx = buckets.findIndex((b: any) => Math.abs(b.price - curr) <= 0.5)
                    if (currIdx === -1) {
                      // Find closest bucket
                      currIdx = buckets.reduce((best: number, b: any, i: number) => {
                        return Math.abs(b.price - curr) < Math.abs(buckets[best].price - curr) ? i : best
                      }, 0)
                    }

                    // Determine color for each bucket
                    const bucketColor = (b: any) => {
                      const isPoc = Math.abs(b.price - vp.poc) < 0.6
                      const isVah = Math.abs(b.price - vp.vah) < 0.6
                      const isVal = Math.abs(b.price - vp.val) < 0.6
                      const inVA  = b.price >= vp.val && b.price <= vp.vah
                      if (isPoc) return '#00e5ff'                    // cyan — POC
                      if (isVah) return '#00ff88'                    // green — VAH
                      if (isVal) return '#ff4d6d'                    // red  — VAL
                      if (inVA)  return 'rgba(124,106,255,0.55)'    // purple — in value area
                      return 'rgba(124,140,180,0.3)'                 // gray — outside value
                    }

                    const barWidth = (pct: number) => Math.max(2, Math.round(pct / maxPct * 100))

                    return (
                      <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,229,255,0.15)' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#00e5ff', letterSpacing: 2, textTransform: 'uppercase' as const }}>Volume Profile</span>
                            <span style={{ fontSize: 10, color: '#4a5568', marginLeft: 8 }}>today's session · {vp.valueAreaPct}% in VA</span>
                          </div>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, fontWeight: 700,
                            background: inValueArea ? 'rgba(124,106,255,0.15)' : 'rgba(255,183,0,0.1)',
                            color: inValueArea ? '#7c6aff' : '#f59e0b',
                          }}>
                            {inValueArea ? 'IN VALUE' : curr > vp.vah ? 'ABOVE VAH' : 'BELOW VAL'}
                          </span>
                        </div>

                        {/* POC / VAH / VAL summary row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                          {[
                            { label: 'VAH', val: vp.vah?.toFixed(0), color: '#00ff88', note: 'resistance' },
                            { label: 'POC', val: vp.poc?.toFixed(0), color: '#00e5ff', note: 'max volume' },
                            { label: 'VAL', val: vp.val?.toFixed(0), color: '#ff4d6d', note: 'support' },
                          ].map((item, i) => (
                            <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(0,0,0,0.25)', borderRadius: 5, padding: '5px 4px', border: `1px solid ${item.color}33` }}>
                              <div style={{ fontSize: 10, color: '#4a5568' }}>{item.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: item.color, fontFamily: fontDisplay, lineHeight: 1.1 }}>{item.val}</div>
                              <div style={{ fontSize: 9, color: '#4a5568' }}>{item.note}</div>
                            </div>
                          ))}
                        </div>

                        {/* The visual profile — horizontal bars by price level */}
                        <div style={{ position: 'relative' as const, background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '6px 4px', maxHeight: 280, overflowY: 'auto' }}>
                          {buckets.map((b: any, i: number) => {
                            const isPoc = Math.abs(b.price - vp.poc) < 0.6
                            const isVah = Math.abs(b.price - vp.vah) < 0.6
                            const isVal = Math.abs(b.price - vp.val) < 0.6
                            const isCurr = i === currIdx
                            const color = bucketColor(b)
                            const width = barWidth(b.pct)

                            return (
                              <div key={i} style={{ position: 'relative' as const, display: 'flex', alignItems: 'center', gap: 4, padding: '1.5px 0', height: 11 }}>
                                {/* Price label */}
                                <span style={{ fontSize: 11, color: isPoc || isVah || isVal || isCurr ? color : '#4a5568', width: 36, textAlign: 'right' as const, fontWeight: isPoc || isVah || isVal || isCurr ? 700 : 400, fontFamily: fontDisplay }}>
                                  {b.price.toFixed(0)}
                                </span>

                                {/* Bar */}
                                <div style={{ flex: 1, height: 7, position: 'relative' as const, background: 'rgba(255,255,255,0.02)', borderRadius: 1 }}>
                                  <div style={{
                                    height: '100%', width: `${width}%`, background: color, borderRadius: 1,
                                    boxShadow: isPoc ? '0 0 6px rgba(0,229,255,0.5)' : 'none',
                                  }} />
                                  {/* Current price marker (yellow line across the bar) */}
                                  {isCurr && (
                                    <div style={{ position: 'absolute' as const, left: 0, right: 0, top: -1, bottom: -1, border: '1.5px solid #ffb700', borderRadius: 2, boxShadow: '0 0 5px rgba(255,183,0,0.6)' }} />
                                  )}
                                </div>

                                {/* Percentage + label */}
                                <span style={{ fontSize: 10, color: '#6b7a9a', width: 28, textAlign: 'right' as const }}>{b.pct}%</span>
                                {(isPoc || isVah || isVal || isCurr) && (
                                  <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 0.5, width: 28 }}>
                                    {isCurr ? '◀ NOW' : isPoc ? 'POC' : isVah ? 'VAH' : 'VAL'}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Footer: position context */}
                        <div style={{ marginTop: 8, padding: '6px 9px', borderRadius: 4, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#6b7a9a' }}>
                            Price <strong style={{ color: '#ffb700', fontFamily: fontDisplay }}>{curr.toFixed(0)}</strong>
                            {curr > vp.poc ? ' is ' + (curr - vp.poc).toFixed(0) + 'pts above POC' :
                             curr < vp.poc ? ' is ' + (vp.poc - curr).toFixed(0) + 'pts below POC' :
                                              ' is AT POC'}
                          </span>
                        </div>

                        {/* Interpretation */}
                        <div style={{ fontSize: 11.5, color: '#8899bb', marginTop: 6, lineHeight: 1.4 }}>
                          {vp.signal?.split('|').pop()?.trim()}
                        </div>
                      </div>
                    )
                  })()}

                  {/* 15-min + 1-hour structure */}
                  {(multiTFData?.m15 || multiTFData?.h1) && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6 }}>Intraday Structure</div>
                      {multiTFData.h1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11.5 }}>
                          <span style={{ color: '#6b7a9a' }}>1-hour</span>
                          <span style={{ color: multiTFData.h1.trend === 'BULLISH' ? '#00ff88' : multiTFData.h1.trend === 'BEARISH' ? '#ff4d6d' : '#f59e0b', fontWeight: 700 }}>{multiTFData.h1.trend}</span>
                          <span style={{ color: '#6b7a9a' }}>EMA20: {multiTFData.h1.ema20?.toFixed(0)}</span>
                          <span style={{ color: multiTFData.h1.aboveEma ? '#00d4a0' : '#ff4d6d', fontSize: 11 }}>{multiTFData.h1.aboveEma ? 'above ▲' : 'below ▼'}</span>
                        </div>
                      )}
                      {multiTFData.m15 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                          <span style={{ color: '#6b7a9a' }}>15-min</span>
                          <span style={{ color: multiTFData.m15.trend === 'BULLISH' ? '#00ff88' : multiTFData.m15.trend === 'BEARISH' ? '#ff4d6d' : '#f59e0b', fontWeight: 700 }}>{multiTFData.m15.trend}</span>
                          <span style={{ color: '#6b7a9a' }}>Range: {multiTFData.m15.low?.toFixed(0)}-{multiTFData.m15.high?.toFixed(0)}</span>
                          <span style={{ color: '#6b7a9a', fontSize: 11 }}>{multiTFData.m15.rangePct}% of range</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IV Rank */}
                  {marketIntel2?.volSpread?.ivRank !== null && marketIntel2?.volSpread?.ivRank !== undefined && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>IV Rank</span>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>IV Rank</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: marketIntel2.volSpread.ivRank > 70 ? '#ff4d6d' : marketIntel2.volSpread.ivRank < 30 ? '#00ff88' : '#f59e0b', fontFamily: fontDisplay }}>{marketIntel2.volSpread.ivRank}</div>
                        </div>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>Percentile</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#7c6aff', fontFamily: fontDisplay }}>{marketIntel2.volSpread.ivPercentile}%</div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7a9a', maxWidth: 160 }}>
                          {marketIntel2.volSpread.ivRank > 70 ? 'VIX elevated — options expensive, size down' : marketIntel2.volSpread.ivRank < 30 ? 'VIX low — options cheap, good to buy' : 'VIX in normal range'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SKEW */}
                  {marketIntel2?.termStructure?.skew && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: marketIntel2.termStructure.skewRegime === 'EXTREME_TAIL_RISK' ? 'rgba(255,77,109,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${marketIntel2.termStructure.skewRegime === 'EXTREME_TAIL_RISK' ? 'rgba(255,77,109,0.2)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>SKEW Index</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: marketIntel2.termStructure.skewRegime === 'EXTREME_TAIL_RISK' ? '#ff4d6d' : marketIntel2.termStructure.skewRegime === 'ELEVATED_TAIL_RISK' ? '#f59e0b' : '#00d4a0', fontFamily: fontDisplay }}>{marketIntel2.termStructure.skew?.toFixed(0)}</span>
                        <span style={{ fontSize: 11, color: '#6b7a9a' }}>{marketIntel2.termStructure.skewRegime?.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  )}

                  {/* GEX / Vanna / Charm — dealer positioning */}
                  {gexData && gexData.source !== 'no_key' && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: gexData.regime === 'negative' ? 'rgba(255,77,109,0.04)' : 'rgba(0,0,0,0.2)', border: `1px solid ${gexData.regime === 'negative' ? 'rgba(255,77,109,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>Dealer Positioning</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: gexData.regime === 'negative' ? '#ff4d6d' : gexData.regime === 'positive' ? '#00d4a0' : '#8899bb' }}>{gexData.regime?.toUpperCase()} GAMMA</span>
                      </div>
                      {/* Core GEX levels */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                        {[
                          { label: 'Gamma Flip', val: gexData.gammaFlip?.toFixed(0) || 'n/a', color: '#f59e0b' },
                          { label: 'Call Wall',  val: gexData.callWall?.toFixed(0)  || 'n/a', color: '#ff4d6d' },
                          { label: 'Put Wall',   val: gexData.putWall?.toFixed(0)   || 'n/a', color: '#00ff88' },
                        ].map((item, i) => (
                          <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(0,0,0,0.2)', borderRadius: 5, padding: '6px 4px' }}>
                            <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: item.color, fontFamily: fontDisplay }}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                      {/* DEX — dealer delta */}
                      {gexData.dexBias && (
                        <div style={{ fontSize: 11.5, color: '#b0c4de', marginBottom: 4, padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                          <span style={{ color: '#7c6aff', fontWeight: 700 }}>DEX </span>
                          {gexData.dexBias === 'SHORT' ? 'Dealers net LONG → selling into strength' : gexData.dexBias === 'LONG' ? 'Dealers net SHORT → buying into weakness' : 'Balanced dealer delta'}
                        </div>
                      )}
                      {/* Vanna */}
                      {gexData.vannaNote && (
                        <div style={{ fontSize: 11.5, color: '#b0c4de', marginBottom: 4, padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                          <span style={{ color: '#00e5ff', fontWeight: 700 }}>VANNA </span>{gexData.vannaNote}
                        </div>
                      )}
                      {/* Charm — most critical for 0DTE */}
                      {gexData.charmNote && (
                        <div style={{ fontSize: 11.5, color: '#b0c4de', padding: '6px 8px', background: gexData.charmUrgency === 'HIGH' ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.2)', borderRadius: 4, border: gexData.charmUrgency === 'HIGH' ? '1px solid rgba(245,158,11,0.2)' : 'none' }}>
                          <span style={{ color: '#f59e0b', fontWeight: 700 }}>CHARM (0DTE) </span>
                          {gexData.charmUrgency === 'HIGH' && <span style={{ color: '#ff4d6d', fontWeight: 700 }}>⚠ CRITICAL </span>}
                          {gexData.charmNote}
                        </div>
                      )}
                      {/* Max pain */}
                      {gexData.maxPain && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: '#6b7a9a' }}>
                          <span>Max pain: <strong style={{ color: '#f59e0b' }}>{gexData.maxPain}</strong></span>
                          {gexData.pinProbability && <span>Pin prob: <strong style={{ color: '#7c6aff' }}>{Math.round(gexData.pinProbability * 100)}%</strong></span>}
                          {gexData.cacheAgeMin && <span style={{ fontSize: 11, color: '#4a5568' }}>Updated {gexData.cacheAgeMin}m ago</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mechanical Flow */}
                  {mechanicalFlow && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8,
                      background: mechanicalFlow.mechanicalBias === 'BULLISH' ? 'rgba(0,255,136,0.04)' : mechanicalFlow.mechanicalBias === 'BEARISH' ? 'rgba(255,77,109,0.04)' : 'rgba(124,106,255,0.04)',
                      border: `1px solid ${mechanicalFlow.mechanicalBias === 'BULLISH' ? 'rgba(0,255,136,0.18)' : mechanicalFlow.mechanicalBias === 'BEARISH' ? 'rgba(255,77,109,0.18)' : 'rgba(124,106,255,0.18)'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#7c6aff', letterSpacing: 2, textTransform: 'uppercase' as const }}>Mechanical Flow</span>
                          <span style={{ fontSize: 10, color: '#4a5568', marginLeft: 6 }}>dealer hedging dynamics</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Score bar */}
                          <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', position: 'relative' as const }}>
                            <div style={{ position: 'absolute' as const, left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
                            {mechanicalFlow.mechanicalScore !== 0 && (
                              <div style={{
                                position: 'absolute' as const, top: 0, bottom: 0,
                                left: mechanicalFlow.mechanicalScore > 0 ? '50%' : `${50 + mechanicalFlow.mechanicalScore / 2}%`,
                                width: `${Math.abs(mechanicalFlow.mechanicalScore) / 2}%`,
                                background: mechanicalFlow.mechanicalScore > 0 ? '#00ff88' : '#ff4d6d',
                              }} />
                            )}
                          </div>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: mechanicalFlow.mechanicalScore > 0 ? '#00ff88' : mechanicalFlow.mechanicalScore < 0 ? '#ff4d6d' : '#8899bb', fontFamily: fontDisplay }}>{mechanicalFlow.mechanicalScore > 0 ? '+' : ''}{mechanicalFlow.mechanicalScore}</span>
                        </div>
                      </div>

                      {/* Asymmetric setup callout */}
                      {mechanicalFlow.asymmetricSetup !== 'NEUTRAL' && (
                        <div style={{ padding: '5px 8px', borderRadius: 4, background: mechanicalFlow.asymmetricSetup.includes('AMPLIFY') ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)', marginBottom: 6, fontSize: 11.5, color: mechanicalFlow.asymmetricSetup.includes('AMPLIFY') ? '#f59e0b' : '#b0c4de' }}>
                          {mechanicalFlow.asymmetricSetup.includes('AMPLIFY') ? '!' : '~'} {mechanicalFlow.asymmetricNote}
                        </div>
                      )}

                      {/* Hedging + charm summary */}
                      <div style={{ display: 'flex', gap: 8, fontSize: 11, flexWrap: 'wrap' as const, color: '#7a8aaa' }}>
                        <span>{mechanicalFlow.hedgingDirection === 'SELL_RALLIES' ? 'Mean-revert' : mechanicalFlow.hedgingDirection === 'AMPLIFY_MOVES' ? 'Trend-amplify' : 'Neutral hedge'}</span>
                        {mechanicalFlow.hedgingFlowRemaining && <span>~${mechanicalFlow.hedgingFlowRemaining}M flow left</span>}
                        {mechanicalFlow.charmIntensity !== 'NONE' && (
                          <span style={{ color: mechanicalFlow.charmIntensity === 'CRITICAL' ? '#ff4d6d' : '#f59e0b' }}>
                            Charm {mechanicalFlow.charmIntensity} {mechanicalFlow.charmDirection === 'BULLISH_DRIFT' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* UW Spot GEX by Strike */}
                  {marketIntel2?.spotGex && marketIntel2.spotGex.topGammaStrikes?.length > 0 && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(124,106,255,0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#7c6aff', letterSpacing: 2, textTransform: 'uppercase' as const }}>UW Spot GEX (live)</span>
                        <span style={{ fontSize: 11, color: '#4a5568' }}>{marketIntel2.spotGex.strikeCount} strikes</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
                        {marketIntel2.spotGex.topGammaStrikes.slice(0, 5).map((s: any, i: number) => (
                          <div key={i} style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(124,106,255,0.1)', color: '#7c6aff', border: '1px solid rgba(124,106,255,0.2)' }}>{s.strike}</div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
                        {marketIntel2.spotGex.callWall && <span style={{ color: '#ff4d6d' }}>Call wall: <strong>{marketIntel2.spotGex.callWall}</strong></span>}
                        {marketIntel2.spotGex.putWall  && <span style={{ color: '#00ff88' }}>Put wall: <strong>{marketIntel2.spotGex.putWall}</strong></span>}
                      </div>
                    </div>
                  )}

                  {/* UW IV Rank */}
                  {marketIntel2?.uwIV && marketIntel2.uwIV.ivRank !== null && (
                    <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>SPX IV Rank (UW)</span>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>IV Rank</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: marketIntel2.uwIV.ivRank > 70 ? '#ff4d6d' : marketIntel2.uwIV.ivRank < 30 ? '#00ff88' : '#f59e0b', fontFamily: fontDisplay }}>{marketIntel2.uwIV.ivRank?.toFixed(0)}</div>
                        </div>
                        {marketIntel2.uwIV.putCallRatio && (
                          <div style={{ textAlign: 'center' as const }}>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>P/C Ratio</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: marketIntel2.uwIV.putCallRatio > 1.2 ? '#00ff88' : marketIntel2.uwIV.putCallRatio < 0.7 ? '#ff4d6d' : '#e2e8f0', fontFamily: fontDisplay }}>{marketIntel2.uwIV.putCallRatio?.toFixed(2)}</div>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#6b7a9a', maxWidth: 140 }}>
                          {marketIntel2.uwIV.ivRank > 70 ? 'Elevated — options pricey' : marketIntel2.uwIV.ivRank < 30 ? 'Suppressed — options cheap' : 'Normal vol regime'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Economic Surprise Score */}
                  {marketIntel2?.econSurprise?.surprises?.length > 0 && (
                    <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: marketIntel2.econSurprise.bias === 'MACRO_BULLISH' ? 'rgba(0,255,136,0.04)' : marketIntel2.econSurprise.bias === 'MACRO_BEARISH' ? 'rgba(255,77,109,0.04)' : 'rgba(0,0,0,0.2)', border: `1px solid ${marketIntel2.econSurprise.bias === 'MACRO_BULLISH' ? 'rgba(0,255,136,0.15)' : marketIntel2.econSurprise.bias === 'MACRO_BEARISH' ? 'rgba(255,77,109,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase' as const }}>Economic Surprises</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: marketIntel2.econSurprise.bias === 'MACRO_BULLISH' ? '#00ff88' : marketIntel2.econSurprise.bias === 'MACRO_BEARISH' ? '#ff4d6d' : '#8899bb' }}>{marketIntel2.econSurprise.bias?.replace('_', ' ')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                        {marketIntel2.econSurprise.surprises.map((s: any, i: number) => (
                          <div key={i} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 4, background: s.direction === 'BULLISH_SURPRISE' ? 'rgba(0,255,136,0.1)' : s.direction === 'BEARISH_SURPRISE' ? 'rgba(255,77,109,0.1)' : 'rgba(255,255,255,0.05)', color: s.direction === 'BULLISH_SURPRISE' ? '#00ff88' : s.direction === 'BEARISH_SURPRISE' ? '#ff4d6d' : '#8899bb', fontWeight: 600 }}>
                            {s.indicator} {s.surprise > 0 ? '+' : ''}{s.surprise.toFixed(1)}%
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Daily Candle Pattern Alerts */}
              {multiTFData?.patterns?.length > 0 && (
                <div style={{ padding: '8px 14px 4px' }}>
                  {(multiTFData.patterns as any[]).map((p: any, i: number) => (
                    <div key={i} style={{
                      background: p.type.includes('BULLISH') ? 'rgba(0,255,136,0.05)' : p.type.includes('BEARISH') ? 'rgba(255,77,109,0.05)' : 'rgba(245,158,11,0.05)',
                      border: `1px solid ${p.type.includes('BULLISH') ? 'rgba(0,255,136,0.2)' : p.type.includes('BEARISH') ? 'rgba(255,77,109,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      borderLeft: `3px solid ${p.type.includes('BULLISH') ? '#00ff88' : p.type.includes('BEARISH') ? '#ff4d6d' : '#f59e0b'}`,
                      borderRadius: 8, padding: '10px 14px', marginBottom: 6
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: p.type.includes('BULLISH') ? '#00ff88' : p.type.includes('BEARISH') ? '#ff4d6d' : '#f59e0b', letterSpacing: 1 }}>
                          {p.name.toUpperCase()}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.strength === 'STRONG' && <span style={{ fontSize: 10, color: '#ff4d6d', fontWeight: 800 }}>STRONG</span>}
                          {p.confirmed && <span style={{ fontSize: 10, color: '#00d4a0', fontWeight: 800 }}>✓ CONFIRMED</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#b0c4de', lineHeight: 1.6, marginBottom: 4 }}>{p.description}</div>
                      <div style={{ fontSize: 12, color: p.type.includes('BULLISH') ? '#00d4a0' : p.type.includes('BEARISH') ? '#ff8fa3' : '#fcd34d' }}>→ {p.actionable}</div>
                      {p.keyLevel && <div style={{ fontSize: 11.5, color: '#7c6aff', marginTop: 3 }}>📍 {p.keyLevel}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Market Conditions */}
              <div style={{ width: 220, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '1px' }}>MARKET CONDITIONS</span>
                </div>
                <div style={{ flex: 1, padding: '4px 10px', overflowY: 'auto' }}>
                  {[
                    { label: 'VIX', value: vixPrice ? vixPrice.toFixed(2) : '—', sub: vixPrice ? (vixPrice > 25 ? 'EXTREME' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL') : '', color: vixPrice ? (vixPrice > 25 ? C.red : vixPrice > 18 ? C.fire : C.synapse) : C.textDim },
                    { label: 'Breadth', value: marketIntel?.breadth?.bias || '—', sub: marketIntel?.breadth ? `${marketIntel.breadth.advancing}↑ ${marketIntel.breadth.declining}↓` : '', color: marketIntel?.breadth?.advancing >= 6 ? C.synapse : marketIntel?.breadth?.declining >= 6 ? C.red : C.fire },
                    { label: 'QQQ', value: marketIntel?.sectors?.QQQ ? `${Number(marketIntel.sectors.QQQ.todayChange) > 0 ? '+' : ''}${marketIntel.sectors.QQQ.todayChange}%` : '—', sub: 'Tech', color: Number(marketIntel?.sectors?.QQQ?.todayChange) > 0 ? C.synapse : C.red },
                    { label: 'IWM', value: marketIntel?.sectors?.IWM ? `${Number(marketIntel.sectors.IWM.todayChange) > 0 ? '+' : ''}${marketIntel.sectors.IWM.todayChange}%` : '—', sub: 'Small Cap', color: Number(marketIntel?.sectors?.IWM?.todayChange) > 0 ? C.synapse : C.red },
                    { label: 'XLK', value: marketIntel?.sectors?.XLK ? `${Number(marketIntel.sectors.XLK.todayChange) > 0 ? '+' : ''}${marketIntel.sectors.XLK.todayChange}%` : '—', sub: 'Tech Sector', color: Number(marketIntel?.sectors?.XLK?.todayChange) > 0 ? C.synapse : C.red },
                    { label: 'XLF', value: marketIntel?.sectors?.XLF ? `${Number(marketIntel.sectors.XLF.todayChange) > 0 ? '+' : ''}${marketIntel.sectors.XLF.todayChange}%` : '—', sub: 'Financials', color: Number(marketIntel?.sectors?.XLF?.todayChange) > 0 ? C.synapse : C.red },
                    { label: 'TLT', value: marketIntel?.sectors?.TLT ? `${Number(marketIntel.sectors.TLT.todayChange) > 0 ? '+' : ''}${marketIntel.sectors.TLT.todayChange}%` : '—', sub: 'Bonds', color: Number(marketIntel?.sectors?.TLT?.todayChange) > 0 ? C.synapse : C.red },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <div><span style={{ fontSize: 12, color: C.textDim }}>{label}</span>{sub && <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 4 }}>{sub}</span>}</div>
                      <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 3 — LOG TRADE */}
        {/* ═══════════════════════════════════════════════════════ */}
        {tab === 'log' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Left — Trade entry */}
            <div style={{ width: 300, background: 'rgba(12,15,26,0.98)', borderRight: `1px solid rgba(0,212,160,0.1)`, padding: 16, overflowY: 'auto', flexShrink: 0 }}>
              <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Log Trade</div>

              {[
                { label: 'Symbol', key: 'symbol', ph: 'SPX' },
                { label: 'Entry Price', key: 'entry', ph: '5840.00' },
                { label: 'Exit Price', key: 'exit', ph: '5855.00' },
                { label: 'P&L ($)', key: 'pnl', ph: '+850' },
                { label: 'Notes', key: 'notes', ph: 'What happened?' },
              ].map(({ label, key, ph }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
                  <input value={(newTrade as any)[key]} onChange={e => setNewTrade(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={ph} style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px solid ${C.border2}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none' }} />
                </div>
              ))}

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Direction</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['call', 'put'].map(d => (
                    <button key={d} onClick={() => setNewTrade(p => ({ ...p, direction: d }))} style={{
                      flex: 1, background: newTrade.direction === d ? (d === 'call' ? C.tealDim : C.redDim) : 'transparent',
                      border: `1px solid ${newTrade.direction === d ? (d === 'call' ? C.teal : C.red) : C.border2}`,
                      borderRadius: 5, padding: '5px 0', color: newTrade.direction === d ? (d === 'call' ? C.teal : C.red) : C.textDim,
                      cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: font, textTransform: 'uppercase'
                    }}>{d}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Playbook Used</div>
                <select value={newTrade.playbook} onChange={e => setNewTrade(p => ({ ...p, playbook: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px solid ${C.border2}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none' }}>
                  <option value="">None / Free trade</option>
                  {playbooks.map(pb => <option key={pb.id} value={pb.name}>{pb.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div onClick={() => setNewTrade(p => ({ ...p, inSystem: !p.inSystem }))} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: newTrade.inSystem ? C.tealDim : C.redDim, border: `1px solid ${newTrade.inSystem ? C.tealBorder : C.redBorder}`
                }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: newTrade.inSystem ? C.teal : C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: C.bg, fontWeight: 800 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: newTrade.inSystem ? C.teal : C.red }}>
                    {newTrade.inSystem ? 'IN-SYSTEM trade' : 'OUT-OF-SYSTEM trade'}
                  </span>
                </div>
              </div>

              <button onClick={() => {
                const trade = {
                  ...newTrade,
                  id: Date.now(),
                  date: new Date().toISOString().split('T')[0],
                  pnl: parseFloat(newTrade.pnl) || 0,
                }
                setTrades(p => [trade, ...p])
                setNewTrade({ symbol: 'SPX', direction: 'call', entry: '', exit: '', pnl: '', inSystem: true, notes: '', playbook: '' })
              }} style={{ width: '100%', background: C.teal, border: 'none', borderRadius: 8, padding: '10px 0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font }}>
                Save Trade
              </button>

              {/* CSV Import */}
              <div style={{ marginTop: 20, borderTop: '1px solid rgba(0,229,255,0.1)', paddingTop: 16 }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>Import from Broker</div>
                <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>Upload a CSV export from ThinkorSwim, Tradovate, Webull, or any broker. Your trade history will feed the AI to improve its analysis.</div>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button onClick={() => csvInputRef.current?.click()} style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px dashed ${C.border2}`, borderRadius: 6, padding: '10px 0', color: C.textDim, cursor: 'pointer', fontSize: 12, fontFamily: font }}>
                  📁 Upload CSV
                </button>
                {importStatus && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: importStatus.startsWith('✓') ? C.teal : C.yellow, padding: '6px 8px', background: importStatus.startsWith('✓') ? C.tealDim : C.yellowDim, borderRadius: 5 }}>
                    {importStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Right — Today's trades */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: C.text }}>Trade History</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: todayPnL >= 0 ? C.teal : C.red, fontWeight: 700 }}>Today: {todayPnL >= 0 ? '+' : ''}${todayPnL.toFixed(0)}</div>
                  {tradeStats && (
                    <div style={{ fontSize: 11.5, color: C.textDim, background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '2px 8px' }}>
                      {tradeStats.winRate}% win rate
                    </div>
                  )}
                </div>
              </div>

              {trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: C.textDim, fontSize: 12 }}>No trades logged yet. Log manually or import a CSV.</div>
              ) : (
                trades.map((t: any) => (
                  <div key={t.id} style={{ background: 'rgba(12,15,26,0.95)', border: '1px solid rgba(0,229,255,0.10)', borderRadius: 6, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: t.pnl >= 0 ? C.tealDim : C.redDim, border: `1px solid ${t.pnl >= 0 ? C.tealBorder : C.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: t.pnl >= 0 ? C.teal : C.red }}>{t.pnl >= 0 ? '+' : '≈'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t.symbol}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: t.direction === 'call' ? C.tealDim : C.redDim, color: t.direction === 'call' ? C.teal : C.red }}>{(t.direction || '').toUpperCase()}</span>
                        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: t.inSystem ? C.tealDim : C.redDim, color: t.inSystem ? C.teal : C.red }}>{t.inSystem ? 'IN-SYS' : 'OUT-SYS'}</span>
                        {t.playbook && <span style={{ fontSize: 11, color: C.textDim }}>{t.playbook}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.textDim }}>{t.date} {t.notes && `· ${t.notes}`}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: t.pnl >= 0 ? C.teal : C.red }}>
                      {t.pnl >= 0 ? '+' : ''}${typeof t.pnl === 'number' ? t.pnl.toFixed(0) : t.pnl}
                    </div>
                    <button onClick={() => setTrades(p => p.filter((x: any) => x.id !== t.id))} style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 4 — JOURNAL / ANALYTICS */}
        {tab === 'learn' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

            {/* ── SETUP ENGINE rollup (primary signal source — measured hit rates) ── */}
            <SetupStatsCard font={font} fontDisplay={fontDisplay} />

            {/* ── AI LEARNING DASHBOARD header + signal stats (always top) ── */}
            {insights && !insightsLoading && (() => {
              const s = insights.summary
              const C2 = { purple: '#7c6aff', green: '#00ff88', red: '#ff4d6d', yellow: '#f59e0b', muted: '#4a5568', text: '#e2e8f0' }
              const statBox = (label: string, value: string | number, sub?: string, color = C2.text) => (
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: fontDisplay }}>{value}</div>
                  {sub && <div style={{ fontSize: 11, color: C2.muted, marginTop: 2 }}>{sub}</div>}
                </div>
              )
              return (
                <div style={{ marginBottom: 14 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, color: '#7c6aff', letterSpacing: 2 }}>AI LEARNING DASHBOARD</div>
                    <button onClick={() => { setInsights(null); setInsightsLoading(true); fetch('/api/insights').then(r => r.json()).then(d => { setInsights(d); setInsightsLoading(false) }).catch(() => setInsightsLoading(false)) }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(124,106,255,0.3)', background: 'transparent', color: '#7c6aff', cursor: 'pointer', fontFamily: font }}>↺ Refresh</button>
                  </div>
                  {/* Data quality banner */}
                  <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 10, background: s.total < 10 ? 'rgba(245,158,11,0.08)' : 'rgba(0,255,136,0.05)', border: `1px solid ${s.total < 10 ? 'rgba(245,158,11,0.2)' : 'rgba(0,255,136,0.15)'}`, fontSize: 12, color: s.total < 10 ? '#f59e0b' : '#00ff88' }}>
                    {insights.dataQuality.note}
                  </div>
                  {/* Signal performance stats */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Signal Performance</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {statBox('Win Rate', `${s.winRate}%`, `${s.total} signals`, s.winRate >= 55 ? C2.green : s.winRate >= 45 ? C2.yellow : C2.red)}
                      {statBox('Avg P&L', `${s.avgPts > 0 ? '+' : ''}${s.avgPts}pts`, 'per signal')}
                      {statBox('LONG WR', s.longWinRate !== null ? `${s.longWinRate}%` : 'n/a', 'calls', s.longWinRate >= 55 ? C2.green : C2.yellow)}
                      {statBox('SHORT WR', s.shortWinRate !== null ? `${s.shortWinRate}%` : 'n/a', 'puts', s.shortWinRate >= 55 ? C2.green : C2.yellow)}
                    </div>
                  </div>
                  {/* Last 5 days */}
                  {s.recent5d.count > 0 && (
                    <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: C2.muted }}>Last 5 trading days ({s.recent5d.count} signals)</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: s.recent5d.winRate >= 55 ? C2.green : s.recent5d.winRate >= 45 ? C2.yellow : C2.red }}>{s.recent5d.winRate}% win rate</span>
                    </div>
                  )}

                  {/* Mechanical Flow Accuracy */}
                  {mechAccuracy && mechAccuracy.sampleSize > 0 && (
                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 6, background: 'rgba(124,106,255,0.05)', border: '1px solid rgba(124,106,255,0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: 2, textTransform: 'uppercase' as const }}>Mechanical Flow Edge</span>
                        <span style={{ fontSize: 11, color: '#4a5568' }}>{mechAccuracy.sampleSize} scored trades</span>
                      </div>
                      {mechAccuracy.edge && (
                        <div style={{ padding: '5px 8px', borderRadius: 4, background: mechAccuracy.verdict === 'STRONG_EDGE' ? 'rgba(0,255,136,0.08)' : mechAccuracy.verdict === 'INVERSE_EDGE' ? 'rgba(255,77,109,0.08)' : 'rgba(255,255,255,0.04)', fontSize: 11.5, color: mechAccuracy.verdict === 'STRONG_EDGE' ? '#00ff88' : mechAccuracy.verdict === 'INVERSE_EDGE' ? '#ff4d6d' : '#b0c4de', marginBottom: 8 }}>
                          {mechAccuracy.verdict === 'STRONG_EDGE' ? '✓ ' : mechAccuracy.verdict === 'INVERSE_EDGE' ? '⚠ ' : ''}{mechAccuracy.edge}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11.5 }}>
                        <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(0,255,136,0.04)' }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>When mechanics aligned</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#00ff88', fontFamily: fontDisplay }}>{mechAccuracy.alignedTrades.winRate}%</div>
                          <div style={{ fontSize: 10, color: '#6b7a9a' }}>{mechAccuracy.alignedTrades.count} trades | {mechAccuracy.alignedTrades.avgPnl > 0 ? '+' : ''}${mechAccuracy.alignedTrades.avgPnl} avg</div>
                        </div>
                        <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(255,77,109,0.04)' }}>
                          <div style={{ fontSize: 10, color: '#4a5568' }}>When mechanics opposed</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#ff4d6d', fontFamily: fontDisplay }}>{mechAccuracy.opposedTrades.winRate}%</div>
                          <div style={{ fontSize: 10, color: '#6b7a9a' }}>{mechAccuracy.opposedTrades.count} trades | {mechAccuracy.opposedTrades.avgPnl > 0 ? '+' : ''}${mechAccuracy.opposedTrades.avgPnl} avg</div>
                        </div>
                        {mechAccuracy.amplifyTrades.count > 0 && (
                          <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.04)' }}>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>AMPLIFY setups</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', fontFamily: fontDisplay }}>{mechAccuracy.amplifyTrades.winRate}%</div>
                            <div style={{ fontSize: 10, color: '#6b7a9a' }}>{mechAccuracy.amplifyTrades.count} trades</div>
                          </div>
                        )}
                        {mechAccuracy.windowFollow.edgePts !== null && (
                          <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(0,229,255,0.04)' }}>
                            <div style={{ fontSize: 10, color: '#4a5568' }}>Window timing edge</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: mechAccuracy.windowFollow.edgePts > 0 ? '#00e5ff' : '#ff4d6d', fontFamily: fontDisplay }}>{mechAccuracy.windowFollow.edgePts > 0 ? '+' : ''}${mechAccuracy.windowFollow.edgePts}</div>
                            <div style={{ fontSize: 10, color: '#6b7a9a' }}>following vs ignoring</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Daily Recap — most recent end-of-day summary ── */}
            {dailyRecap?.mostRecent && (() => {
              const r = dailyRecap.mostRecent
              const d = r.recap_data || {}
              const wr = r.win_rate
              const wrColor = wr === null ? '#6b7a9a' : wr >= 60 ? '#00ff88' : wr >= 50 ? '#00d4a0' : wr >= 40 ? '#f59e0b' : '#ff4d6d'
              return (
                <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 900, color: C.teal, letterSpacing: 2, textTransform: 'uppercase' as const }}>
                      Daily Recap
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#6b7a9a' }}>
                        {r.recap_date} · {r.signals_count} signals
                      </span>
                      {dailyRecap.recaps && dailyRecap.recaps.length > 1 && (
                        <select
                          value={r.recap_date}
                          onChange={(e) => {
                            const found = dailyRecap.recaps.find((x: any) => x.recap_date === e.target.value)
                            if (found) setDailyRecap({ ...dailyRecap, mostRecent: found })
                          }}
                          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 4, padding: '2px 6px', color: C.teal, fontSize: 10, fontFamily: font, cursor: 'pointer' }}
                        >
                          {dailyRecap.recaps.map((x: any) => (
                            <option key={x.recap_date} value={x.recap_date}>{x.recap_date}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/agents/daily-recap?force=true', { method: 'POST' })
                            const json = await res.json()
                            console.log('[recap] regenerate result:', json)
                            fetch('/api/daily-recap').then(r2 => r2.json()).then(setDailyRecap).catch(() => {})
                          } catch (e) { console.error('[recap] regen failed:', e) }
                        }}
                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.3)', background: 'transparent', color: C.teal, cursor: 'pointer', fontFamily: font, fontWeight: 700, letterSpacing: 1 }}
                        title="Regenerate today's recap and resend email"
                      >
                        ↻ REGEN
                      </button>
                    </div>
                  </div>

                  {/* Headline */}
                  <div style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 800, color: '#f0f4ff', letterSpacing: 0.3, lineHeight: 1.3, marginBottom: 12 }}>
                    {d.headline || 'Daily recap'}
                  </div>

                  {/* KPI strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                    <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>WIN RATE</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: wrColor }}>{wr ?? '—'}%</div>
                      <div style={{ fontSize: 10, color: '#6b7a9a' }}>{r.wins}W / {r.losses}L</div>
                    </div>
                    <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>SIGNALS</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: '#b0c4de' }}>{r.signals_count || 0}</div>
                      <div style={{ fontSize: 10, color: '#6b7a9a' }}>fired</div>
                    </div>
                    <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>DAY TYPE</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: '#7c6aff', marginTop: 4 }}>
                        {r.day_type_predicted || '—'}
                      </div>
                      {r.day_type_actual && (
                        <div style={{ fontSize: 10, color: r.day_type_predicted === r.day_type_actual ? '#00ff88' : '#f59e0b' }}>
                          {r.day_type_predicted === r.day_type_actual ? '✓ accurate' : `actual: ${r.day_type_actual}`}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>LEARNING</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, color: d.didLearnSomething ? '#00ff88' : '#6b7a9a', marginTop: 4 }}>
                        {d.didLearnSomething ? 'YES' : 'NONE'}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7a9a' }}>{d.didLearnSomething ? 'updated' : 'stable'}</div>
                    </div>
                  </div>

                  {/* Performance summary */}
                  {d.performanceSummary && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: 1.5, marginBottom: 5 }}>PERFORMANCE</div>
                      <div style={{ fontSize: 12, color: '#b0c4de', lineHeight: 1.7 }}>{d.performanceSummary}</div>
                    </div>
                  )}

                  {/* Calibration note */}
                  {d.calibrationNote && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 5, fontSize: 11, color: '#8899bb', lineHeight: 1.6 }}>
                      <strong style={{ color: '#00e5ff' }}>Calibration: </strong>{d.calibrationNote}
                    </div>
                  )}

                  {/* What worked / What failed — side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {d.whatWorked && d.whatWorked.length > 0 && (
                      <div style={{ padding: 10, background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 5 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#00ff88', letterSpacing: 1, marginBottom: 6 }}>✓ WHAT WORKED</div>
                        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 11, color: '#b0c4de', lineHeight: 1.7 }}>
                          {d.whatWorked.map((w: string, i: number) => <li key={i} style={{ marginBottom: 3 }}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                    {d.whatFailed && d.whatFailed.length > 0 && (
                      <div style={{ padding: 10, background: 'rgba(255,77,109,0.04)', border: '1px solid rgba(255,77,109,0.15)', borderRadius: 5 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ff4d6d', letterSpacing: 1, marginBottom: 6 }}>✗ WHAT FAILED</div>
                        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 11, color: '#b0c4de', lineHeight: 1.7 }}>
                          {d.whatFailed.map((w: string, i: number) => <li key={i} style={{ marginBottom: 3 }}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Learnings */}
                  {d.didLearnSomething && d.learnings && d.learnings.length > 0 && (
                    <div style={{ padding: 10, background: 'rgba(124,106,255,0.05)', border: '1px solid rgba(124,106,255,0.25)', borderRadius: 5, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7c6aff', letterSpacing: 1.5, marginBottom: 6 }}>WHAT IT LEARNED</div>
                      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#e0e8ff', lineHeight: 1.75 }}>
                        {d.learnings.map((l: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{l}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Tomorrow adjustments */}
                  {d.tomorrowAdjustments && d.tomorrowAdjustments.length > 0 && (
                    <div style={{ padding: 10, background: 'rgba(0,212,160,0.05)', border: '1px solid rgba(0,212,160,0.25)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4a0', letterSpacing: 1.5, marginBottom: 6 }}>TOMORROW THE SYSTEM WILL</div>
                      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#e0e8ff', lineHeight: 1.75 }}>
                        {d.tomorrowAdjustments.map((a: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Honest no-learning note */}
                  {!d.didLearnSomething && d.noLearningReason && (
                    <div style={{ padding: 10, background: 'rgba(107,122,154,0.05)', border: '1px dashed rgba(107,122,154,0.3)', borderRadius: 5, fontSize: 11, color: '#8899bb', fontStyle: 'italic' as const, lineHeight: 1.6 }}>
                      No new learning applied: {d.noLearningReason}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* No recap yet */}
            {dailyRecap && !dailyRecap.mostRecent && (
              <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px dashed rgba(0,229,255,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 900, color: C.teal, letterSpacing: 2 }}>
                    Daily Recap
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/agents/daily-recap?force=true', { method: 'POST' })
                        const json = await res.json()
                        console.log('[recap] manual generate result:', json)
                        // Refresh
                        fetch('/api/daily-recap').then(r => r.json()).then(setDailyRecap).catch(() => {})
                      } catch (e) { console.error('[recap] manual generate failed:', e) }
                    }}
                    style={{ fontSize: 11, padding: '5px 12px', borderRadius: 5, border: '1px solid rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.08)', color: C.teal, cursor: 'pointer', fontFamily: font, fontWeight: 700, letterSpacing: 1 }}
                  >
                    GENERATE NOW
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#8899bb', lineHeight: 1.7 }}>
                  Your first end-of-day recap will be generated automatically at 4:30pm ET on trading days. It summarizes performance, calibration, what worked, what failed, what the system learned, and what it will do differently next session. You can also click "Generate Now" to force-create today's recap immediately.
                </div>
              </div>
            )}

            {/* ── Model Validation — confidence calibration + component accuracy ── */}
            {modelValidation && modelValidation.ready && (
              <div style={{ background: 'rgba(124,106,255,0.04)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color: '#7c6aff', letterSpacing: 2, textTransform: 'uppercase' as const }}>
                    Model Validation
                  </div>
                  <button
                    onClick={() => { setModelValidation(null); fetch('/api/model-validation').then(r => r.json()).then(setModelValidation).catch(() => {}) }}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(124,106,255,0.3)', background: 'transparent', color: '#7c6aff', cursor: 'pointer', fontFamily: font }}
                  >↺ Refresh</button>
                </div>
                <div style={{ fontSize: 11.5, color: '#8899bb', marginBottom: 14, fontStyle: 'italic' as const }}>
                  Independent validation of model accuracy — every signal scored against actual SPX movement regardless of whether you traded it.
                </div>

                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                    <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>OVERALL WIN RATE</div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: modelValidation.summary.winRate >= 55 ? '#00ff88' : modelValidation.summary.winRate >= 45 ? '#f59e0b' : '#ff4d6d' }}>
                      {modelValidation.summary.winRate}%
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7a9a' }}>{modelValidation.summary.wins}W / {modelValidation.summary.losses}L</div>
                  </div>
                  <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                    <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>LAST 7 DAYS</div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: (modelValidation.summary.recentWinRate ?? 0) >= 55 ? '#00ff88' : (modelValidation.summary.recentWinRate ?? 0) >= 45 ? '#f59e0b' : '#ff4d6d' }}>
                      {modelValidation.summary.recentWinRate ?? '—'}%
                    </div>
                    {modelValidation.summary.trendDelta !== null && (
                      <div style={{ fontSize: 10, color: modelValidation.summary.trendDelta > 0 ? '#00ff88' : '#ff4d6d' }}>
                        {modelValidation.summary.trendDelta > 0 ? '+' : ''}{modelValidation.summary.trendDelta} vs prior
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                    <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>CALIBRATION</div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, color: modelValidation.calibration.health === 'EXCELLENT' ? '#00ff88' : modelValidation.calibration.health === 'GOOD' ? '#00d4a0' : modelValidation.calibration.health === 'FAIR' ? '#f59e0b' : '#ff4d6d', marginTop: 2 }}>
                      {modelValidation.calibration.health}
                    </div>
                    {modelValidation.calibration.avgGap !== null && (
                      <div style={{ fontSize: 10, color: '#6b7a9a' }}>avg gap: {modelValidation.calibration.avgGap}pts</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' as const, padding: '8px 6px', background: 'rgba(0,0,0,0.25)', borderRadius: 5 }}>
                    <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 1 }}>SAMPLE</div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: '#b0c4de' }}>
                      {modelValidation.summary.totalSignals}
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7a9a' }}>scored signals</div>
                  </div>
                </div>

                {/* Calibration table */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: 1.5, marginBottom: 6 }}>CONFIDENCE CALIBRATION</div>
                  <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 10, lineHeight: 1.6 }}>
                    {modelValidation.calibration.interpretation}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {modelValidation.calibration.bands.map((b: any, i: number) => {
                      const hasData = b.actualRate !== null
                      const gap = b.calibrationGap
                      const gapColor = gap === null ? '#4a5568' :
                                        Math.abs(gap) <= 5 ? '#00ff88' :
                                        Math.abs(gap) <= 10 ? '#f59e0b' : '#ff4d6d'
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: 12 }}>
                          <span style={{ width: 65, color: '#b0c4de', fontWeight: 600 }}>{b.range}</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 80, fontSize: 11, color: '#6b7a9a' }}>predicted: <strong style={{ color: '#7c6aff' }}>{b.predictedRate}%</strong></span>
                            <span style={{ width: 80, fontSize: 11, color: '#6b7a9a' }}>actual: {hasData ? <strong style={{ color: '#00e5ff' }}>{b.actualRate}%</strong> : <span style={{ color: '#4a5568' }}>—</span>}</span>
                            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, position: 'relative' as const, overflow: 'hidden' }}>
                              {hasData && (
                                <>
                                  <div style={{ position: 'absolute' as const, left: `${b.predictedRate}%`, top: -2, bottom: -2, width: 1, background: '#7c6aff' }} />
                                  <div style={{ position: 'absolute' as const, left: `${b.actualRate}%`, top: -2, bottom: -2, width: 2, background: '#00e5ff' }} />
                                </>
                              )}
                            </div>
                            <span style={{ width: 36, textAlign: 'right' as const, fontSize: 11, color: gapColor, fontWeight: 700 }}>
                              {gap !== null ? (gap > 0 ? '+' : '') + gap : '—'}
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: '#6b7a9a', width: 50, textAlign: 'right' as const }}>n={b.sample}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Component accuracy */}
                {modelValidation.componentAccuracy?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: 1.5, marginBottom: 6 }}>COMPONENT ACCURACY — each voter's predictive power</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {modelValidation.componentAccuracy.map((c: any, i: number) => {
                        const verdictColor = c.verdict === 'STRONG' ? '#00ff88' : c.verdict === 'EDGE' ? '#00d4a0' : c.verdict === 'NEUTRAL' ? '#f59e0b' : '#ff4d6d'
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: 12 }}>
                            <span style={{ flex: 1, color: '#b0c4de', fontWeight: 600 }}>{c.component}</span>
                            <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${c.accuracy}%`, background: verdictColor, transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ width: 38, textAlign: 'right' as const, fontFamily: fontDisplay, fontWeight: 800, color: verdictColor }}>{c.accuracy}%</span>
                            <span style={{ width: 50, fontSize: 10, color: '#6b7a9a', fontWeight: 700, letterSpacing: 1 }}>{c.verdict}</span>
                            <span style={{ width: 30, fontSize: 10, color: '#4a5568', textAlign: 'right' as const }}>n={c.sample}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Signal type accuracy */}
                {modelValidation.signalTypeAccuracy?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: 1.5, marginBottom: 6 }}>BY SIGNAL TYPE</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {modelValidation.signalTypeAccuracy.map((s: any, i: number) => (
                        <div key={i} style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: 11, color: '#6b7a9a', fontWeight: 700, marginRight: 6 }}>{s.signal}:</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: (s.winRate ?? 0) >= 55 ? '#00ff88' : (s.winRate ?? 0) >= 45 ? '#f59e0b' : '#ff4d6d', fontFamily: fontDisplay }}>
                            {s.winRate ?? '—'}%
                          </span>
                          <span style={{ fontSize: 10, color: '#4a5568', marginLeft: 5 }}>(n={s.sample})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Model validation - early state */}
            {modelValidation && !modelValidation.ready && (
              <div style={{ background: 'rgba(124,106,255,0.04)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color: '#7c6aff', letterSpacing: 2, marginBottom: 8 }}>
                  Model Validation
                </div>
                <div style={{ fontSize: 12, color: '#8899bb', lineHeight: 1.6 }}>
                  {modelValidation.message || 'Validation will activate once signals are scored.'}
                </div>
                <div style={{ fontSize: 11.5, color: '#6b7a9a', marginTop: 6, fontStyle: 'italic' as const }}>
                  Every signal is auto-scored vs actual SPX action by the score-alerts grader (nudged by the cockpit every ~5min during market hours — keep a tab open). Calibration metrics appear after ~10 scored signals.
                </div>
              </div>
            )}

            {/* ── Learning Pulse — always shown first ── */}
            {pulse && (() => {
              const C2 = { purple: '#7c6aff', green: '#00ff88', red: '#ff4d6d', yellow: '#f59e0b', muted: '#4a5568', text: '#e2e8f0', cyan: '#00e5ff' }
              const statusDot = (status: string) => status === 'LEARNING_ACTIVE' || status === 'FULL_INTEL' ? '🟢' : status.includes('NO_') ? '🔴' : '🟡'
              return (
                <div style={{ marginBottom: 14 }}>
                  {/* Next steps — most important */}
                  {pulse.nextSteps?.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C2.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6 }}>Learning Status</div>
                      {pulse.nextSteps.map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: s.startsWith('✅') ? C2.green : s.startsWith('🔴') ? C2.red : C2.yellow, padding: '3px 0', lineHeight: 1.5 }}>{s}</div>
                      ))}
                    </div>
                  )}

                  {/* Signal pipeline */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: 2, textTransform: 'uppercase' as const }}>Signal Pipeline</span>
                      <span style={{ fontSize: 11.5 }}>{statusDot(pulse.signals?.total === 0 ? 'NO_SIGNALS_YET' : pulse.signals?.scored === 0 ? 'PENDING' : 'LEARNING_ACTIVE')}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 6 }}>
                      {[
                        { label: 'Total', val: pulse.signals?.total || 0, color: C2.text },
                        { label: 'Scored', val: pulse.signals?.scored || 0, color: C2.cyan },
                        { label: 'Pending', val: pulse.signals?.pending || 0, color: pulse.signals?.pending > 0 ? C2.yellow : C2.muted },
                        { label: 'Win Rate', val: pulse.signals?.winRate !== null ? `${pulse.signals?.winRate}%` : 'n/a', color: pulse.signals?.winRate >= 55 ? C2.green : pulse.signals?.winRate >= 40 ? C2.yellow : C2.muted },
                      ].map((s, i) => (
                        <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(0,0,0,0.2)', borderRadius: 5, padding: '6px 4px' }}>
                          <div style={{ fontSize: 10, color: C2.muted, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: fontDisplay }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11.5, color: C2.muted }}>{pulse.signals?.message}</div>
                  </div>

                  {/* Stream weights */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: 2, textTransform: 'uppercase' as const }}>Stream Weights ({pulse.streamWeights?.count || 0} streams)</span>
                      <span style={{ fontSize: 11.5 }}>{pulse.streamWeights?.hasLearned ? '🟢' : '🟡'}</span>
                    </div>
                    {(pulse.streamWeights?.weights || []).slice(0, 10).map((w: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: C2.muted, width: 90, flexShrink: 0 }}>{w.name}</span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, w.weight * 50)}%`, background: w.direction === 'BOOSTED' ? C2.green : w.direction === 'REDUCED' ? C2.red : C2.muted, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: w.direction === 'BOOSTED' ? C2.green : w.direction === 'REDUCED' ? C2.red : C2.muted, width: 32, textAlign: 'right' as const }}>{w.weight.toFixed(2)}x</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: C2.muted, marginTop: 4 }}>{pulse.streamWeights?.message}</div>
                  </div>

                  {/* Signal timeline */}
                  {pulse.timeline?.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6 }}>Recent Signals</div>
                      {pulse.timeline.slice(0, 8).map((s: any, i: number) => {
                        const isWin  = s.outcome === 'WIN' || s.outcome === 'HIT_T1' || s.outcome === 'HIT_T2'
                        const isLoss = s.outcome === 'LOSS' || s.outcome === 'STOPPED_OUT'
                        const col    = isWin ? C2.green : isLoss ? C2.red : s.outcome === 'PENDING' ? C2.yellow : C2.muted
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: i < 7 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                            <span style={{ fontSize: 10, color: C2.muted, width: 50, flexShrink: 0 }}>{s.date?.slice(5)}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: s.signal === 'LONG' ? C2.green : s.signal === 'SHORT' ? C2.red : C2.muted, width: 40 }}>{s.signal}</span>
                            <span style={{ fontSize: 11, color: C2.muted, width: 30 }}>{s.confidence}%</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: col, flex: 1 }}>{s.outcome}</span>
                            <span title={s.hasIntel ? 'Full market intel' : s.hasSnapshot ? 'Basic snapshot' : 'No snapshot'}
                              style={{ fontSize: 11, color: s.hasIntel ? C2.green : s.hasSnapshot ? C2.yellow : C2.red }}>
                              {s.hasIntel ? '●' : s.hasSnapshot ? '◐' : '○'}
                            </span>
                          </div>
                        )
                      })}
                      <div style={{ fontSize: 11, color: C2.muted, marginTop: 4 }}>● full intel ◐ basic snapshot ○ no snapshot</div>
                    </div>
                  )}

                  {/* AI learnings */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: 2, textTransform: 'uppercase' as const }}>AI Has Learned</span>
                      <span style={{ fontSize: 11.5 }}>{pulse.aiLearnings?.chatLearningsCount > 0 ? '🟢' : '🟡'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                      {[
                        { label: 'Sessions', val: pulse.aiLearnings?.chatLearningsCount || 0 },
                        { label: 'Weaknesses', val: pulse.aiLearnings?.weaknessCount || 0 },
                        { label: 'Strengths', val: pulse.aiLearnings?.strengthCount || 0 },
                      ].map((s, i) => (
                        <div key={i} style={{ textAlign: 'center' as const, background: 'rgba(0,0,0,0.2)', borderRadius: 5, padding: '6px 4px' }}>
                          <div style={{ fontSize: 10, color: C2.muted, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: s.val > 0 ? C2.purple : C2.muted, fontFamily: fontDisplay }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {pulse.aiLearnings?.latestLearning && (
                      <div style={{ fontSize: 11.5, color: C2.text, background: 'rgba(124,106,255,0.05)', borderRadius: 5, padding: '6px 8px', border: '1px solid rgba(124,106,255,0.1)' }}>
                        <span style={{ fontSize: 10, color: C2.purple, fontWeight: 700 }}>LATEST: </span>
                        {typeof pulse.aiLearnings.latestLearning === 'string'
                          ? pulse.aiLearnings.latestLearning
                          : pulse.aiLearnings.latestLearning?.summary || JSON.stringify(pulse.aiLearnings.latestLearning).substring(0, 150)}
                      </div>
                    )}
                    {pulse.aiLearnings?.recentWeaknesses?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: C2.red, fontWeight: 700, marginBottom: 3 }}>WEAKNESSES IDENTIFIED:</div>
                        {pulse.aiLearnings.recentWeaknesses.map((w: any, i: number) => (
                          <div key={i} style={{ fontSize: 11.5, color: '#ffb0b8', padding: '2px 0' }}>• {typeof w === 'string' ? w : w.description || JSON.stringify(w).substring(0, 100)}</div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: C2.muted, marginTop: 6 }}>
                      {pulse.aiLearnings?.chatDaysThisWeek || 0} chat days this week · {pulse.aiLearnings?.chatMsgsThisWeek || 0} messages
                    </div>
                  </div>

                  {/* Refresh */}
                  <button onClick={() => {
                    setPulse(null); setPulseLoading(true)
                    fetch('/api/learning-pulse').then(r => r.json()).then(d => { setPulse(d); setPulseLoading(false) }).catch(() => setPulseLoading(false))
                  }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(124,106,255,0.3)', background: 'transparent', color: '#7c6aff', cursor: 'pointer', fontFamily: font, width: '100%' }}>↺ Refresh Learning Data</button>
                </div>
              )
            })()}

            {(pulseLoading && !pulse) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                <div style={{ width: 10, height: 10, border: '1.5px solid rgba(124,106,255,0.2)', borderTopColor: '#7c6aff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 12, color: '#4a5568' }}>Loading learning data...</span>
              </div>
            )}

            {insightsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20 }}>
                <div style={{ width: 10, height: 10, border: '1.5px solid rgba(124,106,255,0.2)', borderTopColor: '#7c6aff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 12, color: C.textMuted }}>Loading insights...</span>
              </div>
            )}

            {/* ── PERSONAL TRIGGER ENGINE (Phase 2C) ──────────────────────── */}
            <TriggerManager font={font} fontDisplay={fontDisplay} />

            {/* ── SHADOW VALIDATION STREAM (Phase 2B) ────────────────────── */}
            <ShadowValidationStream font={font} fontDisplay={fontDisplay} />

            {insights && !insightsLoading && (() => {
              const s = insights.summary
              const C2 = { purple: '#7c6aff', green: '#00ff88', red: '#ff4d6d', yellow: '#f59e0b', muted: '#4a5568', text: '#e2e8f0' }
              const statBox = (label: string, value: string | number, sub?: string, color = C2.text) => (
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: fontDisplay }}>{value}</div>
                  {sub && <div style={{ fontSize: 11, color: C2.muted, marginTop: 2 }}>{sub}</div>}
                </div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Confidence calibration */}
                  {insights.confidenceCalibration?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Confidence Calibration</div>
                      <div style={{ fontSize: 11.5, color: C2.muted, marginBottom: 6 }}>Does the AI's confidence actually predict outcomes?</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {insights.confidenceCalibration.map((c: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: 11.5, color: C2.muted, width: 70 }}>{c.range}</span>
                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${c.winRate}%`, background: c.winRate >= 60 ? C2.green : c.winRate >= 45 ? C2.yellow : C2.red, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: c.winRate >= 60 ? C2.green : c.winRate >= 45 ? C2.yellow : C2.red, width: 40 }}>{c.winRate}%</span>
                            <span style={{ fontSize: 11, color: C2.muted }}>{c.count} signals{c.note ? ` · ${c.note}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VIX performance */}
                  {insights.vixPerformance?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Performance by VIX Regime</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {insights.vixPerformance.map((v: any, i: number) => (
                          <div key={i} style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' as const }}>
                            <div style={{ fontSize: 11, color: C2.muted, marginBottom: 4 }}>{v.regime}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: v.winRate >= 55 ? C2.green : v.winRate >= 45 ? C2.yellow : C2.red }}>{v.winRate}%</div>
                            <div style={{ fontSize: 11, color: C2.muted }}>{v.count} signals</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plan alignment */}
                  {insights.alignment?.alignedWinRate !== null && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Plan Alignment Impact</div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, textAlign: 'center' as const }}>
                          <div style={{ fontSize: 11, color: C2.muted, marginBottom: 4 }}>Following Plan</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: C2.green }}>{insights.alignment.alignedWinRate}%</div>
                          <div style={{ fontSize: 11, color: C2.muted }}>{insights.alignment.alignedCount} signals</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' as const }}>
                          <div style={{ fontSize: 11, color: C2.muted, marginBottom: 4 }}>Diverging</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: insights.alignment.divergentWinRate >= insights.alignment.alignedWinRate ? C2.yellow : C2.red }}>{insights.alignment.divergentWinRate}%</div>
                          <div style={{ fontSize: 11, color: C2.muted }}>{insights.alignment.divergentCount} signals</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#7c6aff', marginTop: 8, textAlign: 'center' as const }}>{insights.alignment.note}</div>
                    </div>
                  )}

                  {/* ── Actionability Edge ── */}
                  {insights.actionabilityEdge?.actionableTotal > 0 && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#00e5ff', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Actionability Filter Edge</div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <div style={{ flex: 1, textAlign: 'center' as const, padding: '8px 4px', background: 'rgba(0,255,136,0.05)', borderRadius: 5 }}>
                          <div style={{ fontSize: 11, color: '#4a5568', marginBottom: 4 }}>ACTIONABLE trades</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#00ff88', fontFamily: fontDisplay }}>{insights.actionabilityEdge.actionableWinRate}%</div>
                          <div style={{ fontSize: 11, color: C2.muted }}>{insights.actionabilityEdge.actionableTotal} signals</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' as const, padding: '8px 4px', background: 'rgba(255,77,109,0.05)', borderRadius: 5 }}>
                          <div style={{ fontSize: 11, color: '#4a5568', marginBottom: 4 }}>NOISE (overridden)</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#ff4d6d', fontFamily: fontDisplay }}>{insights.actionabilityEdge.noiseWinRate ?? '—'}%</div>
                          <div style={{ fontSize: 11, color: C2.muted }}>{insights.actionabilityEdge.noiseTotal} signals</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#7c6aff', textAlign: 'center' as const }}>{insights.actionabilityEdge.note}</div>
                    </div>
                  )}

                  {/* ── Setup Score Performance ── */}
                  {insights.setupScorePerformance?.length > 0 && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Setup Score → Win Rate</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {insights.setupScorePerformance.map((s: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
                            <span style={{ fontSize: 11.5, color: C2.text, width: 110 }}>{s.range}</span>
                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${s.winRate}%`, background: s.winRate >= 55 ? '#00ff88' : s.winRate >= 45 ? '#f59e0b' : '#ff4d6d', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: s.winRate >= 55 ? '#00ff88' : s.winRate >= 45 ? '#f59e0b' : '#ff4d6d', width: 32, textAlign: 'right' as const }}>{s.winRate}%</span>
                            <span style={{ fontSize: 11, color: C2.muted, width: 36 }}>{s.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Feature Breakdowns ── */}
                  {(insights.featureBreakdowns?.mechanical?.length > 0 ||
                    insights.featureBreakdowns?.asymmetric?.length > 0 ||
                    insights.featureBreakdowns?.namedSetups?.length > 0) && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(124,106,255,0.04)', border: '1px solid rgba(124,106,255,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c6aff', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Feature Performance Breakdowns</div>
                      {['namedSetups', 'mechanical', 'asymmetric', 'actionability', 'setupType', 'crossAsset', 'session', 'dayType'].map((key) => {
                        const items = insights.featureBreakdowns[key] || []
                        if (!items.length) return null
                        return (
                          <div key={key} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#6b7a9a', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 }}>{key}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                              {items.map((b: any, i: number) => (
                                <div key={i} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                                  background: b.winRate >= 55 ? 'rgba(0,255,136,0.07)' : b.winRate >= 45 ? 'rgba(255,183,0,0.07)' : 'rgba(255,77,109,0.07)',
                                  border: '1px solid ' + (b.winRate >= 55 ? 'rgba(0,255,136,0.2)' : b.winRate >= 45 ? 'rgba(255,183,0,0.2)' : 'rgba(255,77,109,0.2)'),
                                  color: b.winRate >= 55 ? '#00ff88' : b.winRate >= 45 ? '#f59e0b' : '#ff4d6d',
                                }}>
                                  {b.label}: {b.winRate}% ({b.count})
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* What the AI has learned */}
                  {insights.aiLearnings?.chatLearnings?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>What the AI Has Learned (Last 7 Sessions)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {insights.aiLearnings.chatLearnings.map((l: any, i: number) => (
                          <div key={i} style={{ background: 'rgba(124,106,255,0.05)', borderRadius: 6, padding: '8px 12px', border: '1px solid rgba(124,106,255,0.1)', fontSize: 12, color: C2.text, lineHeight: 1.6 }}>
                            <span style={{ fontSize: 11, color: '#7c6aff', fontWeight: 700, marginRight: 6 }}>{l.date || `Session ${i+1}`}</span>
                            {l.summary || l.observations || JSON.stringify(l).substring(0, 150)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Identified weaknesses */}
                  {insights.aiLearnings?.weaknesses?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.red, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>⚠ Identified Weaknesses</div>
                      {insights.aiLearnings.weaknesses.map((w: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#ffb0b8', padding: '5px 0', borderBottom: '1px solid rgba(255,77,109,0.08)' }}>• {typeof w === 'string' ? w : w.description || JSON.stringify(w)}</div>
                      ))}
                    </div>
                  )}

                  {/* Identified strengths */}
                  {insights.aiLearnings?.strengths?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.green, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>✓ Identified Strengths</div>
                      {insights.aiLearnings.strengths.map((s: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#a7f3d0', padding: '5px 0', borderBottom: '1px solid rgba(0,255,136,0.08)' }}>• {typeof s === 'string' ? s : s.description || JSON.stringify(s)}</div>
                      ))}
                    </div>
                  )}

                  {/* Recent losses */}
                  {insights.recentLosses?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C2.muted, letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: 8 }}>Recent Losses — What Went Wrong</div>
                      {insights.recentLosses.map((l: any, i: number) => (
                        <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,77,109,0.04)', border: '1px solid rgba(255,77,109,0.1)', marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: C2.red }}>{l.signal}</span>
                            <span style={{ fontSize: 11.5, color: C2.muted }}>{l.date} · {l.confidence}% confidence · VIX {l.vix?.toFixed(1)}</span>
                          </div>
                          {l.aiView && <div style={{ fontSize: 11.5, color: C2.muted }}>{l.aiView}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )
            })()}
          </div>
        )}

        {tab === 'journal' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#050609' }}>
            {/* Header row with title + import button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: C.text }}>Performance Analytics</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => csvInputRef.current?.click()} style={{ background: C.tealDim, border: '1px solid ' + C.tealBorder, borderRadius: 6, padding: '6px 12px', color: C.teal, cursor: 'pointer', fontSize: 12, fontFamily: font, fontWeight: 600 }}>
                  📂 Import CSV
                </button>
                {importStatus && <span style={{ fontSize: 11.5, color: importStatus.startsWith('✓') ? C.synapse : C.yellow }}>{importStatus}</span>}
              </div>
            </div>

            {/* 6 stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Net P&L</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.totalPnl) >= 0 ? C.synapse : C.red }}>{tradeStats ? (parseFloat(tradeStats.totalPnl) >= 0 ? '+' : '') + '$' + tradeStats.totalPnl : '$0'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>{trades.length} trades</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Win Rate</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.winRate) >= 60 ? C.synapse : tradeStats && parseFloat(tradeStats.winRate) >= 50 ? C.yellow : C.red }}>{tradeStats ? tradeStats.winRate + '%' : '0%'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>{tradeStats ? Math.round(trades.filter((t: any) => t.pnl > 0).length) + '/' + trades.length : '0/0'}</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Avg Win</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: C.synapse }}>{tradeStats ? '+$' + tradeStats.avgWin : '$0'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>per winner</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Avg Loss</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: C.red }}>{tradeStats ? '-$' + tradeStats.avgLoss : '$0'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>per loser</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Profit Factor</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.profitFactor) >= 1.5 ? C.synapse : tradeStats && parseFloat(tradeStats.profitFactor) >= 1 ? C.yellow : C.red }}>{tradeStats ? tradeStats.profitFactor + 'x' : '0x'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>win/loss ratio</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>In-System</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.inSystemWinRate) >= 60 ? C.synapse : C.yellow }}>{tradeStats ? tradeStats.inSystemWinRate + '%' : '0%'}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>playbook trades</div>
              </div>
            </div>

            {!trades.length ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(12,15,26,0.98)', borderRadius: 12, border: '1px solid ' + C.border }}>
                
                <div style={{ fontSize: 14, color: C.textDim, marginBottom: 8 }}>No trade data yet</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Import a TOS CSV or add trades in the LOG TRADE tab</div>
                <button onClick={() => csvInputRef.current?.click()} style={{ background: C.tealDim, border: '1px solid ' + C.tealBorder, borderRadius: 8, padding: '10px 20px', color: C.teal, cursor: 'pointer', fontSize: 12, fontFamily: font, fontWeight: 700 }}>
                  📂 Import Trades CSV
                </button>
              </div>
            ) : (
              <div>

                {/* Daily P&L Calendar */}
                {(() => {
                  const { yr, mo } = calMonth
                  const now2 = new Date()
                  const isCurrentMonth = yr === now2.getFullYear() && mo === now2.getMonth()
                  const dim = new Date(yr, mo + 1, 0).getDate()
                  const fdm = new Date(yr, mo, 1).getDay()
                  const mos = String(mo + 1).padStart(2, '0')
                  const monthLabel = new Date(yr, mo, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                  const byDay: Record<string, number> = {}
                  trades.forEach((t: any) => { const k = String(t.date || ''); if (k) byDay[k] = (byDay[k] || 0) + (parseFloat(t.pnl) || 0) })
                  const prevMonth = () => setCalMonth(c => { const d = new Date(c.yr, c.mo - 1, 1); return {yr: d.getFullYear(), mo: d.getMonth()} })
                  const nextMonth = () => setCalMonth(c => { const d = new Date(c.yr, c.mo + 1, 1); return {yr: d.getFullYear(), mo: d.getMonth()} })
                  return (
                    <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <button onClick={prevMonth} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: C.textMuted, cursor: 'pointer', fontSize: 12, padding: '2px 8px', fontFamily: font }}>‹</button>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Daily P&L — {monthLabel}</div>
                        <button onClick={nextMonth} disabled={isCurrentMonth} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: isCurrentMonth ? C.border : C.textMuted, cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: 12, padding: '2px 8px', fontFamily: font }}>›</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{d}</div>)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                        {Array.from({ length: fdm }).map((_, i) => <div key={'e' + i} />)}
                        {Array.from({ length: dim }).map((_, i) => {
                          const day = i + 1
                          const ds = yr + '-' + mos + '-' + String(day).padStart(2, '0')
                          const pnl = byDay[ds]
                          const dow = (fdm + i) % 7
                          const isWe = dow === 0 || dow === 6
                          const isToday = isCurrentMonth && day === now2.getDate()
                          return (
                            <div key={day} style={{ height: 44, borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: isWe ? 'transparent' : pnl != null ? (pnl >= 0 ? 'rgba(0,255,136,0.10)' : 'rgba(255,26,74,0.10)') : 'rgba(10,14,24,0.95)', border: '1px solid ' + (isToday ? C.teal : pnl != null ? (pnl >= 0 ? 'rgba(0,255,136,0.30)' : 'rgba(255,26,74,0.35)') : C.border) }}>
                              <span style={{ fontSize: 11, color: isToday ? C.teal : C.textMuted, fontWeight: isToday ? 700 : 400, lineHeight: 1 }}>{day}</span>
                              {pnl != null && <span style={{ fontSize: 10, fontWeight: 700, color: pnl >= 0 ? C.synapse : C.red, lineHeight: 1 }}>{pnl >= 0 ? '+' : ''}${Math.abs(pnl) >= 1000 ? (pnl / 1000).toFixed(1) + 'k' : Math.round(pnl)}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Hour of day + Playbook side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

                  {/* P&L by Hour */}
                  {(() => {
                    const byHr: Record<number, number> = {}
                    trades.forEach((t: any) => {
                      if (!t.time) return
                      const h = parseInt(t.time.split(':')[0])
                      if (!isNaN(h)) byHr[h] = (byHr[h] || 0) + (parseFloat(t.pnl) || 0)
                    })
                    const hrs = Object.entries(byHr).map(([h, p]) => ({ h: parseInt(h), p: p as number })).sort((a, b) => a.h - b.h)
                    const maxAbs = hrs.length ? Math.max(...hrs.map(e => Math.abs(e.p)), 1) : 1
                    const best = hrs.length ? [...hrs].sort((a, b) => b.p - a.p)[0] : null
                    const worst = hrs.length ? [...hrs].sort((a, b) => a.p - b.p)[0] : null
                    return (
                      <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>P&L by Hour</div>
                        {hrs.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.textMuted }}>Add trades with time data to see hourly breakdown</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 64, marginBottom: 6 }}>
                              {Array.from({ length: 14 }, (_, i) => i + 7).map(h => {
                                const hp = byHr[h] || 0
                                const hpct = Math.abs(hp) / maxAbs * 100
                                return (
                                  <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: hp >= 0 ? 'flex-end' : 'flex-start', height: 52 }}>
                                      <div style={{ width: '100%', height: hpct + '%', minHeight: hp !== 0 ? 2 : 0, background: hp >= 0 ? 'rgba(0,170,85,0.7)' : 'rgba(204,16,64,0.7)', borderRadius: 2 }} />
                                    </div>
                                    <span style={{ fontSize: 9, color: C.textMuted }}>{h > 12 ? h - 12 + 'p' : h + 'a'}</span>
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              {best && <div style={{ background: 'rgba(0,170,85,0.08)', border: '1px solid rgba(0,170,85,0.2)', borderRadius: 5, padding: '6px 8px' }}>
                                <div style={{ fontSize: 11, color: C.textMuted }}>Best</div>
                                <div style={{ fontSize: 12, color: C.synapse, fontWeight: 700 }}>{best.h > 12 ? best.h - 12 + 'PM' : best.h + 'AM'} (+${Math.round(best.p)})</div>
                              </div>}
                              {worst && <div style={{ background: 'rgba(204,16,64,0.06)', border: '1px solid rgba(204,16,64,0.2)', borderRadius: 5, padding: '6px 8px' }}>
                                <div style={{ fontSize: 11, color: C.textMuted }}>Worst</div>
                                <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>{worst.h > 12 ? worst.h - 12 + 'PM' : worst.h + 'AM'} (${Math.round(worst.p)})</div>
                              </div>}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}

                  {/* Playbook breakdown */}
                  {(() => {
                    const byPb: Record<string, { w: number, tot: number, pnl: number }> = {}
                    trades.forEach((t: any) => {
                      const k = String(t.playbook || 'No playbook')
                      if (!byPb[k]) byPb[k] = { w: 0, tot: 0, pnl: 0 }
                      byPb[k].tot++
                      if (parseFloat(t.pnl) > 0) byPb[k].w++
                      byPb[k].pnl += parseFloat(t.pnl) || 0
                    })
                    const pbs = Object.entries(byPb).sort((a, b) => b[1].pnl - a[1].pnl)
                    return (
                      <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Playbook Performance</div>
                        {pbs.map(([name, pb]) => {
                          const wr = pb.tot ? Math.round(pb.w / pb.tot * 100) : 0
                          return (
                            <div key={name} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 12, color: '#f0f4ff', fontWeight: 600 }}>{name}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: pb.pnl >= 0 ? C.synapse : C.red }}>{pb.pnl >= 0 ? '+' : ''}${Math.round(pb.pnl)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
                                <span>{pb.tot} trades</span>
                                <span style={{ color: wr >= 60 ? C.synapse : wr >= 50 ? C.yellow : C.red }}>{wr}% win</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(20,26,40,0.95)' }}>
                                <div style={{ height: '100%', width: wr + '%', background: wr >= 60 ? C.synapse : wr >= 50 ? C.yellow : C.red, borderRadius: 2 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* AI Pattern Analysis */}
                <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.tealBorder, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.teal }} />
                    <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: C.teal }}>AI Pattern Recognition</div>
                  </div>
                  <button onClick={async () => {
                    setAiLoading(true)
                    try {
                      const wins = trades.filter((t: any) => parseFloat(t.pnl) > 0)
                      const losses = trades.filter((t: any) => parseFloat(t.pnl) < 0)
                      const avgW = wins.length ? wins.reduce((s: number, t: any) => s + parseFloat(t.pnl), 0) / wins.length : 0
                      const avgL = losses.length ? Math.abs(losses.reduce((s: number, t: any) => s + parseFloat(t.pnl), 0) / losses.length) : 0
                      const prompt = `Analyze SPX options trader data. Win rate: ${tradeStats?.winRate}%, Total P&L: $${tradeStats?.totalPnl}, Profit factor: ${tradeStats?.profitFactor}x, Avg win: $${Math.round(avgW)}, Avg loss: $${Math.round(avgL)}, In-system win rate: ${tradeStats?.inSystemWinRate}%, Total trades: ${trades.length}. Give 3 specific, actionable insights to improve edge. Be direct and quantitative. Format: 1. [insight] 2. [insight] 3. [insight]`
                      const resp = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }) })
                      const dat = await resp.json()
                      const analysis = dat.content?.[0]?.text || 'No analysis available'
                      setChatMessages([{ role: 'assistant', content: 'Pattern Analysis:\n\n' + analysis }])
                      setTab('cockpit')
                    } catch (e) { console.error(e) }
                    setAiLoading(false)
                  }} style={{ background: C.tealDim, border: '1px solid ' + C.tealBorder, borderRadius: 7, padding: '8px 14px', color: C.teal, cursor: 'pointer', fontFamily: font, fontSize: 12, fontWeight: 700, marginRight: 8 }}>
                    {aiLoading ? '↻ Analyzing...' : '🔍 Analyze My Patterns'}
                  </button>
                  <span style={{ fontSize: 11.5, color: C.textMuted }}>Sends your stats to AI — results appear in cockpit chat</span>
                </div>

              </div>
            )}
          </div>
        )}
      </div>

        {/* ── AI VOICE COMPANION (floating — only on non-cockpit tabs) ── */}
      <div style={{
        position: 'fixed', bottom: 0, right: 0,
        width: companionOpen ? 420 : 64,
        height: companionOpen ? 580 : 64,
        zIndex: 600,
        transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
        display: tab === 'cockpit' ? 'none' : undefined,
        pointerEvents: tab === 'cockpit' ? 'none' : undefined,
      }}>
        {/* Collapsed brain button */}
        {!companionOpen && (
          <button onClick={() => setCompanionOpen(true)} style={{
            position: 'absolute', bottom: 20, right: 20,
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: `radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(60,20,120,0.9) 60%)`,
            boxShadow: `0 0 20px rgba(124,58,237,0.4), 0 0 40px rgba(124,58,237,0.15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, animation: 'aiGlow 3s ease-in-out infinite',
          }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 900, color: '#00e5ff', letterSpacing: 1.5 }}>AI</span>
          </button>
        )}

        {/* Expanded companion panel */}
        {tab !== 'cockpit' && companionOpen && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 420, height: 580,
            background: 'rgba(6,8,16,0.99)',
            border: `1px solid rgba(0,212,160,0.2)`,
            borderRadius: '16px 0 0 0',
            display: 'flex', flexDirection: 'column',
            boxShadow: `-4px -4px 30px rgba(0,212,160,0.1), 0 -2px 10px rgba(100,140,220,0.08)`,
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '10px 14px',
              background: `linear-gradient(90deg, rgba(0,212,160,0.07), rgba(0,153,204,0.04))`,
              borderBottom: `1px solid rgba(0,212,160,0.12)`,
              display: 'flex', alignItems: 'center', gap: 10,
              flexShrink: 0, position: 'relative', zIndex: 2,
            }}>
              {/* Brain orb */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid rgba(124,58,237,0.5)`, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 11.5, fontWeight: 900, color: '#00e5ff', letterSpacing: 1.5 }}>AI</span>
                </div>
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid rgba(124,58,237,0.2)`, animation: 'brainRing 4s linear infinite' }} />
              </div>
              <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: C.teal, textShadow: `0 0 12px rgba(124,58,237,0.5)` }}>
                AI COMPANION
              </div>
              {/* Status */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', border: `1px solid ${listening ? 'rgba(255,60,96,0.4)' : speaking ? 'rgba(124,58,237,0.4)' : 'rgba(0,229,255,0.25)'}`, color: listening ? C.red : speaking ? C.violet : C.teal, background: listening ? 'rgba(255,60,96,0.08)' : speaking ? 'rgba(124,58,237,0.08)' : 'rgba(0,229,255,0.05)', animation: listening ? 'listeningPulse 1s infinite' : 'none' }}>
                {listening ? '✏ LISTENING' : speaking ? '↗ SPEAKING' : chatLoading ? 'THINKING' : '✓ READY'}
              </div>
              {aiResult && (
                <div style={{ marginLeft: 'auto', background: `${signalColor}15`, border: `1px solid ${signalColor}35`, borderRadius: 2, padding: '2px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 800, color: signalColor, letterSpacing: 2 }}>{aiResult.signal}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>{aiResult.confidence}%</span>
                </div>
              )}
              <button title="Pop out companion" onClick={() => window.open('/cockpit/companion', 'tz-companion', 'width=400,height=640,top=50,right=50,resizable=yes')} style={{ background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 3, color: C.teal, cursor: 'pointer', fontSize: 11, padding: '2px 6px', fontFamily: font }}>⤢</button>
              <button onClick={() => setCompanionOpen(false)} title="Minimize" style={{ background: 'transparent', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: 16, padding: 0, marginLeft: 2 }}>⌄</button>
            </div>

            {/* Context snapshot */}
            <div style={{
              padding: '5px 14px',
              background: 'rgba(10,14,24,0.95)',
              borderBottom: `1px solid rgba(100,140,220,0.08)`,
              display: 'flex', gap: 0, flexShrink: 0, position: 'relative', zIndex: 2,
            }}>
              {[
                { label: 'SPX', value: fmt(currentPrice), color: C.text },
                { label: 'VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲' : '▼') : '—', color: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? C.synapse : C.red) : C.textDim },
                { label: 'VIX', value: vixPrice ? vixPrice.toFixed(1) : '—', color: vixPrice && vixPrice > 25 ? C.red : vixPrice && vixPrice > 18 ? C.fire : C.synapse },
                { label: 'SCORE', value: `${score}/13`, color: gradeColor },
                { label: 'P&L', value: `$${todayPnL.toFixed(0)}`, color: todayPnL >= 0 ? C.synapse : C.red },
                { label: 'BOOK', value: activePlaybook ? activePlaybook.name.split(' ')[0] : 'None', color: activePlaybook ? C.teal : C.textMuted },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < 5 ? `1px solid rgba(100,140,220,0.06)` : 'none' }}>
                  <div style={{ fontSize: 9, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Messages */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 2, background: 'rgba(10,14,24,0.95)' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900, color: '#00e5ff', letterSpacing: 2, marginBottom: 10 }}>AI</div>
                  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
                    Watching your session live. All market data, your plan, and the chart are loaded. Ask anything or use the mic.
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                    {["What's the setup?", "Should I trade?", "Am I in system?", "What does flow say?"].map(q => (
                      <button key={q} onClick={() => sendChatWithText(q)} style={{ background: C.tealDim, border: `1px solid ${C.tealBorder}`, borderRadius: 99, padding: '3px 10px', color: C.textDim, cursor: 'pointer', fontSize: 11, fontFamily: font }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                  {m.role === 'assistant' && (
                    <div style={{ fontSize: 9, color: C.teal, fontWeight: 700, marginBottom: 3, display: 'flex', gap: 4, alignItems: 'center', letterSpacing: 1 }}>
                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.teal, boxShadow: `0 0 4px ${C.violet}` }} />
                      AI COMPANION
                    </div>
                  )}
                  <div style={{
                    padding: '7px 11px',
                    borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '2px 8px 8px 8px',
                    fontSize: 12, lineHeight: 1.65,
                    background: m.role === 'user' ? 'rgba(0,229,255,0.06)' : 'rgba(124,58,237,0.08)',
                    border: m.role === 'user' ? `1px solid rgba(0,229,255,0.15)` : `1px solid rgba(124,58,237,0.2)`,
                    borderRight: m.role === 'user' ? '2px solid #00e5ff' : undefined,
                    borderLeft: m.role === 'assistant' ? '2px solid #00d4a0' : undefined,
                    color: C.text,
                  }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: 'flex-start' }}>
                  <div style={{ fontSize: 9, color: C.teal, fontWeight: 700, marginBottom: 3, letterSpacing: 1 }}>AI COMPANION</div>
                  <div style={{ padding: '8px 12px', borderRadius: '2px 8px 8px 8px', background: 'rgba(124,58,237,0.08)', border: `1px solid rgba(124,58,237,0.18)`, borderLeft: `2px solid ${C.violet}`, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: `pulse 1s ${i*0.15}s infinite` }} />)}
                  </div>
                </div>
              )}
              {listening && liveTranscript && (
                <div style={{ alignSelf: 'flex-end', padding: '5px 9px', borderRadius: '8px 8px 2px 8px', background: 'rgba(255,60,96,0.08)', border: `1px solid rgba(255,60,96,0.3)`, borderRight: `2px solid ${C.red}`, fontSize: 11.5, color: C.red, fontStyle: 'italic' }}>
                  {liveTranscript}...
                </div>
              )}
            </div>

            {/* MIC + Input bar */}
            <div style={{
              padding: '8px 12px',
              borderTop: `1px solid rgba(0,212,160,0.1)`,
              background: 'transparent',
              flexShrink: 0, position: 'relative', zIndex: 2,
            }}>
              {/* Waveform when speaking */}
              {speaking && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginBottom: 8, height: 20 }}>
                  {[...Array(20)].map((_, i) => (
                    <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4 + (i % 5) * 0.1}s ease-in-out infinite`, animationDelay: `${(i % 4) * 0.08}s`, '--wh': `${6 + (i % 6) * 2}px` } as any} />
                  ))}
                  <span style={{ fontSize: 10, color: C.teal, marginLeft: 8, letterSpacing: 1 }}>SPEAKING</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* MIC BUTTON */}
                <button onClick={listening ? stopListening : startListening} style={{
                  width: 42, height: 42, borderRadius: '50%', cursor: 'pointer',
                  background: listening ? 'rgba(255,60,96,0.15)' : 'rgba(124,58,237,0.12)',
                  border: `1.5px solid ${listening ? C.red : C.tealBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  flexShrink: 0, boxShadow: listening ? `0 0 0 5px rgba(255,60,96,0.12), 0 0 20px rgba(255,60,96,0.25)` : `0 0 16px rgba(124,58,237,0.15)`,
                  transition: 'all 0.2s ease',
                  animation: listening ? 'none' : 'micGlow 2s ease-in-out infinite',
                }}>
                  {listening ? 'STOP' : 'TALK'}
                </button>

                {voiceEngine === 'openai' && !speaking && (
                  <button onClick={async () => {
                    try {
                      const res = await fetch('/api/voice', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ engine: 'openai', text: 'Voice check. Ready to trade.', voice: voiceId || 'nova', speed: voiceSpeed || 1.0 }) })
                      const ct = res.headers.get('content-type') || ''
                      if (ct.includes('audio')) {
                        const buf = await res.arrayBuffer()
                        const ACtx = window.AudioContext || (window as any).webkitAudioContext
                        const ctx = new ACtx()
                        if (ctx.state === 'suspended') await ctx.resume()
                        const audio = await ctx.decodeAudioData(buf)
                        const src = ctx.createBufferSource()
                        src.buffer = audio; src.connect(ctx.destination); src.start(0)
                      } else {
                        const d = await res.json()
                        alert('Voice error: ' + (d.detail || d.error))
                      }
                    } catch(e: any) { alert('Voice error: ' + e.message) }
                  }} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, border: `1px solid ${C.tealBorder}`, background: 'transparent', color: C.teal, cursor: 'pointer', fontFamily: font, flexShrink: 0 }}>
                    🔊 test
                  </button>
                )}
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder={listening ? 'Listening... (tap ↹ to stop)' : 'Ask your AI companion...'}
                  style={{
                    flex: 1, background: 'rgba(0,229,255,0.04)',
                    border: `1px solid ${listening ? 'rgba(255,60,96,0.4)' : 'rgba(0,229,255,0.12)'}`,
                    borderRadius: 2, padding: '8px 12px', color: C.text,
                    fontFamily: font, fontSize: 12, outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />

                <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{
                  width: 36, height: 36, borderRadius: 2, border: `1px solid ${chatInput.trim() && keys[ANTH_KEY] ? C.tealBorder : 'rgba(0,229,255,0.08)'}`,
                  background: chatInput.trim() && keys[ANTH_KEY] ? 'rgba(124,58,237,0.18)' : 'transparent',
                  color: chatInput.trim() && keys[ANTH_KEY] ? C.violet : C.textDim,
                  cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontFamily: font, fontWeight: 700, flexShrink: 0,
                }}>↑</button>
              </div>

              {/* Voice switcher — compact */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid rgba(124,58,237,0.12)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: C.textDim, letterSpacing: '1px', textTransform: 'uppercase' }}>Voice</span>
                  {speaking && <span style={{ fontSize: 10, color: C.teal, animation: 'pulse 0.8s infinite' }}>✏ speaking</span>}
                  <button onClick={() => setShowSettings(true)} style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>+ more voices</button>
                  <button
                    title={avatarMode ? 'Avatar ON — click to disable' : 'Enable Avatar Companion'}
                    onClick={() => {
                      const next = !avatarMode
                      setAvatarMode(next)
                      localStorage.setItem('tz-avatar-mode', String(next))
                    }}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      border: `1px solid ${avatarMode ? 'rgba(0,212,160,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      background: avatarMode ? 'rgba(0,212,160,0.1)' : 'transparent',
                      color: avatarMode ? '#00d4a0' : '#4a5568',
                      cursor: 'pointer', fontFamily: font,
                    }}>🤖</button>
                </div>
                {avatarMode && (
                  <input
                    value={avatarId}
                    onChange={e => { setAvatarId(e.target.value); localStorage.setItem('tz-avatar-id', e.target.value) }}
                    placeholder="Paste HeyGen avatar ID..."
                    style={{ width: '100%', marginBottom: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 4, padding: '3px 8px', color: '#00d4a0', fontSize: 11, fontFamily: font, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                )}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {[
                    { name: 'Rachel', id: '21m00Tcm4TlvDq8ikWAM' },
                    { name: 'Drew', id: '29vD33N1CtxCmqQRPOHJ' },
                    { name: 'Clyde', id: '2EiwWnXFnvU5JabPnv8n' },
                    { name: 'Paul', id: '5Q0t7uMcjvnagumLfvZi' },
                    { name: 'Domi', id: 'AZnzlk1XvdvUeBnXmlld' },
                    { name: 'Dave', id: 'CYw3kZ78EXmF4bPxNGZ2' },
                    { name: 'Sarah', id: 'EXAVITQu4vr4xnSDxMaL' },
                    { name: 'Thomas', id: 'GBv7mTt0atIp3Br8iCZE' },
                  ].map(v => (
                    <button key={v.id} onClick={() => { setVoiceId(v.id); localStorage.setItem(VOICE_ID, v.id) }} style={{
                      padding: '2px 7px', borderRadius: 2,
                      background: voiceId === v.id ? C.tealDim : 'transparent',
                      border: `1px solid ${voiceId === v.id ? C.tealBorder : 'rgba(0,229,255,0.08)'}`,
                      color: voiceId === v.id ? C.teal : C.textDim,
                      fontSize: 11, cursor: 'pointer', fontFamily: font, transition: 'all 0.12s',
                    }}>{v.name}</button>
                  ))}
                </div>
                <input
                  value={voiceId && !['21m00Tcm4TlvDq8ikWAM','29vD33N1CtxCmqQRPOHJ','2EiwWnXFnvU5JabPnv8n','5Q0t7uMcjvnagumLfvZi','AZnzlk1XvdvUeBnXmlld','CYw3kZ78EXmF4bPxNGZ2','EXAVITQu4vr4xnSDxMaL','GBv7mTt0atIp3Br8iCZE'].includes(voiceId) ? voiceId : ''}
                  onChange={e => { setVoiceId(e.target.value); localStorage.setItem(VOICE_ID, e.target.value) }}
                  placeholder="Custom ElevenLabs voice ID..."
                  style={{ width: '100%', marginTop: 5, background: 'rgba(0,229,255,0.03)', border: `1px solid rgba(0,229,255,0.08)`, borderRadius: 2, padding: '4px 8px', color: C.text, fontSize: 11, outline: 'none', fontFamily: font }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// chart pagination fix - trading days based 20260427131644
