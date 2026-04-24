import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const rateLimits = new Map<string, { count: number; resetAt: number }>()
const LIMIT_PER_MINUTE = 20

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = Date.now()
  const userLimit = rateLimits.get(userId)
  if (userLimit && now < userLimit.resetAt) {
    if (userLimit.count >= LIMIT_PER_MINUTE) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    userLimit.count++
  } else {
    rateLimits.set(userId, { count: 1, resetAt: now + 60_000 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })

  try {
    const body = await req.json()
    if (body.max_tokens > 2000) body.max_tokens = 2000

    // No retries — fail fast to avoid tripling cost on overload
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (data?.error?.type === 'overloaded_error') {
      return NextResponse.json({
        content: [{ type: 'text', text: "Anthropic is busy — try again in a moment." }],
        _overloaded: true
      })
    }

    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
