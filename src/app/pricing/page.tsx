'use client'
import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

const font = "'Share Tech Mono', monospace"
const fontDisplay = "'Orbitron', sans-serif"

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    color: '#8090b0',
    features: [
      'AI Morning Brief (3/day)',
      'Basic market data',
      'Manual checklist',
      'Trade journal',
      'Community access',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$39',
    period: '/month',
    color: '#6620d4',
    features: [
      'Unlimited AI analysis',
      'Real-time news + calendar',
      'Options flow (Unusual Whales)',
      'Multi-timeframe confluence',
      'AI voice companion',
      '0DTE options skew',
      'Trade pattern analysis',
      'Session memory',
      'Chart with drawing tools',
      'Popout companion window',
    ],
    cta: 'Start Pro',
    popular: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$79',
    period: '/month',
    color: '#00aa55',
    features: [
      'Everything in Pro',
      'Macro regime detection',
      'Historical gap analysis (Tiingo)',
      'Priority AI response speed',
      'Custom playbook library',
      'Advanced trade analytics',
      'White-label option (coming)',
      'Direct support',
    ],
    cta: 'Go Elite',
    popular: false,
  },
]

export default function PricingPage() {
  const { user } = useUser()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (planId: string) => {
    if (planId === 'free') { router.push('/cockpit'); return }
    if (!user) { router.push('/sign-in'); return }
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, email: user.primaryEmailAddress?.emailAddress }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4fa', fontFamily: font, padding: '60px 20px' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');`}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 60 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 900, color: '#0d1830', marginBottom: 12, letterSpacing: '-1px' }}>
          tr<span style={{ color: '#c020e0' }}>AI</span>de Zone
        </div>
        <div style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, color: '#6620d4', marginBottom: 16 }}>
          Your AI Trading Companion
        </div>
        <div style={{ fontSize: 14, color: '#4a5880', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
          Built for serious intraday SPX options traders. AI accountability, live market intelligence, and pattern recognition — all in one platform.
        </div>
      </div>

      {/* Plans */}
      <div style={{ display: 'flex', gap: 24, maxWidth: 1000, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
        {PLANS.map(plan => (
          <div key={plan.id} style={{
            background: '#fff',
            borderRadius: 16,
            padding: '32px 28px',
            width: 290,
            border: plan.popular ? `2px solid ${plan.color}` : '1px solid rgba(100,140,220,0.15)',
            boxShadow: plan.popular ? `0 8px 32px ${plan.color}18` : '0 2px 12px rgba(100,140,220,0.08)',
            position: 'relative',
            transition: 'transform 0.2s',
          }}>
            {plan.popular && (
              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontFamily: fontDisplay, fontSize: 9, fontWeight: 700, padding: '4px 16px', borderRadius: 20, letterSpacing: '1px' }}>
                MOST POPULAR
              </div>
            )}

            <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: plan.color, letterSpacing: '2px', marginBottom: 12 }}>{plan.name.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 40, fontWeight: 900, color: '#0d1830' }}>{plan.price}</span>
              <span style={{ fontSize: 13, color: '#8090b0' }}>{plan.period}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(100,140,220,0.12)', margin: '20px 0' }} />

            <div style={{ marginBottom: 28 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ color: plan.color, fontWeight: 700, fontSize: 12, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 12, color: '#4a5880', lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSubscribe(plan.id)}
              disabled={loading === plan.id}
              style={{
                width: '100%',
                background: plan.popular ? plan.color : 'transparent',
                border: `2px solid ${plan.color}`,
                borderRadius: 8,
                padding: '12px 0',
                color: plan.popular ? '#fff' : plan.color,
                fontFamily: fontDisplay,
                fontSize: 11,
                fontWeight: 700,
                cursor: loading === plan.id ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
                transition: 'all 0.2s',
                opacity: loading === plan.id ? 0.6 : 1,
              }}
            >
              {loading === plan.id ? 'Loading...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{ textAlign: 'center', marginTop: 48, fontSize: 12, color: '#8090b0', lineHeight: 1.7 }}>
        All plans include a 7-day free trial. Cancel anytime. <br />
        <span style={{ color: '#cc1040' }}>Not financial advice.</span> trAIde Zone is an AI accountability and analysis tool only.
      </div>
    </div>
  )
}