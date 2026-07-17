/**
 * /api/setups/stats — measured per-setup hit rates from trade_alerts.
 *
 * The Setup Engine stamps every auto-fire with engine:'setup' + setupId
 * in context_snapshot. The existing score-alerts agent grades those rows
 * with the same strict T1-before-stop methodology as everything else.
 * This endpoint rolls the graded rows up:
 *
 *  GET  ?days=60                          → all setups, overall + per-gexRegime
 *  GET  ?days=60&setupId=X&gexRegime=Y    → single scoped stat (fire-time display)
 *
 * Grading convention (matches the shadow experiment):
 *   win     = HIT_T1 | HIT_T2
 *   loss    = STOPPED_OUT
 *   scratch = EXPIRED | PARTIAL → excluded from hit rate
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

interface SetupBucket {
  setupId: string
  n: number
  wins: number
  losses: number
  scratches: number
  pending: number
  hitRate: number | null
  lastFiredAt: string | null
  byRegime: Record<string, { n: number; wins: number; losses: number; hitRate: number | null }>
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = Math.min(365, parseInt(req.nextUrl.searchParams.get('days') || '60', 10) || 60)
  const filterSetup  = req.nextUrl.searchParams.get('setupId')
  const filterRegime = req.nextUrl.searchParams.get('gexRegime')
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('trade_alerts')
    .select('signal, outcome, context_snapshot, logged_at')
    .eq('user_id', userId)
    .eq('auto_fired', true)
    .gte('logged_at', cutoff)
    .order('logged_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const buckets: Record<string, SetupBucket> = {}
  let llmWins = 0, llmLosses = 0, llmN = 0   // comparison arm rollup

  for (const row of data || []) {
    let ctx: any = {}
    try { ctx = JSON.parse(row.context_snapshot || '{}') } catch {}

    const isWin     = row.outcome === 'HIT_T1' || row.outcome === 'HIT_T2'
    const isLoss    = row.outcome === 'STOPPED_OUT'
    const isPending = row.outcome === 'PENDING'
    const isScratch = !isWin && !isLoss && !isPending

    if (ctx.engine !== 'setup') {
      // Comparison arm: the LLM auto-signal (engine:'llm' or legacy unstamped)
      if (row.signal === 'LONG' || row.signal === 'SHORT') {
        llmN++
        if (isWin) llmWins++
        if (isLoss) llmLosses++
      }
      continue
    }

    const setupId = ctx.setupId || 'unknown'
    if (filterSetup && setupId !== filterSetup) continue
    const regime = ctx.gexRegime || 'unknown'
    if (filterRegime && regime !== filterRegime) continue

    if (!buckets[setupId]) {
      buckets[setupId] = {
        setupId, n: 0, wins: 0, losses: 0, scratches: 0, pending: 0,
        hitRate: null, lastFiredAt: null, byRegime: {},
      }
    }
    const b = buckets[setupId]
    b.n++
    if (!b.lastFiredAt) b.lastFiredAt = row.logged_at
    if (isWin) b.wins++
    else if (isLoss) b.losses++
    else if (isPending) b.pending++
    else b.scratches++

    if (!b.byRegime[regime]) b.byRegime[regime] = { n: 0, wins: 0, losses: 0, hitRate: null }
    const r = b.byRegime[regime]
    r.n++
    if (isWin) r.wins++
    if (isLoss) r.losses++
  }

  const finalize = (wins: number, losses: number) => {
    const decided = wins + losses
    return decided > 0 ? Math.round((wins / decided) * 100) : null
  }
  const setups = Object.values(buckets).map(b => {
    b.hitRate = finalize(b.wins, b.losses)
    for (const r of Object.values(b.byRegime)) r.hitRate = finalize(r.wins, r.losses)
    return b
  }).sort((a, b) => b.n - a.n)

  // Single scoped stat convenience (fire-time display line)
  if (filterSetup) {
    const b = setups[0] || null
    return NextResponse.json({
      ok: true,
      setupId: filterSetup,
      gexRegime: filterRegime || null,
      n: b ? b.wins + b.losses : 0,
      hitRate: b?.hitRate ?? null,
      totalFires: b?.n ?? 0,
    })
  }

  return NextResponse.json({
    ok: true,
    days,
    setups,
    comparisonArm: {
      engine: 'llm',
      n: llmWins + llmLosses,
      totalDirectional: llmN,
      hitRate: finalize(llmWins, llmLosses),
    },
  })
}
