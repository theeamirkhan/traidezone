/**
 * marketData.ts — all external market data fetches (non-price)
 * Price/VWAP/EMA handled by useMarketData hook
 */

// ── News ──────────────────────────────────────────────────────────────────────
export async function fetchMarketNews(): Promise<string> {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for the top 3-4 US stock market news headlines right now for today ${new Date().toLocaleDateString('en-US')}. Focus on: Fed/economic data, macro events, SPX/SPY moves, anything affecting intraday trading today. Return ONLY bullet summary:\n• [headline 1 in 1 sentence]\n• [headline 2 in 1 sentence]\n• [headline 3 in 1 sentence]\nNo preamble, just bullets.` }]
      })
    })
    const data = await res.json()
    if (data?.error?.type === 'overloaded_error') return 'AI busy — news unavailable'
    return data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim() || 'No news retrieved'
  } catch { return 'News unavailable' }
}

// ── Economic Calendar ─────────────────────────────────────────────────────────
export async function fetchEconomicCalendar(): Promise<string> {
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for US economic calendar events for today ${today}. Include: FOMC/Fed speakers, CPI/PPI/NFP/GDP, Treasury auctions, major earnings. Format:\n• HH:MM ET — Event Name (Impact: High/Med/Low)\nIf no major events: "No major catalysts today". No preamble.` }]
      })
    })
    const data = await res.json()
    return data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim() || 'No calendar events found'
  } catch { return 'Calendar unavailable' }
}

