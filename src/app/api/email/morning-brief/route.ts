/**
 * /api/email/morning-brief — Daily morning brief email
 *
 * Cron: 9:30am ET weekdays (13:30 UTC)
 * Sends personalized morning brief to each active subscriber
 *
 * For now: sends to admin email
 * Future: loops through Clerk users with active subscriptions
 */

import { NextRequest, NextResponse } from 'next/server'
import { detectDailyCandlePatterns } from '@/app/cockpit/lib/dailyCandlePatterns'
import { supabaseAdmin } from '@/lib/supabase'

const FROM_EMAIL   = 'morning@traidezone.ai'
const ADMIN_EMAIL  = 'theeamirkhan@gmail.com'

// ── Fetch pre-market data ──────────────────────────────────────────────────
async function getPreMarketData() {
  try {
    const POLYGON_KEY = process.env.POLYGON_API_KEY
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const from  = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]

    const [spxRes, vixRes] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/day/${from}/${today}?adjusted=true&sort=desc&limit=5&apiKey=${POLYGON_KEY}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/range/1/day/${from}/${today}?adjusted=true&sort=desc&limit=2&apiKey=${POLYGON_KEY}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    ])

    const spxBars = spxRes.results || []
    const vixBars = vixRes.results || []
    const prevClose = spxBars[0]?.c || null
    const prevVix   = vixBars[0]?.c || null

    // Detect daily candle patterns
    const patterns = spxBars.length >= 2
      ? detectDailyCandlePatterns(
          [...spxBars].reverse(),
          { sma50: spxBars.length >= 10 ? spxBars.slice(0,10).reduce((s: number, b: any) => s + b.c, 0) / 10 : undefined }
        )
      : []

    return { prevClose, prevVix, today, patterns }
  } catch { return { prevClose: null, prevVix: null, today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), patterns: [] } }
}

// ── Generate brief via AI ──────────────────────────────────────────────────
async function generateBrief(prevClose: number | null, prevVix: number | null, patterns: any[] = [], marketIntel: any = null) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are an elite institutional trading analyst writing the pre-market morning brief for a disciplined SPX intraday options day trader.
The trader uses ITM SPX options, entries after 10am ET, VWAP+EMA confluence, stops at VWAP or 200 EMA.
Search for current market conditions, overnight futures, and today's economic calendar first.
CRITICAL: Your ENTIRE response must be a single valid JSON object. No intro text, no explanation, no markdown. Start with { and end with }.
JSON format:
{
  "macroBias": "BULLISH|BEARISH|NEUTRAL",
  "macroSentence": "One line on Fed/rates/macro regime",
  "weeklyNarrative": "2-3 sentences on what is driving markets this week",
  "todaysBias": "LONG|SHORT|NEUTRAL",
  "biasReasoning": "2-3 sentences with specific reasons for today's directional bias",
  "keyLevels": "Specific SPX levels to watch today",
  "catalystWatch": "Economic events or news that could move markets today",
  "biggestRisk": "The single most important risk that could invalidate the bias",
  "tradingPlan": "2 sentences of specific guidance for the trading day",
  "preMarketNote": "1 sentence on overnight futures/pre-market action"
}`,
      messages: [{
        role: 'user',
        content: `Today: ${today}
SPX prev close: ${prevClose ? prevClose.toFixed(2) : 'search for current'}
VIX prev close: ${prevVix ? prevVix.toFixed(2) : 'search for current'}

Search for: current SPX futures pre-market, today's economic calendar, overnight market news.

