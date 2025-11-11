import { fetch } from 'undici'

export type LLMRankResult = { index: number; score: number }

export async function llmRerank(
  discipline: string,
  candidates: Array<{ name: string; unit?: string; category?: string }>
): Promise<LLMRankResult[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const system = `Ты помощник-сметчик. На входе дисциплина (направление работ) и список позиций из прайс-листа.
Задача: расставить приоритет (0..1) по релевантности дисциплине. Верни JSON-массив [{index, score}].`
  const user = `Дисциплина: ${discipline}\nКандидаты:\n${candidates
    .map((c, i) => `${i}. ${c.name}${c.unit ? ` (${c.unit})` : ''}${c.category ? ` — ${c.category}` : ''}`)
    .join('\n')}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as any
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content)
    const arr = Array.isArray(parsed) ? parsed : parsed?.rank || []
    const results: LLMRankResult[] = []
    for (const item of arr) {
      const idx = Number(item.index)
      const score = Number(item.score)
      if (Number.isFinite(idx) && Number.isFinite(score)) {
        results.push({ index: idx, score })
      }
    }
    return results.length ? results : null
  } catch {
    return null
  }
}