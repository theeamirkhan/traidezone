/**
 * UsageReport — Daily AI utilization dashboard
 *
 * Shows in the cockpit as a collapsible panel (or full-screen modal).
 * Displays real data from:
 *  - Client-side usage tracker (always available)
 *  - Admin API if ANTHROPIC_ADMIN_KEY is configured (exact figures)
 *
 * Auto-refreshes daily. Accessible via header button.
 */
'use client'
import { useState, useEffect, useCallback } from 'react'
import { getUsageSummary, type UsageEntry } from '../agents/usageTracker'

const font = "'SF Mono','Fira Code',monospace"
const C = {
  bg:       '#080a0f',
  border:   'rgba(255,255,255,0.08)',
  teal:     '#00d4a0',
  yellow:   '#f59e0b',
  red:      '#ff4d6d',
  violet:   '#7c6aff',
  text:     '#f0f4ff',
  muted:    'rgba(255,255,255,0.45)',
  dim:      'rgba(255,255,255,0.2)',
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function Stat({ label, value, sub, color = C.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: font }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  signal:    '▶ Get Signal',
  companion: '💬 Chat',
  greeting:  '👋 Greeting',
  daily_ai:  '📰 Daily AI',
  memory:    '🧠 Memory',
  other:     '⚙ Other',
}

export default function UsageReport({ onClose }: { onClose: () => void }) {
  const [summary, setSummary]     = useState<any>(null)
  const [adminData, setAdminData] = useState<any>(null)
  const [loading, setLoading]     = useState(false)
  const [tab, setTab]             = useState<'today' | 'week' | 'month'>('today')

  const load = useCallback(async () => {
    setLoading(true)

    // Always load local tracker data immediately
    const local = getUsageSummary(tab === 'today' ? 1 : tab === 'week' ? 7 : 30)
    setSummary(local)

    // Try Admin API
    try {
      const res = await fetch('/api/agents/usage-report', {
        headers: { authorization: 'Bearer traidezone-cron' }
      })
      const data = await res.json()
      if (data.source === 'admin_api') setAdminData(data)
    } catch {}

    setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  const days   = tab === 'today' ? 1 : tab === 'week' ? 7 : 30
  const today  = summary?.today
  const period = summary?.period
  const byDate = summary?.byDate || {}
  const byModel= summary?.byModel || {}
  const byType = summary?.byType || {}

  const dateKeys  = Object.keys(byDate).sort().slice(-days)
  const maxCost   = Math.max(...dateKeys.map((d: string) => (byDate[d]?.cost as number) || 0), 0.001)
  const totalCost = adminData?.summary?.totalCost ?? today?.cost ?? 0
  const monthCost = adminData?.monthToDateCost ?? period?.totalCost ?? 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        style={{
          width: 580, maxHeight: '85vh', overflowY: 'auto',
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: 24, fontFamily: font,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, letterSpacing: 1 }}>AI UTILIZATION REPORT</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
              {adminData ? '✓ Anthropic Admin API' : '⚡ App-level estimates'} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.teal, cursor: 'pointer' }}>
              {loading ? '⟳' : '↻ Refresh'}
            </button>
            <button onClick={onClose} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {(['today', 'week', 'month'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1,
              border: `1px solid ${tab === t ? C.teal : C.border}`,
              background: tab === t ? 'rgba(0,212,160,0.1)' : 'transparent',
              color: tab === t ? C.teal : C.muted, cursor: 'pointer', fontFamily: font,
            }}>{t.toUpperCase()}</button>
          ))}
        </div>

        {/* Top stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <Stat
            label="TOTAL COST"
            value={`$${totalCost.toFixed(4)}`}
            sub={tab !== 'today' ? `$${(totalCost / days).toFixed(4)}/day avg` : 'today'}
            color={totalCost > 1 ? C.yellow : totalCost > 0.1 ? C.text : C.teal}
          />
          <Stat
            label="REQUESTS"
            value={String(tab === 'today' ? today?.requests || 0 : period?.totalRequests || 0)}
            sub={tab === 'today' ? 'today' : `${days} days`}
          />
          <Stat
            label="CACHE HIT RATE"
            value={`${period?.cacheHitRate || 0}%`}
            sub={`saved $${(period?.cacheSavings || 0).toFixed(4)}`}
            color={C.teal}
          />
          <Stat
            label="PROJ. MONTHLY"
            value={`$${period?.projectedMonthly?.toFixed(2) || '0.00'}`}
            sub="22 trading days"
            color={(period?.projectedMonthly || 0) > 50 ? C.red : (period?.projectedMonthly || 0) > 20 ? C.yellow : C.teal}
          />
        </div>

        {/* Month to date (if admin data) */}
        {adminData && (
          <div style={{ background: 'rgba(0,212,160,0.05)', border: `1px solid rgba(0,212,160,0.15)`, borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: C.teal, letterSpacing: 1, marginBottom: 6 }}>MONTH TO DATE (ADMIN API)</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div><span style={{ color: C.muted, fontSize: 9 }}>Token cost: </span><span style={{ color: C.text, fontSize: 11 }}>${monthCost.toFixed(4)}</span></div>
              <div><span style={{ color: C.muted, fontSize: 9 }}>Requests: </span><span style={{ color: C.text, fontSize: 11 }}>{adminData.summary?.totalRequests || 0}</span></div>
              <div><span style={{ color: C.muted, fontSize: 9 }}>Cache saved: </span><span style={{ color: C.teal, fontSize: 11 }}>${(adminData.summary?.cacheSavings || 0).toFixed(4)}</span></div>
            </div>
          </div>
        )}

        {/* Daily bar chart */}
        {dateKeys.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>DAILY COST</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dateKeys.slice(-7).map(date => {
                const d = byDate[date]
                const isToday = date === new Date().toISOString().split('T')[0]
                return (
                  <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 8, color: isToday ? C.teal : C.dim, width: 50, flexShrink: 0 }}>
                      {isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    </div>
                    <Bar value={d?.cost || 0} max={maxCost} color={isToday ? C.teal : C.violet} />
                    <div style={{ fontSize: 9, color: isToday ? C.teal : C.muted, width: 52, textAlign: 'right', flexShrink: 0 }}>
                      ${(d?.cost || 0).toFixed(4)}
                    </div>
                    <div style={{ fontSize: 8, color: C.dim, width: 30, textAlign: 'right', flexShrink: 0 }}>
                      {d?.requests || 0}req
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* By model */}
        {Object.keys(byModel).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>BY MODEL</div>
            {Object.entries(byModel).map(([model, stats]: [string, any]) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: model === 'Sonnet' ? C.violet : C.yellow, width: 60, flexShrink: 0 }}>{model}</div>
                <Bar value={stats.cost} max={Object.values(byModel).reduce((m: number, s: any) => Math.max(m, (s.cost as number) || 0), 0) as number} color={model === 'Sonnet' ? C.violet : C.yellow} />
                <div style={{ fontSize: 9, color: C.text, width: 52, textAlign: 'right', flexShrink: 0 }}>${stats.cost.toFixed(4)}</div>
                <div style={{ fontSize: 8, color: C.dim, width: 30, textAlign: 'right', flexShrink: 0 }}>{stats.requests}req</div>
              </div>
            ))}
          </div>
        )}

        {/* By call type */}
        {Object.keys(byType).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>BY CALL TYPE</div>
            {Object.entries(byType)
              .sort((a: any, b: any) => b[1].cost - a[1].cost)
              .map(([type, stats]: [string, any]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: C.text, width: 90, flexShrink: 0 }}>{TYPE_LABELS[type] || type}</div>
                  <Bar value={stats.cost} max={Object.values(byType).reduce((m: number, s: any) => Math.max(m, (s.cost as number) || 0), 0) as number} color={C.teal} />
                  <div style={{ fontSize: 9, color: C.text, width: 52, textAlign: 'right', flexShrink: 0 }}>${stats.cost.toFixed(4)}</div>
                  <div style={{ fontSize: 8, color: C.dim, width: 30, textAlign: 'right', flexShrink: 0 }}>{stats.requests}req</div>
                </div>
              ))}
          </div>
        )}

        {/* Data source note */}
        {!adminData && (
          <div style={{ background: 'rgba(124,106,255,0.06)', border: `1px solid rgba(124,106,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.violet, letterSpacing: 1, marginBottom: 8 }}>📊 ABOUT THIS DATA</div>
            <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
              Costs calculated from actual token counts in each API response — same data Anthropic bills from.<br/>
              Tracking starts from first use after today's page load. Historical data accumulates over time.<br/>
              <br/>
              For full billing history → <span style={{ color: C.text, cursor: 'pointer' }}
                onClick={() => window.open('https://platform.claude.com/cost', '_blank')}>
                platform.claude.com/cost ↗
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
