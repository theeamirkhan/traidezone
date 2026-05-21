import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing(.*)',
  '/api/polygon(.*)',              // Polygon proxy — server-side key
  '/api/webhooks(.*)',             // Stripe webhooks — signature verified
  '/api/agents/backtest(.*)',      // Agent routes use cron secret auth
  '/api/agents/update-edge(.*)',
  '/api/agents/score-alerts(.*)',
  '/api/agents/health-check(.*)',
  '/api/agents/edge-discovery(.*)',
  '/api/agents/learn-from-outcomes(.*)',
  '/api/agents/analyze-chat(.*)',
  '/api/agents/seed-profile(.*)',
  '/api/feedback(.*)',
  '/api/gap-outcomes(.*)',
  '/api/morning-brief(.*)',
  '/api/insights',
  '/api/agents/stream-weights',
  '/api/email/(.*)',
  '/api/gap-outcomes/record(.*)',
  '/api/gap-outcomes/score(.*)',
  '/api/gap-outcomes/eod(.*)',
  '/api/gap-outcomes/backfill(.*)',
  '/api/chat-sessions(.*)',
  '/api/heygen-token(.*)',
  '/api/breadth(.*)',
  '/api/gex(.*)',
  '/api/reference-price(.*)',      // Yahoo Finance proxy
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
