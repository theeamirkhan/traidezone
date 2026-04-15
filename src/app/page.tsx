'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [spx, setSpx] = useState<string>('—')
  const [vix, setVix] = useState<string>('—')
  const [spxChange, setSpxChange] = useState<string>('')
  const [tick, setTick] = useState(true)

  useEffect(() => {
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/I:SPX/range/1/day/2026-04-01/2026-04-15?adjusted=true&sort=desc&limit=2')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) {
          const c = d.results[0]
          setSpx(parseFloat(c.c).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
          const chg = ((c.c - c.o) / c.o * 100).toFixed(2)
          setSpxChange((parseFloat(chg) >= 0 ? '+' : '') + chg + '%')
        }
      }).catch(() => {})
    fetch('/api/polygon?apiKey=server&path=/v2/aggs/ticker/I:VIX/range/1/day/2026-04-01/2026-04-15?adjusted=true&sort=desc&limit=1')
      .then(r => r.json()).then(d => {
        if (d.results?.[0]) setVix(d.results[0].c.toFixed(2))
      }).catch(() => {})
    const t = setInterval(() => setTick(v => !v), 800)
    return () => clearInterval(t)
  }, [])

  const handleGetAccess = () => {
    router.push(email ? `/sign-up?email=${encodeURIComponent(email)}` : '/sign-up')
  }

  const isUp = spxChange.startsWith('+')
  const priceColor = spxChange ? (isUp ? '#00ff88' : '#ff1a4a') : '#f0f4ff'

  return (
    <div style={{ background: '#060810', minHeight: '100vh', color: '#f0f4ff', fontFamily: "'JetBrains Mono', monospace", overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { background: #060810; overflow-x: hidden; }
        body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none; background-image:radial-gradient(circle, rgba(0,229,255,0.04) 1px, transparent 1px); background-size:28px 28px; }
        body::after { content:''; position:fixed; inset:0; z-index:1; pointer-events:none; background:repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 4px); }
        .lp { position:relative; z-index:2; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes glow { 0%,100%{text-shadow:0 0 20px rgba(0,229,255,0.5)} 50%{text-shadow:0 0 40px rgba(0,229,255,0.9),0 0 60px rgba(0,229,255,0.4)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes borderPulse { 0%,100%{box-shadow:0 0 0 1px rgba(0,229,255,0.12)} 50%{box-shadow:0 0 0 1px rgba(0,229,255,0.3),0 0 24px rgba(0,229,255,0.06)} }
        .orb { font-family:'Orbitron',sans-serif; }
        .h1 { animation:fadeUp 0.7s ease-out both; }
        .h2 { animation:fadeUp 0.7s ease-out 0.15s both; }
        .h3 { animation:fadeUp 0.7s ease-out 0.3s both; }
        .btn-p { background:#00e5ff; color:#020408; border:none; font-weight:700; cursor:pointer; transition:all 0.15s; letter-spacing:1.5px; }
        .btn-p:hover { background:#33ecff; box-shadow:0 0 24px rgba(0,229,255,0.5),0 0 48px rgba(0,229,255,0.2); transform:translateY(-1px); }
        .btn-s { background:transparent; color:#f0f4ff; border:1px solid rgba(0,229,255,0.2); font-weight:600; cursor:pointer; transition:all 0.15s; }
        .btn-s:hover { border-color:rgba(0,229,255,0.5); color:#00e5ff; }
        .fc { background:rgba(12,15,26,0.9); border:1px solid rgba(0,229,255,0.1); border-radius:4px; padding:20px 22px; transition:all 0.2s; position:relative; overflow:hidden; }
        .fc::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(0,229,255,0.5),transparent); opacity:0; transition:opacity 0.2s; }
        .fc:hover { border-color:rgba(0,229,255,0.3); box-shadow:0 4px 24px rgba(0,0,0,0.4); transform:translateY(-2px); }
        .fc:hover::before { opacity:1; }
        .pc { background:rgba(12,15,26,0.95); border:1px solid rgba(0,229,255,0.1); border-radius:4px; padding:28px 22px; position:relative; transition:all 0.2s; }
        .pc:hover { border-color:rgba(0,229,255,0.3); transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,0,0,0.4); }
        .pc.pop { border-color:rgba(0,229,255,0.4); box-shadow:0 0 0 1px rgba(0,229,255,0.08) inset; }
        .stag { display:inline-flex; align-items:center; gap:8px; font-size:8px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#00e5ff; margin-bottom:20px; }
        .stag::before { content:''; display:inline-block; width:2px; height:10px; background:#00e5ff; border-radius:1px; box-shadow:0 0 6px #00e5ff; }
        input[type=email] { background:rgba(255,255,255,0.04); border:1px solid rgba(0,229,255,0.2); border-radius:3px; padding:13px 18px; color:#f0f4ff; font-family:inherit; font-size:13px; outline:none; width:100%; transition:all 0.15s; caret-color:#00e5ff; }
        input[type=email]:focus { border-color:rgba(0,229,255,0.5); box-shadow:0 0 0 2px rgba(0,229,255,0.07); }
        input::placeholder { color:rgba(136,153,187,0.5); }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,229,255,0.2); border-radius:2px; }
      `}</style>

      <div className="lp">

        {/* NAV */}
        <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, padding:'0 28px', height:52, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(0,229,255,0.1)', background:'rgba(4,6,12,0.97)', backdropFilter:'blur(16px)' }}>
          <div className="orb" style={{ fontSize:15, fontWeight:700, letterSpacing:2 }}>
            tr<span style={{ color:'#00e5ff', textShadow:'0 0 12px rgba(0,229,255,0.7)' }}>AI</span>de Zone
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-s" onClick={() => router.push('/sign-in')} style={{ fontFamily:'inherit', fontSize:10, padding:'6px 14px', borderRadius:2, letterSpacing:1 }}>SIGN IN</button>
            <button className="btn-p" onClick={() => router.push('/sign-up')} style={{ fontFamily:'inherit', fontSize:10, padding:'6px 14px', borderRadius:2 }}>GET ACCESS →</button>
          </div>
        </nav>

        {/* HERO */}
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'96px 24px 60px' }}>

          <div className="h1" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', border:'1px solid rgba(0,255,136,0.25)', borderRadius:2, fontSize:8, color:'#00ff88', letterSpacing:3, textTransform:'uppercase' as const, marginBottom:36, background:'rgba(0,255,136,0.04)' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:'#00ff88', boxShadow:'0 0 8px rgba(0,255,136,0.9)', animation:'pulse 2s infinite' }} />
            LIVE · SPX {spx} &nbsp;
            <span style={{ color: isUp ? '#00ff88' : '#ff1a4a' }}>{spxChange || '—'}</span>
          </div>

          <h1 className="h1 orb" style={{ fontSize:'clamp(34px, 7vw, 78px)', fontWeight:900, lineHeight:1.05, letterSpacing:'-1px', marginBottom:24, maxWidth:860 }}>
            Your AI companion<br />
            for{' '}<span style={{ color:'#00e5ff', animation:'glow 3s ease-in-out infinite' }}>disciplined</span>{' '}
            <span style={{ color:'#2d3748' }}>trading.</span>
          </h1>

          <p className="h2" style={{ fontSize:14, color:'#8899bb', maxWidth:500, lineHeight:1.9, marginBottom:44, fontWeight:300 }}>
            tr<span style={{ color:'#00e5ff' }}>AI</span>de Zone sits with you every session — watching live charts, reading options flow, knowing your rules, and keeping you accountable in real time.
          </p>

          <div className="h3" style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:360 }}>
            <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGetAccess()} />
            <button className="btn-p" onClick={handleGetAccess} style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, padding:'14px 0', borderRadius:2, width:'100%' }}>
              START FREE TRIAL →
            </button>
            <div style={{ fontSize:8, color:'#2d3748', letterSpacing:2 }}>7-DAY FREE TRIAL · NO CARD REQUIRED</div>
          </div>

          {/* Terminal card */}
          <div style={{ marginTop:56, width:'100%', maxWidth:620, background:'rgba(6,8,16,0.97)', border:'1px solid rgba(0,229,255,0.15)', borderRadius:4, overflow:'hidden', boxShadow:'0 4px 40px rgba(0,0,0,0.6)', animation:'borderPulse 4s ease-in-out infinite' }}>
            <div style={{ padding:'7px 14px', borderBottom:'1px solid rgba(0,229,255,0.1)', display:'flex', alignItems:'center', gap:7, background:'rgba(0,0,0,0.4)' }}>
              {['#ff1a4a','#ffb700','#00ff88'].map(c => <div key={c} style={{ width:7, height:7, borderRadius:'50%', background:c, opacity:0.7 }} />)}
              <span style={{ marginLeft:8, fontSize:8, color:'#4a5568', letterSpacing:2 }}>TRAIDEZONE · TERMINAL</span>
              <div style={{ marginLeft:'auto', fontSize:8, color:'#00e5ff', letterSpacing:1 }}>{tick ? '█' : ' '} CONNECTED</div>
            </div>
            <div style={{ padding:'18px 24px', display:'flex', alignItems:'center', gap:36, flexWrap:'wrap' as const }}>
              {[
                { l:'SPX INDEX', v:spx, vc:priceColor, g:spxChange ? `0 0 12px ${priceColor}55` : 'none' },
                { l:'CHANGE', v:spxChange||'—', vc:priceColor, g:'none' },
                { l:'VIX', v:vix, vc:parseFloat(vix)>20?'#ff1a4a':'#00ff88', g:'none' },
                { l:'AI COMPANION', v:'ACTIVE', vc:'#00e5ff', g:'0 0 8px rgba(0,229,255,0.7)' },
              ].map(({ l, v, vc, g }) => (
                <div key={l}>
                  <div style={{ fontSize:7, color:'#4a5568', letterSpacing:2, textTransform:'uppercase' as const, marginBottom:4 }}>{l}</div>
                  <div className="orb" style={{ fontSize:15, fontWeight:700, color:vc, textShadow:g }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ padding:'100px 24px', maxWidth:820, margin:'0 auto' }}>
          <div className="stag">How it works</div>
          <h2 className="orb" style={{ fontSize:'clamp(22px, 4vw, 40px)', fontWeight:900, lineHeight:1.1, marginBottom:48 }}>
            Simple. Powerful.<br /><span style={{ color:'#00e5ff' }}>Always in your corner.</span>
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {[
              { n:'01', t:'Set your system', d:'Upload your playbooks — entries, stops, targets. The AI reads them and holds you to them every session.' },
              { n:'02', t:'Build your morning plan', d:"Bias, implied move, key levels. Tell it what you're looking for before the open and it anchors your whole day." },
              { n:'03', t:'Trade with your companion', d:'Live voice conversation while you trade. It watches the chart, reads options flow, and calls out when you drift.' },
              { n:'04', t:'Measure your edge', d:'Upload statements monthly. Track in-system vs out-of-system win rate. Watch the gap close measurably over time.' },
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:24, alignItems:'flex-start', padding:'22px 24px', background:'rgba(8,10,18,0.8)', borderLeft:'2px solid rgba(0,229,255,0.2)', marginBottom:2, transition:'border-color 0.2s', cursor:'default' }}
                onMouseEnter={e => (e.currentTarget.style.borderLeftColor='#00e5ff')}
                onMouseLeave={e => (e.currentTarget.style.borderLeftColor='rgba(0,229,255,0.2)')}>
                <div className="orb" style={{ fontSize:28, fontWeight:900, color:'rgba(0,229,255,0.15)', lineHeight:1, minWidth:40 }}>{s.n}</div>
                <div>
                  <div className="orb" style={{ fontSize:13, fontWeight:700, marginBottom:6, color:'#f0f4ff', letterSpacing:1 }}>{s.t}</div>
                  <div style={{ fontSize:11, color:'#8899bb', lineHeight:1.9 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FEATURES */}
        <div style={{ padding:'20px 24px 100px', maxWidth:940, margin:'0 auto' }}>
          <div className="stag">Capabilities</div>
          <h2 className="orb" style={{ fontSize:'clamp(20px, 3.5vw, 36px)', fontWeight:900, marginBottom:40 }}>Built for real traders.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:10 }}>
            {[
              { icon:'🎙', t:'Voice Companion', d:'Bidirectional voice. Talk while you trade. Listens, responds, keeps you accountable — hands-free.' },
              { icon:'📊', t:'Live Market Context', d:'SPX, VIX, VWAP, 200 EMA, options flow, sector breadth — synthesized into every response.' },
              { icon:'🧠', t:'Knows Your History', d:'Persistent trader profile grows with every session. Session 50 it knows your patterns better than you do.' },
              { icon:'⚡', t:'Proactive Alerts', d:'Drawn levels trigger it to speak. Flow spikes, level breaks, extended holds — it notices before you do.' },
              { icon:'📋', t:'Playbook Enforcement', d:'Matches every trade against your system. Flags deviations before you pull the trigger.' },
              { icon:'📈', t:'Performance Analytics', d:'Net P&L, win rate, profit factor, in-system %, best hour — all from your actual trade history.' },
            ].map(({ icon, t, d }) => (
              <div key={t} className="fc">
                <div style={{ fontSize:20, marginBottom:12 }}>{icon}</div>
                <div className="orb" style={{ fontSize:10, fontWeight:700, color:'#00e5ff', letterSpacing:1, marginBottom:8 }}>{t}</div>
                <div style={{ fontSize:11, color:'#8899bb', lineHeight:1.9 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PRICING */}
        <div id="pricing" style={{ padding:'80px 24px', maxWidth:940, margin:'0 auto', borderTop:'1px solid rgba(0,229,255,0.08)' }}>
          <div className="stag">Pricing</div>
          <h2 className="orb" style={{ fontSize:'clamp(20px, 3.5vw, 36px)', fontWeight:900, marginBottom:10 }}>
            Straightforward.<br /><span style={{ color:'#00e5ff' }}>No surprises.</span>
          </h2>
          <p style={{ fontSize:11, color:'#8899bb', marginBottom:44, lineHeight:1.9 }}>7-day free trial on all plans. Cancel anytime.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:10 }}>
            {[
              { name:'Starter', price:'$19', voice:'60 min/mo', overage:'$0.10/min', popular:false },
              { name:'Pro', price:'$39', voice:'180 min/mo', overage:'$0.08/min', popular:true },
              { name:'Elite', price:'$79', voice:'480 min/mo', overage:'$0.06/min', popular:false },
              { name:'Elite+', price:'$129', voice:'Unlimited', overage:'No overage', popular:false },
            ].map(tier => (
              <div key={tier.name} className={`pc ${tier.popular ? 'pop' : ''}`}>
                {tier.popular && (
                  <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#00e5ff', color:'#020408', fontSize:7, fontWeight:800, letterSpacing:2, textTransform:'uppercase' as const, padding:'3px 10px', borderRadius:2, whiteSpace:'nowrap' as const, fontFamily:"'Orbitron',sans-serif" }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize:7, letterSpacing:3, textTransform:'uppercase' as const, color:tier.popular?'#00e5ff':'#4a5568', marginBottom:14, fontWeight:700 }}>{tier.name}</div>
                <div className="orb" style={{ fontSize:36, fontWeight:900, letterSpacing:'-2px', lineHeight:1, color:'#f0f4ff' }}>{tier.price}</div>
                <div style={{ fontSize:9, color:'#4a5568', marginBottom:20, letterSpacing:1 }}>/MONTH</div>
                <div style={{ fontSize:10, color:'#8899bb', marginBottom:24, lineHeight:2.2 }}>
                  <div>🎙 {tier.voice}</div>
                  <div style={{ color:tier.popular?'#00e5ff':'#4a5568' }}>Overage: {tier.overage}</div>
                </div>
                <button onClick={() => router.push('/sign-up')} style={{ width:'100%', fontFamily:"'JetBrains Mono',monospace", fontSize:10, fontWeight:700, padding:'10px 0', borderRadius:2, cursor:'pointer', letterSpacing:1.5, transition:'all 0.15s', background:tier.popular?'#00e5ff':'transparent', border:tier.popular?'none':'1px solid rgba(0,229,255,0.18)', color:tier.popular?'#020408':'#6b7a9a' }}>
                  GET STARTED
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding:'80px 24px 100px', textAlign:'center' as const }}>
          <div className="stag" style={{ justifyContent:'center' }}>Join now</div>
          <h2 className="orb" style={{ fontSize:'clamp(22px, 5vw, 50px)', fontWeight:900, letterSpacing:'-1px', lineHeight:1.1, marginBottom:14 }}>
            Stop trading alone.<br /><span style={{ color:'#00e5ff' }}>Trade in the zone.</span>
          </h2>
          <p style={{ fontSize:11, color:'#8899bb', marginBottom:36, lineHeight:1.9 }}>Build your AI companion. Get better, measurably.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:340, margin:'0 auto' }}>
            <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="btn-p" onClick={handleGetAccess} style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10, padding:'13px 0', borderRadius:2, letterSpacing:2 }}>
              START FREE TRIAL →
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <footer style={{ borderTop:'1px solid rgba(0,229,255,0.08)', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:12 }}>
          <div className="orb" style={{ fontSize:12, fontWeight:700, color:'#4a5568' }}>tr<span style={{ color:'#00e5ff' }}>AI</span>de Zone</div>
          <div style={{ fontSize:8, color:'#2d3748', letterSpacing:1 }}>© 2026 TRAIDEZONE · BUILT FOR DISCIPLINED TRADERS</div>
        </footer>

      </div>
    </div>
  )
}
