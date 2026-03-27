import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'

async function getUserData(clerkUserId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile) return { profile: null, rules: null, todayTrades: [] }

  const { data: rules } = await supabaseAdmin
    .from('trading_rules')
    .select('*')
    .eq('user_id', profile.id)
    .single()

  const today = new Date().toISOString().split('T')[0]
  const { data: todayTrades } = await supabaseAdmin
    .from('trade_log')
    .select('*')
    .eq('user_id', profile.id)
    .eq('date', today)

  return { profile, rules, todayTrades: todayTrades || [] }
}

export default async function DashboardPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const { profile, rules, todayTrades } = await getUserData(user.id)

  const todayPnL = todayTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0)
  const pnlColor = todayPnL > 0 ? 'text-emerald-400' : todayPnL < 0 ? 'text-red-400' : 'text-white'

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">trAIde Zone</h1>
            <p className="text-gray-400">Welcome back, {user.firstName || user.emailAddresses[0]?.emailAddress}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30">
              {profile?.plan_tier?.toUpperCase() || 'FREE'} PLAN
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Morning Plan</p>
            <p className="text-2xl font-bold mt-1">Edge Protocol</p>
            <a href="https://edge-protocol.vercel.app" target="_blank"
              className="text-emerald-400 text-sm mt-2 block hover:underline">
              Open →
            </a>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Live Trading</p>
            <p className="text-2xl font-bold mt-1">Edge Charts</p>
            <a href="https://edge-charts.vercel.app" target="_blank"
              className="text-emerald-400 text-sm mt-2 block hover:underline">
              Open →
            </a>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Today's P&L</p>
            <p className={`text-2xl font-bold mt-1 ${pnlColor}`}>
              {todayPnL >= 0 ? '+' : ''}${todayPnL.toFixed(2)}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''} logged
            </p>
          </div>
        </div>

        {/* Trading Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Your Trading Rules</h2>
              {rules && (
                <a href="/onboarding" className="text-xs text-gray-400 hover:text-white">Edit →</a>
              )}
            </div>
            {rules ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Instrument</span>
                  <span>{rules.instrument}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Entry Time</span>
                  <span>{rules.entry_time_rule}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Entry Criteria</span>
                  <span className="text-right max-w-[60%]">{rules.entry_criteria}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Stop Rule</span>
                  <span>{rules.stop_rule}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Max Trades/Day</span>
                  <span>{rules.max_daily_trades}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Max Daily Loss</span>
                  <span className="text-red-400">${rules.max_daily_loss}</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-sm mb-3">Set up your trading rules to activate AI accountability.</p>
                <a href="/onboarding"
                  className="inline-block bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm px-4 py-2 rounded transition">
                  Complete Onboarding →
                </a>
              </div>
            )}
          </div>

          {/* Today's Trades */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Today's Trades</h2>
              <a href="/dashboard/log-trade"
                className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/30 transition">
                + Log Trade
              </a>
            </div>
            {todayTrades.length === 0 ? (
              <p className="text-gray-400 text-sm">No trades logged today.</p>
            ) : (
              <div className="space-y-2">
                {todayTrades.map((trade: any) => (
                  <div key={trade.id} className="flex items-center justify-between text-sm border border-gray-800 rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${trade.direction === 'call' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {trade.direction?.toUpperCase()}
                      </span>
                      <span>{trade.symbol}</span>
                    </div>
                    <span className={trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Accountability Banner */}
        {rules && (
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-6">
            <h2 className="font-bold mb-1">AI Accountability Check</h2>
            <p className="text-gray-400 text-sm">
              Remember: {rules.entry_time_rule} · {rules.entry_criteria} · Stop at {rules.stop_rule}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}