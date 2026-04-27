/**
 * utils.ts — pure utility functions (no React, no fetch)
 * Extracted from page.tsx for clarity and testability
 */

export function getEST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

export function fmt(p: number | null | undefined): string {
  if (!p) return '—'
  return parseFloat(String(p)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function calcVWAP(candles: any[]) {
  let cumTPV = 0, cumVol = 0
  return candles.map(c => {
    const tp = (c.h + c.l + c.c) / 3
    cumTPV += tp * (c.v || 1)
    cumVol += (c.v || 1)
    return cumTPV / cumVol
  })
}

export function calcEMA(candles: any[], period: number) {
  if (candles.length < period) return candles.map(() => null)
  const k = 2 / (period + 1)
  const result: (number | null)[] = candles.map(() => null)
  let ema = candles.slice(0, period).reduce((s: number, c: any) => s + c.c, 0) / period
  result[period - 1] = ema
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

export interface ProbResult {
  reversal: number; continuation: number; chop: number
  dominant: string; dominantColor: string; confidence: string; hasData: boolean
}

export function calcProbabilities({ bias, gapDirection, gapSize, impliedMove, vixPrice, tiingoContext }: {
  bias: string; gapDirection: string; gapSize: string
  impliedMove: string; vixPrice: number | null; tiingoContext: any
}): ProbResult {
  const gap = parseFloat(gapSize) || 0
  const im  = parseFloat(impliedMove) || 0
  const vix = vixPrice || 18

  let reversal = 38, continuation = 40, chop = 22

  if (gapDirection === 'gap up')   { reversal += 8; continuation -= 5; chop -= 3 }
  else if (gapDirection === 'gap down') { reversal += 4; continuation += 2; chop -= 6 }

  if (gap > 0 && im > 0) {
    const r = gap / im
    if (r > 0.6)      { reversal += 12; continuation -= 8; chop -= 4 }
    else if (r > 0.3) { reversal +=  5; continuation -= 3; chop -= 2 }
    else if (gap < 10){ reversal -=  5; chop += 8; continuation -= 3 }
  }

  if      (bias === 'long'  && gapDirection === 'gap up')   { continuation +=  8; reversal -= 5; chop -= 3 }
  else if (bias === 'short' && gapDirection === 'gap down') { continuation +=  8; reversal -= 5; chop -= 3 }
  else if (bias === 'long'  && gapDirection === 'gap down') { reversal += 10; continuation -= 8; chop -= 2 }
  else if (bias === 'short' && gapDirection === 'gap up')   { reversal += 10; continuation -= 8; chop -= 2 }
  else if (bias === 'neutral') { chop += 8; reversal -= 4; continuation -= 4 }

  if      (vix > 30) { reversal += 8; chop += 5; continuation -= 13 }
  else if (vix > 22) { reversal += 4; chop += 2; continuation -= 6  }
  else if (vix < 14) { continuation += 6; chop += 3; reversal -= 9  }

  if (tiingoContext?.gapFillRate && tiingoContext?.continueRate) {
    const hf = parseFloat(tiingoContext.gapFillRate)
    const hc = parseFloat(tiingoContext.continueRate)
    reversal     = Math.round(reversal * 0.6     + hf * 0.4)
    continuation = Math.round(continuation * 0.6 + hc * 0.4)
    chop         = Math.round(chop * 0.6 + Math.max(100 - hf - hc, 5) * 0.4)
  }

  const total = reversal + continuation + chop
  reversal     = Math.round(reversal / total * 100)
  continuation = Math.round(continuation / total * 100)
  chop         = 100 - reversal - continuation

  const max      = Math.max(reversal, continuation, chop)
  const dominant = max === reversal ? 'REVERSAL' : max === continuation ? 'CONTINUATION' : 'CHOP'
  const dominantColor = dominant === 'REVERSAL' ? '#ff4d6d' : dominant === 'CONTINUATION' ? '#00d4a0' : '#f59e0b'
  const confidence    = max >= 55 ? 'HIGH' : max >= 45 ? 'MODERATE' : 'LOW'

  return { reversal, continuation, chop, dominant, dominantColor, confidence, hasData: !!(bias || gap || im) }
}

export const CHECKLIST = [
  { id: 'timing1', category: 'TIMING',       label: 'After 10:00 AM EST' },
  { id: 'timing2', category: 'TIMING',       label: 'Intraday high/low established' },
  { id: 'conf1',   category: 'CONFLUENCE',   label: 'Price at key level' },
  { id: 'conf2',   category: 'CONFLUENCE',   label: 'VWAP aligned with bias' },
  { id: 'conf3',   category: 'CONFLUENCE',   label: '200 EMA aligned with bias' },
  { id: 'conf4',   category: 'CONFLUENCE',   label: 'SPY/ES confirming direction' },
  { id: 'conf5',   category: 'CONFLUENCE',   label: 'VIX not spiking (< 25)' },
  { id: 'conf6',   category: 'CONFLUENCE',   label: 'Sector breadth aligned' },
  { id: 'risk1',   category: 'RISK',         label: 'Stop level defined' },
  { id: 'risk2',   category: 'RISK',         label: 'Max daily loss not hit' },
  { id: 'risk3',   category: 'RISK',         label: 'Not averaging into loser' },
  { id: 'system1', category: 'SYSTEM',       label: 'Matches morning plan bias' },
  { id: 'system2', category: 'SYSTEM',       label: 'Matches active playbook' },
]