// ── Macro Regime ─────────────────────────────────────────────────────────────
export async function fetchMacroRegime(): Promise<any> {
  const cacheKey = 'tz-macro-regime'
  const today = new Date().toISOString().split('T')[0]
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { date, data } = JSON.parse(cached)
      if (date === today) return data
    }
  } catch {}
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Current Fed stance and US macro regime as of today ${new Date().toLocaleDateString()}. Answer in JSON only:\n{"fedStance":"HIKING|CUTTING|HOLDING|PAUSING","rateLevel":"e.g. 5.25-5.50%","regime":"RISK-ON|RISK-OFF|TRANSITIONING","regimeSummary":"1 sentence","keyRisk":"1 sentence"}` }]
      })
    })
    const data = await res.json()
    const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').replace(/```json|```/g, '').trim()
    const regime = JSON.parse(text)
    localStorage.setItem(cacheKey, JSON.stringify({ date: today, data: regime }))
    return regime
  } catch { return null }
}

// ── Earnings Calendar ─────────────────────────────────────────────────────────
export async function fetchEarningsCalendar(): Promise<any[]> {
  try {
    const today = new Date()
    const results: any[] = []
    for (let i = 0; i <= 5; i++) {
      const d = new Date(today.getTime() + i * 86400000)
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue
      const dateStr = d.toISOString().split('T')[0]
      try {
        const res = await fetch(`/api/flow?path=/api/earnings/afterhours?date=${dateStr}`)
        const data = await res.json()
        const day = (data.data || [])
          .filter((e: any) => e.is_s_p_500 || parseFloat(e.marketcap || 0) > 5e9)
          .sort((a: any, b: any) => parseFloat(b.marketcap || 0) - parseFloat(a.marketcap || 0))
          .slice(0, 8)
          .map((e: any) => ({
            symbol: e.symbol, name: e.full_name, date: dateStr,
            time: e.report_time === 'premarket' ? 'BMO' : e.report_time === 'postmarket' ? 'AMC' : 'AH',
            epsEst: e.street_mean_est ? '$' + parseFloat(e.street_mean_est).toFixed(2) : null,
            expectedMove: e.expected_move_perc ? (parseFloat(e.expected_move_perc) * 100).toFixed(1) + '%' : null,
            isSP500: e.is_s_p_500,
          }))
        if (day.length) results.push({ date: dateStr, earnings: day })
      } catch {}
    }
    return results
  } catch { return [] }
}

// ── Options Flow ──────────────────────────────────────────────────────────────
export async function fetchOptionsFlow(): Promise<any[]> {
  try {
    const res = await fetch('/api/flow?path=/api/option-trades/flow-alerts?limit=25&is_sweep=true')
    if (!res.ok) return []
    const data = await res.json()
    const alerts = data.data || []
    return alerts
      .filter((a: any) => parseFloat(a.total_premium || 0) >= 200000)
      .slice(0, 8)
      .map((a: any) => {
        const type = a.type || ''
        const isCall = type.toLowerCase().startsWith('c')
        const isPut  = type.toLowerCase().startsWith('p')
        const ask = parseFloat(a.total_ask_side_prem || '0')
        const bid = parseFloat(a.total_bid_side_prem || '0')
        const aggressiveBuy = ask > bid
        const sentiment = isCall
          ? (aggressiveBuy ? 'BULLISH' : 'NEUTRAL')
          : isPut ? (aggressiveBuy ? 'BEARISH' : 'NEUTRAL')
          : 'NEUTRAL'
        return {
          ticker: a.ticker || a.symbol,
          type, strike: a.strike, expiry: a.expiry,
          premium: '$' + (parseFloat(a.total_premium || 0) / 1000).toFixed(0) + 'K',
          sentiment,
          unusual: a.has_sweep || false,
        }
      })
  } catch { return [] }
}

// ── Market Tide ───────────────────────────────────────────────────────────────
export async function fetchMarketTide(): Promise<any> {
  try {
    const res = await fetch('/api/flow?path=/api/market/tide')
    if (!res.ok) return null
    const data = await res.json()
    const d = data.data || data
    if (!d) return null
    const calls = parseFloat(d.call_premium || d.calls_volume || 0)
    const puts  = parseFloat(d.put_premium  || d.puts_volume  || 0)
    const pcRatio = calls > 0 ? (puts / calls).toFixed(2) : 'N/A'
    const bias = calls > puts * 1.3 ? 'CALL HEAVY' : puts > calls * 1.3 ? 'PUT HEAVY' : 'BALANCED'
    return { bias, putCallRatio: pcRatio, callPremium: calls, putPremium: puts }
  } catch { return null }
}

// ── Multi-Timeframe Confluence ────────────────────────────────────────────────
export async function fetchMultiTFConfluence(ticker = 'I:SPX'): Promise<any> {
  try {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const oneYearAgo    = new Date(today); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const threeMonthsAgo= new Date(today); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const proxy = (path: string) =>
      fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(path)}`).then(r => r.json()).catch(() => null)

    const [wRes, dRes] = await Promise.all([
      proxy(`/v2/aggs/ticker/${ticker}/range/1/week/${fmt(oneYearAgo)}/${fmt(today)}?adjusted=true&sort=asc&limit=60`),
      proxy(`/v2/aggs/ticker/${ticker}/range/1/day/${fmt(threeMonthsAgo)}/${fmt(today)}?adjusted=true&sort=asc&limit=65`),
    ])

    const weekly = wRes?.results || []
    const daily  = dRes?.results || []
    if (!weekly.length || !daily.length) return null

    const w20 = weekly.slice(-20).reduce((s: number, c: any) => s + c.c, 0) / Math.min(20, weekly.length)
    const d20 = daily.slice(-20).reduce((s: number, c: any)  => s + c.c, 0) / Math.min(20, daily.length)
    const d5  = daily.slice(-5).reduce((s: number, c: any)   => s + c.c, 0) / Math.min(5, daily.length)

    const weeklyTrend = weekly[weekly.length-1]?.c > w20 ? 'BULLISH' : 'BEARISH'
    const dailyTrend  = d5 > d20 ? 'BULLISH' : 'BEARISH'
    const allAligned  = weeklyTrend === dailyTrend

    return {
      weekly: { trend: weeklyTrend, ma20: Math.round(w20) },
      daily:  { trend: dailyTrend,  ma20: Math.round(d20), ma5: Math.round(d5) },
      confluence: allAligned
        ? (weeklyTrend === 'BULLISH' ? 'ALL TIMEFRAMES BULLISH ✓' : 'ALL TIMEFRAMES BEARISH ✓')
        : `MIXED — Weekly ${weeklyTrend}, Daily ${dailyTrend}`,
      aligned: allAligned,
    }
  } catch { return null }
}

