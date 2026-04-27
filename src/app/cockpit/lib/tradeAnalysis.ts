/**
 * tradeAnalysis.ts — trade history parsing, analysis, pattern detection
 */

export function parseBrokerCSV(text: string): any[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

  // Map common broker column names
  const colMap: Record<string, string[]> = {
    date:   ['date', 'trade date', 'execution date', 'filled date'],
    time:   ['time', 'execution time', 'fill time'],
    symbol: ['symbol', 'ticker', 'instrument', 'product'],
    side:   ['side', 'action', 'buy/sell', 'b/s', 'direction'],
    qty:    ['qty', 'quantity', 'shares', 'contracts', 'filled qty'],
    price:  ['price', 'avg price', 'fill price', 'execution price', 'avg fill'],
    pnl:    ['p&l', 'pnl', 'profit/loss', 'realized p&l', 'net p&l', 'realized pnl'],
    setup:  ['setup', 'strategy', 'notes', 'description'],
  }

  const findCol = (key: string) => {
    const aliases = colMap[key] || [key]
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.includes(alias))
      if (idx >= 0) return idx
    }
    return -1
  }

  const cols = Object.fromEntries(Object.keys(colMap).map(k => [k, findCol(k)]))

  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/['"]/g, ''))
    const get = (key: string) => cols[key] >= 0 ? vals[cols[key]] : null
    const pnlRaw = get('pnl')
    const pnl = pnlRaw ? parseFloat(pnlRaw.replace(/[$,()]/g, '').replace(/\((.+)\)/, '-$1')) : null

    return {
      date:   get('date'),
      time:   get('time'),
      symbol: get('symbol'),
      side:   get('side'),
      qty:    get('qty'),
      price:  get('price') ? parseFloat(get('price')!.replace(/[$,]/g, '')) : null,
      pnl,
      setup:  get('setup'),
      inSystem: null, // set by user
    }
  }).filter(t => t.symbol || t.pnl !== null)
}

export function analyzeTradeHistory(trades: any[]) {
  if (!trades?.length) return null

  const completed = trades.filter(t => t.pnl !== null && t.pnl !== undefined)
  if (!completed.length) return null

  const wins   = completed.filter(t => t.pnl > 0)
  const losses = completed.filter(t => t.pnl < 0)

  const inSystem    = completed.filter(t => t.inSystem === true)
  const outOfSystem = completed.filter(t => t.inSystem === false)

  const winRate = completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0
  const inSysWR = inSystem.length  > 0 ? Math.round((inSystem.filter(t => t.pnl > 0).length / inSystem.length) * 100) : 0
  const outSysWR= outOfSystem.length>0 ? Math.round((outOfSystem.filter(t => t.pnl > 0).length / outOfSystem.length) * 100) : 0

  const totalPnL = completed.reduce((s, t) => s + (t.pnl || 0), 0)
  const avgWin   = wins.length   ? wins.reduce((s,t)  => s + t.pnl, 0) / wins.length   : 0
  const avgLoss  = losses.length ? losses.reduce((s,t) => s + t.pnl, 0) / losses.length : 0

  // Best setup by win rate
  const bySetup: Record<string, { wins: number; total: number }> = {}
  completed.forEach(t => {
    const key = t.setup || 'untagged'
    if (!bySetup[key]) bySetup[key] = { wins: 0, total: 0 }
    bySetup[key].total++
    if (t.pnl > 0) bySetup[key].wins++
  })
  const bestSetup = Object.entries(bySetup)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0]?.[0] || 'N/A'

  // Recent form (last 10)
  const recent10 = completed.slice(-10)
  const recentWins = recent10.filter(t => t.pnl > 0).length
  const recentForm = recentWins >= 7 ? 'Hot 🔥' : recentWins >= 5 ? 'Solid' : recentWins >= 3 ? 'Struggling' : 'Cold ❄️'

  return {
    totalTrades: completed.length,
    winRate,
    inSystemWinRate: inSysWR,
    outSystemWinRate: outSysWR,
    totalPnL: Math.round(totalPnL),
    avgWin: Math.round(avgWin),
    avgLoss: Math.round(Math.abs(avgLoss)),
    bestSetup,
    recentForm,
    profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : 'N/A',
  }
}

