/**
 * /api/agents/analyze-chat — Nightly Chat Learning Agent
 *
 * Runs at 6pm ET after market close.
 * Scans today's companion chat for:
 *
 * 1. SIGNAL DECISIONS — Did you take or skip signals? Why?
 *    "I'm skipping this — spread too wide" → execution pattern
 *    "Took it, got stopped" → correlate with trade_alerts outcome
 *
 * 2. EMOTIONAL STATE — Pre-trade emotional indicators
 *    "I'm frustrated" / "I'm off today" / "feeling good"
 *    Correlated with P&L → identifies when emotional state predicts bad days
 *
 * 3. MARKET OBSERVATIONS — Things you noticed the AI didn't flag
 *    "That breakout looked fake" / "Volume dried up on that move"
 *    → Fed back as edge refinement
 *
 * 4. EXECUTION GAPS — Where you diverged from the signal
 *    "Entered early" / "sized down" / "didn't take profit at T1"
 *    → Identifies recurring execution leaks
 *
 * Output: structured insights saved to trader_profile.chat_learnings
 * Also updates: weaknesses, strengths, patterns arrays
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  let userId: string | null = null
  if (isCron) {
    const body = await req.json().catch(() => ({}))
    userId = body.userId
  } else {
    const { userId: uid } = await auth()
    userId = uid
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    // Fetch today's chat
    const { data: messages, error: chatErr } = await supabaseAdmin
      .from('chat_sessions')
      .select('role, content, created_at, metadata')
      .eq('user_id', userId)
      .eq('trading_date', today)
      .order('created_at', { ascending: true })
      .limit(200)

    if (chatErr) throw new Error(chatErr.message)
    if (!messages?.length || messages.filter(m => m.role === 'user').length < 3) {
      return NextResponse.json({ status: 'insufficient_chat', messages: messages?.length || 0 })
    }

    // Fetch today's signals for cross-reference
    const { data: signals } = await supabaseAdmin
      .from('trade_alerts')
      .select('signal, confidence, outcome, pts_to_t1, created_at, ai_view, system_alignment')
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00Z`)
      .order('created_at', { ascending: true })

    // Fetch existing trader profile
    const { data: profile } = await supabaseAdmin
      .from('trader_profiles')
      .select('weaknesses, strengths, patterns, chat_learnings')
      .eq('user_id', userId)
      .single()

    // Format chat for AI analysis
    const chatText = messages.map(m =>
      `[${new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ${m.role.toUpperCase()}]: ${m.content}`
    ).join('\n')

    const signalText = signals?.length
      ? signals.map(s => `${new Date(s.created_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} — ${s.signal} ${s.confidence}% → ${s.outcome || 'PENDING'}`).join('\n')
      : 'No signals today'

    // Ask Claude to extract insights
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are analyzing a trader's chat session with their AI companion to extract learning insights.

TODAY'S CHAT:
${chatText}

TODAY'S SIGNALS (for cross-reference):
${signalText}

Extract structured insights from this chat. Look for:
- Signal decisions: did they take/skip and why?
- Emotional state: any mentions of frustration, confidence, fear, excitement?
- Market observations: did they notice something the AI might have missed?
- Execution patterns: early entries, sizing changes, early exits?
- Recurring themes: anything that matches past patterns?

Respond ONLY with valid JSON, no markdown:
{
  "tradingDate": "${today}",
  "signalDecisions": [{"signal": "LONG/SHORT/WAIT", "action": "took/skipped", "reason": "why", "outcome": "if mentioned"}],
  "emotionalState": {"overall": "calm/frustrated/confident/fearful/mixed", "notes": "specific observations"},
  "marketObservations": ["observation 1", "observation 2"],
  "executionPatterns": ["pattern 1", "pattern 2"],
  "newWeaknesses": ["weakness if newly observed"],
  "newStrengths": ["strength if demonstrated"],
  "keyInsight": "The single most important thing to remember about this trader's session today (1-2 sentences)"
}`,
        }],
      }),
    })

    const aiData = await res.json()
    const raw = aiData.content?.[0]?.text || '{}'
    const insights = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Update trader_profile with new learnings
    const existingLearnings = (profile?.chat_learnings || []).slice(-20) // keep last 20 days
    const newLearnings = [...existingLearnings, insights]

    // Merge weaknesses and strengths (deduplicated)
    const existingWeaknesses = profile?.weaknesses || []
    const existingStrengths  = profile?.strengths  || []
    const mergedWeaknesses = [...new Set([...existingWeaknesses, ...(insights.newWeaknesses || [])])]
    const mergedStrengths  = [...new Set([...existingStrengths,  ...(insights.newStrengths  || [])])]

    await supabaseAdmin.from('trader_profiles').upsert({
      user_id:        userId,
      weaknesses:     mergedWeaknesses.slice(-15),
      strengths:      mergedStrengths.slice(-15),
      chat_learnings: newLearnings,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json({
      status:       'complete',
      date:         today,
      messagesRead: messages.length,
      insights,
    })

  } catch (e: any) {
    console.error('[analyze-chat]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return POST(req) }
