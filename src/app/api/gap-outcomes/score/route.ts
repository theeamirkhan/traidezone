import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin
  const res  = await fetch(`${base}/api/gap-outcomes?action=score`, { signal: AbortSignal.timeout(30000) })
  const data = await res.json()
  console.log('[gap-score cron]', JSON.stringify(data))
  return NextResponse.json(data)
}
