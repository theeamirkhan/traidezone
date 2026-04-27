/**
 * tradeAlertLogger.ts — Trade Alert Logger (Supabase-backed)
 *
 * Persistence: Supabase trade_alerts table (survives browser closes)
 * Cache: localStorage for fast reads without API round-trips
 * Scoring: server-side cron at /api/agents/score-alerts (every 30min market hours)
 *
 * The client no longer needs to schedule outcome checks — the agent handles it.
 */

export type AlertOutcome =
  | 'PENDING'
  | 'HIT_T1'
  | 'HIT_T2'
  | 'STOPPED_OUT'
  | 'PARTIAL'
  | 'EXPIRED'

export interface TradeAlert {
  id:                    string
  user_id?:              string
  signal:                'LONG' | 'SHORT'
  entry_low:             number
  entry_high:            number
  entry_mid:             number
  stop_level:            number
  target1:               number
  target2:               number
  price_at_signal:       number
  vwap_at_signal:        number | null
  ema200_at_signal:      number | null
  vix_at_signal:         number | null
  confidence:            number
  move_size:             number
  proximity_level?:      string
  proximity_breakout_pct?: number
  proximity_factors?:    any[]
  outcome:               AlertOutcome
  outcome_at?:           string
  pts_to_t1?:            number
  outcome_note?:         string
  logged_at:             string
  // Display helpers
  timeET?:               string
}

const CACHE_KEY    = 'tz-trade-alerts-v2'
const CACHE_TTL_MS = 5 * 60 * 1000  // refresh cache every 5 min

// ── Cache helpers ─────────────────────────────────────────────────────────────

function getCached(): { alerts: TradeAlert[]; at: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setCache(alerts: TradeAlert[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ alerts, at: Date.now() }))
  } catch {}
}

function invalidateCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

// ── Log a new alert to Supabase ───────────────────────────────────────────────

export async function logTradeAlert(params: {
  signal:        'LONG' | 'SHORT'
  entryZone:     { low: number; high: number }
  stopLevel:     number
  target1:       number
  target2:       number
  currentPrice:  number
  vwap:          number | null
  ema200:        number | null
  vix:           number | null
  confidence:    number
  moveSize:      number
  proximityLevel?:      string
  proximityBreakoutPct?: number
  proximityFactors?:    any[]
}): Promise<TradeAlert | null> {
  try {
    const res = await fetch('/api/trade-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal:               params.signal,
        entryZone:            params.entryZone,
        stopLevel:            params.stopLevel,
        target1:              params.target1,
        target2:              params.target2,
        currentPrice:         params.currentPrice,
        vwap:                 params.vwap,
        ema200:               params.ema200,
        vix:                  params.vix,
        confidence:           params.confidence,
        moveSize:             params.moveSize,
        proximityLevel:       params.proximityLevel,
        proximityBreakoutPct: params.proximityBreakoutPct,
        proximityFactors:     params.proximityFactors,
      }),
    })

    const data = await res.json()

    if (data.needsMigration) {
      console.warn('[TradeAlertLogger] Table not ready — run /api/trade-alerts/migrate')
      return null
    }

    if (!res.ok) {
      console.error('[TradeAlertLogger] Log failed:', data.error)
      return null
    }

    // Invalidate cache so next read fetches fresh
    invalidateCache()

    const alert: TradeAlert = {
      id:              data.id,
      signal:          params.signal,
      entry_low:       params.entryZone.low,
      entry_high:      params.entryZone.high,
      entry_mid:       (params.entryZone.low + params.entryZone.high) / 2,
      stop_level:      params.stopLevel,
      target1:         params.target1,
      target2:         params.target2,
      price_at_signal: params.currentPrice,
      vwap_at_signal:  params.vwap,
      ema200_at_signal: params.ema200,
      vix_at_signal:   params.vix,
      confidence:      params.confidence,
      move_size:       params.moveSize,
      proximity_level:       params.proximityLevel,
      proximity_breakout_pct: params.proximityBreakoutPct,
      proximity_factors:     params.proximityFactors,
      outcome:         'PENDING',
      logged_at:       new Date().toISOString(),
      timeET:          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    }

    console.log(`[TradeAlertLogger] Logged ${alert.signal} → Supabase id=${data.id}`)
    return alert

  } catch (e) {
    console.error('[TradeAlertLogger] Network error:', e)
    return null
  }
}

// ── Load alerts (cache-first, then Supabase) ──────────────────────────────────

export async function loadAlerts(days = 30, forceRefresh = false): Promise<TradeAlert[]> {
  // Serve from cache if fresh
  if (!forceRefresh) {
    const cached = getCached()
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.alerts
    }
  }

  try {
    const res = await fetch(`/api/trade-alerts?days=${days}`)
    const data = await res.json()

    if (data.needsMigration) {
      console.warn('[TradeAlertLogger] Table not ready')
      return []
    }

    const alerts: TradeAlert[] = (data.alerts || []).map((a: any) => ({
      ...a,
      timeET: new Date(a.logged_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York'
      }),
    }))

    setCache(alerts)
    return alerts
  } catch (e) {
    console.error('[TradeAlertLogger] Load failed:', e)
    // Fall back to cache even if stale
    return getCached()?.alerts || []
  }
}

// ── Accuracy analytics (computed client-side from loaded alerts) ──────────────

