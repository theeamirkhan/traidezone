import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // Use client-provided key OR fall back to server env key
  const apiKey = searchParams.get('apiKey') === 'env' 
    ? process.env.POLYGON_API_KEY 
    : (searchParams.get('apiKey') || process.env.POLYGON_API_KEY)
  const path = searchParams.get('path')
  const paginate = searchParams.get('paginate') === 'true'

  if (!apiKey || !path) {
    return NextResponse.json({ error: 'Missing apiKey or path' }, { status: 400 })
  }

  const base = 'https://api.polygon.io'

  if (!paginate) {
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}apiKey=${apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  }

  // Server-side pagination
  let allResults: any[] = []
  let nextPath: string | null = path
  let pages = 0

  while (nextPath && pages < 25) {
    const url = `${base}${nextPath}${nextPath.includes('?') ? '&' : '?'}apiKey=${apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (data.results?.length) allResults = allResults.concat(data.results)
    if (data.next_url) {
      try { const u = new URL(data.next_url); nextPath = u.pathname + u.search }
      catch { break }
    } else { nextPath = null }
    pages++
  }

  return NextResponse.json({ status: 'OK', results: allResults, resultsCount: allResults.length, pages })
}