import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'

const PLANS: Record<string, { price: string; name: string }> = {
  starter:   { price: process.env.STRIPE_STARTER_PRICE_ID!,    name: 'Starter' },
  pro:       { price: process.env.STRIPE_PRO_PRICE_ID!,        name: 'Pro' },
  elite:     { price: process.env.STRIPE_ELITE_PRICE_ID!,      name: 'Elite' },
  eliteplus: { price: process.env.STRIPE_ELITE_PLUS_PRICE_ID!, name: 'Elite+' },
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan, email, promoCode } = await req.json()
  const planConfig = PLANS[plan]
  if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  try {
    // Resolve promo code to promotion code ID
    let discounts: any[] = []
    if (promoCode) {
      const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 })
      if (promos.data.length > 0) {
        discounts = [{ promotion_code: promos.data[0].id }]
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.price, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/cockpit?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      customer_email: email,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan }, trial_period_days: 7 },
      allow_promotion_codes: discounts.length === 0, // show Stripe's own promo field if none applied
      ...(discounts.length > 0 && { discounts }),
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}