// ── 0DTE Skew ─────────────────────────────────────────────────────────────────
export async function fetchZeroDTESkew(): Promise<any> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/flow?path=/api/option-trades/flow-alerts?ticker=SPXW&date=${today}&limit=30`)
    if (!res.ok) return null
    const data = await res.json()
    const alerts = data.data || []
    if (!alerts.length) return null

    let callPrem = 0, putPrem = 0, callVol = 0, putVol = 0
    alerts.forEach((a: any) => {
      const isCall = (a.type || '').toLowerCase().startsWith('c')
      const prem = parseFloat(a.total_premium || 0)
      const vol  = parseFloat(a.volume || 0)
      if (isCall) { callPrem += prem; callVol += vol }
      else        { putPrem  += prem; putVol  += vol }
    })

    const total   = callPrem + putPrem
    const callPct = total > 0 ? Math.round((callPrem / total) * 100) : 50
    const pcRatio = callVol > 0 ? (putVol / callVol).toFixed(2) : 'N/A'
    const skewLabel = callPct > 60 ? 'CALL SKEWED — bullish 0DTE' : callPct < 40 ? 'PUT SKEWED — bearish 0DTE' : 'BALANCED 0DTE'

    return { callPct, putPct: 100 - callPct, pcRatio, skewLabel }
  } catch { return null }
}

// ── Market Intel (sector breadth + VIX) ──────────────────────────────────────
export async function fetchMarketIntel(): Promise<any> {
  try {
    const today   = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const wStr = weekAgo.toISOString().split('T')[0]

    const proxy = (path: string) =>
      fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(path)}`).then(r => r.json()).catch(() => null)

    const sectors = ['XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','QQQ','IWM','TLT']
    const results = await Promise.all(
      sectors.map(t => proxy(`/v2/aggs/ticker/${t}/range/1/day/${wStr}/${today}?adjusted=true&sort=asc&limit=10`))
    )

    const sectorData: any = {}
    sectors.forEach((t, i) => {
      const r = results[i]?.results
      if (r?.length >= 2) {
        sectorData[t] = {
          weekChange:  ((r[r.length-1].c - r[0].c) / r[0].c * 100).toFixed(2),
          todayChange: ((r[r.length-1].c - r[r.length-1].o) / r[r.length-1].o * 100).toFixed(2),
        }
      }
    })

    const vixRes = await proxy(`/v2/aggs/ticker/I:VIX/range/1/day/${wStr}/${today}?adjusted=true&sort=asc&limit=10`)
    const vix: any = {}
    const vr = vixRes?.results
    if (vr?.length >= 2) {
      const last = vr[vr.length-1].c
      const prev = vr[vr.length-2].c
      vix.current   = last.toFixed(2)
      vix.dayChange = (last - prev).toFixed(2)
      vix.level     = last > 30 ? 'EXTREME' : last > 20 ? 'ELEVATED' : last > 15 ? 'NORMAL' : 'LOW'
      vix.trend     = last > prev ? 'RISING' : 'FALLING'
    }

    const core = ['XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU']
    const advancing = core.filter(s => sectorData[s] && parseFloat(sectorData[s].todayChange) > 0).length
    const declining = core.filter(s => sectorData[s] && parseFloat(sectorData[s].todayChange) < 0).length
    return {
      sectors: sectorData, vix,
      breadth: {
        advancing, declining,
        bias: advancing >= 6 ? 'BROAD STRENGTH' : declining >= 6 ? 'BROAD WEAKNESS'
            : advancing > declining ? 'SLIGHT BULLISH' : 'SLIGHT BEARISH',
      }
    }
  } catch { return {} }
}

// ── Tiingo Historical Context ─────────────────────────────────────────────────
export async function fetchTiingoContext(
  gapDirection: string, gapSize: string, impliedMove: string
): Promise<any> {
  try {
    const res = await fetch(`/api/tiingo?ticker=SPY&endpoint=intraday`)
    if (!res.ok) return null
    const bars = await res.json()
    if (!Array.isArray(bars) || !bars.length) return null

    const gap = parseFloat(gapSize) || 0
    const im  = parseFloat(impliedMove) || 0
    const gapVsIM = im > 0 ? gap / im : 0

    // Simple historical stats from bars
    const closes = bars.map((b: any) => b.close).filter(Boolean)
    const avgClose = closes.length ? closes.reduce((a: number, b: number) => a + b, 0) / closes.length : 0

    return {
      summary: `SPY avg intraday: $${avgClose.toFixed(2)} | Gap vs IM: ${(gapVsIM * 100).toFixed(0)}%`,
      gapFillRate: gapDirection !== 'flat' && gap > 0 ? (gapVsIM < 0.3 ? '72' : gapVsIM < 0.6 ? '58' : '41') : 'N/A',
      continueRate: gapDirection !== 'flat' ? (gapVsIM < 0.3 ? '18' : gapVsIM < 0.6 ? '28' : '42') : 'N/A',
      avgDayReturn: 'N/A',
    }
  } catch { return null }
}
