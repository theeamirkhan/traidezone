'use client'
/**
 * ShadowValidationStream — Phase 2B
 *
 * Visualizes data from /api/shadow-predictions/stats
 *
 * Six panels:
 *   1. Header + maturity gauge
 *   2. Win rates per horizon (30/60/90 min)
 *   3. Signal type breakdown (LONG / SHORT / WAIT)
 *   4. Calibration curve (predicted confidence vs actual win rate per band)
 *   5. Recent predictions feed
 *   6. Diagnostic footer (pending, totals, last update)
 */

import { useState, useEffect } from 'react'

interface ShadowStats {
  total: number
  pending: number
  graded30: number
  graded60: number
  graded90: number
  winRates: {
    h30m: { sample: number; wins: number; losses: number; scratches: number; winRate: number | null }
    h60m: { sample: number; wins: number; losses: number; scratches: number; winRate: number | null }
    h90m: { sample: number; wins: number; losses: number; scratches: number; winRate: number | null }
  }
  calibration: {
    h30m: Array<{ range: string; predicted: number; actual: number | null; sample: number; gap: number | null }>
    h60m: Array<{ range: string; predicted: number; actual: number | null; sample: number; gap: number | null }>
    h90m: Array<{ range: string; predicted: number; actual: number | null; sample: number; gap: number | null }>
  }
  signalBreakdown: Array<{ signal: string; total: number; graded: number; winRate: number | null }>
  recent: Array<any>
  readyForAnalysis: boolean
  dataMaturity: string
}

const C = {
  cyan:     '#00e5ff',
  green:    '#00ff88',
  red:      '#ff4d6d',
  yellow:   '#f59e0b',
  purple:   '#7c6aff',
  blue:     '#3b82f6',
  muted:    '#6b7a9a',
  text:     '#e2e8f0',
  dim:      '#4a5568',
  bg:       'rgba(0,0,0,0.3)',
  border:   'rgba(255,255,255,0.06)',
}

