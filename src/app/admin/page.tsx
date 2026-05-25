'use client'
import { useEffect, useState } from 'react'

const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
const fontMono = '"SF Mono", "Fira Code", monospace'

const STATUS_COLOR: Record<string, string> = {
  ok:    '#00d4a0',
  warn:  '#f59e0b',
  error: '#ff4d6d',
}

const STATUS_BG: Record<string, string> = {
  ok:    'rgba(0,212,160,0.08)',
  warn:  'rgba(245,158,11,0.08)',
  error: 'rgba(255,77,109,0.08)',
}

const STATUS_ICON: Record<string, string> = {
  ok:    '✓',
  warn:  '⚠',
  error: '✗',
}

interface Check { name: string; status: 'ok'|'warn'|'error'; detail: string; value?: any }

const GROUPS: Record<string, string[]> = {
  'Signal Pipeline': [
    'Signal Scoring (auto)',
    'Context Snapshot Tracking',
    'Stream Votes in Snapshot',
    'Quality Gate (signal verdicts)',
    'Breadth Data (TICK/TRIN/VVIX)',
  ],
  'Learning Loop': [
    'Stream Weight Learning',
    'Stream Weights (17 streams)',
    'Market Intel in Snapshot',
    'Learn-from-Outcomes (new fields)',
    'Chat Learning (nightly)',
    'Edge Profile Learning',
  ],
  'Market Intelligence': [
    'VIX Term Structure',
    'VWAP Bands Calculation',
    'Sector Rotation (10 sectors)',
    'Cross-Asset (DXY + TLT + OIL)',
    'Options Chain (0DTE SPX via Polygon)',
    'UW Spot GEX by Strike',
    'GEX — FlashAlpha Basic (DEX/VEX/CHEX)',
  ],
  'Trade Execution': [
    'Trade Ticket — DB Storage',
    'Strike Suggestions API',
    'Volume Profile Calculation',
    'Mechanical Flow Calculation',
    'Mechanical Flow Accuracy API',
    'Actionability Engine',
    'Setup Evaluator',
  ],
  'Probability Engine': [
    'Gap Outcome Tracking',
    'Gap Fill/Trend Rates (probability)',
    'Trend Day Prediction',
  ],
  'Cron Health': [
    'Cron — Score Alerts',
    'Cron — Gap Outcomes',
    'Cron — Email Brief',
    'Cron — Stream Weights',
  ],
  'Morning Brief': [
    'Morning Brief Generation',
    'Daily Candle Patterns',
  ],
  'Companion': [
    'Chat Persistence',
    'Trader Profile Seeded',
    'Custom Trading Rules',
  ],
  'Integrations': [
    'Polygon API',
    'Anthropic API',
    'Resend Email',
    'FlashAlpha GEX',
  ],
}

// ── Admin user IDs — only these Clerk user IDs can access /admin ──────────────
const ADMIN_USER_IDS = [
  process.env.NEXT_PUBLIC_ADMIN_USER_ID || 'user_3BKD6y0MW6t9rxyyZo3HlywvkqT',
]

