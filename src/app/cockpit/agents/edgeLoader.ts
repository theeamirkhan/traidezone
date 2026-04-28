/**
 * edgeLoader.ts — loads edge profile from Supabase
 *
 * Primary source: Supabase user_edge_profiles (updated by agent at 4:30pm ET daily)
 * Fallback: trigger on-demand update if no profile exists yet
 *
 * No more browser-side backtest computation.
 * No localStorage dependency.
 */

import type { EdgeProfile } from '../ai/buildContext'

// Map Supabase row → EdgeProfile
function mapRow(row: any): EdgeProfile {
  return {
    backtestWinRate:   row.backtest_win_rate,
    backtestPF:        row.backtest_pf,
    longWinRate:       row.long_win_rate,
    shortWinRate:      row.short_win_rate,
    bestDays:          row.best_days || [],
    bestVixRegime:     row.best_vix_regime,
    avgWinMins:        row.avg_win_mins,
    avgLossMins:       row.avg_loss_mins,
    backtestDays:      row.backtest_days,
    backtestDateRange: row.backtest_date_range,
    liveWinRate:       row.live_win_rate,
    livePF:            row.live_pf,
    liveScoredAlerts:  row.live_scored_alerts,
    liveRecentForm:    row.live_recent_form,
    modelSuggestions:  row.model_suggestions || [],
  }
}

export async function loadEdgeProfile(forceRefresh = false): Promise<EdgeProfile | null> {
  try {
    // ── Step 1: Read from Supabase ──────────────────────────────────────────
    const res  = await fetch('/api/userdata?table=edge_profile')
    const data = await res.json()

    if (data.data && !forceRefresh) {
      const row     = data.data
      const ageMs   = Date.now() - new Date(row.updated_at).getTime()
      const ageHrs  = ageMs / 3600000

      console.log(`[edgeLoader] Profile loaded from Supabase (${ageHrs.toFixed(1)}h old)`)
      return mapRow(row)
    }

    // ── Step 2: No profile yet — return null gracefully ─────────────────────
    // The daily cron (4:30pm ET) populates this automatically.
    // First-time: click 🔬 to run the backtest manually, which triggers the agent.
    console.log('[edgeLoader] No edge profile in Supabase yet — run backtest via 🔬 button to seed it')
    return null

  } catch (e: any) {
    console.warn('[edgeLoader] Failed:', e.message)
    return null
  }
}

export function clearEdgeCache(): void {
  // No-op — cache is now in Supabase, use forceRefresh=true instead
  console.log('[edgeLoader] clearEdgeCache: trigger refresh via loadEdgeProfile(true)')
}
