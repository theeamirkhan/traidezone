'use client'
import { useState, useEffect, useRef } from 'react'

const POLY_KEY = 'tz-polygon-key'
const ANTH_KEY = 'tz-anthropic-key'
const EL_KEY = 'tz-elevenlabs-key'
const UW_KEY = 'tz-uw-key'
const VOICE_ID = 'tz-voice-id'

const font = "'JetBrains Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  violet: '#00d4a0', teal: '#0099cc', red: '#cc1040',
  synapse: '#00aa55', fire: '#e05000', text: '#0d1830',
  textDim: '#4a5880', textMuted: '#8090b0',
  bg: '#080a0f', surface: '#0d1018',
  violetDim: 'rgba(0,212,160,0.07)',
  violetBorder: 'rgba(0,212,160,0.2)',
}

export default function CompanionPopout() {
  const [keys, setKeys] = useState<any>({})
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [voiceId, setVoiceId] = useState('21m00Tcm4TlvDq8ikWAM')
  const [context, setContext] = useState<any>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<any>(null)
  const audioCtxRef = useRef<any>(null)
  const audioSourceRef = useRef<any>(null)

  // Load keys + live context from localStorage on mount and every 10s
  useEffect(() => {
    const load = () => {
      const k: any = {}
      ;[POLY_KEY, ANTH_KEY, EL_KEY, UW_KEY].forEach(key => { k[key] = localStorage.getItem(key) || '' })
      setKeys(k)
      setVoiceId(localStorage.getItem(VOICE_ID) || '21m00Tcm4TlvDq8ikWAM')

      // Pull live context that the main window writes
      const ctx = localStorage.getItem('tz-live-context')
      if (ctx) { try { setContext(JSON.parse(ctx)) } catch {} }
    }
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [chatMessages, chatLoading])

  // Style injection
  useEffect(() => {
    if (document.getElementById('tz-popout-style')) return
    const s = document.createElement('style')
    s.id = 'tz-popout-style'
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#080a0f; font-family:'Share Tech Mono',monospace; overflow:hidden; height:100vh; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      @keyframes brainRing { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes waveAnim { 0%,100%{height:2px;opacity:0.2} 50%{height:var(--wh,10px);opacity:0.65} }
      @keyframes micGlow { 0%,100%{box-shadow:0 0 12px rgba(204,16,64,0.12)} 50%{box-shadow:0 0 20px rgba(204,16,64,0.25)} }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(102,32,212,0.15);border-radius:2px}
    `
    document.head.appendChild(s)
  }, [])

  const buildContext = () => {
    if (!context) return 'You are the trAIde Zone AI companion — a focused trading accountability partner. Keep responses under 3 sentences. Be specific and direct. THIS IS NOT FINANCIAL ADVICE.'
    return `You are the trAIde Zone AI companion — a focused, direct trading accountability partner for an SPX intraday options trader. Keep responses under 3 sentences unless asked for more. Be specific, reference real numbers. THIS IS NOT FINANCIAL ADVICE.

LIVE DATA: SPX ${context.spx || '—'} | VWAP ${context.vwapPos || '—'} | VIX ${context.vix || '—'} (${context.vixLevel || '—'})
AI SIGNAL: ${context.signal || '—'} ${context.confidence || 0}% confidence
MORNING PLAN: Bias ${context.bias || 'not set'} | IM ±${context.impliedMove || '?'}pts | Levels: ${context.keyLevels || 'none'}
CHECKLIST: ${context.score || 0}/13 (Grade ${context.grade || 'F'})
OPTIONS FLOW: ${context.flow || 'No data'}
MARKET TIDE: ${context.tide || '—'}
BREADTH: ${context.breadth || '—'}
P&L: ${context.pnl || '$0'} | Trades: ${context.trades || 0}
${context.edge ? `TODAY'S EDGE: ${context.edge}` : ''}
${context.riskFlag ? `RISK: ${context.riskFlag}` : ''}`
  }

  const listeningRef = useRef(false)

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice'); return }
    if (recognitionRef.current) { recognitionRef.current.stop() }
    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'
    rec.onstart = () => { setListening(true); listeningRef.current = true }
    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(interim)
      if (final.trim()) { setLiveTranscript(''); sendChat(final.trim()) }
    }
    rec.onerror = () => { setListening(false); listeningRef.current = false; setLiveTranscript('') }
    rec.onend = () => {
      if (recognitionRef.current === rec && listeningRef.current) rec.start()
    }
    recognitionRef.current = rec
    rec.start()
  }

  const stopListening = () => {
    listeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false); setLiveTranscript('')
  }

  const speak = async (text: string) => {
    if (!keys[EL_KEY]) return

    // Stop any currently playing audio
    try {
      if (audioSourceRef.current) { audioSourceRef.current.stop(); audioSourceRef.current = null }
      if (audioCtxRef.current) { await audioCtxRef.current.close(); audioCtxRef.current = null }
    } catch {}
    audioRef.current = null

    setSpeaking(true)

    // Mute mic while AI speaks
    const wasListening = listeningRef.current
    if (wasListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      setLiveTranscript('')
    }

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': keys[EL_KEY] },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
      })
      if (!res.ok) { setSpeaking(false); if (wasListening) startListening(); return }
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      const buf = await ctx.decodeAudioData(await res.arrayBuffer())
      const src = ctx.createBufferSource()
      audioSourceRef.current = src
      src.buffer = buf
      src.connect(ctx.destination)
      src.onended = () => {
        audioSourceRef.current = null
        audioCtxRef.current = null
        setSpeaking(false)
        ctx.close()
        if (wasListening) setTimeout(() => startListening(), 600)
      }
      src.start(0)
    } catch { 
      audioSourceRef.current = null
      audioCtxRef.current = null
      setSpeaking(false)
      if (wasListening) startListening()
    }
  }

  const sendChat = async (text?: string) => {
    const msg = (text || chatInput).trim()
    if (!msg || !keys[ANTH_KEY]) return
    setChatInput('')
    setChatMessages(p => [...p, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': keys[ANTH_KEY], 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 350,
          system: buildContext(),
          messages: [...chatMessages, { role: 'user', content: msg }].slice(-10).map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'No response'
      setChatMessages(p => [...p, { role: 'assistant', content: reply }])
      speak(reply)
    } catch (e) { console.error(e) }
    setChatLoading(false)
  }

  const signalColor = context?.signal === 'LONG' ? C.synapse : context?.signal === 'SHORT' ? C.red : C.fire

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080a0f' }}>

      {/* Header */}
      <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, rgba(102,32,212,0.1), rgba(0,153,204,0.04))', borderBottom: '2px solid rgba(102,32,212,0.12)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(102,32,212,0.3)', background: 'rgba(0,212,160,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, position: 'relative' }}>
          🧠
          <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '1px solid rgba(102,32,212,0.15)', animation: 'brainRing 4s linear infinite' }} />
        </div>
        <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: C.violet }}>AI COMPANION</div>
        <div style={{ fontSize: 7, padding: '2px 6px', border: `1px solid ${listening ? 'rgba(204,16,64,0.35)' : speaking ? 'rgba(0,212,160,0.3)' : 'rgba(0,153,204,0.25)'}`, color: listening ? C.red : speaking ? C.violet : C.teal, animation: listening ? 'blink 1s infinite' : 'none' }}>
          {listening ? '● LISTENING' : speaking ? '◆ SPEAKING' : chatLoading ? '◌ THINKING' : '○ READY'}
        </div>
        {context?.signal && (
          <div style={{ marginLeft: 'auto', background: `${signalColor}12`, border: `1px solid ${signalColor}30`, padding: '2px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 8, fontWeight: 800, color: signalColor, letterSpacing: 2 }}>{context.signal}</span>
            <span style={{ fontSize: 7, color: C.textMuted }}>{context.confidence}%</span>
          </div>
        )}
      </div>

      {/* Context strip */}
      {context && (
        <div style={{ display: 'flex', background: '#0d1018', borderBottom: '1px solid rgba(0,212,160,0.15)', flexShrink: 0 }}>
          {[
            { label: 'SPX', value: context.spx, color: C.text },
            { label: 'VWAP', value: context.vwapPos, color: context.vwapPos === '▲' ? C.synapse : C.red },
            { label: 'VIX', value: context.vix, color: parseFloat(context.vix) > 18 ? C.fire : C.synapse },
            { label: 'SCORE', value: `${context.score}/13`, color: parseInt(context.score) >= 9 ? C.synapse : parseInt(context.score) >= 7 ? C.fire : C.red },
            { label: 'P&L', value: context.pnl, color: context.pnl?.startsWith('-') ? C.red : C.synapse },
          ].map(({ label, value, color }, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', padding: '3px 0', borderRight: i < 4 ? '1px solid rgba(0,212,160,0.06)' : 'none' }}>
              <div style={{ fontSize: 6, color: C.textMuted, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, color }}>{value || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#080a0f' }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 12px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🎙️</div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
              {context ? 'Live context loaded. Ask anything.' : 'Connecting to main window...'}
            </div>
            {['What\'s the setup?', 'Should I trade?', 'Am I in system?', 'What does flow say?'].map(q => (
              <button key={q} onClick={() => sendChat(q)} style={{ background: C.violetDim, border: `1px solid ${C.violetBorder}`, borderRadius: 20, padding: '3px 10px', color: C.violet, cursor: 'pointer', fontSize: 9, fontFamily: font, margin: '2px' }}>{q}</button>
            ))}
          </div>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            {m.role === 'assistant' && <div style={{ fontSize: 7, color: C.violet, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3, letterSpacing: 1 }}><span style={{ width: 3, height: 3, borderRadius: '50%', background: C.violet, display: 'inline-block' }} />AI COMPANION</div>}
            <div style={{ padding: '7px 11px', fontSize: 10, lineHeight: 1.6, color: C.text, background: m.role === 'user' ? 'rgba(0,153,204,0.06)' : 'rgba(0,212,160,0.05)', border: `1px solid ${m.role === 'user' ? 'rgba(0,153,204,0.15)' : 'rgba(0,212,160,0.12)'}`, borderLeft: m.role === 'assistant' ? '2px solid #00d4a0' : 'none', borderRight: m.role === 'user' ? '2px solid #0099cc' : 'none', borderRadius: m.role === 'user' ? '6px 2px 2px 6px' : '2px 6px 6px 2px' }}>
              {m.content}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div style={{ fontSize: 7, color: C.violet, marginBottom: 2, letterSpacing: 1 }}>AI COMPANION</div>
            <div style={{ padding: '8px 12px', background: 'rgba(0,212,160,0.05)', border: '1px solid rgba(102,32,212,0.12)', borderLeft: '2px solid #00d4a0', borderRadius: '2px 6px 6px 2px', display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.violet, animation: `pulse 1s ${i*0.15}s infinite` }} />)}
            </div>
          </div>
        )}
        {listening && liveTranscript && (
          <div style={{ alignSelf: 'flex-end', padding: '5px 9px', background: 'rgba(204,16,64,0.06)', border: '1px solid rgba(204,16,64,0.2)', borderRight: '2px solid #cc1040', borderRadius: '6px 2px 2px 6px', fontSize: 10, color: C.red, fontStyle: 'italic' }}>{liveTranscript}...</div>
        )}
      </div>

      {/* Speaking waveform */}
      {speaking && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '4px 0', background: 'rgba(248,248,255,0.8)', borderTop: '1px solid rgba(102,32,212,0.08)', flexShrink: 0 }}>
          {[...Array(16)].map((_, i) => (
            <div key={i} style={{ width: 2, borderRadius: 1, background: C.violet, animation: `waveAnim ${0.4+(i%5)*0.1}s ease-in-out infinite`, animationDelay: `${(i%4)*0.08}s`, '--wh': `${6+(i%6)*2}px` } as any} />
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '8px 12px', background: '#0d1018', borderTop: '1px solid rgba(0,212,160,0.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <button onClick={listening ? stopListening : startListening} style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${listening ? 'rgba(204,16,64,0.4)' : 'rgba(204,16,64,0.25)'}`, background: listening ? 'rgba(204,16,64,0.1)' : 'rgba(204,16,64,0.05)', color: C.red, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: listening ? 'none' : 'micGlow 2s infinite', flexShrink: 0 }}>
            {listening ? '⏹' : '🎙️'}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder={listening ? 'Listening...' : 'Ask your AI companion...'} style={{ flex: 1, background: '#131720', border: '1px solid rgba(0,212,160,0.2)', borderRadius: 3, padding: '7px 10px', color: C.text, fontFamily: font, fontSize: 10, outline: 'none' }} />
          <button onClick={() => sendChat()} disabled={!chatInput.trim() || chatLoading} style={{ width: 32, height: 32, background: chatInput.trim() ? 'rgba(0,212,160,0.12)' : 'transparent', border: `1px solid ${chatInput.trim() ? 'rgba(0,212,160,0.25)' : 'rgba(0,212,160,0.1)'}`, borderRadius: 3, color: chatInput.trim() ? C.violet : C.textMuted, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: font, fontWeight: 700, flexShrink: 0 }}>↑</button>
        </div>
        {/* Voice picker */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {[{name:'Rachel',id:'21m00Tcm4TlvDq8ikWAM'},{name:'Drew',id:'29vD33N1CtxCmqQRPOHJ'},{name:'Sarah',id:'EXAVITQu4vr4xnSDxMaL'},{name:'Thomas',id:'GBv7mTt0atIp3Br8iCZE'},{name:'Clyde',id:'2EiwWnXFnvU5JabPnv8n'}].map(v => (
            <button key={v.id} onClick={() => { setVoiceId(v.id); localStorage.setItem(VOICE_ID, v.id) }} style={{ padding: '2px 7px', borderRadius: 2, background: voiceId === v.id ? C.violetDim : 'transparent', border: `1px solid ${voiceId === v.id ? C.violetBorder : 'rgba(0,212,160,0.1)'}`, color: voiceId === v.id ? C.violet : C.textMuted, fontSize: 8, cursor: 'pointer', fontFamily: font }}>{v.name}</button>
          ))}
        </div>
      </div>
    </div>
  )
}