import type { MatrixData } from './matrix'
import type { StoredPriceRow } from './db'
import { bulkInsertCellSuggestions, getCellKeyByIndices } from './db'
import { llmRerank } from './llm'

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[ё]/g, 'е')
}

function workTypeFromText(text: string): string | undefined {
  const t = normalize(text)
  if (/труб|дрен|канал|сантех/.test(t)) return 'Трубы/Дренаж'
  if (/воздуховод|вент|решет|диффуз/.test(t)) return 'Вентиляция'
  if (/светил|ламп|светод/.test(t)) return 'Светильники'
  if (/щит|шкаф|распредел/.test(t)) return 'Щиты/Шкафы'
  if (/бетон|армир|перекрыт|лестниц|балк|металлоконструк/.test(t)) return 'Конструкции'
  if (/двер|окн|витраж|перегород|стен|кровл|пол/.test(t)) return 'Архитектура'
  return undefined
}

function scoreForCell(rowGroup: string, rowLabel: string, colGroup: string, colLabel: string, p: StoredPriceRow): number {
  const base = normalize(`${p.name} ${p.unit || ''} ${p.category || ''}`)
  let score = 0
  for (const token of [rowGroup, rowLabel, colGroup, colLabel].map(normalize)) {
    for (const t of token.split(/\s+/)) {
      if (t && base.includes(t)) score += 0.75
    }
  }
  return score
}

export async function buildCellSuggestions(
  matrix: MatrixData,
  rowIndex: number,
  colIndex: number,
  prices: StoredPriceRow[],
  topN = 8
): Promise<{ count: number; cell_id: number; work_types: string[] }> {
  const key = await getCellKeyByIndices(rowIndex, colIndex)
  if (!key) throw new Error('Cell key not found')

  const scored = prices.map((p) => ({ p, score: scoreForCell(key.row_group, key.row_label, key.col_group, key.col_label, p) }))
  scored.sort((a, b) => b.score - a.score)
  let top = scored.slice(0, topN)

  const rerank = await llmRerank(`${key.row_group} / ${key.row_label} × ${key.col_group} / ${key.col_label}`, top.map((s) => ({ name: s.p.name, unit: s.p.unit, category: s.p.category })))
  if (rerank && rerank.length) {
    const updated = top.map((s, i) => {
      const found = rerank.find((r) => r.index === i)
      return { p: s.p, score: typeof found?.score === 'number' ? found.score : s.score }
    })
    updated.sort((a, b) => b.score - a.score)
    top = updated
  }

  const payload: Array<{ cell_id: number; work_type?: string | null; price_id: number; score: number; method: string }> = []
  const workTypes = new Set<string>()
  for (const s of top) {
    const wt = workTypeFromText(`${key.row_group} ${key.row_label} ${key.col_group} ${key.col_label} ${s.p.name} ${s.p.category || ''}`)
    if (wt) workTypes.add(wt)
    payload.push({ cell_id: key.id, work_type: wt || null, price_id: s.p.id, score: s.score, method: 'heuristic+llm' })
  }
  const count = await bulkInsertCellSuggestions(payload)
  return { count, cell_id: key.id, work_types: Array.from(workTypes) }
}

