'use client'
import { useState } from 'react'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  bg: '#080a0f', border: 'rgba(255,255,255,0.08)',
  teal: '#00d4a0', yellow: '#ffb700', red: '#ff4d6d',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.2)', violet: '#7c6aff',
}

export default function EdgeDiscovery({ onClose }: { onClose: () => void }) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [days, setDays]       = useState(300)

  const run = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res  = await fetch(`/api/agents/edge-discovery?days=${days}`, {
        headers: { authorization: 'Bearer traidezone-cron' }
      })
      const json = await res.json()
      if (json.error) setError(json.error)
      else setData(json)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  // Parse analysis into sections
  const sections = data?.analysis ? data.analysis.split(/\d+\.\s+[A-Z\s]+:/g).filter(Boolean) : []
  const headers  = data?.analysis ? (data.analysis.match(/\d+\.\s+[A-Z\s]+:/g) || []) : []

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 930,
      background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 740, maxHeight: '90vh', overflowY: 'auto',
        background: C.bg,
        border: '2px solid rgba(124,106,255,0.4)',
        boxShadow: '0 0 40px rgba(124,106,255,0.15)',
        borderRadius: 12, padding: 22, fontFamily: font,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.violet, letterSpacing: 1 }}>🧠 AI EDGE DISCOVERY</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
              Claude analyzes your backtest data to find hidden patterns and improve signal rules
            </div>
            <div style={{ fontSize: 8, color: 'rgba(124,106,255,0.4)', marginTop: 2 }}>
              Uses Sonnet — ~$0.01 per analysis · Results improve with more signal data
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 9, color: C.muted }}>Analyze:</div>
          {[90, 180, 300].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              border: `1px solid ${days === d ? C.violet : C.border}`,
              background: days === d ? 'rgba(124,106,255,0.1)' : 'transparent',
              color: days === d ? C.violet : C.muted, cursor: 'pointer', fontFamily: font,
            }}>{d}D</button>
          ))}
          <button onClick={run} disabled={loading} style={{
            marginLeft: 'auto', padding: '6px 20px', borderRadius: 6, fontSize: 10, fontWeight: 700,
            border: '2px solid rgba(124,106,255,0.6)',
            background: loading ? 'rgba(124,106,255,0.1)' : 'rgba(124,106,255,0.18)',
            color: C.violet, cursor: loading ? 'default' : 'pointer', fontFamily: font, letterSpacing: 1,
          }}>
            {loading ? '⟳ Analyzing...' : '🧠 DISCOVER EDGE'}
          </button>
        </div>

        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: C.violet, fontSize: 10 }}>
            <div style={{ marginBottom: 8 }}>⟳ Running {days}-day backtest + AI pattern analysis...</div>
            <div style={{ fontSize: 8, color: C.muted }}>Fetching historical data → building feature matrix → Claude analyzing patterns</div>
            <div style={{ fontSize: 8, color: C.dim, marginTop: 4 }}>This takes ~30 seconds</div>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 12, fontSize: 9, color: C.red }}>{error}</div>
        )}

        {data && !loading && (
          <>
            {/* Stats header */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '10px 14px',
              background: 'rgba(124,106,255,0.05)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 8 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1 }}>SIGNALS ANALYZED</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900, color: C.violet }}>{data.signalCount}</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1 }}>CURRENT WIN RATE</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900,
                  color: data.summary.winRate >= 50 ? C.green : data.summary.winRate >= 40 ? C.yellow : C.red }}>
                  {data.summary.winRate}%
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1 }}>PROFIT FACTOR</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 900,
                  color: data.summary.profitFactor >= 1.2 ? C.green : data.summary.profitFactor >= 1 ? C.yellow : C.red }}>
                  {data.summary.profitFactor}×
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1 }}>DATE RANGE</div>
                <div style={{ fontSize: 9, color: C.text, marginTop: 4 }}>
                  {data.summary.dateRange?.from?.substring(5)}<br/>
                  → {data.summary.dateRange?.to?.substring(5)}
                </div>
              </div>
            </div>

            {/* Analysis */}
            <div style={{ background: 'rgba(124,106,255,0.03)', border: '1px solid rgba(124,106,255,0.15)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 9, color: C.violet, letterSpacing: 1, marginBottom: 14 }}>🧠 CLAUDE'S ANALYSIS</div>
              <div style={{ fontSize: 10, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {data.analysis}
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 8, color: C.dim, textAlign: 'center' }}>
              Generated {new Date(data.generatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
              · {data.days} day lookback · {data.signalCount} signals
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Find hidden edge patterns in your backtest data</div>
            <div style={{ fontSize: 9, color: C.dim, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
              Claude analyzes which combinations of VIX regime, day of week, gap direction, and signal type
              actually produce positive expectancy — patterns too subtle to see manually.
              <br/><br/>
              More signals = better analysis. At 200+ signals the patterns become statistically meaningful.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
