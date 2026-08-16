export type GeneratedCard = {
  question: string
  answer: string
  topic: string
  branch?: string
}

export const RECALL_SYSTEM_PROMPT = `You are a cognitive science and active recall specialist.
Your task is to extract HIGH-QUALITY, ATOMIC active-recall flashcard drafts from the provided study note or source text.

FOLLOW PIOTR WOZNIAK'S 20 RULES OF FORMULATING KNOWLEDGE:
1. ATOMICITY: Each card must test exactly ONE concept, mechanism, distinction, or rule.
2. CAUSAL & APPLIED: Ask about HOW a mechanism works, WHEN an error happens, WHAT distinguishes A from B, or a precise threshold/condition.
3. CONCISE & UNAMBIGUOUS: The question must prompt a specific mental retrieval, not a general essay. The answer must be 1-2 sentences maximum, crisp and complete.
4. TWO-TIER HIERARCHICAL TAGGING:
   - "branch": The broad macro category / pillar / domain (e.g. "Pillars of Islam", "System Dynamics", "Business Strategy", "Theology", "Biochemistry").
   - "topic": The fine-grained concept / leaf tag (e.g. "Salah", "Balancing Loops", "Stock & Flow", "CAC Payback").
5. ZERO FLUFF / NO META QUESTIONS:
   - STRICTLY FORBIDDEN: "What is the primary governing principle of...?"
   - STRICTLY FORBIDDEN: "What are the main takeaways of...?"
   - STRICTLY FORBIDDEN: "Why is X important...?"
   - STRICTLY FORBIDDEN: Generic buzzword answers ("By implementing structured countermeasures...").
6. SPARSE & GROUNDED: Generate only 1 to 3 cards for short texts, up to 4 for dense texts. If the input contains no concrete testable mechanisms or concepts (e.g., pure personal reflection, emotional narrative), output an empty array: []

OUTPUT FORMAT:
Return a JSON array of objects with fields:
- "question": string (the test prompt)
- "answer": string (the crisp, complete retrieval answer)
- "topic": string (the fine-grained concept tag)
- "branch": string (the broad macro pillar/domain)
`

export function sanitizeCards(rawCards: any[], defaultTopic?: string, defaultBranch?: string): GeneratedCard[] {
  if (!Array.isArray(rawCards)) return []
  return rawCards
    .filter((c) => c && typeof c.question === 'string' && typeof c.answer === 'string')
    .map((c) => ({
      question: String(c.question).trim(),
      answer: String(c.answer).trim(),
      topic: String(c.topic || defaultTopic || 'general').trim().slice(0, 50),
      branch: String(c.branch || defaultBranch || defaultTopic || 'General').trim().slice(0, 50)
    }))
    .filter((c) => {
      const q = c.question.toLowerCase()
      // Reject obvious meta / boilerplate slop
      if (q.includes('primary governing principle') || q.includes('source notes') || q.includes('exploitative patterns identified in')) {
        return false
      }
      return c.question.length > 5 && c.answer.length > 2
    })
}

export async function generateRecallCardsWithGemini(
  text: string,
  apiKey: string,
  topicHint?: string,
  branchHint?: string,
  preferredModel = 'gemini-3.5-flash-lite'
): Promise<GeneratedCard[]> {
  if (!text || text.trim().length < 20) return []

  const models = [
    preferredModel,
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ]
  let lastError: Error | null = null

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${RECALL_SYSTEM_PROMPT}\n\n${branchHint ? `Macro Branch Context: ${branchHint}\n` : ''}${topicHint ? `Topic Context: ${topicHint}\n` : ''}SOURCE TEXT TO EXTRACT RECALL CARDS FROM:\n"""\n${text.slice(0, 15000)}\n"""`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorText = await res.text()
        lastError = new Error(`Gemini API [${model}] error (${res.status}): ${errorText}`)
        continue
      }

      const data = await res.json<any>()
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!rawJson) return []

      const parsed = JSON.parse(rawJson)
      if (Array.isArray(parsed)) {
        return sanitizeCards(parsed, topicHint, branchHint)
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) {
        return sanitizeCards(parsed.cards, topicHint, branchHint)
      }
      return []
    } catch (err: any) {
      lastError = err
      continue
    }
  }

  throw lastError || new Error('Failed to generate recall cards with Gemini')
}
