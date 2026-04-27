/**
 * AlertHistory — Trade Alert Outcome Tracker Dashboard
 * Shows logged alerts, their outcomes, and model performance analytics
 */
'use client'
import { useState, useEffect, useCallback } from 'react'
import { loadAlerts, computeAccuracy, getModelSuggestions, type TradeAlert, type AlertAccuracy } from '../agents/tradeAlertLogger'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  bg: '#080a0f', border: 'rgba(255,255,255,0.08)',
  teal: '#00d4a0', yellow: '#ffb700', red: '#ff4d6d',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.2)',
}

const OUTCOME_COLOR: Record<string, string> = {
  HIT_T2:      '#00ff88',
  HIT_T1:      '#00d4a0',
  PARTIAL:     '#ffb700',
  EXPIRED:     '#6b7a9a',
  STOPPED_OUT: '#ff4d6d',
  PENDING:     '#4a5568',
}
const OUTCOME_ICON: Record<string, string> = {
  HIT_T2: '✅✅', HIT_T1: '✅', PARTIAL: '〜', EXPIRED: '○', STOPPED_OUT: '❌', PENDING: '⏳',
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export default function AlertHistory({ onClose }: { onClose: () => void }) {
  const [accuracy, setAccuracy]       = useState<AlertAccuracy | null>(null)
  const [alerts, setAlerts]           = useState<TradeAlert[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [tab, setTab]                 = useState<'log' | 'analytics'>('log')
  const [loading, setLoading]         = useState(false)

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const logs = await loadAlerts(30, force)
      const acc  = computeAccuracy(logs)
      const sug  = getModelSuggestions(acc)
      setAlerts(logs.slice(0, 50))
      setAccuracy(acc)
      setSuggestions(sug)
    } catch (e) {
      console.error('AlertHistory refresh failed:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])  // eslint-disable-line

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 910,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 620, maxHeight: '88vh', overflowY: 'auto',
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20, fontFamily: font,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, letterSpacing: 1 }}>📋 TRADE ALERT LOG</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
              {accuracy?.total || 0} scored · {accuracy?.pending || 0} pending · last 30 days
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => refresh(true)} disabled={loading} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.teal, cursor: 'pointer' }}>{loading ? '⟳' : '↻'}</button>
            <button onClick={onClose} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Top stats */}
        {accuracy && accuracy.total > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '12px 14px',
            background: 'rgba(255,183,0,0.05)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 8 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>WIN RATE</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 900,
                color: accuracy.winRate >= 55 ? C.green : accuracy.winRate >= 45 ? C.yellow : C.red }}>
                {accuracy.winRate}%
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>T2 RATE</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 900, color: C.teal }}>{accuracy.t2Rate}%</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>PROFIT FACTOR</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 900,
                color: accuracy.profitFactor >= 1.5 ? C.green : accuracy.profitFactor >= 1 ? C.yellow : C.red }}>
                {accuracy.profitFactor}×
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>RECENT FORM</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4 }}>{accuracy.recentForm}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>AVG WIN</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 900, color: C.green, marginTop: 4 }}>+{accuracy.avgPtsWon}pt</div>
              <div style={{ fontSize: 8, color: C.red }}>-{accuracy.avgPtsLost}pt avg loss</div>
            </div>
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

        {/* Alert log */}
        {tab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 10 }}>
                No alerts logged yet. Alerts are automatically logged each time you Get Signal with a LONG or SHORT result.
              </div>
            ) : alerts.map(alert => (
              <div key={alert.id} style={{
                padding: '9px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${OUTCOME_COLOR[alert.outcome] || C.border}22`,
                borderLeft: `3px solid ${OUTCOME_COLOR[alert.outcome] || C.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12 }}>{OUTCOME_ICON[alert.outcome]}</span>
                    <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 900,
                      color: alert.signal === 'LONG' ? C.green : C.red }}>
                      {alert.signal}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700,
                      color: alert.signal === 'LONG' ? C.green : C.red,
                      background: alert.signal === 'LONG' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,109,0.1)',
                      padding: '1px 6px', borderRadius: 3 }}>
                      {alert.signal === 'LONG' ? '📞 CALL' : '📉 PUT'}
                    </span>
                    <span style={{ fontSize: 8, color: C.muted }}>@ {alert.price_at_signal?.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, color: OUTCOME_COLOR[alert.outcome], fontWeight: 700 }}>
                      {alert.outcome.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 7, color: 'rgba(255,183,0,0.5)' }}>⏱ {alert.timeET} ET</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 5 }}>
                  {[
                    { label: 'Entry', value: `${alert.entry_low?.toFixed(0)}–${alert.entry_high?.toFixed(0)}`, color: '#00e5ff' },
                    { label: 'Stop',  value: alert.stop_level?.toFixed(0), color: C.red },
                    { label: 'T1',    value: alert.target1?.toFixed(0),   color: C.green },
                    { label: 'T2',    value: alert.target2?.toFixed(0),   color: C.teal },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: color + '0a', border: `1px solid ${color}25`, borderRadius: 5, padding: '4px 6px' }}>
                      <div style={{ fontSize: 6, color: C.muted, letterSpacing: 1 }}>{label}</div>
                      <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 900, color }}>{value}</div>
                    </div>
                  ))}
                </div>
                {alert.outcome_note && (
                  <div style={{ fontSize: 8, color: C.muted, fontStyle: 'italic' }}>{alert.outcome_note}</div>
                )}
                <div style={{ display: 'flex', gap: 8, fontSize: 7, color: C.dim, marginTop: 4 }}>
                  <span>Conf {alert.confidence}%</span>
                  <span>·</span>
                  <span>VIX {alert.vix_at_signal?.toFixed(1) || '?'}</span>
                  {alert.proximity_level && <><span>·</span><span style={{ color: C.yellow }}>Near {alert.proximity_level} {alert.proximity_breakout_pct}% BO</span></>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Analytics tab */}
        {tab === 'analytics' && accuracy && (
          <div>
            {/* Model suggestions */}
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(0,212,160,0.05)', border: '1px solid rgba(0,212,160,0.15)' }}>
              <div style={{ fontSize: 8, color: C.teal, letterSpacing: 1, marginBottom: 8 }}>💡 MODEL SUGGESTIONS</div>
              {suggestions.map((s, i) => (
                <div key={i} style={{ fontSize: 9, color: C.text, marginBottom: 5, paddingLeft: 10, borderLeft: '2px solid rgba(0,212,160,0.3)' }}>
                  {s}
                </div>
              ))}
            </div>

            {/* By confidence */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY CONFIDENCE</div>
              {Object.entries(accuracy.byConfidence).sort((a,b) => b[0].localeCompare(a[0])).map(([bucket, stats]) => (
                <div key={bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 8, color: C.text, width: 65, flexShrink: 0 }}>{bucket}%</div>
                  <MiniBar value={stats.rate} max={100} color={stats.rate >= 55 ? C.green : stats.rate >= 45 ? C.yellow : C.red} />
                  <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{stats.rate}%</div>
                  <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{stats.total}×</div>
                </div>
              ))}
            </div>

            {/* By VIX */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY VIX REGIME</div>
              {Object.entries(accuracy.byVix).filter(([,s]) => s.total > 0).map(([bucket, stats]) => (
                <div key={bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 8, color: C.text, width: 100, flexShrink: 0 }}>{bucket}</div>
                  <MiniBar value={stats.rate} max={100} color={stats.rate >= 55 ? C.green : stats.rate >= 45 ? C.yellow : C.red} />
                  <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{stats.rate}%</div>
                  <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{stats.total}×</div>
                </div>
              ))}
            </div>

            {/* By hour */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>WIN RATE BY HOUR (ET)</div>
              {Object.entries(accuracy.byHour).sort((a,b) => a[0].localeCompare(b[0])).map(([hour, stats]) => (
                <div key={hour} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 8, color: C.text, width: 65, flexShrink: 0 }}>{hour}</div>
                  <MiniBar value={stats.rate} max={100} color={stats.rate >= 55 ? C.green : stats.rate >= 45 ? C.yellow : C.red} />
                  <div style={{ fontSize: 9, width: 35, textAlign: 'right', color: C.text, flexShrink: 0 }}>{stats.rate}%</div>
                  <div style={{ fontSize: 8, color: C.dim, width: 30, flexShrink: 0 }}>{stats.total}×</div>
                </div>
              ))}
            </div>

            {accuracy.total === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 10 }}>
                Analytics populate after at least 5 scored alerts (scored 30–120 min after signal)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
