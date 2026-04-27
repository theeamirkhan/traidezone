/**
 * /api/reference-price — Yahoo Finance proxy for data validation
 *
 * Used by the Data Validation Agent to cross-check useMarketData output.
 * No API key required — Yahoo Finance has a free public endpoint.
 * Server-side to avoid CORS issues.
 *
 * Usage: GET /api/reference-price?symbol=%5EGSPC  (^GSPC = SPX)
 *        GET /api/reference-price?symbol=%5EVIX   (^VIX)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta

    if (!meta) {
      return NextResponse.json({ error: 'No data from Yahoo' }, { status: 502 })
    }

    // Use regularMarketPrice (most current, even after hours)
    const price = meta.regularMarketPrice ?? meta.previousClose
    const prevClose = meta.previousClose ?? null
    const change = price && prevClose ? price - prevClose : null
    const changePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null

    return NextResponse.json({
      symbol:    meta.symbol,
      price:     price,
      prevClose,
      change:    change ? parseFloat(change.toFixed(2)) : null,
      changePct: changePct ? parseFloat(changePct.toFixed(3)) : null,
      timestamp: meta.regularMarketTime,
      source:    'yahoo',
    }, {
      headers: {
        // Cache for 30s — fresh enough for validation, avoids hammering Yahoo
        'Cache-Control': 'public, max-age=30',
      }
    })

  } catch (e: any) {
    console.error('[reference-price]', e?.message)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })
  }
}
