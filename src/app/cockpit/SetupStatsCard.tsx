/**
 * SetupStatsCard — Learn tab rollup for the Setup Engine.
 *
 * Shows per-setup measured hit rates (strict T1-before-stop grading,
 * scratch excluded) side-by-side with the LLM comparison arm, so the
 * engine:'setup' vs engine:'llm' experiment is readable at a glance.
 * Self-contained styling (same convention as FocusPanel v2).
 */

'use client'

import { useEffect, useState } from 'react'
import { SETUP_LABELS } from './lib/setupEngine'

const P = {
  text:   '#e2e8f0',
  soft:   '#b0c4de',
  muted:  '#4a5568',
  green:  '#00ff88',
  red:    '#ff4d6d',
  yellow: '#f59e0b',
  cyan:   '#00e5ff',
  violet: '#7c6aff',
  bg:     'rgba(0,0,0,0.3)',
  line:   'rgba(255,255,255,0.06)',
}

export function SetupStatsCard({ font, fontDisplay }: { font: string; fontDisplay: string }) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/setups/stats?days=60')
      .then(r => r.json())
      .then(d => { setData(d?.ok ? d : null); setLoading(false) })
      .catch(() => { setData(null); setLoading(false) })
  }
  useEffect(load, [])

  const wrColor = (wr: number | null) =>
    wr === null ? P.muted : wr >= 55 ? P.green : wr >= 45 ? P.yellow : P.red

  return (
    <div style={{
      background: P.bg, border: `1px solid ${P.line}`, borderLeft: `3px solid ${P.cyan}`,
      borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontFamily: font,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, color: P.cyan, letterSpacing: 2 }}>
          ⚙ SETUP ENGINE — MEASURED HIT RATES
        </div>
        <button onClick={load} style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: font,
          border: '1px solid rgba(0,229,255,0.3)', background: 'transparent', color: P.cyan,
        }}>↺ Refresh</button>
      </div>

      {loading && <div style={{ fontSize: 12, color: P.muted }}>Loading setup stats…</div>}

      {!loading && (!data || !data.setups?.length) && (
        <div style={{ fontSize: 12, color: P.muted, lineHeight: 1.5 }}>
          No graded setup fires yet. The mechanical detectors log every fire to trade_alerts
          (engine: setup) and the scorer grades them T1-before-stop. Stats appear here as fires grade out.
        </div>
      )}

      {!loading && data?.setups?.length > 0 && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.6fr 0.6fr 0.7fr 0.8fr 1.4fr',
            gap: '4px 10px', fontSize: 12, alignItems: 'baseline',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.muted, letterSpacing: 1.5 }}>SETUP</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.muted, letterSpacing: 1.5 }}>N</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.muted, letterSpacing: 1.5 }}>W–L</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.muted, letterSpacing: 1.5 }}>HIT RATE</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.muted, letterSpacing: 1.5 }}>BY REGIME</div>
            {data.setups.map((s: any) => (
              <SetupRow key={s.setupId} s={s} wrColor={wrColor} fontDisplay={fontDisplay} />
            ))}
          </div>

          <div style={{
            marginTop: 10, paddingTop: 8, borderTop: `1px solid ${P.line}`,
            fontSize: 11, color: P.soft, display: 'flex', gap: 14, flexWrap: 'wrap' as const,
          }}>
            <span style={{ color: P.violet, fontWeight: 700 }}>COMPARISON ARM (LLM signal):</span>
            <span>
              {data.comparisonArm?.hitRate !== null && data.comparisonArm?.n > 0
                ? <>hit rate <b style={{ color: wrColor(data.comparisonArm.hitRate), fontFamily: fontDisplay }}>{data.comparisonArm.hitRate}%</b> (n={data.comparisonArm.n} decided of {data.comparisonArm.totalDirectional} directional)</>
                : 'no decided directional LLM auto-fires in window'}
            </span>
            <span style={{ color: P.muted }}>scratch excluded · T1-before-stop · last {data.days}d</span>
          </div>
        </>
      )}
    </div>
  )
}

function SetupRow({ s, wrColor, fontDisplay }: { s: any; wrColor: (v: number | null) => string; fontDisplay: string }) {
  const label = (SETUP_LABELS as any)[s.setupId] || s.setupId
  const decided = s.wins + s.losses
  const regimes = Object.entries(s.byRegime || {})
    .filter(([, v]: any) => v.n > 0)
    .map(([k, v]: any) => `${k}: ${v.hitRate !== null ? v.hitRate + '%' : '—'} (n=${v.wins + v.losses})`)
    .join(' · ')
  return (
    <>
      <div style={{ color: P.text }}>{label}</div>
      <div style={{ color: P.soft }}>{s.n}{s.pending > 0 ? <span style={{ color: P.muted }}> ({s.pending}p)</span> : null}</div>
      <div style={{ color: P.soft }}>{s.wins}–{s.losses}{s.scratches > 0 ? <span style={{ color: P.muted }}> +{s.scratches}s</span> : null}</div>
      <div style={{ fontFamily: fontDisplay, fontWeight: 800, color: wrColor(s.hitRate) }}>
        {s.hitRate !== null ? `${s.hitRate}%` : '—'}{decided > 0 ? <span style={{ fontWeight: 400, fontSize: 10, color: P.muted }}> n={decided}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: P.muted }}>{regimes || '—'}</div>
    </>
  )
}
