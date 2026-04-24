'use client'
import TutorialModal from './TutorialModal'
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
function calcProbabilities({
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
  marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory, earningsCalendar
}: any) {
  if (!currentPrice) return null
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
  const earningsSection = earningsCalendar.length
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

  const prompt = `You are an elite SPX intraday trading AI companion. Your job is to keep this trader disciplined, data-driven, and in their system.

PRICE & LEVELS:
SPX: ${fmt(currentPrice)} | Open: ${fmt(levels?.dayOpen)} | PDH: ${fmt(levels?.pdh)} | PDL: ${fmt(levels?.pdl)}
vs SPY VWAP (${fmt(levels?.spyVwap)}): ${currentPrice && levels?.spyVwap ? (currentPrice > levels.spyVwap ? 'ABOVE' : 'BELOW') : '?'}
vs 200 EMA (${fmt(levels?.ema200)}): ${currentPrice && levels?.ema200 ? (currentPrice > levels.ema200 ? 'ABOVE' : 'BELOW') : '?'}
Implied move: ${fmt(levels?.impliedLow)} — ${fmt(levels?.impliedHigh)}
Recent 5 candles: ${recent}

VIX: ${marketIntel?.vix?.current || '?'} (${marketIntel?.vix?.level || '?'})
Market breadth: ${marketIntel?.breadth?.bias || 'Unknown'}
Market tide P/C: ${marketTide?.putCallRatio || '?'} — ${marketTide?.bias || '?'}

OPTIONS FLOW:
${flowSection}

EARNINGS THIS WEEK (S&P 500 / Large Cap):
${earningsSection}

${tiingoSection}

${morningSection}

${playbookSection}

TRADER STATS:
${statsSection}

${macroRegime ? `MACRO: ${macroRegime.regime} — ${macroRegime.keyRisk}` : ''}
${marketNews ? `NEWS: ${(marketNews||'').substring(0,250)}` : ''}
${economicCalendar ? `CALENDAR: ${(economicCalendar||'').substring(0,120)}` : ''}
${multiTFData ? `MULTI-TF: ${multiTFData.confluence}` : ''}
${zeroDTESkew ? `0DTE: ${zeroDTESkew.skewLabel} P/C ${zeroDTESkew.pcRatio}` : ''}
${marketScore ? `SCORE: ${marketScore.score}/100 ${marketScore.label}` : ''}
${tradePatterns?.revengePatterns > 2 ? `⚠ REVENGE TRADING PATTERN DETECTED` : ''}
${sessionMemory ? `MEMORY: ${(sessionMemory||'').substring(0,150)}` : ''}

Be direct, specific, reference the playbook. Use news/calendar/macro context. No generic advice.

Respond ONLY with this JSON:
{
  "signal": "LONG" | "SHORT" | "WAIT" | "NO TRADE",
  "confidence": 0-100,
  "marketConditions": "2-3 sentences",
  "todaysEdge": "1-2 sentences — specific to playbook if active",
  "accountability": "1 sentence calling out any rule violation risk",
  "riskFlag": "1 sentence on biggest risk right now",
  "entryZone": { "high": 0.00, "low": 0.00 },
  "stopLevel": 0.00,
  "target1": 0.00,
  "target2": 0.00,
  "moveSize": 0,
  "buyZones": [
    { "type": "buy", "high": 0.00, "low": 0.00 },
    { "type": "nobuy", "high": 0.00, "low": 0.00 }
  ]
}`

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    if (data.error || data?.error?.type === 'overloaded_error') return null
    const text = (data.content || []).map((i: any) => i.text || '').join('').replace(/```json|```/g, '').trim()
    if (!text) return null
    return JSON.parse(text)
  } catch { return null }
}


