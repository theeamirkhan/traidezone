/**
 * /api/heygen-token — HeyGen LiveAvatar session token
 *
 * Exchanges the server-side HEYGEN_API_KEY for a one-time session token
 * that the browser SDK uses to start a streaming avatar session.
 *
 * Tokens are single-use. A new one is needed for each avatar session.
 * Only accessible to authenticated users with Elite subscription.
 *
 * Lite mode: we own the LLM + TTS, HeyGen provides avatar rendering only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  // Auth check
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Subscription check — avatar is Elite-only
  // Temporarily allow all subscribers during dev (remove gating before launch)
  const devMode = process.env.HEYGEN_DEV_MODE === 'true'
  if (!devMode) {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .single()

    const isElite = sub?.status === 'active' && (sub?.plan === 'elite' || sub?.plan === 'pro')
    if (!isElite) {
      return NextResponse.json({ error: 'Avatar requires Elite plan', upgrade: true }, { status: 403 })
    }
  }

  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 503 })
  }

  try {
    const res = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[HeyGen token]', res.status, err)
      return NextResponse.json({ error: 'HeyGen token request failed', detail: err }, { status: 502 })
    }

    const data = await res.json()
    const token = data?.data?.token

    if (!token) {
      return NextResponse.json({ error: 'No token in HeyGen response', raw: data }, { status: 502 })
    }

    return NextResponse.json({ token })
  } catch (e: any) {
    console.error('[HeyGen token] fetch error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
