/**
 * /api/agents/learn-from-outcomes — Signal Outcome Learning Agent
 *
 * Analyzes historical scored signals to find what conditions actually predict
 * wins vs losses. Runs daily after market close.
 *
 * Learns from:
 * - context_snapshot fields (VIX regime, microstructure, patterns, flow)
 * - system_alignment (does diverging from the plan win or lose more?)
 * - Human vs AI outcome gap (where is the execution leaking?)
 * - WAIT signal accuracy
 *
 * Saves structured rules back to user_discovered_rules so the AI signal
 * prompt gets smarter with each day of trading.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  let userId: string | null = null
  if (isCron) {
    const body = await req.json().catch(() => ({}))
    userId = body.userId
  } else {
    const { userId: uid } = await auth()
    userId = uid
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: alerts, error } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, outcome, confidence, context_snapshot, ai_view, system_alignment, pts_to_t1, vix_at_signal, created_at, human_outcome, human_pts')
      .eq('user_id', userId)
      .neq('outcome', 'PENDING')
      .not('context_snapshot', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)
    if (!alerts?.length || alerts.length < 10) {
      return NextResponse.json({ status: 'insufficient_data', count: alerts?.length || 0, needed: 10 })
    }

    const parsed = alerts.map((a: any) => {
      let ctx: any = {}
      try { ctx = JSON.parse(a.context_snapshot || '{}') } catch (_e) { /* invalid JSON */ }
      return {
        signal: a.signal, outcome: a.outcome,
        won: a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2' || a.outcome_normalized === 'WIN',
        humanWon: a.human_outcome ? (a.human_outcome === 'HIT_T1' || a.human_outcome === 'HIT_T2') : null,
        humanPts: a.human_pts, aiPts: a.pts_to_t1,
        confidence: a.confidence, systemAlignment: a.system_alignment,
        vix: a.vix_at_signal, ...ctx,
      }
    })

    const wins   = parsed.filter((a: any) => a.won)
    const losses = parsed.filter((a: any) => !a.won && a.outcome !== 'EXPIRED')

    const feat = (field: string) => {
      const b: Record<string, { w: number; t: number }> = {}
      parsed.forEach((a: any) => {
        const v = String(a[field] ?? 'unknown')
        if (!b[v]) b[v] = { w: 0, t: 0 }
        b[v].t++
        if (a.won) b[v].w++
      })
      return Object.entries(b).filter(([, d]) => d.t >= 3)
        .sort((a, b) => b[1].t - a[1].t)
        .map(([v, d]) => `${v}: ${d.w}/${d.t} (${Math.round(d.w/d.t*100)}%)`).join(' | ') || 'insufficient data'
    }

    const boolFeat = (field: string, label: string) => {
      const items = parsed.filter((a: any) => a[field] === true)
      const w = items.filter((a: any) => a.won).length
      return items.length >= 3 ? `${label}: ${w}/${items.length} (${Math.round(w/items.length*100)}%)` : ''
    }

    const humanAlerts = parsed.filter((a: any) => a.humanPts != null)
    const total = parsed.length
    const matrix = {
      total, wins: wins.length, losses: losses.length,
      winRate: Math.round(wins.length / Math.max(1, total) * 100),
      byAlignment:      feat('systemAlignment'),
      byVix:            feat('vixRegime'),
      byDelta:          feat('deltaBias'),
      byOptions:        feat('optionsBias'),
      byDarkPool:       feat('darkPoolBias'),
      bySignal:         feat('signal'),
      avgWinConf:       wins.length ? Math.round(wins.reduce((s: number, a: any) => s + (a.confidence||0), 0) / wins.length) : null,
      avgLossConf:      losses.length ? Math.round(losses.reduce((s: number, a: any) => s + (a.confidence||0), 0) / losses.length) : null,
      humanVsAI:        humanAlerts.length >= 3
        ? `Human ${(humanAlerts.reduce((s: number, a: any)=>s+(a.humanPts||0),0)/humanAlerts.length).toFixed(1)}pts vs AI ${(humanAlerts.reduce((s: number, a: any)=>s+(a.aiPts||0),0)/humanAlerts.length).toFixed(1)}pts avg`
        : 'insufficient',
      // Market intelligence
      byTermShape:      feat('termShape'),
      byVwapPos:        feat('vwapBandPos'),
      vwapExtended:     boolFeat('vwapIsExtended', 'VWAP_extended'),
      vwapMeanRevert:   boolFeat('vwapIsMeanRevert', 'VWAP_meanrevert'),
      optionsCheap:     boolFeat('optionsCheap', 'IV_cheap'),
      optionsExp:       boolFeat('optionsExpensive', 'IV_expensive'),
      bySectorBias:     feat('sectorBias'),
      bySession:        feat('sessionName'),
      byThetaUrgency:   feat('thetaUrgency'),
      byPreMarket:      feat('preMarketConviction'),
      byDailyTrend:     feat('dailyTrend'),
      byWeeklyTrend:    feat('weeklyTrend'),
      byCandlePatterns: feat('candlePatterns'),
      // New mechanical / actionability features
      byMechBias:       feat('mechanicalBias'),
      byAsymmetric:     feat('asymmetricSetup'),
      bySetupType:      feat('setupType'),
      byActionability:  feat('actionabilityVerdict'),
      byCrossAsset:     feat('crossAssetBias'),
      byH1Trend:        feat('h1Trend'),
      byM15Trend:       feat('m15Trend'),
      byEconomic:       feat('economicBias'),
      byMultiTF:        feat('multiTFAlignment'),
      byHedgingDir:     feat('hedgingDirection'),
      byCharm:          feat('charmIntensity'),
      newsBlackouts:    boolFeat('newsBlackout', 'news_blackout'),
      poorLiquidity:    boolFeat('liquidityOk', 'liquidity_ok'),  // tracks both true and false outcomes
      avgGreenLights:   parsed.length > 0 ? (parsed.reduce((s: number, a: any) => s + (a.greenLightsCount || 0), 0) / parsed.length).toFixed(1) : null,
      avgRedFlags:      parsed.length > 0 ? (parsed.reduce((s: number, a: any) => s + (a.redFlagsCount || 0), 0) / parsed.length).toFixed(1) : null,
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
        messages: [{ role: 'user', content: `Analyze SPX intraday ITM options day trading signal outcomes. Find what predicts wins vs losses.

DATA (${total} signals, ${matrix.winRate}% win rate):

CORE STREAMS:
Alignment: ${matrix.byAlignment}
VIX regime: ${matrix.byVix}
Delta: ${matrix.byDelta}
Options flow: ${matrix.byOptions}
Dark pool: ${matrix.byDarkPool}
Signal direction: ${matrix.bySignal}
Confidence: winners ${matrix.avgWinConf}% vs losers ${matrix.avgLossConf}%

MARKET INTELLIGENCE:
VIX term shape: ${matrix.byTermShape}
VWAP band position: ${matrix.byVwapPos}
VWAP extended (2σ): ${matrix.vwapExtended}
VWAP mean-revert zone (1σ): ${matrix.vwapMeanRevert}
Options cheap (IV<RV): ${matrix.optionsCheap}
Options expensive (IV>RV): ${matrix.optionsExp}
Sector bias: ${matrix.bySectorBias}
Session: ${matrix.bySession}
Theta urgency: ${matrix.byThetaUrgency}
Pre-market conviction: ${matrix.byPreMarket}
Daily trend: ${matrix.byDailyTrend}
Weekly trend: ${matrix.byWeeklyTrend}
Candle patterns: ${matrix.byCandlePatterns}
Human vs AI execution: ${matrix.humanVsAI}

Extract 5-8 rules that predict outcomes. Only include if sample >= 3.
Return ONLY valid JSON, no markdown:
[{"rule":"short name","condition":"specific","winRate":75,"sampleSize":8,"action":"FAVOR"|"AVOID"|"BOOST_CONFIDENCE"|"REDUCE_CONFIDENCE","category":"stream"|"timing"|"technical"|"macro","insight":"why this works"}]` }],
      })
    })
    const aiData = await aiRes.json()
    const raw = aiData.content?.[0]?.text || '[]'
    const rules = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Save alongside existing rules (different source tag)
    // First get existing rules
    const { data: existing } = await supabaseAdmin
      .from('user_discovered_rules')
      .select('rules')
      .eq('user_id', userId)
      .single()

    // Merge: keep edge-discovery rules, add outcome_learning rules tagged
    const existingRules = (existing?.rules || []).filter((r: any) => r.source !== 'outcome_learning')
    const taggedRules = rules.map((r: any) => ({ ...r, source: 'outcome_learning' }))
    const mergedRules = [...existingRules, ...taggedRules]

    await supabaseAdmin.from('user_discovered_rules').upsert({
      user_id: userId,
      rules: mergedRules,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json({ status: 'complete', signals: parsed.length, winRate: matrix.winRate, rulesFound: rules.length, rules })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return POST(req) }
