/**
 * SessionLog — live intraday signal log ("recap during the day").
 *
 * Server-truth version of the old session-fires strip: polls trade_alerts
 * every 60s so it shows ALL engines (setup / llm / swing) with outcomes
 * updating live as the grader resolves them. Collapsed = one-line tally
 * strip; click to expand into the full recap-style table.
 */

'use client'

import { useEffect, useRef, useState } from 'react'

const P = {
  text: '#e8f0ff', soft: '#b0c4de', muted: '#7d8db0',
  green: '#00ff88', red: '#ff4d6d', yellow: '#ffb700',
  cyan: '#00e5ff', violet: '#7c6aff',
  line: 'rgba(255,255,255,0.07)', bg: 'rgba(8, 12, 24, 0.55)',
}

interface Row {
  id: string
  timeET: string
  loggedAt: number
  signal: string
  engine: string
  name: string
  confidence: number | null
  outcome: string
  note: string
  pts: number | null
}

function parseRows(alerts: any[]): Row[] {
  const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  return (alerts || [])
    .filter(a => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(a.logged_at)) === todayET)
    .map(a => {
      let ctx: any = {}
      try { ctx = JSON.parse(a.context_snapshot || '{}') } catch {}
      const engine = ctx.engine || (a.auto_fired ? 'llm' : 'manual')
      return {
        id: a.id,
        timeET: new Date(a.logged_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
        loggedAt: new Date(a.logged_at).getTime(),
        signal: a.signal || '?',
        engine,
        name: ctx.setupName || ctx.name || (engine === 'llm' ? 'AI signal' : engine === 'manual' ? 'manual' : ''),
        confidence: a.confidence ?? null,
        outcome: a.outcome || 'PENDING',
        note: a.outcome_note || '',
        pts: a.pts_to_t1 ?? null,
      }
    })
    .sort((a, b) => a.loggedAt - b.loggedAt)
}

export function SessionLog({ font, fontDisplay }: { font: string; fontDisplay: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [expanded, setExpanded] = useState(false)
  const timerRef = useRef<any>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/trade-alerts?days=2', { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .then(d => { if (d?.alerts) setRows(parseRows(d.alerts)) })
        .catch(() => {})
    }
    load()
    timerRef.current = setInterval(load, 60_000)
    return () => clearInterval(timerRef.current)
  }, [])

  if (!rows.length) return null

  const intraday = rows.filter(r => r.engine !== 'swing')
  const wins = intraday.filter(r => r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2').length
  const losses = intraday.filter(r => r.outcome === 'STOPPED_OUT').length
  const pending = intraday.filter(r => r.outcome === 'PENDING').length
  const scratch = intraday.length - wins - losses - pending
  const decided = wins + losses
  const hr = decided > 0 ? Math.round((wins / decided) * 100) : null

  const outcomeCell = (r: Row) => {
    if (r.outcome === 'PENDING') return <span style={{ color: P.muted }}>○ pending</span>
    if (r.outcome === 'HIT_T1' || r.outcome === 'HIT_T2') {
      return <span style={{ color: P.green, fontWeight: 700 }}>✓ {r.outcome === 'HIT_T2' ? 'T2' : 'T1'}{r.pts != null ? ` +${Math.abs(r.pts).toFixed(1)}pts` : ''}</span>
    }
    if (r.outcome === 'STOPPED_OUT') return <span style={{ color: P.red, fontWeight: 700 }}>✗ stopped{r.pts != null ? ` ${r.pts.toFixed(1)}pts` : ''}</span>
    return <span style={{ color: P.yellow }}>◐ {r.outcome.toLowerCase()}</span>
  }

  const engineBadge = (e: string) => {
    const map: Record<string, [string, string]> = {
      setup: ['⚡ SETUP', P.cyan], llm: ['AI', P.violet], swing: ['◈ SWING', P.violet], manual: ['MANUAL', P.muted],
    }
    const [label, color] = map[e] || [e.toUpperCase(), P.muted]
    return <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color, border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>{label}</span>
  }

  return (
    <div style={{
      margin: '0 10px 4px', background: P.bg, border: `1px solid ${P.line}`,
      borderRadius: 8, fontFamily: font, overflow: 'hidden',
    }}>
      {/* Tally strip — always visible, click to expand */}
      <div onClick={() => setExpanded(e => !e)} style={{
        padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', userSelect: 'none' as const,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: P.muted, fontFamily: fontDisplay, flexShrink: 0 }}>
          TODAY&apos;S SIGNALS ({intraday.length})
        </span>
        <span style={{ fontSize: 11, fontFamily: fontDisplay, fontWeight: 800 }}>
          <span style={{ color: P.green }}>{wins}W</span>
          <span style={{ color: P.muted }}>–</span>
          <span style={{ color: P.red }}>{losses}L</span>
          {scratch > 0 && <span style={{ color: P.yellow }}>–{scratch}S</span>}
          {pending > 0 && <span style={{ color: P.muted }}> · {pending} pending</span>}
        </span>
        {hr !== null && (
          <span style={{ fontSize: 11, fontFamily: fontDisplay, fontWeight: 800, color: hr >= 55 ? P.green : hr >= 45 ? P.yellow : P.red }}>
            {hr}% <span style={{ fontWeight: 400, fontSize: 9, color: P.muted }}>(n={decided})</span>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: P.muted }}>{expanded ? '▾ collapse' : '▸ expand log'}</span>
      </div>

      {/* Full log table */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${P.line}`, padding: '6px 12px 8px', maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '58px 74px 1fr 52px 44px 1.2fr', gap: '3px 10px', fontSize: 11, alignItems: 'baseline' }}>
            {rows.map(r => (
              <div key={r.id} style={{ display: 'contents' }}>
                <span style={{ color: P.muted, fontVariantNumeric: 'tabular-nums' }}>{r.timeET}</span>
                <span>{engineBadge(r.engine)}</span>
                <span style={{ color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note || r.name}>{r.name}</span>
                <span style={{ color: r.signal === 'LONG' ? P.green : r.signal === 'SHORT' ? P.red : P.muted, fontWeight: 700 }}>{r.signal}</span>
                <span style={{ color: P.soft, fontVariantNumeric: 'tabular-nums' }}>{r.confidence != null ? `${r.confidence}%` : '—'}</span>
                <span title={r.note}>{outcomeCell(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
