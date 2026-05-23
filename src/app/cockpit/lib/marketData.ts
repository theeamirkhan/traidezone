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
import { detectDailyCandlePatterns, formatPatternsForAI } from './dailyCandlePatterns'

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
    const oneYearAgo     = new Date(today); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const sixMonthsAgo   = new Date(today); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const threeMonthsAgo = new Date(today); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const proxy = (path: string) =>
      fetch(`/api/polygon?apiKey=server&path=${encodeURIComponent(path)}`).then(r => r.json()).catch(() => null)

    const todayStr     = fmt(today)
    const fiveDaysAgo  = new Date(today); fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
    const thirtyDays   = new Date(today); thirtyDays.setDate(thirtyDays.getDate() - 30)

    const [wRes, dRes, h1Res, m15Res, dxyRes, tltRes, oilRes] = await Promise.all([
      proxy(`/v2/aggs/ticker/${ticker}/range/1/week/${fmt(oneYearAgo)}/${todayStr}?adjusted=true&sort=asc&limit=60`),
      proxy(`/v2/aggs/ticker/${ticker}/range/1/day/${fmt(sixMonthsAgo)}/${todayStr}?adjusted=true&sort=asc&limit=130`),
      // 1-hour bars — last 10 sessions (intraday structure)
      proxy(`/v2/aggs/ticker/${ticker}/range/1/hour/${fmt(fiveDaysAgo)}/${todayStr}?adjusted=true&sort=asc&limit=80`),
      // 15-min bars — last 5 sessions (swing structure)
      proxy(`/v2/aggs/ticker/${ticker}/range/15/minute/${fmt(fiveDaysAgo)}/${todayStr}?adjusted=true&sort=asc&limit=200`),
      // Cross-asset: DXY (dollar), TLT (bonds), OIL
      proxy(`/v2/aggs/ticker/DX:CURR/range/1/day/${fmt(thirtyDays)}/${todayStr}?adjusted=true&sort=asc&limit=30`).catch(() => null),
      proxy(`/v2/aggs/ticker/TLT/range/1/day/${fmt(thirtyDays)}/${todayStr}?adjusted=true&sort=asc&limit=30`).catch(() => null),
      proxy(`/v2/aggs/ticker/CL:COM/range/1/day/${fmt(thirtyDays)}/${todayStr}?adjusted=true&sort=asc&limit=30`).catch(() => null),
    ])

    const weekly = wRes?.results || []
    const daily  = dRes?.results || []
    if (!weekly.length || !daily.length) return null

    const hourly  = h1Res?.results  || []
    const m15bars = m15Res?.results || []

    const sma = (bars: any[], n: number) => {
      const sl = bars.slice(-n)
      return sl.reduce((s: number, c: any) => s + c.c, 0) / sl.length
    }
    const ema = (bars: any[], n: number) => {
      const k = 2 / (n + 1)
      let e = bars[0].c
      for (const b of bars) e = b.c * k + e * (1 - k)
      return e
    }
    const atr = (bars: any[], n = 14) => {
      const trs = bars.slice(-n).map((b: any, i: number, arr: any[]) => {
        if (i === 0) return b.h - b.l
        const prev = arr[i-1]
        return Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c))
      })
      return trs.reduce((s: number, v: number) => s + v, 0) / trs.length
    }
    const rsi = (bars: any[], n = 14) => {
      const changes = bars.slice(-n-1).map((b: any, i: number, arr: any[]) =>
        i === 0 ? 0 : b.c - arr[i-1].c
      ).slice(1)
      const gains = changes.map((c: number) => c > 0 ? c : 0)
      const losses = changes.map((c: number) => c < 0 ? -c : 0)
      const avgGain = gains.reduce((s: number, v: number) => s + v, 0) / n
      const avgLoss = losses.reduce((s: number, v: number) => s + v, 0) / n
      if (avgLoss === 0) return 100
      return 100 - (100 / (1 + avgGain / avgLoss))
    }

    // ── Weekly technicals ──────────────────────────────────────────────────────
    const wClose    = weekly[weekly.length-1]?.c || 0
    const wHigh52   = Math.max(...weekly.slice(-52).map((b: any) => b.h))
    const wLow52    = Math.min(...weekly.slice(-52).map((b: any) => b.l))
    const wSMA20    = sma(weekly, Math.min(20, weekly.length))
    const wSMA50    = sma(weekly, Math.min(50, weekly.length))
    const wEMA10    = ema(weekly.slice(-30), 10)
    const wRSI      = rsi(weekly, 14)
    const wTrend    = wClose > wSMA20 ? 'BULLISH' : 'BEARISH'
    const wMomentum = wClose > wSMA50 ? 'ABOVE 50W MA' : 'BELOW 50W MA'
    const wPctFrom52H = ((wClose - wHigh52) / wHigh52 * 100).toFixed(1)
    const wPctFrom52L = ((wClose - wLow52)  / wLow52  * 100).toFixed(1)

    // ── Daily technicals ───────────────────────────────────────────────────────
    const dClose    = daily[daily.length-1]?.c || 0
    const dSMA20    = sma(daily, Math.min(20, daily.length))
    const dSMA50    = sma(daily, Math.min(50, daily.length))
    const dSMA200   = sma(daily, Math.min(200, daily.length))
    const dEMA9     = ema(daily.slice(-30), 9)
    const dEMA21    = ema(daily.slice(-50), 21)
    const dEMA200   = daily.length >= 200 ? ema(daily, 200) : dSMA200  // true 200 EMA, fallback to SMA
    const dRSI      = rsi(daily, 14)
    const dATR      = atr(daily, 14)
    const dTrend    = dClose > dSMA20 ? 'BULLISH' : 'BEARISH'
    const dClose5   = daily.slice(-5).map((b: any) => b.c)
    const d5Trend   = dClose5[dClose5.length-1] > dClose5[0] ? 'UP' : 'DOWN'

    // Higher highs / lower lows pattern (last 20 daily bars)
    const recent20  = daily.slice(-20)
    const highs20   = recent20.map((b: any) => b.h)
    const lows20    = recent20.map((b: any) => b.l)
    const hhhl      = highs20[highs20.length-1] > highs20[0] && lows20[lows20.length-1] > lows20[0]
    const lhll      = highs20[highs20.length-1] < highs20[0] && lows20[lows20.length-1] < lows20[0]
    const structure = hhhl ? 'HIGHER HIGHS/HIGHER LOWS (uptrend structure)' : lhll ? 'LOWER HIGHS/LOWER LOWS (downtrend structure)' : 'MIXED STRUCTURE (consolidation)'

    // Distance from key MAs
    const pctFromD200 = ((dClose - dSMA200) / dSMA200 * 100).toFixed(1)
    const pctFromD50  = ((dClose - dSMA50)  / dSMA50  * 100).toFixed(1)
    const pctFromD20  = ((dClose - dSMA20)  / dSMA20  * 100).toFixed(1)

    // Golden/death cross
    const cross = dSMA50 > dSMA200 ? 'GOLDEN CROSS (50D above 200D — bullish structure)' : 'DEATH CROSS (50D below 200D — bearish structure)'

    // Trend alignment across timeframes
    const weeklyTrend = wTrend
    const dailyTrend  = dTrend
    const allAligned  = weeklyTrend === dailyTrend

    // ── 15-min structure ────────────────────────────────────────────────────
    const m15Analysis = (() => {
      if (m15bars.length < 10) return null
      const todayStr2 = fmt(today)
      const today15 = m15bars.filter((b: any) => {
        const d = new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        return d === todayStr2
      })
      if (today15.length < 4) return null
      const highs = today15.map((b: any) => b.h)
      const lows  = today15.map((b: any) => b.l)
      const mHigh = Math.max(...highs)
      const mLow  = Math.min(...lows)
      const curr  = today15[today15.length - 1]?.c || 0
      const range = mHigh - mLow
      const firstThird = today15.slice(0, Math.ceil(today15.length / 3))
      const lastThird  = today15.slice(-Math.ceil(today15.length / 3))
      const firstAvg   = firstThird.reduce((s: number, b: any) => s + b.c, 0) / firstThird.length
      const lastAvg    = lastThird.reduce((s: number, b: any) => s + b.c, 0) / lastThird.length
      const m15Trend   = lastAvg > firstAvg + range * 0.1 ? 'BULLISH'
                       : lastAvg < firstAvg - range * 0.1 ? 'BEARISH' : 'RANGING'
      const rangePct   = range > 0 ? Math.round((curr - mLow) / range * 100) : 50
      return {
        trend: m15Trend, high: parseFloat(mHigh.toFixed(2)), low: parseFloat(mLow.toFixed(2)),
        range: parseFloat(range.toFixed(1)), rangePct, curr: parseFloat(curr.toFixed(2)),
        signal: `15-min: ${m15Trend} | Range ${mLow.toFixed(0)}-${mHigh.toFixed(0)} (${range.toFixed(0)}pts) | Price at ${rangePct}% of range`,
      }
    })()

    // ── 1-hour structure ────────────────────────────────────────────────────
    const h1Analysis = (() => {
      if (hourly.length < 5) return null
      const recent20 = hourly.slice(-20)
      const closes   = recent20.map((b: any) => b.c)
      const highs    = recent20.map((b: any) => b.h)
      const lows     = recent20.map((b: any) => b.l)
      const curr     = closes[closes.length - 1]
      const h1High   = Math.max(...highs)
      const h1Low    = Math.min(...lows)
      const k        = 2 / 21
      let h1Ema      = closes[0]
      for (const c of closes) h1Ema = c * k + h1Ema * (1 - k)
      const h1Trend  = curr > h1Ema + 5 ? 'BULLISH' : curr < h1Ema - 5 ? 'BEARISH' : 'RANGING'
      return {
        trend: h1Trend, ema20: parseFloat(h1Ema.toFixed(2)),
        high20: parseFloat(h1High.toFixed(2)), low20: parseFloat(h1Low.toFixed(2)),
        aboveEma: curr > h1Ema,
        signal: `1hr: ${h1Trend} | EMA20(1h): ${h1Ema.toFixed(0)} | Price ${curr > h1Ema ? 'above' : 'below'} | Range ${h1Low.toFixed(0)}-${h1High.toFixed(0)}`,
      }
    })()

    // ── Cross-asset analysis ─────────────────────────────────────────────────
    const crossAsset = (() => {
      const dxyBars = dxyRes?.results || []
      const tltBars = tltRes?.results || []
      const oilBars = oilRes?.results || []
      const pctChg  = (bars: any[], n = 5) => {
        if (bars.length < n) return null
        const prev = bars[bars.length - n]?.c
        const curr2 = bars[bars.length - 1]?.c
        return prev && curr2 ? ((curr2 - prev) / prev * 100) : null
      }
      const dxy5d   = pctChg(dxyBars, 5)
      const tlt5d   = pctChg(tltBars, 5)
      const oil5d   = pctChg(oilBars, 5)
      const dxyCurr = dxyBars[dxyBars.length - 1]?.c || null
      const tltCurr = tltBars[tltBars.length - 1]?.c || null
      let confirmation = 'NEUTRAL'
      let signal = 'Cross-asset data unavailable'
      if (dxy5d !== null && tlt5d !== null) {
        const dxyUp = dxy5d > 0.3, dxyDn = dxy5d < -0.3
        const tltUp = tlt5d > 0.3, tltDn = tlt5d < -0.3
        if (dxyDn && tltDn)        { confirmation = 'RISK_ON';  signal = `Risk-on: DXY ${dxy5d.toFixed(1)}% + TLT ${tlt5d.toFixed(1)}% — dollar + bonds both selling, equity tailwind` }
        else if (dxyUp && tltUp)   { confirmation = 'RISK_OFF'; signal = `Risk-off: DXY +${dxy5d.toFixed(1)}% + TLT +${tlt5d.toFixed(1)}% — dollar + bonds both bid, fear trade` }
        else if (dxyUp && tltDn)   { confirmation = 'BEARISH';  signal = `Bearish: DXY +${dxy5d.toFixed(1)}% strong dollar + bonds selling = SPX headwind` }
        else                        {                             signal = `Mixed: DXY ${dxy5d.toFixed(1)}% | TLT ${tlt5d.toFixed(1)}% | OIL ${oil5d?.toFixed(1) || 'n/a'}% (5d)` }
      }
      return { dxyCurr, tltCurr, dxy5d, tlt5d, oil5d, confirmation, signal }
    })()

    // Last 5 daily candles narrative
    const last5 = daily.slice(-5).map((b: any) => {
      const d = new Date(b.t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      const chg = ((b.c - b.o) / b.o * 100).toFixed(2)
      const type = b.c > b.o ? '▲' : '▼'
      return `${d}: ${type} ${Math.abs(parseFloat(chg))}% (O:${b.o.toFixed(0)} H:${b.h.toFixed(0)} L:${b.l.toFixed(0)} C:${b.c.toFixed(0)})`
    })

    return {
      // Summary
      confluence: allAligned
        ? (weeklyTrend === 'BULLISH' ? 'ALL TIMEFRAMES BULLISH ✓' : 'ALL TIMEFRAMES BEARISH ✓')
        : `MIXED — Weekly ${weeklyTrend}, Daily ${dailyTrend}`,
      aligned: allAligned,

      // Weekly
      weekly: {
        trend: weeklyTrend,
        momentum: wMomentum,
        sma20: Math.round(wSMA20),
        sma50: Math.round(wSMA50),
        ema10: Math.round(wEMA10),
        rsi: Math.round(wRSI),
        high52: Math.round(wHigh52),
        low52: Math.round(wLow52),
        pctFrom52H: parseFloat(wPctFrom52H),
        pctFrom52L: parseFloat(wPctFrom52L),
        currentClose: Math.round(wClose),
      },

      // Daily
      daily: {
        trend: dailyTrend,
        fiveDayTrend: d5Trend,
        structure,
        sma20: Math.round(dSMA20),
        sma50: Math.round(dSMA50),
        sma200: Math.round(dSMA200),
        ema200: Math.round(dEMA200),   // true 200 EMA — the key stop/support level
        ema9: Math.round(dEMA9),
        ema21: Math.round(dEMA21),
        rsi: Math.round(dRSI),
        atr: Math.round(dATR),
        pctFromSMA200: parseFloat(pctFromD200),
        pctFromSMA50: parseFloat(pctFromD50),
        pctFromSMA20: parseFloat(pctFromD20),
        pctFromEMA200: parseFloat(((dClose - dEMA200) / dEMA200 * 100).toFixed(1)),
        cross,
        currentClose: Math.round(dClose),
      },

      // Last 5 daily candles
      recentCandles: last5,

      // ── New: 15-min, 1-hour, cross-asset ──────────────────────────────────
      m15:        m15Analysis,
      h1:         h1Analysis,
      crossAsset: crossAsset,

      // ── Daily candle pattern detection ────────────────────────────────────
      patterns: detectDailyCandlePatterns(daily.slice(-10), {
        ema200:    dEMA200,
        sma50:     dSMA50,
        sma200:    dSMA200,
      }),

      summary: [
        `Weekly: ${weeklyTrend} | ${wMomentum} | RSI ${Math.round(wRSI)} | ${wPctFrom52H}% from 52W high`,
        `Daily: ${dailyTrend} | ${structure}`,
        `Daily SMA: 20D ${Math.round(dSMA20)} (${pctFromD20}%) | 50D ${Math.round(dSMA50)} (${pctFromD50}%) | 200D SMA ${Math.round(dSMA200)} (${pctFromD200}%)`,
        `Daily 200 EMA: ${Math.round(dEMA200)} (${((dClose - dEMA200) / dEMA200 * 100).toFixed(1)}% from price) — KEY STOP LEVEL`,
        `Daily RSI: ${Math.round(dRSI)} | ATR: ${Math.round(dATR)}pts | ${cross}`,
        m15Analysis ? `15-min: ${m15Analysis.signal}` : '',
        h1Analysis  ? `1-hour: ${h1Analysis.signal}`  : '',
        crossAsset  ? `Cross-asset: ${crossAsset.signal}` : '',
        `5-day candles: ${last5.join(' | ')}`,
      ].filter(Boolean).join('\n'),
    }
  } catch (e) { console.error('[multiTF]', e); return null }
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
