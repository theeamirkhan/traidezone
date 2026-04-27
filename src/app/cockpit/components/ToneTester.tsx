'use client'
import { useState } from 'react'

const TONE_SCENARIOS = [
  "I just revenge traded after hitting my daily loss limit. Took 3 extra trades and gave back everything.",
  "SPX is sitting right at VWAP. I want to go long but my checklist score is 4/13.",
  "I had a perfect setup at 10:15 and missed the entry because I hesitated. Now it's moved 30 points without me.",
  "I'm up $800 on the day. Should I take one more trade? The setup looks good.",
  "I've been chopping all morning, taking small losses. I'm down $400 and feeling frustrated.",
]

const TONE_NAMES: Record<number, string> = {
  1: 'Drill Sergeant', 2: 'Direct & Firm', 3: 'Balanced', 4: 'Encouraging', 5: 'Life Coach'
}

const TONE_COLORS: Record<number, string> = {
  1: '#ff4444', 2: '#ff8800', 3: '#00d4a0', 4: '#4488ff', 5: '#aa66ff'
}

const TONE_INSTRUCTIONS: Record<number, string> = {
  1: "You are a DRILL SERGEANT. Be direct, blunt, and brutally honest. Call out mistakes immediately. No sugarcoating. Short sharp sentences.",
  2: "You are direct and firm. No fluff. Call out bad habits clearly. Be honest even when it stings. Tough-love approach.",
  3: "You are balanced — direct but supportive. Call out mistakes clearly but constructively. Mix accountability with encouragement.",
  4: "You are encouraging and supportive. Acknowledge progress. Frame corrections as learning opportunities. Keep energy positive.",
  5: "You are a LIFE COACH. Lead with empathy and encouragement. Reframe mistakes as growth moments. Celebrate small wins.",
}

export default function ToneTester() {
  const [scenario, setScenario] = useState('')
  const [customScenario, setCustomScenario] = useState('')
  const [results, setResults] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const testAll = async () => {
    const text = customScenario.trim() || scenario
    if (!text) return
    setLoading(true)
    setResults({})
    try {
      await Promise.all([1, 2, 3, 4, 5].map(async tone => {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 80,
            system: `${TONE_INSTRUCTIONS[tone]} You are an SPX day trading companion. Keep response under 40 words.`,
            messages: [{ role: 'user', content: text }]
          })
        })
        const data = await res.json()
        const reply = data.content?.[0]?.text || 'No response'
        setResults(p => ({ ...p, [tone]: reply }))
      }))
    } catch {}
    setLoading(false)
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 12 }}>
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: expanded ? 10 : 0 }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#00d4a0' }}>🎭 TONE TESTER</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {TONE_SCENARIOS.map((s, i) => (
              <button key={i} onClick={() => { setScenario(s); setCustomScenario('') }}
                style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: `1px solid ${scenario === s && !customScenario ? '#00d4a0' : 'rgba(255,255,255,0.12)'}`, background: scenario === s && !customScenario ? 'rgba(0,212,160,0.1)' : 'transparent', color: scenario === s && !customScenario ? '#00d4a0' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Scenario {i + 1}
              </button>
            ))}
          </div>
          {scenario && !customScenario && (
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontStyle: 'italic', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
              "{scenario.substring(0, 80)}..."
            </div>
          )}
          <textarea
            value={customScenario}
            onChange={e => { setCustomScenario(e.target.value); setScenario('') }}
            placeholder="Or type your own scenario..."
            style={{ width: '100%', minHeight: 48, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f0f4ff', fontSize: 10, padding: 8, fontFamily: 'inherit', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button onClick={testAll} disabled={loading || (!scenario && !customScenario)}
            style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', background: loading ? 'rgba(0,212,160,0.3)' : 'rgba(0,212,160,0.8)', color: '#000', fontSize: 10, fontWeight: 700, cursor: loading ? 'default' : 'pointer', marginBottom: 10, fontFamily: 'inherit' }}>
            {loading ? '⟳ Testing all 5 tones...' : '▶ Test All 5 Tones'}
          </button>
          {Object.entries(results).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(tone => results[tone] ? (
                <div key={tone} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${TONE_COLORS[tone]}33` }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: TONE_COLORS[tone], marginBottom: 4 }}>{tone}. {TONE_NAMES[tone].toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{results[tone]}</div>
                </div>
              ) : null)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
