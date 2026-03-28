import { NextRequest, NextResponse } from 'next/server'

// Server-side ElevenLabs proxy — key never exposed to browser
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })

  try {
    const { voiceId, text, model_id, voice_settings } = await req.json()
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