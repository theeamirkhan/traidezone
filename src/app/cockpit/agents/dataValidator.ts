/**
 * dataValidator.ts — Data Validation Agent
 *
 * Runs before every AI signal call inside buildContext.ts.
 * Compares useMarketData output against Yahoo Finance (free, no key required).
 *
 * If drift is detected:
 *  1. Blocks the AI call (returns isValid: false)
 *  2. Adds specific warnings to the context (shown in signal output)
 *  3. Logs to console for the Error Monitoring Agent to pick up
 *
 * Architecture:
 *  buildSignalContext() → validateWithAgent() → [block or pass]
 *
 * Future: add Slack/email webhook alerts when drift exceeds threshold
 */

export interface ValidationResult {
  isValid:     boolean
  priceOk:     boolean
  vwapOk:      boolean
  vixOk:       boolean
  warnings:    string[]
  refPrice:    number | null
  refVix:      number | null
  drift:       { price: number | null; vix: number | null }
}

// ── Thresholds ────────────────────────────────────────────────────────────────
const PRICE_DRIFT_BLOCK  = 0.010  // >1.0% → block signal, data unreliable
const PRICE_DRIFT_WARN   = 0.003  // >0.3% → warn but allow
const VIX_DRIFT_WARN     = 1.5    // >1.5 pts → warn
const CACHE_MS           = 60_000 // cache ref price for 60s (avoid spamming Yahoo)

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache: { price: number; vix: number; at: number } | null = null

async function fetchReferencePrice(): Promise<{ price: number; vix: number } | null> {
  // Use cached value if fresh
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { price: cache.price, vix: cache.vix }
  }

  try {
    // Yahoo Finance — free, no API key, CORS-allowed via our proxy
    const [spxRes, vixRes] = await Promise.all([
      fetch('/api/reference-price?symbol=%5EGSPC', { signal: AbortSignal.timeout(5000) }),
      fetch('/api/reference-price?symbol=%5EVIX',  { signal: AbortSignal.timeout(5000) }),
    ])

    if (!spxRes.ok || !vixRes.ok) return null

    const [spxData, vixData] = await Promise.all([spxRes.json(), vixRes.json()])

    const price = spxData?.price
    const vix   = vixData?.price

    if (!price || price < 5000 || price > 12000) return null
    if (!vix   || vix   < 5    || vix   > 100)   return null

    cache = { price, vix, at: Date.now() }
    return { price, vix }

  } catch (e) {
    console.warn('[DataValidator] reference fetch failed:', e)
    return null
  }
}

// ── Main validation function ──────────────────────────────────────────────────
export async function validateMarketData(
  appPrice: number | null,
  appVwap:  number | null,
  appVix:   number | null,
): Promise<ValidationResult> {
  const warnings: string[] = []

  // Step 1: basic sanity checks (no network needed)
  if (!appPrice || appPrice < 5000 || appPrice > 12000) {
    return {
      isValid: false, priceOk: false, vwapOk: true, vixOk: true,
      warnings: ['SPX price missing or out of valid range (5000–12000)'],
      refPrice: null, refVix: null, drift: { price: null, vix: null }
    }
  }

  if (appVwap && Math.abs(appVwap - appPrice) / appPrice > 0.05) {
    warnings.push(`VWAP ${appVwap.toFixed(0)} is >5% from SPX ${appPrice.toFixed(0)} — likely stale`)
  }

  // Step 2: cross-check against Yahoo Finance reference
  const ref = await fetchReferencePrice()

  if (!ref) {
    // Can't reach reference — warn but don't block (reference could be down)
    console.warn('[DataValidator] Could not fetch reference price — proceeding without cross-check')
    return {
      isValid: true, priceOk: true, vwapOk: true, vixOk: true,
      warnings: [...warnings, 'Reference price unavailable — data not cross-checked'],
      refPrice: null, refVix: null, drift: { price: null, vix: null }
    }
  }

  const priceDrift = Math.abs(appPrice - ref.price) / ref.price
  const vixDrift   = appVix ? Math.abs(appVix - ref.vix) : 0

  const priceOk = priceDrift < PRICE_DRIFT_BLOCK
  const vixOk   = vixDrift < VIX_DRIFT_WARN

  // Price warnings
  if (priceDrift >= PRICE_DRIFT_BLOCK) {
    const msg = `⛔ PRICE DRIFT ${(priceDrift * 100).toFixed(2)}%: app=${appPrice.toFixed(2)} ref=${ref.price.toFixed(2)} — SIGNAL BLOCKED`
    warnings.push(msg)
    console.error('[DataValidator]', msg)
  } else if (priceDrift >= PRICE_DRIFT_WARN) {
    const msg = `⚠ Price drift ${(priceDrift * 100).toFixed(2)}%: app=${appPrice.toFixed(2)} ref=${ref.price.toFixed(2)}`
    warnings.push(msg)
    console.warn('[DataValidator]', msg)
  }

  // VIX warnings
  if (!vixOk && appVix) {
    const msg = `⚠ VIX drift ${vixDrift.toFixed(1)}pts: app=${appVix.toFixed(2)} ref=${ref.vix.toFixed(2)}`
    warnings.push(msg)
    console.warn('[DataValidator]', msg)
  }

  return {
    isValid:  priceOk,
    priceOk,
    vwapOk:   !warnings.some(w => w.includes('VWAP')),
    vixOk,
    warnings,
    refPrice: ref.price,
    refVix:   ref.vix,
    drift: {
      price: priceDrift,
      vix:   vixDrift,
    }
  }
}
