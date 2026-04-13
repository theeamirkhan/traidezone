import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// Per-user rate limiter (in-memory, resets on cold start — supplement with DB limits later)
const voiceLimits = new Map<string, { chars: number; resetAt: number }>()
const CHARS_PER_HOUR = 50_000  // ~55 min of average responses before throttle

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Character-based rate limit (more accurate than request count for TTS)
  const now = Date.now()
  const userLimit = voiceLimits.get(userId)
  const body = await req.json()
  const { text, voice = 'nova', engine = 'openai', speed = 1.0 } = body

  if (!text || typeof text !== 'string' || text.length > 4000) {
    return NextResponse.json({ error: 'Invalid text' }, { status: 400 })
  }

  if (userLimit && now < userLimit.resetAt) {
    if (userLimit.chars + text.length > CHARS_PER_HOUR) {
      return NextResponse.json({ error: 'Rate limit exceeded — try again in an hour' }, { status: 429 })
    }
    userLimit.chars += text.length
  } else {
    voiceLimits.set(userId, { chars: text.length, resetAt: now + 3_600_000 })
  }

  // Web Speech (browser-side) — server just echoes back, no cost
  if (engine === 'webspeech') {
    return NextResponse.json({ engine: 'webspeech', text })
  }

  // OpenAI TTS — primary premium voice
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',          // tts-1 = fast + cheap; tts-1-hd = higher quality
        input: text,
        voice: voice,            // alloy, echo, fable, onyx, nova, shimmer
        speed: Math.min(Math.max(speed, 0.25), 4.0),
        response_format: 'mp3',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI TTS error:', res.status, err)
      return NextResponse.json({ error: 'Voice request failed' }, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'no-store',
      }
    })
  } catch (e) {
    return NextResponse.json({ error: 'Voice request failed' }, { status: 500 })
  }
}
