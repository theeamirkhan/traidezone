/**
 * tradeAlertLogger.ts — Trade Alert Outcome Tracker
 *
 * Logs every Trade Zone alert and tracks whether it was right.
 * Stored in localStorage (30-day rolling window, max 200 alerts).
 *
 * Lifecycle:
 *  1. logAlert()     — called when Get Signal fires a LONG/SHORT
 *  2. checkOutcome() — called 30/60/120min later via setTimeout
 *  3. scoreAlert()   — marks result: HIT_T1, HIT_T2, STOPPED_OUT, EXPIRED
 *  4. getAccuracy()  — returns win rate + factor performance for model tuning
 */

export type AlertOutcome =
  | 'PENDING'
  | 'HIT_T1'       // price reached target1 (min 10pt scalp) ✅
  | 'HIT_T2'       // price reached target2 (min 25pt swing) ✅✅
  | 'STOPPED_OUT'  // price hit stop level ❌
  | 'EXPIRED'      // 2 hours passed, neither hit
  | 'PARTIAL'      // went toward target but reversed before T1

export interface TradeAlert {
  id:            string
  timestamp:     string       // ISO
  timeET:        string       // HH:MM ET for display
  signal:        'LONG' | 'SHORT'
  entryMid:      number       // midpoint of entry zone
  entryLow:      number
  entryHigh:     number
  stopLevel:     number
  target1:       number
  target2:       number
  priceAtSignal: number
  vwap:          number | null
  ema200:        number | null
  vix:           number | null
  confidence:    number
  moveSize:      number

  // Proximity context (if level alert was also active)
  proximityLevel?:      string
  proximityBreakoutPct?: number
  proximityFactors?:    any[]

  // Outcome
  outcome:          AlertOutcome
  outcomeAt?:       string       // ISO when outcome was determined
  maxFavorable?:    number       // max pts price moved in correct direction
  maxAdverse?:      number       // max pts price moved against
  ptsToT1?:         number       // pts achieved (could be negative)
  outcomeNote?:     string
}

const STORAGE_KEY = 'tz-trade-alerts'
const MAX_ALERTS  = 200
const CHECK_INTERVALS_MS = [30 * 60000, 60 * 60000, 120 * 60000]  // 30m, 1h, 2h

// ── Storage helpers ───────────────────────────────────────────────────────────

export function loadAlerts(): TradeAlert[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveAlerts(alerts: TradeAlert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(-MAX_ALERTS)))
  } catch {}
}

// ── Log a new alert ───────────────────────────────────────────────────────────

export function logTradeAlert(params: {
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
}): TradeAlert {
  const now    = new Date()
  const timeET = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  const entryMid = (params.entryZone.low + params.entryZone.high) / 2

  const alert: TradeAlert = {
    id:            `tz-${now.getTime()}`,
    timestamp:     now.toISOString(),
    timeET,
    signal:        params.signal,
    entryMid,
    entryLow:      params.entryZone.low,
    entryHigh:     params.entryZone.high,
    stopLevel:     params.stopLevel,
    target1:       params.target1,
    target2:       params.target2,
    priceAtSignal: params.currentPrice,
    vwap:          params.vwap,
    ema200:        params.ema200,
    vix:           params.vix,
    confidence:    params.confidence,
    moveSize:      params.moveSize,
    proximityLevel:       params.proximityLevel,
    proximityBreakoutPct: params.proximityBreakoutPct,
    proximityFactors:     params.proximityFactors,
    outcome: 'PENDING',
  }

  const alerts = loadAlerts()
  alerts.push(alert)
  saveAlerts(alerts)

  console.log(`[TradeAlertLogger] Logged ${alert.signal} alert ${alert.id} at ${timeET}`)
  return alert
}

// ── Score an alert's outcome ──────────────────────────────────────────────────

