import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Oct 4: the proxy was fully open — anyone could pull market data through
  // the server's key (a redistribution problem under individual-tier data
  // licensing). Require the request to originate from the app itself.
  const from = (req.headers.get('origin') || '') + ' ' + (req.headers.get('referer') || '')
  if (!from.includes('traidezone') && !from.includes('localhost')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const apiKeyParam = searchParams.get('apiKey')
  const path = searchParams.get('path')
  const paginate = searchParams.get('paginate') === 'true'

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  // Use server-side env var — ignore any client-passed key
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Polygon API key not configured' }, { status: 500 })
  }

  const base = 'https://api.polygon.io'

  if (!paginate) {
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}apiKey=${apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  }

  let allResults: any[] = []
  let nextPath: string | null = path
  let pages = 0

  while (nextPath && pages < 25) {
    const url: string = `${base}${nextPath}${nextPath.includes('?') ? '&' : '?'}apiKey=${apiKey}`
    const res: Response = await fetch(url, { cache: 'no-store' })
    const data: any = await res.json()

    if (data.results?.length) allResults = allResults.concat(data.results)

    if (data.next_url) {
      try {
        const u: URL = new URL(data.next_url)
        nextPath = u.pathname + u.search
      } catch { break }
    } else {
      nextPath = null
    }
    pages++
  }

  return NextResponse.json({ status: 'OK', results: allResults, resultsCount: allResults.length, pages })
}