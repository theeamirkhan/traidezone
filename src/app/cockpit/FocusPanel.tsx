/**
 * FocusPanel — the anti-busy module. v2.
 *
 * One always-visible card answering "what should I be doing right now"
 * in four data lines + one plain-English interpretation. Deterministic,
 * zero LLM cost, recomputes per tick.
 *
 * v2: self-contained colors (v1 referenced palette keys like C.cyan that
 * don't exist in the cockpit palette — CSS got `undefined` and rendered
 * BLACK, which made the GET SIGNAL button invisible). Prominent button,
 * readable type, wrapping text, and a layman's translation line.
 */

'use client'

import { useMemo, useState } from 'react'

// Self-contained palette — no external dependencies, nothing can render black
const P = {
  text:   '#e8f0ff',
  soft:   '#b0c4de',
  muted:  '#7d8db0',
  green:  '#00ff88',
  red:    '#ff4d6d',
  yellow: '#ffb700',
  cyan:   '#00e5ff',
  violet: '#b58cff',
  bg:     'rgba(8, 12, 24, 0.55)',
  line:   'rgba(255,255,255,0.07)',
}

interface FocusInputs {
  currentPrice: number | null
  vwap: number | null
  ema200: number | null
  pdh: number | null
  pdl: number | null
  prevClose: number | null
  orbHigh: number | null
  orbLow: number | null
  gammaFlip: number | null
  callWall: number | null
  putWall: number | null
  gexRegime: string | null
  dayType: string | null
  tick: number | null
  sessionMinutes: number
  planBias: string | null
  extraLevels?: Array<[string, number | null]>
  armedTriggers: { name: string; direction: string }[]
  newsSnippet: string | null
}

interface Focus {
  stance: string
  stanceColor: string
  headline: string
  now: string
  next: string
  risk: string
  plain: string      // layman's interpretation
}