export function scoreAlert(alertId: string, currentPrice: number): TradeAlert | null {
  const alerts = loadAlerts()
  const idx = alerts.findIndex(a => a.id === alertId)
  if (idx < 0) return null

  const alert = alerts[idx]
  if (alert.outcome !== 'PENDING') return alert

  const isLong   = alert.signal === 'LONG'
  const priceMov = isLong
    ? currentPrice - alert.entryMid
    : alert.entryMid - currentPrice

  const hitT2   = isLong ? currentPrice >= alert.target2 : currentPrice <= alert.target2
  const hitT1   = isLong ? currentPrice >= alert.target1 : currentPrice <= alert.target1
  const stopped = isLong ? currentPrice <= alert.stopLevel : currentPrice >= alert.stopLevel

  const ageMs = Date.now() - new Date(alert.timestamp).getTime()
  const expired = ageMs > 120 * 60000

  let outcome: AlertOutcome = 'PENDING'
  let outcomeNote = ''

  if (hitT2) {
    outcome = 'HIT_T2'
    outcomeNote = `Price reached T2 (+${Math.abs(currentPrice - alert.entryMid).toFixed(1)}pts)`
  } else if (hitT1) {
    outcome = 'HIT_T1'
    outcomeNote = `Price reached T1 (+${Math.abs(currentPrice - alert.entryMid).toFixed(1)}pts)`
  } else if (stopped) {
    outcome = 'STOPPED_OUT'
    outcomeNote = `Hit stop (${Math.abs(currentPrice - alert.stopLevel).toFixed(1)}pts through)`
  } else if (expired) {
    // Partial: went in right direction but not far enough
    if (priceMov > 5) {
      outcome = 'PARTIAL'
      outcomeNote = `Expired with ${priceMov.toFixed(1)}pt favorable move (T1 not reached)`
    } else if (priceMov < -3) {
      outcome = 'STOPPED_OUT'
      outcomeNote = `Expired with ${Math.abs(priceMov).toFixed(1)}pt adverse move`
    } else {
      outcome = 'EXPIRED'
      outcomeNote = `Expired flat (${priceMov.toFixed(1)}pts)`
    }
  }

  if (outcome !== 'PENDING') {
    alerts[idx] = {
      ...alert,
      outcome,
      outcomeAt:   new Date().toISOString(),
      ptsToT1:     parseFloat(priceMov.toFixed(1)),
      outcomeNote,
    }
    saveAlerts(alerts)
    console.log(`[TradeAlertLogger] Scored ${alertId}: ${outcome} — ${outcomeNote}`)
  }

  return alerts[idx]
}

// ── Schedule outcome checks ───────────────────────────────────────────────────

