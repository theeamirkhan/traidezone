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
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const parsed = alerts.map(a => {
      let ctx: any = {}
      try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}
      return {
        signal: a.signal, outcome: a.outcome,
        won: a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2',
        humanWon: a.human_outcome ? (a.human_outcome === 'HIT_T1' || a.human_outcome === 'HIT_T2') : null,
        humanPts: a.human_pts, aiPts: a.pts_to_t1,
        confidence: a.confidence, systemAlignment: a.system_alignment,
        vix: a.vix_at_signal, ...ctx,
      }
    })

    const wins = parsed.filter(a => a.won)
    const losses = parsed.filter(a => !a.won && a.outcome !== 'EXPIRED')

    const feat = (field: string) => {
      const b: Record<string, { w: number; t: number }> = {}
      parsed.forEach(a => {
        const v = String((a as any)[field] || 'unknown')
        if (!b[v]) b[v] = { w: 0, t: 0 }
        b[v].t++
        if (a.won) b[v].w++
      })
      return Object.entries(b).filter(([, d]) => d.t >= 3)
        .map(([v, d]) => `${v}: ${d.w}/${d.t} (${Math.round(d.w/d.t*100)}%)`).join(' | ')
    }

    const humanAlerts = parsed.filter(a => a.humanPts != null)
    const matrix = {
      total: parsed.length, wins: wins.length, losses: losses.length,
      winRate: Math.round(wins.length / parsed.length * 100),
      byAlignment: feat('systemAlignment'), byVix: feat('vixRegime'),
      byDelta: feat('deltaBias'), byOptions: feat('optionsBias'),
      byDarkPool: feat('darkPoolBias'), bySignal: feat('signal'),
      avgWinConf: wins.length ? Math.round(wins.reduce((s, a) => s + (a.confidence||0), 0) / wins.length) : null,
      avgLossConf: losses.length ? Math.round(losses.reduce((s, a) => s + (a.confidence||0), 0) / losses.length) : null,
      humanVsAI: humanAlerts.length >= 3
        ? `Human ${(humanAlerts.reduce((s,a)=>s+(a.humanPts||0),0)/humanAlerts.length).toFixed(1)}pts avg vs AI ${(humanAlerts.reduce((s,a)=>s+(a.aiPts||0),0)/humanAlerts.length).toFixed(1)}pts avg`
        : 'insufficient',
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
      messages: [{ role: 'user', content: `Analyze trading signal outcomes. Find what predicts wins vs losses.

DATA (${parsed.length} scored signals, ${matrix.winRate}% win rate):
By alignment: ${matrix.byAlignment}
By VIX: ${matrix.byVix}
By delta: ${matrix.byDelta}
By options flow: ${matrix.byOptions}
By dark pool: ${matrix.byDarkPool}
By direction: ${matrix.bySignal}
Avg confidence: winners ${matrix.avgWinConf}% vs losers ${matrix.avgLossConf}%
Human vs AI: ${matrix.humanVsAI}

Extract 3-6 specific rules. Only include if sample >= 3.
Return ONLY valid JSON array, no markdown:
[{"rule":"short name","condition":"specific condition","winRate":75,"sampleSize":8,"action":"FAVOR"|"AVOID"|"BOOST_CONFIDENCE"|"REDUCE_CONFIDENCE","insight":"1 sentence"}]` }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const rules = JSON.parse(raw.replace(/```json|```/g, '').trim())

    await supabaseAdmin.from('user_discovered_rules').upsert({
      user_id: userId, source: 'outcome_learning',
      rules, updated_at: new Date().toISOString(),
      metadata: { signalCount: parsed.length, winRate: matrix.winRate, generatedAt: new Date().toISOString() }
    }, { onConflict: 'user_id,source' })

    return NextResponse.json({ status: 'complete', signals: parsed.length, winRate: matrix.winRate, rulesFound: rules.length, rules })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return POST(req) }
