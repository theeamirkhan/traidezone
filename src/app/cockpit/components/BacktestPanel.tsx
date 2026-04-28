/**
 * BacktestPanel — Historical AI Signal Backtest Dashboard
 *
 * Runs /api/agents/backtest to fetch 60/90/180 days of historical data
 * and shows what the AI signal would have done each day.
 */
'use client'
import { useState, useCallback } from 'react'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  bg: '#080a0f', border: 'rgba(255,255,255,0.08)',
  teal: '#00d4a0', yellow: '#ffb700', red: '#ff4d6d',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.2)', violet: '#7c6aff',
}
const OUTCOME_COLOR: Record<string, string> = {
  HIT_T2: '#00ff88', HIT_T1: '#00d4a0', EXPIRED: '#6b7a9a', STOPPED_OUT: '#ff4d6d',
}
const OUTCOME_ICON: Record<string, string> = {
  HIT_T2: '✅✅', HIT_T1: '✅', EXPIRED: '○', STOPPED_OUT: '❌',
}

function StatCard({ label, value, sub, color = C.text }: any) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
    </div>
  )
}

export default function BacktestPanel({ onClose }: { onClose: () => void }) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [days, setDays]       = useState(60)
  const [tab, setTab]         = useState<'summary' | 'log'>('summary')
  const [filter, setFilter]   = useState<'all' | 'LONG' | 'SHORT' | 'WAIT'>('all')

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res  = await fetch(`/api/agents/backtest?days=${days}`, {
        headers: { authorization: 'Bearer traidezone-cron' }
      })
      const json = await res.json()
      if (json.error) { setError(json.error) }
      else {
        setData(json)
        // Seed the edge profile directly to Supabase via userdata API
        const s = json.summary
        const bestDays = Object.entries(s.byDow||{}).filter(([,v]:any)=>v.total>=3&&v.rate>=55).sort((a:any,b:any)=>b[1].rate-a[1].rate).slice(0,3).map(([d])=>d)
        const bestVix = Object.entries(s.byVix||{}).filter(([,v]:any)=>v.total>=3).sort((a:any,b:any)=>b[1].rate-a[1].rate)[0]
        const vixLabel = bestVix ? (bestVix[0] as string).replace('Low<14','Low <14').replace('Normal14-20','Normal 14-20').replace('Elevated20-28','Elevated 20-28').replace('High>28','High >28') : null
        fetch('/api/userdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'edge_profile',
            data: {
              backtest_win_rate:   s.winRate,
              backtest_pf:         s.profitFactor,
              long_win_rate:       s.longWinRate,
              short_win_rate:      s.shortWinRate,
              best_days:           bestDays,
              best_vix_regime:     vixLabel,
              avg_win_mins:        s.avgWinMins,
              avg_loss_mins:       s.avgLossMins,
              backtest_days:       s.totalDays,
              backtest_date_range: s.dateRange ? `${s.dateRange.from} → ${s.dateRange.to}` : null,
            }
          })
        })
        .then(r => r.json())
        .then(d => console.log('[BacktestPanel] Edge profile saved:', d))
        .catch(e => console.warn('[BacktestPanel] Edge profile save failed:', e.message))
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [days])

  const s    = data?.summary
  const results: any[] = data?.results || []
  const filtered = filter === 'all' ? results : results.filter(r => r.signal === filter)
  const signaled = results.filter((r: any) => r.signal !== 'WAIT')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 920,
      background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 720, maxHeight: '90vh', overflowY: 'auto',
        background: C.bg, border: `1px solid rgba(255,183,0,0.3)`,
        borderRadius: 12, padding: 22, fontFamily: font,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, letterSpacing: 1 }}>🔬 AI SIGNAL BACKTEST</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
              Historical edge analysis — signal logic applied to exact VWAP/EMA/VIX data
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,183,0,0.4)', marginTop: 2 }}>
              ⚠ Options flow not available historically — defaults NEUTRAL. All other data is exact.
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 9, color: C.muted }}>Lookback:</div>
          {[30, 60, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              border: `1px solid ${days === d ? C.yellow : C.border}`,
              background: days === d ? 'rgba(255,183,0,0.1)' : 'transparent',
              color: days === d ? C.yellow : C.muted, cursor: 'pointer', fontFamily: font,
            }}>{d}D</button>
          ))}
          <button onClick={run} disabled={loading} style={{
            marginLeft: 'auto', padding: '6px 20px', borderRadius: 6, fontSize: 10, fontWeight: 700,
            border: `2px solid ${C.yellow}`, background: loading ? 'rgba(255,183,0,0.1)' : 'rgba(255,183,0,0.15)',
            color: C.yellow, cursor: loading ? 'default' : 'pointer', fontFamily: font, letterSpacing: 1,
          }}>
            {loading ? '⟳ Running...' : '▶ RUN BACKTEST'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: C.teal, fontSize: 10 }}>
            <div style={{ marginBottom: 8 }}>⟳ Fetching {days} days of historical SPX/VIX data from Polygon...</div>
            <div style={{ fontSize: 8, color: C.muted }}>3 API calls → reconstructing VWAP/EMA/PDH/PDL → scoring outcomes</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 12, fontSize: 9, color: C.red }}>
            {error}
          </div>
        )}

        {/* Results */}
        {data && !loading && s && (
          <>
            {/* Top stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16,
              padding: '14px', background: 'rgba(255,183,0,0.05)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 10 }}>
              <StatCard label="WIN RATE" value={`${s.winRate}%`}
                color={s.winRate >= 55 ? C.green : s.winRate >= 45 ? C.yellow : C.red}
                sub={`${signaled.length} signals`} />
              <StatCard label="PROFIT FACTOR" value={`${s.profitFactor}×`}
                color={s.profitFactor >= 1.5 ? C.green : s.profitFactor >= 1 ? C.yellow : C.red} />
              <StatCard label="AVG WIN" value={`+${s.avgPtsWon}pt`} color={C.green}
                sub={`${s.avgWinMins}min`} />
              <StatCard label="AVG LOSS" value={`-${s.avgPtsLost}pt`} color={C.red}
                sub={`${s.avgLossMins}min`} />
              <StatCard label="LONG WIN %" value={`${s.longWinRate}%`} color={C.green}
                sub={`${s.totalLongs} signals`} />
              <StatCard label="SHORT WIN %" value={`${s.shortWinRate}%`} color={C.violet}
                sub={`${s.totalShorts} signals`} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {(['summary', 'log'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '4px 14px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                  border: `1px solid ${tab === t ? C.yellow : C.border}`,
                  background: tab === t ? 'rgba(255,183,0,0.1)' : 'transparent',
                  color: tab === t ? C.yellow : C.muted, cursor: 'pointer', fontFamily: font,
                }}>{t.toUpperCase()}</button>
              ))}
            </div>

            {/* SUMMARY TAB */}
            {tab === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* By VIX */}
                <div>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>WIN RATE BY VIX REGIME</div>
                  {Object.entries(s.byVix).map(([k, v]: any) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 8, color: C.text, width: 110, flexShrink: 0 }}>
                        {k.replace('Low<14','Low <14').replace('Normal14-20','Normal 14-20').replace('Elevated20-28','Elevated 20-28').replace('High>28','High >28')}
                      </div>
                      <Bar value={v.rate} max={100} color={v.rate >= 55 ? C.green : v.rate >= 45 ? C.yellow : C.red} />
                      <div style={{ fontSize: 9, color: C.text, width: 38, textAlign: 'right', flexShrink: 0, fontFamily: fontDisplay }}>{v.rate}%</div>
                      <div style={{ fontSize: 8, color: C.dim, width: 32, flexShrink: 0 }}>{v.total}×</div>
                    </div>
                  ))}
                </div>

                {/* By Day of Week */}
                <div>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>WIN RATE BY DAY OF WEEK</div>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday'].filter(d => s.byDow[d]).map(d => {
                    const v = s.byDow[d]
                    return (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: C.text, width: 80, flexShrink: 0 }}>{d.substring(0,3)}</div>
                        <Bar value={v.rate} max={100} color={v.rate >= 55 ? C.green : v.rate >= 45 ? C.yellow : C.red} />
                        <div style={{ fontSize: 9, color: C.text, width: 38, textAlign: 'right', flexShrink: 0, fontFamily: fontDisplay }}>{v.rate}%</div>
                        <div style={{ fontSize: 8, color: C.dim, width: 32, flexShrink: 0 }}>{v.total}×</div>
                      </div>
                    )
                  })}
                </div>

                {/* By Hour */}
                {Object.keys(s.byHour).length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>WIN RATE BY ENTRY HOUR (ET)</div>
                    {Object.entries(s.byHour).sort((a,b) => a[0].localeCompare(b[0])).map(([h, v]: any) => (
                      <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: C.text, width: 60, flexShrink: 0 }}>{h} ET</div>
                        <Bar value={v.rate} max={100} color={v.rate >= 55 ? C.green : v.rate >= 45 ? C.yellow : C.red} />
                        <div style={{ fontSize: 9, color: C.text, width: 38, textAlign: 'right', flexShrink: 0, fontFamily: fontDisplay }}>{v.rate}%</div>
                        <div style={{ fontSize: 8, color: C.dim, width: 32, flexShrink: 0 }}>{v.total}×</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Key insights */}
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(0,212,160,0.05)', border: '1px solid rgba(0,212,160,0.15)' }}>
                  <div style={{ fontSize: 8, color: C.teal, letterSpacing: 1, marginBottom: 8 }}>💡 EDGE INSIGHTS</div>
                  {s.winRate > 55 && <div style={{ fontSize: 9, color: C.text, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>
                    System shows positive edge at {s.winRate}% win rate with {s.profitFactor}× profit factor
                  </div>}
                  {s.longWinRate > s.shortWinRate + 10 && <div style={{ fontSize: 9, color: C.text, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>
                    LONG signals win {s.longWinRate}% vs SHORT {s.shortWinRate}% — bullish bias confirmed by data
                  </div>}
                  {s.shortWinRate > s.longWinRate + 10 && <div style={{ fontSize: 9, color: C.text, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>
                    SHORT signals win {s.shortWinRate}% vs LONG {s.longWinRate}% — bearish bias showing edge
                  </div>}
                  {s.avgWinMins < s.avgLossMins - 10 && <div style={{ fontSize: 9, color: C.text, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>
                    Winners resolve in {s.avgWinMins}min vs losers in {s.avgLossMins}min — cutting losers too slow
                  </div>}
                  {s.profitFactor < 1 && <div style={{ fontSize: 9, color: C.red, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${C.red}` }}>
                    Profit factor below 1.0 — system losing money despite wins. Widen targets or tighten stops.
                  </div>}
                  <div style={{ fontSize: 8, color: 'rgba(255,183,0,0.4)', marginTop: 8 }}>
                    {s.dateRange.from} → {s.dateRange.to} · {s.totalDays} trading days · {s.signalDays} signals · {s.waitDays} WAIT days
                  </div>
                </div>
              </div>
            )}

            {/* LOG TAB */}
            {tab === 'log' && (
              <div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {(['all','LONG','SHORT','WAIT'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: '2px 10px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                      border: `1px solid ${filter === f ? C.teal : C.border}`,
                      background: filter === f ? 'rgba(0,212,160,0.1)' : 'transparent',
                      color: filter === f ? C.teal : C.muted, cursor: 'pointer', fontFamily: font,
                    }}>{f}</button>
                  ))}
                  <span style={{ fontSize: 8, color: C.dim, marginLeft: 'auto', alignSelf: 'center' }}>{filtered.length} days</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filtered.slice(0, 100).map((r: any) => (
                    <div key={r.date} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      borderRadius: 6, background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${r.signal === 'WAIT' ? C.border : (OUTCOME_COLOR[r.outcome] || C.border) + '30'}`,
                      borderLeft: `3px solid ${r.signal === 'WAIT' ? '#4a5568' : OUTCOME_COLOR[r.outcome] || C.border}`,
                    }}>
                      <div style={{ fontSize: 8, color: C.dim, width: 70, flexShrink: 0 }}>{r.date}</div>
                      <div style={{ fontSize: 8, color: C.dim, width: 24, flexShrink: 0 }}>{r.dayOfWeek.substring(0,3)}</div>
                      <div style={{ width: 44, flexShrink: 0 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: r.signal === 'LONG' ? 'rgba(0,255,136,0.12)' : r.signal === 'SHORT' ? 'rgba(255,77,109,0.12)' : 'rgba(74,85,104,0.2)',
                          color: r.signal === 'LONG' ? C.green : r.signal === 'SHORT' ? C.red : '#6b7a9a' }}>
                          {r.signal}
                        </span>
                      </div>
                      {r.signal !== 'WAIT' && <>
                        <div style={{ fontSize: 8, color: C.muted, width: 55, flexShrink: 0 }}>@ {r.entryPrice?.toFixed(0)}</div>
                        <div style={{ fontSize: 8, color: C.muted, width: 40, flexShrink: 0 }}>VIX {r.vix?.toFixed(0)}</div>
                        <div style={{ fontSize: 8, flexShrink: 0 }}>
                          <span style={{ color: r.vwapPos === 'ABOVE' ? C.green : C.red }}>{r.vwapPos?.substring(0,3)}</span>
                          <span style={{ color: C.dim }}> V </span>
                          <span style={{ color: r.emaPos === 'ABOVE' ? C.green : r.emaPos === 'BELOW' ? C.red : C.dim }}>{r.emaPos?.substring(0,3)}</span>
                          <span style={{ color: C.dim }}> E</span>
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 10 }}>{OUTCOME_ICON[r.outcome]}</span>
                          <span style={{ fontSize: 8, color: OUTCOME_COLOR[r.outcome], fontWeight: 700 }}>
                            {r.outcome === 'STOPPED_OUT' ? 'STOP' : r.outcome.replace('_',' ')}
                          </span>
                          <span style={{ fontSize: 8, color: r.ptsToT1 > 0 ? C.green : r.ptsToT1 < 0 ? C.red : C.dim }}>
                            {r.ptsToT1 > 0 ? '+' : ''}{r.ptsToT1}pt
                          </span>
                          <span style={{ fontSize: 7, color: C.dim }}>{r.outcomeMinutes}m</span>
                        </div>
                      </>}
                      {r.signal === 'WAIT' && (
                        <div style={{ fontSize: 7, color: C.dim }}>Mixed signals (VWAP: {r.vwapPos}, EMA: {r.emaPos})</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!data && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔬</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Select a lookback period and run the backtest</div>
            <div style={{ fontSize: 9, color: C.dim }}>
              Reconstructs VWAP, 200 EMA, PDH/PDL from exact historical data<br/>
              Applies your 10am entry rule + VWAP/EMA confluence signal<br/>
              Scores each day: +10pt T1, +25pt T2, -8pt stop, 90min window
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
