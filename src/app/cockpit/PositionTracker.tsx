'use client'
/**
 * Position tracking UI components for live session trade management
 */
import { useState, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────
// TakeTradeModal — opens when user clicks "TOOK THIS TRADE" on a signal
// ─────────────────────────────────────────────────────────────────────────
export function TakeTradeModal({ signal, onClose, onConfirm }: any) {
  const [contracts, setContracts]       = useState('1')
  const [entryPrice, setEntryPrice]     = useState(signal.entryPrice ? signal.entryPrice.toFixed(2) : '')
  const [entryPremium, setEntryPremium] = useState('')
  const [strike, setStrike]             = useState(signal.strike || '')
  const [expiry, setExpiry]             = useState(signal.expiry || '0DTE')
  const [notes, setNotes]               = useState('')

  const isLong = signal.signal === 'LONG'
  const dirColor = isLong ? '#00ff88' : '#ff4d6d'

  const handleConfirm = () => {
    onConfirm({
      contracts:    parseInt(contracts, 10) || 1,
      entryPrice:   parseFloat(entryPrice) || signal.entryPrice,
      entryPremium: parseFloat(entryPremium) || null,
      strike:       strike ? parseFloat(strike) : null,
      expiry:       expiry || null,
      notes:        notes || null,
    })
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0c1018 0%, #060810 100%)',
          border: `2px solid ${dirColor}88`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 460,
          width: '92%',
          boxShadow: `0 0 60px ${dirColor}33, 0 8px 30px rgba(0,0,0,0.6)`,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9a', letterSpacing: 2, marginBottom: 4 }}>LOG NEW POSITION</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: dirColor, letterSpacing: 1 }}>
                {isLong ? '▲ LONG' : '▼ SHORT'} SPX
              </span>
              <span style={{ fontSize: 12, color: '#8899bb', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                {signal.confidence}% conf
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#6b7a9a', cursor: 'pointer', fontSize: 22, padding: 4 }}>×</button>
        </div>

        {/* Pre-filled levels from signal */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#6b7a9a' }}>
          <div>Stop: <strong style={{ color: '#ff4d6d' }}>{signal.stopLevel || '—'}</strong> · T1: <strong style={{ color: '#00ff88' }}>{signal.target1 || '—'}</strong> · T2: <strong style={{ color: '#00d4a0' }}>{signal.target2 || '—'}</strong></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Field label="Contracts" value={contracts} onChange={setContracts} placeholder="1" />
          <Field label="Strike" value={strike} onChange={setStrike} placeholder="auto" />
          <Field label="Entry SPX Price" value={entryPrice} onChange={setEntryPrice} placeholder="5840.00" />
          <Field label="Entry Premium ($)" value={entryPremium} onChange={setEntryPremium} placeholder="4.50" />
          <Field label="Expiry" value={expiry} onChange={setExpiry} placeholder="0DTE" />
        </div>

        <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="What you saw..." />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px 16px', background: 'transparent', border: '1px solid #4a5568', borderRadius: 6, color: '#8899bb', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
            CANCEL
          </button>
          <button onClick={handleConfirm}
            style={{ flex: 2, padding: '10px 16px', background: `linear-gradient(180deg, ${dirColor} 0%, ${dirColor}cc 100%)`, border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: 1.5, boxShadow: `0 4px 20px ${dirColor}44` }}>
            ✓ CONFIRM POSITION OPEN
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CloseTradeModal — opens when user clicks Close on a position
// ─────────────────────────────────────────────────────────────────────────
export function CloseTradeModal({ position, currentPrice, onClose, onConfirm }: any) {
  const [exitPrice, setExitPrice]     = useState(currentPrice ? currentPrice.toFixed(2) : '')
  const [exitPremium, setExitPremium] = useState('')
  const [exitReason, setExitReason]   = useState('manual')
  const [notes, setNotes]             = useState('')

  const entryPremium = parseFloat(position.entry_premium) || null
  const exitPremNum  = parseFloat(exitPremium) || null
  const contracts    = position.contracts || 1
  const isLong       = position.signal_direction === 'LONG'

  const estPnl = (exitPremNum != null && entryPremium != null)
    ? (exitPremNum - entryPremium) * contracts * 100
    : null
  const pnlColor = estPnl == null ? '#8899bb' : estPnl >= 0 ? '#00ff88' : '#ff4d6d'

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0c1018 0%, #060810 100%)',
          border: `2px solid ${pnlColor}88`,
          borderRadius: 12, padding: 24, maxWidth: 460, width: '92%',
          boxShadow: `0 0 60px ${pnlColor}33, 0 8px 30px rgba(0,0,0,0.6)`,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9a', letterSpacing: 2, marginBottom: 4 }}>CLOSE POSITION</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: isLong ? '#00ff88' : '#ff4d6d' }}>
              {isLong ? '▲ LONG' : '▼ SHORT'} {position.symbol} {position.strike || ''}{position.strike ? (isLong ? 'C' : 'P') : ''}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#6b7a9a', cursor: 'pointer', fontSize: 22, padding: 4 }}>×</button>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#8899bb' }}>
          <div>Entry: <strong style={{ color: '#e0e8ff' }}>{position.entry_price?.toFixed?.(2) || position.entry_price}</strong> @ <strong style={{ color: '#e0e8ff' }}>${entryPremium?.toFixed(2) || '—'}</strong> · {contracts} contract{contracts !== 1 ? 's' : ''}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Field label="Exit SPX Price" value={exitPrice} onChange={setExitPrice} placeholder="5855.00" />
          <Field label="Exit Premium ($)" value={exitPremium} onChange={setExitPremium} placeholder="5.20" />
        </div>

        {estPnl != null && (
          <div style={{ background: `${pnlColor}10`, border: `1px solid ${pnlColor}44`, borderRadius: 5, padding: '8px 12px', marginBottom: 12, textAlign: 'center' as const }}>
            <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1, marginBottom: 2 }}>ESTIMATED P&L</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: pnlColor }}>
              {estPnl >= 0 ? '+' : ''}${Math.round(estPnl).toLocaleString()}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9a', letterSpacing: 1, marginBottom: 4 }}>EXIT REASON</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {['T1', 'T2', 'stop', 'manual', 'time'].map(r => (
              <button key={r} onClick={() => setExitReason(r)}
                style={{
                  flex: 1, padding: '5px 6px', borderRadius: 4,
                  background: exitReason === r ? 'rgba(0,229,255,0.15)' : 'transparent',
                  border: `1px solid ${exitReason === r ? '#00e5ff' : '#3a4660'}`,
                  color: exitReason === r ? '#00e5ff' : '#8899bb',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase' as const,
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <Field label="Notes" value={notes} onChange={setNotes} placeholder="How did it play out?" />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px 16px', background: 'transparent', border: '1px solid #4a5568', borderRadius: 6, color: '#8899bb', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
            CANCEL
          </button>
          <button onClick={() => onConfirm({ exitPrice: parseFloat(exitPrice), exitPremium: parseFloat(exitPremium) || null, exitReason, notes })}
            style={{ flex: 2, padding: '10px 16px', background: `linear-gradient(180deg, ${pnlColor} 0%, ${pnlColor}cc 100%)`, border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: 1.5, boxShadow: `0 4px 20px ${pnlColor}44` }}>
            ✓ CLOSE POSITION
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ExitPromptModal — auto-fires when SPX hits stop or target
// ─────────────────────────────────────────────────────────────────────────
export function ExitPromptModal({ prompt, onDismiss, onConfirmExit }: any) {
  const { position, reason, level, type, currentPrice } = prompt
  const isStop = type === 'stop'
  const color = isStop ? '#ff4d6d' : '#00ff88'
  const isLong = position.signal_direction === 'LONG'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', animation: 'fadeIn 0.2s ease' }}>
      <div style={{
        background: 'linear-gradient(180deg, #0c1018 0%, #060810 100%)',
        border: `3px solid ${color}`,
        borderRadius: 14, padding: 28, maxWidth: 500, width: '92%',
        boxShadow: `0 0 100px ${color}66, 0 8px 40px rgba(0,0,0,0.7)`,
        animation: 'slideUp 0.3s ease',
      }}>
        <div style={{ textAlign: 'center' as const, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: color, letterSpacing: 3, marginBottom: 8 }}>
            ⚠ POSITION ALERT
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color, letterSpacing: 1, lineHeight: 1.1, marginBottom: 6 }}>
            {reason}
          </div>
          <div style={{ fontSize: 13, color: '#b0c4de', lineHeight: 1.6 }}>
            SPX reached <strong style={{ color: '#e0e8ff' }}>{currentPrice?.toFixed?.(2)}</strong> · {isStop ? 'stop' : 'target'} level was <strong style={{ color }}>{level?.toFixed?.(2)}</strong>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 1.5, marginBottom: 4 }}>YOUR POSITION</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: isLong ? '#00ff88' : '#ff4d6d' }}>
            {isLong ? '▲' : '▼'} {position.signal_direction} {position.symbol} {position.strike || ''}{position.strike ? (isLong ? 'C' : 'P') : ''} ({position.contracts || 1}x)
          </div>
          <div style={{ fontSize: 11, color: '#8899bb', marginTop: 3 }}>
            Entry: SPX {position.entry_price?.toFixed?.(2)} @ ${position.entry_premium?.toFixed?.(2) || '—'} · {Math.round((Date.now() - new Date(position.opened_at).getTime()) / 60000)}min held
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#e0e8ff', textAlign: 'center' as const, marginBottom: 18, lineHeight: 1.7 }}>
          Did you exit this position?
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onDismiss}
            style={{ flex: 1, padding: '12px 16px', background: 'transparent', border: '1px solid #4a5568', borderRadius: 7, color: '#8899bb', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
            STILL HOLDING
          </button>
          <button onClick={onConfirmExit}
            style={{ flex: 2, padding: '12px 16px', background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`, border: 'none', borderRadius: 7, color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: 1.5, boxShadow: `0 4px 20px ${color}55` }}>
            ✓ YES, CLOSE POSITION
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// OpenPositionsStrip — sticky strip showing live positions on Summary tab
// ─────────────────────────────────────────────────────────────────────────
export function OpenPositionsStrip({ positions, currentPrice, onCloseClick, font, fontDisplay }: any) {
  // Compute aggregate stats
  let totalUnrealized = 0
  const positionDetails = positions.map((p: any) => {
    const isLong = p.signal_direction === 'LONG'
    const contracts = p.contracts || 1
    // Approximate unrealized P&L from SPX move (1pt SPX ≈ $1 option premium per contract for ATM 0DTE)
    const entryP = parseFloat(p.entry_price) || 0
    const move = currentPrice ? (isLong ? currentPrice - entryP : entryP - currentPrice) : 0
    // Crude estimate: option price moves ~delta × SPX move. For ITM 0DTE delta ~0.7-0.9
    const estDelta = 0.75
    const estPremiumMove = move * estDelta
    const entryPremium = parseFloat(p.entry_premium) || 0
    const estUnrealized = entryPremium > 0 ? estPremiumMove * contracts * 100 : 0
    totalUnrealized += estUnrealized

    const heldMin = Math.round((Date.now() - new Date(p.opened_at).getTime()) / 60000)

    return { ...p, isLong, move, estUnrealized, heldMin, entryPremium }
  })

  const totalColor = totalUnrealized > 0 ? '#00ff88' : totalUnrealized < 0 ? '#ff4d6d' : '#8899bb'

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(0,212,160,0.03) 100%)',
      border: '1px solid rgba(0,229,255,0.3)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88', animation: 'pulse 2s infinite' }} />
          <span style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#00e5ff', textTransform: 'uppercase' as const }}>
            Open Positions
          </span>
          <span style={{ fontSize: 11, color: '#6b7a9a', fontWeight: 600 }}>
            {positions.length} active
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#6b7a9a', letterSpacing: 1 }}>UNREALIZED</span>
          <span style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 800, color: totalColor }}>
            {totalUnrealized >= 0 ? '+' : ''}${Math.round(totalUnrealized).toLocaleString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {positionDetails.map((p: any) => {
          const pnlColor = p.estUnrealized > 0 ? '#00ff88' : p.estUnrealized < 0 ? '#ff4d6d' : '#8899bb'
          const dirColor = p.isLong ? '#00ff88' : '#ff4d6d'
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 6,
              border: `1px solid ${pnlColor}22`,
            }}>
              <span style={{ width: 26, color: dirColor, fontSize: 14, fontWeight: 800, fontFamily: fontDisplay }}>
                {p.isLong ? '▲' : '▼'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 100 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: dirColor, fontFamily: fontDisplay, letterSpacing: 0.5 }}>
                  {p.signal_direction} {p.strike || ''}{p.strike ? (p.isLong ? 'C' : 'P') : ''}
                </span>
                <span style={{ fontSize: 10, color: '#6b7a9a' }}>
                  {p.contracts}x · {p.heldMin}m · ${p.entryPremium?.toFixed(2) || '—'} → est
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 10, color: '#6b7a9a' }}>
                  Entry <strong style={{ color: '#e0e8ff' }}>{parseFloat(p.entry_price).toFixed(2)}</strong> · Stop <strong style={{ color: '#ff4d6d' }}>{p.stop_level ? parseFloat(p.stop_level).toFixed(2) : '—'}</strong> · T1 <strong style={{ color: '#00ff88' }}>{p.target1 ? parseFloat(p.target1).toFixed(2) : '—'}</strong>
                </div>
                <div style={{ fontSize: 10, color: '#8899bb' }}>
                  Move: <strong style={{ color: p.move >= 0 ? '#00ff88' : '#ff4d6d' }}>{p.move >= 0 ? '+' : ''}{p.move.toFixed(1)}pts</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' as const, minWidth: 80 }}>
                <div style={{ fontSize: 9, color: '#6b7a9a', letterSpacing: 1 }}>EST P&L</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 800, color: pnlColor }}>
                  {p.estUnrealized >= 0 ? '+' : ''}${Math.round(p.estUnrealized).toLocaleString()}
                </div>
              </div>
              <button onClick={() => onCloseClick(p)}
                style={{
                  padding: '5px 10px', borderRadius: 4,
                  background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.3)',
                  color: '#ff4d6d', cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: font,
                }}>
                CLOSE
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: '#4a5568', marginTop: 6, fontStyle: 'italic' as const, letterSpacing: 0.5 }}>
        Est P&L uses ~0.75 ITM delta × SPX move. Actual option premium varies with theta/IV.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Field — labeled input helper
// ─────────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7a9a', letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' as const }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px',
          background: 'rgba(0,0,0,0.3)', border: '1px solid #2a3344',
          borderRadius: 5, color: '#e0e8ff', fontSize: 13, fontFamily: 'inherit',
          outline: 'none', boxSizing: 'border-box' as const,
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = '#00e5ff'}
        onBlur={(e) => e.currentTarget.style.borderColor = '#2a3344'}
      />
    </div>
  )
}
