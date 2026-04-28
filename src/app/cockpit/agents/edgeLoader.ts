/**
 * edgeLoader.ts — loads and caches the trader's historical edge profile
 *
 * Called once on cockpit mount. Fetches:
 *  1. Backtest summary from /api/agents/backtest (cached in localStorage 24h)
 *  2. Live alert accuracy from /api/trade-alerts
 *
 * Returns an EdgeProfile used by buildContext to enrich every AI call.
 */

import type { EdgeProfile } from '../ai/buildContext'

const CACHE_KEY     = 'tz-edge-profile'
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000  // 24h

function loadCache(): EdgeProfile | null {
  try {
    const c = localStorage.getItem(CACHE_KEY)
    if (!c) return null
    const { ts, data } = JSON.parse(c)
    if (Date.now() - ts > CACHE_MAX_AGE) return null
    return data
  } catch { return null }
}

function saveCache(profile: EdgeProfile): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: profile }))
  } catch {}
}

async function fetchBacktestSummary(): Promise<Partial<EdgeProfile> | null> {
  try {
    const res  = await fetch('/api/agents/backtest?days=90', {
      headers: { authorization: 'Bearer traidezone-cron' },
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json()
    if (!data.summary) return null
    const s = data.summary

    // Find best days (win rate > 55% with 3+ signals)
    const bestDays = Object.entries(s.byDow || {})
      .filter(([, v]: any) => v.total >= 3 && v.rate >= 55)
      .sort((a: any, b: any) => b[1].rate - a[1].rate)
      .slice(0, 3)
      .map(([day]) => day)

    // Find best VIX regime
    const bestVix = Object.entries(s.byVix || {})
      .filter(([, v]: any) => v.total >= 3)
      .sort((a: any, b: any) => b[1].rate - a[1].rate)[0]

    return {
      backtestWinRate:   s.winRate,
      backtestPF:        s.profitFactor,
      longWinRate:       s.longWinRate,
      shortWinRate:      s.shortWinRate,
      bestDays:          bestDays.length ? bestDays : [],
      bestVixRegime:     bestVix ? bestVix[0].replace('Low<14','Low <14').replace('Normal14-20','Normal 14-20').replace('Elevated20-28','Elevated 20-28').replace('High>28','High >28') : null,
      avgWinMins:        s.avgWinMins,
      avgLossMins:       s.avgLossMins,
      backtestDays:      s.totalDays,
      backtestDateRange: s.dateRange ? `${s.dateRange.from} → ${s.dateRange.to}` : null,
    }
  } catch (e) {
    console.warn('[edgeLoader] backtest fetch failed:', e)
    return null
  }
}

async function fetchLiveAccuracy(): Promise<Partial<EdgeProfile> | null> {
  try {
    const res  = await fetch('/api/trade-alerts?days=30')
    const data = await res.json()
    const alerts: any[] = data.alerts || []

    const scored = alerts.filter(a => a.outcome !== 'PENDING')
    if (!scored.length) return { liveScoredAlerts: 0, liveWinRate: null, livePF: null, liveRecentForm: null, modelSuggestions: [] }

    const wins  = scored.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2')
    const stops = scored.filter(a => a.outcome === 'STOPPED_OUT')

    const avgWon  = wins.length  ? wins.reduce((s,a)  => s + Math.abs(a.pts_to_t1 || 0), 0) / wins.length  : 0
    const avgLost = stops.length ? stops.reduce((s,a) => s + Math.abs(a.pts_to_t1 || 0), 0) / stops.length : 0
    const pf      = avgLost > 0  ? avgWon / avgLost : wins.length > 0 ? 99 : 0

    const last10  = scored.slice(-10)
    const l10w    = last10.filter(a => a.outcome === 'HIT_T1' || a.outcome === 'HIT_T2').length
    const form    = l10w >= 8 ? 'Hot 🔥' : l10w >= 6 ? 'Solid' : l10w >= 4 ? 'Struggling' : 'Cold ❄️'

    const winRate = scored.length ? Math.round(wins.length / scored.length * 100) : 0

    // Suggestions
    const suggestions: string[] = []
    if (scored.length >= 8) {
      if (pf < 1.0)    suggestions.push(`Profit factor ${pf.toFixed(2)} — losers outsize winners, widen targets`)
      if (winRate < 40) suggestions.push(`Win rate ${winRate}% below baseline — review entry conditions`)
      if (form === 'Cold ❄️') suggestions.push('Cold streak — reduce size until form returns')
      if (form === 'Hot 🔥')  suggestions.push('Hot streak — edge confirmed, trade with conviction')
    }

    return {
      liveWinRate:      winRate,
      livePF:           parseFloat(pf.toFixed(2)),
      liveScoredAlerts: scored.length,
      liveRecentForm:   form,
      modelSuggestions: suggestions,
    }
  } catch (e) {
    console.warn('[edgeLoader] live accuracy fetch failed:', e)
    return null
  }
}

export async function loadEdgeProfile(forceRefresh = false): Promise<EdgeProfile | null> {
  // Return cache if fresh
  if (!forceRefresh) {
    const cached = loadCache()
    if (cached) {
      console.log('[edgeLoader] Using cached edge profile')
      return cached
    }
  }

  console.log('[edgeLoader] Loading fresh edge profile...')

  // Fetch both in parallel — backtest can take a few seconds
  const [backtest, live] = await Promise.all([
    fetchBacktestSummary(),
    fetchLiveAccuracy(),
  ])

  const profile: EdgeProfile = {
    backtestWinRate:   backtest?.backtestWinRate   ?? null,
    backtestPF:        backtest?.backtestPF        ?? null,
    longWinRate:       backtest?.longWinRate       ?? null,
    shortWinRate:      backtest?.shortWinRate      ?? null,
    bestDays:          backtest?.bestDays          ?? [],
    bestVixRegime:     backtest?.bestVixRegime     ?? null,
    avgWinMins:        backtest?.avgWinMins        ?? null,
    avgLossMins:       backtest?.avgLossMins       ?? null,
    backtestDays:      backtest?.backtestDays      ?? null,
    backtestDateRange: backtest?.backtestDateRange ?? null,
    liveWinRate:       live?.liveWinRate           ?? null,
    livePF:            live?.livePF                ?? null,
    liveScoredAlerts:  live?.liveScoredAlerts      ?? null,
    liveRecentForm:    live?.liveRecentForm        ?? null,
    modelSuggestions:  live?.modelSuggestions      ?? [],
  }

  saveCache(profile)
  console.log('[edgeLoader] Edge profile loaded and cached:', profile)
  return profile
}

export function clearEdgeCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}
