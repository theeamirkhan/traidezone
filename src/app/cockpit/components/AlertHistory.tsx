/**
 * AlertHistory — Trade Alert Outcome Tracker Dashboard
 * 
 * Reads from Supabase via /api/trade-alerts
 * Scored by server agent /api/agents/score-alerts (cron every 30min)
 */
'use client'
import { useState, useEffect, useCallback } from 'react'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  bg: '#080a0f', border: 'rgba(255,255,255,0.08)',
  teal: '#00d4a0', yellow: '#ffb700', red: '#ff4d6d',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.2)',
}

const OUTCOME_COLOR: Record<string, string> = {
  HIT_T2: '#00ff88', HIT_T1: '#00d4a0', PARTIAL: '#ffb700',
  EXPIRED: '#6b7a9a', STOPPED_OUT: '#ff4d6d', PENDING: '#4a5568',
}
const OUTCOME_ICON: Record<string, string> = {
  HIT_T2: '✅✅', HIT_T1: '✅', PARTIAL: '〜', EXPIRED: '○', STOPPED_OUT: '❌', PENDING: '⏳',
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
    </div>
  )
}

function computeAccuracy(alerts: any[]) {
  const scored = alerts.filter(a => a.outcome !== 'PENDING')
  const wins   = scored.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
  const t2s    = scored.filter(a => a.outcome === 'HIT_T2')
  const stops  = scored.filter(a => a.outcome === 'STOPPED_OUT')

  const avgWon  = wins.length  ? wins.reduce((s,a)  => s + Math.abs(a.pts_to_t1 || 0), 0) / wins.length  : 0
  const avgLost = stops.length ? stops.reduce((s,a) => s + Math.abs(a.pts_to_t1 || 0), 0) / stops.length : 0
  const pf      = avgLost > 0  ? avgWon / avgLost : wins.length > 0 ? 99 : 0

  // By confidence bucket
  const byConf: Record<string, {wins:number;total:number;rate:number}> = {}
  scored.forEach(a => {
    const b = a.confidence >= 80 ? '80-100' : a.confidence >= 65 ? '65-79' : a.confidence >= 50 ? '50-64' : '<50'
    if (!byConf[b]) byConf[b] = { wins:0, total:0, rate:0 }
    byConf[b].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byConf[b].wins++
  })
  Object.values(byConf).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins/b.total*100) : 0 })

  // By hour ET
  const byHour: Record<string, {wins:number;total:number;rate:number}> = {}
  scored.forEach(a => {
    const h = new Date(a.logged_at).toLocaleString('en-US', { hour:'numeric', hour12:true, timeZone:'America/New_York' })
    if (!byHour[h]) byHour[h] = { wins:0, total:0, rate:0 }
    byHour[h].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byHour[h].wins++
  })
  Object.values(byHour).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins/b.total*100) : 0 })

  // By VIX
  const byVix: Record<string, {wins:number;total:number;rate:number}> = {
    'Low (<14)':       {wins:0,total:0,rate:0},
    'Normal (14-20)':  {wins:0,total:0,rate:0},
    'Elevated (20-28)':{wins:0,total:0,rate:0},
    'High (>28)':      {wins:0,total:0,rate:0},
  }
  scored.forEach(a => {
    const v = a.vix_at_signal || 18
    const b = v < 14 ? 'Low (<14)' : v < 20 ? 'Normal (14-20)' : v < 28 ? 'Elevated (20-28)' : 'High (>28)'
    byVix[b].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byVix[b].wins++
  })
  Object.values(byVix).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins/b.total*100) : 0 })

  const last10 = scored.slice(-10)
  const l10w   = last10.filter(a => a.outcome==='HIT_T1'||a.outcome==='HIT_T2').length
  const form   = l10w >= 8 ? 'Hot 🔥' : l10w >= 6 ? 'Solid' : l10w >= 4 ? 'Struggling' : 'Cold ❄️'

  return {
    total: scored.length, pending: alerts.filter(a => a.outcome === 'PENDING').length,
    winRate: scored.length ? Math.round(wins.length/scored.length*100) : 0,
    t2Rate:  scored.length ? Math.round(t2s.length/scored.length*100) : 0,
    stopRate:scored.length ? Math.round(stops.length/scored.length*100) : 0,
    avgWon:  parseFloat(avgWon.toFixed(1)), avgLost: parseFloat(avgLost.toFixed(1)),
    profitFactor: parseFloat(pf.toFixed(2)),
    byConf, byHour, byVix, recentForm: form,
  }
}

