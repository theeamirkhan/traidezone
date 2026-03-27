'use client'
import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const { user } = useUser()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    instrument: 'SPX ITM options',
    entry_time_rule: 'After 10am EST',
    entry_criteria: 'VWAP/EMA confluence at key levels',
    stop_rule: 'VWAP reclaim',
    max_daily_trades: 3,
    max_daily_loss: 500,
  })

  const handleSubmit = async () => {
    setLoading(true)
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome to trAIde Zone</h1>
          <p className="text-gray-400 mt-2">Set up your trading rules so your AI companion can keep you accountable.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Instrument</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              value={form.instrument}
              onChange={e => setForm({...form, instrument: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Entry Time Rule</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              value={form.entry_time_rule}
              onChange={e => setForm({...form, entry_time_rule: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Entry Criteria</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              value={form.entry_criteria}
              onChange={e => setForm({...form, entry_criteria: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Stop Rule</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              value={form.stop_rule}
              onChange={e => setForm({...form, stop_rule: e.target.value})}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Max Daily Trades</label>
              <input
                type="number"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                value={form.max_daily_trades}
                onChange={e => setForm({...form, max_daily_trades: parseInt(e.target.value)})}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Max Daily Loss ($)</label>
              <input
                type="number"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                value={form.max_daily_loss}
                onChange={e => setForm({...form, max_daily_loss: parseInt(e.target.value)})}
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-3 rounded transition"
        >
          {loading ? 'Saving...' : 'Enter trAIde Zone →'}
        </button>
      </div>
    </div>
  )
}