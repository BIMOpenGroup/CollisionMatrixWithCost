import type { StoredPriceRow } from './db'
import { bulkInsertMappingSuggestions } from './db'
import { llmRerank } from './llm'

const DISCIPLINE_KEYWORDS: Record<string, string[]> = {
  'АР': ['архитектур', 'отделоч', 'проем', 'перегород', 'двер', 'окн'],
  'КР': ['конструкц', 'бетон', 'армир', 'монолит', 'кирпич', 'фундамент', 'перекрыт'],
  'ВК': ['водоснабжен', 'канализац', 'водопровод', 'сток', 'коллектор', 'труб', 'фитинг'],
  'ОВ': ['отопл', 'вентил', 'кондицион', 'воздуховод', 'радиатор', 'тепло'],
  'ЭО': ['электроснабж', 'кабель', 'щит', 'провод', 'розет', 'освещ'],
  'СС': ['слабоч', 'система', 'охран', 'видео', 'датчик', 'пожар'],
  'АУПТ': ['пожаротуш', 'спринклер', 'пена', 'вода', 'магистраль', 'насос'],
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[ё]/g, 'е')
}

function scorePriceForDiscipline(discipline: string, p: StoredPriceRow): number {
  const name = normalize(p.name)
  const unit = normalize(p.unit || '')
  const category = normalize(p.category || '')
  const base = name + ' ' + unit + ' ' + category
  const keys = DISCIPLINE_KEYWORDS[discipline] || []
  let score = 0
  for (const k of keys) {
    if (base.includes(k)) score += 1
  }
  // small boost if category looks relevant by common stems
  if (discipline === 'ОВ' && /вент|отоп|конди/i.test(base)) score += 0.5
  if (discipline === 'ВК' && /вод|канал/i.test(base)) score += 0.5
  if (discipline === 'КР' && /бетон|армир|монолит/i.test(base)) score += 0.5
  if (discipline === 'ЭО' && /элект|кабель|щит/i.test(base)) score += 0.5
  return score
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