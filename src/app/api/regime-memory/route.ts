/**
 * /api/regime-memory — client-facing wrapper for the regime memory loop.
 *
 * POST { components: RegimeComponents } → measured outcome stats from
 * similar historical states. Used by the cockpit to enrich the trigger
 * overlay and companion context with empirical probabilities.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRegimeMemory } from '../../lib/regimeMemory'

function isAuthorized(req: NextRequest): boolean {
  const url = new URL(req.url)
  const isManualBypass = url.searchParams.get('cron') === '1'
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || ''
  const isFromApp = origin.includes('traidezone') || origin.includes('localhost')
  return isManualBypass || isFromApp
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const memory = await getRegimeMemory(body.components || {})
    return NextResponse.json({ ok: true, ...memory })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