DAILY CANDLE PATTERNS (yesterday's close):
${patterns?.length > 0 ? patterns.map((p: any) => `${p.strength} ${p.name} (${p.type}): ${p.description} → ${p.actionable}`).join('\n') : 'No significant patterns'}

VIX TERM STRUCTURE:
${marketIntel?.termStructure ? `VIX1D: ${marketIntel.termStructure.vix1d} | VIX30: ${marketIntel.termStructure.vix30} | Shape: ${marketIntel.termStructure.termShape?.toUpperCase()} | Implied move today: ±${marketIntel.termStructure.impliedMoveToday}pts` : 'Fetch from market data'}

VWAP BANDS (pre-market):
${marketIntel?.vwapBands ? `Position: ${marketIntel.vwapBands.bandPosition} | ±1σ: ${marketIntel.vwapBands.band1Dn?.toFixed(0)}-${marketIntel.vwapBands.band1Up?.toFixed(0)} | ±2σ: ${marketIntel.vwapBands.band2Dn?.toFixed(0)}-${marketIntel.vwapBands.band2Up?.toFixed(0)}` : 'Not available pre-market'}

IV vs REALIZED VOL:
${marketIntel?.volSpread ? marketIntel.volSpread.signal : 'Not available'}

SECTOR ROTATION:
${marketIntel?.sectorRotation ? `${marketIntel.sectorRotation.rotationSignal} — Leading: ${marketIntel.sectorRotation.leading?.join(', ')} | Lagging: ${marketIntel.sectorRotation.lagging?.join(', ')}` : 'Not available pre-market'}

Write the morning brief for an SPX intraday ITM options day trader. Reference candle patterns, VIX term structure, and sector rotation where relevant. Be specific and actionable.`
      }]
    })
  })

  const data = await res.json()
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  // Extract JSON block — AI sometimes returns text before/after the JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response: ' + text.substring(0, 100))
  return JSON.parse(jsonMatch[0])
}

// ── Build HTML email ───────────────────────────────────────────────────────
function buildEmailHTML(brief: any, date: string, marketIntel: any = null) {
  const biasColor   = brief.todaysBias === 'LONG' ? '#00d4a0' : brief.todaysBias === 'SHORT' ? '#ff4d6d' : '#f59e0b'
  const macroColor  = brief.macroBias === 'BULLISH' ? '#00ff88' : brief.macroBias === 'BEARISH' ? '#ff4d6d' : '#f59e0b'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>trAIde Zone — Morning Brief</title>
</head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0a0d1a,#0d1128);border:1px solid rgba(0,229,255,0.15);border-top:3px solid ${biasColor};border-radius:12px;padding:24px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:11px;font-weight:800;color:#00e5ff;letter-spacing:3px;text-transform:uppercase;">trAIde Zone</div>
        <div style="font-size:10px;color:#4a5568;">${date}</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:#f0f4ff;margin-bottom:12px;">Morning Brief</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:${macroColor}18;border:1px solid ${macroColor}40;color:${macroColor};font-size:11px;font-weight:800;padding:4px 12px;border-radius:4px;">MACRO: ${brief.macroBias}</span>
        <span style="background:${biasColor}18;border:1px solid ${biasColor}40;color:${biasColor};font-size:11px;font-weight:800;padding:4px 12px;border-radius:4px;">AI BIAS: ${brief.todaysBias}</span>
      </div>
    </div>

    <!-- Pre-market note -->
    ${brief.preMarketNote ? `
    <div style="background:#0a0d1a;border:1px solid rgba(0,229,255,0.08);border-left:3px solid #00e5ff;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">⚡ Pre-Market</div>
      <div style="font-size:13px;color:#b0c4de;line-height:1.6;">${brief.preMarketNote}</div>
    </div>` : ''}

    <!-- Macro -->
    <div style="background:#0a0d1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">🌍 Macro Regime</div>
      <div style="font-size:13px;color:#b0c4de;font-style:italic;line-height:1.6;">${brief.macroSentence}</div>
    </div>

    <!-- This week -->
    <div style="background:#0a0d1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📅 This Week</div>
      <div style="font-size:13px;color:#e2e8f0;line-height:1.75;">${brief.weeklyNarrative}</div>
    </div>

    <!-- AI Bias -->
    <div style="background:${biasColor}08;border:1px solid ${biasColor}25;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:${biasColor};letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">🧠 AI Bias — ${brief.todaysBias}</div>
      <div style="font-size:13px;color:#e2e8f0;line-height:1.75;">${brief.biasReasoning}</div>
    </div>

    <!-- Key levels + catalyst -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="background:#0a0d1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px 16px;">
        <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📍 Key Levels</div>
        <div style="font-size:12px;color:#e2e8f0;line-height:1.6;">${brief.keyLevels}</div>
      </div>
      <div style="background:#0a0d1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px 16px;">
        <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📊 Watch</div>
        <div style="font-size:12px;color:#e2e8f0;line-height:1.6;">${brief.catalystWatch}</div>
      </div>
    </div>

    <!-- Biggest risk -->
    <div style="background:rgba(255,77,109,0.05);border:1px solid rgba(255,77,109,0.2);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:#ff4d6d;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">⚠️ Biggest Risk</div>
      <div style="font-size:13px;color:#ffb0b8;line-height:1.6;">${brief.biggestRisk}</div>
    </div>

    <!-- Trading plan -->
    <div style="background:rgba(0,212,160,0.05);border:1px solid rgba(0,212,160,0.2);border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:700;color:#00d4a0;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">📋 Today's Plan</div>
      <div style="font-size:13px;color:#e2e8f0;line-height:1.75;">${brief.tradingPlan}</div>
    </div>

    <!-- Market Intelligence -->
    ${marketIntel ? `
    <div style="background:#0a0d1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:9px;font-weight:700;color:#4a5568;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">📊 Market Intelligence</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${marketIntel.termStructure ? `
        <div>
          <div style="font-size:9px;color:#4a5568;margin-bottom:3px;">VIX Term Structure</div>
          <div style="font-size:12px;color:#e2e8f0;">VIX1D <strong style="color:#ff8fa3">${marketIntel.termStructure.vix1d?.toFixed(1) || 'n/a'}</strong> / VIX30 <strong style="color:#00e5ff">${marketIntel.termStructure.vix30?.toFixed(1) || 'n/a'}</strong></div>
          <div style="font-size:11px;color:#6b7a9a;">Shape: ${marketIntel.termStructure.termShape?.toUpperCase() || 'n/a'} ${marketIntel.termStructure.impliedMoveToday ? `| ±${marketIntel.termStructure.impliedMoveToday}pts today` : ''}</div>
        </div>` : ''}
        ${marketIntel.volSpread ? `
        <div>
          <div style="font-size:9px;color:#4a5568;margin-bottom:3px;">IV vs Realized Vol</div>
          <div style="font-size:12px;color:#e2e8f0;">IV <strong style="color:#00e5ff">${marketIntel.volSpread.impliedVol}%</strong> / RV <strong style="color:#7c6aff">${marketIntel.volSpread.realizedVol5d}%</strong></div>
          <div style="font-size:11px;color:${marketIntel.volSpread.spread > 5 ? '#ff4d6d' : marketIntel.volSpread.spread < -3 ? '#00ff88' : '#6b7a9a'};">${marketIntel.volSpread.spread > 5 ? 'Options EXPENSIVE' : marketIntel.volSpread.spread < -3 ? 'Options CHEAP' : 'Fairly priced'}</div>
        </div>` : ''}
        ${marketIntel.sectorRotation ? `
        <div>
          <div style="font-size:9px;color:#4a5568;margin-bottom:3px;">Sector Rotation</div>
          <div style="font-size:12px;font-weight:700;color:${marketIntel.sectorRotation.rotationBias === 'BULLISH' ? '#00ff88' : marketIntel.sectorRotation.rotationBias === 'BEARISH' ? '#ff4d6d' : '#f59e0b'}">${marketIntel.sectorRotation.rotationSignal}</div>
          <div style="font-size:11px;color:#6b7a9a;">▲ ${marketIntel.sectorRotation.leading?.slice(0,2).join(', ')} | ▼ ${marketIntel.sectorRotation.lagging?.slice(0,2).join(', ')}</div>
        </div>` : ''}
        ${marketIntel.vwapBands ? `
        <div>
          <div style="font-size:9px;color:#4a5568;margin-bottom:3px;">VWAP Bands</div>
          <div style="font-size:12px;color:#e2e8f0;">${marketIntel.vwapBands.band1Dn?.toFixed(0)} — <strong style="color:#00e5ff">${marketIntel.vwapBands.vwap?.toFixed(0)}</strong> — ${marketIntel.vwapBands.band1Up?.toFixed(0)}</div>
          <div style="font-size:11px;color:${marketIntel.vwapBands.isExtended ? '#ff4d6d' : '#6b7a9a'};">${marketIntel.vwapBands.isExtended ? '⚠ EXTENDED' : marketIntel.vwapBands.bandPosition?.replace(/_/g,' ') || 'n/a'}</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="https://www.traidezone.ai/cockpit" style="display:inline-block;background:linear-gradient(135deg,#00d4a0,#00e5ff);color:#060810;font-size:13px;font-weight:800;padding:12px 32px;border-radius:8px;text-decoration:none;letter-spacing:1px;">→ OPEN COCKPIT</a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:10px;color:#2d3748;line-height:1.8;">
      <div>trAIde Zone · Your AI Trading Companion</div>
      <div style="margin-top:4px;">This is not financial advice. All trading involves risk.</div>
      <div style="margin-top:4px;"><a href="https://www.traidezone.ai" style="color:#00e5ff;text-decoration:none;">traidezone.ai</a></div>
    </div>

  </div>
</body>
</html>`
}

// ── Send via Resend ────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  return res.json()
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth check — cron or admin only
  const authHeader = req.headers.get('authorization')
  const CRON_SECRET = process.env.CRON_SECRET
  const isCron     = (!!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) || req.headers.get("x-vercel-cron") === "1"
  const isPreview  = req.nextUrl.searchParams.get('preview') === 'true'
  const isManual   = req.nextUrl.searchParams.get('send') === 'true'
  // Preview and manual send are public (URL-guarded), cron requires auth header
  if (!isCron && !isPreview && !isManual) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only run on weekdays
  const etDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  if (etDay === 0 || etDay === 6) return NextResponse.json({ status: 'weekend — skipped' })

  try {
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', month: 'short', day: 'numeric'
    })

    // 1. Get pre-market data
    const { prevClose, prevVix, patterns: dailyPatterns } = await getPreMarketData()

    // 2. Fetch market intelligence in parallel
    let marketIntelData: any = null
    try {
      const miRes = await fetch(`${req.nextUrl.origin}/api/market-intelligence`, {
        signal: AbortSignal.timeout(15000)
      })
      if (miRes.ok) marketIntelData = await miRes.json()
    } catch (e) { console.warn('[morning-brief] market intel fetch failed:', e) }

    // 3. Generate brief with full context
    // Note: daily candle patterns are detected inside getPreMarketData() independently
    const brief = await generateBrief(prevClose, prevVix, dailyPatterns || [], marketIntelData)

    // 3. Build subject line
    const subject = `trAIde Zone · ${today} · ${brief.macroBias} · AI: ${brief.todaysBias}`

    // 4. Build HTML
    const html = buildEmailHTML(brief, today, marketIntelData)

    if (isPreview && !isManual) {
      // Return HTML for preview without sending
      return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    }

    // 5. Send to admin (and eventually all active users)
    const result = await sendEmail(ADMIN_EMAIL, subject, html)

    // 6. Log to Supabase
    try {
      await supabaseAdmin.from('email_logs').insert({
        type:       'morning_brief',
        recipient:  ADMIN_EMAIL,
        subject,
        status:     result.id ? 'sent' : 'failed',
        resend_id:  result.id || null,
        brief_bias: brief.todaysBias,
        macro_bias: brief.macroBias,
        sent_at:    new Date().toISOString(),
      })
    } catch {} // non-critical — don't fail the send if logging fails

    return NextResponse.json({
      status:    result.id ? 'sent' : 'failed',
      to:        ADMIN_EMAIL,
      subject,
      resendId:  result.id,
      brief:     { macroBias: brief.macroBias, todaysBias: brief.todaysBias },
    })

  } catch (e: any) {
    console.error('[email/morning-brief]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
