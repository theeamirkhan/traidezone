'use client'
import { useState, useRef } from 'react'
import ToneTester from './ToneTester'

const VOICE_ID = 'tz-voice-id'
const font = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"

const C = {
  bg: '#060810', deep: '#030408', surface: '#0c0f1a', surface2: '#111827', surface3: '#1a2235',
  border: 'rgba(0,212,160,0.10)', border2: 'rgba(0,212,160,0.25)',
  text: '#f0f4ff', textDim: '#8899bb', textMuted: '#4a5568',
  teal: '#00e5ff', tealDim: 'rgba(0,229,255,0.08)', tealBorder: 'rgba(0,229,255,0.25)', tealGlow: 'rgba(0,229,255,0.20)',
  violet: '#00d4a0', violetDim: 'rgba(0,212,160,0.08)', violetBorder: 'rgba(0,212,160,0.25)', violetGlow: 'rgba(0,212,160,0.15)',
  pink: '#ff2d78', pinkDim: 'rgba(255,45,120,0.08)', pinkBorder: 'rgba(255,45,120,0.25)',
  synapse: '#00ff88', fire: '#ff6b00', fireDim: 'rgba(255,107,0,0.08)', fireBorder: 'rgba(255,107,0,0.25)',
  red: '#ff1a4a', redDim: 'rgba(255,26,74,0.08)', redBorder: 'rgba(255,26,74,0.25)',
  yellow: '#ffb700', yellowDim: 'rgba(255,183,0,0.08)', blue: '#1a5fa8',
  purple: '#00d4a0', purpleDim: 'rgba(0,212,160,0.08)', purpleBorder: 'rgba(0,212,160,0.25)', purpleGlow: 'rgba(0,212,160,0.10)',
}


