import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any })
  const { code } = await req.json()
  try {
    const coupons = await stripe.promotionCodes.list({ code, active: true, limit: 1 })
    if (coupons.data.length > 0) {
      const promo = coupons.data[0]
      return NextResponse.json({
        valid: true,
        discount: (promo as any).coupon?.percent_off ? `${(promo as any).coupon?.percent_off}% off` : `$${((promo as any).coupon?.amount_off! / 100)} off`,
        duration: (promo as any).coupon?.duration,
      })
    }
    return NextResponse.json({ valid: false })
  } catch {
    return NextResponse.json({ valid: false })
  }
}


