'use client'
import React from 'react'
import { useState } from 'react'

interface Props { onClose: () => void }

const font = "'JetBrains Mono', monospace"
const fontD = "'Barlow Condensed', sans-serif"
const C = {
  bg: '#060810', border: 'rgba(0,229,255,0.15)', teal: '#00e5ff',
  green: '#00ff88', red: '#ff1a4a', yellow: '#ffb700', orange: '#ff6b00',
  text: '#f0f4ff', muted: '#8899bb', dim: '#6b7a9a', dimmer: '#4a5568',
}

const steps = [
  {
    tag: 'Welcome — read this first',
    title: ['One AI companion.', 'Everything feeds it.'],
    accent: 1,
    content: 'welcome',
  },
  {
    tag: 'The AI Companion — what it knows',
    title: ['It reads everything', 'so you don\'t have to'],
    accent: 1,
    content: 'feeds',
  },
  {
    tag: 'The AI Companion — voice & chat',
    title: ['It talks to you.', 'You talk back.'],
    accent: 1,
    content: 'voice',
  },
  {
    tag: 'Tab 1 — Morning Plan',
    title: ['Your plan activates', 'the AI\'s intelligence'],
    accent: 1,
    content: 'plan',
  },
  {
    tag: 'Tab 2 — Summary: AI Signal',
    title: ['LONG · SHORT · WAIT', 'every 3 minutes'],
    accent: 1,
    content: 'signal',
  },
  {
    tag: 'Discipline engine',
    title: ['The AI enforces', 'your rules for you'],
    accent: 1,
    content: 'checklist',
  },
  {
    tag: 'Data that feeds the AI',
    title: ['Institutional flow.', 'Earnings catalysts.'],
    accent: 1,
    content: 'flow',
  },
  {
    tag: 'Market Score + Live header',
    title: ['One number tells you', 'how tradeable today is'],
    accent: 1,
    content: 'score',
  },
  {
    tag: 'You\'re ready',
    title: ['One companion.', 'All day. Every trade.'],
    accent: 1,
    content: 'start',
  },
]

function WelcomeContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        trAIde Zone isn't a data dashboard. It's an <strong style={{ color: C.text }}>AI trading companion</strong> that watches your entire session — live prices, options flow, your morning plan, your checklist score — and speaks to you like a disciplined coach throughout the day.
      </p>
      <div style={{ background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 8, padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,229,255,0.08)', border: `2px solid rgba(0,229,255,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🧠</div>
        <div>
          <div style={{ fontFamily: fontD, fontSize: 20, fontWeight: 900, color: C.teal, letterSpacing: 2 }}>AI COMPANION</div>
          <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.7, marginTop: 4 }}>
            Reads every data point the platform collects.<br />
            Reinforces your plan. Calls out when you're drifting.<br />
            Answers your questions in real-time, by voice.
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.85, margin: 0 }}>
        Every other feature — the checklist, the flow data, the market score, the earnings calendar — <strong style={{ color: C.text }}>exists to make the AI companion smarter.</strong> The companion is how all of it reaches you.
      </p>
    </div>
  )
}

