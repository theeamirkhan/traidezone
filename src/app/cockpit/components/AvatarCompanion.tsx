'use client'
/**
 * AvatarCompanion — HeyGen LiveAvatar streaming companion
 *
 * Lite mode integration: we provide LLM (Claude) + TTS (HeyGen's built-in
 * for avatar lip-sync) and HeyGen renders the avatar video stream.
 *
 * Flow:
 *  1. User enables avatar in settings → AvatarCompanion mounts
 *  2. fetchToken() → /api/heygen-token → one-time session token
 *  3. StreamingAvatar SDK creates WebRTC session
 *  4. When companion has a response → avatar.speak(text) with HEYGEN_TTS
 *  5. Avatar renders lip-synced video in real time
 *  6. On session end or tab close → avatar.stopAvatar()
 *
 * The companion chat logic stays in page.tsx unchanged.
 * AvatarCompanion is a DROP-IN replacement for the video/speaking indicator
 * in the companion panel — all message logic stays the same.
 */

'use client'
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  VoiceEmotion,
  TaskType,
} from '@heygen/streaming-avatar'

const font        = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"
const C = {
  bg: '#080a0f', teal: '#00d4a0', yellow: '#ffb700',
  green: '#00ff88', text: '#f0f4ff', muted: 'rgba(255,255,255,0.4)',
  border: 'rgba(0,212,160,0.15)',
}

export type AvatarCompanionHandle = {
  /** Speak a response through the avatar */
  speak: (text: string) => Promise<void>
  /** Whether the avatar is connected and ready */
  isReady: boolean
}

interface Props {
  /** Avatar ID from HeyGen (your custom avatar or a public one) */
  avatarId:     string
  /** Voice ID from HeyGen (for lip-sync quality) */
  heygenVoiceId?: string
  /** Called when avatar connects/disconnects */
  onStatusChange?: (status: 'connecting' | 'ready' | 'error' | 'disconnected') => void
  /** Called when avatar starts/stops speaking (for UI sync) */
  onSpeakingChange?: (speaking: boolean) => void
  /** Width/height of video element */
  width?:  number
  height?: number
}

type Status = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error' | 'disconnected'

