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
  '/api/heygen-token(.*)',
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
