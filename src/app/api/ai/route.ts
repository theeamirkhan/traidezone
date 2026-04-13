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

    // Retry up to 3 times on overload with exponential backoff
    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }

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

      // Retry on overload
      if (data?.error?.type === 'overloaded_error') {
        lastError = data
        continue
      }

      return NextResponse.json(data)
    }

    // All retries exhausted — return friendly error
    return NextResponse.json({
      content: [{ type: 'text', text: "I'm getting a lot of requests right now — give me a second and try again." }],
      _retryExhausted: true
    })
  } catch (e) {
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