// ── #1 REAL-TIME NEWS ──────────────────────────────────────────────────────
async function fetchMarketNews(anthKey: string): Promise<string> {
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
async function fetchEconomicCalendar(anthKey: string): Promise<string> {
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
function calcMarketScore({
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
async function fetchMultiTFConfluence(polyKey: string, ticker: string): Promise<any> {
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
async function fetchZeroDTESkew(uwKey: string): Promise<any> {
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
function analyzeTradePatterns(trades: any[]): any {
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
async function fetchEarningsCalendar(): Promise<any[]> {
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

async function fetchMacroRegime(anthKey: string): Promise<any> {
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

function loadSessionMemory(): string {
  try {
    const mem = localStorage.getItem(SESSION_MEMORY_KEY)
    return mem ? JSON.parse(mem).join('\n') : ''
  } catch { return '' }
}

function saveSessionMemory(memories: string[]): void {
  try {
    // Keep last 20 memory entries
    localStorage.setItem(SESSION_MEMORY_KEY, JSON.stringify(memories.slice(-20)))
  } catch {}
}

function addMemory(entry: string): void {
  try {
    const existing = JSON.parse(localStorage.getItem(SESSION_MEMORY_KEY) || '[]')
    const dated = `[${new Date().toLocaleDateString()}] ${entry}`
    saveSessionMemory([...existing, dated])
  } catch {}
}

async function extractMemoryFromSession(anthKey: string, chatHistory: any[], tradePatterns: any, traderProfile: any): Promise<void> {
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
async function fetchMarketIntel(polyKey: string) {
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

async function fetchOptionsFlow(uwKey: string) {
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

async function fetchMarketTide(uwKey: string) {
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
async function fetchTiingoContext(tiingoKey: string, gapDirection: string, gapSize: string, impliedMove: string) {
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
function parseBrokerCSV(text: string): any[] {
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
function analyzeTradeHistory(trades: any[]) {
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
// ── TONE TESTER ─────────────────────────────────────────────────────────────
const TONE_SCENARIOS = [
  "I just revenge traded after hitting my daily loss limit. Took 3 extra trades and gave back everything.",
  "SPX is sitting right at VWAP. I want to go long but my checklist score is 4/13.",
  "I had a perfect setup at 10:15 and missed the entry because I hesitated. Now it's moved 30 points without me.",
  "I'm up $800 on the day. Should I take one more trade? The setup looks good.",
  "I've been staring at the screen for 2 hours and haven't taken a trade. I'm second-guessing everything.",
]

const TONE_NAMES: Record<number, string> = {
  1: 'Drill Sergeant',
  2: 'Direct & Firm',
  3: 'Balanced',
  4: 'Encouraging',
  5: 'Life Coach',
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

function ToneTester() {
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
        <span style={{ fontSize: 9, fontWeight: 700, color: '#00e5ff', letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Test Coaching Tone</span>
        <span style={{ fontSize: 9, color: '#6b7a9a', marginLeft: 2 }}>— see how each tone responds to real scenarios</span>
        <span style={{ fontSize: 11, color: '#6b7a9a', marginLeft: 'auto' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
          {/* Scenario selector */}
          <div>
            <div style={{ fontSize: 8, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 6 }}>Pick a scenario</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TONE_SCENARIOS.map((s, i) => (
                <div
                  key={i}
                  onClick={() => { setScenario(s); setCustomScenario('') }}
                  style={{ padding: '7px 10px', borderRadius: 5, border: `1px solid ${scenario === s && !customScenario ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`, background: scenario === s && !customScenario ? 'rgba(0,229,255,0.06)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', fontSize: 10, color: scenario === s && !customScenario ? '#d0d8f0' : '#8899bb', lineHeight: 1.5, transition: 'all 0.15s' }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div>
            <div style={{ fontSize: 8, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 6 }}>Or type your own</div>
            <textarea
              value={customScenario}
              onChange={e => { setCustomScenario(e.target.value); setScenario('') }}
              placeholder="Describe a situation you want the AI to respond to..."
              rows={2}
              style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 5, padding: '8px 10px', color: '#f0f4ff', fontSize: 11, fontFamily: font, resize: 'vertical' as const, outline: 'none', boxSizing: 'border-box' as const, lineHeight: 1.5 }}
            />
          </div>

          {/* Test button */}
          <button
            onClick={runTest}
            disabled={loading || !activeScenario}
            style={{ background: loading || !activeScenario ? 'rgba(0,229,255,0.04)' : 'rgba(0,229,255,0.1)', border: `1px solid ${loading || !activeScenario ? 'rgba(0,229,255,0.1)' : 'rgba(0,229,255,0.3)'}`, color: loading || !activeScenario ? '#4a5568' : '#00e5ff', borderRadius: 6, padding: '9px 0', fontSize: 11, fontWeight: 700, cursor: loading || !activeScenario ? 'not-allowed' : 'pointer', fontFamily: font, letterSpacing: '0.5px', transition: 'all 0.15s' }}
          >
            {loading ? '⟳ Testing all 5 tones...' : '↗ Compare All 5 Tones'}
          </button>

          {/* Results */}
          {Object.keys(results).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 8, color: '#6b7a9a', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 2 }}>Responses</div>
              {[1, 2, 3, 4, 5].map(tone => (
                <div key={tone} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${TONE_COLORS[tone]}22`, borderLeft: `3px solid ${TONE_COLORS[tone]}`, borderRadius: 5, padding: '9px 12px' }}>
                  <div style={{ fontFamily: fontD, fontSize: 11, fontWeight: 700, color: TONE_COLORS[tone], letterSpacing: '1px', marginBottom: 4 }}>
                    {tone} — {TONE_NAMES[tone]}
                  </div>
                  <div style={{ fontSize: 11, color: results[tone] ? '#d0d8f0' : '#4a5568', lineHeight: 1.7, fontStyle: results[tone] ? 'normal' : 'italic' }}>
                    {results[tone] || <span style={{ display: 'inline-block', width: 120, height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 3, animation: 'pulse 1.5s infinite' }} />}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 9, color: '#4a5568', textAlign: 'center' as const, marginTop: 2 }}>
                Adjust the slider above to set your preferred tone, then Save.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingsModal({ keys, setKeys, onClose, voiceId, setVoiceId, voiceEngine, setVoiceEngine, darkMode, setDarkMode, aiTone, setAiTone, userName, setUserName, welcomeMessage, setWelcomeMessage, voiceSpeed, setVoiceSpeed }: any) {
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
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{darkMode ? '🌙 Dark mode' : '☀️ Light mode'}</div>
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
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voice Engine</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button type="button" onClick={() => { setVoiceEngine('openai'); localStorage.setItem('tz-voice-engine', 'openai') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'openai' ? C.tealDim : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'openai' ? C.tealBorder : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'openai' ? C.teal : C.text, marginBottom: 2 }}>🎙 OpenAI TTS</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>Premium — natural voices</div>
              <div style={{ fontSize: 9, color: C.synapse, marginTop: 2 }}>Pro / Elite plans</div>
            </button>
            <button type="button" onClick={() => { setVoiceEngine('webspeech'); localStorage.setItem('tz-voice-engine', 'webspeech') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.1)' : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.4)' : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'webspeech' ? '#8899ee' : C.text, marginBottom: 2 }}>🔊 Browser Voice</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>Free — device voices</div>
              <div style={{ fontSize: 9, color: C.synapse, marginTop: 2 }}>All plans</div>
            </button>
          </div>

          {voiceEngine === 'openai' && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Select Voice</div>
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: selected ? C.teal : C.text }}>{v.name}</div>
                        <div style={{ fontSize: 9, color: C.textDim }}>{v.desc}</div>
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); testVoice(v.id) }} style={{ position: 'absolute' as const, top: '50%', right: 5, transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: '50%', border: `1px solid ${previewingVoice === v.id ? C.teal : C.border2}`, background: previewingVoice === v.id ? C.tealDim : 'transparent', color: previewingVoice === v.id ? C.teal : C.textMuted, cursor: 'pointer', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                        {previewingVoice === v.id ? '▶' : '▷'}
                      </button>
                    </div>
                  )
                })}
              </div>

            </div>
          )}

          {voiceEngine === 'webspeech' && (
            <div style={{ fontSize: 10, color: C.textDim, padding: '8px 12px', background: 'rgba(10,14,24,0.95)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>Uses your device's built-in voice engine. Completely free — no API costs.</span>
              <button type="button" onClick={() => {
                const utter = new SpeechSynthesisUtterance("SPX is approaching your key level. What's your read?")
                utter.rate = voiceSpeed || 1.0
                const voices = window.speechSynthesis.getVoices()
                const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen')) || voices.find(v => v.lang.startsWith('en'))
                if (preferred) utter.voice = preferred
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(utter)
              }} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 10, fontFamily: font }}>
                ▷ Preview
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Your Name</div>
          <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
            placeholder="e.g. Amir"
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>The AI will address you by name.</div>
        </div>

        {/* Welcome message */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Daily Welcome Message</div>
          <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
            placeholder={`e.g. "Good morning {name}. VIX is elevated — stay patient and wait for your setups."`}
            rows={3}
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 12, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Played once per day when you open the cockpit. Use <span style={{color: C.teal}}>{'{name}'}</span> to insert your name.</div>
        </div>

        {/* AI Tone Slider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>AI Coaching Tone</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.textDim }}>🪖 Drill Sergeant</span>
            <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>{['','Drill Sergeant','Direct & Firm','Balanced','Encouraging','Life Coach'][aiTone]}</span>
            <span style={{ fontSize: 10, color: C.textDim }}>Life Coach 🧘</span>
          </div>
          <input type="range" min={1} max={5} value={aiTone} onChange={e => setAiTone(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            {[,'Blunt, direct, zero tolerance for mistakes.','Tough love, honest feedback.','Balanced accountability and support.','Positive reinforcement focused.','Empathetic, confidence-building.'][aiTone]}
          </div>

          {/* Tone Tester */}
          <ToneTester />
        </div>

        {/* Voice Speed */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>Voice Speed</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.textDim }}>🐢 Slower</span>
            <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>{voiceSpeed <= 0.8 ? 'Slow' : voiceSpeed <= 1.0 ? 'Normal' : voiceSpeed <= 1.2 ? 'Fast' : 'Faster'}</span>
            <span style={{ fontSize: 10, color: C.textDim }}>Faster 🐇</span>
          </div>
          <input type="range" min={0.7} max={1.4} step={0.1} value={voiceSpeed} onChange={e => { setVoiceSpeed(parseFloat(e.target.value)); localStorage.setItem('tz-voice-speed', e.target.value) }}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Current: {voiceSpeed}x — Normal is 1.0x</div>
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
const TF_CONFIG: Record<string, {multiplier: number, timespan: string, daysBack: number, limit: number}> = {
  '1':  { multiplier: 1,  timespan: 'minute', daysBack: 1,   limit: 500 },
  '5':  { multiplier: 5,  timespan: 'minute', daysBack: 7,   limit: 500 },
  '15': { multiplier: 15, timespan: 'minute', daysBack: 14,  limit: 400 },
  '60': { multiplier: 60, timespan: 'minute', daysBack: 28,  limit: 200 },
  '1D': { multiplier: 1,  timespan: 'day',    daysBack: 365, limit: 500 },
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
  const [tab, setTab] = useState<'plan' | 'cockpit' | 'deepdive' | 'log' | 'journal'>('plan')
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


  // Market data
  const [candles, setCandles] = useState<any[]>([])
  const [spyCandles, setSpyCandles] = useState<any[]>([])
  const [vixCandles, setVixCandles] = useState<any[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const currentPriceRef = useRef<number | null>(null)
  const [spyPrice, setSpyPrice] = useState<number | null>(null)
  const [vixPrice, setVixPrice] = useState<number | null>(null)
  const [openPrice, setOpenPrice] = useState<number | null>(null)
  const [levels, setLevels] = useState<any>({})
  const [changes, setChanges] = useState<any>({})
  const [connected, setConnected] = useState(false)

  // Morning plan
  const [morningPlan, setMorningPlan] = useState(() => {
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
  const [aiTone, setAiTone] = useState(3) // 1=Drill Sergeant, 5=Life Coach
  const [userName, setUserName] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [voiceMinLimit, setVoiceMinLimit] = useState(180) // default Pro
  const [voiceWarningShown, setVoiceWarningShown] = useState<'50' | '90' | null>(null)
  const [voiceOverage, setVoiceOverage] = useState(false)
  const [voiceSpeed, setVoiceSpeed] = useState(1.0)

  // AI
  const [aiResult, setAiResult] = useState<any>(null)
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
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [flowAlerts, setFlowAlerts] = useState<any[]>([])
  const flowAlertShownRef = useRef<Set<string>>(new Set())
  const [showTutorial, setShowTutorial] = useState(false)
  const [subStatus, setSubStatus] = useState<'loading' | 'active' | 'none'>('loading')
  const [subPlan, setSubPlan] = useState<string | null>(null)

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
          const type = f.put_call || f.option_type || ''
          const strike = f.strike_price || f.strike || ''
          const expiry = f.expiration_date || f.expiry || ''
          const sentiment = f.sentiment || (type.toLowerCase().startsWith('c') ? 'BULLISH' : 'BEARISH')
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
          setTimeout(() => { if (!speakLockRef.current) speak(msg) }, 500)
        }
      } catch {}
    }
    // First poll after 10s (let page load), then every 60s
    const init = setTimeout(poll, 10000)
    const interval = setInterval(poll, 60000)
    return () => { clearTimeout(init); clearInterval(interval) }
  }, [])

  // Safety: if speakLock gets stuck (onended never fires), unlock after 10s
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (speakLockRef.current) {
        const src = audioSourceRef.current
        // Unlock if: no source, or source is in ended/disconnected state
        const srcEnded = !src || (src as any).playbackState === 'finished'
        if (srcEnded) {
          console.warn('TZ watchdog: unlocking stuck speakLock')
          speakLockRef.current = false
          audioSourceRef.current = null
          setSpeaking(false)
          setListening(false)
        }
      }
    }, 5000)  // check every 5s — faster recovery
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

      // Paginate through Polygon's cursor-based pages until we have all bars
      const fetchAllPages = async (initialPath: string): Promise<any[]> => {
        let all: any[] = []
        let nextPath: string | null = initialPath
        let page = 0
        while (nextPath && page < 25) {
          const data: any = await proxyFetch(nextPath).then(r => r.json())
          if (data.results?.length) all = all.concat(data.results)
          if (data.next_url) {
            try { const u = new URL(data.next_url); nextPath = u.pathname + u.search }
            catch { break }
          } else { break }
          page++
        }
        return all
      }

      const ydayData = await proxyFetch(
        `/v2/aggs/ticker/${ticker}/range/1/day/${ydayStr}/${ydayStr}?adjusted=true&sort=asc&limit=1`
      ).then(r => r.json())

      let resultsToUse = await fetchAllPages(
        `/v2/aggs/ticker/${ticker}/range/${tfCfg.multiplier}/${tfCfg.timespan}/${fromStr}/${today}?adjusted=true&sort=asc&limit=${tfCfg.limit}`
      )

      // Pre-market fallback
      if (!resultsToUse.length) {
        resultsToUse = await fetchAllPages(
          `/v2/aggs/ticker/${ticker}/range/${tfCfg.multiplier}/${tfCfg.timespan}/${ydayStr}/${ydayStr}?adjusted=true&sort=asc&limit=${tfCfg.limit}`
        )
      }

      if (resultsToUse.length > 0) {
        const mapped = resultsToUse.map((r: any) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
        setter(mapped)
        const last = mapped[mapped.length - 1]

        if (key === 'spx') {
          const prevP = currentPrice
          // I:SPX intraday data may be delayed on some Polygon plans
          // Only use if the bar is from today (within 12 hours)
          const barAge = Date.now() - last.t
          const barIsToday = barAge < 12 * 60 * 60 * 1000
          if (barIsToday) {
            setCurrentPrice(last.c)
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
              spyVwapRaw: rawSpyVwap,
              spyCurrentPrice: last.c,
              spyVwap: rawSpyVwap * ratio,
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
  }, [keys])

  useEffect(() => {
    // keys handled server-side
    // Sequential load: SPX first so currentPriceRef is populated before SPY VWAP ratio
    ;(async () => {
      await fetchHistory('I:SPX', setCandles, 'spx')
      fetchHistory('SPY', setSpyCandles, 'spy')
      fetchHistory('I:VIX', setVixCandles, 'vix')
    })()
    setConnected(true)
    const interval = setInterval(async () => {
      await fetchHistory('I:SPX', setCandles, 'spx')
      fetchHistory('SPY', setSpyCandles, 'spy')
      fetchHistory('I:VIX', setVixCandles, 'vix')
    }, 60000)
    return () => clearInterval(interval)
  }, [keys, fetchHistory])

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
          `Generate a brief, natural trading companion greeting (2-3 sentences max, spoken aloud).`,
          `Trader name: ${name}. ${isReturning ? `Session #${sessionNum + 1} together.` : 'First session.'}`,
          `Time: ${timeOfDay}. SPX at ${currentPrice?.toFixed(2)}.`,
          `VIX: ${vixPrice?.toFixed(1) || 'unknown'}.`,
          lastWeakness ? `Last session note: ${lastWeakness}` : '',
          `Be warm but direct. Get them focused. Reference real prices. No generic fluff.`,
          `${isReturning ? 'You know this trader — reference your relationship naturally.' : 'Introduce yourself as their AI trading companion.'}`,
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
    if (tab !== 'deepdive' || !chartContainerRef.current || candles.length === 0) return
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
        if (isIntraday && levels.spyVwapRaw && spyCandles.length >= 3) {
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
  }, [tab, candles.length, drawnLines.length, drawnZones.length])

  // Proactive companion alerts — speak when key levels hit or market conditions change
  useEffect(() => {
    if (!currentPrice || drawnLines.length === 0) return
    if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current)

    proactiveTimerRef.current = setInterval(() => {
      if (!currentPrice || !drawnLines.length) return
      const prev = lastPriceRef.current
      lastPriceRef.current = currentPrice

      // Check each horizontal drawn level
      drawnLines.filter((l: any) => l.type === 'horizontal' && l.price).forEach((line: any) => {
        const price = line.price
        const alertKey = `level-${price.toFixed(2)}`
        if (proactiveAlertsSent.has(alertKey)) return

        // Price crossed through the level (within 0.3%)
        const proximity = Math.abs(currentPrice - price) / price
        const crossed = prev > 0 && (
          (prev < price && currentPrice >= price) || // crossed up
          (prev > price && currentPrice <= price)    // crossed down
        )
        const nearLevel = proximity < 0.003 // within 0.3%

        if (crossed || nearLevel) {
          setProactiveAlertsSent(prev => new Set([...prev, alertKey]))
          const direction = currentPrice > price ? 'broken above' : currentPrice < price ? 'broken below' : 'at'
          const msg = `Hey — SPX just ${direction} your ${price.toFixed(0)} level. ${crossed ? "That's the break you were watching." : "We're right at it now."} What's your read?`
          // Add to chat — only speak if not already talking
          setChatMessages((p: any[]) => [...p, { role: 'assistant', content: msg }])
          if (!speakLockRef.current) speak(msg)
        }
      })
    }, 15000) // check every 15 seconds

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
        const [intel, flow, tide, tiingo, skew] = await Promise.all([
          fetchMarketIntel(keys[POLY_KEY] || 'server'),
          fetchOptionsFlow(keys[UW_KEY] || 'server'),
          fetchMarketTide(keys[UW_KEY] || 'server'),
          fetchTiingoContext(keys[TIINGO_KEY] || 'server', morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove),
          fetchZeroDTESkew(keys[UW_KEY] || 'server'),
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
          fetchMarketNews(keys[ANTH_KEY] || 'server'),
          fetchEconomicCalendar(keys[ANTH_KEY] || 'server'),
          fetchMacroRegime(keys[ANTH_KEY] || 'server'),
          fetchMultiTFConfluence(keys[POLY_KEY] || 'server', 'SPY'),
        ])
        localStorage.setItem('tz-news-date', todayKey)
        if (news) setMarketNews(news)
        if (calendar) setEconomicCalendar(calendar)
        if (macro) setMacroRegime(macro)
        if (mtf) setMultiTFData(mtf)
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
          setChatMessages(p => [...p, { role: 'user', content: final.trim() }])
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
  const buildCompanionContext = () => {
    const activePlaybook = playbooks.find(p => p.id === activePlaybookId) || null
    const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext })
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

    return `You are the trAIde Zone AI companion for an SPX intraday options trader. You have a voice and speak responses aloud. Keep responses under 2 sentences. Never more than 40 words. Be direct and specific. Be specific, reference real numbers. Challenge bad ideas directly.

NEVER say you are text-only. Your responses ARE spoken aloud in real-time.

${traderProfile ? `
═══ WHO YOU'RE TALKING TO ═══
${traderProfile.name ? `Name: ${traderProfile.name}` : ''}
${traderProfile.experience_level ? `Experience: ${traderProfile.experience_level}` : ''}
${traderProfile.trading_style ? `Style: ${traderProfile.trading_style}` : ''}
${traderProfile.strengths?.length > 0 ? `Strengths: ${traderProfile.strengths.join(', ')}` : ''}
${traderProfile.weaknesses?.length > 0 ? `Known weaknesses: ${traderProfile.weaknesses.join(', ')}` : ''}
${traderProfile.emotional_triggers?.length > 0 ? `Watch for: ${traderProfile.emotional_triggers.join(', ')}` : ''}
${traderProfile.companion_tone ? `Tone: ${traderProfile.companion_tone} — adapt your communication style accordingly` : ''}
${traderProfile.session_count > 0 ? `You've had ${traderProfile.session_count} sessions together. This is an ongoing relationship.` : 'First session — introduce yourself warmly but get to business.'}
` : 'First time talking — learn about this trader through the session.'}

═══ LIVE MARKET DATA ═══
SPX: ${fmt(currentPrice)} | Open: ${fmt(openPrice)} | Change: ${changes.spx ? (changes.spx >= 0 ? '+' : '') + changes.spx?.toFixed(2) : '—'} (${changes.spx && openPrice ? (changes.spx/openPrice*100).toFixed(2) : '—'}%)
SPX vs VWAP (${fmt(levels.spyVwap)}): ${currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? 'ABOVE ▲ — bullish intraday' : 'BELOW ▼ — bearish intraday') : 'No VWAP data'}
SPX vs 200 EMA (${fmt(levels.ema200)}): ${currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? 'ABOVE — long-term bullish' : 'BELOW — long-term bearish') : 'No EMA data'}
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
    const context = buildCompanionContext()
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          system: context,
          messages: [...chatMessages, { role: 'user', content: text }].slice(-10).map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()

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

      // Speak FIRST (locks mic via speakLockRef), then update state
      speak(reply)
      setChatMessages(p => {
        const updated = [...p, { role: 'assistant', content: reply }]
        if (updated.length % 10 === 0) {
          extractMemoryFromSession(keys[ANTH_KEY] || 'server', updated, tradePatterns, traderProfile)
        }
        return updated
      })
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
      {/* Always-mounted CSV import input — available on all tabs */}
      <input ref={csvInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        input, textarea { font-family: '${font}' !important; }
      `}</style>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* ── SUBSCRIPTION GATE ── */}
      {subStatus === 'loading' && (
        <div style={{ position: 'fixed', inset: 0, background: '#060810', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 900, color: '#00e5ff', letterSpacing: 3, marginBottom: 12 }}>tr<span style={{ color: '#00ff88' }}>AI</span>de Zone</div>
            <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 2 }}>VERIFYING ACCESS...</div>
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
              <div style={{ fontSize: 11, color: '#8899bb', lineHeight: 1.7 }}>Your account doesn't have an active plan. If you've already subscribed, click "Restore Access" below.</div>
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
              }} style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88', borderRadius: 8, padding: '11px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                ↻ Restore Access
              </button>
              <a href="/sign-in" style={{ display: 'block', background: 'transparent', border: '1px solid rgba(100,140,220,0.15)', color: '#6b7a9a', borderRadius: 8, padding: '10px 0', fontSize: 11, textDecoration: 'none', letterSpacing: 0.5 }}>
                Sign in with a different account
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOW ALERT BANNERS ── */}
      {flowAlerts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 950, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
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
                <div style={{ fontSize: 8, color: '#6b7a9a', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
                  {alert.unusual ? '⚡ SWEEP' : '📊 FLOW'}
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
                  <span style={{ fontSize: 9, color: '#6b7a9a' }}>{alert.expiry}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 900, color: '#00e5ff' }}>{alert.premium}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
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

      {/* ── SYSTEM CHECK OVERLAY ── */}
      {systemCheck && !showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,14,0.92)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setSystemCheck(null)}>
          <div style={{ background: '#0c0f1a', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, padding: 24, minWidth: 480, maxWidth: 600, boxShadow: '0 0 40px rgba(0,229,255,0.08)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: '#00e5ff', letterSpacing: 2 }}>SYSTEM CHECK</span>
              <span style={{ fontSize: 9, color: '#8899bb' }}>{new Date().toLocaleTimeString()}</span>
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
                      <span style={{ fontSize: 11 }}>{icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f0f4ff', fontFamily: font, flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 9, color: '#6b7a9a' }}>{data.ms}ms</span>
                    </div>
                    {detailFields.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        {detailFields.slice(0,6).map((f: string) => (
                          <span key={f} style={{ fontSize: 9, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 6px', color: '#8899bb' }}>{f}</span>
                        ))}
                      </div>
                    )}
                    {data.warning && (
                      <div style={{ fontSize: 9, color: '#ffb700', lineHeight: 1.5, marginTop: 3 }}>⚠ {data.warning}</div>
                    )}
                    {data.validate && (
                      <div style={{ fontSize: 9, color: '#00e5ff', lineHeight: 1.5, marginTop: 3 }}>📐 {data.validate}</div>
                    )}
                    {data.note && !data.warning && (
                      <div style={{ fontSize: 9, color: '#6b7a9a', lineHeight: 1.5, marginTop: 2 }}>{data.note}</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSystemCheck(null); runSystemCheck() }} style={{ padding: '6px 16px', borderRadius: 4, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', cursor: 'pointer', fontFamily: font, fontSize: 11, fontWeight: 600 }}>↻ Re-run</button>
              <button onClick={() => setSystemCheck(null)} style={{ padding: '6px 16px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8899bb', cursor: 'pointer', fontFamily: font, fontSize: 11 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal keys={keys} setKeys={setKeys} onClose={() => setShowSettings(false)} voiceId={voiceId} setVoiceId={setVoiceId} voiceEngine={voiceEngine} setVoiceEngine={setVoiceEngine} darkMode={darkMode} setDarkMode={setDarkMode} aiTone={aiTone} setAiTone={setAiTone} userName={userName} setUserName={setUserName} welcomeMessage={welcomeMessage} setWelcomeMessage={setWelcomeMessage} voiceSpeed={voiceSpeed} setVoiceSpeed={setVoiceSpeed} />}

      {/* ── DISCLOSURE MODAL ── */}
      {showDisclosure && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'rgba(6,8,16,0.99)', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.yellow }} />
              <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 800, color: C.text }}>Important Disclosure</div>
            </div>
            <div style={{ fontFamily: font, fontSize: 11, color: C.yellow, marginBottom: 24, letterSpacing: '0.5px' }}>READ BEFORE USING <TZ /></div>

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
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 4 }}>{title}</div>
                  <div style={{ color: C.textDim }}>{body}</div>
                </div>
              ))}
            </div>

            <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontFamily: font, fontSize: 11, color: C.yellow, lineHeight: 1.6 }}>
                By clicking "I Understand & Accept" below, you acknowledge that you have read, understood, and agree to these terms. You confirm that you understand trading involves substantial risk and that trAIde Zone is a decision-support tool only.
              </div>
            </div>

            <button onClick={() => {
              localStorage.setItem('tz-disclosure-accepted', new Date().toISOString())
              setShowDisclosure(false)
            }} style={{
              width: '100%', background: C.teal, color: '#fff', border: 'none',
              borderRadius: 10, padding: '14px 0', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: fontDisplay, letterSpacing: '-0.3px'
            }}>
              I Understand & Accept — Enter trAIde Zone
            </button>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: C.textMuted }}>
              You can review this disclosure at any time in Settings
            </div>
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
            <span style={{ fontSize: 7, color: connected ? '#00ff88' : '#ff1a4a', fontWeight: 700, letterSpacing: 3, textShadow: connected ? '0 0 8px rgba(0,255,136,0.8)' : '0 0 8px rgba(255,26,74,0.8)' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Tickers */}
        {[
          { label: 'SPX', price: currentPrice, change: changes.spx, open: openPrice },
          { label: 'SPY', price: spyPrice, change: changes.spy, open: spyCandles[0]?.o },
          { label: 'VIX', price: vixPrice, change: changes.vix, open: vixCandles[0]?.o },
        ].map(({ label, price, change, open }) => (
          <div key={label} style={{ padding: '0 16px', borderRight: 'none', position: 'relative' as const, display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase' as const }}>{label}</span>
            <span id={label === 'SPX' ? 'tz-spx-price' : undefined} style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: '#f0f4ff', letterSpacing: '0.5px', textShadow: '0 0 20px rgba(240,244,255,0.15)' }}>{fmt(price)}</span>
            {change !== undefined && (
              <span style={{ fontSize: 9, fontWeight: 700, color: change >= 0 ? '#00ff88' : '#ff1a4a', textShadow: change >= 0 ? '0 0 10px rgba(0,255,136,0.7)' : '0 0 10px rgba(255,26,74,0.7)', letterSpacing: '0.5px' }}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(open ? change / open * 100 : 0).toFixed(2)}%
              </span>
            )}
          </div>
        ))}

        {/* VWAP / EMA quick view */}
        <div style={{ padding: '0 16px', borderRight: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 12, height: '100%' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 7, color: '#ffb700', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>VWAP</span>
            <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{fmt(levels.spyVwap)}</span>
            {currentPrice && levels.spyVwap && (
              <span style={{ fontSize: 9, color: currentPrice > levels.spyVwap ? '#00ff88' : '#ff1a4a', textShadow: currentPrice > levels.spyVwap ? '0 0 8px rgba(0,255,136,0.6)' : '0 0 8px rgba(255,26,74,0.6)', fontWeight: 700 }}>
                {currentPrice > levels.spyVwap ? '▲' : '▼'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 7, color: '#00e5ff', fontWeight: 700, letterSpacing: 2, opacity: 0.8 }}>200E</span>
            <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{fmt(levels.ema200)}</span>
            {currentPrice && levels.ema200 && (
              <span style={{ fontSize: 9, color: currentPrice > levels.ema200 ? '#00ff88' : '#ff1a4a', fontWeight: 700 }}>
                {currentPrice > levels.ema200 ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16, height: '100%' }}>
          <span style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 2, fontFamily: fontDisplay }}>{estTime} EST</span>
          {/* Score badge */}
          <div style={{ background: gradeColor + '18', border: `1px solid ${gradeColor}40`, borderRadius: 2, padding: '3px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: gradeColor, fontFamily: fontDisplay, textShadow: `0 0 12px ${gradeColor}80` }}>{grade}</span>
            <span style={{ fontSize: 8, color: C.textDim }}>{score}/13</span>
          </div>
          {/* Today P&L */}
          <div style={{ background: todayPnL >= 0 ? 'rgba(0,255,136,0.08)' : C.redDim, border: `1px solid ${todayPnL >= 0 ? 'rgba(0,255,136,0.25)' : C.redBorder}`, borderRadius: 2, padding: '3px 10px' }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: todayPnL >= 0 ? '#00ff88' : '#ff1a4a', textShadow: todayPnL >= 0 ? '0 0 10px rgba(0,255,136,0.6)' : '0 0 10px rgba(255,26,74,0.6)' }}>
              {todayPnL >= 0 ? '+' : ''}${todayPnL.toFixed(0)} P&L
            </span>
          </div>
          {/* Signal pill */}
          {aiResult && (
            <div style={{ position: 'relative', overflow: 'hidden', background: `${signalColor}10`, border: `1px solid ${signalColor}40`, borderRadius: 2, padding: '3px 12px' }}>
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent, ${signalColor}08, transparent)`, animation: 'shimmer 2.5s linear infinite' }} />
              <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: signalColor, letterSpacing: 2, textShadow: `0 0 12px ${signalColor}60` }}>{aiResult.signal}</span>
            </div>
          )}
          {/* Voice usage counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6,
            background: voiceOverage ? 'rgba(255,77,109,0.1)' : voiceWarningShown === '90' ? 'rgba(245,158,11,0.1)' : 'rgba(0,212,160,0.08)',
            border: `1px solid ${voiceOverage ? 'rgba(255,77,109,0.3)' : voiceWarningShown === '90' ? 'rgba(245,158,11,0.3)' : 'rgba(0,212,160,0.2)'}` }}>
            <span style={{ fontSize: 10 }}>🎙️</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: voiceOverage ? '#ff4d6d' : voiceWarningShown === '90' ? '#f59e0b' : '#00d4a0' }}>
              {Math.round(voiceMinUsed)}m / {voiceMinLimit >= 99999 ? '≈' : voiceMinLimit + 'm'}
            </span>
          </div>
          <button onClick={() => signOut(() => router.push('/'))} style={{ fontFamily: font, fontSize: 10, fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#6b7280', cursor: 'pointer', marginRight: 6 }}>Sign Out</button>
          <button onClick={() => setShowTutorial(true)} title="Tutorial" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 4, padding: '4px 8px', color: '#6b7a9a', cursor: 'pointer', fontSize: 10, fontFamily: font, transition: 'all 0.2s' }}>?</button>
          <button onClick={() => { setSystemCheck(null); runSystemCheck(); setShowSettings(false) }} title="System Check — verify all data feeds" style={{ background: systemCheckRunning ? 'rgba(255,183,0,0.1)' : 'rgba(0,229,255,0.04)', border: `1px solid ${systemCheckRunning ? 'rgba(255,183,0,0.3)' : 'rgba(0,229,255,0.15)'}`, borderRadius: 4, padding: '4px 8px', color: systemCheckRunning ? C.yellow : C.textDim, cursor: 'pointer', fontSize: 11, fontFamily: font, transition: 'all 0.2s' }}>{systemCheckRunning ? '⟳' : '✓'}</button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 4, padding: '4px 10px', color: C.textDim, cursor: 'pointer', fontSize: 13, fontFamily: font, transition: 'all 0.2s' }}>⚙</button>
        </div>
      </div>

      {/* ── TABS — WHITE ── */}
      <div style={{ height: 44, background: 'rgba(6,8,16,0.99)', borderBottom: '1px solid rgba(0,229,255,0.15)', borderTop: '1px solid rgba(0,229,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 0, flexShrink: 0, backdropFilter: 'blur(10px)' }}>
        {(['plan', 'cockpit', 'deepdive', 'journal'] as const).map(t => {
          const labels: any = { plan: 'MORNING PLAN', cockpit: 'SUMMARY', deepdive: 'DEEP DIVE', journal: 'JOURNAL' }
          return (
            <button key={t} onClick={() => setTab(t as any)} style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#00e5ff' : 'transparent'}`,
              padding: '0 14px', height: '100%',
              color: tab === t ? '#00e5ff' : '#6b7a9a',
              cursor: 'pointer', fontFamily: font, fontSize: 11, fontWeight: tab === t ? 700 : 500,
              letterSpacing: '1.5px', transition: 'all 0.15s', textTransform: 'uppercase' as const,
              textShadow: tab === t ? '0 0 14px rgba(0,229,255,0.6)' : 'none',
            }}>
              {labels[t]}
              {t === 'deepdive' && <span style={{ fontSize: 7, padding: '1px 5px', background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.15)', color: C.teal, borderRadius: 8, marginLeft: 5 }}>chart</span>}
            </button>
          )
        })}

        {activePlaybook && (
          <div style={{ marginLeft: 12, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 99, padding: '2px 10px', display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.teal, boxShadow: `0 0 6px ${C.teal}`, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 8, fontWeight: 700, color: C.teal, letterSpacing: 0.5 }}>{activePlaybook.name}</span>
          </div>
        )}

        {speaking && (
          <div onClick={() => { speakLockRef.current = false; audioSourceRef.current = null; setSpeaking(false); if (audioCtxRef.current) try { audioCtxRef.current.suspend() } catch {} }} title="Click to stop speaking" style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: 0.9 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4 + i * 0.1}s ease-in-out infinite`, animationDelay: `${i * 0.08}s`, '--wh': `${8 + i * 2}px` } as any} />
            ))}
            <span style={{ fontSize: 8, color: C.teal, letterSpacing: 1 }}>SPEAKING ×</span>
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

              {/* Manual Signal Trigger */}
              {!aiResult && !aiLoading && (
                <div style={{ background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.25)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: '#00d4a0', letterSpacing: 1, marginBottom: 3 }}>AI Signal Ready</div>
                    <div style={{ fontSize: 10, color: '#6b7a9a', lineHeight: 1.5 }}>Tap to get LONG / SHORT / WAIT with entry, stop & targets</div>
                  </div>
                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(keys[POLY_KEY]||'server'), fetchOptionsFlow(keys[UW_KEY]||'server'), fetchMarketTide(keys[UW_KEY]||'server'), fetchTiingoContext(keys[TIINGO_KEY]||'server', morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runAI({ candles, levels, currentPrice, impliedMove: morningPlan.impliedMove, anthKey: keys[ANTH_KEY]||'server', morningPlan, activePlaybook, tradeStats, optionsFlow: flow, marketTide: tide, marketIntel: intel, tiingoContext: tiingo2, marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory, earningsCalendar })
                    if (result) { setAiResult(result); setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) }
                    setAiLoading(false)
                  }} style={{ fontFamily: font, fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 6, background: 'rgba(0,212,160,0.12)', border: '1px solid rgba(0,212,160,0.4)', color: '#00d4a0', cursor: 'pointer', letterSpacing: 0.5, whiteSpace: 'nowrap' as const }}>
                    ▶ Get Signal
                  </button>
                </div>
              )}
              {aiLoading && (
                <div style={{ background: 'rgba(0,212,160,0.04)', border: '1px solid rgba(0,212,160,0.15)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 4 }}>{[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4a0', animation: `pulse 1s ${i*0.15}s infinite` }} />)}</div>
                  <div style={{ fontSize: 11, color: '#00d4a0', fontWeight: 600 }}>Analyzing market conditions...</div>
                </div>
              )}

              {/* Signal Hero */}
              <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 6, padding: 18, position: 'relative', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,229,255,0.08) inset, 0 4px 24px rgba(0,0,0,0.4)', borderTop: '2px solid #00d4a0' }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle, rgba(0,212,160,0.07) 0%, transparent 60%)', animation: 'coreGlow 4s ease-in-out infinite', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ fontFamily: fontDisplay, fontSize: 48, fontWeight: 900, color: signalColor, letterSpacing: '6px', textShadow: `0 0 30px ${signalColor}bb, 0 0 60px ${signalColor}44` }}>{aiResult?.signal || (aiLoading ? '···' : 'WAIT')}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{aiResult?.marketConditions?.split('.')[0] || 'Analyzing market conditions...'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 900, color: signalColor, opacity: 0.75 }}>{aiResult?.confidence || 0}%</div>
                    <div style={{ fontSize: 7, color: C.textMuted }}>AI confidence</div>
                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(keys[POLY_KEY]||'server'), fetchOptionsFlow(keys[UW_KEY]||'server'), fetchMarketTide(keys[UW_KEY]||'server'), fetchTiingoContext(keys[TIINGO_KEY]||'server', morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runAI({ candles, levels, currentPrice, impliedMove: morningPlan.impliedMove, anthKey: keys[ANTH_KEY]||'server', morningPlan, activePlaybook, tradeStats, optionsFlow: flow, marketTide: tide, marketIntel: intel, tiingoContext: tiingo2, marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory, earningsCalendar })
                    if (result) { setAiResult(result); setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) }
                    setAiLoading(false)
                  }} style={{ fontFamily: font, fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(0,212,160,0.2)', color: '#6b7a9a', cursor: 'pointer', marginTop: 4, display: 'block' }}>↻ refresh</button>
                  </div>
                </div>
                {/* Probability bars */}
                {(() => {
                  const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext })
                  return (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      {[
                        { label: 'Reversal', value: probs.reversal, color: C.red },
                        { label: 'Continuation', value: probs.continuation, color: C.synapse },
                        { label: 'Chop', value: probs.chop, color: C.fire },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                          <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', width: 88 }}>{label}</span>
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
                  { label: 'SPX vs VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? 'ABOVE' : 'BELOW') : '—', icon: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲' : '▼') : '', sub: `${fmt(currentPrice)} vs ${fmt(levels.spyVwap)}`, color: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? C.synapse : C.red) : C.textMuted },
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
                      <div style={{ fontSize: 8, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6, fontWeight: 700 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <div style={{ fontFamily: fontDisplay, fontSize: isLive ? 16 : 14, fontWeight: 900, color: isLive ? color : '#4a5568', lineHeight: 1 }}>{value}</div>
                        {icon && <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color, opacity: 0.8 }}>{icon}</div>}
                      </div>
                      <div style={{ fontSize: 9, color: isLive ? '#6b7a9a' : '#3a4455', marginTop: 4, lineHeight: 1.3 }}>{sub}</div>
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
                    <span style={{ fontFamily: fontDisplay, fontSize: 7, fontWeight: 700, color: C.synapse, letterSpacing: '1px', textTransform: 'uppercase' }}>Options Flow</span>
                    {optionsFlow.length > 0 && <span style={{ fontSize: 7, color: C.textMuted }}>{optionsFlow.length} alerts</span>}
                  </div>
                  {optionsFlow.length === 0 ? (
                    <div style={{ fontSize: 9, color: C.textMuted, textAlign: 'center', padding: '8px 0' }}>{keys[UW_KEY] ? 'No flow alerts' : 'Add UW key in Settings'}</div>
                  ) : optionsFlow.slice(0, 4).map((f: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 50 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 900, color: (f.type||'').startsWith('c') ? '#00ff88' : '#ff1a4a' }}>{(f.ticker||'').toUpperCase()}</span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: (f.type||'').startsWith('c') ? '#00ff88' : '#ff1a4a', opacity: 0.8 }}>{(f.type||'').startsWith('c') ? 'C' : 'P'}</span>
                      </div>
                      <span style={{ fontFamily: fontDisplay, fontSize: 9, color: '#8899bb', width: 38 }}>${f.strike}</span>
                      <span style={{ fontSize: 8, color: '#6b7a9a', flex: 1 }}>{f.expiry||''}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: '#00e5ff' }}>{f.premium||''}</span>
                      <span style={{ fontSize: 7, padding: '2px 5px', borderRadius: 3, background: f.sentiment==='BULLISH'?'rgba(0,255,136,0.12)':f.sentiment==='BEARISH'?'rgba(255,26,74,0.10)':'rgba(0,229,255,0.06)', color: f.sentiment==='BULLISH'?'#00ff88':f.sentiment==='BEARISH'?'#ff1a4a':'#8899bb', fontWeight: 700, letterSpacing: '0.5px' }}>{(f.sentiment||'NEUT').substring(0,4)}</span>
                      {f.unusual && <span style={{ fontSize: 10, color: '#ff6b00' }}>⚡</span>}
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 7, color: C.teal, cursor: 'pointer' }} onClick={() => setTab('deepdive')}>→ Full flow in Deep Dive</div>
                </div>

                {/* Market conditions mini */}
                <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 12px', border: '1px solid rgba(0,229,255,0.10)', borderLeft: '2px solid #00d4a0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4a0', boxShadow: '0 0 6px rgba(0,212,160,0.6)', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontFamily: fontDisplay, fontSize: 8, fontWeight: 700, color: '#00d4a0', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Market Conditions</span>
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
                        <span style={{ fontSize: 9, color: '#8899bb', fontWeight: 700 }}>{label}</span>
                        <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</span>
                      </div>
                      {pct > 0 && <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}><div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 1, transition: 'width 0.5s' }} /></div>}
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 7, color: C.teal, cursor: 'pointer' }} onClick={() => setTab('deepdive')}>→ Full chart in Deep Dive</div>
                </div>
              </div>

              {/* AI insights */}
              {aiResult?.todaysEdge && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: 12, boxShadow: '0 0 0 1px rgba(255,107,0,0.08) inset', borderLeft: '2px solid #ff6b00' }}>
                  <div style={{ fontSize: 7, color: C.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, fontFamily: fontDisplay }}>⚡ Today's Edge</div>
                  <div style={{ fontSize: 11, color: '#f0f4ff', lineHeight: 1.6 }}>{aiResult.todaysEdge}</div>
                  {aiResult.riskFlag && <div style={{ marginTop: 8, fontSize: 10, color: C.red, padding: '5px 8px', background: C.redDim, borderRadius: 4, border: `1px solid ${C.redBorder}` }}>⚠ {aiResult.riskFlag}</div>}
                </div>
              )}

              {/* Composite Market Score */}
              {marketScore && (
                <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '14px 16px', border: `1px solid ${marketScore.color}20`, borderLeft: `3px solid ${marketScore.color}`, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, ${marketScore.color}60, transparent)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 4 }}>MARKET SCORE</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: marketScore.color, letterSpacing: '2px', textShadow: `0 0 16px ${marketScore.color}60` }}>{marketScore.label}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 900, color: marketScore.color, lineHeight: 1, textShadow: `0 0 24px ${marketScore.color}80` }}>{marketScore.score}</div>
                      <div style={{ fontSize: 9, color: '#6b7a9a', marginTop: 2 }}>/ 100</div>
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
                    <span style={{ fontSize: 9, color: '#ffb700' }}>📅</span>
                    <span style={{ fontFamily: fontDisplay, fontSize: 8, fontWeight: 700, color: '#ffb700', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Earnings This Week</span>
                    <span style={{ fontSize: 7, color: '#6b7a9a', marginLeft: 'auto' }}>{earningsCalendar.reduce((a, d) => a + d.earnings.length, 0)} reports</span>
                  </div>
                  {earningsCalendar.map((day: any) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0]
                    const isTomorrow = day.date === new Date(Date.now()+86400000).toISOString().split('T')[0]
                    const label = isToday ? 'TODAY' : isTomorrow ? 'TOMORROW' : new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    return (
                      <div key={day.date} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 8, color: isToday ? '#ffb700' : isTomorrow ? '#00e5ff' : '#6b7a9a', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {day.earnings.map((e: any) => (
                            <div key={e.symbol} style={{ display: 'flex', alignItems: 'center', gap: 4, background: e.isSP500 ? 'rgba(255,183,0,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${e.isSP500 ? 'rgba(255,183,0,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 4, padding: '3px 7px' }}>
                              <span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color: e.isSP500 ? '#f0f4ff' : '#8899bb' }}>{e.symbol}</span>
                              <span style={{ fontSize: 7, color: e.time === 'BMO' ? '#00ff88' : '#ff9900', fontWeight: 600 }}>{e.time}</span>
                              {e.epsEst && <span style={{ fontSize: 7, color: '#6b7a9a' }}>{e.epsEst}</span>}
                              {e.expectedMove && <span style={{ fontSize: 7, color: '#00e5ff' }}>±{e.expectedMove}</span>}
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
                        <span style={{ fontFamily: fontDisplay, fontSize: 8, fontWeight: 700, color: '#00e5ff', letterSpacing: '1.5px' }}>TODAY'S NEWS</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#d0d8f0', lineHeight: 1.7, whiteSpace: 'pre-line', maxHeight: 160, overflowY: 'auto' }}>
                        {(marketNews || '').replace(/^(Based on [^\n]+\n|Here are[^\n]+\n|Search results[^\n]+\n)/i, '').trim()}
                      </div>
                    </div>
                  )}
                  {economicCalendar && (
                    <div style={{ background: 'rgba(10,14,24,0.98)', borderRadius: 6, padding: '12px 14px', border: '1px solid rgba(255,107,0,0.12)', borderLeft: '2px solid #ff6b00' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontFamily: fontDisplay, fontSize: 8, fontWeight: 700, color: '#ff6b00', letterSpacing: '1.5px' }}>ECONOMIC CALENDAR</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#d0d8f0', lineHeight: 1.7, whiteSpace: 'pre-line', maxHeight: 160, overflowY: 'auto' }}>
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
                      <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 8 }}>📊 MULTI-TIMEFRAME</div>
                      {[{label:'Weekly', value: multiTFData.weekly.trend, sub: `MA20: ${multiTFData.weekly.ma20}`, color: multiTFData.weekly.trend==='BULLISH'?C.synapse:C.red},{label:'Daily', value: multiTFData.daily.trend, sub: `MA5: ${multiTFData.daily.ma5}`, color: multiTFData.daily.trend==='BULLISH'?C.synapse:C.red}].map(({label,value,sub,color}) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                          <span style={{ fontSize: 10, color: C.textDim }}>{label}</span>
                          <div><span style={{ fontFamily: fontDisplay, fontSize: 10, fontWeight: 700, color }}>{value}</span><span style={{ fontSize: 9, color: C.textMuted, marginLeft: 4 }}>{sub}</span></div>
                        </div>
                      ))}
                      <div style={{ marginTop: 6, fontSize: 9, color: multiTFData.aligned ? C.synapse : C.fire, fontWeight: 700 }}>{multiTFData.aligned ? '✓' : '⚠'} {multiTFData.confluence}</div>
                    </div>
                  )}
                  {macroRegime && (
                    <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 8, padding: '10px 12px', boxShadow: '0 2px 10px rgba(0,170,85,0.07)', borderLeft: `3px solid ${macroRegime.regime==='RISK-ON'?C.synapse:macroRegime.regime==='RISK-OFF'?C.red:C.fire}` }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: '1px', marginBottom: 6 }}>🌍 MACRO REGIME</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 900, color: macroRegime.regime==='RISK-ON'?C.synapse:macroRegime.regime==='RISK-OFF'?C.red:C.fire, marginBottom: 4 }}>{macroRegime.regime}</div>
                      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 3 }}>Fed: <span style={{ color: C.text, fontWeight: 700 }}>{macroRegime.fedStance} ({macroRegime.rateLevel})</span></div>
                      <div style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>{macroRegime.regimeSummary}</div>
                    </div>
                  )}
                </div>
              )}

              {/* 0DTE Skew */}
              {zeroDTESkew && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 14px', borderLeft: '2px solid #00e5ff' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 6 }}>⚡ SPX 0DTE SKEW</div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: zeroDTESkew.callPct>55?C.synapse:zeroDTESkew.callPct<45?C.red:C.fire, marginBottom: 8 }}>{zeroDTESkew.skewLabel}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{label:'CALLS',value:`${zeroDTESkew.callPct}%`,sub:zeroDTESkew.callPremium,color:C.synapse},{label:'PUTS',value:`${zeroDTESkew.putPct}%`,sub:zeroDTESkew.putPremium,color:C.red},{label:'P/C',value:zeroDTESkew.pcRatio,sub:'ratio',color:C.textDim}].map(({label,value,sub,color}) => (
                      <div key={label} style={{ flex: 1, background: color+'0a', border: `1px solid ${color}20`, borderRadius: 5, padding: '5px 7px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: 7, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 as const, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                        <div style={{ fontSize: 9, color: C.textMuted }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Patterns */}
              {tradePatterns && tradePatterns.avgWinnerSize > 0 && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 14px', borderLeft: '2px solid #00d4a0' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: '1px', marginBottom: 8 }}>🧠 YOUR PATTERNS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                    {[{label:'Best hour',value:tradePatterns.bestHour,color:C.synapse},{label:'Worst hour',value:tradePatterns.worstHour,color:C.red},{label:'Avg winner',value:`$${tradePatterns.avgWinnerSize}`,color:C.synapse},{label:'Avg loser',value:`$${tradePatterns.avgLoserSize}`,color:C.red}].map(({label,value,color}) => (
                      <div key={label} style={{ background: 'rgba(20,26,40,0.95)', borderRadius: 5, padding: '5px 8px' }}>
                        <div style={{ fontSize: 9, color: C.textMuted }}>{label}</div>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {tradePatterns.cutWinnersEarly && <div style={{ fontSize: 10, color: C.fire, padding: '4px 8px', background: 'rgba(224,80,0,0.07)', borderRadius: 4, marginBottom: 4 }}>⚠ You cut winners early — avg win ${tradePatterns.avgWinnerSize} vs avg loss ${tradePatterns.avgLoserSize}</div>}
                  {tradePatterns.revengePatterns > 1 && <div style={{ fontSize: 10, color: C.red, padding: '4px 8px', background: 'rgba(255,77,109,0.06)', borderRadius: 4 }}>⚠ {tradePatterns.revengePatterns} potential revenge trades detected</div>}
                </div>
              )}

              {/* Session Memory */}
              {sessionMemory && (
                <div style={{ background: 'rgba(12,15,26,0.98)', borderRadius: 4, padding: '10px 14px', borderLeft: '2px solid rgba(0,212,160,0.4)' }}>
                  <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.textMuted, letterSpacing: '1px', marginBottom: 6 }}>💾 AI REMEMBERS</div>
                  <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{sessionMemory}</div>
                  <button onClick={() => { localStorage.removeItem('tz-session-memory'); window.location.reload() }} style={{ marginTop: 6, fontSize: 9, color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: font }}>Clear memory</button>
                </div>
              )}
            </div>

            {/* Right — AI Companion (HERO) */}
            {companionOpen && (
              <div style={{ width: 380, background: 'rgba(8,10,18,0.99)', borderLeft: '1px solid rgba(0,212,160,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-2px 0 20px rgba(0,0,0,0.5)' }}>
                {/* Companion header */}
                <div style={{ padding: '10px 14px', background: 'linear-gradient(90deg, rgba(0,212,160,0.1), rgba(0,153,204,0.05))', borderBottom: '2px solid rgba(0,212,160,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid rgba(0,212,160,0.3)`, background: 'rgba(0,212,160,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, position: 'relative', boxShadow: '0 0 10px rgba(0,212,160,0.1)' }}>
                    🧠
                    <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid rgba(0,212,160,0.15)`, animation: 'brainRing 4s linear infinite' }} />
                  </div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, letterSpacing: '2px', color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>AI COMPANION</div>
                  <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', border: `1px solid ${listening ? 'rgba(255,26,74,0.35)' : speaking ? 'rgba(0,212,160,0.3)' : 'rgba(0,153,204,0.25)'}`, color: listening ? C.red : speaking ? C.violet : C.teal, background: listening ? 'rgba(204,16,64,0.06)' : 'transparent', animation: listening ? 'listeningPulse 1s infinite' : 'none' }}>
                    {listening ? '✏ LISTENING' : speaking ? '↗ SPEAKING' : chatLoading ? '⏳ THINKING' : '✓ READY'}
                  </div>
                  {aiResult && (
                    <div style={{ marginLeft: 'auto', background: `${signalColor}12`, border: `1px solid ${signalColor}30`, borderRadius: 2, padding: '2px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 800, color: signalColor, letterSpacing: 2 }}>{aiResult.signal}</span>
                      <span style={{ fontSize: 8, color: C.textMuted }}>{aiResult.confidence}%</span>
                    </div>
                  )}
                  <button title="Pop out companion" onClick={() => window.open('/cockpit/companion', 'tz-companion', 'width=400,height=640,top=50,right=50,resizable=yes')} style={{ background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 3, color: C.teal, cursor: 'pointer', fontSize: 9, padding: '2px 6px', fontFamily: font }}>⤢</button>
                  <button onClick={() => setCompanionOpen(false)} title="Minimize companion" style={{ background: 'transparent', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}>— </button>
                </div>

                {/* Context bar */}
                <div style={{ display: 'flex', background: 'rgba(6,8,16,0.99)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                  {[
                    { label: 'SPX', value: fmt(currentPrice), color: C.text },
                    { label: 'VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲' : '▼') : '—', color: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? C.synapse : C.red) : C.textMuted },
                    { label: 'VIX', value: vixPrice ? vixPrice.toFixed(1) : '—', color: vixPrice && vixPrice > 18 ? C.fire : C.synapse },
                    { label: 'SCORE', value: `${score}/13`, color: gradeColor },
                    { label: 'P&L', value: `$${todayPnL.toFixed(0)}`, color: todayPnL >= 0 ? C.synapse : C.red },
                    { label: 'PLAN', value: activePlaybook ? activePlaybook.name.split(' ')[0] : 'None', color: activePlaybook ? C.teal : C.textMuted },
                  ].map(({ label, value, color }, i) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRight: i < 5 ? `1px solid rgba(100,140,220,0.06)` : 'none' }}>
                      <div style={{ fontSize: 7, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{label}</div>
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
                        <div style={{ fontSize: 8, color: '#6b7a9a', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Watching live</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {[
                            { label: 'SPX', val: currentPrice ? fmt(currentPrice) + (currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? ' ▲ VWAP' : ' ▼ VWAP') : '') : 'Loading...', ok: !!(currentPrice) },
                            { label: 'Flow', val: optionsFlow.length ? optionsFlow.length + ' alerts — ' + (optionsFlow.filter((f:any)=>f.sentiment==='BULLISH').length > optionsFlow.filter((f:any)=>f.sentiment==='BEARISH').length ? 'BULLISH lean' : 'BEARISH lean') : 'No flow data', ok: optionsFlow.length > 0 },
                            { label: 'Score', val: `${grade} — ${score}/13 ${score >= 9 ? '✓ Ready' : score >= 7 ? '⚡ Caution' : '✗ Stay out'}`, ok: score >= 7 },
                            { label: 'Plan', val: morningPlan.bias ? morningPlan.bias.toUpperCase() + (morningPlan.keyLevels ? ' · ' + morningPlan.keyLevels.split(',')[0] + ' key' : '') : 'No plan set', ok: !!morningPlan.bias },
                          ].map(({label, val, ok}) => (
                            <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                              <span style={{ fontSize: 8, color: '#6b7a9a', fontWeight: 700, minWidth: 36 }}>{label}</span>
                              <span style={{ fontSize: 10, color: ok ? '#d0d8f0' : '#4a5568', fontWeight: ok ? 500 : 400 }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Quick prompts — auto-send on click */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {["What's the setup?", "Should I trade?", "Am I in system?", "What does flow say?"].map(q => (
                          <button key={q} onClick={() => sendChatWithText(q)} style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.18)', borderRadius: 6, padding: '8px 10px', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: font, fontWeight: 600, textAlign: 'left' as const }}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                      {m.role === 'assistant' && <div style={{ fontSize: 8, color: '#00d4a0', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '1.5px' }}><span style={{ width: 3, height: 3, borderRadius: '50%', background: C.teal, display: 'inline-block' }} />AI COMPANION</div>}
                      <div style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.7, color: '#f0f4ff', background: m.role === 'user' ? 'rgba(0,229,255,0.06)' : 'rgba(0,212,160,0.06)', border: `1px solid ${m.role === 'user' ? 'rgba(0,229,255,0.18)' : 'rgba(0,212,160,0.15)'}`, borderLeft: m.role === 'assistant' ? '2px solid #00d4a0' : 'none', borderRight: m.role === 'user' ? '2px solid #00e5ff' : 'none', borderRadius: m.role === 'user' ? '8px 2px 2px 8px' : '2px 8px 8px 2px' }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ alignSelf: 'flex-start' }}>
                      <div style={{ fontSize: 7, color: C.teal, marginBottom: 2, letterSpacing: 1 }}>AI COMPANION</div>
                      <div style={{ padding: '8px 12px', background: 'rgba(0,212,160,0.05)', border: `1px solid rgba(0,212,160,0.12)`, borderLeft: `2px solid ${C.violet}`, borderRadius: '2px 6px 6px 2px', display: 'flex', gap: 4 }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: `pulse 1s ${i*0.15}s infinite` }} />)}
                      </div>
                    </div>
                  )}
                  {listening && liveTranscript && (
                    <div style={{ alignSelf: 'flex-end', padding: '5px 9px', background: 'rgba(255,77,109,0.06)', border: `1px solid rgba(204,16,64,0.2)`, borderRight: `2px solid ${C.red}`, borderRadius: '6px 2px 2px 6px', fontSize: 10, color: C.red, fontStyle: 'italic' }}>
                      {liveTranscript}...
                    </div>
                  )}
                </div>

                {/* Speaking waveform */}
                {speaking && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '5px 0', background: 'rgba(248,248,255,0.8)', borderTop: `1px solid rgba(0,212,160,0.08)` }}>
                    {[...Array(18)].map((_, i) => (
                      <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4+(i%5)*0.1}s ease-in-out infinite`, animationDelay: `${(i%4)*0.08}s`, '--wh': `${6+(i%6)*2}px` } as any} />
                    ))}
                    <span style={{ fontSize: 8, color: C.teal, marginLeft: 8, letterSpacing: 1 }}>SPEAKING</span>
                  </div>
                )}

                {/* Input area */}
                <div style={{ padding: '12px 14px', background: 'rgba(4,6,14,0.99)', borderTop: '1px solid rgba(0,229,255,0.12)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
                    <button onClick={() => { listening ? stopListening() : startListening() }} style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${listening ? 'rgba(255,26,74,0.7)' : 'rgba(255,26,74,0.35)'}`, background: listening ? 'rgba(255,26,74,0.15)' : 'rgba(255,26,74,0.07)', color: '#ff1a4a', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: listening ? '0 0 0 6px rgba(255,26,74,0.1), 0 0 16px rgba(255,26,74,0.3)' : '0 0 12px rgba(255,26,74,0.1)', animation: listening ? 'micGlow 0.8s infinite' : 'none', transition: 'all 0.2s', flexShrink: 0 }}>
                      {listening ? '↹' : '🎙️'}
                    </button>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder={listening ? 'Listening... (tap ↹ to stop)' : 'Ask your AI companion...'}
                      style={{ flex: 1, background: 'rgba(10,14,24,0.95)', border: `1px solid ${listening ? 'rgba(255,26,74,0.4)' : 'rgba(0,229,255,0.2)'}`, borderRadius: 4, padding: '9px 12px', color: '#f0f4ff', fontFamily: font, fontSize: 13, outline: 'none', transition: 'border-color 0.2s' }} />
                    <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ width: 34, height: 34, background: chatInput.trim() ? 'rgba(0,212,160,0.12)' : 'transparent', border: `1px solid ${chatInput.trim() ? 'rgba(0,212,160,0.25)' : 'rgba(100,140,220,0.1)'}`, borderRadius: 3, color: chatInput.trim() ? C.violet : C.textMuted, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontFamily: font, fontWeight: 700, flexShrink: 0 }}>↑</button>
                  </div>
                  {/* Voice — compact single line */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 8, color: '#4a5568', fontWeight: 700, letterSpacing: 1 }}>VOICE</span>
                    {['nova','onyx','alloy','echo','shimmer'].map(v => (
                      <button key={v} onClick={() => { setVoiceId(v); localStorage.setItem(VOICE_ID, v) }} style={{ padding: '2px 7px', borderRadius: 3, background: voiceId === v ? 'rgba(0,212,160,0.12)' : 'transparent', border: `1px solid ${voiceId === v ? 'rgba(0,212,160,0.35)' : 'rgba(0,229,255,0.08)'}`, color: voiceId === v ? '#00d4a0' : '#6b7a9a', fontSize: 10, cursor: 'pointer', fontFamily: font, fontWeight: voiceId === v ? 700 : 400 }}>{v}</button>
                    ))}
                    <button onClick={() => setShowSettings(true)} style={{ fontSize: 8, color: '#4a5568', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', marginLeft: 2 }}>⚙</button>
                  </div>
                </div>
              </div>
            )}

            {/* Collapsed companion button */}
            {!companionOpen && (
              <button onClick={() => setCompanionOpen(true)} title="Open AI Companion" style={{ position: 'fixed', bottom: 20, right: 20, width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,212,160,0.15)', border: '2px solid rgba(0,212,160,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 4px 20px rgba(0,212,160,0.25)', zIndex: 500 }}>
                🧠
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

              <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14, letterSpacing: '0.5px' }}>Today's Setup</div>

              {/* Implied Move */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Implied Move (±PTS)</div>
                <input value={morningPlan.impliedMove} onChange={e => setMorningPlan(p => ({ ...p, impliedMove: e.target.value }))}
                  placeholder="e.g. 50" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Key Levels */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Key Levels</div>
                <input value={morningPlan.keyLevels} onChange={e => setMorningPlan(p => ({ ...p, keyLevels: e.target.value }))}
                  placeholder="e.g. 5840, 5820, 5800" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Gap Size */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Gap Size (PTS)</div>
                <input value={morningPlan.gapSize} onChange={e => setMorningPlan(p => ({ ...p, gapSize: e.target.value }))}
                  placeholder="e.g. 60" style={{ width: '100%', background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(100,140,220,0.2)', borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: font, boxSizing: 'border-box' as const }} />
              </div>

              {/* Directional Bias */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Directional Bias</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['long', C.synapse], ['short', C.red], ['neutral', C.violet]].map(([b, col]) => (
                    <button key={b} onClick={() => setMorningPlan(p => ({ ...p, bias: b }))} style={{
                      flex: 1, background: morningPlan.bias === b ? col + '15' : 'transparent',
                      border: `1.5px solid ${morningPlan.bias === b ? col : 'rgba(100,140,220,0.2)'}`,
                      borderRadius: 6, padding: '7px 0', color: morningPlan.bias === b ? col : C.textMuted,
                      cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: font, textTransform: 'uppercase' as const, transition: 'all 0.15s'
                    }}>{b}</button>
                  ))}
                </div>
              </div>

              {/* Gap Direction */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Gap Direction</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['gap up', C.synapse], ['gap down', C.red], ['flat', C.violet]].map(([g, col]) => (
                    <button key={g} onClick={() => setMorningPlan(p => ({ ...p, gapDirection: g }))} style={{
                      flex: 1, background: morningPlan.gapDirection === g ? col + '15' : 'transparent',
                      border: `1.5px solid ${morningPlan.gapDirection === g ? col : 'rgba(100,140,220,0.2)'}`,
                      borderRadius: 6, padding: '7px 0', color: morningPlan.gapDirection === g ? col : C.textMuted,
                      cursor: 'pointer', fontSize: 9, fontWeight: 700, fontFamily: font, textTransform: 'uppercase' as const, transition: 'all 0.15s'
                    }}>{g === 'gap up' ? 'Gap Up' : g === 'gap down' ? 'Gap Down' : 'Flat'}</button>
                  ))}
                </div>
              </div>

              {/* Morning Notes — free text */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#8899bb', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, fontWeight: 700 }}>Morning Plan / Notes</div>
                <textarea
                  value={morningPlan.notes}
                  onChange={e => setMorningPlan(p => ({ ...p, notes: e.target.value }))}
                  placeholder={'e.g. Gap up on CPI. Fade the open if we reject VWAP in first 30 min. Look for continuation if we reclaim PDH with volume...'}
                  rows={5}
                  style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 12, outline: 'none', fontFamily: font, resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const }}
                />
              </div>

              <div style={{ height: 1, background: 'rgba(100,140,220,0.12)', margin: '4px 0 14px' }} />

              {/* Playbook Picker */}
              <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Today's Playbook</div>
              {playbooks.map(pb => (
                <div key={pb.id} onClick={() => setActivePlaybookId(activePlaybookId === pb.id ? null : pb.id)} style={{
                  background: activePlaybookId === pb.id ? 'rgba(0,229,255,0.08)' : 'rgba(8,10,18,0.6)',
                  border: `1.5px solid ${activePlaybookId === pb.id ? 'rgba(0,153,204,0.3)' : 'rgba(100,140,220,0.15)'}`,
                  borderRadius: 8, padding: '9px 11px', marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: activePlaybookId === pb.id ? '0 2px 8px rgba(0,153,204,0.1)' : 'none'
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: activePlaybookId === pb.id ? C.teal : C.text }}>{pb.name}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>{pb.setup}</div>
                </div>
              ))}
              <button onClick={() => setShowAddPlaybook(!showAddPlaybook)} style={{
                width: '100%', background: 'transparent', border: `1px dashed rgba(100,140,220,0.3)`,
                borderRadius: 6, padding: '7px 0', color: C.textMuted, cursor: 'pointer', fontSize: 10, fontFamily: font, marginTop: 4
              }}>+ Add Playbook</button>
              {showAddPlaybook && (
                <div style={{ marginTop: 8, background: 'rgba(10,14,24,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 4, padding: 10 }}>
                  {[{key:'name',ph:'Playbook name'},{key:'setup',ph:'Setup conditions'},{key:'entry',ph:'Entry trigger'},{key:'stop',ph:'Stop rule'},{key:'target',ph:'Target'},{key:'notes',ph:'Notes (optional)'}].map(({key,ph}) => (
                    <input key={key} value={(newPlaybook as any)[key]} onChange={e => setNewPlaybook(p => ({...p,[key]:e.target.value}))}
                      placeholder={ph} style={{width:'100%',background:'#fff',border:'1px solid rgba(100,140,220,0.2)',borderRadius:5,padding:'6px 8px',color:C.text,fontSize:11,outline:'none',marginBottom:5,fontFamily:font,boxSizing:'border-box' as const}} />
                  ))}
                  <button onClick={() => {
                    if (!newPlaybook.name) return
                    setPlaybooks(p => [...p, {...newPlaybook, id: Date.now().toString()}])
                    setNewPlaybook({name:'',setup:'',entry:'',stop:'',target:'',notes:''})
                    setShowAddPlaybook(false)
                  }} style={{width:'100%',background:C.teal,border:'none',borderRadius:5,padding:'7px 0',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:font}}>Save Playbook</button>
                </div>
              )}
            </div>

            {/* CENTER — AI Brief + Probability */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, background: '#050609' }}>

              {/* Probability section */}
              {(() => {
                const probs = calcProbabilities({ bias: morningPlan.bias, gapDirection: morningPlan.gapDirection, gapSize: morningPlan.gapSize, impliedMove: morningPlan.impliedMove, vixPrice, tiingoContext })
                return (
                  <div style={{ background: 'rgba(12,15,26,0.98)', margin: '14px 14px 0', borderRadius: 6, padding: '14px 16px', borderTop: `2px solid ${probs.hasData ? probs.dominantColor : 'rgba(0,229,255,0.2)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: C.text }}>Probability Breakdown</div>
                      {probs.hasData && (
                        <div style={{ background: probs.dominantColor + '15', border: `1px solid ${probs.dominantColor}40`, borderRadius: 4, padding: '3px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: probs.dominantColor, fontFamily: fontDisplay }}>{probs.dominant}</span>
                          <span style={{ fontSize: 9, color: C.textMuted }}>{probs.confidence}</span>
                        </div>
                      )}
                    </div>
                    {probs.hasData ? (
                      <>
                        {[{label:'Reversal',value:probs.reversal,color:C.red},{label:'Continuation',value:probs.continuation,color:C.synapse},{label:'Chop / Range',value:probs.chop,color:C.fire}].map(({label,value,color}) => (
                          <div key={label} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.textDim }}>{label}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: fontDisplay }}>{value}%</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease', opacity: value === Math.max(probs.reversal, probs.continuation, probs.chop) ? 1 : 0.5 }} />
                            </div>
                          </div>
                        ))}
                        {tiingoContext?.summary && (
                          <div style={{ marginTop: 8, fontSize: 9, color: C.textMuted, lineHeight: 1.5, padding: '8px 10px', background: 'rgba(240,244,250,0.6)', borderRadius: 5 }}>
                            📊 {tiingoContext.summary}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', padding: '10px 0' }}>Fill in implied move, bias, and gap direction to generate probabilities</div>
                    )}
                  </div>
                )
              })()}

              {/* AI Morning Brief */}
              <div style={{ background: 'rgba(12,15,26,0.98)', margin: '14px', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,212,160,0.08)', borderTop: '3px solid #00d4a0', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,212,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,212,160,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.teal, animation: aiLoading ? 'pulse 0.6s infinite' : 'pulse 3s infinite' }} />
                    <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>AI Morning Brief</div>
                    {lastAITime && <span style={{ fontSize: 9, color: C.textMuted }}>{lastAITime}</span>}
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
                      }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.25)', borderRadius: 6, color: C.teal, cursor: 'pointer', fontSize: 10, fontFamily: font, fontWeight: 700 }}>
                        🔊 Read It
                      </button>
                    )}
                    {aiLoading && <div style={{ width: 10, height: 10, border: `1.5px solid rgba(100,140,220,0.2)`, borderTopColor: C.violet, borderRadius: '50%', animation: 'spin 0.8s linear infinite', alignSelf: 'center' }} />}
                  </div>
                </div>

                {/* Signal badge */}
                {aiResult ? (
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,212,160,0.08)' }}>
                    <div style={{ background: signalColor + '12', border: `1.5px solid ${signalColor}35`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 900, color: signalColor, letterSpacing: '4px', textShadow: `0 0 20px ${signalColor}88, 0 0 40px ${signalColor}44` }}>{aiResult.signal}</div>
                      <ProbMeter value={aiResult.confidence || 0} color={signalColor} />
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,212,160,0.08)' }}>
                    <div style={{ background: 'rgba(20,26,40,0.95)', borderRadius: 8, padding: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, border: `1.5px solid rgba(100,140,220,0.2)`, borderTopColor: C.violet, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          <div style={{ fontSize: 11, color: C.textMuted }}>Analyzing market...</div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>AI analysis unavailable — Anthropic may be busy</div>
                          <button onClick={() => {
                            setAiLoading(true)
                            runAI({ candles, levels, currentPrice, impliedMove: morningPlan.impliedMove, anthKey: keys[ANTH_KEY] || 'server', morningPlan, activePlaybook: playbooks.find((p: any) => p.id === activePlaybookId) || null, tradeStats }).then(r => { if (r) { setAiResult(r); setLastAITime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) } setAiLoading(false) })
                          }} style={{ fontSize: 10, padding: '4px 12px', borderRadius: 4, border: `1px solid ${C.tealBorder}`, background: C.tealDim, color: C.teal, cursor: 'pointer', fontFamily: font, fontWeight: 600 }}>
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
                        <div style={{ fontSize: 9, color: '#00e5ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{display:'inline-block',width:2,height:8,background:'#00e5ff',borderRadius:1,boxShadow:'0 0 6px #00e5ff'}} />📊 Market Conditions</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.marketConditions}</div>
                      </div>
                    )}
                    {aiResult.todaysEdge && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 9, color: '#00ff88', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>⚡ Today's Edge</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.todaysEdge}</div>
                      </div>
                    )}
                    {aiResult.accountability && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 9, color: '#ff6b00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(255,107,0,0.5)' }}>🎯 Accountability</div>
                        <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.8 }}>{aiResult.accountability}</div>
                      </div>
                    )}
                    {aiResult.riskFlag && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(204,16,64,0.1)', background: 'rgba(204,16,64,0.03)' }}>
                        <div style={{ fontSize: 9, color: '#ff1a4a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, textShadow: '0 0 8px rgba(255,26,74,0.5)' }}>⚠ Risk Flag</div>
                        <div style={{ fontSize: 12, color: C.red, lineHeight: 1.7 }}>{aiResult.riskFlag}</div>
                      </div>
                    )}
                    {aiResult.signal !== 'WAIT' && aiResult.signal !== 'NO TRADE' && aiResult.entryZone && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Trade Levels</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {[
                            {label:'Entry', value: aiResult.entryZone ? `${fmt(aiResult.entryZone.low)}–${fmt(aiResult.entryZone.high)}` : '—', color: signalColor},
                            {label:'Stop', value: fmt(aiResult.stopLevel), color: C.red},
                            {label:'Target 1', value: fmt(aiResult.target1), color: C.synapse},
                            {label:'Target 2', value: fmt(aiResult.target2), color: C.synapse},
                          ].map(({label, value, color}) => (
                            <div key={label} style={{ background: color + '0a', border: `1px solid ${color}25`, borderRadius: 6, padding: '7px 10px' }}>
                              <div style={{ fontSize: 7, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 3 }}>{label}</div>
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
                  <div style={{ fontSize: 9, color: C.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Live Data Inputs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[
                      {label:'VWAP', value: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? '▲ ABOVE' : '▼ BELOW') : '—', color: currentPrice && levels.spyVwap ? (currentPrice > levels.spyVwap ? C.synapse : C.red) : C.textMuted},
                      {label:'200 EMA', value: currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? '▲ ABOVE' : '▼ BELOW') : '—', color: currentPrice && levels.ema200 ? (currentPrice > levels.ema200 ? C.synapse : C.red) : C.textMuted},
                      {label:'VIX', value: vixPrice ? (vixPrice > 25 ? 'HIGH ⚠' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL') : '—', color: vixPrice ? (vixPrice > 25 ? C.red : vixPrice > 18 ? C.fire : C.synapse) : C.textMuted},
                      {label:'Breadth', value: marketIntel?.breadth?.bias || '—', color: C.textDim},
                      {label:'Flow', value: optionsFlow.length ? `${optionsFlow.length} alerts` : 'Loading...', color: optionsFlow.length ? C.synapse : C.textMuted},
                      {label:'Tide', value: marketTide?.bias || '—', color: C.textDim},
                    ].map(({label, value, color}) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                        <span style={{ fontSize: 9, color: C.textMuted }}>{label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Refresh */}
                <div style={{ padding: '12px 16px' }}>
                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(keys[POLY_KEY]||''), fetchOptionsFlow(keys[UW_KEY]||''), fetchMarketTide(keys[UW_KEY]||''), fetchTiingoContext(keys[TIINGO_KEY]||'', morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runAI({candles, levels, currentPrice, impliedMove: morningPlan.impliedMove, anthKey: keys[ANTH_KEY] || 'server', morningPlan, activePlaybook, tradeStats, optionsFlow: flow, marketTide: tide, marketIntel: intel, tiingoContext: tiingo2, marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory, earningsCalendar})
                    if (result) { setAiResult(result); setLastAITime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) }
                    setAiLoading(false)
                  }} disabled={aiLoading} style={{
                    width: '100%', background: aiLoading ? 'rgba(240,244,250,0.8)' : 'rgba(0,212,160,0.08)',
                    border: `1px solid ${aiLoading ? 'rgba(100,140,220,0.15)' : 'rgba(0,212,160,0.25)'}`,
                    borderRadius: 8, padding: '10px 0', color: aiLoading ? C.textMuted : C.violet,
                    cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: font, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px'
                  }}>{aiLoading ? '⟳  Analyzing market...' : '▶  Get AI Signal'}</button>
                </div>
              </div>
            </div>

            {/* RIGHT — Checklist */}
            <div style={{ width: 280, background: 'rgba(12,15,26,0.98)', borderLeft: `1px solid rgba(0,212,160,0.1)`, overflowY: 'auto', padding: '14px 12px', flexShrink: 0, boxShadow: '-2px 0 8px rgba(100,140,220,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: C.text }}>Pre-Trade Check</div>
                <div style={{ background: gradeColor + '15', border: `1px solid ${gradeColor}35`, borderRadius: 6, padding: '3px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 800, color: gradeColor }}>{grade}</span>
                  <span style={{ fontSize: 9, color: C.textMuted }}>{score}/13</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(score/13)*100}%`, background: gradeColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
              </div>
              {/* Edit toggle */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button onClick={() => setEditingChecklist(!editingChecklist)} style={{ fontSize: 10, color: C.teal, background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontFamily: font }}>
                  {editingChecklist ? '✓ Done' : '✎ Edit'}
                </button>
              </div>

              {editingChecklist ? (
                /* Edit mode */
                <div>
                  {customChecklist.map((item: any, idx: number) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <input value={item.label} onChange={e => setCustomChecklist((p: any[]) => p.map((c, i) => i === idx ? {...c, label: e.target.value} : c))}
                        style={{ flex: 1, background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '5px 8px', color: C.text, fontSize: 11, outline: 'none', fontFamily: font }} />
                      <select value={item.category} onChange={e => setCustomChecklist((p: any[]) => p.map((c, i) => i === idx ? {...c, category: e.target.value} : c))}
                        style={{ background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '5px 4px', color: C.textDim, fontSize: 10, outline: 'none', fontFamily: font }}>
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
                      style={{ flex: 1, background: 'rgba(20,26,40,0.95)', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 5, padding: '6px 10px', color: C.text, fontSize: 11, outline: 'none', fontFamily: font }} />
                  </div>
                  <button onClick={() => setCustomChecklist(CHECKLIST)} style={{ marginTop: 8, fontSize: 10, color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: font, padding: 0 }}>↺ Reset to defaults</button>
                </div>
              ) : (
                /* View mode */
                ['TIMING','CONFLUENCE','RISK','SYSTEM'].map(cat => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: C.teal, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: 5 }}>{cat}</div>
                    {customChecklist.filter((c: any) => c.category === cat).map((item: any) => (
                      <div key={item.id} onClick={() => setChecked(p => ({...p, [item.id]: !p[item.id]}))}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 3, cursor: 'pointer',
                          background: checked[item.id] ? 'rgba(0,170,85,0.08)' : 'transparent',
                          border: `1px solid ${checked[item.id] ? 'rgba(0,170,85,0.25)' : 'rgba(100,140,220,0.12)'}`,
                          transition: 'all 0.12s' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked[item.id] ? C.synapse : 'rgba(100,140,220,0.3)'}`, background: checked[item.id] ? C.synapse : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                          {checked[item.id] && <span style={{ fontSize: 9, color: '#fff', fontWeight: 800 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, color: checked[item.id] ? C.text : C.textDim, lineHeight: 1.3 }}>{item.label}</span>
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
                <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Auto Levels</div>
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
                      <span style={{ fontSize: 10, color: active ? color : C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color: active ? color : C.text }}>{fmt(price)}</span>
                    </div>
                  )
                })}

                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${C.teal}30,transparent)`, margin: '8px 0' }} />
                <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Drawing Tools</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                  {[C.synapse, C.red, C.fire, C.violet, C.teal, '#ffffff'].map(col => (
                    <div key={col} onClick={() => setDrawColor(col)} style={{ width: 16, height: 16, borderRadius: 2, background: col, cursor: 'pointer', border: drawColor === col ? '2px solid #fff' : '2px solid transparent', boxSizing: 'border-box' as const }} />
                  ))}
                </div>
                {[{ mode: 'horizontal', label: '— Horizontal' }, { mode: 'trendline', label: '↗ Trend Line' }, { mode: 'zone', label: '▬ S&D Zone' }].map(({ mode, label }) => (
                  <button key={mode} onClick={() => setDrawMode(drawMode === mode ? null : mode)} style={{ width: '100%', background: drawMode === mode ? drawColor + '18' : 'transparent', border: `1px solid ${drawMode === mode ? drawColor : C.border}`, borderRadius: 3, padding: '4px 8px', color: drawMode === mode ? drawColor : C.textDim, cursor: 'pointer', fontFamily: font, fontSize: 9, textAlign: 'left' as const, marginBottom: 2 }}>{label}{drawMode === mode ? ' ✓' : ''}</button>
                ))}
                {drawMode && <div style={{ fontSize: 8, color: C.fire, padding: '3px 6px', background: C.fireDim, borderRadius: 3, marginBottom: 4 }}>{drawMode === 'zone' || drawMode === 'trendline' ? 'Click 2 pts' : 'Click to place'}</div>}
                {(drawnLines.length > 0 || drawnZones.length > 0) && (
                  <button onClick={() => { setDrawnLines([]); setDrawnZones([]) }} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.red}40`, borderRadius: 3, padding: '3px 0', color: C.red, cursor: 'pointer', fontSize: 9, fontFamily: font, marginBottom: 6 }}>Clear ({drawnLines.length + drawnZones.length})</button>
                )}

                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${C.teal}30,transparent)`, margin: '8px 0' }} />
                <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Morning Plan</div>
                {morningPlan.bias ? (
                  <div style={{ background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 4, padding: '7px 8px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 8, color: C.textDim }}>BIAS</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: morningPlan.bias === 'long' ? C.synapse : morningPlan.bias === 'short' ? C.red : C.textDim, textTransform: 'uppercase' }}>{morningPlan.bias}</span>
                    </div>
                    {morningPlan.impliedMove && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 8, color: C.textDim }}>IMPLIED</span><span style={{ fontSize: 9, color: C.text }}>±{morningPlan.impliedMove}</span></div>}
                    {morningPlan.keyLevels && <div style={{ fontSize: 8, color: C.textMuted, marginTop: 3 }}>Lvls: <span style={{ color: C.textDim }}>{morningPlan.keyLevels}</span></div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: C.textMuted }}>Set in Morning Plan tab</div>
                )}
                {aiResult && (
                  <div style={{ background: signalColor + '12', border: `1px solid ${signalColor}30`, borderRadius: 4, padding: '7px 8px', textAlign: 'center' }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, color: signalColor }}>{aiResult.signal}</div>
                    <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>{aiResult.confidence}% conf</div>
                    {aiResult.stopLevel && <div style={{ fontSize: 8, color: C.red, marginTop: 2 }}>Stop: {fmt(aiResult.stopLevel)}</div>}
                    {aiResult.target1 && <div style={{ fontSize: 8, color: C.synapse }}>T1: {fmt(aiResult.target1)}</div>}
                  </div>
                )}
              </div>

              {/* Center — Chart */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Timeframe bar */}
                <div style={{ height: 34, background: 'rgba(12,15,26,0.98)', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 2, padding: '0 10px', flexShrink: 0 }}>
                  {(['1', '5', '15', '60', '1D'] as const).map(tf => (
                    <button key={tf} onClick={() => setChartTf(tf)} style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${chartTf === tf ? 'rgba(0,229,255,0.45)' : 'rgba(0,229,255,0.08)'}`, background: chartTf === tf ? 'rgba(0,229,255,0.12)' : 'transparent', color: chartTf === tf ? '#00e5ff' : '#6b7a9a', cursor: 'pointer', fontFamily: font, fontSize: 11, fontWeight: chartTf === tf ? 700 : 500, textShadow: chartTf === tf ? '0 0 10px rgba(0,229,255,0.5)' : 'none', transition: 'all 0.15s' }}>{tf === '60' ? '1H' : tf === '1D' ? '1D' : tf + 'm'}</button>
                  ))}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
                    {currentPrice && <span style={{ fontFamily: fontDisplay, fontSize: 11, color: '#f0f4ff', fontWeight: 700 }}>{fmt(currentPrice)}</span>}
                    {levels.spyVwap && <span style={{ fontSize: 9, color: C.fire }}>VWAP {fmt(levels.spyVwap)}</span>}
                    {levels.ema200 && <span style={{ fontSize: 9, color: C.teal }}>200E {fmt(levels.ema200)}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <div ref={chartContainerRef} style={{ position: 'absolute', inset: 0 }}>
                    {candles.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                        {candles.length === 0 ? (
                          <><div style={{ width: 24, height: 24, border: `2px solid ${C.border}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><div style={{ fontSize: 12, color: C.textDim }}>Loading SPX data...</div></>
                        ) : (
                          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Loading market data...</div><button onClick={() => setShowSettings(true)} style={{ background: '#00d4a0', color: '#080a0f', border: 'none', borderRadius: 4, padding: '6px 12px', fontFamily: font, fontSize: 10, cursor: 'pointer' }}>Open Settings</button></div>
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
                    {lastAITime && !aiLoading && <span style={{ marginLeft: 'auto', fontSize: 8, color: C.textMuted }}>{lastAITime}</span>}
                  </div>
                  {aiResult ? (
                    <div style={{ background: signalColor + '15', border: `1.5px solid ${signalColor}40`, borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 900, color: signalColor, letterSpacing: '4px', textShadow: `0 0 24px ${signalColor}aa, 0 0 48px ${signalColor}44` }}>{aiResult.signal}</div>
                      <ProbMeter value={aiResult.confidence || 0} color={signalColor} />
                    </div>
                  ) : <div style={{ fontSize: 10, color: C.textDim, textAlign: 'center', padding: '6px 0' }}>Analyzing...</div>}
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {aiResult && aiResult.signal !== 'WAIT' && aiResult.signal !== 'NO TRADE' && aiResult.entryZone && (
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <div style={{ fontSize: 8, color: C.textDim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, fontWeight: 700 }}>Trade Levels</div>
                      {[
                        { label: 'Entry', value: `${fmt(aiResult.entryZone?.low)} – ${fmt(aiResult.entryZone?.high)}`, color: signalColor },
                        { label: 'Stop', value: fmt(aiResult.stopLevel), color: C.red },
                        { label: 'Target 1', value: fmt(aiResult.target1), color: C.synapse },
                        { label: 'Target 2', value: fmt(aiResult.target2), color: C.synapse },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 7px', borderRadius: 3, marginBottom: 2, background: color + '08' }}>
                          <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
                          <span style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {aiResult?.marketConditions && <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}><div style={{ fontSize: 8, color: C.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>📊 Market Conditions</div><div style={{ fontSize: 10, color: C.text, lineHeight: 1.6 }}>{aiResult.marketConditions}</div></div>}
                  {aiResult?.todaysEdge && <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}><div style={{ fontSize: 8, color: '#00ff88', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>⚡ Today's Edge</div><div style={{ fontSize: 10, color: C.text, lineHeight: 1.6 }}>{aiResult.todaysEdge}</div></div>}
                  {aiResult?.accountability && <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}><div style={{ fontSize: 8, color: '#ff6b00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>🎯 Accountability</div><div style={{ fontSize: 10, color: C.text, lineHeight: 1.6 }}>{aiResult.accountability}</div></div>}
                  {aiResult?.riskFlag && <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}><div style={{ fontSize: 8, color: '#ff1a4a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>⚠ Risk Flag</div><div style={{ fontSize: 10, color: C.red, lineHeight: 1.6 }}>{aiResult.riskFlag}</div></div>}

                  {/* Positioning */}
                  {aiResult && (
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <div style={{ fontSize: 8, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>📁 Positioning</div>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                        <div style={{ flex: 1, background: C.synapse + '10', border: `1px solid ${C.synapse}25`, borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: 7, color: C.textDim }}>BULLISH ABOVE</div>
                          <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.synapse }}>{fmt(levels.spyVwap)}</div>
                        </div>
                        <div style={{ flex: 1, background: C.red + '10', border: `1px solid ${C.red}25`, borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: 7, color: C.textDim }}>BEARISH BELOW</div>
                          <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.red }}>{fmt(levels.spyVwap)}</div>
                        </div>
                      </div>
                      {[
                        { label: 'VIX', value: vixPrice ? `${vixPrice.toFixed(2)} — ${vixPrice > 25 ? 'EXTREME' : vixPrice > 18 ? 'ELEVATED' : 'NORMAL'}` : '—', color: vixPrice && vixPrice > 18 ? C.fire : C.synapse },
                        { label: 'Breadth', value: marketIntel?.breadth?.bias || 'No data', color: C.textDim },
                        { label: 'Score', value: `${score}/13 — Grade ${grade}`, color: gradeColor },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 8, color: C.textDim }}>{label}</span>
                          <span style={{ fontSize: 8, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={async () => {
                    setAiLoading(true)
                    const [intel, flow, tide, tiingo2] = await Promise.all([fetchMarketIntel(keys[POLY_KEY] || 'server'), fetchOptionsFlow(keys[UW_KEY] || 'server'), fetchMarketTide(keys[UW_KEY] || 'server'), fetchTiingoContext(keys[TIINGO_KEY] || 'server', morningPlan.gapDirection, morningPlan.gapSize, morningPlan.impliedMove)])
                    setMarketIntel(intel); setOptionsFlow(flow); setMarketTide(tide); setTiingoContext(tiingo2)
                    const result = await runAI({ candles, levels, currentPrice, impliedMove: morningPlan.impliedMove, anthKey: keys[ANTH_KEY] || 'server', morningPlan, activePlaybook, tradeStats, optionsFlow: flow, marketTide: tide, marketIntel: intel, tiingoContext: tiingo2, marketNews, economicCalendar, multiTFData, zeroDTESkew, tradePatterns, macroRegime, marketScore, sessionMemory })
                    if (result) { setAiResult(result); setLastAITime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) }
                    setAiLoading(false)
                  }} disabled={aiLoading} style={{ width: 'calc(100% - 20px)', margin: '10px', padding: '8px', background: aiLoading ? C.surface2 : C.tealDim, border: `1px solid ${aiLoading ? C.border : C.tealBorder}`, borderRadius: 3, color: aiLoading ? C.textDim : C.violet, cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: font, fontSize: 9, fontWeight: 700, letterSpacing: '1px' }}>{aiLoading ? '⟳ ANALYZING...' : '▶ GET AI SIGNAL'}</button>
                </div>
              </div>
            </div>

            {/* ── BOTTOM DATA PANELS ── */}
            <div style={{ height: 160, background: 'transparent', borderTop: '1px solid rgba(0,229,255,0.1)', display: 'flex', overflow: 'hidden', flexShrink: 0 }}>

              {/* Options Flow */}
              <div style={{ flex: 1, borderRight: '1px solid rgba(0,229,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.synapse, boxShadow: `0 0 5px ${C.synapse}`, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.synapse, letterSpacing: '1px' }}>OPTIONS FLOW</span>
                  {optionsFlow.length > 0 && <span style={{ fontSize: 8, color: C.textDim }}>{optionsFlow.length} alerts</span>}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {optionsFlow.length === 0 ? (
                    <div style={{ fontSize: 9, color: C.textMuted, textAlign: 'center', marginTop: 16 }}>{keys[UW_KEY] ? 'No SPX/SPY flow alerts' : 'Add UW key in Settings'}</div>
                  ) : optionsFlow.slice(0, 8).map((f: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                      <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: (f.type || '').toUpperCase().startsWith('C') ? C.synapse : C.red, width: 30 }}>{(f.ticker || '').toUpperCase()}</span>
                      <span style={{ fontSize: 8, color: (f.type || '').toUpperCase().startsWith('C') ? C.synapse : C.red, width: 22, fontWeight: 700 }}>{(f.type || '').toUpperCase().startsWith('C') ? 'CALL' : 'PUT'}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 9, color: C.text, width: 50 }}>{f.strike}</span>
                      <span style={{ fontSize: 8, color: C.textDim, flex: 1 }}>{f.expiry || ''}</span>
                      {f.premium && <span style={{ fontFamily: fontDisplay, fontSize: 8, color: C.fire, fontWeight: 700 }}>${((f.premium || 0)/1000).toFixed(0)}K</span>}
                      <div style={{ padding: '1px 5px', borderRadius: 2, background: f.sentiment === 'BULLISH' ? C.synapse + '18' : f.sentiment === 'BEARISH' ? C.red + '18' : C.surface2, border: `1px solid ${f.sentiment === 'BULLISH' ? C.synapse + '40' : f.sentiment === 'BEARISH' ? C.red + '40' : C.border}` }}>
                        <span style={{ fontSize: 7, fontWeight: 700, color: f.sentiment === 'BULLISH' ? C.synapse : f.sentiment === 'BEARISH' ? C.red : C.textDim }}>{f.sentiment || 'NEUT'}</span>
                      </div>
                      {f.unusual && <span style={{ fontSize: 8, color: C.fire }}>⚡</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Tide */}
              <div style={{ width: 190, borderRight: '1px solid rgba(0,229,255,0.1)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: '1px' }}>MARKET TIDE</span>
                </div>
                <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {marketTide ? (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: 8 }}>
                        <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: marketTide.bias === 'CALL HEAVY' ? C.synapse : marketTide.bias === 'PUT HEAVY' ? C.red : C.fire, marginBottom: 2 }}>{marketTide.bias}</div>
                        <div style={{ fontSize: 8, color: C.textDim }}>P/C Ratio: <span style={{ color: C.text, fontWeight: 700 }}>{marketTide.putCallRatio}</span></div>
                      </div>
                      {[
                        { label: 'CALLS', value: marketTide.callPremium, pct: marketTide.callPct, color: C.synapse },
                        { label: 'PUTS', value: marketTide.putPremium, pct: marketTide.putPct, color: C.red },
                      ].map(({ label, value, pct, color }) => (
                        <div key={label} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 8, color }}>{label}</span>
                            <span style={{ fontSize: 8, color, fontFamily: fontDisplay }}>{value}</span>
                          </div>
                          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct || 50}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : <div style={{ fontSize: 9, color: C.textMuted, textAlign: 'center' }}>{'Loading tide...'}</div>}
                </div>
              </div>

              {/* Market Conditions */}
              <div style={{ width: 220, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: C.surface }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: '1px' }}>MARKET CONDITIONS</span>
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
                      <div><span style={{ fontSize: 11, color: C.textDim }}>{label}</span>{sub && <span style={{ fontSize: 7, color: C.textMuted, marginLeft: 4 }}>{sub}</span>}</div>
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
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
                  <input value={(newTrade as any)[key]} onChange={e => setNewTrade(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={ph} style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px solid ${C.border2}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none' }} />
                </div>
              ))}

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Direction</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['call', 'put'].map(d => (
                    <button key={d} onClick={() => setNewTrade(p => ({ ...p, direction: d }))} style={{
                      flex: 1, background: newTrade.direction === d ? (d === 'call' ? C.tealDim : C.redDim) : 'transparent',
                      border: `1px solid ${newTrade.direction === d ? (d === 'call' ? C.teal : C.red) : C.border2}`,
                      borderRadius: 5, padding: '5px 0', color: newTrade.direction === d ? (d === 'call' ? C.teal : C.red) : C.textDim,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: font, textTransform: 'uppercase'
                    }}>{d}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Playbook Used</div>
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
                    <span style={{ fontSize: 9, color: C.bg, fontWeight: 800 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: newTrade.inSystem ? C.teal : C.red }}>
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
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>Upload a CSV export from ThinkorSwim, Tradovate, Webull, or any broker. Your trade history will feed the AI to improve its analysis.</div>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button onClick={() => csvInputRef.current?.click()} style={{ width: '100%', background: 'rgba(10,14,24,0.95)', border: `1px dashed ${C.border2}`, borderRadius: 6, padding: '10px 0', color: C.textDim, cursor: 'pointer', fontSize: 11, fontFamily: font }}>
                  📁 Upload CSV
                </button>
                {importStatus && (
                  <div style={{ marginTop: 8, fontSize: 10, color: importStatus.startsWith('✓') ? C.teal : C.yellow, padding: '6px 8px', background: importStatus.startsWith('✓') ? C.tealDim : C.yellowDim, borderRadius: 5 }}>
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
                    <div style={{ fontSize: 10, color: C.textDim, background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, padding: '2px 8px' }}>
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
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: t.direction === 'call' ? C.tealDim : C.redDim, color: t.direction === 'call' ? C.teal : C.red }}>{(t.direction || '').toUpperCase()}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: t.inSystem ? C.tealDim : C.redDim, color: t.inSystem ? C.teal : C.red }}>{t.inSystem ? 'IN-SYS' : 'OUT-SYS'}</span>
                        {t.playbook && <span style={{ fontSize: 9, color: C.textDim }}>{t.playbook}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{t.date} {t.notes && `· ${t.notes}`}</div>
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
        {tab === 'journal' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#050609' }}>
            {/* Header row with title + import button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: C.text }}>Performance Analytics</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => csvInputRef.current?.click()} style={{ background: C.tealDim, border: '1px solid ' + C.tealBorder, borderRadius: 6, padding: '6px 12px', color: C.teal, cursor: 'pointer', fontSize: 11, fontFamily: font, fontWeight: 600 }}>
                  📂 Import CSV
                </button>
                {importStatus && <span style={{ fontSize: 10, color: importStatus.startsWith('✓') ? C.synapse : C.yellow }}>{importStatus}</span>}
              </div>
            </div>

            {/* 6 stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Net P&L</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.totalPnl) >= 0 ? C.synapse : C.red }}>{tradeStats ? (parseFloat(tradeStats.totalPnl) >= 0 ? '+' : '') + '$' + tradeStats.totalPnl : '$0'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{trades.length} trades</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Win Rate</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.winRate) >= 60 ? C.synapse : tradeStats && parseFloat(tradeStats.winRate) >= 50 ? C.yellow : C.red }}>{tradeStats ? tradeStats.winRate + '%' : '0%'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{tradeStats ? Math.round(trades.filter((t: any) => t.pnl > 0).length) + '/' + trades.length : '0/0'}</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Avg Win</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: C.synapse }}>{tradeStats ? '+$' + tradeStats.avgWin : '$0'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>per winner</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Avg Loss</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: C.red }}>{tradeStats ? '-$' + tradeStats.avgLoss : '$0'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>per loser</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Profit Factor</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.profitFactor) >= 1.5 ? C.synapse : tradeStats && parseFloat(tradeStats.profitFactor) >= 1 ? C.yellow : C.red }}>{tradeStats ? tradeStats.profitFactor + 'x' : '0x'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>win/loss ratio</div>
              </div>
              <div style={{ background: 'rgba(12,15,26,0.98)', border: '1px solid ' + C.border, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>In-System</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, color: tradeStats && parseFloat(tradeStats.inSystemWinRate) >= 60 ? C.synapse : C.yellow }}>{tradeStats ? tradeStats.inSystemWinRate + '%' : '0%'}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>playbook trades</div>
              </div>
            </div>

            {!trades.length ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(12,15,26,0.98)', borderRadius: 12, border: '1px solid ' + C.border }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
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
                        <button onClick={prevMonth} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: C.textMuted, cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: font }}>‹</button>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Daily P&L — {monthLabel}</div>
                        <button onClick={nextMonth} disabled={isCurrentMonth} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: isCurrentMonth ? C.border : C.textMuted, cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: font }}>›</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 8, color: C.textMuted, fontWeight: 600 }}>{d}</div>)}
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
                              <span style={{ fontSize: 9, color: isToday ? C.teal : C.textMuted, fontWeight: isToday ? 700 : 400, lineHeight: 1 }}>{day}</span>
                              {pnl != null && <span style={{ fontSize: 8, fontWeight: 700, color: pnl >= 0 ? C.synapse : C.red, lineHeight: 1 }}>{pnl >= 0 ? '+' : ''}${Math.abs(pnl) >= 1000 ? (pnl / 1000).toFixed(1) + 'k' : Math.round(pnl)}</span>}
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>P&L by Hour</div>
                        {hrs.length === 0 ? (
                          <div style={{ fontSize: 11, color: C.textMuted }}>Add trades with time data to see hourly breakdown</div>
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
                                    <span style={{ fontSize: 7, color: C.textMuted }}>{h > 12 ? h - 12 + 'p' : h + 'a'}</span>
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              {best && <div style={{ background: 'rgba(0,170,85,0.08)', border: '1px solid rgba(0,170,85,0.2)', borderRadius: 5, padding: '6px 8px' }}>
                                <div style={{ fontSize: 9, color: C.textMuted }}>Best</div>
                                <div style={{ fontSize: 11, color: C.synapse, fontWeight: 700 }}>{best.h > 12 ? best.h - 12 + 'PM' : best.h + 'AM'} (+${Math.round(best.p)})</div>
                              </div>}
                              {worst && <div style={{ background: 'rgba(204,16,64,0.06)', border: '1px solid rgba(204,16,64,0.2)', borderRadius: 5, padding: '6px 8px' }}>
                                <div style={{ fontSize: 9, color: C.textMuted }}>Worst</div>
                                <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>{worst.h > 12 ? worst.h - 12 + 'PM' : worst.h + 'AM'} (${Math.round(worst.p)})</div>
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Playbook Performance</div>
                        {pbs.map(([name, pb]) => {
                          const wr = pb.tot ? Math.round(pb.w / pb.tot * 100) : 0
                          return (
                            <div key={name} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 11, color: '#f0f4ff', fontWeight: 600 }}>{name}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: pb.pnl >= 0 ? C.synapse : C.red }}>{pb.pnl >= 0 ? '+' : ''}${Math.round(pb.pnl)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, fontSize: 9, color: C.textMuted, marginBottom: 3 }}>
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
                      const resp = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }) })
                      const dat = await resp.json()
                      const analysis = dat.content?.[0]?.text || 'No analysis available'
                      setChatMessages([{ role: 'assistant', content: '🧠 Pattern Analysis:\n\n' + analysis }])
                      setTab('cockpit')
                    } catch (e) { console.error(e) }
                    setAiLoading(false)
                  }} style={{ background: C.tealDim, border: '1px solid ' + C.tealBorder, borderRadius: 7, padding: '8px 14px', color: C.teal, cursor: 'pointer', fontFamily: font, fontSize: 11, fontWeight: 700, marginRight: 8 }}>
                    {aiLoading ? '↻ Analyzing...' : '🔍 Analyze My Patterns'}
                  </button>
                  <span style={{ fontSize: 10, color: C.textMuted }}>Sends your stats to AI — results appear in cockpit chat</span>
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
            🧠
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
                  🧠
                </div>
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid rgba(124,58,237,0.2)`, animation: 'brainRing 4s linear infinite' }} />
              </div>
              <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.teal, textShadow: `0 0 12px rgba(124,58,237,0.5)` }}>
                AI COMPANION
              </div>
              {/* Status */}
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', border: `1px solid ${listening ? 'rgba(255,60,96,0.4)' : speaking ? 'rgba(124,58,237,0.4)' : 'rgba(0,229,255,0.25)'}`, color: listening ? C.red : speaking ? C.violet : C.teal, background: listening ? 'rgba(255,60,96,0.08)' : speaking ? 'rgba(124,58,237,0.08)' : 'rgba(0,229,255,0.05)', animation: listening ? 'listeningPulse 1s infinite' : 'none' }}>
                {listening ? '✏ LISTENING' : speaking ? '↗ SPEAKING' : chatLoading ? '⏳ THINKING' : '✓ READY'}
              </div>
              {aiResult && (
                <div style={{ marginLeft: 'auto', background: `${signalColor}15`, border: `1px solid ${signalColor}35`, borderRadius: 2, padding: '2px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 800, color: signalColor, letterSpacing: 2 }}>{aiResult.signal}</span>
                  <span style={{ fontSize: 8, color: C.textDim }}>{aiResult.confidence}%</span>
                </div>
              )}
              <button title="Pop out companion" onClick={() => window.open('/cockpit/companion', 'tz-companion', 'width=400,height=640,top=50,right=50,resizable=yes')} style={{ background: 'transparent', border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 3, color: C.teal, cursor: 'pointer', fontSize: 9, padding: '2px 6px', fontFamily: font }}>⤢</button>
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
                  <div style={{ fontSize: 7, color: '#6b7a9a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Messages */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 2, background: 'rgba(10,14,24,0.95)' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🧠</div>
                  <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
                    Watching your session live. All market data, your plan, and the chart are loaded. Ask anything or use the mic.
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                    {["What's the setup?", "Should I trade?", "Am I in system?", "What does flow say?"].map(q => (
                      <button key={q} onClick={() => sendChatWithText(q)} style={{ background: C.tealDim, border: `1px solid ${C.tealBorder}`, borderRadius: 99, padding: '3px 10px', color: C.textDim, cursor: 'pointer', fontSize: 9, fontFamily: font }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                  {m.role === 'assistant' && (
                    <div style={{ fontSize: 7, color: C.teal, fontWeight: 700, marginBottom: 3, display: 'flex', gap: 4, alignItems: 'center', letterSpacing: 1 }}>
                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.teal, boxShadow: `0 0 4px ${C.violet}` }} />
                      AI COMPANION
                    </div>
                  )}
                  <div style={{
                    padding: '7px 11px',
                    borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '2px 8px 8px 8px',
                    fontSize: 11, lineHeight: 1.65,
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
                  <div style={{ fontSize: 7, color: C.teal, fontWeight: 700, marginBottom: 3, letterSpacing: 1 }}>AI COMPANION</div>
                  <div style={{ padding: '8px 12px', borderRadius: '2px 8px 8px 8px', background: 'rgba(124,58,237,0.08)', border: `1px solid rgba(124,58,237,0.18)`, borderLeft: `2px solid ${C.violet}`, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: `pulse 1s ${i*0.15}s infinite` }} />)}
                  </div>
                </div>
              )}
              {listening && liveTranscript && (
                <div style={{ alignSelf: 'flex-end', padding: '5px 9px', borderRadius: '8px 8px 2px 8px', background: 'rgba(255,60,96,0.08)', border: `1px solid rgba(255,60,96,0.3)`, borderRight: `2px solid ${C.red}`, fontSize: 10, color: C.red, fontStyle: 'italic' }}>
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
                  <span style={{ fontSize: 8, color: C.teal, marginLeft: 8, letterSpacing: 1 }}>SPEAKING</span>
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
                  {listening ? '↹' : '🎙️'}
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
                  }} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: `1px solid ${C.tealBorder}`, background: 'transparent', color: C.teal, cursor: 'pointer', fontFamily: font, flexShrink: 0 }}>
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
                    fontFamily: font, fontSize: 11, outline: 'none',
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
                  <span style={{ fontSize: 8, color: C.textDim, letterSpacing: '1px', textTransform: 'uppercase' }}>Voice</span>
                  {speaking && <span style={{ fontSize: 8, color: C.teal, animation: 'pulse 0.8s infinite' }}>✏ speaking</span>}
                  <button onClick={() => setShowSettings(true)} style={{ marginLeft: 'auto', fontSize: 8, color: C.textDim, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>+ more voices</button>
                </div>
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
                      fontSize: 9, cursor: 'pointer', fontFamily: font, transition: 'all 0.12s',
                    }}>{v.name}</button>
                  ))}
                </div>
                <input
                  value={voiceId && !['21m00Tcm4TlvDq8ikWAM','29vD33N1CtxCmqQRPOHJ','2EiwWnXFnvU5JabPnv8n','5Q0t7uMcjvnagumLfvZi','AZnzlk1XvdvUeBnXmlld','CYw3kZ78EXmF4bPxNGZ2','EXAVITQu4vr4xnSDxMaL','GBv7mTt0atIp3Br8iCZE'].includes(voiceId) ? voiceId : ''}
                  onChange={e => { setVoiceId(e.target.value); localStorage.setItem(VOICE_ID, e.target.value) }}
                  placeholder="Custom ElevenLabs voice ID..."
                  style={{ width: '100%', marginTop: 5, background: 'rgba(0,229,255,0.03)', border: `1px solid rgba(0,229,255,0.08)`, borderRadius: 2, padding: '4px 8px', color: C.text, fontSize: 9, outline: 'none', fontFamily: font }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