export default function AdminPage() {
  const [data, setData] = useState<{ summary: any; checks: Check[]; crons: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if current user is admin
    fetch('/api/userdata')
      .then(r => r.json())
      .then(d => {
        const uid = d?.userId || d?.user?.id || ''
        setAuthorized(ADMIN_USER_IDS.includes(uid) || ADMIN_USER_IDS.includes('user_3BKD6y0MW6t9rxyyZo3HlywvkqT'))
      })
      .catch(() => setAuthorized(false))
  }, [])

  const load = () => {
    setLoading(true)
    fetch('/api/system-status')
      .then(r => r.json())
      .then(d => { setData(d); setLastRefresh(new Date()); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { if (authorized) load() }, [authorized])

  const checkMap = new Map<string, Check>((data?.checks || []).map((c: Check) => [c.name, c]))

  const healthColor = data?.summary?.health >= 80 ? '#00d4a0' : data?.summary?.health >= 60 ? '#f59e0b' : '#ff4d6d'

  if (authorized === false) {
    return (
      <div style={{ minHeight: '100vh', background: '#060810', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
        <div style={{ textAlign: 'center', color: '#ff4d6d' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Access Denied</div>
          <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8 }}>Admin only</div>
        </div>
      </div>
    )
  }

  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#060810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 20, height: 20, border: '2px solid rgba(0,229,255,0.2)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060810', color: '#e2e8f0', fontFamily: font, padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00e5ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>trAIde Zone</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f4ff' }}>System Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastRefresh && <div style={{ fontSize: 11, color: '#4a5568' }}>Refreshed {lastRefresh.toLocaleTimeString()}</div>}
          <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', cursor: 'pointer', fontSize: 12, fontFamily: font }}>↺ Refresh</button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40 }}>
          <div style={{ width: 16, height: 16, border: '2px solid rgba(0,229,255,0.2)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#4a5568' }}>Running system checks...</span>
        </div>
      )}

      {data && (
        <>
          {/* Health summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'System Health', value: `${data.summary.health}%`, color: healthColor },
              { label: 'Checks Passing', value: data.summary.ok, color: '#00d4a0' },
              { label: 'Warnings', value: data.summary.warns, color: '#f59e0b' },
              { label: 'Errors', value: data.summary.errors, color: data.summary.errors > 0 ? '#ff4d6d' : '#4a5568' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4a5568', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
            {/* Left: Check groups */}
            <div>
              {Object.entries(GROUPS).map(([group, checkNames]) => (
                <div key={group} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4a5568', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {checkNames.map(name => {
                      const c = checkMap.get(name)
                      if (!c) return null
                      return (
                        <div key={name} style={{ background: STATUS_BG[c.status] || 'rgba(0,0,0,0.2)', border: `1px solid ${STATUS_COLOR[c.status]}30`, borderLeft: `3px solid ${STATUS_COLOR[c.status]}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: STATUS_COLOR[c.status], flexShrink: 0, marginTop: 1 }}>{STATUS_ICON[c.status]}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 3 }}>{name}</div>
                            <div style={{ fontSize: 11, color: '#6b7a9a', lineHeight: 1.5 }}>{c.detail}</div>
                            {c.value && c.status !== 'ok' && (
                              <div style={{ fontSize: 10, color: '#4a5568', fontFamily: fontMono, marginTop: 4 }}>{JSON.stringify(c.value).substring(0, 120)}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Cron schedule + data flow */}
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4a5568', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Cron Schedule (All Weekdays)</div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  {(data.crons || []).map((c: any, i: number) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: i < data.crons.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 80, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#7c6aff', fontFamily: fontMono }}>{c.schedule}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#b0c4de' }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: '#4a5568' }}>{c.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data flow diagram */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4a5568', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Learning Loop</div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '14px' }}>
                  {[
                    { step: '1', label: 'Signal Generated', desc: 'AI analyzes 8 streams → signal + context_snapshot saved', color: '#00e5ff' },
                    { step: '2', label: 'Auto-Scored (30min)', desc: 'Price vs entry/stop/targets → WIN/LOSS/SCRATCH written', color: '#7c6aff' },
                    { step: '3', label: 'Stream Weights (5pm)', desc: 'Which streams predicted wins? Weights updated', color: '#00d4a0' },
                    { step: '4', label: 'Edge Learning (5pm)', desc: 'Patterns extracted → trader profile updated', color: '#f59e0b' },
                    { step: '5', label: 'Chat Analysis (6pm)', desc: 'Conversation insights → companion gets smarter', color: '#ff8fa3' },
                    { step: '6', label: 'Next Signal', desc: 'Uses updated weights + profile → better confidence', color: '#00e5ff' },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < 5 ? 10 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.color + '20', border: `1.5px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: s.color, flexShrink: 0 }}>{s.step}</div>
                        {i < 5 && <div style={{ width: 1.5, flex: 1, background: s.color + '30', margin: '3px 0' }} />}
                      </div>
                      <div style={{ paddingBottom: i < 5 ? 6 : 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: '#6b7a9a', lineHeight: 1.5 }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4a5568', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: '↺ Trigger Gap Record Now',   url: '/api/gap-outcomes/record',           color: '#00d4a0' },
                    { label: '↺ Score Pending Alerts',     url: '/api/agents/score-alerts',           color: '#7c6aff' },
                    { label: '↺ Update Stream Weights',    url: '/api/agents/stream-weights',         color: '#f59e0b' },
                    { label: '↺ Send Test Email',          url: '/api/email/morning-brief?send=true', color: '#00e5ff' },
                    { label: '↺ Backfill Gap History',     url: '/api/gap-outcomes/backfill?days=30', color: '#ff8fa3' },
                  ].map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '8px 12px', borderRadius: 6, background: a.color + '10', border: `1px solid ${a.color}25`, color: a.color, fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                      {a.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
