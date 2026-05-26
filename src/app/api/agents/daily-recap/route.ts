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
import { auth } from '@clerk/nextjs/server'
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
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}` ||
                 req.headers.get('user-agent')?.includes('vercel-cron')

  // Cron mode: loop over all users with recent signals (no userId in body)
  if (isCron) {
    return runCronForAllUsers()
  }

  const { userId: uid } = await auth()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return runForUser(uid, req.url.includes('force=true'))
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

    return NextResponse.json({
      ok: true,
      recap,
      signalsAnalyzed: signals.length,
      saveStatus: saveErr ? 'failed' : 'ok',
    })
  } catch (e: any) {
    console.error('[daily-recap] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
