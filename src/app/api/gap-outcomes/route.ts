/**
 * /api/gap-outcomes — Gap + Trend Day tracking and probability engine
 *
 * GET ?action=record    — Record today's gap + opening conditions (9:35am cron)
 * GET ?action=score     — Score gap outcome at 11am (11:05am cron)
 * GET ?action=eod       — Score full day trend/chop at close (4:05pm cron)
 * GET ?action=stats     — Historical fill/continuation/trend rates
 * GET ?action=today     — Get today's record
 * GET ?action=predict   — Trend day prediction for today based on opening conditions
 *
 * Supabase table: gap_outcomes
 *   id, trading_date, gap_direction, gap_size, gap_pct, prev_close, open_price,
 *   vix_open, day_of_week, prior_day_type,
 *   opening_tick, opening_breadth_score, opening_skew,
 *   news_events (jsonb), news_impact, catalyst_type,
 *   implied_move, gap_vs_im_ratio,
 *   trend_score_predicted (0-100 at open),
 *   -- Gap outcome (scored at 11am)
 *   gap_outcome (FILLED/CONTINUED/CHOPPED/PENDING),
 *   fill_price, continuation_price, pts_moved_by_11am,
 *   -- Day type (scored at EOD)
 *   day_type (TREND_UP/TREND_DOWN/CHOP/REVERSAL),
 *   day_range_pts, close_price, close_vs_open_pts,
 *   trend_confirmed, outcome_time, eod_time,
 *   created_at
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const POLYGON_KEY = process.env.POLYGON_API_KEY

// ── Catalyst classifier ──────────────────────────────────────────────────────
function classifyCatalyst(text: string): { type: string; impact: string } {
  if (!text) return { type: 'NONE', impact: 'NONE' }
  const t = text.toUpperCase()
  if (t.includes('CPI') || t.includes('CONSUMER PRICE'))         return { type: 'CPI',     impact: 'HIGH' }
  if (t.includes('PPI') || t.includes('PRODUCER PRICE'))         return { type: 'PPI',     impact: 'HIGH' }
  if (t.includes('NFP') || t.includes('NONFARM') || t.includes('JOBS REPORT')) return { type: 'NFP', impact: 'HIGH' }
  if (t.includes('FOMC') || t.includes('FED DECISION') || t.includes('FEDERAL RESERVE')) return { type: 'FOMC', impact: 'HIGH' }
  if (t.includes('GDP'))                                          return { type: 'GDP',     impact: 'HIGH' }
  if (t.includes('PCE'))                                          return { type: 'PCE',     impact: 'HIGH' }
  if (t.includes('RETAIL SALES'))                                 return { type: 'RETAIL',  impact: 'MED'  }
  if (t.includes('ISM') || t.includes('PMI'))                     return { type: 'ISM_PMI', impact: 'MED'  }
  if (t.includes('JOBLESS') || t.includes('UNEMPLOYMENT'))        return { type: 'JOBLESS', impact: 'MED'  }
  if (t.includes('EARNINGS') || t.includes('RESULTS'))            return { type: 'EARNINGS',impact: 'MED'  }
  if (t.includes('AUCTION') || t.includes('TREASURY'))            return { type: 'AUCTION', impact: 'LOW'  }
  if (t.match(/HIGH/))                                            return { type: 'OTHER',   impact: 'HIGH' }
  if (t.match(/MED/))                                             return { type: 'OTHER',   impact: 'MED'  }
  return { type: 'NONE', impact: 'NONE' }
}

// ── Trend day score (0-100) based on opening conditions ──────────────────────
// Higher = more likely to be a trend day
function calcTrendScore({
  gapVsImRatio, vixOpen, catalystType, newsImpact,
  openingTick, openingBreadth, priorDayType
}: {
  gapVsImRatio: number; vixOpen: number; catalystType: string; newsImpact: string
  openingTick: number | null; openingBreadth: number | null; priorDayType: string | null
}): number {
  let score = 35  // baseline — slightly below 50/50

  // Gap vs implied move ratio — most predictive single factor
  if (gapVsImRatio > 0.7)       score += 25  // gap > 70% of IM → big move expected
  else if (gapVsImRatio > 0.4)  score += 12
  else if (gapVsImRatio < 0.15) score -= 10  // tiny gap → often chops

  // VIX — negative gamma above 20 amplifies moves
  if (vixOpen > 28)      score += 20
  else if (vixOpen > 20) score += 12
  else if (vixOpen < 14) score -= 8  // low vol = compressed range

  // News catalyst — biggest single predictor of trend days
  if (newsImpact === 'HIGH')     score += 22
  else if (newsImpact === 'MED') score += 8
  else if (newsImpact === 'NONE') score -= 8  // no news → chop bias

  // Specific catalyst boosts
  if (catalystType === 'CPI' || catalystType === 'NFP') score += 8  // historically most trending
  if (catalystType === 'FOMC')                          score += 5

  // Opening TICK — sustained extreme = directional conviction
  if (openingTick !== null) {
    if (openingTick > 800 || openingTick < -800)  score += 15
    else if (openingTick > 500 || openingTick < -500) score += 8
    else if (Math.abs(openingTick) < 200)         score -= 5
  }

  // Breadth at open — sectors aligned
  if (openingBreadth !== null) {
    if (openingBreadth >= 7)      score += 12  // 7+ of 8 sectors aligned
    else if (openingBreadth >= 5) score += 5
    else if (openingBreadth <= 2) score -= 8   // mixed = chop
  }

  // Prior day context — mean reversion tendency
  if (priorDayType === 'TREND_UP' || priorDayType === 'TREND_DOWN') score -= 5
  if (priorDayType === 'CHOP') score += 5  // chop → breakout

  return Math.max(5, Math.min(95, score))
}

// ── Get SPX bars ──────────────────────────────────────────────────────────────
async function getSPXBars(from: string, to: string, multiplier = 1) {
  const res = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/${multiplier}/minute/${from}/${to}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_KEY}`,
    { signal: AbortSignal.timeout(8000) }
  )
  const d = await res.json()
  return (d.results || []) as any[]
}

function etDate(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// ── RECORD: 9:35am ────────────────────────────────────────────────────────────
async function handleRecord(req: NextRequest) {
  const today = etDate()
  const dow   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][
    new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  ]

  // Already recorded?
  const { data: existing } = await supabaseAdmin.from('gap_outcomes').select('id').eq('trading_date', today).single()
  if (existing) return NextResponse.json({ status: 'already_recorded', date: today })

  // Get yesterday and today price bars
  const from = etDate(-5), bars = await getSPXBars(from, today)
  if (!bars.length) return NextResponse.json({ error: 'No price data' }, { status: 500 })

  // Today's bars
  const todayBars = bars.filter((b: any) => {
    const bd = new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return bd === today
  }).sort((a: any, b: any) => a.t - b.t)

  // Yesterday's last bar
  const prevBars = bars.filter((b: any) => {
    const bd = new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return bd < today
  }).sort((a: any, b: any) => b.t - a.t)

  if (!todayBars.length || !prevBars.length) return NextResponse.json({ error: 'Insufficient bars' }, { status: 500 })

  const openPrice    = todayBars[0].o
  const prevClose    = prevBars[0].c
  const gapPts       = openPrice - prevClose
  const gapPct       = (gapPts / prevClose) * 100
  const gapDirection = gapPts > 5 ? 'gap up' : gapPts < -5 ? 'gap down' : 'flat'
  const gapSize      = Math.abs(gapPts)

  // VIX
  const vixRes  = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=5&apiKey=${POLYGON_KEY}`, { signal: AbortSignal.timeout(5000) })
  const vixData = await vixRes.json()
  const vixOpen = vixData.results?.[0]?.o || 18

  // TICK at open
  const tickRes  = await fetch(`https://api.polygon.io/v2/aggs/ticker/I:TICK/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=10&apiKey=${POLYGON_KEY}`, { signal: AbortSignal.timeout(5000) })
  const tickData = await tickRes.json()
  const openingTick = tickData.results?.[0]?.c || null

  // Economic calendar
  const calRes = await fetch(`${req.nextUrl.origin}/api/ai`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Economic events today ${today} US markets. HIGH and MED impact only. Format: EVENT|IMPACT|TIME_ET. One per line. Max 5. If none: NONE` }]
    })
  }).then((r: any) => r.json()).catch(() => ({ content: [] }))

  const calText = calRes.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || 'NONE'
  const { type: catalystType, impact: newsImpact } = classifyCatalyst(calText)
  const newsEvents = calText === 'NONE' ? [] : calText.split('\n')
    .filter((l: string) => l.includes('|'))
    .map((l: string) => { const [name, impact, time] = l.split('|'); return { name: name?.trim(), impact: impact?.trim(), time: time?.trim() } })

  // Get prior day type
  const { data: priorDay } = await supabaseAdmin.from('gap_outcomes')
    .select('day_type').lt('trading_date', today).order('trading_date', { ascending: false }).limit(1).single()

  // Implied move from morning plan (if available — fallback to vix-based estimate)
  const impliedMove = (vixOpen / 100) * openPrice / Math.sqrt(252) * 1.25  // rough daily IM
  const gapVsImRatio = impliedMove > 0 ? Math.abs(gapPts) / impliedMove : 0

  // Trend score prediction
  const trendScore = calcTrendScore({
    gapVsImRatio, vixOpen, catalystType, newsImpact,
    openingTick, openingBreadth: null,  // breadth added after market open
    priorDayType: priorDay?.day_type || null
  })

  const { data, error } = await supabaseAdmin.from('gap_outcomes').insert({
    trading_date:          today,
    gap_direction:         gapDirection,
    gap_size:              parseFloat(gapSize.toFixed(1)),
    gap_pct:               parseFloat(gapPct.toFixed(3)),
    prev_close:            prevClose,
    open_price:            openPrice,
    vix_open:              vixOpen,
    day_of_week:           dow,
    prior_day_type:        priorDay?.day_type || null,
    opening_tick:          openingTick,
    news_events:           newsEvents,
    news_impact:           newsImpact,
    catalyst_type:         catalystType,
    implied_move:          parseFloat(impliedMove.toFixed(1)),
    gap_vs_im_ratio:       parseFloat(gapVsImRatio.toFixed(3)),
    trend_score_predicted: trendScore,
    gap_outcome:           'PENDING',
    day_type:              'PENDING',
    created_at:            new Date().toISOString(),
  }).select('id').single()

  if (error) throw new Error(error.message)

  return NextResponse.json({
    status: 'recorded', id: data?.id, date: today,
    gap: `${gapDirection} ${gapSize.toFixed(1)}pts (${gapPct.toFixed(2)}%)`,
    catalyst: catalystType, newsImpact, vixOpen,
    trendScorePredicted: trendScore,
    interpretation: trendScore >= 65 ? 'TREND DAY LIKELY' : trendScore >= 45 ? 'MIXED — WATCH PRICE ACTION' : 'CHOP DAY LIKELY'
  })
}

// ── SCORE: 11:05am ─────────────────────────────────────────────────────────────
async function handleScore() {
  const today = etDate()
  const { data: record } = await supabaseAdmin.from('gap_outcomes')
    .select('*').eq('trading_date', today).eq('gap_outcome', 'PENDING').single()
  if (!record) return NextResponse.json({ status: 'nothing_to_score' })

  const bars = await getSPXBars(today, today)
  const morningBars = bars.filter((b: any) => {
    const bh = parseInt(new Date(b.t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
    return bh >= 9 && bh < 11
  }).sort((a: any, b: any) => a.t - b.t)

  if (morningBars.length < 10) return NextResponse.json({ status: 'insufficient_bars' })

  const openPrice  = record.open_price
  const prevClose  = record.prev_close
  const gapPts     = openPrice - prevClose
  const isGapUp    = gapPts > 0
  const highBy11   = Math.max(...morningBars.map((b: any) => b.h))
  const lowBy11    = Math.min(...morningBars.map((b: any) => b.l))
  const closeAt11  = morningBars[morningBars.length - 1]?.c || openPrice
  const ptsMoved   = closeAt11 - openPrice

  // Also get breadth at open from tick pattern
  const tickBars = morningBars.slice(0, 6)
  const avgTick  = tickBars.length ? tickBars.reduce((s: number, b: any) => s + (b.c || 0), 0) / tickBars.length : 0
  const openingBreadth = avgTick > 400 ? 7 : avgTick > 200 ? 5 : avgTick < -400 ? 1 : avgTick < -200 ? 3 : 4

  // Score gap outcome
  let gapOutcome = 'CHOPPED'
  let fillPrice = null, continuationPrice = null
  if (isGapUp) {
    if (lowBy11 <= prevClose)                     { gapOutcome = 'FILLED'; fillPrice = prevClose }
    else if (ptsMoved > Math.abs(gapPts) * 0.5)  { gapOutcome = 'CONTINUED'; continuationPrice = closeAt11 }
  } else {
    if (highBy11 >= prevClose)                    { gapOutcome = 'FILLED'; fillPrice = prevClose }
    else if (ptsMoved < -Math.abs(gapPts) * 0.5) { gapOutcome = 'CONTINUED'; continuationPrice = closeAt11 }
  }

  // Recalculate trend score now that we have breadth data
  const trendScore = calcTrendScore({
    gapVsImRatio:    record.gap_vs_im_ratio || 0,
    vixOpen:         record.vix_open || 18,
    catalystType:    record.catalyst_type || 'NONE',
    newsImpact:      record.news_impact || 'NONE',
    openingTick:     record.opening_tick,
    openingBreadth,
    priorDayType:    record.prior_day_type,
  })

  await supabaseAdmin.from('gap_outcomes').update({
    gap_outcome:           gapOutcome,
    fill_price:            fillPrice,
    continuation_price:    continuationPrice,
    pts_moved_by_11am:     parseFloat(ptsMoved.toFixed(1)),
    opening_breadth_score: openingBreadth,
    trend_score_predicted: trendScore,  // updated with breadth
    outcome_time:          new Date().toISOString(),
  }).eq('id', record.id)

  return NextResponse.json({ status: 'scored', gapOutcome, ptsMoved: ptsMoved.toFixed(1), trendScore, date: today })
}

// ── EOD: 4:05pm — score full day type ─────────────────────────────────────────
async function handleEOD() {
  const today = etDate()
  const { data: record } = await supabaseAdmin.from('gap_outcomes')
    .select('*').eq('trading_date', today).eq('day_type', 'PENDING').single()
  if (!record) return NextResponse.json({ status: 'nothing_to_score' })

  const bars = await getSPXBars(today, today)
  if (bars.length < 20) return NextResponse.json({ status: 'insufficient_bars' })

  const openPrice  = record.open_price
  const closePrice = bars[bars.length - 1]?.c || openPrice
  const highOfDay  = Math.max(...bars.map((b: any) => b.h))
  const lowOfDay   = Math.min(...bars.map((b: any) => b.l))
  const rangeDay   = highOfDay - lowOfDay
  const closeVsOpen = closePrice - openPrice

  // Day type classification
  // Trend day: closes in top/bottom 20% of range AND moved > 50% of range in one direction
  const closePosition = (closePrice - lowOfDay) / rangeDay  // 0=at low, 1=at high
  let dayType = 'CHOP'

  if (closePosition > 0.80 && closeVsOpen > rangeDay * 0.5) {
    dayType = 'TREND_UP'
  } else if (closePosition < 0.20 && closeVsOpen < -rangeDay * 0.5) {
    dayType = 'TREND_DOWN'
  } else if (Math.abs(closeVsOpen) > rangeDay * 0.4) {
    // Moved significantly but didn't close at extreme — reversal day
    dayType = 'REVERSAL'
  }
  // else CHOP — stayed in middle of range

  // Was trend prediction correct?
  const wasTrendPredicted = (record.trend_score_predicted || 50) >= 55
  const wasActuallyTrend  = dayType === 'TREND_UP' || dayType === 'TREND_DOWN'
  const trendConfirmed    = wasTrendPredicted === wasActuallyTrend

  await supabaseAdmin.from('gap_outcomes').update({
    day_type:         dayType,
    day_range_pts:    parseFloat(rangeDay.toFixed(1)),
    close_price:      closePrice,
    close_vs_open_pts: parseFloat(closeVsOpen.toFixed(1)),
    trend_confirmed:  trendConfirmed,
    eod_time:         new Date().toISOString(),
  }).eq('id', record.id)

  return NextResponse.json({ status: 'eod_scored', dayType, rangeDay: rangeDay.toFixed(1), closeVsOpen: closeVsOpen.toFixed(1), trendConfirmed, date: today })
}

// ── PREDICT: trend day probability for today ───────────────────────────────────
async function handlePredict() {
  const today = etDate()
  const { data: record } = await supabaseAdmin.from('gap_outcomes').select('*').eq('trading_date', today).single()
  if (!record) return NextResponse.json({ status: 'not_recorded_yet' })

  // Get historical accuracy of trend prediction at similar score levels
  const score  = record.trend_score_predicted || 50
  const scoreMin = score - 15, scoreMax = score + 15

  const { data: historical } = await supabaseAdmin.from('gap_outcomes')
    .select('trend_score_predicted, day_type, catalyst_type, trend_confirmed')
    .neq('day_type', 'PENDING')
    .gte('trend_score_predicted', scoreMin)
    .lte('trend_score_predicted', scoreMax)
    .limit(60)

  const total      = historical?.length || 0
  const trendDays  = historical?.filter((r: any) => r.day_type === 'TREND_UP' || r.day_type === 'TREND_DOWN').length || 0
  const chopDays   = historical?.filter((r: any) => r.day_type === 'CHOP').length || 0
  const reversals  = historical?.filter((r: any) => r.day_type === 'REVERSAL').length || 0

  const trendPct   = total >= 5 ? Math.round(trendDays / total * 100) : null
  const chopPct    = total >= 5 ? Math.round(chopDays / total * 100) : null

  return NextResponse.json({
    date:               today,
    trendScorePredicted: score,
    interpretation:     score >= 65 ? 'TREND DAY LIKELY' : score >= 50 ? 'MIXED — WATCH OPEN' : 'CHOP BIAS',
    confidence:         score >= 70 || score <= 30 ? 'HIGH' : score >= 60 || score <= 40 ? 'MODERATE' : 'LOW',
    catalyst:           record.catalyst_type,
    newsImpact:         record.news_impact,
    vixOpen:            record.vix_open,
    gapDirection:       record.gap_direction,
    gapVsImRatio:       record.gap_vs_im_ratio,
    historicalMatch: total >= 5 ? {
      count:    total,
      trendPct, chopPct,
      reversalPct: Math.round(reversals / total * 100),
      note: `On similar days (score ${scoreMin}-${scoreMax}), ${trendDays}/${total} were trend days`
    } : { count: total, note: 'Not enough historical data yet — building observations' },
    drivers: [
      record.news_impact === 'HIGH' ? `High-impact news (${record.catalyst_type}) — strong trend bias` : null,
      record.vix_open > 20 ? `VIX ${record.vix_open?.toFixed(1)} — negative gamma amplifies moves` : null,
      record.gap_vs_im_ratio > 0.5 ? `Gap is ${(record.gap_vs_im_ratio * 100).toFixed(0)}% of implied move — directional pressure` : null,
      record.gap_vs_im_ratio < 0.15 ? 'Small gap relative to implied move — chop likely until catalyst' : null,
      record.opening_tick && Math.abs(record.opening_tick) > 600 ? `Opening TICK ${record.opening_tick > 0 ? '+' : ''}${record.opening_tick} — strong directional conviction` : null,
      record.prior_day_type === 'CHOP' ? 'Prior day was chop — breakout setup' : null,
      record.prior_day_type === 'TREND_UP' || record.prior_day_type === 'TREND_DOWN' ? 'Prior day trended — mean reversion possible' : null,
    ].filter(Boolean)
  })
}

// ── STATS ──────────────────────────────────────────────────────────────────────
async function handleStats(req: NextRequest) {
  const gapDir     = req.nextUrl.searchParams.get('gap_direction') || ''
  const catalyst   = req.nextUrl.searchParams.get('catalyst') || ''
  const newsImpact = req.nextUrl.searchParams.get('news_impact') || ''
  const days       = parseInt(req.nextUrl.searchParams.get('days') || '90')
  const from       = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  let query = supabaseAdmin.from('gap_outcomes')
    .select('gap_outcome, day_type, catalyst_type, news_impact, gap_size, vix_open, day_of_week, pts_moved_by_11am, trend_score_predicted, trend_confirmed, gap_vs_im_ratio')
    .neq('gap_outcome', 'PENDING')
    .gte('trading_date', from)

  if (gapDir)     query = query.eq('gap_direction', gapDir)
  if (catalyst)   query = query.eq('catalyst_type', catalyst)
  if (newsImpact) query = query.eq('news_impact', newsImpact)

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  if (!rows?.length) return NextResponse.json({ status: 'insufficient_data', count: 0 })

  const total        = rows.length
  const filled       = rows.filter((r: any) => r.gap_outcome === 'FILLED').length
  const continued    = rows.filter((r: any) => r.gap_outcome === 'CONTINUED').length
  const chopped      = rows.filter((r: any) => r.gap_outcome === 'CHOPPED').length
  const trendDays    = rows.filter((r: any) => r.day_type === 'TREND_UP' || r.day_type === 'TREND_DOWN').length
  const chopDays     = rows.filter((r: any) => r.day_type === 'CHOP').length
  const reversals    = rows.filter((r: any) => r.day_type === 'REVERSAL').length
  const confirmed    = rows.filter((r: any) => r.trend_confirmed === true).length
  const avgPts       = rows.reduce((s: number, r: any) => s + (r.pts_moved_by_11am || 0), 0) / total

  // By catalyst breakdown
  const byCatalyst: Record<string, any> = {}
  rows.forEach((r: any) => {
    const c = r.catalyst_type || 'NONE'
    if (!byCatalyst[c]) byCatalyst[c] = { total: 0, filled: 0, continued: 0, chopped: 0, trendDays: 0, chopDays: 0 }
    byCatalyst[c].total++
    if (r.gap_outcome) byCatalyst[c][r.gap_outcome.toLowerCase()] = (byCatalyst[c][r.gap_outcome.toLowerCase()] || 0) + 1
    if (r.day_type === 'TREND_UP' || r.day_type === 'TREND_DOWN') byCatalyst[c].trendDays++
    if (r.day_type === 'CHOP') byCatalyst[c].chopDays++
  })

  return NextResponse.json({
    status: 'ok', count: total,
    gapStats: {
      fillRate:     Math.round(filled / total * 100),
      continueRate: Math.round(continued / total * 100),
      chopRate:     Math.round(chopped / total * 100),
      avgPts:       parseFloat(avgPts.toFixed(1)),
    },
    dayTypeStats: {
      trendRate:    Math.round(trendDays / total * 100),
      chopRate:     Math.round(chopDays / total * 100),
      reversalRate: Math.round(reversals / total * 100),
      predictionAccuracy: total > 0 ? Math.round(confirmed / total * 100) : null,
    },
    byCatalyst,
    filters: { gapDir, catalyst, newsImpact, days },
    note: total < 20 ? 'Building data — probabilities improve with more observations' : null
  })
}

// ── Router ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'stats'
  try {
    if (action === 'record')  return await handleRecord(req)
    if (action === 'score')   return await handleScore()
    if (action === 'eod')     return await handleEOD()
    if (action === 'predict') return await handlePredict()
    if (action === 'stats')   return await handleStats(req)
    if (action === 'today') {
      const today = etDate()
      const { data } = await supabaseAdmin.from('gap_outcomes').select('*').eq('trading_date', today).single()
      return NextResponse.json(data || { status: 'not_recorded' })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('[gap-outcomes]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
