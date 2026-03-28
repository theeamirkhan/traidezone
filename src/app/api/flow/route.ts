import { NextRequest, NextResponse } from 'next/server'

// Server-side Unusual Whales proxy
export async function GET(req: NextRequest) {
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Flow service not configured' }, { status: 503 })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const res = await fetch(`https://api.unusualwhales.com${path}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Flow request failed' }, { status: 500 })
  }
}