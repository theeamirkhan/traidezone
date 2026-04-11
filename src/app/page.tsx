'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [spx, setSpx] = useState<string>('—')
  const [vix, setVix] = useState<string>('—')
  const [spxChange, setSpxChange] = useState<string>('')

  useEffect(() => {
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/SPY/range/1/day/2026-04-01/2026-04-11?adjusted=true&sort=desc&limit=2')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) {
          const c = d.results[0]
          setSpx(c.c.toFixed(2))
          const chg = ((c.c - c.o) / c.o * 100).toFixed(2)
          setSpxChange((parseFloat(chg) >= 0 ? '+' : '') + chg + '%')
        }
      }).catch(() => {})
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/I:VIX1D/range/1/day/2026-04-01/2026-04-11?adjusted=true&sort=desc&limit=1')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) setVix(d.results[0].c.toFixed(2))
      }).catch(() => {})
  }, [])

  const handleGetAccess = () => {
    router.push(email ? `/sign-up?email=${encodeURIComponent(email)}` : '/sign-up')
  }

  return (
    <div style={{ background: '#080a0f', minHeight: '100vh', color: '#e8eaf0', fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@300;400;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #080a0f; overflow-x: hidden; }
        .syne { font-family: 'Syne', sans-serif; }
        .green { color: #00d4a0; }
        .dim { color: #6b7280; }
        a { text-decoration: none; color: inherit; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,10,15,0.92)', backdropFilter: 'blur(12px)', flexWrap: 'wrap', gap: 12 }}>
        <div className="syne" style={{ fontSize: 20, fontWeight: 800 }}>tr<span className="green">AI</span>de Zone</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="#how" style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>How it works</a>
          <a href="#pricing" style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Pricing</a>
          <button onClick={() => router.push('/sign-up')} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '8px 16px', background: '#00d4a0', color: '#080a0f', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Get Started</button>
          <button onClick={() => router.push('/sign-in')} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '8px 16px', background: 'transparent', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer' }}>Sign In</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 24px 60px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', border: '1px solid rgba(0,212,160,0.3)', borderRadius: 99, fontSize: 11, color: '#00d4a0', letterSpacing: '1px', textTransform: 'uppercase' as const, marginBottom: 32 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4a0', animation: 'pulse 2s infinite' }} />
          Now in early access
        </div>
        <h1 className="syne" style={{ fontSize: 'clamp(40px, 8vw, 88px)', fontWeight: 800, lineHeight: 1.0, letterSpacing: '-2px', marginBottom: 24 }}>
          Your AI companion<br />for <span className="green">disciplined</span><br /><span className="dim">trading.</span>
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', maxWidth: 480, lineHeight: 1.7, marginBottom: 40, fontWeight: 300 }}>
          tr<span className="green">AI</span>de Zone sits with you during every trade — watching the chart, knowing your rules, and keeping you accountable in real time.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 400 }}>
          <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGetAccess()}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '14px 18px', color: '#e8eaf0', fontFamily: 'inherit', fontSize: 13, outline: 'none', width: '100%' }} />
          <button className="syne" onClick={handleGetAccess} style={{ fontSize: 15, fontWeight: 800, padding: '16px 28px', background: '#00d4a0', color: '#080a0f', border: 'none', borderRadius: 8, cursor: 'pointer', width: '100%' }}>
            Get Early Access →
          </button>
          <div style={{ fontSize: 11, color: '#3d4451' }}>No credit card required · Early access is free</div>
        </div>

        {/* Live ticker */}
        <div style={{ marginTop: 56, width: '100%', maxWidth: 600, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid #00d4a0', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' as const }}>
          <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#00d4a0', fontWeight: 700 }}>● LIVE</div>
          <div>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' as const }}>SPX</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: spxChange.startsWith('+') ? '#00d4a0' : spxChange.startsWith('-') ? '#ff4d6d' : '#e8eaf0' }}>{spx}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' as const }}>Change</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: spxChange.startsWith('+') ? '#00d4a0' : '#ff4d6d' }}>{spxChange || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' as const }}>VIX</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: parseFloat(vix) > 20 ? '#ff4d6d' : '#00d4a0' }}>{vix}</div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div id="how" style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#00d4a0', marginBottom: 16, fontWeight: 700 }}>How it works</div>
        <h2 className="syne" style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 48 }}>
          Simple. Powerful.<br /><span className="green">Always in your corner.</span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { n: '01', t: 'Set your system', d: 'Tell trAIde Zone your trading rules — what you trade, when you enter, where you stop out.' },
            { n: '02', t: 'Set your morning plan', d: "Before market open, tell it what you're looking for today. It holds you to that plan all session." },
            { n: '03', t: 'Trade with your companion', d: 'Turn on continuous voice mode. Ask anything. Get answers grounded in live data instantly.' },
            { n: '04', t: 'Get better, measurably', d: 'Upload your statements monthly. Watch your win rate improve as the AI refines your edge.' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 24, padding: '28px 24px', background: '#0d1018' }}>
              <div className="syne" style={{ fontSize: 40, fontWeight: 800, color: '#3d4451', lineHeight: 1, minWidth: 48 }}>{s.n}</div>
              <div>
                <div className="syne" style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#00d4a0', marginBottom: 16, fontWeight: 700 }}>Pricing</div>
        <h2 className="syne" style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 16 }}>
          Straightforward pricing.<br /><span className="green">No surprises.</span>
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 48, lineHeight: 1.7 }}>Voice minutes reset monthly. Go over? Pay a small per-minute rate.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { name: 'Starter', price: '$19', voice: '60 min/mo', overage: '$0.10/min', popular: false },
            { name: 'Pro', price: '$39', voice: '180 min/mo', overage: '$0.08/min', popular: true },
            { name: 'Elite', price: '$79', voice: '480 min/mo', overage: '$0.06/min', popular: false },
            { name: 'Elite+', price: '$129', voice: 'Unlimited', overage: 'No overage', popular: false },
          ].map((tier, i) => (
            <div key={i} style={{ background: tier.popular ? 'linear-gradient(135deg, rgba(0,212,160,0.06), #0d1018)' : '#0d1018', border: `1px solid ${tier.popular ? 'rgba(0,212,160,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 16, padding: '28px 20px', position: 'relative' as const }}>
              {tier.popular && <div style={{ position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', background: '#00d4a0', color: '#080a0f', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const, padding: '4px 12px', borderRadius: 99, whiteSpace: 'nowrap' as const }}>Most Popular</div>}
              <div style={{ fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 12 }}>{tier.name}</div>
              <div className="syne" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>{tier.price}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>per month</div>
              <div style={{ fontSize: 11, color: '#00d4a0', marginBottom: 24 }}>🎙️ {tier.voice} · {tier.overage}</div>
              <button onClick={() => router.push('/sign-up')} style={{ width: '100%', fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800, padding: 12, borderRadius: 8, cursor: 'pointer', background: tier.popular ? '#00d4a0' : 'transparent', border: tier.popular ? 'none' : '1px solid rgba(255,255,255,0.12)', color: tier.popular ? '#080a0f' : '#6b7280' }}>
                Get Started
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '80px 24px', textAlign: 'center' as const }}>
        <h2 className="syne" style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 16 }}>
          Stop trading alone.<br /><span className="green">Trade in the zone.</span>
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Join traders getting early access to tr<span className="green">AI</span>de Zone.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto' }}>
          <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '14px 18px', color: '#e8eaf0', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
          <button className="syne" onClick={handleGetAccess} style={{ fontSize: 15, fontWeight: 800, padding: '16px 28px', background: '#00d4a0', color: '#080a0f', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Get Early Access →
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }}>
        <div className="syne" style={{ fontSize: 16, fontWeight: 800, color: '#6b7280' }}>tr<span className="green">AI</span>de Zone</div>
        <div style={{ fontSize: 11, color: '#3d4451' }}>© 2026 trAIde Zone · Built for disciplined traders</div>
      </footer>
    </div>
  )
}
