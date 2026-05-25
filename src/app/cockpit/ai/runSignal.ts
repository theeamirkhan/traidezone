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

  // Call AI with 20s timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: [{
          type: 'text',
          text: ctx.systemPrompt,
          cache_control: { type: 'ephemeral' }  // cached = 90% cheaper on repeats
        }],
        messages: [{ role: 'user', content: ctx.liveContext }],
      }),
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.error('[runSignal] HTTP error:', res.status)
      return null
    }

    const data = await res.json()

    if (data?.error || data?._overloaded) {
      console.warn('[runSignal] AI overloaded or errored:', data?.error)
      return null
    }

    const text = (data.content || [])
      .map((i: any) => i.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim()

    if (!text) return null

    const parsed = JSON.parse(text)

    // Track usage for daily cost report
    trackUsage('claude-sonnet-4-6', 'signal', data)

    return {
      ...parsed,
      _warnings:  ctx.warnings,
      _timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    }

  } catch (e: any) {
    clearTimeout(timeout)
    if (e?.name === 'AbortError') {
      console.warn('[runSignal] timed out after 20s')
    } else {
      console.error('[runSignal] error:', e)
    }
    return null
  }
}