export function ShadowValidationStream({ font, fontDisplay }: { font: string; fontDisplay: string }) {
  const [stats, setStats]       = useState<ShadowStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [selectedHorizon, setSelectedHorizon] = useState<'h30m' | 'h60m' | 'h90m'>('h60m')

  const load = () => {
    fetch('/api/shadow-predictions/stats')
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error)
        } else {
          setStats(d)
          setError(null)
        }
        setLoading(false)
        setLastFetch(new Date())
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 60000)  // refresh every 60s
    return () => clearInterval(iv)
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
        Loading shadow stream…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 16, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, color: C.red, fontSize: 12 }}>
        <strong>Shadow stream error:</strong> {error}
      </div>
    )
  }

  if (!stats) return null

  const maturityColor =
    stats.dataMaturity.startsWith('EARLY')        ? C.yellow :
    stats.dataMaturity.startsWith('EMERGING')     ? C.blue :
    stats.dataMaturity.startsWith('INTERPRETABLE') ? C.cyan :
    C.green

  const maturityProgress = Math.min(100, Math.round((stats.graded60 / 100) * 100))

  return (
    <div style={{ marginBottom: 18 }}>
      {/* ═══ HEADER + MATURITY GAUGE ═══════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}` }} />
          <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, color: C.cyan, letterSpacing: 2 }}>
            SHADOW VALIDATION STREAM
          </div>
        </div>
        <button onClick={load}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.cyan}44`, background: 'transparent', color: C.cyan, cursor: 'pointer', fontFamily: font }}>
          ↺ Refresh
        </button>
      </div>

      {/* What is this? */}
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
        Background agent fires a prediction every 5min during market hours, gets auto-graded against actual SPX movement at 30/60/90min horizons. Accumulates ~78 labeled data points per session for model calibration.
      </div>

      {/* Maturity gauge */}
      <div style={{ padding: '10px 12px', background: `linear-gradient(135deg, ${maturityColor}10 0%, ${maturityColor}05 100%)`, border: `1px solid ${maturityColor}33`, borderRadius: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: maturityColor, letterSpacing: 2, textTransform: 'uppercase' as const }}>
            Data Maturity
          </div>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, color: maturityColor }}>
            {stats.dataMaturity}
          </div>
        </div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.4)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${maturityProgress}%`, height: '100%', background: maturityColor, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.muted }}>
          <span>{stats.graded60} of 100 graded at 60min (target for robust analysis)</span>
          <span>{stats.total} total / {stats.pending} pending</span>
        </div>
      </div>

      {/* ═══ WIN RATES PER HORIZON ════════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
          Win Rate by Horizon
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {(['h30m', 'h60m', 'h90m'] as const).map(h => {
            const hLabel = h === 'h30m' ? '30 MIN' : h === 'h60m' ? '60 MIN' : '90 MIN'
            const wr = stats.winRates[h]
            const isSelected = selectedHorizon === h
            const wrColor = wr.winRate === null ? C.muted : wr.winRate >= 55 ? C.green : wr.winRate >= 45 ? C.yellow : C.red

            return (
              <button key={h} onClick={() => setSelectedHorizon(h)}
                style={{
                  textAlign: 'left' as const, padding: '10px 12px',
                  background: isSelected ? `${C.cyan}10` : C.bg,
                  border: `1px solid ${isSelected ? C.cyan + '66' : C.border}`,
                  borderRadius: 8, cursor: 'pointer', fontFamily: font,
                  transition: 'all 0.15s ease',
                }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 1.5, marginBottom: 4 }}>{hLabel}</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: wrColor }}>
                  {wr.winRate !== null ? `${wr.winRate}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {wr.sample > 0 ? `${wr.wins}W / ${wr.losses}L · ${wr.scratches} scratch` : 'no data yet'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ SIGNAL TYPE BREAKDOWN ════════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
          Signal Type Breakdown <span style={{ color: C.dim, fontWeight: 600, letterSpacing: 1 }}>(60min horizon)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {stats.signalBreakdown.map(s => {
            const color = s.signal === 'LONG' ? C.green : s.signal === 'SHORT' ? C.red : C.muted
            const arrow = s.signal === 'LONG' ? '▲' : s.signal === 'SHORT' ? '▼' : '⏸'
            return (
              <div key={s.signal} style={{ padding: '10px 12px', background: C.bg, border: `1px solid ${color}22`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color, fontSize: 13, fontWeight: 800, fontFamily: fontDisplay }}>{arrow}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1 }}>{s.signal}</span>
                </div>
                <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 800, color }}>
                  {s.winRate !== null ? `${s.winRate}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {s.total} fired · {s.graded} graded
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ CALIBRATION CURVE ═══════════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
          Calibration <span style={{ color: C.dim, fontWeight: 600, letterSpacing: 1 }}>({selectedHorizon} — predicted vs actual win rate)</span>
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <CalibrationGrid bands={stats.calibration[selectedHorizon]} fontDisplay={fontDisplay} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Gap = actual − predicted. Negative gap means model is <strong style={{ color: C.yellow }}>overconfident</strong> at that band; positive means <strong style={{ color: C.blue }}>underconfident</strong>. Perfect calibration: gap ≈ 0.
          </div>
        </div>
      </div>

      {/* ═══ RECENT PREDICTIONS FEED ════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
          Recent Predictions <span style={{ color: C.dim, fontWeight: 600, letterSpacing: 1 }}>(last 20)</span>
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, maxHeight: 360, overflowY: 'auto' }}>
          {stats.recent.length === 0 ? (
            <div style={{ padding: '20px 12px', textAlign: 'center' as const, color: C.muted, fontSize: 11 }}>
              No predictions yet. Agent fires every 5min during market hours.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stats.recent.map((p: any) => (
                <div key={p.id}>
                  <PredictionRow pred={p} fontDisplay={fontDisplay} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ DIAGNOSTIC FOOTER ═══════════════════════════════════ */}
      <div style={{ fontSize: 10, color: C.dim, textAlign: 'right' as const, fontStyle: 'italic' as const }}>
        Last updated: {lastFetch ? lastFetch.toLocaleTimeString() : '—'} · auto-refresh 60s
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CalibrationGrid — visual calibration display
// ═══════════════════════════════════════════════════════════════════════
function CalibrationGrid({ bands, fontDisplay }: { bands: any[]; fontDisplay: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
      {bands.map(b => {
        const hasData = b.actual !== null && b.sample > 0
        const gapColor = !hasData ? C.dim :
                         Math.abs(b.gap) <= 5  ? C.green :
                         Math.abs(b.gap) <= 15 ? C.yellow : C.red
        const barWidth = hasData ? `${b.actual}%` : '0%'
        const predLineLeft = `${b.predicted}%`

        return (
          <div key={b.range} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Band label */}
            <div style={{ width: 70, fontSize: 11, fontFamily: fontDisplay, fontWeight: 700, color: C.text, letterSpacing: 0.5 }}>
              {b.range}
            </div>

            {/* Bar showing actual vs predicted */}
            <div style={{ flex: 1, height: 18, background: 'rgba(0,0,0,0.4)', borderRadius: 3, position: 'relative' as const, overflow: 'hidden' }}>
              {/* Actual win rate bar */}
              {hasData && (
                <div style={{
                  position: 'absolute' as const, left: 0, top: 0, bottom: 0,
                  width: barWidth, background: `${gapColor}66`,
                  borderRight: `2px solid ${gapColor}`,
                  transition: 'width 0.4s ease',
                }} />
              )}
              {/* Predicted line marker */}
              <div style={{
                position: 'absolute' as const, left: predLineLeft, top: -1, bottom: -1,
                width: 2, background: C.purple, boxShadow: `0 0 4px ${C.purple}`,
              }} />
              {/* % gridlines */}
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{
                  position: 'absolute' as const, left: `${pct}%`, top: 0, bottom: 0,
                  width: 1, background: 'rgba(255,255,255,0.05)',
                }} />
              ))}
            </div>

            {/* Stats */}
            <div style={{ minWidth: 100, textAlign: 'right' as const, fontSize: 11, color: C.muted, fontFamily: fontDisplay }}>
              {hasData ? (
                <>
                  <span style={{ color: gapColor, fontWeight: 700 }}>{b.actual}%</span>
                  <span style={{ color: C.dim }}> · {b.sample}n</span>
                  <span style={{ color: gapColor, fontWeight: 700, marginLeft: 6 }}>
                    ({b.gap > 0 ? '+' : ''}{b.gap})
                  </span>
                </>
              ) : (
                <span style={{ color: C.dim }}>no data · {b.sample}n</span>
              )}
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 10, color: C.muted }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: C.purple, display: 'inline-block', borderRadius: 1 }} /> predicted
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: `${C.green}66`, display: 'inline-block', borderRadius: 1 }} /> actual
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// PredictionRow — single row in recent predictions feed
// ═══════════════════════════════════════════════════════════════════════
function PredictionRow({ pred, fontDisplay }: { pred: any; fontDisplay: string }) {
  const signalColor =
    pred.signal === 'LONG'  ? C.green :
    pred.signal === 'SHORT' ? C.red :
    C.muted
  const arrow = pred.signal === 'LONG' ? '▲' : pred.signal === 'SHORT' ? '▼' : '⏸'

  // Pick the most "final" outcome available
  const outcome = pred.outcome_90m || pred.outcome_60m || pred.outcome_30m
  const outcomeColor = outcome === 'WIN' ? C.green : outcome === 'LOSS' ? C.red : outcome === 'SCRATCH' ? C.yellow : C.dim

  // Time formatting
  const time = new Date(pred.predicted_at).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', background: 'rgba(0,0,0,0.2)',
      borderRadius: 4, fontSize: 11,
      borderLeft: `2px solid ${signalColor}66`,
    }}>
      {/* Time */}
      <span style={{ width: 44, color: C.muted, fontFamily: fontDisplay, fontSize: 10 }}>{time}</span>

      {/* Signal */}
      <span style={{ width: 52, fontWeight: 800, color: signalColor, fontFamily: fontDisplay, letterSpacing: 0.5 }}>
        {arrow} {pred.signal}
      </span>

      {/* Confidence */}
      <span style={{ width: 32, color: C.text, fontFamily: fontDisplay, fontWeight: 700 }}>
        {pred.confidence}%
      </span>

      {/* SPX entry */}
      <span style={{ width: 62, color: C.muted, fontFamily: fontDisplay, fontSize: 10 }}>
        {pred.current_spx?.toFixed?.(2) || pred.current_spx}
      </span>

      {/* T1 */}
      <span style={{ width: 56, color: C.dim, fontSize: 10 }}>
        T1: <span style={{ color: C.muted }}>{pred.predicted_t1?.toFixed?.(2) || '—'}</span>
      </span>

      {/* Outcome at each horizon */}
      <div style={{ display: 'flex', gap: 3, flex: 1 }}>
        {(['30m', '60m', '90m'] as const).map(h => {
          const o = pred[`outcome_${h}`]
          const oColor = o === 'WIN' ? C.green : o === 'LOSS' ? C.red : o === 'SCRATCH' ? C.yellow : C.dim
          return (
            <div key={h} style={{
              padding: '2px 5px', borderRadius: 3,
              background: o ? `${oColor}15` : 'transparent',
              border: `1px solid ${o ? oColor + '44' : C.dim + '33'}`,
              color: o ? oColor : C.dim, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {h}: {o || '—'}
            </div>
          )
        })}
      </div>

      {/* Final outcome accent */}
      {outcome && (
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: outcomeColor, boxShadow: `0 0 4px ${outcomeColor}` }} />
      )}
    </div>
  )
}