export interface AlertAccuracy {
  total:        number
  pending:      number
  winRate:      number
  t1Rate:       number
  t2Rate:       number
  stopRate:     number
  avgPtsWon:    number
  avgPtsLost:   number
  profitFactor: number
  byConfidence: Record<string, { wins: number; total: number; rate: number }>
  byHour:       Record<string, { wins: number; total: number; rate: number }>
  byVix:        Record<string, { wins: number; total: number; rate: number }>
  recentForm:   string
}

export function computeAccuracy(alerts: TradeAlert[]): AlertAccuracy {
  const scored  = alerts.filter(a => a.outcome !== 'PENDING')
  const wins    = scored.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
  const t2s     = scored.filter(a => a.outcome === 'HIT_T2')
  const stops   = scored.filter(a => a.outcome === 'STOPPED_OUT')

  const avgPtsWon  = wins.length  ? wins.reduce((s,a)  => s + Math.abs(a.pts_to_t1 || 0), 0) / wins.length  : 0
  const avgPtsLost = stops.length ? stops.reduce((s,a) => s + Math.abs(a.pts_to_t1 || 0), 0) / stops.length : 0

  const byConfidence: Record<string, { wins: number; total: number; rate: number }> = {}
  scored.forEach(a => {
    const b = a.confidence >= 80 ? '80-100' : a.confidence >= 65 ? '65-79' : a.confidence >= 50 ? '50-64' : '<50'
    if (!byConfidence[b]) byConfidence[b] = { wins: 0, total: 0, rate: 0 }
    byConfidence[b].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byConfidence[b].wins++
  })
  Object.values(byConfidence).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  const byHour: Record<string, { wins: number; total: number; rate: number }> = {}
  scored.forEach(a => {
    const h = new Date(a.logged_at).toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' })
    if (!byHour[h]) byHour[h] = { wins: 0, total: 0, rate: 0 }
    byHour[h].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byHour[h].wins++
  })
  Object.values(byHour).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  const byVix: Record<string, { wins: number; total: number; rate: number }> = {
    'Low (<14)': { wins: 0, total: 0, rate: 0 },
    'Normal (14-20)': { wins: 0, total: 0, rate: 0 },
    'Elevated (20-28)': { wins: 0, total: 0, rate: 0 },
    'High (>28)': { wins: 0, total: 0, rate: 0 },
  }
  scored.forEach(a => {
    const v = a.vix_at_signal || 18
    const b = v < 14 ? 'Low (<14)' : v < 20 ? 'Normal (14-20)' : v < 28 ? 'Elevated (20-28)' : 'High (>28)'
    byVix[b].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byVix[b].wins++
  })
  Object.values(byVix).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  const last10 = scored.slice(-10)
  const last10W = last10.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2').length
  const recentForm = last10W >= 8 ? 'Hot 🔥' : last10W >= 6 ? 'Solid' : last10W >= 4 ? 'Struggling' : 'Cold ❄️'

  return {
    total:        scored.length,
    pending:      alerts.filter(a => a.outcome === 'PENDING').length,
    winRate:      scored.length > 0 ? Math.round(wins.length  / scored.length * 100) : 0,
    t1Rate:       scored.length > 0 ? Math.round(wins.length  / scored.length * 100) : 0,
    t2Rate:       scored.length > 0 ? Math.round(t2s.length   / scored.length * 100) : 0,
    stopRate:     scored.length > 0 ? Math.round(stops.length / scored.length * 100) : 0,
    avgPtsWon:    parseFloat(avgPtsWon.toFixed(1)),
    avgPtsLost:   parseFloat(avgPtsLost.toFixed(1)),
    profitFactor: avgPtsLost > 0 ? parseFloat((avgPtsWon / avgPtsLost).toFixed(2)) : wins.length > 0 ? 99 : 0,
    byConfidence,
    byHour,
    byVix,
    recentForm,
  }
}

export function getModelSuggestions(accuracy: AlertAccuracy): string[] {
  const suggestions: string[] = []
  if (accuracy.total < 5) return ['Need at least 5 scored alerts for suggestions — keep trading']

  const highConf = accuracy.byConfidence['80-100']
  if (highConf?.total >= 3 && highConf.rate < 50)
    suggestions.push(`High-confidence signals (80%+) only winning ${highConf.rate}% — model is overconfident`)

  const elevated = accuracy.byVix['Elevated (20-28)']
  if (elevated?.total >= 3 && elevated.rate < 35)
    suggestions.push(`Win rate drops to ${elevated.rate}% when VIX 20-28 — reduce size in elevated VIX`)

  if (accuracy.profitFactor < 1.0 && accuracy.total >= 8)
    suggestions.push(`Profit factor ${accuracy.profitFactor} — losers bigger than winners, widen targets or tighten stops`)
  else if (accuracy.profitFactor > 2.5)
    suggestions.push(`Profit factor ${accuracy.profitFactor} — strong edge confirmed`)

  if (accuracy.recentForm === 'Cold ❄️')
    suggestions.push('Last 10 signals: cold streak — reduce size until form returns')
  else if (accuracy.recentForm === 'Hot 🔥')
    suggestions.push('Last 10 signals: hot — trade with full conviction')

  return suggestions.length ? suggestions : ['Performance looks solid — no adjustments needed']
}

// Keep for backward compat — these are no-ops now (server handles it)
export function scheduleOutcomeChecks(_id: string, _fn: any): void {}
