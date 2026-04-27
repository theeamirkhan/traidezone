/**
 * memory.ts — session memory and trader profile extraction
 */

const SESSION_MEMORY_KEY = 'tz-session-memory'

export function loadSessionMemory(): string {
  try {
    const mem = localStorage.getItem(SESSION_MEMORY_KEY)
    return mem ? JSON.parse(mem).join('\n') : ''
  } catch { return '' }
}

export function saveSessionMemory(memories: string[]): void {
  try {
    localStorage.setItem(SESSION_MEMORY_KEY, JSON.stringify(memories.slice(-20)))
  } catch {}
}

export function addMemory(entry: string): void {
  try {
    const existing = JSON.parse(localStorage.getItem(SESSION_MEMORY_KEY) || '[]')
    const dated = `[${new Date().toLocaleDateString()}] ${entry}`
    saveSessionMemory([...existing, dated])
  } catch {}
}

export async function extractMemoryFromSession(
  anthKey: string, chatHistory: any[], tradePatterns: any, traderProfile: any
): Promise<void> {
  if (!anthKey || chatHistory.length < 3) return
  try {
    const recentChat = chatHistory.slice(-8).map((m: any) => `${m.role}: ${m.content}`).join('\n')
    const patternNote = tradePatterns?.revengePatterns > 2 ? 'Note: user shows revenge trading patterns.' : ''

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Analyze this trading session and extract insights.
Known weaknesses: ${traderProfile?.weaknesses?.join(', ') || 'none yet'}
Known strengths: ${traderProfile?.strengths?.join(', ') || 'none yet'}
${patternNote}
Session:\n${recentChat}

Return ONLY JSON:
{
  "memories": ["short dated fact"],
  "new_strengths": ["if observed"],
  "new_weaknesses": ["if observed"],
  "new_triggers": ["if observed"],
  "tone_suggestion": "direct|coaching|analytical|tough-love or omit"
}
Return {} if nothing notable. No markdown.` }]
      })
    })
    const data = await res.json()
    const raw = data.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}'
    const extracted = JSON.parse(raw)

    if (Array.isArray(extracted.memories) && extracted.memories.length > 0) {
      extracted.memories.forEach((m: string) => addMemory(m))
      fetch('/api/trader-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: extracted.memories })
      }).catch(() => {})
    }

    const profileUpdate: any = {}
    if (extracted.new_strengths?.length)  profileUpdate.strengths         = [...(traderProfile?.strengths || []), ...extracted.new_strengths].slice(-10)
    if (extracted.new_weaknesses?.length) profileUpdate.weaknesses        = [...(traderProfile?.weaknesses || []), ...extracted.new_weaknesses].slice(-10)
    if (extracted.new_triggers?.length)   profileUpdate.emotional_triggers = [...(traderProfile?.emotional_triggers || []), ...extracted.new_triggers].slice(-10)
    if (extracted.tone_suggestion)        profileUpdate.companion_tone     = extracted.tone_suggestion

    if (Object.keys(profileUpdate).length > 0) {
      fetch('/api/trader-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileUpdate)
      }).catch(() => {})
    }
  } catch {}
}
