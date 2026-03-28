import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'

const PLANS: Record<string, { price: string; amount: number }> = {
  pro: { price: process.env.STRIPE_PRO_PRICE_ID || '', amount: 3900 },
  elite: { price: process.env.STRIPE_ELITE_PRICE_ID || '', amount: 7900 },
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { plan, email } = await req.json()
  const planConfig = PLANS[plan]
  if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.price, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/cockpit?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      customer_email: email,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}