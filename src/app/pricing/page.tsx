'use client'
import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

const font = "'JetBrains Mono', monospace"
const fontDisplay = "'Syne', sans-serif"
const green = '#00d4a0'
const C = {
  bg: '#080a0f', surface: '#0d1018', surface2: '#131720',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,160,0.2)',
  text: '#e8eaf0', textDim: '#6b7280', textMuted: '#3d4451',
}

const TIERS = [
  {
    name: 'Starter',
    price: 19,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || '',
    voice: '60 min/mo',
    voiceMin: 60,
    overage: '$0.10/min',
    aiCalls: '50 AI calls/mo',
    color: '#6b7280',
    features: [
      { text: '50 AI analysis calls/month', yes: true },
      { text: '60 voice minutes/month', yes: true },
      { text: '$0.10/min overage', yes: true },
      { text: 'Morning plan + checklist', yes: true },
      { text: 'Live SPX data + signals', yes: true },
      { text: 'Options flow (0DTE skew)', yes: false },
      { text: 'Trade pattern analysis', yes: false },
      { text: 'Unlimited AI calls', yes: false },
    ],
  },
  {
    name: 'Pro',
    price: 39,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    voice: '180 min/mo',
    voiceMin: 180,
    overage: '$0.08/min',
    aiCalls: 'Unlimited AI calls',
    color: green,
    popular: true,
    features: [
      { text: 'Unlimited AI analysis calls', yes: true },
      { text: '180 voice minutes/month', yes: true },
      { text: '$0.08/min overage', yes: true },
      { text: 'Morning plan + checklist', yes: true },
      { text: 'Live SPX data + signals', yes: true },
      { text: 'Options flow (0DTE skew)', yes: true },
      { text: 'Trade pattern analysis', yes: true },
      { text: 'Unlimited AI calls', yes: true },
    ],
  },
  {
    name: 'Elite',
    price: 79,
    priceId: process.env.NEXT_PUBLIC_STRIPE_ELITE_PRICE_ID || '',
    voice: '480 min/mo',
    voiceMin: 480,
    overage: '$0.06/min',
    aiCalls: 'Unlimited AI calls',
    color: '#a78bfa',
    features: [
      { text: 'Unlimited AI analysis calls', yes: true },
      { text: '480 voice minutes/month', yes: true },
      { text: '$0.06/min overage', yes: true },
      { text: 'Morning plan + checklist', yes: true },
      { text: 'Live SPX data + signals', yes: true },
      { text: 'Options flow (0DTE skew)', yes: true },
      { text: 'Trade pattern analysis', yes: true },
      { text: 'Priority support', yes: true },
    ],
  },
  {
    name: 'Elite+',
    price: 129,
    priceId: process.env.NEXT_PUBLIC_STRIPE_ELITE_PLUS_PRICE_ID || '',
    voice: 'Unlimited',
    voiceMin: 99999,
    overage: 'No overage',
    aiCalls: 'Unlimited AI calls',
    color: '#f59e0b',
    features: [
      { text: 'Unlimited AI analysis calls', yes: true },
      { text: 'Unlimited voice — all session', yes: true },
      { text: 'No overage fees ever', yes: true },
      { text: 'Morning plan + checklist', yes: true },
      { text: 'Live SPX data + signals', yes: true },
      { text: 'Options flow (0DTE skew)', yes: true },
      { text: 'Trade pattern analysis', yes: true },
      { text: 'Priority support + early access', yes: true },
    ],
  },
]

const COMPETITORS = [
  { name: 'trAIde Zone Pro', price: '$39/mo', voice: '✓ Voice companion', ai: '✓ SPX AI signals', highlight: true },
  { name: 'TrendSpider', price: '$107/mo', voice: '✗ No voice', ai: '✓ Chart AI' },
  { name: 'Trade Ideas', price: '$127/mo', voice: '✗ No voice', ai: '✓ Stock scanner AI' },
  { name: 'ChatGPT Plus', price: '$20/mo', voice: '✗ Not trading-specific', ai: '✗ Generic AI' },
]

