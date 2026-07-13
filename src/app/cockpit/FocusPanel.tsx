/**
 * FocusPanel — the anti-busy module.
 *
 * One always-visible strip that answers "what should I be doing or
 * thinking about RIGHT NOW" in four lines: STANCE, NOW, NEXT, RISK.
 * Fully deterministic (no LLM call): recomputes instantly from live
 * cockpit state on every render. The companion is one click away for
 * depth — this is the 2-second glance between candles.
 */

'use client'

import { useMemo, useState } from 'react'

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
  gexRegime: string | null       // 'positive' | 'negative' | derived upstream
  dayType: string | null
  tick: number | null
  sessionMinutes: number         // minutes since 9:30 ET (negative = pre-market)
  planBias: string | null
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
}

function computeFocus(i: FocusInputs, C: any): Focus {
  const p = i.currentPrice

  // ── Pre-session / opening range ──────────────────────────────────────
  if (i.sessionMinutes < 0) {
    return {
      stance: 'PRE-MARKET', stanceColor: C.muted,
      headline: 'Session not open. Review the plan, set triggers, no positions.',
      now:  i.planBias ? `Plan bias: ${i.planBias.toUpperCase()}` : 'No morning plan set — write one before the open.',
      next: `Open in ${Math.abs(Math.round(i.sessionMinutes))} min. First 30 min = observation only (your rule).`,
      risk: i.newsSnippet ? 'Economic events today — check calendar timing before sizing.' : 'No calendar risk flagged.',
    }
  }
  if (i.sessionMinutes < 30) {
    return {
      stance: 'STAND DOWN', stanceColor: C.yellow,
      headline: `Opening range forming (${Math.round(30 - i.sessionMinutes)} min left). No entries before 10am — your system.`,
      now:  p && i.prevClose ? `${p > i.prevClose ? 'Above' : 'Below'} yesterday's close (${i.prevClose.toFixed(0)}); range building.` : 'Range building.',
      next: 'At 10:00: ORB defined → watch VWAP hold + range break for first setup.',
      risk: 'Entries in the first 30 min fight the open auction — wait it out.',
    }
  }

  // ── Structure read ────────────────────────────────────────────────────
  const aboveVwap = p !== null && i.vwap !== null ? p > i.vwap : null
  const gamma = i.gexRegime || (p && i.gammaFlip ? (p > i.gammaFlip ? 'positive' : 'negative') : null)

  // Nearest actionable levels above/below
  const lvls: Array<[string, number | null]> = [
    ['VWAP', i.vwap], ['flip', i.gammaFlip], ['PDH', i.pdh], ['PDL', i.pdl],
    ['ORB-H', i.orbHigh], ['ORB-L', i.orbLow], ['call wall', i.callWall],
    ['put wall', i.putWall], ['prev close', i.prevClose], ['200EMA', i.ema200],
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

  // ── Stance ────────────────────────────────────────────────────────────
  let stance = 'WAIT'; let stanceColor = C.muted; let headline = 'No clear edge — protect capital, let a setup come to you.'
  const atFlip = p !== null && i.gammaFlip !== null && Math.abs(p - i.gammaFlip) < 4

  if (atFlip) {
    stance = 'CAUTION'; stanceColor = C.yellow
    headline = `Price pinned at the gamma flip (${i.gammaFlip!.toFixed(0)}) — regime transition zone, expect whips. Half size or stand aside.`
  } else if (aboveVwap === true && gamma === 'positive') {
    stance = 'LONG BIAS'; stanceColor = C.green
    headline = 'Above VWAP in positive gamma — dips likely bought, dealers dampening. Favor longs on pullback holds.'
  } else if (aboveVwap === true && gamma === 'negative') {
    stance = 'LONG BIAS'; stanceColor = C.green
    headline = 'Above VWAP but negative gamma — upside can extend fast, so can reversals. Longs OK, tighter stops.'
  } else if (aboveVwap === false && gamma === 'negative') {
    stance = 'SHORT BIAS'; stanceColor = C.red
    headline = 'Below VWAP in negative gamma — dealers amplify downside. Favor shorts on failed reclaims; moves run.'
  } else if (aboveVwap === false && gamma === 'positive') {
    stance = 'SHORT BIAS'; stanceColor = C.red
    headline = 'Below VWAP but positive gamma — grind-down tape; shorts work but targets modest (dealers dampen).'
  } else if (aboveVwap !== null) {
    stance = aboveVwap ? 'LONG BIAS' : 'SHORT BIAS'
    stanceColor = aboveVwap ? C.green : C.red
    headline = `${aboveVwap ? 'Above' : 'Below'} VWAP — trade with the tape; gamma regime unavailable.`
  }
  if (i.dayType === 'CONSOLIDATION' && stance !== 'CAUTION') {
    headline += ' Day type: consolidation — fade edges, don\'t chase middles.'
  }

  // ── NOW / NEXT / RISK lines ───────────────────────────────────────────
  const fmtDist = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
  const now = p !== null
    ? [
        i.vwap !== null ? `VWAP ${fmtDist(p - i.vwap)}` : null,
        gamma ? `${gamma} gamma` : null,
        i.tick !== null ? `TICK ${i.tick > 0 ? '+' : ''}${Math.round(i.tick)}` : null,
        i.dayType ? i.dayType.toLowerCase() : null,
      ].filter(Boolean).join(' · ')
    : 'Waiting on price feed…'

  const nextParts: string[] = []
  if (nearAbove && p) nextParts.push(`↑ ${nearAbove[0]} ${nearAbove[1].toFixed(0)} (${(nearAbove[1] - p).toFixed(1)} away)`)
  if (nearBelow && p) nextParts.push(`↓ ${nearBelow[0]} ${nearBelow[1].toFixed(0)} (${(p - nearBelow[1]).toFixed(1)} away)`)
  if (i.armedTriggers.length > 0) nextParts.push(`${i.armedTriggers.length} trigger${i.armedTriggers.length > 1 ? 's' : ''} armed`)
  const next = nextParts.length ? nextParts.join('  |  ') : 'No mapped levels nearby.'

  const riskParts: string[] = []
  if (gamma === 'negative') riskParts.push('Negative gamma: moves extend — size down, honor stops fast')
  if (i.sessionMinutes > 330) riskParts.push('Final 30 min — close-auction flows distort levels')
  else if (i.sessionMinutes > 150 && i.sessionMinutes < 240) riskParts.push('Lunch chop window — lower conviction on breaks')
  if (i.newsSnippet) riskParts.push('Calendar events today — check timing')
  if (i.planBias && stance.includes('BIAS')) {
    const planLong = /bull|long/i.test(i.planBias)
    const stanceLong = stance === 'LONG BIAS'
    if (planLong !== stanceLong) riskParts.push(`⚠ Tape contradicts your ${i.planBias} plan — deviation check before entering`)
  }
  const risk = riskParts.length ? riskParts.join('  |  ') : 'No elevated risk flags.'

  return { stance, stanceColor, headline, now, next, risk }
}

export function FocusPanel(props: { inputs: FocusInputs; C: any; font: string; fontDisplay: string }) {
  const { inputs, C, font, fontDisplay } = props
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('tz-focus-collapsed') === '1' } catch { return false }
  })
  const focus = useMemo(() => computeFocus(inputs, C), [inputs, C])

  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem('tz-focus-collapsed', c ? '0' : '1') } catch {}
      return !c
    })
  }

  const Row = ({ label, text, color }: { label: string; text: string; color?: string }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, color: C.muted, width: 34, flexShrink: 0, fontFamily: fontDisplay }}>{label}</span>
      <span style={{ fontSize: 11, color: color || C.text, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
    </div>
  )

  return (
    <div style={{
      margin: '6px 10px 2px', padding: collapsed ? '6px 12px' : '8px 12px',
      background: `linear-gradient(135deg, ${focus.stanceColor}0a, rgba(0,0,0,0.25))`,
      border: `1px solid ${focus.stanceColor}33`, borderRadius: 8,
      fontFamily: font, cursor: 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: focus.stanceColor,
          fontFamily: fontDisplay, flexShrink: 0,
        }}>{focus.stance}</span>
        <span style={{ fontSize: 11, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: collapsed ? 'nowrap' as const : 'normal' as const }}>
          {focus.headline}
        </span>
        <button onClick={toggle} style={{
          background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer',
          fontSize: 11, padding: '2px 4px', flexShrink: 0, fontFamily: font,
        }}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3, marginTop: 6 }}>
          <Row label="NOW"  text={focus.now} />
          <Row label="NEXT" text={focus.next} color={C.cyan} />
          <Row label="RISK" text={focus.risk} color={focus.risk === 'No elevated risk flags.' ? C.muted : C.yellow} />
        </div>
      )}
    </div>
  )
}