const AvatarCompanion = forwardRef<AvatarCompanionHandle, Props>(({
  avatarId,
  heygenVoiceId = 'en-US-AriaNeural',
  onStatusChange,
  onSpeakingChange,
  width  = 280,
  height = 280,
}, ref) => {
  const [status, setStatus]       = useState<Status>('idle')
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [stream, setStream]       = useState<MediaStream | null>(null)

  const avatarRef  = useRef<InstanceType<typeof StreamingAvatar> | null>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const mountedRef = useRef(true)

  const updateStatus = useCallback((s: Status) => {
    if (!mountedRef.current) return
    setStatus(s)
    if (s === 'connecting' || s === 'ready' || s === 'error' || s === 'disconnected') {
      onStatusChange?.(s)
    }
  }, [onStatusChange])

  // ── Init avatar session ───────────────────────────────────────────────────
  const init = useCallback(async () => {
    updateStatus('connecting')
    setErrorMsg(null)

    try {
      // Get one-time session token from server
      const tokenRes = await fetch('/api/heygen-token', { method: 'POST' })
      const tokenData = await tokenRes.json()

      if (!tokenRes.ok || !tokenData.token) {
        if (tokenData.upgrade) {
          setErrorMsg('Avatar requires Elite plan')
        } else {
          setErrorMsg(tokenData.error || 'Token fetch failed')
        }
        updateStatus('error')
        return
      }

      // Create StreamingAvatar instance (Lite mode — we own LLM + TTS)
      const avatar = new StreamingAvatar({ token: tokenData.token })
      avatarRef.current = avatar

      // ── Event listeners ─────────────────────────────────────────────────
      avatar.on(StreamingEvents.STREAM_READY, (evt: any) => {
        if (!mountedRef.current) return
        setStream(evt.detail as MediaStream)
        updateStatus('ready')
        onSpeakingChange?.(false)
      })

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        if (!mountedRef.current) return
        updateStatus('speaking')
        onSpeakingChange?.(true)
      })

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        if (!mountedRef.current) return
        if (status !== 'error' && status !== 'disconnected') updateStatus('ready')
        onSpeakingChange?.(false)
      })

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        if (!mountedRef.current) return
        updateStatus('disconnected')
        onSpeakingChange?.(false)
      })

      // ── Start avatar session ─────────────────────────────────────────────
      await avatar.createStartAvatar({
        quality:    AvatarQuality.High,
        avatarName: avatarId,
        // Lite mode: we send text manually, no built-in LLM
        voice: {
          voiceId:  heygenVoiceId,
          emotion:  VoiceEmotion.BROADCASTER,
        },
        // No knowledgeId — Lite mode handles LLM externally (Claude)
        language: 'en',
      })

    } catch (e: any) {
      console.error('[AvatarCompanion] init error:', e.message)
      if (!mountedRef.current) return
      setErrorMsg(e.message)
      updateStatus('error')
    }
  }, [avatarId, heygenVoiceId, updateStatus, onSpeakingChange, status])

  // ── Wire video stream to <video> element ─────────────────────────────────
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(console.warn)
    }
  }, [stream])

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    init()
    return () => {
      mountedRef.current = false
      avatarRef.current?.stopAvatar?.()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Expose speak() to parent via ref ─────────────────────────────────────
  useImperativeHandle(ref, () => ({
    isReady: status === 'ready' || status === 'speaking',
    speak: async (text: string) => {
      if (!avatarRef.current || (status !== 'ready' && status !== 'speaking')) {
        console.warn('[AvatarCompanion] Not ready to speak, status:', status)
        return
      }
      if (!text?.trim()) return
      try {
        await avatarRef.current.speak({
          text,
          task_type: TaskType.TALK,
        })
      } catch (e: any) {
        console.warn('[AvatarCompanion] speak error:', e.message)
      }
    },
  }), [status])

  // ── Status badge ─────────────────────────────────────────────────────────
  const statusBadge = {
    idle:         { color: '#4a5568', label: '○ OFF' },
    connecting:   { color: C.yellow, label: '⟳ CONNECTING' },
    ready:        { color: C.teal,   label: '● LIVE' },
    speaking:     { color: C.green,  label: '◆◆ SPEAKING' },
    error:        { color: '#ff4d6d', label: '✕ ERROR' },
    disconnected: { color: '#ff8c42', label: '↻ DISCONNECTED' },
  }[status]

  return (
    <div style={{ position: 'relative', width, fontFamily: font }}>
      {/* Video element */}
      <div style={{
        width, height,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1425 100%)',
        border: `1px solid ${status === 'ready' || status === 'speaking' ? C.border : 'rgba(255,255,255,0.06)'}`,
        boxShadow: status === 'speaking' ? '0 0 30px rgba(0,212,160,0.2)' : 'none',
        transition: 'box-shadow 0.3s ease',
        position: 'relative',
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: stream ? 'block' : 'none',
          }}
        />

        {/* Loading / error overlay */}
        {status !== 'ready' && status !== 'speaking' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12,
          }}>
            {/* Idle avatar silhouette */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(0,212,160,0.08)',
              border: '2px solid rgba(0,212,160,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36,
            }}>
              🤖
            </div>

            {status === 'connecting' && (
              <div style={{ fontSize: 9, color: C.yellow, letterSpacing: 1 }}>
                Connecting avatar...
              </div>
            )}
            {status === 'error' && (
              <div style={{ textAlign: 'center', padding: '0 20px' }}>
                <div style={{ fontSize: 9, color: '#ff4d6d', marginBottom: 6 }}>
                  {errorMsg || 'Connection failed'}
                </div>
                <button onClick={init} style={{
                  fontSize: 8, padding: '4px 10px', borderRadius: 4,
                  border: '1px solid rgba(255,77,109,0.4)', background: 'rgba(255,77,109,0.08)',
                  color: '#ff4d6d', cursor: 'pointer', fontFamily: font,
                }}>↻ Retry</button>
              </div>
            )}
            {status === 'disconnected' && (
              <button onClick={init} style={{
                fontSize: 8, padding: '4px 10px', borderRadius: 4,
                border: '1px solid rgba(255,140,66,0.4)', background: 'rgba(255,140,66,0.08)',
                color: '#ff8c42', cursor: 'pointer', fontFamily: font,
              }}>↻ Reconnect</button>
            )}
            {status === 'idle' && (
              <button onClick={init} style={{
                fontSize: 9, padding: '5px 14px', borderRadius: 5,
                border: `1px solid ${C.border}`, background: 'rgba(0,212,160,0.06)',
                color: C.teal, cursor: 'pointer', fontFamily: font,
              }}>Start Avatar</button>
            )}
          </div>
        )}

        {/* Speaking waveform overlay */}
        {status === 'speaking' && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 2, alignItems: 'center',
            background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '4px 10px',
          }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{
                width: 2, borderRadius: 1, background: C.teal,
                animation: `waveAnim ${0.4 + (i % 4) * 0.1}s ease-in-out infinite`,
                animationDelay: `${i * 0.06}s`,
                '--wh': `${6 + (i % 4) * 3}px`,
              } as any} />
            ))}
          </div>
        )}
      </div>

      {/* Status badge */}
      <div style={{
        marginTop: 6, textAlign: 'center',
        fontSize: 8, color: statusBadge.color,
        letterSpacing: 1, fontWeight: 700,
      }}>
        {statusBadge.label}
      </div>
    </div>
  )
})

AvatarCompanion.displayName = 'AvatarCompanion'
export default AvatarCompanion