export default function SettingsModal({ keys, setKeys, onClose, voiceId, setVoiceId, voiceEngine, setVoiceEngine, darkMode, setDarkMode, aiTone, setAiTone, userName, setUserName, welcomeMessage, setWelcomeMessage, voiceSpeed, setVoiceSpeed }: any) {
  const [vals, setVals] = useState({ [VOICE_ID]: voiceId || '21m00Tcm4TlvDq8ikWAM' })
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const previewAudioRef = useRef<any>(null)

  const testVoice = async (voiceId: string) => {
    // Stop any playing preview
    try { if (previewAudioRef.current) { previewAudioRef.current.stop(); previewAudioRef.current = null } } catch {}
    setPreviewingVoice(voiceId)
    try {
      const samples: Record<string, string> = {
        nova:    "Hey, SPX is approaching your key level. What's your read on the setup?",
        shimmer: "Looks like VIX is elevated. Make sure your position size fits the risk.",
        alloy:   "Options flow is showing unusual call activity. Worth watching closely.",
        echo:    "You're up on the day. Stay disciplined — don't give it back chasing.",
        fable:   "The market's telling a story today. Let's make sure we're reading it right.",
        onyx:    "SPX broke above VWAP with conviction. Bias confirmed — stay with the trend.",
      }
      const text = samples[voiceId] || `This is the ${voiceId} voice. Clean, natural, built for trading.`
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'openai', text, voice: voiceId, speed: voiceSpeed || 1.0 })
      })
      if (!res.ok) { setPreviewingVoice(null); return }
      const buf = await res.arrayBuffer()
      const ACtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new ACtx()
      if (ctx.state === 'suspended') await ctx.resume()
      const audio = await ctx.decodeAudioData(buf)
      const src = ctx.createBufferSource()
      previewAudioRef.current = src
      src.buffer = audio
      src.connect(ctx.destination)
      src.onended = () => setPreviewingVoice(null)
      src.start(0)
    } catch { setPreviewingVoice(null) }
  }
  const save = () => {
    if (vals[VOICE_ID]) { setVoiceId(vals[VOICE_ID]); localStorage.setItem(VOICE_ID, vals[VOICE_ID]) }
    localStorage.setItem('tz-dark-mode', darkMode.toString())
    localStorage.setItem('tz-ai-tone', aiTone.toString())
    localStorage.setItem('tz-voice-speed', voiceSpeed.toString())
    const trimmedName = userName.trim()
    const trimmedWelcome = welcomeMessage.trim()
    localStorage.setItem('tz-user-name', trimmedName)
    localStorage.setItem('tz-welcome-message', trimmedWelcome)
    setUserName(trimmedName)
    setWelcomeMessage(trimmedWelcome)
    // Sync name to trader profile in Supabase
    if (trimmedName) {
      fetch('/api/trader-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName })
      }).catch(() => {})
    }
    onClose()
  }

  // testVoice defined above

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'rgba(12,15,26,0.98)', border: `1px solid ${C.border2}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' as const }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Settings</div>
        <div style={{ fontFamily: font, fontSize: 12, color: C.textDim, marginBottom: 20 }}>Customize your <span>tr<span style={{color:'#00d4a0'}}>AI</span>de Zone</span> experience</div>

        {/* Dark Mode Toggle */}
        <div style={{ marginBottom: 20, padding: '12px 14px', background: 'rgba(10,14,24,0.95)', borderRadius: 10, border: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Appearance</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{darkMode ? '🌙 Dark mode' : '☀️ Light mode'}</div>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} style={{
            width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative' as const,
            background: darkMode ? C.violet : 'rgba(100,140,220,0.2)', transition: 'background 0.2s'
          }}>
            <div style={{ position: 'absolute' as const, top: 3, left: darkMode ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(12,15,26,0.98)', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        {/* Voice Engine Selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voice Engine</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button type="button" onClick={() => { setVoiceEngine('openai'); localStorage.setItem('tz-voice-engine', 'openai') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'openai' ? C.tealDim : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'openai' ? C.tealBorder : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'openai' ? C.teal : C.text, marginBottom: 2 }}>🎙 OpenAI TTS</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>Premium — natural voices</div>
              <div style={{ fontSize: 9, color: C.synapse, marginTop: 2 }}>Pro / Elite plans</div>
            </button>
            <button type="button" onClick={() => { setVoiceEngine('webspeech'); localStorage.setItem('tz-voice-engine', 'webspeech') }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const, background: voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.1)' : 'rgba(10,14,24,0.95)', border: `1px solid ${voiceEngine === 'webspeech' ? 'rgba(100,140,220,0.4)' : C.border}`, transition: 'all 0.15s' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: voiceEngine === 'webspeech' ? '#8899ee' : C.text, marginBottom: 2 }}>🔊 Browser Voice</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>Free — device voices</div>
              <div style={{ fontSize: 9, color: C.synapse, marginTop: 2 }}>All plans</div>
            </button>
          </div>

          {voiceEngine === 'openai' && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 600 }}>Select Voice</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  { id: 'nova',    name: 'Nova',    desc: 'Warm, clear' },
                  { id: 'shimmer', name: 'Shimmer', desc: 'Soft, calm' },
                  { id: 'alloy',   name: 'Alloy',   desc: 'Neutral, precise' },
                  { id: 'echo',    name: 'Echo',     desc: 'Confident' },
                  { id: 'fable',   name: 'Fable',   desc: 'Storytelling' },
                  { id: 'onyx',    name: 'Onyx',    desc: 'Deep, authoritative' },
                ].map(v => {
                  const selected = vals[VOICE_ID] === v.id || (!vals[VOICE_ID] && v.id === 'nova')
                  return (
                    <div key={v.id} style={{ position: 'relative' as const }}>
                      <button type="button" onClick={() => setVals((p: any) => ({ ...p, [VOICE_ID]: v.id }))} style={{ width: '100%', padding: '7px 8px', paddingRight: 28, borderRadius: 6, cursor: 'pointer', textAlign: 'left' as const, background: selected ? C.tealDim : C.bg, border: `1px solid ${selected ? C.tealBorder : C.border2}`, transition: 'all 0.15s' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: selected ? C.teal : C.text }}>{v.name}</div>
                        <div style={{ fontSize: 9, color: C.textDim }}>{v.desc}</div>
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); testVoice(v.id) }} style={{ position: 'absolute' as const, top: '50%', right: 5, transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: '50%', border: `1px solid ${previewingVoice === v.id ? C.teal : C.border2}`, background: previewingVoice === v.id ? C.tealDim : 'transparent', color: previewingVoice === v.id ? C.teal : C.textMuted, cursor: 'pointer', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                        {previewingVoice === v.id ? '▶' : '▷'}
                      </button>
                    </div>
                  )
                })}
              </div>

            </div>
          )}

          {voiceEngine === 'webspeech' && (
            <div style={{ fontSize: 10, color: C.textDim, padding: '8px 12px', background: 'rgba(10,14,24,0.95)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>Uses your device's built-in voice engine. Completely free — no API costs.</span>
              <button type="button" onClick={() => {
                const utter = new SpeechSynthesisUtterance("SPX is approaching your key level. What's your read?")
                utter.rate = voiceSpeed || 1.0
                const voices = window.speechSynthesis.getVoices()
                const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen')) || voices.find(v => v.lang.startsWith('en'))
                if (preferred) utter.voice = preferred
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(utter)
              }} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 10, fontFamily: font }}>
                ▷ Preview
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Your Name</div>
          <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
            placeholder="e.g. Amir"
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>The AI will address you by name.</div>
        </div>

        {/* Welcome message */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 6 }}>Daily Welcome Message</div>
          <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
            placeholder={`e.g. "Good morning {name}. VIX is elevated — stay patient and wait for your setups."`}
            rows={3}
            style={{ width: '100%', background: 'rgba(8,12,22,0.9)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: font, fontSize: 12, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Played once per day when you open the cockpit. Use <span style={{color: C.teal}}>{'{name}'}</span> to insert your name.</div>
        </div>

        {/* AI Tone Slider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>AI Coaching Tone</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.textDim }}>🪖 Drill Sergeant</span>
            <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>{['','Drill Sergeant','Direct & Firm','Balanced','Encouraging','Life Coach'][aiTone]}</span>
            <span style={{ fontSize: 10, color: C.textDim }}>Life Coach 🧘</span>
          </div>
          <input type="range" min={1} max={5} value={aiTone} onChange={e => setAiTone(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            {[,'Blunt, direct, zero tolerance for mistakes.','Tough love, honest feedback.','Balanced accountability and support.','Positive reinforcement focused.','Empathetic, confidence-building.'][aiTone]}
          </div>

          {/* Tone Tester */}
          <ToneTester />
        </div>

        {/* Voice Speed */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font, fontSize: 9, fontWeight: 700, color: '#8899bb', textTransform: 'uppercase' as const, letterSpacing: '2px', marginBottom: 10 }}>Voice Speed</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.textDim }}>🐢 Slower</span>
            <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>{voiceSpeed <= 0.8 ? 'Slow' : voiceSpeed <= 1.0 ? 'Normal' : voiceSpeed <= 1.2 ? 'Fast' : 'Faster'}</span>
            <span style={{ fontSize: 10, color: C.textDim }}>Faster 🐇</span>
          </div>
          <input type="range" min={0.7} max={1.4} step={0.1} value={voiceSpeed} onChange={e => { setVoiceSpeed(parseFloat(e.target.value)); localStorage.setItem('tz-voice-speed', e.target.value) }}
            style={{ width: '100%', accentColor: '#00d4a0', cursor: 'pointer' }} />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Current: {voiceSpeed}x — Normal is 1.0x</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={save} style={{ flex: 1, background: C.teal, color: '#080a0f', border: 'none', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(10,14,24,0.95)', color: C.textDim, border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}



