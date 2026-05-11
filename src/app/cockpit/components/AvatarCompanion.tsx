'use client'
/**
 * AvatarCompanion — HeyGen LiveAvatar streaming companion
 *
 * SDK loaded dynamically at runtime via unpkg CDN to avoid Vercel build issues
 * (livekit-client / protobufjs have native postinstall scripts that fail in CI).
 *
 * Lite mode: Claude handles LLM, HeyGen renders avatar + lip-sync.
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  teal: '#00d4a0', yellow: '#ffb700', green: '#00ff88',
  muted: 'rgba(255,255,255,0.4)', border: 'rgba(0,212,160,0.15)',
}

export type AvatarCompanionHandle = {
  speak:   (text: string) => Promise<void>
  isReady: boolean
}

interface Props {
  avatarId:         string
  heygenVoiceId?:   string
  onStatusChange?:  (status: 'connecting'|'ready'|'error'|'disconnected') => void
  onSpeakingChange?:(speaking: boolean) => void
  width?:           number
  height?:          number
}

type Status = 'idle'|'connecting'|'ready'|'speaking'|'error'|'disconnected'

// ── Load HeyGen SDK from CDN ──────────────────────────────────────────────────
let sdkCache: any = null

async function loadSDK() {
  if (sdkCache) return sdkCache
  return new Promise<any>((resolve, reject) => {
    if ((window as any).__heygenSDK) { sdkCache = (window as any).__heygenSDK; resolve(sdkCache); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@heygen/streaming-avatar@2.1.0/lib/index.umd.js'
    script.onload = () => {
      const sdk = (window as any).StreamingAvatarSDK || (window as any).__heygenSDK
      if (sdk) { sdkCache = sdk; resolve(sdk) }
      else reject(new Error('HeyGen SDK not found on window after script load'))
    }
    script.onerror = () => reject(new Error('Failed to load HeyGen SDK from CDN'))
    document.head.appendChild(script)
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
const AvatarCompanion = forwardRef<AvatarCompanionHandle, Props>(({
  avatarId, heygenVoiceId = 'en-US-AriaNeural',
  onStatusChange, onSpeakingChange,
  width = 280, height = 280,
}, ref) => {
  const [status, setStatus]     = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string|null>(null)
  const [stream, setStream]     = useState<MediaStream|null>(null)

  const avatarRef  = useRef<any>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const mountedRef = useRef(true)

  const updateStatus = useCallback((s: Status) => {
    if (!mountedRef.current) return
    setStatus(s)
    if (s !== 'speaking') onStatusChange?.(s as any)
  }, [onStatusChange])

  const init = useCallback(async () => {
    updateStatus('connecting')
    setErrorMsg(null)
    try {
      // 1. Load SDK from CDN
      const sdk = await loadSDK()
      const StreamingAvatar = sdk.default || sdk.StreamingAvatar || sdk

      // 2. Get session token
      const tokenRes  = await fetch('/api/heygen-token', { method: 'POST' })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || !tokenData.token) {
        setErrorMsg(tokenData.error || 'Token fetch failed')
        updateStatus('error'); return
      }

      // 3. Create avatar instance
      const avatar = new StreamingAvatar({ token: tokenData.token })
      avatarRef.current = avatar

      // 4. Events
      const Events = sdk.StreamingEvents || {}
      avatar.on(Events.STREAM_READY || 'stream.ready', (evt: any) => {
        if (!mountedRef.current) return
        setStream(evt.detail)
        updateStatus('ready')
        onSpeakingChange?.(false)
      })
      avatar.on(Events.AVATAR_START_TALKING || 'avatar.start_talking', () => {
        if (!mountedRef.current) return
        setStatus('speaking')
        onSpeakingChange?.(true)
      })
      avatar.on(Events.AVATAR_STOP_TALKING || 'avatar.stop_talking', () => {
        if (!mountedRef.current) return
        updateStatus('ready')
        onSpeakingChange?.(false)
      })
      avatar.on(Events.STREAM_DISCONNECTED || 'stream.disconnected', () => {
        if (!mountedRef.current) return
        updateStatus('disconnected')
        onSpeakingChange?.(false)
      })

      // 5. Start session
      const Quality = sdk.AvatarQuality || {}
      const Emotion  = sdk.VoiceEmotion || {}
      await avatar.createStartAvatar({
        quality:    Quality.High || 'high',
        avatarName: avatarId,
        voice:      { voiceId: heygenVoiceId, emotion: Emotion.BROADCASTER || 'broadcaster' },
        language:   'en',
      })
    } catch (e: any) {
      if (!mountedRef.current) return
      console.error('[AvatarCompanion]', e.message)
      setErrorMsg(e.message)
      updateStatus('error')
    }
  }, [avatarId, heygenVoiceId, updateStatus, onSpeakingChange])

  // Wire video stream
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(console.warn)
    }
  }, [stream])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; avatarRef.current?.stopAvatar?.() }
  }, [])

  useImperativeHandle(ref, () => ({
    isReady: status === 'ready' || status === 'speaking',
    speak: async (text: string) => {
      if (!avatarRef.current || !text?.trim()) return
      const sdk    = sdkCache
      const TaskType = sdk?.TaskType || {}
      try {
        await avatarRef.current.speak({ text, task_type: TaskType.TALK || 'talk' })
      } catch (e: any) {
        console.warn('[AvatarCompanion] speak:', e.message)
      }
    },
  }), [status])

  const badge = {
    idle:         { color: '#4a5568', label: '○ OFF' },
    connecting:   { color: C.yellow, label: '⟳ CONNECTING' },
    ready:        { color: C.teal,   label: '● LIVE' },
    speaking:     { color: C.green,  label: '◆◆ SPEAKING' },
    error:        { color: '#ff4d6d', label: '✕ ERROR' },
    disconnected: { color: '#ff8c42', label: '↻ DISCONNECTED' },
  }[status]

  return (
    <div style={{ position: 'relative', width, fontFamily: font }}>
      <div style={{
        width, height, borderRadius: 12, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1425 100%)',
        border: `1px solid ${status === 'ready' || status === 'speaking' ? C.border : 'rgba(255,255,255,0.06)'}`,
        boxShadow: status === 'speaking' ? '0 0 30px rgba(0,212,160,0.2)' : 'none',
        position: 'relative',
      }}>
        <video ref={videoRef} autoPlay playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }} />

        {status !== 'ready' && status !== 'speaking' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,212,160,0.08)', border: '2px solid rgba(0,212,160,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🤖</div>
            {status === 'connecting' && <div style={{ fontSize: 9, color: C.yellow, letterSpacing: 1 }}>Connecting avatar...</div>}
            {status === 'error' && (
              <div style={{ textAlign: 'center', padding: '0 20px' }}>
                <div style={{ fontSize: 9, color: '#ff4d6d', marginBottom: 6 }}>{errorMsg || 'Connection failed'}</div>
                <button onClick={init} style={{ fontSize: 8, padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(255,77,109,0.4)', background: 'rgba(255,77,109,0.08)', color: '#ff4d6d', cursor: 'pointer', fontFamily: font }}>↻ Retry</button>
              </div>
            )}
            {status === 'disconnected' && (
              <button onClick={init} style={{ fontSize: 8, padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(255,140,66,0.4)', background: 'rgba(255,140,66,0.08)', color: '#ff8c42', cursor: 'pointer', fontFamily: font }}>↻ Reconnect</button>
            )}
            {status === 'idle' && (
              <button onClick={init} style={{ fontSize: 9, padding: '5px 14px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(0,212,160,0.06)', color: C.teal, cursor: 'pointer', fontFamily: font }}>Start Avatar</button>
            )}
          </div>
        )}

        {status === 'speaking' && (
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'center', background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '4px 10px' }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ width: 2, borderRadius: 1, background: C.teal, animation: `waveAnim ${0.4+(i%4)*0.1}s ease-in-out infinite`, animationDelay: `${i*0.06}s`, '--wh': `${6+(i%4)*3}px` } as any} />
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, textAlign: 'center', fontSize: 8, color: badge.color, letterSpacing: 1, fontWeight: 700 }}>{badge.label}</div>
    </div>
  )
})

AvatarCompanion.displayName = 'AvatarCompanion'
export default AvatarCompanion
