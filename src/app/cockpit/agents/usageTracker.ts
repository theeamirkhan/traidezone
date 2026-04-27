/**
 * usageTracker.ts — Client-side AI usage logger
 *
 * Intercepts every AI call response and logs token counts + estimated cost.
 * Stored in localStorage (daily rolling log, last 30 days).
 * Sent to /api/agents/usage-report for the daily report.
 *
 * Call trackUsage() after every successful AI response.
 */

export interface UsageEntry {
  ts:           number    // unix ms
  date:         string    // YYYY-MM-DD
  model:        string
  callType:     'signal' | 'companion' | 'greeting' | 'daily_ai' | 'memory' | 'other'
  inputTokens:  number
  outputTokens: number
  cacheRead:    number
  cacheWrite:   number
  searches:     number
  costUsd:      number
}

// Pricing (per million tokens)
const RATES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1.00,  output: 5.00,  cacheRead: 0.10,  cacheWrite: 1.25 },
}
const SEARCH_COST = 0.010

function estimateCost(model: string, inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0, searches = 0): number {
  const r = RATES[model] || RATES['claude-sonnet-4-20250514']
  return (inputTokens  / 1e6) * r.input
       + (outputTokens / 1e6) * r.output
       + (cacheRead    / 1e6) * r.cacheRead
       + (cacheWrite   / 1e6) * r.cacheWrite
       + searches * SEARCH_COST
}

const STORAGE_KEY = 'tz-usage-log'
const MAX_ENTRIES = 500  // ~25 days at 20 calls/day

export function trackUsage(
  model: string,
  callType: UsageEntry['callType'],
  apiResponse: any,
  searches = 0
): UsageEntry | null {
  try {
    // Extract token counts from Anthropic response
    const usage = apiResponse?.usage
    if (!usage) return null

    const inputTokens  = usage.input_tokens          || 0
    const outputTokens = usage.output_tokens         || 0
    const cacheRead    = usage.cache_read_input_tokens    || 0
    const cacheWrite   = usage.cache_creation_input_tokens || 0

    const entry: UsageEntry = {
      ts:           Date.now(),
      date:         new Date().toISOString().split('T')[0],
      model,
      callType,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite,
      searches,
      costUsd:      estimateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite, searches),
    }

    // Append to localStorage log
    const existing: UsageEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const updated = [...existing, entry].slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    return entry
  } catch { return null }
}

export function getTodayUsage(): UsageEntry[] {
  try {
    const today = new Date().toISOString().split('T')[0]
    const all: UsageEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return all.filter(e => e.date === today)
  } catch { return [] }
}

export function getUsageSummary(days = 7) {
  try {
    const all: UsageEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const cutoff = Date.now() - days * 86400000

    const recent = all.filter(e => e.ts > cutoff)
    const today  = new Date().toISOString().split('T')[0]
    const todayEntries = recent.filter(e => e.date === today)

    // Group by date
    const byDate: Record<string, { cost: number; requests: number; tokens: number }> = {}
    recent.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = { cost: 0, requests: 0, tokens: 0 }
      byDate[e.date].cost     += e.costUsd
      byDate[e.date].requests += 1
      byDate[e.date].tokens   += e.inputTokens + e.outputTokens
    })

    // Group by model
    const byModel: Record<string, { cost: number; requests: number }> = {}
    recent.forEach(e => {
      const label = e.model.includes('haiku') ? 'Haiku' : 'Sonnet'
      if (!byModel[label]) byModel[label] = { cost: 0, requests: 0 }
      byModel[label].cost     += e.costUsd
      byModel[label].requests += 1
    })

    // Group by call type
    const byType: Record<string, { cost: number; requests: number }> = {}
    recent.forEach(e => {
      if (!byType[e.callType]) byType[e.callType] = { cost: 0, requests: 0 }
      byType[e.callType].cost     += e.costUsd
      byType[e.callType].requests += 1
    })

    const totalCost   = recent.reduce((s, e) => s + e.costUsd, 0)
    const todayCost   = todayEntries.reduce((s, e) => s + e.costUsd, 0)
    const cacheReads  = recent.reduce((s, e) => s + e.cacheRead, 0)
    const allInputs   = recent.reduce((s, e) => s + e.inputTokens + e.cacheRead, 0)
    const cacheHitRate = allInputs > 0 ? Math.round((cacheReads / allInputs) * 100) : 0

    // Cache savings
    const costWithoutCache = recent.reduce((s, e) => {
      const r = RATES[e.model] || RATES['claude-sonnet-4-20250514']
      return s + ((e.inputTokens + e.cacheRead) / 1e6) * r.input
    }, 0)
    const cacheSavings = Math.max(0, costWithoutCache - recent.reduce((s, e) => {
      const r = RATES[e.model] || RATES['claude-sonnet-4-20250514']
      return s + (e.inputTokens / 1e6) * r.input + (e.cacheRead / 1e6) * r.cacheRead
    }, 0))

    return {
      today: {
        cost:     parseFloat(todayCost.toFixed(4)),
        requests: todayEntries.length,
      },
      period: {
        days,
        totalCost:        parseFloat(totalCost.toFixed(4)),
        totalRequests:    recent.length,
        avgDailyCost:     parseFloat((totalCost / days).toFixed(4)),
        projectedMonthly: parseFloat(((totalCost / days) * 22).toFixed(2)),
        cacheHitRate,
        cacheSavings:     parseFloat(cacheSavings.toFixed(4)),
      },
      byDate,
      byModel,
      byType,
    }
  } catch { return null }
}

export function clearUsageLog() {
  localStorage.removeItem(STORAGE_KEY)
}
