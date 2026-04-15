import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// Server-side Tiingo proxy — key never exposed to client
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker') || 'SPY'
  const endpoint = searchParams.get('endpoint') || 'iex'

  const tiingoKey = process.env.TIINGO_API_KEY
  if (!tiingoKey) return NextResponse.json({ error: 'Tiingo not configured' }, { status: 503 })

  try {
    let url: string
    if (endpoint === 'iex') {
      // Real-time quote with last price — free tier
      url = `https://api.tiingo.com/iex/?tickers=${ticker}&token=${tiingoKey}`
    } else if (endpoint === 'intraday') {
      // 1-minute bars today — requires IEX subscription
      const today = new Date().toISOString().split('T')[0]
      url = `https://api.tiingo.com/iex/${ticker}/prices?startDate=${today}&resampleFreq=5min&token=${tiingoKey}`
    } else {
      url = `https://api.tiingo.com/tiingo/daily/${ticker}/prices?token=${tiingoKey}`
    }

    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Tiingo error', detail: err.substring(0, 200) }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: 'Tiingo request failed', detail: e?.message }, { status: 500 })
  }
}
