/**
 * /api/gex — Dealer Gamma Exposure via FlashAlpha API
 *
 * Uses FlashAlpha free tier (5 req/day) — GEX updates EOD so once/day is enough.
 * SPY on free tier. SPX requires Basic ($79/mo).
 *
 * Returns: gamma_flip, call_wall, put_wall, net_gex, regime, AI context string.
 * Cached daily — fetch once pre-market, use all day.
 *
 * Env var: FLASHALPHA_API_KEY
 * Sign up free at: flashalpha.com (no credit card, 30 seconds)
 */


import { NextRequest, NextResponse } from 'next/server'


const FA_BASE = 'https://lab.flashalpha.com'


// In-memory daily cache
let gexCache:    { data: GexResult; date: string } | null = null
let levelsCache: { data: any; date: string } | null = null


interface GexResult {
  symbol:      string
  gammaFlip:   number | null
  callWall:    number | null
  putWall:     number | null
  netGex:      number | null
  regime:      'positive' | 'negative' | 'neutral' | 'unknown'
  source:      string
  aiContext:   string
  updatedAt:   string
}


async function fetchFlashAlpha(path: string): Promise<any> {
  const FA_KEY = process.env.FLASHALPHA_API_KEY
  if (!FA_KEY) throw new Error('FLASHALPHA_API_KEY not configured')
