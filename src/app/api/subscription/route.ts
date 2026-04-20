import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, stripe_customer_id')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ hasAccess: false, plan: null, status: 'none' })
  }

  const now = new Date()
  const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null
  const isActive = data.status === 'active' || data.status === 'trialing'
  const isExpired = periodEnd ? periodEnd < now : true

  return NextResponse.json({
    hasAccess: isActive && !isExpired,
    plan: data.plan,
    status: data.status,
    periodEnd: data.current_period_end,
  })
}
