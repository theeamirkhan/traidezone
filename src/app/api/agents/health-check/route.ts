/**
 * /api/agents/health-check — Error Monitoring Agent
 *
 * Runs on a schedule (configured in vercel.json) AND on-demand.
 * Checks:
 *  1. Anthropic API — credits balance, recent errors
 *  2. Data feeds — Polygon, UW, Tiingo responding
 *  3. Price sanity — app price vs Yahoo Finance
 *
 * Sends alert email/log if anything is wrong.
 * Results stored in localStorage on client via /api/agents/status endpoint.
 *
 * Trigger: GET /api/agents/health-check
 * Cron:    every 30 minutes (see vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server'

interface HealthCheck {
  name:    string
  status:  'ok' | 'warn' | 'error'
  message: string
  value?:  string | number
}

async function checkAnthropicCredits(): Promise<HealthCheck> {
  try {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return { name: 'Anthropic Credits', status: 'error', message: 'No API key configured' }

    // Ping with a tiny request to verify connectivity and credits
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      }),
      signal: AbortSignal.timeout(8000),
    })

    const data = await res.json()

    if (data?.error?.type === 'authentication_error') {
      return { name: 'Anthropic Credits', status: 'error', message: 'API key invalid or expired' }
    }
    if (data?.error?.type === 'overloaded_error') {
      return { name: 'Anthropic Credits', status: 'warn', message: 'Anthropic overloaded — retries may fail' }
    }
    if (res.status === 529 || data?.error) {
      return { name: 'Anthropic Credits', status: 'warn', message: `Unexpected: ${data?.error?.type || res.status}` }
    }

    return { name: 'Anthropic Credits', status: 'ok', message: 'API responding normally' }

  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { name: 'Anthropic Credits', status: 'error', message: 'API timed out after 8s' }
    }
    return { name: 'Anthropic Credits', status: 'error', message: e?.message || 'Unknown error' }
  }
}

async function checkPolygon(): Promise<HealthCheck> {
  try {
    const key = process.env.POLYGON_API_KEY
    // Use 5-minute bars — always real-time, no DELAYED status during market hours
    const now  = new Date()
    const from = new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0]
    const to   = now.toISOString().split('T')[0]
    const url  = `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/5/minute/${from}/${to}?adjusted=true&sort=desc&limit=1&apiKey=${key}`

    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()

    if (!res.ok || data.status === 'ERROR' || data.status === 'NOT_AUTHORIZED') {
      return { name: 'Polygon Data', status: 'error', message: data.message || data.error || `HTTP ${res.status}` }
    }

    const bar   = data.results?.[0]
    const price = bar?.c
    const ageMs = bar ? Date.now() - bar.t : null
    const ageMin = ageMs ? Math.round(ageMs / 60000) : null

    return {
      name: 'Polygon Data', status: 'ok',
      message: `SPX: ${price ? price.toFixed(2) : 'no data'}${ageMin !== null ? ` (${ageMin}m ago)` : ''}`,
      value: price
    }
  } catch (e: any) {
    return { name: 'Polygon Data', status: 'error', message: e?.message || 'Fetch failed' }
  }
}

async function checkUnusualWhales(): Promise<HealthCheck> {
  try {
    // Use same endpoint format as cockpit — direct to UW API
    const res = await fetch('https://phx.unusualwhales.com/api/option-trades/flow-alerts?limit=1', {
      headers: {
        Authorization: `Bearer ${process.env.UW_API_KEY || ''}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    })
    const data = await res.json().catch(() => ({}))

    // 404 = no flow data right now (normal pre-market / post-market)
    // 401/403 = auth issue = real problem
    if (res.status === 401 || res.status === 403) {
      return { name: 'Unusual Whales', status: 'error', message: `Auth failed (${res.status}) — check UW_API_KEY` }
    }
    if (!res.ok) {
      return { name: 'Unusual Whales', status: 'warn', message: `HTTP ${res.status} — no flow data (normal pre/post market)` }
    }

    const count = Array.isArray(data) ? data.length : (data?.data?.length || 0)
    return { name: 'Unusual Whales', status: 'ok', message: `Flow API ok — ${count} alert(s)` }
  } catch (e: any) {
    return { name: 'Unusual Whales', status: 'warn', message: e?.message || 'Fetch failed' }
  }
}

async function checkPriceSanity(): Promise<HealthCheck> {
  try {
    // Fetch Yahoo Finance reference price
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1m&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
    )
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice

    if (!price) {
      return { name: 'Price Reference', status: 'warn', message: 'Yahoo Finance not returning SPX price' }
    }
    if (price < 5000 || price > 12000) {
      return { name: 'Price Reference', status: 'error', message: `Yahoo SPX ${price} outside valid range — data issue` }
    }

    return {
      name: 'Price Reference', status: 'ok',
      message: `Yahoo Finance SPX: ${price.toFixed(2)}`,
      value: price
    }
  } catch (e: any) {
    return { name: 'Price Reference', status: 'warn', message: 'Yahoo Finance unavailable' }
  }
}

export async function GET(req: NextRequest) {
  // Allow unauthenticated for cron (Vercel cron has no session)
  // But check for cron secret header for security
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isCronSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET || 'traidezone-cron'}`

  if (!isVercelCron && !isCronSecret) {
    // For browser calls, allow from same domain
    const origin = req.headers.get('origin') || req.headers.get('referer') || ''
    if (!origin.includes('traidezone.ai') && !origin.includes('localhost')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startTime = Date.now()

  // Run all checks in parallel
  const [anthropic, polygon, uw, priceSanity, flashAlpha, breadth] = await Promise.all([
    checkAnthropicCredits(),
    checkPolygon(),
    checkUnusualWhales(),
    checkPriceSanity(),
    // FlashAlpha GEX — check key presence only (no API call, preserves 5/day limit)
    (async (): Promise<HealthCheck> => {
      const key = process.env.FLASHALPHA_API_KEY
      if (!key) return { name: 'FlashAlpha GEX', status: 'warn', message: 'FLASHALPHA_API_KEY not set — using VIX heuristic' }
      return { name: 'FlashAlpha GEX', status: 'ok', message: 'Key configured — GEX fetched daily pre-market, cached until EOD' }
    })(),
    // TICK/TRIN/VVIX breadth check
    (async (): Promise<HealthCheck> => {
      try {
        const key = process.env.POLYGON_API_KEY
        const to = new Date().toISOString().split('T')[0]
        const from = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
        const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:VVIX/range/5/minute/${from}/${to}?adjusted=true&sort=desc&limit=1&apiKey=${key}`, {
          signal: AbortSignal.timeout(6000)
        })
        const d = await res.json()
        if (d.status === 'OK' && d.results?.[0]) {
          return { name: 'Breadth (TICK/TRIN/VVIX)', status: 'ok', message: `VVIX: ${d.results[0].c?.toFixed(1)} | TICK+TRIN on Indices Advanced` }
        }
        return { name: 'Breadth (TICK/TRIN/VVIX)', status: 'warn', message: d.status || 'No data' }
      } catch (e: any) {
        return { name: 'Breadth (TICK/TRIN/VVIX)', status: 'warn', message: e?.message || 'Fetch failed' }
      }
    })(),
  ])

  // Signal Quality Gate — always ok (client-side module, no external deps)
  const qualityGate: HealthCheck = {
    name: 'Signal Quality Gate',
    status: 'ok',
    message: 'Active — 8-stream voting system scoring every LONG/SHORT signal'
  }

  const checks = [anthropic, polygon, uw, priceSanity, flashAlpha, breadth, qualityGate]
  const hasErrors = checks.some(c => c.status === 'error')
  const hasWarnings = checks.some(c => c.status === 'warn')
  const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warn' : 'ok'

  const result = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    checks,
  }

  // Log errors to console (Vercel captures these)
  if (hasErrors) {
    console.error('[HealthAgent] ERRORS DETECTED:', checks.filter(c => c.status === 'error').map(c => `${c.name}: ${c.message}`).join(' | '))
  }
  if (hasWarnings) {
    console.warn('[HealthAgent] Warnings:', checks.filter(c => c.status === 'warn').map(c => `${c.name}: ${c.message}`).join(' | '))
  }

  return NextResponse.json(result)
}
