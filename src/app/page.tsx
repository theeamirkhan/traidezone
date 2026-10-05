/**
 * Landing page — private-mode placeholder (Oct 4).
 * The marketing site (pricing tiers, early-access capture) is taken down
 * while the platform runs on individual-tier data licenses. Restore the
 * commercial page from git history when moving to business licensing.
 */

import Link from 'next/link'

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      background: '#070b14', color: '#e8f0ff', padding: 24, textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, margin: 0 }}>
        tr<span style={{ color: '#00e5ff' }}>AI</span>de Zone
      </h1>
      <p style={{ maxWidth: 440, lineHeight: 1.7, color: '#8aa0c8', fontSize: 15, margin: 0 }}>
        A private SPX research project. This is a personal, non-commercial
        platform — there are no subscriptions, signups, or services offered.
      </p>
      <Link href="/sign-in" style={{
        marginTop: 8, padding: '10px 26px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.35)',
        color: '#00e5ff', textDecoration: 'none',
      }}>
        Sign in
      </Link>
      <p style={{ fontSize: 12, color: '#4a5a78', marginTop: 16 }}>
        © {new Date().getFullYear()} trAIde Zone
      </p>
    </main>
  )
}