function getSuggestions(acc: any, total: number): string[] {
  if (total < 5) return ['Need at least 5 scored alerts — keep trading']
  const s: string[] = []
  const hc = acc.byConf['80-100']
  if (hc?.total >= 3 && hc.rate < 50) s.push(`High confidence (80%+) only winning ${hc.rate}% — AI is over-confident, scrutinize those setups`)
  const el = acc.byVix['Elevated (20-28)']
  if (el?.total >= 3 && el.rate < 35) s.push(`Win rate ${el.rate}% when VIX 20-28 — reduce size or skip in elevated VIX`)
  if (acc.profitFactor < 1.0 && total >= 8) s.push(`Profit factor ${acc.profitFactor} — losers outsize winners, widen targets or tighten stops`)
  else if (acc.profitFactor > 2.5) s.push(`Profit factor ${acc.profitFactor} — strong edge confirmed, trust the signals`)
  if (acc.recentForm === 'Cold ❄️') s.push('Last 10 signals cold — reduce size until form returns')
  else if (acc.recentForm === 'Hot 🔥') s.push('Last 10 signals hot — edge is confirmed, trade with conviction')
  return s.length ? s : ['Accuracy solid — no major adjustments needed']
}

export default function AlertHistory({ onClose }: { onClose: () => void }) {
  const [alerts, setAlerts]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<'log' | 'analytics'>('log')
  const [migrating, setMigrating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/trade-alerts?days=30')
      const data = await res.json()
      if (data.needsMigration) {
        // Table doesn't exist — create it
        setMigrating(true)
        const migRes = await fetch('/api/trade-alerts/migrate')
        const mig = await migRes.json()
        setMigrating(false)
        if (mig.ready || mig.status?.includes('exists')) {
          setAlerts([])
        } else {
          setError(`Table setup needed. Open Supabase SQL Editor and run:\n\n${mig.sql?.substring(0, 200)}...`)
        }
      } else if (data.error) {
        setError(data.error)
      } else {
        setAlerts(data.alerts || [])
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  const runScoringNow = async () => {
    await fetch('/api/agents/score-alerts', { headers: { authorization: 'Bearer traidezone-cron' } })
    await load()
  }

  useEffect(() => { load() }, [load])

  const acc  = computeAccuracy(alerts)
  const sug  = getSuggestions(acc, acc.total)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 910,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 640, maxHeight: '88vh', overflowY: 'auto',
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20, fontFamily: font,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, letterSpacing: 1 }}>📋 TRADE ALERT LOG</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
              {loading ? 'Loading...' : `${acc.total} scored · ${acc.pending} pending · Supabase · scored every 30min by agent`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={runScoringNow} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: `1px solid rgba(255,183,0,0.3)`, background: 'rgba(255,183,0,0.07)', color: C.yellow, cursor: 'pointer' }}>⚡ Score Now</button>
            <button onClick={load} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.teal, cursor: 'pointer' }}>↻ Refresh</button>
            <button onClick={onClose} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Migration / loading states */}
        {migrating && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.2)', marginBottom: 12, fontSize: 10, color: C.teal }}>
            ⟳ Creating trade_alerts table in Supabase...
          </div>
        )}
        {error && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 12, fontSize: 9, color: C.red, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        {/* Top stats */}
        {acc.total > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '12px 14px',
            background: 'rgba(255,183,0,0.05)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 8 }}>
            {[
              { label: 'WIN RATE', value: `${acc.winRate}%`, color: acc.winRate >= 55 ? C.green : acc.winRate >= 45 ? C.yellow : C.red },
              { label: 'T2 RATE', value: `${acc.t2Rate}%`, color: C.teal },
              { label: 'PROFIT FACTOR', value: `${acc.profitFactor}×`, color: acc.profitFactor >= 1.5 ? C.green : acc.profitFactor >= 1 ? C.yellow : C.red },
              { label: 'AVG WIN', value: `+${acc.avgWon}pt`, color: C.green },
              { label: 'RECENT FORM', value: acc.recentForm, color: C.text },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: fontDisplay, fontSize: label === 'RECENT FORM' ? 11 : 18, fontWeight: 900, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {(['log', 'analytics'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '4px 14px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1,
              border: `1px solid ${tab === t ? C.yellow : C.border}`,
              background: tab === t ? 'rgba(255,183,0,0.1)' : 'transparent',
              color: tab === t ? C.yellow : C.muted, cursor: 'pointer', fontFamily: font,
            }}>{t.toUpperCase()}</button>
          ))}
        </div>

        {/* LOG TAB */}
        {tab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 10 }}>Loading from Supabase...</div>
            ) : alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 10 }}>
                No alerts logged yet.<br/>
                <span style={{ fontSize: 9, color: C.dim }}>Alerts auto-log each time Get Signal returns LONG or SHORT.</span>
              </div>
            ) : alerts.map(a => (
              <div key={a.id} style={{
                padding: '9px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${(OUTCOME_COLOR[a.outcome]||C.border)}22`,
                borderLeft: `3px solid ${OUTCOME_COLOR[a.outcome]||C.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12 }}>{OUTCOME_ICON[a.outcome]}</span>
                    <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 900,
                      color: a.signal === 'LONG' ? C.green : C.red }}>{a.signal}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: a.signal === 'LONG' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,109,0.1)',
                      color: a.signal === 'LONG' ? C.green : C.red }}>
                      {a.signal === 'LONG' ? '📞 CALL' : '📉 PUT'}
                    </span>
                    <span style={{ fontSize: 8, color: C.muted }}>@ {parseFloat(a.price_at_signal||0).toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, color: OUTCOME_COLOR[a.outcome], fontWeight: 700 }}>
                      {a.outcome.replace('_',' ')}
                    </span>
                    <span style={{ fontSize: 7, color: 'rgba(255,183,0,0.5)' }}>
                      ⏱ {new Date(a.logged_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'})} ET
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 5 }}>
                  {[
                    { label: 'Entry', value: `${parseFloat(a.entry_low||0).toFixed(0)}–${parseFloat(a.entry_high||0).toFixed(0)}`, color: '#00e5ff' },
                    { label: 'Stop',  value: parseFloat(a.stop_level||0).toFixed(0), color: C.red },
                    { label: 'T1',    value: parseFloat(a.target1||0).toFixed(0), color: C.green },
                    { label: 'T2',    value: parseFloat(a.target2||0).toFixed(0), color: C.teal },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: color+'0a', border: `1px solid ${color}25`, borderRadius: 5, padding: '4px 6px' }}>
                      <div style={{ fontSize: 6, color: C.muted, letterSpacing: 1 }}>{label}</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 900, color }}>{value}</div>
                    </div>
                  ))}
                </div>
                {a.outcome_note && (
                  <div style={{ fontSize: 8, color: C.muted, fontStyle: 'italic', marginBottom: 3 }}>{a.outcome_note}</div>
                )}
                <div style={{ display: 'flex', gap: 8, fontSize: 7, color: C.dim }}>
                  <span>Conf {a.confidence}%</span>
                  <span>·</span>
                  <span>VIX {parseFloat(a.vix_at_signal||0).toFixed(1)}</span>
                  {a.pts_to_t1 != null && <><span>·</span><span style={{ color: a.pts_to_t1 > 0 ? C.green : C.red }}>{a.pts_to_t1 > 0 ? '+' : ''}{a.pts_to_t1}pts</span></>}
                  {a.proximity_level && <><span>·</span><span style={{ color: C.yellow }}>Near {a.proximity_level} {a.proximity_breakout_pct}% BO</span></>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <div>
            {/* Suggestions */}
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(0,212,160,0.05)', border: '1px solid rgba(0,212,160,0.15)' }}>
              <div style={{ fontSize: 8, color: C.teal, letterSpacing: 1, marginBottom: 8 }}>💡 MODEL SUGGESTIONS</div>
              {sug.map((s, i) => (
                <div key={i} style={{ fontSize: 9, color: C.text, marginBottom: 5, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>{s}</div>
              ))}
            </div>

            {acc.total === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 10 }}>
                Analytics populate after at least 5 scored alerts
              </div>
            ) : (
              <>
                {/* By confidence */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY CONFIDENCE</div>
                  {Object.entries(acc.byConf).sort((a,b) => b[0].localeCompare(a[0])).map(([bucket, s]: any) => (
                    <div key={bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 8, color: C.text, width: 65, flexShrink: 0 }}>{bucket}%</div>
                      <MiniBar value={s.rate} max={100} color={s.rate >= 55 ? C.green : s.rate >= 45 ? C.yellow : C.red} />
                      <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{s.rate}%</div>
                      <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{s.total}×</div>
                    </div>
                  ))}
                </div>

                {/* By VIX */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY VIX REGIME</div>
                  {Object.entries(acc.byVix).filter(([,s]: any) => s.total > 0).map(([bucket, s]: any) => (
                    <div key={bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 8, color: C.text, width: 100, flexShrink: 0 }}>{bucket}</div>
                      <MiniBar value={s.rate} max={100} color={s.rate >= 55 ? C.green : s.rate >= 45 ? C.yellow : C.red} />
                      <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{s.rate}%</div>
                      <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{s.total}×</div>
                    </div>
                  ))}
                </div>

                {/* By hour */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY HOUR (ET)</div>
                  {Object.entries(acc.byHour).sort((a,b) => a[0].localeCompare(b[0])).map(([hour, s]: any) => (
                    <div key={hour} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 8, color: C.text, width: 65, flexShrink: 0 }}>{hour}</div>
                      <MiniBar value={s.rate} max={100} color={s.rate >= 55 ? C.green : s.rate >= 45 ? C.yellow : C.red} />
                      <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{s.rate}%</div>
                      <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{s.total}×</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