function computeFocus(i: FocusInputs): Focus {
  const p = i.currentPrice

  if (i.sessionMinutes < 0) {
    return {
      stance: 'PRE-MARKET', stanceColor: P.muted,
      headline: 'Session not open. Review the plan, set triggers, no positions.',
      now:  i.planBias ? `Plan bias: ${i.planBias.toUpperCase()}` : 'No morning plan set — write one before the open.',
      next: `Open in ${Math.abs(Math.round(i.sessionMinutes))} min. First 30 min = observation only (your rule).`,
      risk: i.newsSnippet ? 'Economic events today — check calendar timing before sizing.' : 'No calendar risk flagged.',
      plain: 'The market hasn\'t opened yet. Use this time to write or review your plan for the day. No trading decisions are needed right now.',
    }
  }
  if (i.sessionMinutes < 30) {
    return {
      stance: 'STAND DOWN', stanceColor: P.yellow,
      headline: `Opening range forming (${Math.round(30 - i.sessionMinutes)} min left). No entries before 10am — your system.`,
      now:  p && i.prevClose ? `${p > i.prevClose ? 'Above' : 'Below'} yesterday's close (${i.prevClose.toFixed(0)}); range building.` : 'Range building.',
      next: 'At 10:00: ORB defined → watch VWAP hold + range break for first setup.',
      risk: 'Entries in the first 30 min fight the open auction — wait it out.',
      plain: `The market just opened and is still finding its footing. Your own rule says don't trade the first 30 minutes — so right now the job is simply to watch and wait. In about ${Math.round(30 - i.sessionMinutes)} minutes you'll have a defined range to trade against.`,
    }
  }

  const aboveVwap = p !== null && i.vwap !== null ? p > i.vwap : null
  const gamma = i.gexRegime || (p && i.gammaFlip ? (p > i.gammaFlip ? 'positive' : 'negative') : null)

  const lvls: Array<[string, number | null]> = [
    ['VWAP', i.vwap], ['flip', i.gammaFlip], ['PDH', i.pdh], ['PDL', i.pdl],
    ['ORB-H', i.orbHigh], ['ORB-L', i.orbLow], ['call wall', i.callWall],
    ['put wall', i.putWall], ['prev close', i.prevClose], ['200EMA', i.ema200],
    ...(i.extraLevels || []),
  ]
  let nearAbove: [string, number] | null = null
  let nearBelow: [string, number] | null = null
  if (p !== null) {
    for (const [name, v] of lvls) {
      if (v == null) continue
      if (v > p && (!nearAbove || v < nearAbove[1])) nearAbove = [name, v]
      if (v <= p && (!nearBelow || v > nearBelow[1])) nearBelow = [name, v]
    }
  }

  let stance = 'WAIT'; let stanceColor = P.muted
  let headline = 'No clear edge — protect capital, let a setup come to you.'
  let plainStance = 'Conditions are mixed right now — there\'s no obvious advantage to being in a trade. The smart move is to sit on your hands until something cleaner develops.'
  const atFlip = p !== null && i.gammaFlip !== null && Math.abs(p - i.gammaFlip) < 4

  if (atFlip) {
    stance = 'CAUTION'; stanceColor = P.yellow
    headline = `Price pinned at the gamma flip (${i.gammaFlip!.toFixed(0)}) — regime transition zone, expect whips. Half size or stand aside.`
    plainStance = `The market is sitting right at a tipping point (${i.gammaFlip!.toFixed(0)}) where behavior tends to change character. Expect jerky, unpredictable moves here. If you trade at all, use half your normal size.`
  } else if (aboveVwap === true && gamma === 'positive') {
    stance = 'LONG BIAS'; stanceColor = P.green
    headline = 'Above VWAP in positive gamma — dips likely bought, dealers dampening. Favor longs on pullback holds.'
    plainStance = 'The market is in an uptrend and the environment favors steady, controlled moves. Small dips are likely to attract buyers — so the play is to buy those dips when they hold, rather than chase highs or fight the trend with shorts.'
  } else if (aboveVwap === true && gamma === 'negative') {
    stance = 'LONG BIAS'; stanceColor = P.green
    headline = 'Above VWAP but negative gamma — upside can extend fast, so can reversals. Longs OK, tighter stops.'
    plainStance = 'The trend points up, but the environment is unstable — moves in BOTH directions can accelerate quickly. Buying is reasonable, but keep stops tight because reversals here can be fast and violent.'
  } else if (aboveVwap === false && gamma === 'negative') {
    stance = 'SHORT BIAS'; stanceColor = P.red
    headline = 'Below VWAP in negative gamma — dealers amplify downside. Favor shorts on failed reclaims; moves run.'
    plainStance = 'The market is in a downtrend and the environment amplifies selling — down-moves tend to keep going. The play is to sell bounces that fail, not to catch falling knives with buys. Moves can run further than feels reasonable.'
  } else if (aboveVwap === false && gamma === 'positive') {
    stance = 'SHORT BIAS'; stanceColor = P.red
    headline = 'Below VWAP but positive gamma — grind-down tape; shorts work but targets modest (dealers dampen).'
    plainStance = 'The market is drifting lower, but the environment resists big moves — think slow grind, not crash. Shorts can work, but take profits early; don\'t expect a collapse.'
  } else if (aboveVwap !== null) {
    stance = aboveVwap ? 'LONG BIAS' : 'SHORT BIAS'
    stanceColor = aboveVwap ? P.green : P.red
    headline = `${aboveVwap ? 'Above' : 'Below'} VWAP — trade with the tape; gamma regime unavailable.`
    plainStance = `The market is ${aboveVwap ? 'above' : 'below'} its average price for the day, which favors ${aboveVwap ? 'buying' : 'selling'}. Go with that direction rather than against it.`
  }
  if (i.dayType === 'CONSOLIDATION' && stance !== 'CAUTION') {
    headline += ' Day type: consolidation — fade edges, don\'t chase middles.'
  }

  const fmtDist = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
  const now = p !== null
    ? [
        i.vwap !== null ? `VWAP ${fmtDist(p - i.vwap)}` : null,
        gamma ? `${gamma} gamma` : null,
        i.tick !== null ? `TICK ${i.tick > 0 ? '+' : ''}${Math.round(i.tick)}` : null,
        i.dayType ? i.dayType.toLowerCase() : null,
      ].filter(Boolean).join('  ·  ')
    : 'Waiting on price feed…'

  const nextParts: string[] = []
  if (nearAbove && p) nextParts.push(`↑ ${nearAbove[0]} ${nearAbove[1].toFixed(0)} (${(nearAbove[1] - p).toFixed(1)} away)`)
  if (nearBelow && p) nextParts.push(`↓ ${nearBelow[0]} ${nearBelow[1].toFixed(0)} (${(p - nearBelow[1]).toFixed(1)} away)`)
  if (i.armedTriggers.length > 0) nextParts.push(`${i.armedTriggers.length} trigger${i.armedTriggers.length > 1 ? 's' : ''} armed`)
  const next = nextParts.length ? nextParts.join('   |   ') : 'No mapped levels nearby.'

  const riskParts: string[] = []
  let plainRisk = ''
  if (gamma === 'negative') { riskParts.push('Negative gamma: moves extend — size down, honor stops fast'); plainRisk += ' Conditions are volatile, so trade smaller than usual.' }
  if (i.sessionMinutes > 330) { riskParts.push('Final 30 min — close-auction flows distort levels'); plainRisk += ' It\'s the last half hour — end-of-day money flows make prices erratic, so be cautious opening anything new.' }
  else if (i.sessionMinutes > 150 && i.sessionMinutes < 240) { riskParts.push('Lunch chop window — lower conviction on breaks'); plainRisk += ' It\'s the midday lull — breakouts often fail in this window, so trust them less.' }
  if (i.newsSnippet) riskParts.push('Calendar events today — check timing')
  if (i.planBias && stance.includes('BIAS')) {
    const planLong = /bull|long/i.test(i.planBias)
    const stanceLong = stance === 'LONG BIAS'
    if (planLong !== stanceLong) {
      riskParts.push(`⚠ Tape contradicts your ${i.planBias} plan — deviation check before entering`)
      plainRisk += ` Heads up: this morning you planned to be ${planLong ? 'a buyer' : 'a seller'}, but the market is doing the opposite. Pause and ask yourself whether you're following a real signal or abandoning your plan in the heat of the moment.`
    }
  }
  const risk = riskParts.length ? riskParts.join('   |   ') : 'No elevated risk flags.'

  // Plain-English NEXT
  let plainNext = ''
  if (nearAbove && nearBelow && p) {
    plainNext = ` The nearest ceiling is ${nearAbove[1].toFixed(0)} (${nearAbove[0]}) and the nearest floor is ${nearBelow[1].toFixed(0)} (${nearBelow[0]}) — a decisive move through either one is your cue to pay attention.`
  }

  return { stance, stanceColor, headline, now, next, risk, plain: plainStance + plainNext + plainRisk }
}