export default function PricingPage() {
  const { user } = useUser()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoError, setPromoError] = useState('')

  const handleSubscribe = async (tier: typeof TIERS[0]) => {
    if (!user) { router.push('/sign-up'); return }
    setLoading(tier.name)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: tier.name.toLowerCase().replace('+', 'plus'),
          email: user.primaryEmailAddress?.emailAddress,
          promoCode: promoCode.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (e) { console.error(e) }
    setLoading(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: font, color: C.text, padding: '80px 24px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 64 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: green, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Pricing</div>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 'clamp(36px,5vw,64px)', fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.1, marginBottom: 16 }}>
          Straightforward pricing.<br /><span style={{ color: green }}>No surprises.</span>
        </h1>
        <p style={{ fontSize: 15, color: C.textDim, maxWidth: 480, margin: '0 auto 8px', lineHeight: 1.7 }}>
          Voice minutes reset monthly. Go over? You pay a small per-minute rate — never cut off mid-trade.
        </p>
        <p style={{ fontSize: 12, color: C.textMuted }}>All plans include a 7-day free trial. Cancel anytime.</p>
      </div>

      {/* Pricing cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto 80px' }}>
        {TIERS.map(tier => (
          <div key={tier.name} style={{
            background: tier.popular ? `linear-gradient(135deg, rgba(0,212,160,0.05), ${C.surface})` : C.surface,
            border: `1px solid ${tier.popular ? C.border2 : C.border}`,
            borderRadius: 16, padding: '32px 24px', position: 'relative',
            transition: 'transform 0.2s, border-color 0.2s',
          }}>
            {tier.popular && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: green, color: '#080a0f', fontSize: 10, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', padding: '4px 14px', borderRadius: 99, whiteSpace: 'nowrap', fontFamily: fontDisplay }}>
                Most Popular
              </div>
            )}
            <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: tier.color, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 12 }}>{tier.name}</div>
            <div style={{ fontFamily: fontDisplay, fontSize: 48, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, marginBottom: 4 }}>${tier.price}</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>per month</div>

            {/* Voice badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: `rgba(0,212,160,0.08)`, border: `1px solid rgba(0,212,160,0.2)`, borderRadius: 6, marginBottom: 24, marginTop: 8 }}>
              <span style={{ fontSize: 14 }}>🎙️</span>
              <span style={{ fontSize: 11, color: green, fontWeight: 700 }}>{tier.voice}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>· overage {tier.overage}</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tier.features.map((f, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: f.yes ? C.text : C.textMuted }}>
                  <span style={{ color: f.yes ? green : C.textMuted, fontWeight: 700, flexShrink: 0 }}>{f.yes ? '✓' : '✗'}</span>
                  {f.text}
                </li>
              ))}
            </ul>

            <button onClick={() => handleSubscribe(tier)} disabled={loading === tier.name}
              style={{
                width: '100%', fontFamily: fontDisplay, fontSize: 13, fontWeight: 800,
                padding: '12px', borderRadius: 8, cursor: 'pointer', border: 'none',
                background: tier.popular ? green : 'transparent',
                color: tier.popular ? '#080a0f' : C.text,
                outline: tier.popular ? 'none' : `1px solid ${C.border2}`,
                opacity: loading === tier.name ? 0.7 : 1,
                transition: 'all 0.2s',
              }}>
              {loading === tier.name ? 'Loading...' : user ? `Start ${tier.name}` : 'Get Started'}
            </button>
          </div>
        ))}
      </div>

      {/* Competitor comparison */}
      <div style={{ maxWidth: 800, margin: '0 auto 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 11, fontWeight: 700, color: green, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>How we compare</div>
          <h2 style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 800, letterSpacing: '-1px' }}>Half the price.<br />Twice the intelligence.</h2>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 24px', borderBottom: `1px solid ${C.border}` }}>
            {['Platform', 'Price', 'Voice', 'AI'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
            ))}
          </div>
          {COMPETITORS.map((c, i) => (
            <div key={c.name} style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
              padding: '16px 24px',
              background: c.highlight ? 'rgba(0,212,160,0.04)' : 'transparent',
              borderBottom: i < COMPETITORS.length - 1 ? `1px solid ${C.border}` : 'none',
              borderLeft: c.highlight ? `3px solid ${green}` : '3px solid transparent',
            }}>
              <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: c.highlight ? 800 : 600, color: c.highlight ? green : C.text }}>{c.name}</div>
              <div style={{ fontSize: 13, color: c.highlight ? green : C.textDim, fontWeight: c.highlight ? 700 : 400 }}>{c.price}</div>
              <div style={{ fontSize: 12, color: c.voice.startsWith('✓') ? green : C.textMuted }}>{c.voice}</div>
              <div style={{ fontSize: 12, color: c.ai.startsWith('✓') ? green : C.textMuted }}>{c.ai}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Overage explainer */}
      <div style={{ maxWidth: 600, margin: '0 auto 80px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 800, marginBottom: 12 }}>How voice overage works</div>
        <p style={{ fontSize: 13, color: C.textDim, lineHeight: 1.8, marginBottom: 16 }}>
          You'll never get cut off mid-trade. When you approach your limit, trAIde Zone shows a warning banner — at 50% used and again at 90%. After your limit, you continue at your tier's overage rate, billed at end of month.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
          {[
            { label: 'Starter overage', val: '$0.10/min' },
            { label: 'Pro overage', val: '$0.08/min' },
            { label: 'Elite overage', val: '$0.06/min' },
            { label: 'Elite+ overage', val: 'None — unlimited' },
          ].map(o => (
            <div key={o.label} style={{ padding: '8px 14px', background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>{o.label}</div>
              <div style={{ fontSize: 13, color: green, fontWeight: 700 }}>{o.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 800, letterSpacing: '-1px', marginBottom: 12 }}>Stop trading alone.</h2>
        <p style={{ color: C.textDim, marginBottom: 32, fontSize: 14 }}>7-day free trial. No credit card required to start.</p>
        <button onClick={() => router.push(user ? '/cockpit' : '/sign-up')}
          style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 800, padding: '16px 40px', background: green, color: '#080a0f', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {user ? 'Go to Cockpit →' : 'Start Free Trial →'}
        </button>
      </div>
    </div>
  )
}