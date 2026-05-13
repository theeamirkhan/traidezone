/**
 * AgentStatus — shows live health of both agents in the cockpit header
 *
 * Displayed as a small indicator next to the LIVE badge.
 * Green dot = all systems OK
 * Yellow dot = warnings (price drift, API delays)
 * Red dot = errors (credits gone, price blocked)
 *
 * Clicking it runs an immediate health check and shows the full report.
 */
'use client'
import { useState, useEffect, useCallback } from 'react'

interface Check {
  name:    string
  status:  'ok' | 'warn' | 'error'
  message: string
  value?:  string | number
}

interface HealthResult {
  status:     'ok' | 'warn' | 'error'
  timestamp:  string
  durationMs: number
  checks:     Check[]
}

const STATUS_COLOR = {
  ok:    '#00d4a0',
  warn:  '#f59e0b',
  error: '#ff4d6d',
}

const STATUS_ICON = { ok: '●', warn: '●', error: '●' }

export default function AgentStatus() {
  const [health, setHealth]       = useState<HealthResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [expanded, setExpanded]   = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/health-check', {
        headers: { authorization: 'Bearer traidezone-cron' }
      })
      const data: HealthResult = await res.json()
      setHealth(data)
      setLastCheck(new Date())
    } catch {
      setHealth({
        status: 'error',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        checks: [{ name: 'Agent', status: 'error', message: 'Health check unreachable' }]
      })
    }
    setLoading(false)
  }, [])

  // Run on mount, then every 10 minutes
  useEffect(() => {
    runCheck()
    const interval = setInterval(runCheck, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [runCheck])

  const color  = health ? STATUS_COLOR[health.status] : 'rgba(255,255,255,0.2)'
  const dotStyle = {
    width: 7, height: 7, borderRadius: '50%', background: color,
    boxShadow: health?.status !== 'ok' ? `0 0 8px ${color}` : 'none',
    animation: health?.status === 'error' ? 'pulse 1s infinite' : 'none',
    display: 'inline-block', cursor: 'pointer', marginLeft: 4,
    transition: 'background 0.3s',
  } as React.CSSProperties

  if (!health) return (
    <span style={dotStyle} title="Checking system health..." onClick={runCheck} />
  )

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* Status dot */}
      <span
        style={dotStyle}
        title={`System ${health.status.toUpperCase()} — click for details`}
        onClick={() => setExpanded(p => !p)}
      />

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          position: 'fixed', top: 52, left: 120, zIndex: 9999,
          background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '10px 12px', width: 280,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          fontSize: 10, fontFamily: "'SF Mono','Fira Code',monospace",
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: '#00e5ff', letterSpacing: 1 }}>SYSTEM HEALTH</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={runCheck}
                disabled={loading}
                style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(0,229,255,0.3)', background: 'transparent', color: '#00e5ff', cursor: 'pointer' }}
              >
                {loading ? '⟳' : '↻ Refresh'}
              </button>
              <button
                onClick={() => setExpanded(false)}
                style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
              >✕</button>
            </div>
          </div>

          {health.checks.map((check, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6,
              padding: '5px 7px', borderRadius: 5,
              background: check.status !== 'ok' ? `${STATUS_COLOR[check.status]}11` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${check.status !== 'ok' ? STATUS_COLOR[check.status] + '33' : 'transparent'}`,
            }}>
              <span style={{ color: STATUS_COLOR[check.status], marginTop: 1, flexShrink: 0 }}>
                {check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✕'}
              </span>
              <div>
                <div style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 9 }}>{check.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 1 }}>{check.message}</div>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>
            Last check: {lastCheck?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {health.durationMs}ms
          </div>
        </div>
      )}
    </span>
  )
}