export function analyzeTradePatterns(trades: any[]): any {
  if (!trades || trades.length < 5) return null

  const patterns: any = {
    byHour: {} as any,
    bySetup: {} as any,
    streaks: { current: 0, longest: 0, currentType: '' },
    avgWinnerSize: 0, avgLoserSize: 0,
    bestHour: '', worstHour: '',
    revengePatterns: 0,
    cutWinnersEarly: false,
  }

  trades.forEach((t: any) => {
    if (!t.pnl) return
    const hour = t.time ? new Date('1970-01-01T' + t.time).getHours() : null
    if (hour !== null) {
      if (!patterns.byHour[hour]) patterns.byHour[hour] = { wins: 0, losses: 0, pnl: 0 }
      if (t.pnl > 0) patterns.byHour[hour].wins++
      else patterns.byHour[hour].losses++
      patterns.byHour[hour].pnl += parseFloat(t.pnl)
    }
    if (t.setup) {
      const key = t.setup.toLowerCase().substring(0, 20)
      if (!patterns.bySetup[key]) patterns.bySetup[key] = { wins: 0, losses: 0, pnl: 0, count: 0 }
      patterns.bySetup[key].count++
      if (t.pnl > 0) patterns.bySetup[key].wins++
      else patterns.bySetup[key].losses++
      patterns.bySetup[key].pnl += parseFloat(t.pnl)
    }
  })

  // Revenge trading: loss followed by entry within 10 min
  for (let i = 1; i < trades.length; i++) {
    if (trades[i-1].pnl < 0 && trades[i].time && trades[i-1].time) {
      const diff = Math.abs(
        new Date('1970-01-01T' + trades[i].time).getTime() -
        new Date('1970-01-01T' + trades[i-1].time).getTime()
      )
      if (diff < 600000) patterns.revengePatterns++
    }
  }

  const hourEntries = Object.entries(patterns.byHour) as [string, any][]
  if (hourEntries.length > 0) {
    const best  = [...hourEntries].sort((a, b) => b[1].pnl - a[1].pnl)[0]
    const worst = [...hourEntries].sort((a, b) => a[1].pnl - b[1].pnl)[0]
    patterns.bestHour  = `${best[0]}:00 ($${Math.round(best[1].pnl)})`
    patterns.worstHour = `${worst[0]}:00 ($${Math.round(worst[1].pnl)})`
  }

  const winners = trades.filter(t => t.pnl > 0).map(t => parseFloat(t.pnl))
  const losers  = trades.filter(t => t.pnl < 0).map(t => Math.abs(parseFloat(t.pnl)))
  patterns.avgWinnerSize = winners.length ? Math.round(winners.reduce((a,b) => a+b,0) / winners.length) : 0
  patterns.avgLoserSize  = losers.length  ? Math.round(losers.reduce((a,b)  => a+b,0) / losers.length)  : 0
  patterns.cutWinnersEarly = patterns.avgWinnerSize < patterns.avgLoserSize * 0.7

  let streak = 0, longest = 0, lastType = ''
  trades.forEach((t: any) => {
    const type = t.pnl > 0 ? 'win' : 'loss'
    if (type === lastType) { streak++; longest = Math.max(longest, streak) }
    else { streak = 1; lastType = type }
  })
  patterns.streaks = { current: streak, longest, currentType: lastType }

  return patterns
}

export function calcMarketScore({ vixPrice, marketIntel, marketTide, optionsFlow, currentPrice, levels }: any) {
  let score = 50
  const breakdown: any = {}

  if (vixPrice) {
    const v = vixPrice < 14 ? 20 : vixPrice < 18 ? 15 : vixPrice < 22 ? 10 : vixPrice < 28 ? 5 : 0
    score += (v - 10)
    breakdown.vix = { score: v, label: vixPrice < 14 ? 'Calm' : vixPrice < 18 ? 'Normal' : vixPrice < 22 ? 'Elevated' : 'High' }
  }
  if (marketIntel?.breadth) {
    const { advancing } = marketIntel.breadth
    const b = advancing >= 7 ? 20 : advancing >= 5 ? 14 : advancing >= 4 ? 8 : 3
    score += (b - 10)
    breakdown.breadth = { score: b, label: marketIntel.breadth.bias }
  }
  if (marketTide) {
    const t = marketTide.bias === 'CALL HEAVY' ? 15 : marketTide.bias === 'PUT HEAVY' ? 3 : 9
    score += (t - 7)
    breakdown.tide = { score: t, label: marketTide.bias }
  }
  if (optionsFlow?.length > 0) {
    const bull = optionsFlow.filter((f: any) => f.sentiment === 'BULLISH').length
    const bear = optionsFlow.filter((f: any) => f.sentiment === 'BEARISH').length
    const f = bull > bear * 1.5 ? 15 : bear > bull * 1.5 ? 3 : 9
    score += (f - 7)
    breakdown.flow = { score: f, label: `${bull}↑ ${bear}↓` }
  }
  if (currentPrice && levels?.spyVwap) {
    const v = currentPrice > levels.spyVwap ? 10 : 3
    score += (v - 5)
    breakdown.vwap = { score: v, label: currentPrice > levels.spyVwap ? 'Above' : 'Below' }
  }

  score = Math.max(0, Math.min(100, score))
  const label = score >= 75 ? 'STRONG BULL' : score >= 60 ? 'BULLISH' : score >= 45 ? 'NEUTRAL' : score >= 30 ? 'BEARISH' : 'STRONG BEAR'
  const color = score >= 65 ? '#00aa55' : score >= 45 ? '#e05000' : '#cc1040'
  return { score: Math.round(score), label, color, breakdown }
}
