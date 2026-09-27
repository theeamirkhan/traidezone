/**
 * /api/alerts/high-prob — agent-readable feed of HIGH-PROBABILITY setup fires.
 * Built for Meta Muse (or any agent/automation) to poll via a Custom
 * Connector and push to the phone.
 *
 * "High probability" is mechanical, from the system's own measured stats:
 *   - setup engine fire (engine:'setup'), NOT gate-suppressed
 *   - measured hit rate >= minHitRate (default 60) with n >= minN (default
 *     10 decided) — small-sample 100%s do not qualify
 *   - risk-officer verdict CONFIRM (unless ?verdict=any)
 *   - fired within the last ?minutes (default 45)
 *
 * Auth (read-only feed, fail closed): requires ALERT_FEED_KEY env var;
 * pass ?key=... or Authorization: Bearer ...
 *
 * GET /api/alerts/high-prob?key=XXX&minutes=45&minHitRate=60&minN=10
 * → { asof, count, summary, alerts: [{ text, timeET, setup, direction,
 *     entry, t1, stop, contract, measuredHitRate, measuredN, verdict }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const KEY = process.env.ALERT_FEED_KEY
  if (!KEY) return NextResponse.json({ error: 'Feed not configured — set ALERT_FEED_KEY in Vercel env' }, { status: 503 })
  const given = req.nextUrl.searchParams.get('key')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (given !== KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const minutes    = Math.min(1440, parseInt(req.nextUrl.searchParams.get('minutes') || '45', 10) || 45)
  const minHitRate = parseInt(req.nextUrl.searchParams.get('minHitRate') || '60', 10) || 60
  const minN       = parseInt(req.nextUrl.searchParams.get('minN') || '10', 10) || 10
  const verdictReq = (req.nextUrl.searchParams.get('verdict') || 'confirm').toLowerCase()
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('trade_alerts')
    .select('logged_at, signal, confidence, entry_mid, stop_level, target1, context_snapshot')
    .gte('logged_at', cutoff)
    .order('logged_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const alerts = (data || []).flatMap(a => {
    let ctx: any = {}
    try { ctx = JSON.parse(a.context_snapshot || '{}') } catch { return [] }
    if (ctx.engine !== 'setup' || ctx.suppressed) return []
    if (a.signal !== 'LONG' && a.signal !== 'SHORT') return []
    const hr = ctx.measuredHitRate, n = ctx.measuredN
    if (typeof hr !== 'number' || typeof n !== 'number') return []
    if (hr < minHitRate || n < minN) return []
    const verdict = String(ctx.aiVerdict || '').toUpperCase()
    if (verdictReq === 'confirm' && verdict !== 'CONFIRM') return []
    const timeET = new Date(a.logged_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
    const c = ctx.recommendedContract
    const contract = c ? `SPX ${c.strike}${c.type === 'CALL' ? 'C' : 'P'} ${c.expiryLabel}` : null
    const entry = a.entry_mid != null ? Math.round(parseFloat(a.entry_mid)) : null
    const t1 = a.target1 != null ? Math.round(parseFloat(a.target1)) : null
    const stop = a.stop_level != null ? Math.round(parseFloat(a.stop_level)) : null
    return [{
      text: `${timeET} ET — ${ctx.setupName || ctx.setupId} ${a.signal}: measured ${hr}% (n=${n}), risk officer ${verdict || 'n/a'}. Entry ${entry}, T1 ${t1}, stop ${stop}${contract ? `, ${contract}` : ''}.`,
      timeET, setup: ctx.setupName || ctx.setupId, direction: a.signal,
      entry, t1, stop, contract,
      measuredHitRate: hr, measuredN: n, verdict: verdict || null,
      gexRegime: ctx.gexRegime ?? null, firedAt: a.logged_at,
    }]
  })

  return NextResponse.json({
    asof: new Date().toISOString(),
    windowMinutes: minutes,
    criteria: { minHitRate, minN, verdict: verdictReq },
    count: alerts.length,
    summary: alerts.length
      ? `${alerts.length} high-probability setup${alerts.length > 1 ? 's' : ''} in the last ${minutes} min: ` + alerts.map(x => `${x.setup} ${x.direction} (${x.measuredHitRate}%)`).join('; ')
      : `No high-probability setups in the last ${minutes} minutes.`,
    alerts,
  })
}
