import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook error: ${e.message}` }, { status: 400 })
  }

  const upsertSub = async (sub: Stripe.Subscription, status: string) => {
    const userId = sub.metadata?.userId
    if (!userId) return
    const plan = sub.metadata?.plan || 'pro'
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      plan, status,
      current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    await supabase.from('profiles').update({ plan_tier: status === 'active' ? plan : 'free' }).eq('id', userId)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        await upsertSub(sub, 'active')
      }
      break
    }
    case 'customer.subscription.updated':
      await upsertSub(event.data.object as Stripe.Subscription, (event.data.object as Stripe.Subscription).status)
      break
    case 'customer.subscription.deleted':
      await upsertSub(event.data.object as Stripe.Subscription, 'canceled')
      break
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if ((invoice as any).subscription) {
        await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', (invoice as any).subscription as string)
      }
      break
    }
  }
  return NextResponse.json({ received: true })
}