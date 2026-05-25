/**
 * runSignal.ts — clean signal execution
 *
 * Takes a validated SignalContext from buildContext.ts and calls the AI.
 * Does one thing: send context → get structured JSON signal back.
 *
 * No state, no side effects. Pure async function.
 */

import { buildSignalContext, type SignalInput } from './buildContext'
import { trackUsage } from '../agents/usageTracker'

export interface SignalResult {
  signal:               'LONG' | 'SHORT' | 'WAIT' | 'NO TRADE'
  confidence:           number
  marketConditions:     string
  todaysEdge:           string
  accountability:       string
  riskFlag:             string
  // AI's independent view (new)
  aiView?:              string
  systemAlignment?:     'aligned' | 'partial' | 'divergent'
  systemAlignmentNote?: string
  waitReason?:          string
  // Schema v2 additions
  multiTFAlignment?:    string  // all-bullish | all-bearish | mixed | 5min-only
  ivContext?:           string  // cheap | normal | expensive
  sizingNote?:          string  // full | half | quarter
  // Trade levels
  entryZone:            { high: number; low: number }
  stopLevel:            number
  target1:              number
  target2:              number
  moveSize:             number
  buyZones:             Array<{ type: string; high: number; low: number }>
  // Metadata
  _warnings:            string[]
  _timestamp:           string
  currentPrice?:        number | null
}

export async function runSignal(input: SignalInput): Promise<SignalResult | null> {
  // Build and validate context
  const ctx = await buildSignalContext(input)

  if (!ctx.isValid) {
    console.warn('[runSignal] context invalid — not calling AI:', ctx.warnings)
    return null
  }

  if (ctx.warnings.length) {
    console.warn('[runSignal] data warnings (proceeding):', ctx.warnings)
  }

  const startTime = Date.now()

  // Helper — fire a single attempt with given config
  async function fireAttempt(opts: {
    model: string
    additionalSystem?: string
    timeoutMs: number
    attemptLabel: string
  }): Promise<{ text: string; data: any } | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 700,
          system: [{
            type: 'text',
            text: ctx.systemPrompt + (opts.additionalSystem ? '\n\n' + opts.additionalSystem : ''),
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{ role: 'user', content: ctx.liveContext }],
        }),
      })
      clearTimeout(timeout)
      if (!res.ok) {
        console.error(`[runSignal/${opts.attemptLabel}] HTTP ${res.status}`)
        return null
      }
      const data = await res.json()
      if (data?.error || data?._overloaded) {
        console.warn(`[runSignal/${opts.attemptLabel}] AI overloaded/errored:`, data?.error)
        return null
      }
      const text = (data.content || [])
        .map((i: any) => i.text || '')
        .join('')
        .replace(/```json|```/g, '')
        .trim()
      return { text, data }
    } catch (e: any) {
      clearTimeout(timeout)
      if (e?.name === 'AbortError') {
        console.warn(`[runSignal/${opts.attemptLabel}] timed out after ${opts.timeoutMs}ms`)
      } else {
        console.error(`[runSignal/${opts.attemptLabel}] error:`, e)
      }
      return null
    }
  }

  // Helper — parse JSON, return null if malformed
  function tryParse(text: string): any | null {
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      // Sometimes model wraps in extra text — try extracting JSON between first { and last }
      const first = text.indexOf('{')
      const last  = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(text.substring(first, last + 1))
        } catch {
          return null
        }
      }
      return null
    }
  }

  // Helper — log latency for monitoring
  function logLatency(ms: number, model: string, success: boolean, attempt: number) {
    const tag = success ? '✓' : '✗'
    console.log(`[runSignal/latency] ${tag} ${model} attempt=${attempt} ${ms}ms`)
    // Track P95 latencies — anything >10s is a UX concern
    if (success && ms > 10000) {
      console.warn(`[runSignal/latency] SLOW signal: ${ms}ms with ${model}`)
    }
    // Optionally POST to a metrics endpoint if needed in the future
    try {
      if (typeof window !== 'undefined') {
        const key = 'signal_latencies'
        const existing = JSON.parse(localStorage.getItem(key) || '[]')
        existing.push({ ts: Date.now(), ms, model, success, attempt })
        // Keep last 100 only
        localStorage.setItem(key, JSON.stringify(existing.slice(-100)))
      }
    } catch {}
  }

  // ── Attempt 1: Sonnet, normal prompt, 20s timeout ──
  let attempt1 = await fireAttempt({
    model: 'claude-sonnet-4-6',
    timeoutMs: 20000,
    attemptLabel: 'sonnet-primary',
  })
  let parsed = attempt1 ? tryParse(attempt1.text) : null

  if (parsed) {
    trackUsage('claude-sonnet-4-6', 'signal', attempt1!.data)
    const ms = Date.now() - startTime
    logLatency(ms, 'claude-sonnet-4-6', true, 1)
    return {
      ...parsed,
      _warnings:  ctx.warnings,
      _timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    }
  }

  console.warn('[runSignal] attempt 1 failed (parse or fetch), retrying Sonnet with stricter prompt')
  logLatency(Date.now() - startTime, 'claude-sonnet-4-6', false, 1)

  // ── Attempt 2: Sonnet retry with stricter "ONLY JSON" instruction ──
  const retryStart = Date.now()
  const attempt2 = await fireAttempt({
    model: 'claude-sonnet-4-6',
    additionalSystem: 'CRITICAL: Return ONLY the JSON object. No markdown code fences. No commentary before or after. No explanations. Just the raw JSON starting with { and ending with }.',
    timeoutMs: 18000,
    attemptLabel: 'sonnet-retry',
  })
  parsed = attempt2 ? tryParse(attempt2.text) : null

  if (parsed) {
    trackUsage('claude-sonnet-4-6', 'signal', attempt2!.data)
    const ms = Date.now() - startTime
    logLatency(Date.now() - retryStart, 'claude-sonnet-4-6', true, 2)
    return {
      ...parsed,
      _warnings:  [...ctx.warnings, 'Signal succeeded on retry (first attempt had parsing issues)'],
      _timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    }
  }

  console.warn('[runSignal] Sonnet retry also failed, falling back to Haiku for degraded signal')
  logLatency(Date.now() - retryStart, 'claude-sonnet-4-6', false, 2)

  // ── Attempt 3: Haiku fallback — degraded but better than nothing ──
  const fallbackStart = Date.now()
  const attempt3 = await fireAttempt({
    model: 'claude-haiku-4-5-20251001',
    additionalSystem: 'Return ONLY valid JSON, no markdown, no commentary. Start with { and end with }.',
    timeoutMs: 15000,
    attemptLabel: 'haiku-fallback',
  })
  parsed = attempt3 ? tryParse(attempt3.text) : null

  if (parsed) {
    trackUsage('claude-haiku-4-5-20251001', 'signal', attempt3!.data)
    logLatency(Date.now() - fallbackStart, 'claude-haiku-4-5-20251001', true, 3)
    console.warn('[runSignal] Haiku fallback succeeded — signal is degraded quality')
    return {
      ...parsed,
      _warnings:  [...ctx.warnings, '⚠ DEGRADED: Sonnet failed twice, this signal used Haiku fallback. Treat with extra caution.'],
      _timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    }
  }

  console.error('[runSignal] All 3 attempts failed (Sonnet x2 + Haiku fallback)')
  logLatency(Date.now() - startTime, 'all-failed', false, 3)
  return null
}
