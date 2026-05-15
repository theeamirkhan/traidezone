/**
 * /api/feedback — User feature suggestions and feedback
 *
 * POST: Save a feature suggestion or feedback item
 * GET:  List feedback for a user (admin view)
 *
 * Stores in Supabase feedback table.
 * Also saves disclaimer acceptance to trader_profiles.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Handle disclaimer acceptance
  if (body.type === 'disclaimer_accepted') {
    const { error } = await supabaseAdmin
      .from('trader_profiles')
      .upsert({
        user_id:               userId,
        disclaimer_accepted:   true,
        disclaimer_accepted_at: new Date().toISOString(),
        disclaimer_version:    body.version || '1.0',
        updated_at:            new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ saved: true, type: 'disclaimer' })
  }

  // Handle feature suggestion / feedback
  if (body.type === 'suggestion' || body.type === 'bug' || body.type === 'feedback') {
    const { error } = await supabaseAdmin
      .from('user_feedback')
      .insert({
        user_id:    userId,
        type:       body.type,       // 'suggestion' | 'bug' | 'feedback'
        category:   body.category || 'general',
        title:      body.title?.substring(0, 200),
        body:       body.body?.substring(0, 2000),
        priority:   body.priority || 'normal',
        created_at: new Date().toISOString(),
        metadata: {
          platform:  'cockpit',
          userAgent: req.headers.get('user-agent')?.substring(0, 100),
        }
      })

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') return NextResponse.json({ needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ saved: true, type: body.type })
  }

  return NextResponse.json({ error: 'Unknown feedback type' }, { status: 400 })
}
