import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// Rate limit: 30 voice requests/hour per user
const voiceLimits = new Map<string, { count: number; resetAt: number }>()

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 30/hour
  const now = Date.now()
  const limit = voiceLimits.get(userId)
  if (limit && now < limit.resetAt) {
    if (limit.count >= 30) return NextResponse.json({ error: 'Voice rate limit exceeded' }, { status: 429 })
    limit.count++
  } else {
    voiceLimits.set(userId, { count: 1, resetAt: now + 3_600_000 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })

  try {
    const { voiceId, text, model_id, voice_settings } = await req.json()

    // Cap text length to prevent abuse
    if (!text || text.length > 3000) return NextResponse.json({ error: 'Invalid text' }, { status: 400 })

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id: model_id || 'eleven_turbo_v2_5', voice_settings }),
    })
    if (!res.ok) return NextResponse.json({ error: 'Voice request failed' }, { status: res.status })
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.byteLength.toString() }
    })
  } catch (e) {
    return NextResponse.json({ error: 'Voice request failed' }, { status: 500 })
  }
}
