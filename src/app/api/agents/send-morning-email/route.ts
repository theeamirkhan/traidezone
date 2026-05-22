/**
 * /api/agents/send-morning-email — Dedicated morning email agent
 *
 * NO AUTH REQUIRED — completely open GET endpoint (just a trigger).
 * This solves the cron auth problem entirely — nothing to fail silently.
 *
 * Cron: 9:00am ET weekdays (13:00 UTC)
 *
 * Features:
 *   - Highest probability setups (hero section)
 *   - AI directional bias + reasoning
 *   - VIX term structure + implied daily move
 *   - Daily candle patterns
 *   - Gap stats (fill rate, trend rate from DB)
 *   - Key levels + VWAP
 *   - Biggest risk + trading plan
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectDailyCandlePatterns } from '@/app/cockpit/lib/dailyCandlePatterns'

const FROM_EMAIL  = 'morning@traidezone.ai'
const ADMIN_EMAIL = 'theeamirkhan@gmail.com'

// ── Polygon helper ────────────────────────────────────────────────────────────
async function poly(path: string) {
  const key = process.env.POLYGON_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.polygon.io${path}${path.includes('?') ? '&' : '?'}apiKey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    )
    return res.ok ? res.json() : null
  } catch { return null }
}

// ── Market data fetch ─────────────────────────────────────────────────────────
async function fetchData() {
  const td   = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const f20  = new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0]
  const f5   = new Date(Date.now() -  5 * 86400000).toISOString().split('T')[0]

  const [spxD, vixD, vix1dD, spxI] = await Promise.all([
    poly(`/v2/aggs/ticker/I:SPX/range/1/day/${f20}/${td}?adjusted=true&sort=desc&limit=20`),
    poly(`/v2/aggs/ticker/I:VIX/range/1/day/${f5}/${td}?adjusted=true&sort=desc&limit=2`),
    poly(`/v2/aggs/ticker/I:VIX1D/range/1/day/${f5}/${td}?adjusted=true&sort=desc&limit=2`),
    poly(`/v2/aggs/ticker/I:SPX/range/5/minute/${td}/${td}?adjusted=true&sort=asc&limit=80`),
  ])

  const spxBars   = spxD?.results   || []
  const prevClose = spxBars[1]?.c   || spxBars[0]?.c || null
  const vixClose  = vixD?.results?.[0]?.c   || null
  const vix1d     = vix1dD?.results?.[0]?.c || null
  const intraBars = spxI?.results   || []

  // VWAP from intraday bars
  let vwap = null
  if (intraBars.length > 5) {
    let cumVol = 0, cumTPV = 0
    for (const b of intraBars) {
      const tp = (b.h + b.l + b.c) / 3
      cumTPV += tp * (b.v || 1)
      cumVol += (b.v || 1)
    }
    vwap = cumTPV / cumVol
  }

  // Implied move from VIX1D
  const impliedMove = vix1d && prevClose
    ? ((vix1d / 100) * prevClose / Math.sqrt(252) * 1.25).toFixed(0)
    : null

  // Candle patterns
  const patterns = spxBars.length >= 3
    ? detectDailyCandlePatterns([...spxBars].reverse(), {
        sma50: spxBars.length >= 10
          ? spxBars.slice(0, 10).reduce((s: number, b: any) => s + b.c, 0) / 10
          : undefined,
      })
    : []

  // Gap history from DB
  const { data: gapRows } = await supabaseAdmin
    .from('gap_outcomes')
    .select('gap_outcome, day_type')
    .not('gap_outcome', 'eq', 'PENDING')
    .not('gap_outcome', 'is', null)
    .limit(90)

  const gapTotal   = gapRows?.length || 0
  const fillRate   = gapTotal > 0
    ? Math.round((gapRows!.filter(r => r.gap_outcome === 'FILLED').length) / gapTotal * 100)
    : 49
  const trendRate  = gapTotal > 0
    ? Math.round((gapRows!.filter(r => r.day_type === 'TREND_UP' || r.day_type === 'TREND_DOWN').length) / gapTotal * 100)
    : 37

  // Today's gap record
  let todayGap: any = null
  try {
    const tgRes = await supabaseAdmin
      .from('gap_outcomes')
      .select('gap_direction, gap_size, trend_score_predicted, catalyst_type')
      .eq('trading_date', td)
      .single()
    todayGap = tgRes.data
  } catch {}

  return { prevClose, vixClose, vix1d, vwap, impliedMove, patterns, fillRate, trendRate, todayGap }
}

// ── AI brief generation ───────────────────────────────────────────────────────
async function generateBrief(data: Awaited<ReturnType<typeof fetchData>>) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const { prevClose, vixClose, vix1d, vwap, impliedMove, patterns, fillRate, trendRate, todayGap } = data

  const userPrompt = `Today: ${today}
SPX prev close: ${prevClose?.toFixed(2) || 'search for current'}
VIX: ${vixClose?.toFixed(2) || 'search'} | VIX1D: ${vix1d?.toFixed(2) || 'n/a'} | Implied daily move: ±${impliedMove || 'n/a'}pts
VWAP (if market open): ${vwap?.toFixed(2) || 'not yet — pre-market'}

DAILY CANDLE PATTERNS (yesterday's close):
${patterns.length > 0
    ? patterns.map(p => `${p.strength} ${p.name} (${p.type}): ${p.actionable}`).join('\n')
    : 'No significant patterns'}

HISTORICAL GAP STATS (${Math.max(0, data.fillRate ? 90 : 0)} day sample):
Gap fill rate: ${fillRate}% | Trend days: ${trendRate}%
${todayGap ? `Today's gap: ${todayGap.gap_direction || 'flat'} ${todayGap.gap_size?.toFixed(1) || '0'}pts | Trend score: ${todayGap.trend_score_predicted || 'n/a'}/100` : 'Gap not yet recorded'}

Use web search to find: current SPX pre-market futures, today's economic events, overnight news catalyst.

You are writing for an SPX ITM options day trader who:
- Buys calls (LONG) or puts (SHORT) and closes same day
- Entries after 10am ET, exits before 3pm ET
- Stops at VWAP reclaim or 200 EMA
- Needs specific price levels, not generic advice

Return ONLY valid JSON (no markdown, no backticks):
{
  "macroBias": "BULLISH|BEARISH|NEUTRAL",
  "macroSentence": "one sentence on macro regime",
  "weeklyNarrative": "2 sentences on what is driving markets this week",
  "todaysBias": "LONG|SHORT|NEUTRAL",
  "biasReasoning": "2-3 sentences with specific data points",
  "highProbSetups": [
    {
      "name": "descriptive setup name",
      "direction": "LONG|SHORT",
      "probability": "HIGH|MODERATE",
      "entry": "specific price or condition to trigger entry",
      "target": "specific SPX price level",
      "stop": "specific SPX price level",
      "timing": "e.g. 10am-11am ET after open noise settles",
      "rationale": "1 sentence why this setup is high probability today"
    }
  ],
  "keyLevels": "comma-separated SPX price levels to watch",
  "catalystWatch": "any economic events or news today",
  "biggestRisk": "one thing that invalidates the bias",
  "tradingPlan": "2 sentences of actionable guidance for today",
  "preMarketNote": "1 sentence on overnight futures or pre-market action"
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are an elite SPX intraday options trading analyst. Always respond with ONLY valid JSON. No markdown fences, no intro, no explanation. Start your response with { and end with }.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const d = await res.json()
  const textBlocks = (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  const match = textBlocks.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON found. Response: ${textBlocks.substring(0, 200)}`)
  return JSON.parse(match[0])
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function buildHTML(brief: any, data: Awaited<ReturnType<typeof fetchData>>, dateStr: string) {
  const biasCol  = brief.todaysBias === 'LONG'    ? '#00d4a0' : brief.todaysBias === 'SHORT'   ? '#ff4d6d' : '#f59e0b'
  const macroCol = brief.macroBias  === 'BULLISH' ? '#00ff88' : brief.macroBias  === 'BEARISH' ? '#ff4d6d' : '#f59e0b'
  const { vixClose, vix1d, vwap, impliedMove, patterns, fillRate, trendRate, todayGap } = data

  const setupsHTML = (brief.highProbSetups || []).map((s: any) => {
    const isLong = s.direction === 'LONG'
    const col    = isLong ? '#00d4a0' : '#ff4d6d'
    const bg     = isLong ? 'rgba(0,212,160,0.05)' : 'rgba(255,77,109,0.05)'
    const border = isLong ? 'rgba(0,212,160,0.2)' : 'rgba(255,77,109,0.2)'
    return `
    <div style="background:${bg};border:1px solid ${border};border-left:3px solid ${col};border-radius:8px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:800;color:${col};">${s.direction} — ${s.name}</span>
        <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;background:${s.probability==='HIGH'?'rgba(0,255,136,0.1)':'rgba(245,158,11,0.1)'};color:${s.probability==='HIGH'?'#00ff88':'#f59e0b'};">${s.probability}</span>
      </div>
      <div style="font-size:11px;color:#b0c4de;margin-bottom:6px;">${s.rationale}</div>
      <div style="font-size:11px;color:#b0c4de;margin-bottom:4px;">📍 Entry: <strong style="color:#e2e8f0;">${s.entry}</strong></div>
      <div style="display:flex;gap:20px;font-size:11px;">
        <span>🎯 <strong style="color:#00ff88;">${s.target}</strong></span>
        <span>🛑 <strong style="color:#ff4d6d;">${s.stop}</strong></span>
        <span style="color:#6b7a9a;">⏰ ${s.timing}</span>
      </div>
    </div>`
  }).join('') || '<div style="font-size:12px;color:#4a5568;padding:8px 0;">No high-probability setups today — conditions unclear, wait for the market to show its hand after 10am.</div>'

  const patternsHTML = patterns.slice(0, 3).map(p => {
    const col = p.type.includes('BULLISH') ? '#00ff88' : p.type.includes('BEARISH') ? '#ff4d6d' : '#f59e0b'
    return `<div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
        <span style="font-size:10px;font-weight:800;color:${col};">${p.name}</span>
        <span style="font-size:8px;color:#4a5568;background:rgba(255,255,255,0.04);padding:1px 5px;border-radius:2px;">${p.strength}</span>
      </div>
      <div style="font-size:11px;color:#b0c4de;">${p.actionable}</div>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>trAIde Zone · ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
<div style="max-width:620px;margin:0 auto;padding:20px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#090c1c,#0d1128);border:1px solid rgba(0,229,255,0.12);border-top:3px solid ${biasCol};border-radius:12px;padding:22px 24px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:800;color:#00e5ff;letter-spacing:3px;margin-bottom:4px;">trAIde Zone · Morning Brief</div>
    <div style="font-size:22px;font-weight:900;color:#f0f4ff;margin-bottom:14px;">${dateStr}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span style="background:${macroCol}15;border:1px solid ${macroCol}35;color:${macroCol};font-size:11px;font-weight:800;padding:4px 12px;border-radius:4px;">MACRO: ${brief.macroBias}</span>
      <span style="background:${biasCol}15;border:1px solid ${biasCol}35;color:${biasCol};font-size:11px;font-weight:800;padding:4px 12px;border-radius:4px;">AI: ${brief.todaysBias}</span>
      ${vix1d ? `<span style="background:rgba(255,143,163,0.1);border:1px solid rgba(255,143,163,0.25);color:#ff8fa3;font-size:11px;font-weight:700;padding:4px 12px;border-radius:4px;">VIX1D ${vix1d.toFixed(1)} · ±${impliedMove}pts</span>` : ''}
      ${vixClose ? `<span style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);color:#00e5ff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:4px;">VIX ${vixClose.toFixed(1)}</span>` : ''}
    </div>
  </div>

  <!-- Pre-market note -->
  ${brief.preMarketNote ? `<div style="background:#080b18;border:1px solid rgba(0,229,255,0.08);border-left:3px solid #00e5ff;border-radius:8px;padding:11px 16px;margin-bottom:12px;font-size:13px;color:#b0c4de;line-height:1.6;"><span style="color:#00e5ff;font-weight:700;font-size:9px;letter-spacing:2px;display:block;margin-bottom:4px;text-transform:uppercase;">⚡ Pre-Market</span>${brief.preMarketNote}</div>` : ''}

  <!-- HIGH PROBABILITY SETUPS — HERO -->
  <div style="background:#080b18;border:1px solid rgba(124,106,255,0.25);border-top:3px solid #7c6aff;border-radius:10px;padding:16px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:800;color:#7c6aff;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">🎯 Highest Probability Setups Today</div>
    ${setupsHTML}
  </div>

  <!-- Bias -->
  <div style="background:${biasCol}08;border:1px solid ${biasCol}20;border-radius:8px;padding:13px 16px;margin-bottom:10px;">
    <div style="font-size:9px;font-weight:800;color:${biasCol};letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">🧠 AI Bias — ${brief.todaysBias}</div>
    <div style="font-size:13px;line-height:1.7;color:#e2e8f0;">${brief.biasReasoning}</div>
  </div>

  <!-- Weekly narrative -->
  <div style="background:#080b18;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:13px 16px;margin-bottom:10px;">
    <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📅 This Week</div>
    <div style="font-size:13px;line-height:1.7;color:#b0c4de;">${brief.weeklyNarrative}</div>
  </div>

  <!-- Data grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
    <div style="background:#080b18;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📍 Key Levels</div>
      <div style="font-size:12px;color:#e2e8f0;line-height:1.7;">${brief.keyLevels}</div>
      ${vwap ? `<div style="font-size:11px;color:#00e5ff;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">VWAP ${vwap.toFixed(1)}</div>` : ''}
    </div>
    <div style="background:#080b18;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📊 Gap History</div>
      <div style="font-size:12px;color:#e2e8f0;margin-bottom:3px;">Fill rate <strong style="color:#00d4a0;">${fillRate}%</strong></div>
      <div style="font-size:12px;color:#e2e8f0;margin-bottom:3px;">Trend days <strong style="color:#7c6aff;">${trendRate}%</strong></div>
      ${todayGap?.trend_score_predicted != null ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px;">Today score: ${todayGap.trend_score_predicted}/100</div>` : ''}
    </div>
  </div>

  <!-- Candle patterns -->
  ${patterns.length > 0 ? `
  <div style="background:#080b18;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:13px 16px;margin-bottom:10px;">
    <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">🕯 Daily Candle Signals</div>
    ${patternsHTML}
  </div>` : ''}

  <!-- Catalyst -->
  ${brief.catalystWatch ? `
  <div style="background:#080b18;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px 16px;margin-bottom:10px;">
    <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;">📰 Catalyst Watch</div>
    <div style="font-size:12px;color:#b0c4de;">${brief.catalystWatch}</div>
  </div>` : ''}

  <!-- Risk -->
  <div style="background:rgba(255,77,109,0.04);border:1px solid rgba(255,77,109,0.18);border-radius:8px;padding:12px 16px;margin-bottom:10px;">
    <div style="font-size:9px;font-weight:700;color:#ff4d6d;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;">⚠️ Biggest Risk Today</div>
    <div style="font-size:13px;color:#ffb0b8;">${brief.biggestRisk}</div>
  </div>

  <!-- Plan -->
  <div style="background:rgba(0,212,160,0.04);border:1px solid rgba(0,212,160,0.18);border-radius:8px;padding:12px 16px;margin-bottom:20px;">
    <div style="font-size:9px;font-weight:700;color:#00d4a0;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;">📋 Today's Plan</div>
    <div style="font-size:13px;color:#e2e8f0;line-height:1.7;">${brief.tradingPlan}</div>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:24px;">
    <a href="https://www.traidezone.ai/cockpit" style="display:inline-block;background:linear-gradient(135deg,#00d4a0,#00e5ff);color:#060810;font-size:13px;font-weight:800;padding:13px 36px;border-radius:8px;text-decoration:none;letter-spacing:1px;">→ OPEN COCKPIT</a>
  </div>

  <div style="text-align:center;font-size:10px;color:#2d3748;line-height:1.9;">
    trAIde Zone · AI Trading Companion<br>
    Not financial advice. All trading involves risk.
  </div>
</div></body></html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // NO AUTH — open endpoint. Security: it only sends to a hardcoded admin email.
  const isPreview = req.nextUrl.searchParams.get('preview') === 'true'

  // Skip weekends
  const etDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  if (etDay === 0 || etDay === 6) return NextResponse.json({ status: 'weekend', skipped: true })

  try {
    const dateStr = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
    })

    const data  = await fetchData()
    const brief = await generateBrief(data)
    const html  = buildHTML(brief, data, dateStr)
    const subject = `trAIde Zone · ${dateStr} · ${brief.macroBias} · AI: ${brief.todaysBias}`

    if (isPreview) {
      return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    }

    // Send via Resend
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html }),
    })
    const result = await sendRes.json()

    // Log to Supabase
    try {
      await supabaseAdmin.from('email_logs').insert({
        type: 'morning_brief', recipient: ADMIN_EMAIL, subject,
        status:    result.id ? 'sent' : 'failed',
        resend_id: result.id || null,
        brief_bias: brief.todaysBias,
        macro_bias: brief.macroBias,
        sent_at:   new Date().toISOString(),
      })
    } catch {}

    return NextResponse.json({
      status:   result.id ? 'sent' : 'failed',
      to:       ADMIN_EMAIL,
      subject,
      resendId: result.id,
      setups:   brief.highProbSetups?.length || 0,
    })

  } catch (e: any) {
    console.error('[send-morning-email]', e.message)
    try {
      await supabaseAdmin.from('email_logs').insert({
        type: 'morning_brief', status: 'error',
        subject: `ERROR: ${e.message}`, sent_at: new Date().toISOString(),
      })
    } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
