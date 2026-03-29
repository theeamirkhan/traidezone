'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [spx, setSpx] = useState('—')
  const [vix, setVix] = useState('—')
  const [spxChange, setSpxChange] = useState('')

  useEffect(() => {
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/SPY/range/1/day/2026-03-25/2026-03-31?adjusted=true&sort=desc&limit=2')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) {
          const c = d.results[0]
          setSpx(c.c.toFixed(2))
          const chg = ((c.c - c.o) / c.o * 100).toFixed(2)
          setSpxChange((parseFloat(chg) >= 0 ? '+' : '') + chg + '%')
        }
      }).catch(() => {})
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/I:VIX1D/range/1/day/2026-03-25/2026-03-31?adjusted=true&sort=desc&limit=1')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) setVix(d.results[0].c.toFixed(2))
      }).catch(() => {})
  }, [])

  const handleGetAccess = () => {
    router.push(email ? `/sign-up?email=${encodeURIComponent(email)}` : '/sign-up')
  }

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #080a0f; color: #e8eaf0; font-family: 'JetBrains Mono', monospace; overflow-x: hidden; }
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@300;400;700&display=swap');
        .syne { font-family: 'Syne', sans-serif; }
        .green { color: #00d4a0; }
        .dim { color: #6b7280; }
        nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(8,10,15,0.92); backdrop-filter: blur(12px); flex-wrap: wrap; gap: 12px; }
        .nav-logo { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; white-space: nowrap; }
        .nav-links { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .nav-link { font-size: 11px; color: #6b7280; text-decoration: none; letter-spacing: 0.5px; text-transform: uppercase; }
        .btn-nav { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; padding: 8px 16px; background: #00d4a0; color: #080a0f; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; white-space: nowrap; }
        .btn-signin { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; padding: 8px 16px; background: transparent; color: #e8eaf0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer; text-decoration: none; white-space: nowrap; }
        hero { display: block; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 120px 24px 60px; }
        .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border: 1px solid rgba(0,212,160,0.3); border-radius: 99px; font-size: 11px; color: #00d4a0; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 32px; }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #00d4a0; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .hero-title { font-family: 'Syne', sans-serif; font-size: clamp(40px, 8vw, 88px); font-weight: 800; line-height: 1.0; letter-spacing: -2px; margin-bottom: 24px; }
        .hero-sub { font-size: 15px; color: #6b7280; max-width: 480px; line-height: 1.7; margin-bottom: 40px; font-weight: 300; }
        .hero-form { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 400px; margin: 0 auto; }
        .hero-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 14px 18px; color: #e8eaf0; font-family: 'JetBrains Mono', monospace; font-size: 13px; outline: none; width: 100%; }
        .hero-input::placeholder { color: #3d4451; }
        .btn-primary { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800; padding: 16px 28px; background: #00d4a0; color: #080a0f; border: none; border-radius: 8px; cursor: pointer; width: 100%; }
        .form-note { font-size: 11px; color: #3d4451; }
        .ticker-bar { margin-top: 56px; width: 100%; max-width: 600px; background: rgba(13,17,23,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; border-left: 3px solid #00d4a0; }
        .ticker-item { display: flex; flex-direction: column; gap: 2px; }
        .ticker-name { font-size: 9px; color: #6b7280; letter-spacing: 1px; text-transform: uppercase; }
        .ticker-val { font-size: 14px; font-weight: 700; }
        .up { color: #00d4a0; }
        .down { color: #ff4d6d; }
        section { padding: 80px 24px; max-width: 900px; margin: 0 auto; }
        .section-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #00d4a0; margin-bottom: 16px; font-weight: 700; }
        .section-title { font-family: 'Syne', sans-serif; font-size: clamp(28px, 5vw, 48px); font-weight: 800; letter-spacing: -1px; line-height: 1.1; margin-bottom: 16px; }
        .section-sub { font-size: 14px; color: #6b7280; max-width: 480px; line-height: 1.7; font-weight: 300; margin-bottom: 48px; }
        .pain-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 48px; }
        @media(min-width: 640px) { .pain-grid { grid-template-columns: 1fr 1fr; } }
        .pain-item { display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: rgba(255,77,109,0.04); border: 1px solid rgba(255,77,109,0.1); border-radius: 10px; }
        .pain-x { color: #ff4d6d; font-size: 14px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .pain-text { font-size: 13px; color: #6b7280; line-height: 1.5; }
        .solution-item { display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: rgba(0,212,160,0.04); border: 1px solid rgba(0,212,160,0.12); border-radius: 10px; }
        .solution-check { color: #00d4a0; font-size: 14px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .features-grid { display: grid; grid-template-columns: 1fr; gap: 2px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        @media(min-width: 640px) { .features-grid { grid-template-columns: 1fr 1fr; } }
        .feature-card { background: #0d1018; padding: 28px 24px; }
        .feature-icon { font-size: 24px; margin-bottom: 16px; }
        .feature-title { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; margin-bottom: 8px; }
        .feature-desc { font-size: 12px; color: #6b7280; line-height: 1.7; }
        .steps { display: flex; flex-direction: column; gap: 2px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        .step { display: flex; align-items: flex-start; gap: 24px; padding: 28px 24px; background: #0d1018; }
        .step-num { font-family: 'Syne', sans-serif; font-size: 40px; font-weight: 800; color: #3d4451; line-height: 1; min-width: 48px; }
        .step-title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; margin-bottom: 6px; }
        .step-desc { font-size: 12px; color: #6b7280; line-height: 1.7; }
        .pricing-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media(min-width: 640px) { .pricing-grid { grid-template-columns: 1fr 1fr; } }
        .pricing-card { background: #0d1018; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 28px 20px; position: relative; }
        .pricing-card.popular { border-color: rgba(0,212,160,0.4); background: linear-gradient(135deg, rgba(0,212,160,0.04), #0d1018); }
        .popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #00d4a0; color: #080a0f; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 4px 12px; border-radius: 99px; white-space: nowrap; font-family: 'Syne', sans-serif; }
        .tier-name { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #6b7280; margin-bottom: 12px; }
        .tier-price { font-family: 'Syne', sans-serif; font-size: 42px; font-weight: 800; letter-spacing: -2px; line-height: 1; margin-bottom: 4px; }
        .tier-period { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
        .voice-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; background: rgba(0,212,160,0.08); border: 1px solid rgba(0,212,160,0.2); border-radius: 5px; margin-bottom: 20px; }
        .voice-badge-text { font-size: 10px; color: #00d4a0; font-weight: 700; }
        .tier-features { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
        .tier-feature { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
        .tf-check { color: #00d4a0; font-weight: 700; }
        .tf-x { color: #3d4451; }
        .btn-plan { width: 100%; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800; padding: 12px; border-radius: 8px; cursor: pointer; }
        .btn-plan-primary { background: #00d4a0; border: none; color: #080a0f; }
        .btn-plan-outline { background: transparent; border: 1px solid rgba(255,255,255,0.12); color: #6b7280; }
        .cta-section { padding: 80px 24px; text-align: center; }
        .cta-title { font-family: 'Syne', sans-serif; font-size: clamp(28px, 5vw, 52px); font-weight: 800; letter-spacing: -1px; line-height: 1.1; margin-bottom: 16px; }
        .cta-sub { font-size: 14px; color: #6b7280; margin-bottom: 32px; }
        .cta-form { display: flex; flex-direction: column; gap: 10px; max-width: 360px; margin: 0 auto; }
        footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .footer-logo { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800; color: #6b7280; }
        .footer-text { font-size: 11px; color: #3d4451; }
      `}</style>

      {/* Nav */}
      <nav>
        <div className="nav-logo">tr<span className="green">AI</span>de Zone</div>
        <div className="nav-links">
          <a href="#how" className="nav-link">How it works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="/sign-up" className="btn-nav">Join Waitlist</a>
          <a href="/sign-in" className="btn-signin">Sign In</a>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '100px 24px 60px' }}>
        <div className="hero-badge"><div className="badge-dot" />Now in early access</div>
        <h1 className="hero-title syne">
          Your AI companion<br />
          for <span className="green">disciplined</span><br />
          <span className="dim">trading.</span>
        </h1>
        <p className="hero-sub">
          tr<span className="green">AI</span>de Zone sits with you during every trade — watching the chart, knowing your rules, and keeping you accountable in real time.
        </p>
        <div className="hero-form">
          <input className="hero-input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGetAccess()} />
          <button className="btn-primary syne" onClick={handleGetAccess}>Get Early Access →</button>
          <div className="form-note">No credit card required · Early access is free</div>
        </div>

        {/* Live ticker */}
        <div className="ticker-bar">
          <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00d4a0', fontWeight: 700 }}>● LIVE</div>
          <div className="ticker-item">
            <div className="ticker-name">SPX</div>
            <div className={`ticker-val ${spxChange.startsWith('+') ? 'up' : spxChange.startsWith('-') ? 'down' : ''}`}>{spx}</div>
          </div>
          <div className="ticker-item">
            <div className="ticker-name">Change</div>
            <div className={`ticker-val ${spxChange.startsWith('+') ? 'up' : 'down'}`}>{spxChange || '—'}</div>
          </div>
          <div className="ticker-item">
            <div className="ticker-name">VIX</div>
            <div className={`ticker-val ${parseFloat(vix) > 20 ? 'down' : 'up'}`}>{vix}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 6 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 800, color: '#00d4a0' }}>WAIT</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>weekend</div>
          </div>
        </div>
      </div>

      {/* Problem / Solution */}
      <section>
        <div className="section-label">The problem</div>
        <h2 className="section-title syne">Most traders know<br />the rules. They just<br /><span className="dim">don't follow them.</span></h2>
        <div className="pain-grid">
          {[
            'You average into losers hoping they\'ll turn around',
            'You trade out of boredom, not confluence',
            'You hold losing trades 10x longer than winning ones',
            'You abandon your morning plan the moment price moves',
          ].map((p, i) => (
            <div key={i} className="pain-item">
              <span className="pain-x">✕</span>
              <span className="pain-text">{p}</span>
            </div>
          ))}
        </div>
        <h2 className="section-title syne">tr<span className="green">AI</span>de Zone is the<br />accountability partner<br />in your ear.</h2>
        <div className="pain-grid">
          {[
            'Calls out averaging down before you add the position',
            'Scores each setup against your personal confluence rules',
            'Knows your morning plan and holds you to it all day',
            'Learns your patterns from your actual trade history',
          ].map((p, i) => (
            <div key={i} className="solution-item">
              <span className="solution-check">✓</span>
              <span className="pain-text">{p}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="section-label">What you get</div>
        <h2 className="section-title syne">Everything you need.<br /><span className="dim">Nothing you don't.</span></h2>
        <div className="features-grid">
          {[
            { icon: '🤖', title: 'AI Engine', desc: 'Live SPX signals every 3 minutes. VWAP, 200 EMA, VIX, options flow — synthesized into a clear LONG, SHORT, or WAIT.' },
            { icon: '🎙️', title: 'Voice Companion', desc: 'Talk to your AI coach hands-free during live trades. Always on, never distracted.' },
            { icon: '📋', title: 'Morning Plan', desc: 'Set your game plan before market open. tr\u00AIde Zone holds you to it all day.' },
            { icon: '📊', title: 'Your Edge, Quantified', desc: 'Upload your broker statement. The AI uses your real stats to personalize every signal.' },
            { icon: '⚡', title: 'Options Flow', desc: 'Live unusual options activity on SPX, SPY, and QQQ before you enter a trade.' },
            { icon: '✅', title: 'Pre-Trade Checklist', desc: '6-point confluence checklist before every entry. No confluence, no trade.' },
          ].map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title syne">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <div className="section-label">How it works</div>
        <h2 className="section-title syne">Simple. Powerful.<br /><span className="green">Always in your corner.</span></h2>
        <div className="steps">
          {[
            { n: '01', t: 'Set your system', d: 'Tell tr\u00AIde Zone your trading rules — what you trade, when you enter, where you stop out.' },
            { n: '02', t: 'Set your morning plan', d: 'Before market open, tell it what you\'re looking for today. It holds you to that plan all session.' },
            { n: '03', t: 'Trade with your companion', d: 'Turn on continuous voice mode. Ask anything. Get answers grounded in live data instantly.' },
            { n: '04', t: 'Get better, measurably', d: 'Upload your statements monthly. Watch your win rate improve as the AI refines its understanding of your edge.' },
          ].map((s, i) => (
            <div key={i} className="step">
              <div className="step-num">{s.n}</div>
              <div>
                <div className="step-title syne">{s.t}</div>
                <div className="step-desc">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-title syne">Straightforward pricing.<br /><span className="green">No surprises.</span></h2>
        <p className="section-sub">Voice minutes reset monthly. Go over? Pay a small per-minute rate — never cut off mid-trade.</p>
        <div className="pricing-grid">
          {[
            { name: 'Starter', price: '$19', period: '/mo', voice: '60 min/mo', overage: '$0.10/min', features: ['50 AI analysis calls/month', '60 voice minutes', 'Morning plan + checklist', 'Live SPX signals'], noFeatures: ['Options flow', 'Unlimited AI calls'], popular: false },
            { name: 'Pro', price: '$39', period: '/mo', voice: '180 min/mo', overage: '$0.08/min', features: ['Unlimited AI calls', '180 voice minutes', 'Options flow + 0DTE skew', 'Trade pattern analysis', 'Morning plan + checklist'], noFeatures: [], popular: true },
            { name: 'Elite', price: '$79', period: '/mo', voice: '480 min/mo', overage: '$0.06/min', features: ['Unlimited AI calls', '480 voice minutes', 'Full intelligence suite', 'Priority support'], noFeatures: [], popular: false },
            { name: 'Elite+', price: '$129', period: '/mo', voice: 'Unlimited', overage: 'No overage', features: ['Unlimited AI calls', 'Unlimited voice — all session', 'No overage ever', 'Early access + priority support'], noFeatures: [], popular: false },
          ].map((tier, i) => (
            <div key={i} className={`pricing-card ${tier.popular ? 'popular' : ''}`}>
              {tier.popular && <div className="popular-badge">Most Popular</div>}
              <div className="tier-name">{tier.name}</div>
              <div className="tier-price syne">{tier.price}</div>
              <div className="tier-period">per month</div>
              <div className="voice-badge">
                <span>🎙️</span>
                <span className="voice-badge-text">{tier.voice}</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>· {tier.overage}</span>
              </div>
              <ul className="tier-features">
                {tier.features.map((f, j) => <li key={j} className="tier-feature"><span className="tf-check">✓</span>{f}</li>)}
                {tier.noFeatures.map((f, j) => <li key={j} className="tier-feature" style={{ opacity: 0.4 }}><span className="tf-x">✗</span>{f}</li>)}
              </ul>
              <button className={`btn-plan ${tier.popular ? 'btn-plan-primary' : 'btn-plan-outline'}`}
                onClick={() => router.push('/sign-up')}>
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <h2 className="cta-title syne">Stop trading alone.<br /><span className="green">Trade in the zone.</span></h2>
        <p className="cta-sub">Join traders getting early access to tr<span className="green">AI</span>de Zone.</p>
        <div className="cta-form">
          <input className="hero-input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn-primary syne" onClick={handleGetAccess}>Get Early Access →</button>
        </div>
      </div>

      {/* Footer */}
      <footer>
        <div className="footer-logo">tr<span className="green">AI</span>de Zone</div>
        <div className="footer-text">© 2026 tr<span className="green">AI</span>de Zone · Built for traders who take discipline seriously</div>
      </footer>
    </>
  )
}