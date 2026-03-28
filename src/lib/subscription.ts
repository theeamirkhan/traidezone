import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type Plan = 'free' | 'pro' | 'elite'

export async function getUserPlan(userId: string): Promise<Plan> {
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .single()
    
    if (data?.status === 'active' && data?.plan) {
      return data.plan as Plan
    }
    return 'free'
  } catch {
    return 'free'
  }
}

export const PLAN_LIMITS = {
  free: {
    aiCallsPerDay: 3,
    hasVoice: false,
    hasOptionsFlow: false,
    hasNews: false,
    hasCalendar: false,
    hasMultiTF: false,
    hasMacroRegime: false,
    hasTradePatterns: false,
    has0DTESkew: false,
    hasMemory: false,
  },
  pro: {
    aiCallsPerDay: Infinity,
    hasVoice: true,
    hasOptionsFlow: true,
    hasNews: true,
    hasCalendar: true,
    hasMultiTF: true,
    hasMacroRegime: false,
    hasTradePatterns: true,
    has0DTESkew: true,
    hasMemory: true,
  },
  elite: {
    aiCallsPerDay: Infinity,
    hasVoice: true,
    hasOptionsFlow: true,
    hasNews: true,
    hasCalendar: true,
    hasMultiTF: true,
    hasMacroRegime: true,
    hasTradePatterns: true,
    has0DTESkew: true,
    hasMemory: true,
  },
}