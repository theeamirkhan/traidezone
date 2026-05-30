'use client'
/**
 * TriggerManager — Personal Trigger Engine UI
 *
 * Lets the trader define triggers in plain English. The text is parsed
 * by the AI (once) into a structured rule, shown for confirmation, then
 * saved. The live engine (in cockpit) evaluates saved rules every tick.
 */

import { useState, useEffect } from 'react'
import { PRIMITIVE_LABELS, type PrimitiveId } from './lib/triggerPrimitives'

const C = {
  cyan: '#00e5ff', green: '#00ff88', red: '#ff4d6d', yellow: '#f59e0b',
  purple: '#7c6aff', muted: '#6b7a9a', text: '#e2e8f0', dim: '#4a5568',
  bg: 'rgba(0,0,0,0.3)', border: 'rgba(255,255,255,0.06)',
}

export function TriggerManager({ font, fontDisplay }: { font: string; fontDisplay: string }) {
  const [triggers, setTriggers]   = useState<any[]>([])
  const [text, setText]           = useState('')
  const [parsing, setParsing]     = useState(false)
  const [parsed, setParsed]       = useState<any | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  const load = () => {
    fetch('/api/triggers')
      .then(r => r.json())
      .then(d => { setTriggers(d.triggers || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleParse = async () => {
    if (!text.trim()) return
    setParsing(true); setError(null); setParsed(null)
    try {
      const res = await fetch('/api/triggers/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await res.json()
      if (d.error) setError(d.error)
      else setParsed(d.rule)
    } catch (e: any) {
      setError(e.message)
    }
    setParsing(false)
  }

  const handleSave = async () => {
    if (!parsed) return
    try {
      await fetch('/api/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', rule: parsed }),
      })
      setText(''); setParsed(null)
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch('/api/triggers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, enabled: !enabled }),
    })
    load()
  }

  const deleteTrigger = async (id: string) => {
    await fetch('/api/triggers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    load()
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, boxShadow: `0 0 8px ${C.purple}` }} />
        <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, color: C.purple, letterSpacing: 2 }}>
          PERSONAL TRIGGER ENGINE
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
        Describe your trade trigger in plain English. The system parses it into rules it watches live — when your conditions fire in sequence, it alerts you immediately and pre-fills the trade. <strong style={{ color: C.text }}>Your rules fire deterministically — no waiting on the AI's confidence.</strong>
      </div>

      {/* Definition input */}
      <div style={{ marginBottom: 12 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. After 10am, if I see a VWAP hold and then we take above yesterday's close, that's my long trigger. Stop at VWAP."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
            fontSize: 13, fontFamily: font, outline: 'none', boxSizing: 'border-box' as const,
            resize: 'vertical' as const,
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleParse} disabled={parsing || !text.trim()}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: parsing ? C.dim : C.purple, color: parsing ? C.muted : '#000',
              cursor: parsing ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700,
              letterSpacing: 1, fontFamily: font,
            }}>
            {parsing ? 'PARSING…' : 'PARSE TRIGGER'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', borderRadius: 6, color: C.red, fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Parsed preview */}
      {parsed && (
        <div style={{ padding: 12, background: `${C.purple}10`, border: `1px solid ${C.purple}44`, borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: parsed.direction === 'LONG' ? C.green : C.red, fontFamily: fontDisplay }}>
              {parsed.direction === 'LONG' ? '▲' : '▼'} {parsed.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{parsed.confidence}% conviction</div>
          </div>

          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Conditions (must complete within {parsed.windowMins}min):</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 8 }}>
            {parsed.conditions.map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text }}>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: c.mode === 'sequential' ? `${C.cyan}22` : `${C.yellow}22`,
                  color: c.mode === 'sequential' ? C.cyan : C.yellow,
                  fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {c.mode === 'sequential' ? `${i + 1}` : 'STATE'}
                </span>
                {PRIMITIVE_LABELS[c.primitive as PrimitiveId] || c.primitive}
                {c.threshold != null && <span style={{ color: C.muted }}>({c.threshold})</span>}
                {c.minutesSinceOpen != null && <span style={{ color: C.muted }}>({9 + Math.floor((30 + c.minutesSinceOpen) / 60)}:{String((30 + c.minutesSinceOpen) % 60).padStart(2, '0')})</span>}
              </div>
            ))}
          </div>

          {parsed.stopHint && <div style={{ fontSize: 11, color: C.muted }}>Stop: <span style={{ color: C.red }}>{parsed.stopHint}</span></div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleSave}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.green, color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 1, fontFamily: font }}>
              ✓ SAVE TRIGGER
            </button>
            <button onClick={() => setParsed(null)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.dim}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: font }}>
              DISCARD
            </button>
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 8, fontStyle: 'italic' as const }}>
            Review carefully — make sure the parsed conditions match your intent before saving.
          </div>
        </div>
      )}

      {/* Saved triggers */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
        Your Triggers ({triggers.length})
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: C.muted, padding: 12 }}>Loading…</div>
      ) : triggers.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, padding: 12, textAlign: 'center' as const, background: C.bg, borderRadius: 8 }}>
          No triggers yet. Describe your first setup above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {triggers.map(t => (
            <div key={t.id} style={{
              padding: '10px 12px', background: C.bg,
              border: `1px solid ${t.enabled ? (t.direction === 'LONG' ? C.green + '33' : C.red + '33') : C.border}`,
              borderRadius: 8, opacity: t.enabled ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.direction === 'LONG' ? C.green : C.red, fontFamily: fontDisplay }}>
                  {t.direction === 'LONG' ? '▲' : '▼'} {t.name}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.muted }}>fired {t.fireCount || 0}×</span>
                  <button onClick={() => toggleEnabled(t.id, t.enabled)}
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: `1px solid ${t.enabled ? C.green : C.dim}`, background: 'transparent', color: t.enabled ? C.green : C.muted, cursor: 'pointer', fontFamily: font, fontWeight: 700 }}>
                    {t.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={() => deleteTrigger(t.id)}
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, cursor: 'pointer', fontFamily: font }}>
                    ✕
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontStyle: 'italic' as const }}>
                "{t.originalText}"
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' as const }}>
                {(t.conditions || []).map((c: any, i: number) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 3,
                    background: c.mode === 'sequential' ? `${C.cyan}15` : `${C.yellow}15`,
                    color: c.mode === 'sequential' ? C.cyan : C.yellow,
                    border: `1px solid ${c.mode === 'sequential' ? C.cyan + '33' : C.yellow + '33'}`,
                  }}>
                    {c.mode === 'sequential' ? `${i + 1}. ` : ''}{PRIMITIVE_LABELS[c.primitive as PrimitiveId] || c.primitive}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