export interface SetupFireDisplay {
  name: string
  direction: 'LONG' | 'SHORT'
  detail: string
  level: number | null
  entrySpx: number
  predictedT1: number
  predictedStop: number
  measured: { hitRate: number | null; n: number } | null
  overlay: { verdict?: string; aiConfidence?: number; reasoning?: string } | null
  sizing?: string
  pending: boolean
  firedAt: number
}

export function FocusPanel(props: {
  inputs: FocusInputs; C: any; font: string; fontDisplay: string
  onGetSignal?: () => void; signalLoading?: boolean
  setupFire?: SetupFireDisplay | null; onDismissSetup?: () => void
}) {
  const { inputs, font, fontDisplay, onGetSignal, signalLoading, setupFire, onDismissSetup } = props
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('tz-focus-collapsed') === '1' } catch { return false }
  })
  const focus = useMemo(() => computeFocus(inputs), [inputs])

  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem('tz-focus-collapsed', c ? '0' : '1') } catch {}
      return !c
    })
  }

  const Row = ({ label, text, color, labelColor }: { label: string; text: string; color?: string; labelColor?: string }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, width: 42, flexShrink: 0,
        color: labelColor || P.muted, fontFamily: fontDisplay,
      }}>{label}</span>
      <span style={{ fontSize: 12, lineHeight: 1.45, color: color || P.soft }}>{text}</span>
    </div>
  )

  return (
    <div style={{
      margin: '8px 10px 4px', padding: 0,
      background: P.bg, border: `1px solid ${P.line}`, borderRadius: 10,
      borderLeft: `3px solid ${focus.stanceColor}`,
      fontFamily: font, overflow: 'hidden',
    }}>
      {/* ── SETUP ENGINE fire card (primary signal — shown above everything) ── */}
      {setupFire && (() => {
        const dirColor = setupFire.direction === 'LONG' ? P.green : P.red
        const verdict = setupFire.overlay?.verdict || null
        const verdictColor = verdict === 'CONFIRM' ? P.green : verdict === 'CONFLICT' ? P.red : P.yellow
        const measuredLine = setupFire.measured
          ? (setupFire.measured.hitRate !== null
              ? `measured ${setupFire.measured.hitRate}% (n=${setupFire.measured.n})`
              : `no decided sample yet (n=${setupFire.measured.n})`)
          : setupFire.pending ? 'measuring…' : 'no sample'
        const aiLine = setupFire.pending
          ? 'AI: checking…'
          : verdict
            ? `AI: ${verdict}${setupFire.sizing ? ` ${setupFire.sizing}` : ''}${setupFire.overlay?.aiConfidence != null ? ` (${setupFire.overlay.aiConfidence}%)` : ''}`
            : 'AI: unavailable'
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: `${dirColor}0d`, borderBottom: `1px solid ${P.line}`,
            borderLeft: `3px solid ${dirColor}`, margin: '-1px 0 0 -3px',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1.2, fontFamily: fontDisplay,
              color: '#0a0e1a', background: dirColor, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
            }}>⚡ SETUP · {setupFire.direction}</span>
            <span style={{ fontSize: 12, color: P.text, fontWeight: 700, flexShrink: 0 }}>
              {setupFire.name}
            </span>
            <span style={{ fontSize: 11.5, color: P.soft, flex: 1, minWidth: 0 }}>
              — {measuredLine} — <span style={{ color: verdict ? verdictColor : P.muted, fontWeight: 700 }}>{aiLine}</span>
              <span style={{ color: P.muted }}>
                {'  '}· entry {setupFire.entrySpx.toFixed(0)} · T1 {setupFire.predictedT1.toFixed(0)} · stop {setupFire.predictedStop.toFixed(0)}
              </span>
            </span>
            {onDismissSetup && (
              <button onClick={onDismissSetup} title="Dismiss" style={{
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${P.line}`, borderRadius: 5,
                color: P.soft, cursor: 'pointer', fontSize: 11, padding: '3px 8px', flexShrink: 0, fontFamily: font,
              }}>✕</button>
            )}
          </div>
        )
      })()}

      {/* Header row: stance pill · headline · GET SIGNAL · collapse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px' }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.2, fontFamily: fontDisplay,
          color: '#0a0e1a', background: focus.stanceColor,
          padding: '3px 10px', borderRadius: 20, flexShrink: 0,
        }}>{focus.stance}</span>
        <span style={{ fontSize: 12, lineHeight: 1.4, color: P.text, flex: 1, minWidth: 0 }}>
          {focus.headline}
        </span>
        {onGetSignal && (
          <button onClick={onGetSignal} disabled={!!signalLoading} style={{
            background: signalLoading ? 'rgba(255,255,255,0.08)' : P.cyan,
            border: 'none', borderRadius: 6,
            color: signalLoading ? P.muted : '#0a0e1a',
            cursor: signalLoading ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: 800, letterSpacing: 1,
            padding: '7px 14px', flexShrink: 0, fontFamily: fontDisplay,
            whiteSpace: 'nowrap' as const,
            boxShadow: signalLoading ? 'none' : `0 0 12px ${P.cyan}44`,
          }}>{signalLoading ? '⟳ ANALYZING…' : '▶ GET SIGNAL'}</button>
        )}
        <button onClick={toggle} title={collapsed ? 'Expand' : 'Collapse'} style={{
          background: 'rgba(255,255,255,0.05)', border: `1px solid ${P.line}`, borderRadius: 5,
          color: P.soft, cursor: 'pointer', fontSize: 11, padding: '4px 8px', flexShrink: 0, fontFamily: font,
        }}>{collapsed ? '▾' : '▴'}</button>
      </div>

      {!collapsed && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5, padding: '2px 12px 9px' }}>
            <Row label="NOW"  text={focus.now}  color={P.text} />
            <Row label="NEXT" text={focus.next} color={P.cyan} labelColor={`${P.cyan}99`} />
            <Row label="RISK" text={focus.risk}
                 color={focus.risk === 'No elevated risk flags.' ? P.muted : P.yellow}
                 labelColor={focus.risk === 'No elevated risk flags.' ? P.muted : `${P.yellow}99`} />
          </div>
          {/* Plain-English interpretation */}
          <div style={{
            padding: '8px 12px 9px', borderTop: `1px solid ${P.line}`,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, color: P.violet, fontFamily: fontDisplay, marginRight: 8 }}>
              IN PLAIN ENGLISH
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.55, color: P.soft, fontStyle: 'italic' as const }}>
              {focus.plain}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
