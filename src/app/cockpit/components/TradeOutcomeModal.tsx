/**
 * TradeOutcomeModal — "Did you take this trade?"
 *
 * Appears 30 seconds after a LONG/SHORT signal fires.
 * Captures whether the trader acted, at what price, and actual outcome.
 * Saves human data alongside AI hypothetical to Supabase.
 * Over time: delta between AI outcome and human outcome = psychology gaps.
 */
'use client'
import { useState } from 'react'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"

const C = {
  bg: '#07090f', border: 'rgba(255,255,255,0.08)',
  teal: '#00d4a0', yellow: '#ffb700', red: '#ff4d6d',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.5)',
  dim: 'rgba(255,255,255,0.25)',
}

type Step = 'ask' | 'took' | 'skipped' | 'done'

type HumanOutcome = 'HIT_T1' | 'HIT_T2' | 'STOPPED_OUT' | 'PARTIAL' | 'BREAKEVEN' | 'SKIPPED'

interface Props {
  alertId:    string
  signal:     'LONG' | 'SHORT'
  entryLow:   number
  entryHigh:  number
  stopLevel:  number
  target1:    number
  target2:    number
  onClose:    () => void
}

export default function TradeOutcomeModal({
  alertId, signal, entryLow, entryHigh, stopLevel, target1, target2, onClose
}: Props) {
  const [step, setStep]               = useState<Step>('ask')
  const [entryPrice, setEntryPrice]   = useState('')
  const [exitPrice, setExitPrice]     = useState('')
  const [outcome, setOutcome]         = useState<HumanOutcome | ''>('')
  const [skipReason, setSkipReason]   = useState('')
  const [notes, setNotes]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const entryMid = ((entryLow + entryHigh) / 2).toFixed(0)
  const isLong   = signal === 'LONG'
  const signalColor = isLong ? C.green : C.red

  const pts = entryPrice && exitPrice
    ? isLong
      ? (parseFloat(exitPrice) - parseFloat(entryPrice)).toFixed(1)
      : (parseFloat(entryPrice) - parseFloat(exitPrice)).toFixed(1)
    : null

  async function save() {
    setSaving(true)
    setError('')
    try {
      const body: any = {
        id: alertId,
        human_took_trade: step === 'took',
      }
      if (step === 'took') {
        body.human_entry_price = parseFloat(entryPrice) || null
        body.human_exit_price  = parseFloat(exitPrice)  || null
        body.human_outcome     = outcome || null
        body.human_pts         = pts ? parseFloat(pts) : null
        body.human_notes       = notes || null
      } else {
        body.human_outcome = 'SKIPPED'
        body.skip_reason   = skipReason || null
        body.human_notes   = notes || null
      }

      const res = await fetch('/api/trade-alerts', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.updated) throw new Error(data.error || 'Save failed')
      setStep('done')
      setTimeout(onClose, 1800)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 980,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 24,
    }} onClick={onClose}>
      <div style={{
        width: 440, background: C.bg,
        border: `1px solid ${signalColor}40`,
        boxShadow: `0 0 40px ${signalColor}15, 0 8px 32px rgba(0,0,0,0.6)`,
        borderRadius: 14, padding: 20, fontFamily: font,
      }} onClick={e => e.stopPropagation()}>

        {/* ── Done state ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>Outcome saved — thank you</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>This data improves future signals</div>
          </div>
        )}

        {/* ── Ask step ── */}
        {step === 'ask' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>AI SIGNAL FEEDBACK</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900, color: signalColor }}>{signal}</span>
                  <span style={{ fontSize: 9, color: C.muted }}>@ {entryMid} (zone {entryLow.toFixed(0)}–{entryHigh.toFixed(0)})</span>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            <div style={{ fontSize: 12, color: C.text, marginBottom: 18, lineHeight: 1.5 }}>
              Did you take this trade?
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('took')} style={{
                flex: 1, padding: '12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `2px solid ${C.green}`, background: 'rgba(0,255,136,0.08)',
                color: C.green, cursor: 'pointer', fontFamily: font, letterSpacing: 0.5,
              }}>✅ Yes, I took it</button>
              <button onClick={() => setStep('skipped')} style={{
                flex: 1, padding: '12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `2px solid ${C.muted}`, background: 'rgba(255,255,255,0.04)',
                color: C.muted, cursor: 'pointer', fontFamily: font,
              }}>⏭ Skipped</button>
            </div>
            <button onClick={onClose} style={{
              width: '100%', marginTop: 8, padding: '6px', borderRadius: 6,
              background: 'transparent', border: 'none', color: C.dim,
              cursor: 'pointer', fontSize: 9, fontFamily: font,
            }}>Ask me later</button>
          </>
        )}

        {/* ── Took trade step ── */}
        {step === 'took' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                Great — what was your result?
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            {/* AI levels for reference */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { l: 'Stop', v: stopLevel.toFixed(0), c: C.red },
                { l: 'T1',   v: target1.toFixed(0),  c: C.teal },
                { l: 'T2',   v: target2.toFixed(0),  c: C.green },
                { l: 'Entry mid', v: entryMid, c: signalColor },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ background: c + '0d', border: `1px solid ${c}30`, borderRadius: 5, padding: '5px 7px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: C.muted, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 12, fontWeight: 800, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Outcome selector */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginBottom: 6 }}>OUTCOME</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {([
                  { k: 'HIT_T1',      l: '✅ Hit T1',     c: C.teal  },
                  { k: 'HIT_T2',      l: '✅✅ Hit T2',   c: C.green },
                  { k: 'STOPPED_OUT', l: '❌ Stopped',    c: C.red   },
                  { k: 'PARTIAL',     l: '〜 Partial',    c: C.yellow },
                  { k: 'BREAKEVEN',   l: '⚖ Breakeven',  c: C.muted  },
                ] as const).map(({ k, l, c }) => (
                  <button key={k} onClick={() => setOutcome(k)} style={{
                    padding: '5px 10px', borderRadius: 5, fontSize: 9, fontWeight: 700,
                    border: `1px solid ${outcome === k ? c : C.border}`,
                    background: outcome === k ? c + '18' : 'rgba(255,255,255,0.03)',
                    color: outcome === k ? c : C.muted,
                    cursor: 'pointer', fontFamily: font,
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Entry / Exit prices */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Your entry price', val: entryPrice, set: setEntryPrice, ph: entryMid },
                { label: 'Your exit price',  val: exitPrice,  set: setExitPrice,  ph: target1.toFixed(0) },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <div style={{ fontSize: 8, color: C.muted, marginBottom: 4 }}>{label}</div>
                  <input
                    value={val}
                    onChange={e => set(e.target.value)}
                    placeholder={ph}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${C.border}`, borderRadius: 5, padding: '7px 10px',
                      color: C.text, fontSize: 13, fontFamily: fontDisplay, fontWeight: 700,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Pts captured */}
            {pts !== null && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6,
                background: parseFloat(pts) > 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,77,109,0.07)',
                border: `1px solid ${parseFloat(pts) > 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,77,109,0.2)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: C.muted }}>Points captured</span>
                <span style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 900,
                  color: parseFloat(pts) > 0 ? C.green : C.red }}>
                  {parseFloat(pts) > 0 ? '+' : ''}{pts}pt
                </span>
              </div>
            )}

            {/* Notes */}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional) — what worked, what didn't..."
              rows={2}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px',
                color: C.muted, fontSize: 10, fontFamily: font, resize: 'none',
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }}
            />

            {error && <div style={{ fontSize: 9, color: C.red, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('ask')} style={{
                padding: '8px 14px', borderRadius: 6, background: 'transparent',
                border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 9, fontFamily: font,
              }}>← Back</button>
              <button onClick={save} disabled={saving || !outcome} style={{
                flex: 1, padding: '10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `2px solid ${C.teal}`, background: 'rgba(0,212,160,0.12)',
                color: C.teal, cursor: !outcome || saving ? 'default' : 'pointer',
                opacity: !outcome || saving ? 0.5 : 1, fontFamily: font,
              }}>
                {saving ? '⟳ Saving...' : '💾 Save Outcome'}
              </button>
            </div>
          </>
        )}

        {/* ── Skipped step ── */}
        {step === 'skipped' && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 14 }}>
              Why did you skip?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {[
                { k: 'too_late',      l: '⏰ Saw it too late' },
                { k: 'no_confirm',    l: '👀 Waited for confirmation that never came' },
                { k: 'fear',          l: '😰 Fear / hesitation' },
                { k: 'wrong_setup',   l: '🤔 Disagreed with the setup' },
                { k: 'already_in',    l: '📊 Already in a position' },
                { k: 'risk_limit',    l: '🛑 Hit daily risk limit' },
                { k: 'other',         l: '💬 Other' },
              ].map(({ k, l }) => (
                <button key={k} onClick={() => setSkipReason(k)} style={{
                  padding: '9px 12px', borderRadius: 6, fontSize: 10, textAlign: 'left',
                  border: `1px solid ${skipReason === k ? C.yellow : C.border}`,
                  background: skipReason === k ? 'rgba(255,183,0,0.08)' : 'rgba(255,255,255,0.03)',
                  color: skipReason === k ? C.yellow : C.muted,
                  cursor: 'pointer', fontFamily: font,
                }}>{l}</button>
              ))}
            </div>

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything else? (optional)"
              rows={2}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px',
                color: C.muted, fontSize: 10, fontFamily: font, resize: 'none',
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }}
            />

            {error && <div style={{ fontSize: 9, color: C.red, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('ask')} style={{
                padding: '8px 14px', borderRadius: 6, background: 'transparent',
                border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 9, fontFamily: font,
              }}>← Back</button>
              <button onClick={save} disabled={saving || !skipReason} style={{
                flex: 1, padding: '10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `2px solid ${C.yellow}`, background: 'rgba(255,183,0,0.08)',
                color: C.yellow, cursor: !skipReason || saving ? 'default' : 'pointer',
                opacity: !skipReason || saving ? 0.5 : 1, fontFamily: font,
              }}>
                {saving ? '⟳ Saving...' : '💾 Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
