/**
 * /api/agents/daily-recap — End-of-Day Recap Generator
 *
 * Runs after market close (4:30pm ET via cron). Analyzes today's signals,
 * compares to historical baseline, computes what was learned, and writes
 * a narrative recap stored in daily_recaps table.
 *
 * Structure:
 *   1. Performance — signals fired, win rate, biggest win, biggest loss
 *   2. Calibration today — predicted vs actual win rate for the day
 *   3. What worked — which features had edge today
 *   4. What failed — specific lessons from losing signals
 *   5. What's learned — concrete updates to profile/rules/weights
 *   6. Tomorrow's adjustments — what the system will do differently
 *
 * Designed to be honest. If no significant learning happened, says so.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const USE_HAIKU = true  // Recaps don't need Sonnet — Haiku is plenty

async function generateRecap(payload: any): Promise<any | null> {
  const model = USE_HAIKU ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

  const prompt = `You are writing an end-of-day trading recap for an SPX intraday options trader. The system fired signals today; you need to honestly assess what was learned.

TODAY'S DATA:
${JSON.stringify(payload, null, 2)}

WRITE A RECAP that is HONEST. If little was learned, say so. Don't fabricate insights.

Return JSON with this exact structure:
{
  "headline": "1 sentence summary of the day (e.g. 'Strong session: 4 of 6 signals hit T1+, day-type forecast was accurate')",
  "performanceSummary": "2-3 sentences on what happened with signal accuracy",
  "calibrationNote": "1-2 sentences on whether confidence levels matched outcomes today",
  "whatWorked": [
    "specific feature or pattern that had edge today, citing data"
  ],
  "whatFailed": [
    "specific feature or signal that failed today, citing data"
  ],
  "learnings": [
    "concrete observation that should change future signals (or empty array if nothing material)"
  ],
  "tomorrowAdjustments": [
    "specific behavioral change for tomorrow's signals (or empty array if no adjustments needed)"
  ],
  "didLearnSomething": true | false,
  "noLearningReason": "brief explanation if didLearnSomething is false"
}

Guidance:
- If only 1-2 signals fired today, learnings/adjustments should mostly be EMPTY — too small a sample to update behavior.
- If 5+ signals with mixed outcomes, real patterns emerge — be specific.
- If a STRONG correlation appears (e.g. all LONG breakouts hit T1, all SHORT fades failed), call it out.
- Cite specific data (TICK readings, VIX levels, day type, etc.) when making claims.
- For tomorrowAdjustments, be concrete: "Reduce confidence weight on options flow when VIX <16" not "be more careful with flow signals".
- HONESTY: if today was unremarkable, headline should reflect that. Don't manufacture drama.

Return only valid JSON. No commentary outside.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) {
      console.error('[daily-recap] AI error:', res.status)
      return null
    }

    const data = await res.json()
    const text = (data.content || []).map((c: any) => c.text || '').join('').replace(/```json|```/g, '').trim()

    try {
      return JSON.parse(text)
    } catch {
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try { return JSON.parse(text.substring(first, last + 1)) } catch { return null }
      }
      return null
    }
  } catch (e) {
    console.error('[daily-recap] generation failed:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  // Auth: same pattern as score-alerts — allow Vercel cron + internal calls
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`
  const origin = req.headers.get('origin') || req.headers.get('referer') || ''
  const isFromApp = origin.includes('traidezone.ai') || origin.includes('localhost')

  if (!isVercelCron && !isCronSecret && !isFromApp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron-driven: always loops over all users with signals today
  // (Single-user mode kept for future per-user manual triggering via query param)
  const url = new URL(req.url)
  const explicitUserId = url.searchParams.get('userId')
  const force = url.searchParams.get('force') === 'true'

  if (explicitUserId) {
    return runForUser(explicitUserId, force)
  }

  return runCronForAllUsers()
}

// Vercel cron sends GET — forward to POST handler logic
export async function GET(req: NextRequest) {
  return POST(req)
}

async function runCronForAllUsers(): Promise<NextResponse> {
  try {
    // Find all distinct users who fired at least one signal today
    const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    const todayET = etDateFmt.format(new Date())
    const startOfDayET = new Date(`${todayET}T09:00:00-05:00`).toISOString()

    const { data: activeUsers, error } = await supabaseAdmin
      .from('trade_alerts')
      .select('user_id')
      .gte('logged_at', startOfDayET)

    if (error) {
      console.error('[daily-recap/cron] user fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const userIds = Array.from(new Set((activeUsers || []).map(u => u.user_id))).filter(Boolean) as string[]
    console.log(`[daily-recap/cron] processing ${userIds.length} active users for ${todayET}`)

    const results = []
    for (const uid of userIds) {
      try {
        const res = await runForUser(uid, false)
        const json = await res.json()
        results.push({ userId: uid, ok: !!json.ok, signals: json.signalsAnalyzed || 0 })
      } catch (e: any) {
        results.push({ userId: uid, ok: false, error: e.message })
      }
    }

    return NextResponse.json({ ok: true, date: todayET, processed: results.length, results })
  } catch (e: any) {
    console.error('[daily-recap/cron] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function runForUser(userId: string, force: boolean): Promise<NextResponse> {
  try {
    // ── Get today's date in ET (handle weekends — recap previous trading day) ──
    const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    const todayET = etDateFmt.format(new Date())

    // Check if recap already exists for today
    const { data: existingRecap } = await supabaseAdmin
      .from('daily_recaps')
      .select('id')
      .eq('user_id', userId)
      .eq('recap_date', todayET)
      .maybeSingle()

    if (existingRecap && !force) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Recap already exists for today (use ?force=true to regenerate)' })
    }

    // ── Pull today's signals ──
    const startOfDayET = new Date(`${todayET}T09:00:00-05:00`).toISOString()  // 9am ET as start
    const { data: todaysSignals, error: sigErr } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, confidence, outcome, outcome_normalized, ai_view, system_alignment, context_snapshot, pts_to_t1, vix_at_signal, logged_at, entry_mid, stop_level, target1, outcome_note')
      .eq('user_id', userId)
      .gte('logged_at', startOfDayET)
      .order('logged_at', { ascending: true })

    if (sigErr) {
      console.error('[daily-recap] sig fetch error:', sigErr)
      return NextResponse.json({ error: sigErr.message }, { status: 500 })
    }

    const signals = todaysSignals || []

    // If no signals today, no recap to write
    if (signals.length === 0) {
      const noOpRecap = {
        headline: 'No signals fired today',
        performanceSummary: 'The system was online but conditions did not warrant signal generation. This is normal on low-volume or untradeable days.',
        calibrationNote: 'No signals to calibrate.',
        whatWorked: [],
        whatFailed: [],
        learnings: [],
        tomorrowAdjustments: [],
        didLearnSomething: false,
        noLearningReason: 'No signals fired — nothing to analyze',
      }
      await supabaseAdmin.from('daily_recaps').upsert({
        user_id: userId,
        recap_date: todayET,
        recap_data: noOpRecap,
        signals_count: 0,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,recap_date' })

      return NextResponse.json({ ok: true, recap: noOpRecap, signalsAnalyzed: 0 })
    }

    // ── Classify outcomes ──
    const classify = (a: any): 'WIN' | 'LOSS' | 'SCRATCH' | 'PENDING' | null => {
      if (a.outcome_normalized) return a.outcome_normalized as any
      if (['HIT_T1', 'HIT_T2'].includes(a.outcome)) return 'WIN'
      if (a.outcome === 'STOPPED_OUT') return 'LOSS'
      if (['PARTIAL', 'EXPIRED'].includes(a.outcome)) return 'SCRATCH'
      if (a.outcome === 'PENDING') return 'PENDING'
      return null
    }

    const scored = signals.map(s => ({ ...s, _class: classify(s) })).filter(s => s._class && s._class !== 'PENDING')
    const wins = scored.filter(s => s._class === 'WIN').length
    const losses = scored.filter(s => s._class === 'LOSS').length
    const scratches = scored.filter(s => s._class === 'SCRATCH').length
    const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null

    // ── Today's calibration ──
    const confidenceVsOutcome = scored.map(s => ({
      confidence: parseFloat(s.confidence || '0'),
      won: s._class === 'WIN',
    }))
    const highConf = confidenceVsOutcome.filter(c => c.confidence >= 70)
    const highConfWins = highConf.filter(c => c.won).length
    const highConfActual = highConf.length > 0 ? Math.round((highConfWins / highConf.length) * 100) : null

    // ── Feature accuracy today ──
    const featurePerformance: Record<string, { wins: number; total: number }> = {}
    scored.forEach(s => {
      if (s._class === 'SCRATCH') return
      const won = s._class === 'WIN'
      let ctx: any = {}
      try { ctx = JSON.parse(s.context_snapshot || '{}') } catch {}
      const signal = (s.signal || '').toUpperCase()

      const features = [
        { name: 'Mechanical bias',     val: ctx.mechanicalBias },
        { name: 'Asymmetric setup',    val: ctx.asymmetricSetup },
        { name: 'Day type',            val: ctx.dayType },
        { name: 'Actionability',       val: ctx.actionabilityVerdict },
        { name: 'Setup score ≥70',     val: ctx.setupScore >= 70 ? 'HIGH' : null },
        { name: 'Setup × Day match',   val: ctx.setupAlignsWithDayType ? 'YES' : null },
        { name: 'Plan alignment',      val: s.system_alignment },
      ]

      features.forEach(f => {
        if (!f.val) return
        const key = `${f.name}: ${f.val}`
        if (!featurePerformance[key]) featurePerformance[key] = { wins: 0, total: 0 }
        featurePerformance[key].total++
        if (won) featurePerformance[key].wins++
      })
    })
    const featureTodayStats = Object.entries(featurePerformance)
      .filter(([_, d]) => d.total >= 1)
      .map(([key, d]) => ({ feature: key, winRate: Math.round((d.wins / d.total) * 100), n: d.total }))

    // ── Compare profile to yesterday's snapshot ──
    const { data: profile } = await supabaseAdmin
      .from('trader_profiles')
      .select('strengths, weaknesses, edge_notes, stream_weights, patterns, last_updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    const profileUpdatedToday = profile?.last_updated_at
      ? etDateFmt.format(new Date(profile.last_updated_at)) === todayET
      : false

    // ── Check stream_weights changes ──
    const { data: yesterdayRecap } = await supabaseAdmin
      .from('daily_recaps')
      .select('recap_data')
      .eq('user_id', userId)
      .lt('recap_date', todayET)
      .order('recap_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Day type forecast today (was it accurate?) ──
    const dayTypePredicted = scored[0]?.context_snapshot
      ? (() => { try { return JSON.parse(scored[0].context_snapshot).dayType } catch { return null } })()
      : null

    // Compute actual day behavior — was it a trending or consolidating day?
    // Heuristic: if first vs last price >10pts move, trend; else consolidation
    const firstSignal = scored[0]
    const lastSignal = scored[scored.length - 1]
    const intradayMove = firstSignal && lastSignal && firstSignal.entry_mid && lastSignal.entry_mid
      ? Math.abs(parseFloat(lastSignal.entry_mid) - parseFloat(firstSignal.entry_mid))
      : null
    const actualDayType = intradayMove !== null
      ? intradayMove > 15 ? 'TREND' : intradayMove < 5 ? 'CONSOLIDATION' : 'MIXED'
      : null
    const dayTypeAccurate = dayTypePredicted && actualDayType && dayTypePredicted === actualDayType

    // ── Build payload for Claude ──
    const payload = {
      date: todayET,
      signalsToday: signals.length,
      signalsScored: scored.length,
      wins,
      losses,
      scratches,
      winRate,
      signals: signals.map(s => ({
        time: new Date(s.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
        signal: s.signal,
        confidence: s.confidence,
        outcome: s.outcome,
        outcomeClass: classify(s),
        outcomeNote: s.outcome_note,
        ptsToT1: s.pts_to_t1,
        systemAlignment: s.system_alignment,
        aiView: s.ai_view?.substring(0, 200),
      })),
      calibration: {
        highConfidenceSignals: highConf.length,
        highConfidenceActualWinRate: highConfActual,
        note: highConfActual !== null
          ? highConfActual >= 65 ? 'High-confidence signals delivered' :
            highConfActual >= 50 ? 'High-confidence mixed' : 'High-confidence underperformed'
          : 'Not enough high-confidence signals',
      },
      featurePerformanceToday: featureTodayStats,
      dayTypeForecast: {
        predicted: dayTypePredicted,
        actual: actualDayType,
        accurate: dayTypeAccurate,
      },
      profileUpdatedToday,
      currentStrengths: profile?.strengths?.slice(-3) || [],
      currentWeaknesses: profile?.weaknesses?.slice(-3) || [],
      recentEdgeNotes: profile?.edge_notes?.slice(-3) || [],
      topStreams: profile?.stream_weights
        ? Object.entries(profile.stream_weights)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, w]: any) => ({ name, weight: w.toFixed(2) }))
        : [],
      yesterdayHeadline: yesterdayRecap?.recap_data?.headline || null,
    }

    // ── Generate the narrative recap ──
    const recap = await generateRecap(payload)

    if (!recap) {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
    }

    // ── Save to daily_recaps table ──
    const { error: saveErr } = await supabaseAdmin.from('daily_recaps').upsert({
      user_id: userId,
      recap_date: todayET,
      recap_data: recap,
      signals_count: signals.length,
      wins,
      losses,
      win_rate: winRate,
      day_type_predicted: dayTypePredicted,
      day_type_actual: actualDayType,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,recap_date' })

    if (saveErr) {
      console.error('[daily-recap] save error:', saveErr)
      // Still return the recap even if save failed
    }

    // ── Send email recap ───────────────────────────────────────────────────
    let emailStatus = 'skipped'
    try {
      const emailHtml = buildRecapEmail({
        date: todayET,
        recap,
        signalsCount: signals.length,
        wins, losses, winRate,
        dayTypePredicted, actualDayType,
        signals,
      })
      const subject = `[trAIde Zone] EOD Recap ${todayET} · ${winRate !== null ? winRate + '%' : '—'} WR · ${signals.length} signals`

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'recap@traidezone.ai',
          to:   'theeamirkhan@gmail.com',
          subject,
          html: emailHtml,
        }),
      })
      const sendResult = await sendRes.json()

      if (!sendResult.id) {
        console.error('[daily-recap] Resend send failed:', JSON.stringify(sendResult))
      } else {
        console.log('[daily-recap] Email sent OK, Resend id:', sendResult.id)
      }

      try {
        await supabaseAdmin.from('email_logs').insert({
          type: 'daily_recap',
          recipient: 'theeamirkhan@gmail.com',
          subject,
          status:    sendResult.id ? 'sent' : 'failed',
          resend_id: sendResult.id || null,
          sent_at:   new Date().toISOString(),
        })
      } catch (_e) { /* log table may not exist for this user */ }

      emailStatus = sendResult.id ? 'sent' : `failed: ${sendResult.message || sendResult.error || 'unknown'}`
    } catch (emailErr: any) {
      console.error('[daily-recap] email send failed:', emailErr)
      emailStatus = 'error'
    }

    return NextResponse.json({
      ok: true,
      recap,
      signalsAnalyzed: signals.length,
      saveStatus: saveErr ? 'failed' : 'ok',
      emailStatus,
    })
  } catch (e: any) {
    console.error('[daily-recap] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email HTML Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildRecapEmail(p: {
  date: string
  recap: any
  signalsCount: number
  wins: number
  losses: number
  winRate: number | null
  dayTypePredicted: string | null
  actualDayType: string | null
  signals: any[]
}): string {
  const r = p.recap
  const wrColor = p.winRate === null ? '#6b7a9a' :
                  p.winRate >= 60 ? '#00ff88' :
                  p.winRate >= 50 ? '#00d4a0' :
                  p.winRate >= 40 ? '#f59e0b' : '#ff4d6d'
  const dayTypeAccurate = p.dayTypePredicted && p.actualDayType && p.dayTypePredicted === p.actualDayType

  const escape = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const renderList = (items: string[], color: string) => items.map(i =>
    `<li style="margin-bottom:6px;color:#b0c4de;">${escape(i)}</li>`
  ).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>EOD Recap ${p.date}</title>
</head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e0e8ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060810;padding:24px 12px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:linear-gradient(180deg,#0a0d18 0%,#060810 100%);border:1px solid rgba(0,229,255,0.18);border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:24px 28px 18px;border-bottom:1px solid rgba(0,229,255,0.08);">
          <div style="font-size:11px;letter-spacing:2px;color:#00e5ff;font-weight:700;margin-bottom:6px;text-transform:uppercase;">tr<span style="color:#00e5ff">AI</span>de Zone · End-of-Day Recap</div>
          <div style="font-size:13px;color:#6b7a9a;letter-spacing:1px;">${p.date}</div>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding:24px 28px 12px;">
          <div style="font-size:20px;font-weight:800;color:#f0f4ff;line-height:1.35;">${escape(r.headline || 'Daily Recap')}</div>
        </td></tr>

        <!-- KPI Grid -->
        <tr><td style="padding:8px 28px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="25%" align="center" style="padding:14px 8px;background:rgba(0,0,0,0.3);border-radius:6px;">
                <div style="font-size:10px;color:#4a5568;letter-spacing:1.5px;font-weight:700;">WIN RATE</div>
                <div style="font-size:28px;font-weight:800;color:${wrColor};margin-top:6px;line-height:1;">${p.winRate ?? '—'}%</div>
                <div style="font-size:10px;color:#6b7a9a;margin-top:4px;">${p.wins}W / ${p.losses}L</div>
              </td>
              <td width="4"></td>
              <td width="25%" align="center" style="padding:14px 8px;background:rgba(0,0,0,0.3);border-radius:6px;">
                <div style="font-size:10px;color:#4a5568;letter-spacing:1.5px;font-weight:700;">SIGNALS</div>
                <div style="font-size:28px;font-weight:800;color:#b0c4de;margin-top:6px;line-height:1;">${p.signalsCount}</div>
                <div style="font-size:10px;color:#6b7a9a;margin-top:4px;">fired today</div>
              </td>
              <td width="4"></td>
              <td width="25%" align="center" style="padding:14px 8px;background:rgba(0,0,0,0.3);border-radius:6px;">
                <div style="font-size:10px;color:#4a5568;letter-spacing:1.5px;font-weight:700;">DAY TYPE</div>
                <div style="font-size:14px;font-weight:800;color:#7c6aff;margin-top:8px;">${p.dayTypePredicted || '—'}</div>
                ${p.actualDayType ? `<div style="font-size:10px;color:${dayTypeAccurate ? '#00ff88' : '#f59e0b'};margin-top:2px;">${dayTypeAccurate ? '✓ accurate' : 'actual: ' + p.actualDayType}</div>` : ''}
              </td>
              <td width="4"></td>
              <td width="25%" align="center" style="padding:14px 8px;background:rgba(0,0,0,0.3);border-radius:6px;">
                <div style="font-size:10px;color:#4a5568;letter-spacing:1.5px;font-weight:700;">LEARNING</div>
                <div style="font-size:16px;font-weight:800;color:${r.didLearnSomething ? '#00ff88' : '#6b7a9a'};margin-top:8px;">${r.didLearnSomething ? 'YES' : 'NONE'}</div>
                <div style="font-size:10px;color:#6b7a9a;margin-top:2px;">${r.didLearnSomething ? 'updated' : 'stable'}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Performance summary -->
        ${r.performanceSummary ? `
        <tr><td style="padding:0 28px 16px;">
          <div style="font-size:11px;font-weight:700;color:#7c6aff;letter-spacing:1.5px;margin-bottom:8px;">PERFORMANCE</div>
          <div style="font-size:13px;color:#b0c4de;line-height:1.7;">${escape(r.performanceSummary)}</div>
        </td></tr>` : ''}

        <!-- Calibration -->
        ${r.calibrationNote ? `
        <tr><td style="padding:0 28px 16px;">
          <div style="background:rgba(0,229,255,0.04);padding:12px 14px;border-radius:6px;border:1px solid rgba(0,229,255,0.12);">
            <span style="font-size:11px;font-weight:700;color:#00e5ff;letter-spacing:1px;">CALIBRATION: </span>
            <span style="font-size:12px;color:#8899bb;">${escape(r.calibrationNote)}</span>
          </div>
        </td></tr>` : ''}

        <!-- What worked + What failed (stacked on email for compatibility) -->
        ${r.whatWorked && r.whatWorked.length > 0 ? `
        <tr><td style="padding:0 28px 12px;">
          <div style="background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.18);border-radius:6px;padding:12px 14px;">
            <div style="font-size:11px;font-weight:700;color:#00ff88;letter-spacing:1.5px;margin-bottom:8px;">✓ WHAT WORKED</div>
            <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;">${renderList(r.whatWorked, '#00ff88')}</ul>
          </div>
        </td></tr>` : ''}

        ${r.whatFailed && r.whatFailed.length > 0 ? `
        <tr><td style="padding:0 28px 12px;">
          <div style="background:rgba(255,77,109,0.05);border:1px solid rgba(255,77,109,0.18);border-radius:6px;padding:12px 14px;">
            <div style="font-size:11px;font-weight:700;color:#ff4d6d;letter-spacing:1.5px;margin-bottom:8px;">✗ WHAT FAILED</div>
            <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;">${renderList(r.whatFailed, '#ff4d6d')}</ul>
          </div>
        </td></tr>` : ''}

        <!-- Learnings -->
        ${r.didLearnSomething && r.learnings && r.learnings.length > 0 ? `
        <tr><td style="padding:0 28px 12px;">
          <div style="background:rgba(124,106,255,0.06);border:1px solid rgba(124,106,255,0.28);border-radius:6px;padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;color:#7c6aff;letter-spacing:1.5px;margin-bottom:8px;">WHAT IT LEARNED</div>
            <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.75;color:#e0e8ff;">${renderList(r.learnings, '#e0e8ff')}</ul>
          </div>
        </td></tr>` : ''}

        <!-- Tomorrow Adjustments -->
        ${r.tomorrowAdjustments && r.tomorrowAdjustments.length > 0 ? `
        <tr><td style="padding:0 28px 16px;">
          <div style="background:rgba(0,212,160,0.06);border:1px solid rgba(0,212,160,0.28);border-radius:6px;padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;color:#00d4a0;letter-spacing:1.5px;margin-bottom:8px;">TOMORROW THE SYSTEM WILL</div>
            <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.75;color:#e0e8ff;">${renderList(r.tomorrowAdjustments, '#e0e8ff')}</ul>
          </div>
        </td></tr>` : ''}

        <!-- Honest no-learning note -->
        ${!r.didLearnSomething && r.noLearningReason ? `
        <tr><td style="padding:0 28px 16px;">
          <div style="background:rgba(107,122,154,0.06);border:1px dashed rgba(107,122,154,0.3);border-radius:6px;padding:12px 14px;font-size:12px;color:#8899bb;font-style:italic;line-height:1.6;">
            No new learning applied: ${escape(r.noLearningReason)}
          </div>
        </td></tr>` : ''}

        <!-- Signals detail -->
        ${p.signals && p.signals.length > 0 ? `
        <tr><td style="padding:8px 28px 16px;">
          <div style="font-size:11px;font-weight:700;color:#4a5568;letter-spacing:1.5px;margin-bottom:8px;">TODAY'S SIGNALS</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.2);border-radius:6px;overflow:hidden;">
            ${p.signals.map((s: any, i: number) => {
              const time = new Date(s.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
              const outcomeIcon = ['HIT_T1', 'HIT_T2'].includes(s.outcome) ? '✓' :
                                  s.outcome === 'STOPPED_OUT' ? '✗' :
                                  s.outcome === 'PENDING' ? '○' : '~'
              const outcomeColor = ['HIT_T1', 'HIT_T2'].includes(s.outcome) ? '#00ff88' :
                                   s.outcome === 'STOPPED_OUT' ? '#ff4d6d' :
                                   s.outcome === 'PENDING' ? '#6b7a9a' : '#f59e0b'
              const sigColor = s.signal === 'LONG' ? '#00ff88' : s.signal === 'SHORT' ? '#ff4d6d' : '#7c6aff'
              return `
              <tr style="border-bottom:${i < p.signals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'};">
                <td style="padding:8px 12px;font-size:11px;color:#6b7a9a;width:60px;">${time}</td>
                <td style="padding:8px 6px;font-size:12px;font-weight:700;color:${sigColor};width:55px;">${s.signal || ''}</td>
                <td style="padding:8px 6px;font-size:11px;color:#8899bb;width:50px;">${s.confidence || ''}%</td>
                <td style="padding:8px 6px;font-size:14px;color:${outcomeColor};width:25px;text-align:center;">${outcomeIcon}</td>
                <td style="padding:8px 6px;font-size:10px;color:#8899bb;">${escape(s.outcome_note || s.outcome || '')}</td>
              </tr>`
            }).join('')}
          </table>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(0,229,255,0.06);">
          <div style="font-size:11px;color:#4a5568;letter-spacing:0.5px;line-height:1.7;">
            View full recap and trends in the <a href="https://traidezone.ai/cockpit" style="color:#00e5ff;text-decoration:none;">Learn tab</a>.
            <br>This is an automated email from your trAIde Zone system. Sent daily at 4:30pm ET.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
