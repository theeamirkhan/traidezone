/**
 * /api/triggers/fires — log trigger fires + read attribution stats
 *
 *  POST {action:'log', ...}    → record a fire (setup + AI overlay verdict)
 *  POST {action:'taken', id}   → mark that the trader actually took it
 *  GET                          → attribution stats: personal vs AI win rates,
 *                                  especially on disagreements
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const action = body.action

    if (action === 'log') {
      const { data, error } = await supabaseAdmin
        .from('trigger_fires')
        .insert({
          user_id:             userId,
          trigger_id:          body.triggerId || null,
          trigger_name:        body.triggerName || null,
          direction:           body.direction,
          setup_confidence:    body.setupConfidence || null,
          entry_spx:           body.entrySpx,
          predicted_t1:        body.predictedT1 || null,
          predicted_stop:      body.predictedStop || null,
          ai_verdict:          body.aiVerdict || null,
          ai_confidence:       body.aiConfidence || null,
          ai_reasoning:        body.aiReasoning || null,
          ai_conflict_factors: body.conflictFactors || null,
          agreement:           body.agreement || null,
          context_snapshot:    body.context || null,
          taken:               false,
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    if (action === 'taken') {
      const { error } = await supabaseAdmin
        .from('trigger_fires')
        .update({ taken: true })
        .eq('id', body.id)
        .eq('user_id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: fires, error } = await supabaseAdmin
      .from('trigger_fires')
      .select('*')
      .eq('user_id', userId)
      .order('fired_at', { ascending: false })
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const all = fires || []
    const graded = all.filter(f => f.outcome_60m)

    // Helper: win rate over a subset (T1-before-stop = WIN)
    const winRate = (subset: any[]) => {
      const decided = subset.filter(f => f.outcome_60m === 'WIN' || f.outcome_60m === 'LOSS')
      const wins = decided.filter(f => f.outcome_60m === 'WIN').length
      return decided.length > 0 ? { winRate: Math.round((wins / decided.length) * 100), n: decided.length } : { winRate: null, n: 0 }
    }

    // The key attribution buckets:
    // 1. Both agreed (CONFIRM) — calibration baseline
    const confirmed = graded.filter(f => f.agreement === 'AGREE')
    // 2. AI cautioned (PARTIAL) — did setup survive the yellow flags?
    const cautioned = graded.filter(f => f.agreement === 'PARTIAL')
    // 3. AI conflicted (DISAGREE) — the money bucket: was the AI right to oppose?
    const conflicted = graded.filter(f => f.agreement === 'DISAGREE')

    // Of conflicted fires the trader TOOK anyway — who was right?
    const conflictedTaken = conflicted.filter(f => f.taken)

    return NextResponse.json({
      ok: true,
      totalFires: all.length,
      gradedFires: graded.length,
      // Overall personal setup performance (all fires, regardless of AI verdict)
      personalSetupWinRate: winRate(graded),
      // Performance split by AI agreement
      whenConfirmed:  winRate(confirmed),
      whenCautioned:  winRate(cautioned),
      whenConflicted: winRate(conflicted),
      // The decisive comparison: when AI said CONFLICT but setup fired,
      // setup win rate tells us whose read to trust
      conflictedTakenWinRate: winRate(conflictedTaken),
      // Interpretation hint for the UI
      attribution:
        conflicted.length < 5
          ? 'Not enough disagreements yet to judge whose read is better.'
          : (winRate(conflicted).winRate ?? 50) >= 55
            ? 'Your setups have been beating the AI caution — lean toward trusting your trigger.'
            : (winRate(conflicted).winRate ?? 50) <= 45
              ? 'The AI caution has been right more often — weight its conflict warnings heavily.'
              : 'Mixed — your setups and AI caution are roughly even on disagreements.',
      recent: all.slice(0, 20).map(f => ({
        firedAt:      f.fired_at,
        name:         f.trigger_name,
        direction:    f.direction,
        setupConf:    f.setup_confidence,
        aiVerdict:    f.ai_verdict,
        aiConf:       f.ai_confidence,
        agreement:    f.agreement,
        taken:        f.taken,
        outcome60:    f.outcome_60m,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
