/**
 * /api/email-diagnostic — Tests Resend setup and reports what's wrong
 *
 * GET this endpoint to:
 *   1. Verify RESEND_API_KEY is set
 *   2. List recent email_logs entries (did emails actually try to send?)
 *   3. Show last successful + failed entries with timestamps
 *   4. Send a test email and return the full Resend response
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_EMAIL = 'theeamirkhan@gmail.com'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'check'

  // Get current time in ET to show what schedule should have fired
  const etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const nowET = etFmt.format(new Date())
  const nowUTC = new Date().toISOString()

  const result: any = {
    timestamp_utc: nowUTC,
    timestamp_et: nowET,
    env: {
      RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
      RESEND_API_KEY_LENGTH: process.env.RESEND_API_KEY?.length || 0,
      RESEND_API_KEY_STARTS_WITH: process.env.RESEND_API_KEY?.slice(0, 6) || 'none',
      CRON_SECRET_SET: !!process.env.CRON_SECRET,
      VERCEL_URL: process.env.VERCEL_URL || 'unknown',
      VERCEL_ENV: process.env.VERCEL_ENV || 'unknown',
      VERCEL_REGION: process.env.VERCEL_REGION || 'unknown',
    },
  }

  // ── 1. Pull ALL email_logs entries (last 50) ─────────────────────────
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('email_logs')
      .select('type, recipient, subject, status, resend_id, sent_at')
      .order('sent_at', { ascending: false })
      .limit(50)

    if (error) {
      result.email_logs_error = error.message
    } else {
      result.recent_email_logs = logs || []
      result.total_logs_count = (logs || []).length
      result.morning_brief_attempts = (logs || []).filter(l => l.type === 'morning_brief').length
      result.morning_brief_sent = (logs || []).filter(l => l.type === 'morning_brief' && l.status === 'sent').length
      result.morning_brief_errors_array = (logs || []).filter(l => l.type === 'morning_brief' && l.status !== 'sent')
      result.daily_recap_attempts = (logs || []).filter(l => l.type === 'daily_recap').length
      result.daily_recap_sent = (logs || []).filter(l => l.type === 'daily_recap' && l.status === 'sent').length
      result.last_morning_brief = (logs || []).find(l => l.type === 'morning_brief')
      result.last_daily_recap = (logs || []).find(l => l.type === 'daily_recap')
      result.last_any_send = (logs || []).find(l => l.status === 'sent')
    }
  } catch (e: any) {
    result.email_logs_error = e.message
  }

  // ── 2. Try to fire morning email manually (no auth on that endpoint) ──
  if (action === 'fire-morning') {
    try {
      const morningUrl = `https://traidezone.ai/api/agents/send-morning-email?force=true`
      const fireRes = await fetch(morningUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(55000),
      })
      const fireData = await fireRes.json().catch(() => ({}))
      result.fire_morning = {
        status: fireRes.status,
        url: morningUrl,
        response: fireData,
      }
    } catch (e: any) {
      result.fire_morning = { error: e.message }
    }
  }

  // ── 3. Try to fire daily recap manually ──────────────────────────────
  if (action === 'fire-recap') {
    try {
      const recapUrl = `https://traidezone.ai/api/agents/daily-recap?force=true`
      const fireRes = await fetch(recapUrl, {
        method: 'POST',
        headers: { 'x-vercel-cron': '1' },  // bypass auth check
        signal: AbortSignal.timeout(55000),
      })
      const fireData = await fireRes.json().catch(() => ({}))
      result.fire_recap = {
        status: fireRes.status,
        url: recapUrl,
        response: fireData,
      }
    } catch (e: any) {
      result.fire_recap = { error: e.message }
    }
  }

  // ── 4. Send a test email ─────────────────────────────────────────────
  if (action === 'send' && process.env.RESEND_API_KEY) {
    try {
      const testHtml = `<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#f5f7fa;">
        <h2 style="color:#00e5ff;">trAIde Zone — Email Diagnostic Test</h2>
        <p>If you received this email, Resend works.</p>
        <p><strong>Sent at:</strong> ${nowET} ET</p>
        <p><strong>From:</strong> recap@traidezone.ai</p>
        <p><strong>To:</strong> ${ADMIN_EMAIL}</p>
      </body></html>`

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'recap@traidezone.ai',
          to:   ADMIN_EMAIL,
          subject: `[Diagnostic] trAIde Zone Test ${nowET} ET`,
          html: testHtml,
        }),
      })
      const sendResult = await sendRes.json()
      result.test_send = {
        status: sendRes.status,
        ok: sendRes.ok,
        response: sendResult,
      }
    } catch (e: any) {
      result.test_send = { error: e.message }
    }
  }

  // ── 5. Diagnose ───────────────────────────────────────────────────────
  const diagnosis: string[] = []
  if (!result.env.RESEND_API_KEY_SET) {
    diagnosis.push('❌ RESEND_API_KEY env var is NOT set on Vercel. This is the primary problem.')
  }
  if (result.env.VERCEL_ENV !== 'production') {
    diagnosis.push(`⚠ VERCEL_ENV is "${result.env.VERCEL_ENV}" — this endpoint may be running on preview/dev which has separate env vars.`)
  }
  if (result.morning_brief_attempts === 0) {
    diagnosis.push('❌ Zero morning_brief entries in email_logs. The cron is either not firing OR failing before any code runs.')
  }
  if (result.last_morning_brief) {
    const lastTime = new Date(result.last_morning_brief.sent_at).getTime()
    const hoursAgo = Math.round((Date.now() - lastTime) / 1000 / 3600)
    diagnosis.push(`ℹ Last morning_brief was ${hoursAgo} hours ago (${result.last_morning_brief.sent_at}). Should be daily on weekdays.`)
  }
  if (result.last_daily_recap) {
    const lastTime = new Date(result.last_daily_recap.sent_at).getTime()
    const hoursAgo = Math.round((Date.now() - lastTime) / 1000 / 3600)
    diagnosis.push(`ℹ Last daily_recap was ${hoursAgo} hours ago.`)
  } else {
    diagnosis.push('⚠ No daily_recap entries ever logged. The 4:30pm ET cron has not successfully completed once.')
  }
  if (result.morning_brief_errors_array && result.morning_brief_errors_array.length > 0) {
    diagnosis.push(`ℹ Recent errors found: ${result.morning_brief_errors_array.slice(0, 3).map((e: any) => `${e.sent_at}: ${e.subject}`).join(' | ')}`)
  }
  if (result.test_send?.response?.statusCode === 403) diagnosis.push('❌ Resend 403 — domain not verified.')
  if (result.test_send?.response?.statusCode === 401) diagnosis.push('❌ Resend 401 — API key invalid.')
  if (result.test_send?.response?.id) diagnosis.push(`✓ Test send OK — Resend id ${result.test_send.response.id}`)
  if (result.fire_morning?.response?.error) diagnosis.push(`❌ Morning email manual fire failed: ${result.fire_morning.response.error}`)
  if (result.fire_morning?.response?.resendId) diagnosis.push(`✓ Morning email manual fire succeeded: ${result.fire_morning.response.resendId}`)
  if (result.fire_recap?.response?.error) diagnosis.push(`❌ Recap manual fire failed: ${result.fire_recap.response.error}`)
  if (result.fire_recap?.response?.emailStatus === 'sent') diagnosis.push('✓ Recap manual fire emailed successfully')

  result.diagnosis = diagnosis.length > 0 ? diagnosis : ['No obvious issues detected.']
  result.next_steps = [
    '/api/email-diagnostic              — basic status',
    '/api/email-diagnostic?action=send  — send a test email',
    '/api/email-diagnostic?action=fire-morning — manually trigger morning brief',
    '/api/email-diagnostic?action=fire-recap   — manually trigger daily recap',
  ]

  return NextResponse.json(result, { status: 200 })
}
