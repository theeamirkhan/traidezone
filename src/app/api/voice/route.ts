import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// Per-user rate limiter — only counts OpenAI TTS chars, not webspeech
const voiceLimits = new Map<string, { chars: number; resetAt: number }>()
const CHARS_PER_HOUR = 200_000  // generous limit — ~3-4 hrs of active conversation

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { text, voice = 'nova', engine = 'openai', speed = 1.0 } = body

  if (!text || typeof text !== 'string' || text.length === 0) {
    return NextResponse.json({ error: 'Invalid text' }, { status: 400 })
  }

  // Cap individual request size
  const trimmed = text.substring(0, 600)  // ~10s of audio max, keeps within Vercel timeout

  // Web Speech — free, no rate limit needed, just echo back
  if (engine === 'webspeech') {
    return NextResponse.json({ engine: 'webspeech', text: trimmed })
  }

  // OpenAI TTS — apply rate limit only here
  const now = Date.now()
  const userLimit = voiceLimits.get(userId)
  if (userLimit && now < userLimit.resetAt) {
    if (userLimit.chars + trimmed.length > CHARS_PER_HOUR) {
      return NextResponse.json({ error: 'Voice rate limit exceeded — resets in 1 hour' }, { status: 429 })
    }
    userLimit.chars += trimmed.length
  } else {
    voiceLimits.set(userId, { chars: trimmed.length, resetAt: now + 3_600_000 })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('OPENAI_API_KEY not set')
    return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })
  }

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: trimmed,
        voice: voice,
        speed: Math.min(Math.max(Number(speed) || 1.0, 0.25), 4.0),
        response_format: 'mp3',
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('OpenAI TTS error:', res.status, errText)
      // Return the actual error so client can see what went wrong
      return NextResponse.json({ 
        error: 'OpenAI TTS failed', 
        status: res.status,
        detail: errText.substring(0, 200)
      }, { status: res.status })
    }

    // Stream OpenAI audio directly to client — avoids server-side buffering delay
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Transfer-Encoding': 'chunked',
      }
    })
  } catch (e: any) {
    console.error('Voice route exception:', e?.message)
    return NextResponse.json({ error: 'Voice request failed', detail: e?.message }, { status: 500 })
  }
}
