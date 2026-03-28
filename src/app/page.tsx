'use client'
import { useEffect, useState } from 'react'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [email2, setEmail2] = useState('')
  const [success1, setSuccess1] = useState(false)
  const [success2, setSuccess2] = useState(false)

  useEffect(() => {
    // Scroll reveal
    const reveals = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), i * 60)
        }
      })
    }, { threshold: 0.1 })
    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const handleWaitlist = () => {
    if (!email || !email.includes('@')) return
    setSuccess1(true)
    setEmail('')
  }

  const handleWaitlist2 = () => {
    if (!email2 || !email2.includes('@')) return
    setSuccess2(true)
    setEmail2('')
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        :root {
          --green: #00d4a0; --green-dim: rgba(0,212,160,0.1); --green-mid: rgba(0,212,160,0.3);
          --red: #ff4d6d; --blue: #3b82f6;
          --bg: #080a0f; --surface: #0d1018; --surface2: #131720;
          --border: rgba(255,255,255,0.06); --text: #e8eaf0; --text-dim: #6b7280; --text-muted: #3d4451;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:var(--bg); color:var(--text); font-family:'JetBrains Mono',monospace; overflow-x:hidden; }
        body::before { content:''; position:fixed; inset:0; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E"); pointer-events:none; z-index:0; opacity:0.4; }
        .logo { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; letter-spacing:-0.5px; }
        .logo span { color:var(--green); }
        nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:20px 48px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); background:rgba(8,10,15,0.85); backdrop-filter:blur(12px); }
        .nav-link { font-size:12px; color:var(--text-dim); text-decoration:none; letter-spacing:0.5px; text-transform:uppercase; transition:color 0.2s; }
        .nav-link:hover { color:var(--text); }
        .btn-nav { font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:700; padding:8px 20px; background:var(--green); color:#080a0f; border:none; border-radius:6px; cursor:pointer; text-decoration:none; transition:all 0.2s; }
        .btn-nav:hover { background:#00edb3; transform:translateY(-1px); }
        .hero { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:120px 24px 80px; position:relative; }
        .hero::after { content:''; position:absolute; top:20%; left:50%; transform:translateX(-50%); width:600px; height:600px; background:radial-gradient(circle,rgba(0,212,160,0.08) 0%,transparent 70%); pointer-events:none; }
        .hero-badge { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border:1px solid rgba(0,212,160,0.3); border-radius:99px; font-size:11px; color:var(--green); letter-spacing:1px; text-transform:uppercase; margin-bottom:32px; }
        .badge-dot { width:6px; height:6px; border-radius:50%; background:var(--green); animation:pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .hero-title { font-family:'Syne',sans-serif; font-size:clamp(48px,7vw,96px); font-weight:800; line-height:1.0; letter-spacing:-2px; margin-bottom:24px; max-width:900px; }
        .hero-title .accent { color:var(--green); }
        .hero-title .dim { color:var(--text-dim); }
        .hero-sub { font-size:16px; color:var(--text-dim); max-width:520px; line-height:1.7; margin-bottom:48px; font-weight:300; }
        .waitlist-form { display:flex; gap:10px; max-width:440px; width:100%; }
        .waitlist-input { flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:14px 18px; color:var(--text); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none; transition:border-color 0.2s; }
        .waitlist-input:focus { border-color:rgba(0,212,160,0.4); }
        .waitlist-input::placeholder { color:var(--text-muted); }
        .btn-primary { font-family:'Syne',sans-serif; font-size:14px; font-weight:700; padding:14px 28px; background:var(--green); color:#080a0f; border:none; border-radius:8px; cursor:pointer; white-space:nowrap; transition:all 0.2s; }
        .btn-primary:hover { background:#00edb3; transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,212,160,0.3); }
        .form-note { margin-top:14px; font-size:11px; color:var(--text-muted); letter-spacing:0.3px; }
        .ticker-bar { margin-top:72px; width:100%; max-width:860px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 24px; display:flex; align-items:center; gap:32px; position:relative; overflow:hidden; }
        .ticker-bar::before { content:''; position:absolute; top:0; left:0; width:3px; height:100%; background:var(--green); }
        .ticker-label { font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--green); font-weight:700; white-space:nowrap; }
        .ticker-items { display:flex; gap:28px; flex-wrap:wrap; }
        .ticker-item { display:flex; flex-direction:column; gap:2px; }
        .ticker-name { font-size:10px; color:var(--text-dim); }
        .ticker-value { font-size:14px; font-weight:700; }
        .ticker-change { font-size:10px; }
        .up { color:var(--green); } .down { color:var(--red); }
        .ticker-ai { margin-left:auto; display:flex; align-items:center; gap:8px; padding:6px 12px; background:rgba(0,212,160,0.08); border:1px solid rgba(0,212,160,0.2); border-radius:6px; white-space:nowrap; }
        .ai-signal { font-family:'Syne',sans-serif; font-size:12px; font-weight:800; color:var(--green); }
        .ai-conf { font-size:10px; color:var(--text-dim); }
        .section { padding:120px 48px; max-width:1100px; margin:0 auto; }
        .section-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--green); margin-bottom:16px; font-weight:700; }
        .section-title { font-family:'Syne',sans-serif; font-size:clamp(32px,4vw,52px); font-weight:800; letter-spacing:-1px; line-height:1.1; margin-bottom:16px; }
        .section-sub { font-size:15px; color:var(--text-dim); max-width:480px; line-height:1.7; font-weight:300; margin-bottom:64px; }
        .features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; background:var(--border); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
        .feature-card { background:var(--surface); padding:36px 32px; transition:background 0.2s; position:relative; }
        .feature-card:hover { background:var(--surface2); }
        .feature-icon { font-size:28px; margin-bottom:20px; display:block; }
        .feature-title { font-family:'Syne',sans-serif; font-size:18px; font-weight:700; margin-bottom:10px; }
        .feature-desc { font-size:13px; color:var(--text-dim); line-height:1.7; font-weight:300; }
        .feature-tag { position:absolute; top:16px; right:16px; font-size:9px; letter-spacing:1px; text-transform:uppercase; padding:3px 8px; border-radius:4px; background:var(--green-dim); color:var(--green); font-weight:700; }
        .pain-section { background:var(--surface); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:100px 48px; }
        .pain-inner { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:center; }
        .pain-list,.solution-list { display:flex; flex-direction:column; gap:20px; list-style:none; }
        .pain-item { display:flex; align-items:flex-start; gap:14px; padding:18px 20px; background:rgba(255,77,109,0.05); border:1px solid rgba(255,77,109,0.12); border-radius:10px; }
        .pain-x { color:var(--red); font-size:16px; font-weight:700; flex-shrink:0; }
        .pain-text,.solution-text { font-size:14px; color:var(--text-dim); line-height:1.5; font-weight:300; }
        .solution-item { display:flex; align-items:flex-start; gap:14px; padding:18px 20px; background:var(--green-dim); border:1px solid rgba(0,212,160,0.15); border-radius:10px; }
        .solution-check { color:var(--green); font-size:16px; font-weight:700; flex-shrink:0; }
        .steps { display:flex; flex-direction:column; gap:2px; background:var(--border); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
        .step { display:flex; align-items:flex-start; gap:32px; padding:40px; background:var(--surface); transition:background 0.2s; }
        .step:hover { background:var(--surface2); }
        .step-num { font-family:'Syne',sans-serif; font-size:48px; font-weight:800; color:var(--text-muted); line-height:1; min-width:60px; letter-spacing:-2px; }
        .step-title { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; margin-bottom:8px; }
        .step-desc { font-size:14px; color:var(--text-dim); line-height:1.7; font-weight:300; max-width:560px; }
        .step-badge { font-size:10px; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:99px; border:1px solid var(--border); color:var(--text-dim); margin-top:8px; display:inline-block; }
        .chat-demo { background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden; max-width:520px; }
        .chat-header { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
        .chat-dot { width:8px; height:8px; border-radius:50%; background:var(--green); animation:pulse 2s infinite; }
        .chat-title { font-family:'Syne',sans-serif; font-size:13px; font-weight:700; }
        .chat-sub { font-size:11px; color:var(--text-dim); margin-left:auto; }
        .chat-messages { padding:20px; display:flex; flex-direction:column; gap:14px; }
        .msg { display:flex; flex-direction:column; gap:4px; }
        .msg-user { align-items:flex-end; }
        .msg-bubble { padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; max-width:85%; font-weight:300; }
        .msg-user .msg-bubble { background:rgba(59,130,246,0.2); border:1px solid rgba(59,130,246,0.3); }
        .msg-ai .msg-bubble { background:var(--surface2); border:1px solid var(--border); }
        .msg-label { font-size:10px; color:var(--text-muted); letter-spacing:0.5px; }
        .pricing-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .pricing-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:36px 28px; position:relative; transition:transform 0.2s,border-color 0.2s; }
        .pricing-card:hover { transform:translateY(-4px); border-color:rgba(0,212,160,0.2); }
        .pricing-card.featured { border-color:rgba(0,212,160,0.4); background:linear-gradient(135deg,rgba(0,212,160,0.05) 0%,var(--surface) 100%); }
        .pricing-featured-label { position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:var(--green); color:#080a0f; font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:4px 14px; border-radius:99px; white-space:nowrap; }
        .pricing-tier { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--text-dim); margin-bottom:16px; }
        .pricing-price { font-family:'Syne',sans-serif; font-size:48px; font-weight:800; letter-spacing:-2px; line-height:1; margin-bottom:4px; }
        .pricing-period { font-size:13px; color:var(--text-dim); margin-bottom:28px; font-weight:300; }
        .pricing-features { list-style:none; display:flex; flex-direction:column; gap:10px; margin-bottom:32px; }
        .pricing-feature { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--text-dim); font-weight:300; }
        .pf-check { color:var(--green); } .pf-x { color:var(--text-muted); }
        .btn-plan { width:100%; font-family:'Syne',sans-serif; font-size:13px; font-weight:700; padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s; }
        .btn-plan-outline { background:transparent; border:1px solid var(--border); color:var(--text-dim); }
        .btn-plan-outline:hover { border-color:rgba(0,212,160,0.3); color:var(--text); }
        .btn-plan-primary { background:var(--green); border:none; color:#080a0f; }
        .btn-plan-primary:hover { background:#00edb3; transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,212,160,0.3); }
        .cta-section { padding:120px 48px; text-align:center; position:relative; overflow:hidden; }
        .cta-section::before { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:800px; height:400px; background:radial-gradient(ellipse,rgba(0,212,160,0.06) 0%,transparent 70%); pointer-events:none; }
        .cta-title { font-family:'Syne',sans-serif; font-size:clamp(36px,5vw,64px); font-weight:800; letter-spacing:-2px; line-height:1.1; margin-bottom:20px; }
        .cta-sub { font-size:15px; color:var(--text-dim); margin-bottom:40px; font-weight:300; }
        footer { border-top:1px solid var(--border); padding:32px 48px; display:flex; align-items:center; justify-content:space-between; }
        .footer-logo { font-family:'Syne',sans-serif; font-size:16px; font-weight:800; color:var(--text-dim); }
        .footer-logo span { color:var(--green); }
        .footer-text { font-size:12px; color:var(--text-muted); }
        .reveal { opacity:0; transform:translateY(30px); transition:all 0.7s cubic-bezier(0.16,1,0.3,1); }
        .reveal.visible { opacity:1; transform:translateY(0); }
        .nav-right { display:flex; align-items:center; gap:32px; }
        @media(max-width:768px){
          nav{padding:16px 20px;} .section{padding:80px 20px;}
          .features-grid{grid-template-columns:1fr;} .pricing-grid{grid-template-columns:1fr;}
          .pain-inner{grid-template-columns:1fr;gap:40px;} .waitlist-form{flex-direction:column;}
          footer{flex-direction:column;gap:12px;text-align:center;}
        }
      `}</style>

      {/* Nav */}
      <nav>
        <div className="logo">tr<span>AI</span>de Zone</div>
        <div className="nav-right">
          <a href="#how" className="nav-link">How it works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="/sign-up" className="btn-nav">Join Waitlist</a><a href="/sign-in" class="nav-link" style="padding:8px 20px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;">Sign In</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge"><div className="badge-dot"></div>Now in early access</div>
        <h1 className="hero-title">Your AI companion<br/>for <span className="accent">disciplined</span><br/><span className="dim">trading.</span></h1>
        <p className="hero-sub">trAIde Zone sits with you during every trade — watching the chart, knowing your rules, and keeping you accountable in real time.</p>
        <div className="waitlist-form">
          <input className="waitlist-input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn-primary" onClick={handleWaitlist}>Get Early Access</button>
        </div>
        <p className="form-note">No credit card required · Early access is free · Launching Q2 2026</p>
        {success1 && <p style={{marginTop:'14px',fontSize:'13px',color:'var(--green)'}}>✓ You're on the list. We'll be in touch soon.</p>}
        <div className="ticker-bar">
          <div className="ticker-label">● Live</div>
          <div className="ticker-items">
            {[['SPX','6,553.57','▼ 1.14%','down'],['VIX','20.45','▲ ELEVATED','up'],['SPY VWAP','6,549','▼ BELOW','down'],['200 EMA','6,574','▼ BELOW','down']].map(([name,val,chg,cls]) => (
              <div key={name} className="ticker-item">
                <span className="ticker-name">{name}</span>
                <span className="ticker-value">{val}</span>
                <span className={`ticker-change ${cls}`}>{chg}</span>
              </div>
            ))}
          </div>
          <div className="ticker-ai"><span className="ai-signal">WAIT</span><span className="ai-conf">42% confidence</span></div>
        </div>
      </section>

      {/* Pain vs Solution */}
      <section className="pain-section">
        <div className="pain-inner">
          <div>
            <div className="section-label reveal">The problem</div>
            <h2 className="section-title reveal" style={{marginBottom:'32px'}}>Most traders know<br/>the rules. They just<br/><span style={{color:'var(--red)'}}>don't follow them.</span></h2>
            <ul className="pain-list">
              {['You average into losers hoping they\'ll turn around','You trade out of boredom, not confluence','You hold losing trades 10x longer than winning ones','You abandon your morning plan the moment price moves','You know what you did wrong — right after you do it'].map(t => (
                <li key={t} className="pain-item reveal"><span className="pain-x">✕</span><span className="pain-text">{t}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="section-label reveal">The solution</div>
            <h2 className="section-title reveal" style={{marginBottom:'32px'}}>trAIde Zone is the<br/>accountability partner<br/><span style={{color:'var(--green)'}}>in your ear.</span></h2>
            <ul className="solution-list">
              {['Calls out averaging down before you add the position','Scores each setup against your personal confluence rules','Asks "where\'s your stop?" when you open a trade','Knows your morning plan and holds you to it all day','Learns your patterns from your actual trade history'].map(t => (
                <li key={t} className="solution-item reveal"><span className="solution-check">✓</span><span className="solution-text">{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="section-label reveal">What you get</div>
        <h2 className="section-title reveal">Everything you need.<br/>Nothing you don't.</h2>
        <p className="section-sub reveal">Built for intraday options traders who are serious about getting better.</p>
        <div className="features-grid reveal">
          {[
            {icon:'🤖',title:'AI Engine',desc:'Reads live SPX price, VWAP, 200 EMA, VIX, sector breadth, options flow — and synthesizes it into a clear LONG, SHORT, or WAIT signal every 3 minutes.'},
            {icon:'🎙️',title:'Voice Companion',desc:'Talk to your AI coach hands-free during live trades. It responds in a natural human voice, knows your plan, your stats, and your rules. Always on, never distracted.',tag:'Flagship'},
            {icon:'📋',title:'Morning Plan',desc:'Set your game plan before market open. trAIde Zone references it all day — and calls you out if you try to deviate from it mid-session.'},
            {icon:'📊',title:'Your Edge, Quantified',desc:'Upload your broker statement and see exactly where you win and lose. The AI uses your real stats — not generic advice — to personalize every signal.'},
            {icon:'⚡',title:'Options Flow',desc:'Live unusual options activity on SPX, SPY, and QQQ. See what smart money is doing in real time before you enter a trade.'},
            {icon:'✅',title:'Pre-Trade Checklist',desc:'6-point confluence checklist before every entry. The AI won\'t call a setup valid unless your rules are met. No confluence, no trade.'},
          ].map(f => (
            <div key={f.title} className="feature-card">
              {f.tag && <div className="feature-tag">{f.tag}</div>}
              <span className="feature-icon">{f.icon}</span>
              <div className="feature-title">{f.title}</div>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how" style={{paddingTop:0}}>
        <div className="section-label reveal">How it works</div>
        <h2 className="section-title reveal">Simple. Powerful.<br/>Always in your corner.</h2>
        <p className="section-sub reveal">Set up once. Then just trade — with a co-pilot that never sleeps.</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'48px',alignItems:'start'}}>
          <div className="steps reveal">
            {[
              {n:'01',t:'Set your system',d:'Tell trAIde Zone your trading rules — what you trade, when you enter, where you stop out. It remembers everything.',b:'One-time setup · 5 minutes'},
              {n:'02',t:'Set your morning plan',d:'Before market open, tell it what you\'re looking for today. It holds you to that plan for the entire session.',b:'Every morning · 2 minutes'},
              {n:'03',t:'Trade with your companion',d:'Turn on continuous voice mode. Ask anything. Get answers grounded in live data and your personal history — in your ear, instantly.',b:'Hands-free · All session'},
              {n:'04',t:'Get better, measurably',d:'Upload your statements monthly. Watch your win rate improve as the AI refines its understanding of your specific edge.',b:'Monthly import · Auto-updated'},
            ].map(s => (
              <div key={s.n} className="step">
                <div className="step-num">{s.n}</div>
                <div>
                  <div className="step-title">{s.t}</div>
                  <p className="step-desc">{s.d}</p>
                  <span className="step-badge">{s.b}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="reveal">
            <div className="chat-demo">
              <div className="chat-header">
                <div className="chat-dot"></div>
                <div className="chat-title">trAIde Zone</div>
                <div className="chat-sub">10:47 AM EST · LIVE</div>
              </div>
              <div className="chat-messages">
                <div className="msg msg-user"><div className="msg-bubble">I'm thinking about adding a second contract here</div><div className="msg-label">You</div></div>
                <div className="msg msg-ai"><div className="msg-bubble">Hold on — <strong style={{color:'var(--green)'}}>averaging down is the pattern that's cost you the most</strong>. Your losers already average 19 hours vs 29 minutes for winners. <span style={{color:'#f59e0b'}}>What's the trade doing wrong right now?</span> If VWAP hasn't reclaimed, the thesis is already dead.</div><div className="msg-label">trAIde Zone</div></div>
                <div className="msg msg-user"><div className="msg-bubble">Fair point. Should I just close it?</div><div className="msg-label">You</div></div>
                <div className="msg msg-ai"><div className="msg-bubble">SPX is at <strong style={{color:'var(--green)'}}>6,553</strong> — 14pts below your VWAP and your stop was set at 6,540. You're still above it. Your morning plan said <strong style={{color:'var(--green)'}}>no puts today</strong>. Close it, stick to the plan, and wait for the long setup at VWAP reclaim.</div><div className="msg-label">trAIde Zone</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="section-label reveal">Pricing</div>
        <h2 className="section-title reveal">Straightforward pricing.<br/>Cancel any time.</h2>
        <p className="section-sub reveal">Launching Q2 2026. Join the waitlist for early access pricing.</p>
        <div className="pricing-grid reveal">
          {[
            {tier:'Starter',price:'Free',period:'forever',features:['Live SPX levels','TradingView chart','Pre-trade checklist'],missing:['AI Engine','Voice companion','Options flow'],btn:'btn-plan-outline',cta:'Join Waitlist',featured:false},
            {tier:'Pro',price:'$39',period:'per month · billed monthly',features:['Everything in Starter','AI Engine + signals','Voice companion','Options flow','Morning plan','Trade history import'],missing:[],btn:'btn-plan-primary',cta:'Get Early Access',featured:true},
            {tier:'Elite',price:'$79',period:'per month · billed monthly',features:['Everything in Pro','Custom AI voice clone','Multi-instrument support','GEX + positioning data','Priority support','Early feature access'],missing:[],btn:'btn-plan-outline',cta:'Join Waitlist',featured:false},
          ].map(p => (
            <div key={p.tier} className={`pricing-card${p.featured?' featured':''}`}>
              {p.featured && <div className="pricing-featured-label">Most Popular</div>}
              <div className="pricing-tier">{p.tier}</div>
              <div className="pricing-price" style={p.featured?{color:'var(--green)'}:{}}>{p.price}</div>
              <div className="pricing-period">{p.period}</div>
              <ul className="pricing-features">
                {p.features.map(f => <li key={f} className="pricing-feature"><span className="pf-check">✓</span>{f}</li>)}
                {p.missing.map(f => <li key={f} className="pricing-feature"><span className="pf-x">✕</span>{f}</li>)}
              </ul>
              <a href="/sign-up" className={`btn-plan ${p.btn}`}>{p.cta}</a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="section-label reveal" style={{textAlign:'center'}}>Get started</div>
        <h2 className="cta-title reveal">Stop trading alone.<br/><span style={{color:'var(--green)'}}>Trade in the zone.</span></h2>
        <p className="cta-sub reveal">Join traders getting early access to trAIde Zone.</p>
        <div className="waitlist-form reveal" style={{margin:'0 auto'}}>
          <input className="waitlist-input" type="email" placeholder="your@email.com" value={email2} onChange={e => setEmail2(e.target.value)} />
          <button className="btn-primary" onClick={handleWaitlist2}>Get Early Access</button>
        </div>
        {success2 && <p style={{marginTop:'16px',fontSize:'13px',color:'var(--green)',textAlign:'center'}}>✓ You're on the list. We'll be in touch soon.</p>}
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-logo">tr<span>AI</span>de Zone</div>
        <div className="footer-text">© 2026 trAIde Zone · Built for traders who take discipline seriously</div>
      </footer>
    </>
  )
}
