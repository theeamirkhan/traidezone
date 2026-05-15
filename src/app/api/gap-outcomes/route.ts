/**
 * /api/gap-outcomes — Gap behavior tracking and historical probability engine
 *
 * GET  ?action=record   — Record today's gap conditions (9:35am cron)
 * GET  ?action=score    — Score today's outcome (11:05am cron)
 * GET  ?action=stats    — Query historical fill/continuation rates
 * GET  ?action=today    — Get today's recorded gap data
 *
 * The stats endpoint replaces static heuristics in calcProbabilities with
 * real historical rates filtered by matching conditions.
 *
 * Supabase table: gap_outcomes
 *   id, trading_date, gap_direction, gap_size, gap_pct, implied_move,
 *   vix_open, day_of_week, prior_day_type,
 *   news_events (jsonb), news_impact (HIGH/MED/LOW/NONE),
 *   catalyst_type (CPI/NFP/FOMC/EARNINGS/OTHER/NONE),
 *   open_price, fill_price, continuation_price,
 *   outcome (FILLED/CONTINUED/CHOPPED/PENDING),
 *   outcome_time, pts_moved_by_11am,
 *   created_at
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const POLYGON_KEY = process.env.POLYGON_API_KEY

// Classify catalyst from economic calendar text
function classifyCatalyst(calendarText: string): { type: string; impact: string } {
  if (!calendarText) return { type: 'NONE', impact: 'NONE' }
  const text = calendarText.toUpperCase()
  if (text.includes('CPI') || text.includes('CONSUMER PRICE'))   return { type: 'CPI',      impact: 'HIGH' }
  if (text.includes('PPI') || text.includes('PRODUCER PRICE'))   return { type: 'PPI',      impact: 'HIGH' }
  if (text.includes('NFP') || text.includes('NONFARM') || text.includes('JOBS REPORT')) return { type: 'NFP', impact: 'HIGH' }
  if (text.includes('FOMC') || text.includes('FED DECISION') || text.includes('FEDERAL RESERVE')) return { type: 'FOMC', impact: 'HIGH' }
  if (text.includes('GDP'))                                       return { type: 'GDP',      impact: 'HIGH' }
  if (text.includes('PCE'))                                       return { type: 'PCE',      impact: 'HIGH' }
  if (text.includes('RETAIL SALES'))                              return { type: 'RETAIL',   impact: 'MED'  }
  if (text.includes('ISM') || text.includes('PMI'))               return { type: 'ISM_PMI',  impact: 'MED'  }
  if (text.includes('JOBLESS') || text.includes('UNEMPLOYMENT'))  return { type: 'JOBLESS',  impact: 'MED'  }
  if (text.includes('EARNINGS') || text.includes('RESULTS'))      return { type: 'EARNINGS', impact: 'MED'  }
  if (text.includes('AUCTION') || text.includes('TREASURY'))      return { type: 'AUCTION',  impact: 'LOW'  }
  if (text.match(/HIGH/))                                          return { type: 'OTHER',    impact: 'HIGH' }
  if (text.match(/MED/))                                           return { type: 'OTHER',    impact: 'MED'  }
  return { type: 'NONE', impact: 'NONE' }
}

async function getSPXData() {
  const today = new Date().toISOString().split('T')[0]
  const from  = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]
  const res = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/minute/${from}/${today}?adjusted=true&sort=asc&limit=50&apiKey=${POLYGON_KEY}`,
    { signal: AbortSignal.timeout(8000) }
  )
  const d = await res.json()
  return d.results || []
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'stats'

  // ── RECORD: capture today's gap at 9:35am ─────────────────────────────────
  if (action === 'record') {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const dow   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]

      // Check if already recorded today
      const { data: existing } = await supabaseAdmin
        .from('gap_outcomes')
        .select('id')
        .eq('trading_date', today)
        .single()
      if (existing) return NextResponse.json({ status: 'already_recorded', date: today })

      // Get SPX price data
      const bars = await getSPXData()
      if (!bars.length) return NextResponse.json({ error: 'No price data' }, { status: 500 })

      // Find yesterday's close and today's open
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const todayOpen = bars.filter((b: any) => {
        const bt = new Date(b.t)
        const bDate = bt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        const bHour = bt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
        return bDate === today && parseInt(bHour) === 9
      }).sort((a: any, b: any) => a.t - b.t)[0]

      const prevClose = bars.filter((b: any) => {
        const bDate = new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        return bDate < today
      }).sort((a: any, b: any) => b.t - a.t)[0]

      if (!todayOpen || !prevClose) return NextResponse.json({ error: 'Insufficient price data' }, { status: 500 })

      const openPrice = todayOpen.o
      const prevClosePrice = prevClose.c
      const gapPts = openPrice - prevClosePrice
      const gapPct = (gapPts / prevClosePrice) * 100
      const gapDirection = gapPts > 5 ? 'gap up' : gapPts < -5 ? 'gap down' : 'flat'
      const gapSize = Math.abs(gapPts).toFixed(1)

      // Get VIX
      const vixRes = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/I:VIX/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=5&apiKey=${POLYGON_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const vixData = await vixRes.json()
      const vixOpen = vixData.results?.[0]?.o || null

      // Get economic calendar (web search via AI)
      const calRes = await fetch(`${req.nextUrl.origin}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Economic events today ${today} US markets. List HIGH and MED impact events only. Format: EVENT_NAME|IMPACT|TIME_ET. One per line. Max 5 events. If none: NONE` }]
        })
      }).then(r => r.json()).catch(() => ({ content: [] }))

      const calText = calRes.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || 'NONE'
      const { type: catalystType, impact: newsImpact } = classifyCatalyst(calText)

      // Parse news events into structured array
      const newsEvents = calText === 'NONE' ? [] : calText.split('\n')
        .filter((l: string) => l.includes('|'))
        .map((l: string) => {
          const [name, impact, time] = l.split('|')
          return { name: name?.trim(), impact: impact?.trim(), time: time?.trim() }
        })

      // Insert record
      const { data, error } = await supabaseAdmin.from('gap_outcomes').insert({
        trading_date:       today,
        gap_direction:      gapDirection,
        gap_size:           parseFloat(gapSize),
        gap_pct:            parseFloat(gapPct.toFixed(3)),
        vix_open:           vixOpen,
        day_of_week:        dow,
        open_price:         openPrice,
        prev_close:         prevClosePrice,
        news_events:        newsEvents,
        news_impact:        newsImpact,
        catalyst_type:      catalystType,
        outcome:            'PENDING',
        created_at:         new Date().toISOString(),
      }).select('id').single()

      if (error) throw new Error(error.message)
      return NextResponse.json({
        status: 'recorded', id: data?.id, date: today,
        gap: `${gapDirection} ${gapSize}pts (${gapPct.toFixed(2)}%)`,
        catalyst: catalystType, newsImpact, vixOpen
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── SCORE: determine outcome at 11:05am ────────────────────────────────────
  if (action === 'score') {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const { data: record } = await supabaseAdmin
        .from('gap_outcomes')
        .select('*')
        .eq('trading_date', today)
        .eq('outcome', 'PENDING')
        .single()

      if (!record) return NextResponse.json({ status: 'nothing_to_score' })

      // Get price action from open to 11am
      const bars = await getSPXData()
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const morningBars = bars.filter((b: any) => {
        const bt = new Date(b.t)
        const bDate = bt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        const bHour = parseInt(bt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
        return bDate === today && bHour >= 9 && bHour < 11
      }).sort((a: any, b: any) => a.t - b.t)

      if (morningBars.length < 10) return NextResponse.json({ status: 'insufficient_bars' })

      const openPrice   = record.open_price
      const prevClose   = record.prev_close
      const gapPts      = openPrice - prevClose
      const isGapUp     = gapPts > 0
      const fillLevel   = prevClose  // gap fills when price returns to prev close
      const highBy11    = Math.max(...morningBars.map((b: any) => b.h))
      const lowBy11     = Math.min(...morningBars.map((b: any) => b.l))
      const closeAt11   = morningBars[morningBars.length - 1]?.c || openPrice
      const ptsMoved    = closeAt11 - openPrice

      let outcome = 'CHOPPED'
      let fillPrice = null
      let continuationPrice = null

      if (isGapUp) {
        // Gap filled if price dropped back to prev close
        if (lowBy11 <= fillLevel) {
          outcome = 'FILLED'
          fillPrice = fillLevel
        } else if (ptsMoved > Math.abs(gapPts) * 0.5) {
          outcome = 'CONTINUED'
          continuationPrice = closeAt11
        }
      } else {
        // Gap down: filled if price rallied back to prev close
        if (highBy11 >= fillLevel) {
          outcome = 'FILLED'
          fillPrice = fillLevel
        } else if (ptsMoved < -Math.abs(gapPts) * 0.5) {
          outcome = 'CONTINUED'
          continuationPrice = closeAt11
        }
      }

      await supabaseAdmin.from('gap_outcomes').update({
        outcome,
        fill_price:           fillPrice,
        continuation_price:   continuationPrice,
        pts_moved_by_11am:    parseFloat(ptsMoved.toFixed(1)),
        outcome_time:         new Date().toISOString(),
      }).eq('id', record.id)

      return NextResponse.json({ status: 'scored', outcome, ptsMoved: ptsMoved.toFixed(1), date: today })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── STATS: historical fill/continuation rates for probability engine ───────
  if (action === 'stats') {
    try {
      const gapDir      = req.nextUrl.searchParams.get('gap_direction') || ''
      const catalyst    = req.nextUrl.searchParams.get('catalyst') || ''
      const newsImpact  = req.nextUrl.searchParams.get('news_impact') || ''
      const days        = parseInt(req.nextUrl.searchParams.get('days') || '90')

      const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

      let query = supabaseAdmin
        .from('gap_outcomes')
        .select('outcome, gap_direction, catalyst_type, news_impact, gap_size, vix_open, day_of_week, pts_moved_by_11am')
        .neq('outcome', 'PENDING')
        .gte('trading_date', from)

      if (gapDir)     query = query.eq('gap_direction', gapDir)
      if (catalyst)   query = query.eq('catalyst_type', catalyst)
      if (newsImpact) query = query.eq('news_impact', newsImpact)

      const { data: rows, error } = await query
      if (error) throw new Error(error.message)
      if (!rows?.length) return NextResponse.json({ status: 'insufficient_data', count: 0 })

      const total        = rows.length
      const filled       = rows.filter(r => r.outcome === 'FILLED').length
      const continued    = rows.filter(r => r.outcome === 'CONTINUED').length
      const chopped      = rows.filter(r => r.outcome === 'CHOPPED').length
      const fillRate     = Math.round(filled / total * 100)
      const continueRate = Math.round(continued / total * 100)
      const chopRate     = Math.round(chopped / total * 100)
      const avgPts       = rows.reduce((s, r) => s + (r.pts_moved_by_11am || 0), 0) / total

      // Breakdown by catalyst
      const byCatalyst: Record<string, any> = {}
      rows.forEach(r => {
        const c = r.catalyst_type || 'NONE'
        if (!byCatalyst[c]) byCatalyst[c] = { total: 0, filled: 0, continued: 0, chopped: 0 }
        byCatalyst[c].total++
        byCatalyst[c][r.outcome.toLowerCase()]++
      })

      return NextResponse.json({
        status:       'ok',
        count:        total,
        fillRate,
        continueRate,
        chopRate,
        avgPts:       parseFloat(avgPts.toFixed(1)),
        byCatalyst,
        filters:      { gapDir, catalyst, newsImpact, days },
        note:         total < 20 ? 'Limited data — probabilities will improve with more observations' : null
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── TODAY: get today's gap record ─────────────────────────────────────────
  if (action === 'today') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const { data } = await supabaseAdmin
      .from('gap_outcomes')
      .select('*')
      .eq('trading_date', today)
      .single()
    return NextResponse.json(data || { status: 'not_recorded' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