function FeedsContent() {
  const feeds = [
    { color: C.green, title: 'Your Morning Plan', sub: 'Bias · key levels · implied move · thesis · gap setup' },
    { color: C.teal, title: 'Live Price vs Levels', sub: 'SPX vs VWAP · 200 EMA · PDH/PDL · recent candles' },
    { color: C.orange, title: 'Options Flow', sub: 'Top 15 institutional sweeps · sentiment · premium size' },
    { color: C.red, title: 'VIX + Market Tide', sub: 'Volatility regime · put/call ratio · sector breadth' },
    { color: C.yellow, title: 'Earnings This Week', sub: 'S&P500 reports · EPS est · expected move · timing' },
    { color: '#7b68ee', title: 'Your Trade History', sub: 'Win rate · patterns · best hours · revenge trade flags' },
    { color: '#00d4a0', title: 'Market News + Calendar', sub: 'Fed speakers · CPI · NFP · macro events today' },
    { color: C.dim, title: 'Pre-Trade Score', sub: '13-point checklist · grade · which rules you broke' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>Every 3 minutes, the AI ingests a full intelligence brief. This is what it has in context when you ask it a question or when it speaks to you unprompted.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {feeds.map(f => (
          <div key={f.title} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(0,229,255,0.05)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0, marginTop: 4 }} />
            <div>
              <div style={{ fontSize: 10.5, color: C.text, fontWeight: 600 }}>{f.title}</div>
              <div style={{ fontSize: 9, color: C.dim, marginTop: 1, lineHeight: 1.4 }}>{f.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VoiceContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The companion speaks analysis aloud through your speakers and listens for your questions via mic. Pick from 7 voices in Settings. Responses are always under 40 words — sharp and direct, not a lecture.</p>
      <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Live conversation</div>
        {[
          { from: 'AI', text: '"SPX just reclaimed VWAP. Flow is call-heavy and your bias is long — setup aligns. Watch 7050 for entry confirmation."' },
          { from: 'YOU', text: '"Should I take a trade right now?"' },
          { from: 'AI', text: '"Checklist is 8/13 — caution zone. Wait for the 10:30 candle to confirm. Don\'t force it."' },
        ].map((m, i) => (
          <div key={i} style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', alignItems: m.from === 'YOU' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1.5, color: m.from === 'AI' ? C.teal : C.green, marginBottom: 3 }}>{m.from}</div>
            <div style={{ background: m.from === 'AI' ? 'rgba(0,229,255,0.07)' : 'rgba(0,255,136,0.06)', border: `1px solid ${m.from === 'AI' ? 'rgba(0,229,255,0.15)' : 'rgba(0,255,136,0.15)'}`, borderRadius: 7, padding: '7px 11px', fontSize: 11, color: C.text, lineHeight: 1.6, maxWidth: '88%' }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {['onyx', 'nova', 'rachel', 'drew', 'sarah', 'paul', '+more'].map((v, i) => (
          <div key={v} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, background: i === 0 ? 'rgba(0,229,255,0.1)' : 'rgba(0,229,255,0.04)', border: `1px solid ${i === 0 ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.1)'}`, color: i === 0 ? C.teal : C.dim }}>{v}</div>
        ))}
      </div>
    </div>
  )
}

function PlanContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'rgba(0,229,255,0.05)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 12 }}>
        <div style={{ fontSize: 16 }}>⚡</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.teal, marginBottom: 3 }}>Fill this out before the open. Every day.</div>
          <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>Without a plan, the AI gives generic commentary. <strong style={{ color: C.text }}>With your plan filled in, it knows your bias, your levels, and your thesis</strong> — every response anchored to them all day.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {[
          { name: 'Implied Move ±pts', desc: 'Expected day range. AI knows if you\'re near the edges.' },
          { name: 'Key Levels', desc: 'Your S/R levels. AI alerts when SPX approaches them.' },
          { name: 'Directional Bias', desc: 'Long / Short / Neutral. AI signals align with your bias.' },
          { name: 'Morning Notes', desc: 'Your thesis in plain text. AI reads and references it all day.' },
        ].map(f => (
          <div key={f.name} style={{ background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.1)`, borderRadius: 6, padding: '9px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.teal, letterSpacing: 0.5, marginBottom: 3 }}>{f.name}</div>
            <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignalContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The signal is the AI's verdict — synthesized from everything it knows. It cross-references your plan, options flow, VIX, breadth, and your checklist score before committing to LONG, SHORT, or WAIT.</p>
      <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>AI signal — live</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fontD, fontSize: 44, fontWeight: 900, letterSpacing: 4, color: C.green }}>LONG</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: fontD, fontSize: 28, fontWeight: 700, color: C.green, opacity: 0.8 }}>78%</div>
            <div style={{ fontSize: 8, color: C.dim }}>AI confidence</div>
          </div>
        </div>
        {[['Reversal', 22, C.red], ['Continuation', 62, C.green], ['Chop', 16, C.yellow]].map(([l, v, c]) => (
          <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 9, color: C.dim, width: 76 }}>{l as string}</span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${v}%`, background: c as string, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: c as string, width: 28, textAlign: 'right' }}>{v}%</span>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(0,229,255,0.05)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 6, padding: '9px 12px', fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>
        The companion <strong style={{ color: C.text }}>speaks the signal aloud when it changes.</strong> You don't need to watch the screen — it tells you when conditions shift.
      </div>
    </div>
  )
}

function ChecklistContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The 13-point pre-trade checklist isn't a reminder. <strong style={{ color: C.text }}>The AI reads your score and adjusts its guidance.</strong> Score below 7? It tells you to stay out. Every time.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Pre-trade check</div>
          {[
            [true, 'After 10:00 AM EST'], [true, 'SPX direction clear'], [true, 'VWAP aligned with bias'],
            [false, 'Stop level defined'], [false, 'Risk ≤ 1% of account'], [false, 'Not chasing the move'],
          ].map(([ok, label], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: ok ? 'rgba(0,255,136,0.15)' : 'rgba(100,140,220,0.06)', border: `1px solid ${ok ? 'rgba(0,255,136,0.4)' : 'rgba(100,140,220,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: ok ? C.green : 'transparent', flexShrink: 0 }}>✓</div>
              <span style={{ fontSize: 10, color: ok ? C.text : C.dim }}>{label as string}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { grade: 'F', score: '3/13', color: C.red, says: 'AI says: Stay out' },
            { grade: 'A', score: '11/13', color: C.green, says: 'AI says: You\'re in system' },
          ].map(s => (
            <div key={s.grade} style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>SCORE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: fontD, fontSize: 30, fontWeight: 900, color: s.color }}>{s.grade}</span>
                <span style={{ fontFamily: fontD, fontSize: 20, fontWeight: 700, color: s.color, opacity: 0.7 }}>{s.score}</span>
              </div>
              <div style={{ fontSize: 9, color: s.color, marginTop: 3 }}>{s.says}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FlowContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The AI reads live institutional options flow and the earnings calendar so <strong style={{ color: C.text }}>it catches what you might miss.</strong> Big sweep against your bias? It flags it. Major earnings tonight? It factors it in.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Options flow</div>
          {[
            { t: 'SPY C', meta: '$708 · 05-15', p: '916K', bull: true },
            { t: 'SPX P', meta: '$7160 · 06-18', p: '860K', bull: false },
            { t: 'NVDA C', meta: '$180 · 05-29', p: '252K⚡', bull: true },
          ].map(r => (
            <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
              <span style={{ fontFamily: fontD, fontSize: 12, fontWeight: 900, color: r.bull ? C.green : C.red, minWidth: 44 }}>{r.t}</span>
              <span style={{ fontSize: 9, color: C.muted, flex: 1 }}>{r.meta}</span>
              <span style={{ fontFamily: fontD, fontSize: 11, fontWeight: 700, color: C.teal }}>{r.p}</span>
              <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: r.bull ? 'rgba(0,255,136,0.1)' : 'rgba(255,26,74,0.08)', color: r.bull ? C.green : C.red }}>{r.bull ? 'BULL' : 'BEAR'}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Earnings this week</div>
          {[
            { day: 'TUESDAY', stocks: [['TSLA','AMC','±7.2%'],['IBM','AMC','±4.1%']] },
            { day: 'WEDNESDAY', stocks: [['INTC','AMC','±8.5%'],['TXN','AMC','±4.8%']] },
          ].map(d => (
            <div key={d.day} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: C.yellow, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{d.day}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                {d.stocks.map(([s,t,m]) => (
                  <div key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 4, padding: '3px 7px' }}>
                    <span style={{ fontFamily: fontD, fontSize: 11, fontWeight: 700, color: C.text }}>{s}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: '#ff9900' }}>{t}</span>
                    <span style={{ fontSize: 8, color: C.teal }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScoreContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The Market Score (0–100) combines VIX, breadth, flow sentiment, VWAP position, and tide into a single tradability number. <strong style={{ color: C.text }}>The AI uses this score in every response.</strong> Score, SPX, VWAP, and 200 EMA are always visible in the top bar.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>LIVE HEADER — ALWAYS ON</div>
          {[['SPX','7,116','▲1.06%',C.green],['VIX','17.48','▼11.3%',C.red],['VWAP','7,126','▲',C.green],['200 EMA','7,065','▲',C.green]].map(([l,v,c,col]) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: C.dim }}>{l as string}</span>
              <span style={{ fontFamily: fontD, fontSize: 15, fontWeight: 700, color: C.text }}>{v as string} <span style={{ fontSize: 10, color: col as string }}>{c as string}</span></span>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(0,229,255,0.15)`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>MARKET SCORE</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: fontD, fontSize: 16, fontWeight: 700, color: C.green, letterSpacing: 2 }}>BULLISH</div>
            <div style={{ fontFamily: fontD, fontSize: 36, fontWeight: 900, color: C.green }}>69<span style={{ fontSize: 16, color: C.dim, fontWeight: 400 }}>/100</span></div>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 6 }}>
            <div style={{ height: '100%', width: '69%', background: C.green, borderRadius: 2 }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>Score below 40 = AI says wait.<br />Score above 70 = AI leans bullish.</div>
        </div>
      </div>
    </div>
  )
}

function StartContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, margin: 0 }}>The AI companion is with you from market open to close — speaking signals, flagging risks, calling out when you're drifting from your plan. <strong style={{ color: C.text }}>The more you use it, the more it knows about how you trade.</strong></p>
      <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontFamily: fontD, fontSize: 18, fontWeight: 900, color: C.green, letterSpacing: 1, marginBottom: 10 }}>Start your first session</div>
        {[
          ['1', 'Open Morning Plan and fill out today\'s setup — bias, key levels, implied move, your thesis'],
          ['2', 'Work through the Pre-Trade Checklist. Get your score above 7 before any trade'],
          ['3', 'Go to Summary and tap the mic — ask "What\'s the setup?" and let the companion brief you'],
          ['4', 'Ask it anything throughout the day: "Should I take this?" "Am I chasing?" "What does flow say?"'],
        ].map(([n, t]) => (
          <div key={n as string} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)', color: C.green, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n as string}</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{t as string}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6, textAlign: 'center' as const }}>In Settings ⚙, set your name and pick a voice. The companion greets you by name every morning.</div>
    </div>
  )
}

