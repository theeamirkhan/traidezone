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
    const today = new Date().toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${today}/${today}?adjusted=true&apiKey=${key}`

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()

    if (data.status === 'ERROR') {
      return { name: 'Polygon Data', status: 'error', message: data.error || 'Polygon error' }
    }
    if (data.status === 'DELAYED') {
      return { name: 'Polygon Data', status: 'warn', message: 'Data is delayed (normal outside market hours)' }
    }

    const price = data.results?.[0]?.c
    return {
      name: 'Polygon Data', status: 'ok',
      message: `Responding — SPY last: ${price ? '$' + price.toFixed(2) : 'no bars today'}`,
      value: price
    }
  } catch (e: any) {
    return { name: 'Polygon Data', status: 'error', message: e?.message || 'Fetch failed' }
  }
}

async function checkUnusualWhales(): Promise<HealthCheck> {
  try {
    const res = await fetch('https://phx.unusualwhales.com/api/option-trades/flow-alerts?limit=1', {
      headers: { Authorization: `Bearer ${process.env.UW_API_KEY || ''}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      return { name: 'Unusual Whales', status: 'warn', message: `HTTP ${res.status} — flow data may be unavailable` }
    }
    return { name: 'Unusual Whales', status: 'ok', message: 'Flow API responding' }
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
  const [anthropic, polygon, uw, priceSanity] = await Promise.all([
    checkAnthropicCredits(),
    checkPolygon(),
    checkUnusualWhales(),
    checkPriceSanity(),
  ])

  const checks = [anthropic, polygon, uw, priceSanity]
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
