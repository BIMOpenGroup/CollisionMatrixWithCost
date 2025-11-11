import type { MatrixData } from './matrix'
import type { StoredPriceRow } from './db'
import { bulkInsertElementSuggestions } from './db'
import { llmRerank } from './llm'

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[ё]/g, 'е')
}

const GROUP_KEYWORDS: Record<string, string[]> = {
  'АР': ['архитект', 'отдел', 'стен', 'окн', 'двер', 'кровл', 'потол'],
  'КР': ['конструк', 'бетон', 'армир', 'металл', 'фундамент', 'балк', 'лестниц'],
  'ВК (К)': ['канал', 'дрен'],
  'ВК (В)': ['водоснаб', 'водопровод', 'сантех'],
  'ОВ (Вент.)': ['вент', 'воздух'],
  'ОВ (Отоп.)': ['отоп', 'радиатор', 'тепло'],
  'АУПТ': ['пожар', 'тушен', 'спринклер'],
  'ЭО, ЭС, ЭМ, СС': ['элект', 'кабель', 'освещ', 'щит', 'слабоч'],
}

const ELEMENT_KEYWORDS: Record<string, string[]> = {
  'Стены': ['стен', 'перегород', 'кладк', 'блок', 'кирпич'],
  'Витражи': ['витраж', 'стекл', 'фасад'],
  'Пол / Кровля': ['пол', 'покрыт', 'кровл', 'мембран'],
  'Потолок': ['потол', 'подвесн'],
  'Двери / Окна': ['двер', 'окн', 'портал'],
  'Ограждения': ['огражден', 'перил', 'поручн', 'забор'],
  'Коллоны / Пилоны': ['колон', 'пилон'],
  'Плиты фундамента': ['фундам', 'плит', 'бетон'],
  'Перекрытия / Покрытия / Рампы': ['перекрыт', 'рамп', 'покрыт'],
  'Балки': ['балк'],
  'КМ': ['металлоконструк', 'сталь', 'конструкц'],
  'Лестницы': ['лестниц', 'ступен', 'марш'],
  'Трубы / Дренаж': ['труб', 'дренаж', 'канал'],
  'Воздухораспредел.': ['воздухораспред', 'решетк', 'диффузор'],
  'Воздуховод': ['воздуховод'],
  'Трубы': ['труб'],
  'Оборудование': ['оборуд', 'установ', 'агрегат', 'прибор', 'устройств'],
  'Спринклеры': ['спринклер'],
  'Кабельканалы / Лотки': ['кабель', 'лоток', 'канал', 'трасс'],
  'Светильники': ['светил', 'свет', 'ламп', 'светод'],
  'Щиты / Шкафы': ['щит', 'шкаф', 'распредел'],
}

function scoreForElement(group: string, element: string, p: StoredPriceRow): number {
  const base = normalize(`${p.name} ${p.unit || ''} ${p.category || ''}`)
  let score = 0

  const eKeys = ELEMENT_KEYWORDS[element] || []
  for (const k of eKeys) if (base.includes(k)) score += 1

  const gKeys = GROUP_KEYWORDS[group] || []
  for (const k of gKeys) if (base.includes(k)) score += 0.5

  // Lightweight name-token matching from element string itself
  for (const token of normalize(element).split(/[\s\/]+/)) {
    if (token && base.includes(token)) score += 0.5
  }
  return score
}

export async function buildElementSuggestions(
  matrix: MatrixData,
  prices: StoredPriceRow[],
  topN = 8
): Promise<{ count: number; elements: Array<{ grp: string; element: string; axis: 'row' | 'col' }> }> {
  const targets: Array<{ grp: string; element: string; axis: 'row' | 'col' }> = []
  for (const c of matrix.columns) targets.push({ grp: c.group, element: c.label, axis: 'col' })
  for (const r of matrix.rows) targets.push({ grp: r.group, element: r.label, axis: 'row' })

  const payload: Array<{ grp: string; element: string; axis: 'row' | 'col'; price_id: number; score: number; method: string }> = []

  for (const t of targets) {
    const scored = prices.map((p) => ({ p, score: scoreForElement(t.grp, t.element, p) }))
    scored.sort((a, b) => b.score - a.score)
    let top = scored.slice(0, topN)

    const rerank = await llmRerank(`${t.grp} / ${t.element}`, top.map((s) => ({ name: s.p.name, unit: s.p.unit, category: s.p.category })))
    if (rerank && rerank.length) {
      const updated = top.map((s, i) => {
        const found = rerank.find((r) => r.index === i)
        return { p: s.p, score: typeof found?.score === 'number' ? found.score : s.score }
      })
      updated.sort((a, b) => b.score - a.score)
      top = updated
    }

    for (const s of top) {
      payload.push({ grp: t.grp, element: t.element, axis: t.axis, price_id: s.p.id, score: s.score, method: 'heuristic+llm' })
    }
  }

  const count = await bulkInsertElementSuggestions(payload)
  return { count, elements: targets }
}