'use client'
import React from 'react'
import { useState } from 'react'

interface Props { onClose: () => void }

const font = "'JetBrains Mono', monospace"
const fontD = "'Barlow Condensed', sans-serif"
const C = {
  bg: '#060810', border: 'rgba(0,229,255,0.15)', teal: '#00e5ff',
  green: '#00ff88', red: '#ff1a4a', yellow: '#ffb700', orange: '#ff6b00',
  purple: '#7c6aff', text: '#f0f4ff', muted: '#8899bb', dim: '#6b7a9a', dimmer: '#4a5568',
}

const steps = [
  { tag: 'Welcome',                       title: ['Discipline is the edge.', 'We help you keep it.'],         content: 'welcome' },
  { tag: 'Step 1 — Morning Plan',          title: ['Commit to a plan', 'before the bell'],                     content: 'plan' },
  { tag: 'Step 2 — Read the Setup',        title: ['Watch dealer mechanics', 'and market structure'],          content: 'mechanics' },
  { tag: 'Step 3 — Name Your Play',        title: ['Score your setup', "against today's conditions"],          content: 'namedplay' },
  { tag: 'Step 4 — Get the Signal',        title: ['AI signal validates', 'or challenges your read'],          content: 'signal' },
  { tag: 'Step 5 — Pick the Strike',       title: ['Exact contract', 'with calculated math'],                  content: 'strikes' },
  { tag: 'Step 6 — Execute the Trade',     title: ['Trade ticket logs', 'every decision'],                     content: 'ticket' },
  { tag: 'Step 7 — Companion Coaches',     title: ['AI sees your trade', 'and helps you manage'],              content: 'companion' },
  { tag: 'The Learning Loop',              title: ['It learns YOU', 'over every trade'],                       content: 'learning' },
]

function WelcomeContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        trAIde Zone is an AI-powered signal and coaching platform for SPX intraday options traders. We generate real-time signals, identify the exact strikes to buy, score your named setups, and coach you through execution.
      </p>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        But here's the truth: <strong style={{ color: C.text }}>the system won't make a bad trader good.</strong> It makes a disciplined trader more disciplined. Every feature exists to help you trade YOUR plan with rigor — not to replace your judgment.
      </p>
      <div style={{ background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: fontD, fontSize: 13, fontWeight: 900, color: C.teal, letterSpacing: 2, marginBottom: 6 }}>WHAT YOU GET</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.9 }}>
          <strong style={{ color: C.text }}>AI signals</strong> — LONG/SHORT/WAIT with full reasoning<br />
          <strong style={{ color: C.text }}>Strike suggestions</strong> — exact contracts with calculated premiums<br />
          <strong style={{ color: C.text }}>Setup evaluator</strong> — score your 7 named plays against live data<br />
          <strong style={{ color: C.text }}>Dealer mechanics</strong> — see what market makers must do<br />
          <strong style={{ color: C.text }}>AI companion</strong> — real-time coaching during trades<br />
          <strong style={{ color: C.text }}>Learning loop</strong> — system gets sharper for YOUR style
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
        The next 8 steps walk through the daily workflow — the sequence we recommend to make every trade more disciplined than the last.
      </p>
    </div>
  )
}

function PlanContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Before market open, you commit to a framework. This is where discipline starts — emotions can't override a written plan.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { c: C.green,  t: 'Morning Brief', s: "AI macro context with today's bias, key levels, catalysts, biggest risk" },
          { c: C.teal,   t: 'Directional Bias', s: 'LONG/SHORT/NEUTRAL — committed before you see the open' },
          { c: C.yellow, t: 'Implied Move', s: "Today's expected range — sizes your trade math" },
          { c: C.orange, t: 'Gap + Pre-Market', s: 'Where SPX opens vs prior close, gap fill probability' },
          { c: C.purple, t: 'Max Loss Today', s: 'Hard stop for the day — circuit breaker activates if hit' },
          { c: C.red,    t: 'Trade Rules', s: 'Your specific entries, position sizes, time windows' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '7px 9px', borderLeft: `2px solid ${x.c}` }}>
            <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: x.c }}>{x.t}</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{x.s}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(255,183,0,0.04)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.yellow }}>
        ! <strong>No plan = no trade.</strong> The system blocks signal evaluation if Morning Plan isn't saved.
      </div>
    </div>
  )
}

function MechanicsContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Most retail traders don't understand WHY price moves the way it does intraday. We surface the mechanical forces — dealer hedging requirements based on their gamma positioning — so you can position with the flow, not against it.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { c: C.green,  t: 'Positive Gamma Regime', s: 'Dealers must SELL rallies and BUY dips → mean-reverting, range-bound day' },
          { c: C.red,    t: 'Negative Gamma Regime', s: 'Dealers must CHASE moves → trending, explosive day, breakouts run' },
          { c: C.yellow, t: 'Asymmetric Setup', s: 'When options flow + gamma positioning ALIGN → high-probability amplified move' },
          { c: C.purple, t: 'Charm Pressure', s: 'Forced dealer hedging into close — creates drift toward call/put walls' },
          { c: C.teal,   t: 'Volume Profile (POC/VAH/VAL)', s: 'Where institutions actually traded — visual S/R map at a glance' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 11px', borderLeft: `2px solid ${x.c}` }}>
            <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: x.c }}>{x.t}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{x.s}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
        You're not playing against the dealers. You're recognizing their mechanical constraints and trading WITH them.
      </p>
    </div>
  )
}

function NamedPlayContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Before you take a trade, you must <strong style={{ color: C.text }}>name what you're playing</strong>. This is the discipline checkpoint. If you can't name it, you can't trade it.
      </p>
      <div style={{ background: 'rgba(124,106,255,0.04)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 6, padding: '8px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.purple, letterSpacing: 1.5, marginBottom: 6 }}>9 NAMED PLAYS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, fontSize: 12, color: C.muted }}>
          <div>▲ VWAP Retest Bounce</div>
          <div>▼ VWAP Retest Reject</div>
          <div>▲ Opening Range Breakout</div>
          <div>▼ Opening Range Breakdown</div>
          <div>▲ Prior Day High Breakout</div>
          <div>▼ Prior Day Low Breakdown</div>
          <div>▼ Double Top (Supply Zone)</div>
          <div>▲ Double Bottom (Demand Zone)</div>
          <div>▲ Trend Line Break (LONG)</div>
          <div>▼ Trend Line Break (SHORT)</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>
        Select your setup and the system scores it 0-100 against current conditions using setup-specific criteria. Each criterion shows ✓ PASS / ✗ FAIL / ○ NEUTRAL with the actual data value.
      </p>
      <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.green }}>
        STRONG (75+) → high-conviction setup<br />
        GOOD (60-74) → tradeable but watch flags<br />
        NEUTRAL (45-59) → mixed signals, smaller size<br />
        WEAK/AVOID (&lt;45) → setup not present in data
      </div>
    </div>
  )
}

function SignalContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Once your play is named, fire the AI signal. It synthesizes 25+ data streams into LONG/SHORT/WAIT with full reasoning — and either validates your read or challenges it.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { c: C.teal,   t: 'Signal Direction + Confidence', s: 'LONG/SHORT/WAIT with calibrated confidence vs your historical accuracy' },
          { c: C.green,  t: 'Entry Zone, Stop, Targets', s: 'Specific SPX prices — not "around 5820"' },
          { c: C.yellow, t: "AI's Independent View", s: 'What the AI sees, citing specific data (TICK +400, GEX positive, etc.)' },
          { c: C.purple, t: 'Multi-TF Alignment', s: 'Do 5min/15min/1hr/daily agree? Mixed = lower probability' },
          { c: C.red,    t: 'Risk Flag', s: 'What could invalidate the setup — the thing to watch for' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 11px', borderLeft: `2px solid ${x.c}` }}>
            <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: x.c }}>{x.t}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{x.s}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 6, padding: '8px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.teal, letterSpacing: 1.5, marginBottom: 4 }}>ACTIONABILITY FILTER</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
          Above the signal, a banner shows <strong style={{ color: C.green }}>✓ ACTIONABLE</strong> / <strong style={{ color: C.yellow }}>WATCH</strong> / <strong style={{ color: C.red }}>✕ NOISE</strong> — combining signal quality, mechanical flow, news blackouts, and liquidity into one verdict.
        </div>
      </div>
    </div>
  )
}

function StrikesContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        When the signal fires, the system instantly generates 3-5 specific SPX strikes ranked by tier. Every premium is <strong style={{ color: C.text }}>Black-Scholes calculated</strong> from live IV — no guessing.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { c: C.red,    t: 'AGGRESSIVE', s: 'ATM or 1-5pt ITM, highest gamma, cheapest premium, most volatile' },
          { c: C.teal,   t: 'STANDARD (recommended)', s: '5-12pt ITM, delta ~0.65-0.75, best risk/reward' },
          { c: C.green,  t: 'CONSERVATIVE', s: '12-20pt ITM, delta ~0.80+, expensive but moves 1:1 with SPX' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 11px', borderLeft: `3px solid ${x.c}` }}>
            <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: x.c, letterSpacing: 1 }}>{x.t}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{x.s}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.75, margin: 0 }}>
        Each card shows entry premium range, target/stop in dollars, delta-adjusted P&L per contract, confluence score (HIGH/MEDIUM/LOW), and the exact levels anchoring the strike (VWAP+POC, GEX wall, PDH, etc.).
      </p>
      <div style={{ background: 'rgba(255,183,0,0.04)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.yellow }}>
        <strong>Tap any strike card</strong> to auto-fill the trade ticket with that contract and entry price.
      </div>
    </div>
  )
}

function TicketContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        The Trade Ticket isn't just for logging — it's the discipline checkpoint that captures every decision and feeds the learning loop.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { n: 1, t: 'Strike + Type + Expiry', s: 'Locked in from the strike card you tapped' },
          { n: 2, t: 'Entry Premium', s: 'Adjust to actual fill price' },
          { n: 3, t: 'Quantity', s: 'Sized per your morning plan rules' },
          { n: 4, t: 'BUY → position opens', s: 'Timestamp captured, AI companion enters management mode' },
          { n: 5, t: 'Exit Premium + SELL', s: 'P&L calculated, full context snapshot saved' },
        ].map((x) => (
          <div key={x.n} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '7px 11px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontFamily: fontD, fontSize: 16, fontWeight: 900, color: C.teal, lineHeight: 1, minWidth: 18 }}>{x.n}</span>
            <div>
              <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: C.text }}>{x.t}</div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{x.s}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
        Every closed trade saves: mechanical flow, actionability verdict, setup name + score, predicted entry window, and full market snapshot. This is what makes the system smarter tomorrow.
      </p>
    </div>
  )
}

function CompanionContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Your AI companion is always watching. When you open a trade, it shifts from signal-evaluation mode to trade-management mode — and sees everything you do.
      </p>
      <div style={{ background: 'rgba(124,106,255,0.04)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontFamily: fontD, fontSize: 13, fontWeight: 900, color: C.purple, letterSpacing: 2, marginBottom: 6 }}>WHAT IT SEES IN-TRADE</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.85 }}>
          • Your active strike, entry price, current P&L<br />
          • Time since entry, time to close<br />
          • Mechanical flow shifts (charm activating, gamma flip approaching)<br />
          • Your named setup status — is it still valid?<br />
          • Real-time microstructure (TICK, cumulative delta, dark pool)<br />
          • Whether you're drifting from your morning plan
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>
        Ask "<em style={{ color: C.text }}>should I take partial here?</em>" or "<em style={{ color: C.text }}>is the setup still working?</em>" — it answers specifically about YOUR trade with current data, not generic advice.
      </p>
      <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.green }}>
        <strong>Pick your coaching tone</strong> in Settings — Drill Sergeant, Mentor, Analytical, Calm, or Encouraging. The companion's voice and energy adapt to how you want to be coached.
      </div>
    </div>
  )
}

function LearningContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Every signal you fire and every trade you close adds to your personal learning loop. After 20-30 scored trades, the system starts to know <strong style={{ color: C.text }}>your specific edge</strong>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { c: C.teal,   t: '25+ Data Streams Tracked', s: "Each stream's accuracy at predicting YOUR wins is measured nightly" },
          { c: C.green,  t: 'Setup Win Rates Per Play', s: 'Which of your 7 setups actually work for you — and when' },
          { c: C.yellow, t: 'Behavioral Pattern Discovery', s: 'AI finds rules from your trade history (e.g. "wins drop 28% after 2pm")' },
          { c: C.purple, t: 'Personalized Morning Brief', s: "Tomorrow's brief references your specific strengths + weaknesses" },
          { c: C.red,    t: 'Conviction Calibration', s: 'Model confidence gets corrected by your historical accuracy at each band' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 11px', borderLeft: `2px solid ${x.c}` }}>
            <div style={{ fontFamily: fontD, fontSize: 12, fontWeight: 800, color: x.c }}>{x.t}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{x.s}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const }}>
        <div style={{ fontFamily: fontD, fontSize: 14, fontWeight: 900, color: C.teal, letterSpacing: 2, marginBottom: 4 }}>YOU'RE READY</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          The system won't make you a better trader overnight.<br />
          It will make every trade more disciplined than the last.
        </div>
      </div>
    </div>
  )
}

const ContentMap: Record<string, React.FC> = {
  welcome:   WelcomeContent,
  plan:      PlanContent,
  mechanics: MechanicsContent,
  namedplay: NamedPlayContent,
  signal:    SignalContent,
  strikes:   StrikesContent,
  ticket:    TicketContent,
  companion: CompanionContent,
  learning:  LearningContent,
}

export default function TutorialModal({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const s = steps[step]
  const isLast = step === steps.length - 1
  const Content = ContentMap[s.content] || (() => null)

  return (
    <div onClick={onClose} style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' as const }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 80px rgba(0,229,255,0.1), 0 0 0 1px rgba(0,229,255,0.05)' }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid rgba(255,255,255,0.06)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: font, fontSize: 11, color: C.dim, letterSpacing: 2, textTransform: 'uppercase' as const }}>{s.tag}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '12px 22px 0', display: 'flex', gap: 4 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ flex: 1, height: 3, borderRadius: 1, cursor: 'pointer', background: i <= step ? C.teal : 'rgba(255,255,255,0.06)', transition: 'background 0.2s' }} />
          ))}
        </div>

        <div style={{ padding: '14px 22px 8px' }}>
          <div style={{ fontFamily: fontD, fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: 1, lineHeight: 1.1 }}>{s.title[0]}</div>
          <div style={{ fontFamily: fontD, fontSize: 26, fontWeight: 900, color: C.teal, letterSpacing: 1, lineHeight: 1.1, marginTop: 2 }}>{s.title[1]}</div>
        </div>

        <div style={{ padding: '8px 22px 20px', flex: 1, overflowY: 'auto' as const, minHeight: 0 }}>
          <Content />
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid rgba(255,255,255,0.06)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button
            disabled={step === 0}
            onClick={() => setStep(s => Math.max(0, s - 1))}
            style={{ background: 'transparent', border: 'none', color: step === 0 ? C.dimmer : C.muted, fontFamily: font, fontSize: 12, cursor: step === 0 ? 'not-allowed' : 'pointer', padding: '6px 4px' }}
          >← Back</button>
          <div style={{ fontFamily: font, fontSize: 11.5, color: C.dim }}>{step + 1} / {steps.length}</div>
          {isLast ? (
            <button onClick={onClose} style={{ background: C.teal, border: 'none', color: '#000', fontFamily: fontD, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer', padding: '8px 18px', borderRadius: 6 }}>START TRADING →</button>
          ) : (
            <button onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))} style={{ background: 'rgba(0,229,255,0.1)', border: `1px solid ${C.teal}`, color: C.teal, fontFamily: font, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 14px', borderRadius: 5 }}>Next →</button>
          )}
        </div>
      </div>
    </div>
  )
}
