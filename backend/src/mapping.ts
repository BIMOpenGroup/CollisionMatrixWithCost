import type { StoredPriceRow } from './db'
import { bulkInsertMappingSuggestions } from './db'
import { llmRerank } from './llm'
import { normalize } from './utils/text'
import { calculateScore } from './utils/scoring'

const DISCIPLINE_KEYWORDS: Record<string, string[]> = {
  'АР': ['архитектур', 'отделоч', 'проем', 'перегород', 'двер', 'окн'],
  'КР': ['конструкц', 'бетон', 'армир', 'монолит', 'кирпич', 'фундамент', 'перекрыт'],
  'ВК': ['водоснабжен', 'канализац', 'водопровод', 'сток', 'коллектор', 'труб', 'фитинг'],
  'ОВ': ['отопл', 'вентил', 'кондицион', 'воздуховод', 'радиатор', 'тепло'],
  'ЭО': ['электроснабж', 'кабель', 'щит', 'провод', 'розет', 'освещ'],
  'СС': ['слабоч', 'система', 'охран', 'видео', 'датчик', 'пожар'],
  'АУПТ': ['пожаротуш', 'спринклер', 'пена', 'вода', 'магистраль', 'насос'],
}

function scorePriceForDiscipline(discipline: string, p: StoredPriceRow): number {
  return calculateScore([], p, {
    keywords: DISCIPLINE_KEYWORDS[discipline],
    contextKeywords: {
      'ОВ': ['вент', 'отоп', 'конди'],
      'ВК': ['вод', 'канал'],
      'КР': ['бетон', 'армир', 'монолит'],
      'ЭО': ['элект', 'кабель', 'щит']
    }
  })
}

export type SuggestionCandidate = { price: StoredPriceRow; score: number }

export async function buildSuggestions(
  disciplines: string[],
  prices: StoredPriceRow[],
  topN = 10
): Promise<{
  count: number
  byDiscipline: Record<string, SuggestionCandidate[]>
}> {
  const byDiscipline: Record<string, SuggestionCandidate[]> = {}
  for (const d of disciplines) {
    const scored: SuggestionCandidate[] = prices.map((p) => ({ price: p, score: scorePriceForDiscipline(d, p) }))
    scored.sort((a, b) => b.score - a.score)
    let top = scored.slice(0, topN)

    // optional LLM rerank if available
    const rerank = await llmRerank(
      d,
      top.map((c) => ({ name: c.price.name, unit: c.price.unit, category: c.price.category }))
    )
    if (rerank && rerank.length) {
      const updated = top.map((c, i) => {
        const found = rerank.find((r) => r.index === i)
        return { price: c.price, score: typeof found?.score === 'number' ? found.score : c.score }
      })
      updated.sort((a, b) => b.score - a.score)
      top = updated
    }

    byDiscipline[d] = top
  }

  // persist suggestions
  const payload = Object.entries(byDiscipline)
    .flatMap(([d, arr]) => arr.map((c) => ({ discipline: d, price_id: c.price.id, score: c.score, method: 'heuristic+llm' })))
  const count = await bulkInsertMappingSuggestions(payload)
  return { count, byDiscipline }
}