const contentMap: Record<string, () => React.ReactElement> = {
  welcome: WelcomeContent, feeds: FeedsContent, voice: VoiceContent,
  plan: PlanContent, signal: SignalContent, checklist: ChecklistContent,
  flow: FlowContent, score: ScoreContent, start: StartContent,
}

export default function TutorialModal({ onClose }: Props) {
  const [cur, setCur] = useState(0)
  const total = steps.length
  const step = steps[cur]
  const Content = contentMap[step.content]
  const isLast = cur === total - 1

  function handleClose() {
    localStorage.setItem('tz-tutorial-seen', '1')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,14,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', fontFamily: font }}>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,229,255,0.08)' }}>

        {/* Scanlines */}
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,0.012) 2px, rgba(0,229,255,0.012) 4px)', pointerEvents: 'none', borderRadius: 12, zIndex: 0 }} />

        {/* Header */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: `1px solid rgba(0,229,255,0.12)`, background: 'rgba(0,229,255,0.03)', flexShrink: 0 }}>
          <div style={{ fontFamily: fontD, fontSize: 20, fontWeight: 900, color: C.teal, letterSpacing: 2 }}>tr<span style={{ color: C.green }}>AI</span>de Zone</div>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 2 }}>STEP {cur + 1} OF {total}</div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: 'rgba(0,229,255,0.08)', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${((cur + 1) / total) * 100}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.green})`, transition: 'width 0.4s ease' }} />
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, padding: '20px 22px 14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 2, color: C.teal, textTransform: 'uppercase' }}>{step.tag}</div>
          <div style={{ fontFamily: fontD, fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: 1, lineHeight: 1.1 }}>
            {step.title[0]}<br />
            <span style={{ color: C.green }}>{step.title[1]}</span>
          </div>
          <Content />
        </div>

        {/* Nav */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderTop: `1px solid rgba(0,229,255,0.08)`, background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
          <button onClick={() => cur > 0 ? setCur(c => c - 1) : null} style={{ fontFamily: font, fontSize: 11, fontWeight: 600, padding: '7px 16px', borderRadius: 5, cursor: cur > 0 ? 'pointer' : 'default', letterSpacing: 0.5, border: 'none', background: 'transparent', color: cur > 0 ? C.dim : 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: cur > 0 ? 'rgba(100,140,220,0.15)' : 'transparent' }}>← Back</button>

          {/* Dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((_, i) => (
              <div key={i} onClick={() => setCur(i)} style={{ width: 6, height: 6, borderRadius: '50%', background: i === cur ? C.teal : 'rgba(0,229,255,0.18)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: i === cur ? `0 0 6px rgba(0,229,255,0.5)` : 'none' }} />
            ))}
          </div>

          <button
            onClick={isLast ? handleClose : () => setCur(c => c + 1)}
            style={{ fontFamily: font, fontSize: 11, fontWeight: 600, padding: '7px 16px', borderRadius: 5, cursor: 'pointer', letterSpacing: 0.5, border: 'none', background: isLast ? 'rgba(0,255,136,0.12)' : 'rgba(0,229,255,0.1)', color: isLast ? C.green : C.teal, borderWidth: 1, borderStyle: 'solid', borderColor: isLast ? 'rgba(0,255,136,0.3)' : 'rgba(0,229,255,0.3)' }}
          >
            {isLast ? "Let's begin →" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
