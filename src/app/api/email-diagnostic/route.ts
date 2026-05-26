/**
 * /api/email-diagnostic — Tests Resend setup and reports what's wrong
 *
 * GET this endpoint to:
 *   1. Verify RESEND_API_KEY is set
 *   2. List recent email_logs entries (did emails actually try to send?)
 *   3. Send a test email and return the full Resend response
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_EMAIL = 'theeamirkhan@gmail.com'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'check'

  const result: any = {
    timestamp: new Date().toISOString(),
    env: {
      RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
      RESEND_API_KEY_LENGTH: process.env.RESEND_API_KEY?.length || 0,
    },
  }

  // Check recent email_logs
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('email_logs')
      .select('type, recipient, subject, status, resend_id, sent_at')
      .order('sent_at', { ascending: false })
      .limit(10)

    if (error) {
      result.email_logs_error = error.message
    } else {
      result.recent_email_logs = logs || []
      result.morning_brief_count_last_7days = (logs || []).filter(l => l.type === 'morning_brief').length
      result.daily_recap_count = (logs || []).filter(l => l.type === 'daily_recap').length
    }
  } catch (e: any) {
    result.email_logs_error = e.message
  }

  // Optional: send a test email
  if (action === 'send' && process.env.RESEND_API_KEY) {
    try {
      const testHtml = `<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#f5f7fa;">
        <h2 style="color:#00e5ff;">trAIde Zone — Email Diagnostic Test</h2>
        <p>If you received this email, your Resend setup is working correctly.</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
        <p><strong>From:</strong> recap@traidezone.ai</p>
        <p><strong>To:</strong> ${ADMIN_EMAIL}</p>
        <hr>
        <p style="color:#666;font-size:12px;">If you haven't been receiving daily recaps or morning briefs, check:</p>
        <ol style="color:#666;font-size:12px;">
          <li>This email actually arrived (look in Spam too)</li>
          <li>Resend dashboard → Domains → traidezone.ai is verified</li>
          <li>Resend dashboard → Emails shows successful sends</li>
        </ol>
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
          subject: `[Diagnostic] trAIde Zone Email Test ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET`,
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
  } else if (action === 'send' && !process.env.RESEND_API_KEY) {
    result.test_send = { error: 'RESEND_API_KEY not set on server' }
  }

  // Diagnose likely issues
  const diagnosis: string[] = []
  if (!result.env.RESEND_API_KEY_SET) {
    diagnosis.push('❌ RESEND_API_KEY environment variable is not set on Vercel. Add it in Settings → Environment Variables.')
  }
  if (result.morning_brief_count_last_7days === 0) {
    diagnosis.push('⚠ No morning_brief entries in email_logs — cron may not be firing, or the table doesn\'t exist, or send is failing before reaching log.')
  }
  if (result.recent_email_logs && result.recent_email_logs.length > 0) {
    const failedSends = result.recent_email_logs.filter((l: any) => l.status !== 'sent')
    if (failedSends.length > 0) {
      diagnosis.push(`⚠ ${failedSends.length} recent emails marked as 'failed' in logs — check Resend dashboard for delivery errors.`)
    }
  }
  if (result.test_send?.response?.statusCode === 403) {
    diagnosis.push('❌ Resend returned 403 — the sending domain (traidezone.ai) is likely not verified. Go to Resend dashboard → Domains and verify.')
  }
  if (result.test_send?.response?.statusCode === 422) {
    diagnosis.push('❌ Resend returned 422 — likely an invalid from address. The domain must be verified in Resend for from addresses to work.')
  }
  if (result.test_send?.response?.statusCode === 401) {
    diagnosis.push('❌ Resend returned 401 — RESEND_API_KEY is invalid or revoked.')
  }
  if (result.test_send?.response?.id) {
    diagnosis.push(`✓ Test email sent successfully — Resend id: ${result.test_send.response.id}. If it doesn't arrive, check Gmail spam folder.`)
  }

  result.diagnosis = diagnosis.length > 0 ? diagnosis : ['No obvious issues detected — check this dashboard data and Resend dashboard']
  result.next_steps = [
    'To send a test email: visit /api/email-diagnostic?action=send',
    'Check Resend dashboard at https://resend.com/emails for delivery history',
    'Check Resend dashboard → Domains to verify traidezone.ai is set up',
  ]

  return NextResponse.json(result, { status: 200 })
}
