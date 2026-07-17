import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Unusual Whales proxy — v2 with two-layer cache + stale-serve.
 *
 * UW is the costliest data subscription; previously EVERY panel refresh
 * and EVERY signal fired fresh upstream calls, and any UW 500 became a
 * client 500 (signals silently ran flow-blind). Now:
 *   L1 module cache (per-instance, fast)
 *   L2 Supabase api_cache (shared across all serverless instances)
 *   TTL 4min — flow context stays fresh enough for signals while
 *   cutting upstream calls to ~15/hr per distinct path regardless of
 *   how many consumers ask
 *   STALE-SERVE: if UW errors, serve the last-good payload (any age)
 *   with stale:true instead of failing — 5-minute-old flow beats none
 */

const CACHE_MS = 4 * 60 * 1000
const l1: Record<string, { data: any; ts: number }> = {}

function keyFor(path: string): string {
  return 'uw_' + path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 180)
}

async function readL2(key: string): Promise<{ data: any; ts: number } | null> {
  try {
    const { data } = await supabaseAdmin.from('api_cache')
      .select('value, updated_at').eq('key', key).maybeSingle()
    if (!data?.value) return null
    return { data: data.value, ts: new Date(data.updated_at).getTime() }
  } catch { return null }
}

async function writeL2(key: string, value: any): Promise<void> {
  try {
    await supabaseAdmin.from('api_cache').upsert(
      { key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch {}
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Flow service not configured' }, { status: 503 })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  const key = keyFor(path)

  // L1 fresh
  const c1 = l1[key]
  if (c1 && Date.now() - c1.ts < CACHE_MS) {
    return NextResponse.json({ ...c1.data, _cached: true, _ageMin: Math.round((Date.now() - c1.ts) / 60000) })
  }
  // L2 fresh
  const c2 = await readL2(key)
  if (c2 && Date.now() - c2.ts < CACHE_MS) {
    l1[key] = c2
    return NextResponse.json({ ...c2.data, _cached: true, _ageMin: Math.round((Date.now() - c2.ts) / 60000) })
  }

  // Fetch upstream
  try {
    const res = await fetch(`https://api.unusualwhales.com${path}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`UW ${res.status}`)
    const data = await res.json()
    l1[key] = { data, ts: Date.now() }
    await writeL2(key, data)
    return NextResponse.json({ ...data, _cached: false })
  } catch (e: any) {
    // STALE-SERVE: last-good beats nothing
    const stale = c2 || c1 || null
    if (stale) {
      l1[key] = stale
      return NextResponse.json({
        ...stale.data, _cached: true, _stale: true,
        _ageMin: Math.round((Date.now() - stale.ts) / 60000),
        _upstreamError: e?.message || 'failed',
      })
    }
    return NextResponse.json({ error: 'Flow request failed', detail: e?.message }, { status: 500 })
  }
}