export function scheduleOutcomeChecks(
  alertId: string,
  fetchCurrentPrice: () => Promise<number | null>
): void {
  CHECK_INTERVALS_MS.forEach(delay => {
    setTimeout(async () => {
      const price = await fetchCurrentPrice()
      if (!price) return
      const result = scoreAlert(alertId, price)
      if (result && result.outcome !== 'PENDING') {
        console.log(`[TradeAlertLogger] ${alertId} → ${result.outcome} at ${result.outcomeNote}`)
      }
    }, delay)
  })
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface AlertAccuracy {
  total:       number
  pending:     number
  winRate:     number    // % of T1 + T2 hits
  t1Rate:      number
  t2Rate:      number
  stopRate:    number
  avgPtsWon:   number
  avgPtsLost:  number
  profitFactor: number
  byConfidence: Record<string, { wins: number; total: number; rate: number }>
  byHour:       Record<string, { wins: number; total: number; rate: number }>
  byVix:        Record<string, { wins: number; total: number; rate: number }>
  factorPerformance: Record<string, { breakoutWins: number; bounceWins: number; total: number }>
  recentForm:   string   // 'Hot 🔥' | 'Solid' | 'Struggling' | 'Cold ❄️'
  last10:       TradeAlert[]
}

export function getAlertAccuracy(days = 30): AlertAccuracy {
  const alerts = loadAlerts()
  const cutoff = Date.now() - days * 86400000
  const recent = alerts.filter(a => new Date(a.timestamp).getTime() > cutoff)
  const scored = recent.filter(a => a.outcome !== 'PENDING')

  const wins  = scored.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
  const t2s   = scored.filter(a => a.outcome === 'HIT_T2')
  const stops = scored.filter(a => a.outcome === 'STOPPED_OUT')

  const avgPtsWon  = wins.length
    ? wins.reduce((s, a)  => s + Math.abs(a.ptsToT1 || 0), 0) / wins.length  : 0
  const avgPtsLost = stops.length
    ? stops.reduce((s, a) => s + Math.abs(a.ptsToT1 || 0), 0) / stops.length : 0
  const profitFactor = avgPtsLost > 0 ? avgPtsWon / avgPtsLost : wins.length > 0 ? 99 : 0

  // By confidence bucket
  const byConfidence: Record<string, { wins: number; total: number; rate: number }> = {}
  scored.forEach(a => {
    const bucket = a.confidence >= 80 ? '80-100' : a.confidence >= 65 ? '65-79' : a.confidence >= 50 ? '50-64' : '<50'
    if (!byConfidence[bucket]) byConfidence[bucket] = { wins: 0, total: 0, rate: 0 }
    byConfidence[bucket].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byConfidence[bucket].wins++
  })
  Object.values(byConfidence).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  // By hour of day
  const byHour: Record<string, { wins: number; total: number; rate: number }> = {}
  scored.forEach(a => {
    const hour = new Date(a.timestamp).toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' })
    if (!byHour[hour]) byHour[hour] = { wins: 0, total: 0, rate: 0 }
    byHour[hour].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byHour[hour].wins++
  })
  Object.values(byHour).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  // By VIX regime
  const byVix: Record<string, { wins: number; total: number; rate: number }> = {
    'Low (<14)': { wins: 0, total: 0, rate: 0 },
    'Normal (14-20)': { wins: 0, total: 0, rate: 0 },
    'Elevated (20-28)': { wins: 0, total: 0, rate: 0 },
    'High (>28)': { wins: 0, total: 0, rate: 0 },
  }
  scored.forEach(a => {
    const v = a.vix || 18
    const bucket = v < 14 ? 'Low (<14)' : v < 20 ? 'Normal (14-20)' : v < 28 ? 'Elevated (20-28)' : 'High (>28)'
    byVix[bucket].total++
    if (a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2') byVix[bucket].wins++
  })
  Object.values(byVix).forEach(b => { b.rate = b.total > 0 ? Math.round(b.wins / b.total * 100) : 0 })

  // Recent form (last 10 scored alerts)
  const last10scored = scored.slice(-10)
  const last10wins   = last10scored.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2').length
  const recentForm   = last10wins >= 8 ? 'Hot 🔥' : last10wins >= 6 ? 'Solid' : last10wins >= 4 ? 'Struggling' : 'Cold ❄️'

  return {
    total:        scored.length,
    pending:      recent.filter(a => a.outcome === 'PENDING').length,
    winRate:      scored.length > 0 ? Math.round(wins.length  / scored.length * 100) : 0,
    t1Rate:       scored.length > 0 ? Math.round(wins.length  / scored.length * 100) : 0,
    t2Rate:       scored.length > 0 ? Math.round(t2s.length   / scored.length * 100) : 0,
    stopRate:     scored.length > 0 ? Math.round(stops.length / scored.length * 100) : 0,
    avgPtsWon:    parseFloat(avgPtsWon.toFixed(1)),
    avgPtsLost:   parseFloat(avgPtsLost.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    byConfidence,
    byHour,
    byVix,
    factorPerformance: {},
    recentForm,
    last10: recent.slice(-10).reverse(),
  }
}

// ── Suggest model adjustments based on outcomes ───────────────────────────────

export function getModelSuggestions(): string[] {
  const accuracy = getAlertAccuracy(14)
  const suggestions: string[] = []

  if (accuracy.total < 5) {
    return ['Need at least 5 scored alerts for suggestions — keep trading']
  }

  // Confidence calibration
  const highConf = accuracy.byConfidence['80-100']
  const lowConf  = accuracy.byConfidence['<50']
  if (highConf && highConf.total >= 3 && highConf.rate < 50) {
    suggestions.push(`High confidence signals (80%+) only winning ${highConf.rate}% — confidence is over-estimated`)
  }
  if (lowConf && lowConf.total >= 3 && lowConf.rate > 60) {
    suggestions.push(`Low confidence signals (<50%) winning ${lowConf.rate}% — might be under-valued`)
  }

  // VIX insights
  const elevated = accuracy.byVix['Elevated (20-28)']
  if (elevated && elevated.total >= 3 && elevated.rate < 35) {
    suggestions.push(`Win rate drops to ${elevated.rate}% when VIX 20-28 — consider tighter stops in elevated VIX`)
  }

  // Profit factor
  if (accuracy.profitFactor < 1.0 && accuracy.total >= 8) {
    suggestions.push(`Profit factor ${accuracy.profitFactor} (<1.0) — losers are bigger than winners, widen targets or tighten stops`)
  } else if (accuracy.profitFactor > 2.5) {
    suggestions.push(`Profit factor ${accuracy.profitFactor} — strong edge, consider scaling up`)
  }

  // Recent form
  if (accuracy.recentForm === 'Cold ❄️') {
    suggestions.push('Last 10 signals: cold streak — reduce size until form returns')
  } else if (accuracy.recentForm === 'Hot 🔥') {
    suggestions.push('Last 10 signals: hot streak — edge is confirmed, trade with full conviction')
  }

  return suggestions.length > 0 ? suggestions : ['Accuracy looks solid — no major adjustments needed']
}
