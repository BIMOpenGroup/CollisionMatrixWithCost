import { insertTask, insertTaskLog, updateTaskStatus, getAllCellKeys, bulkUpsertCellKeys, getPrices, getAcceptedElementPrices, upsertCollisionCost, getElementSuggestions, updateElementSuggestionStatus, getPriceById, insertSuggestionEvent, upsertCellRisk } from './db'
import { loadMatrixFromCsv, extractDisciplineGroups } from './matrix'
import { buildCellSuggestions } from './cellMapping'
import { buildElementSuggestions } from './elementMapping'
import { llmDecideElement, llmCollisionEstimate, llmRiskEstimate } from './llm'

export type TaskType = 'sync_cells' | 'auto_approve_elements' | 'build_cell_suggestions_all' | 'compute_collisions_all' | 'compute_risk_all'

const cancelledTaskIds = new Set<number>()

export async function cancelTask(id: number): Promise<void> {
  cancelledTaskIds.add(id)
  await updateTaskStatus(id, 'error', 100, 'Cancelled by user')
  await insertTaskLog(id, 'warn', 'Задача отменена пользователем')
}

async function runSyncCells(taskId: number) {
  try {
    await updateTaskStatus(taskId, 'running', 0, 'Инициализация ключей ячеек')
    const matrix = loadMatrixFromCsv()
    const rows: Array<{ row_index: number; col_index: number; row_group: string; row_label: string; col_group: string; col_label: string }> = []
    for (let ri = 0; ri < matrix.rows.length; ri++) {
      for (let ci = 0; ci < matrix.columns.length; ci++) {
        rows.push({ row_index: ri, col_index: ci, row_group: matrix.rows[ri].group, row_label: matrix.rows[ri].label, col_group: matrix.columns[ci].group, col_label: matrix.columns[ci].label })
      }
    }
    await insertTaskLog(taskId, 'info', 'Всего ячеек', { count: rows.length })
    const inserted = await bulkUpsertCellKeys(rows)
    await insertTaskLog(taskId, 'info', 'Вставлено ключей', { inserted })
    await updateTaskStatus(taskId, 'done', 100, 'Готово')
  } catch (e: any) {
    await insertTaskLog(taskId, 'error', e?.message || String(e))
    await updateTaskStatus(taskId, 'error', 100, e?.message || 'Ошибка')
  }
}

async function runBuildCellSuggestionsAll(taskId: number) {
  try {
    await updateTaskStatus(taskId, 'running', 0, 'Генерация предложений по ячейкам')
    const keys = await getAllCellKeys()
    const prices = await getPrices(10000)
    let processed = 0
    for (const k of keys) {
      if (cancelledTaskIds.has(taskId)) break
      const result = await buildCellSuggestions(loadMatrixFromCsv(), k.row_index, k.col_index, prices, 8)
      processed++
      if (processed % 50 === 0) {
        const progress = Math.floor((processed / keys.length) * 100)
        await updateTaskStatus(taskId, 'running', progress, `Обработано: ${processed}/${keys.length}`)
      }
    }
    await insertTaskLog(taskId, 'info', 'Итого обработано', { processed })
    await updateTaskStatus(taskId, 'done', 100, 'Готово')
  } catch (e: any) {
    await insertTaskLog(taskId, 'error', e?.message || String(e))
    await updateTaskStatus(taskId, 'error', 100, e?.message || 'Ошибка')
  }
}

async function runAutoApproveElements(taskId: number) {
  try {
    await updateTaskStatus(taskId, 'running', 0, 'Авто‑одобрение по элементам')
    const matrix = loadMatrixFromCsv()
    const targets: Array<{ grp: string; element: string; axis: 'row' | 'col' }> = []
    for (const c of matrix.columns) targets.push({ grp: c.group, element: c.label, axis: 'col' })
    for (const r of matrix.rows) targets.push({ grp: r.group, element: r.label, axis: 'row' })
    let processed = 0
    for (const t of targets) {
      if (cancelledTaskIds.has(taskId)) break
      const suggestions = await getElementSuggestions({ grp: t.grp, element: t.element, axis: t.axis }, 50)
      const decisions = await llmDecideElement(`${t.grp} / ${t.element} [${t.axis}]`, suggestions.map((s) => ({ id: s.id, price_id: s.price_id, name: s.price_name || '', unit: s.price_unit, category: s.price_category, price: s.price })))
      if (decisions && decisions.length) {
        for (const d of decisions) {
          const sugId = d.id || suggestions.find((s) => s.price_id === d.price_id)?.id
          if (!sugId) continue
          await updateElementSuggestionStatus(sugId, d.action === 'accept' ? 'accepted' : 'rejected')
          const price = await getPriceById(d.price_id!)
          await insertSuggestionEvent({ type: 'element', suggestion_id: sugId, action: d.action === 'accept' ? 'accepted' : 'rejected', price_id: d.price_id || suggestions.find((s) => s.id === sugId)?.price_id || 0, grp: t.grp, element: t.element, axis: t.axis, source: price?.source || null, source_page: price?.source_page || null })
        }
      } else if (suggestions.length) {
        const sorted = suggestions
          .map((s) => ({ s, score: typeof s.score === 'number' ? s.score : -Infinity }))
          .sort((a, b) => b.score - a.score)
        const best = sorted[0]?.s
        if (best) {
          await updateElementSuggestionStatus(best.id, 'accepted')
          const price = await getPriceById(best.price_id)
          await insertSuggestionEvent({ type: 'element', suggestion_id: best.id, action: 'accepted', price_id: best.price_id, grp: t.grp, element: t.element, axis: t.axis, source: price?.source || null, source_page: price?.source_page || null })
        }
        for (const entry of sorted.slice(1)) {
          const s = entry.s
          await updateElementSuggestionStatus(s.id, 'rejected')
          const price = await getPriceById(s.price_id)
          await insertSuggestionEvent({ type: 'element', suggestion_id: s.id, action: 'rejected', price_id: s.price_id, grp: t.grp, element: t.element, axis: t.axis, source: price?.source || null, source_page: price?.source_page || null })
        }
      }
      processed++
      if (processed % 20 === 0) {
        const progress = Math.floor((processed / targets.length) * 100)
        await updateTaskStatus(taskId, 'running', progress, `Обработано: ${processed}/${targets.length}`)
      }
    }
    await updateTaskStatus(taskId, 'done', 100, 'Готово')
  } catch (e: any) {
    await insertTaskLog(taskId, 'error', e?.message || String(e))
    await updateTaskStatus(taskId, 'error', 100, e?.message || 'Ошибка')
  }
}

async function runComputeCollisionsAll(taskId: number) {
  try {
    await updateTaskStatus(taskId, 'running', 0, 'Расчёт коллизий')
    const keys = await getAllCellKeys()
    const priceCatalog = await getPrices(10000)
    let processed = 0
    for (const k of keys) {
      if (cancelledTaskIds.has(taskId)) break
      const rowItems = await getAcceptedElementPrices(k.row_group, k.row_label, 'row', 50)
      const colItems = await getAcceptedElementPrices(k.col_group, k.col_label, 'col', 50)
      const estimate = await llmCollisionEstimate(`${k.row_group} / ${k.row_label} × ${k.col_group} / ${k.col_label}`, rowItems, colItems)
      if (estimate) {
        let min = typeof estimate.price_min === 'number' ? estimate.price_min : null
        let max = typeof estimate.price_max === 'number' ? estimate.price_max : null
        let scenarios_json = estimate.scenarios_json || null

        try {
          const scenarios: Array<{ scenario: string; rationale?: string; items?: Array<{ name: string }> }> = (() => { try { return JSON.parse(String(scenarios_json || '[]')) } catch { return [] } })()
          const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9\s]+/gi, ' ').replace(/\s+/g, ' ').trim()
          const tokenize = (s: string) => norm(s).split(' ').filter((w) => w.length > 1 && !['и','в','на','из','для','по','под','шт','м','мм','м2','м3','ед','работ','работы','монтаж','демонтаж','устройство'].includes(w))
          const score = (itemName: string, priceName: string) => {
            const a = new Set(tokenize(itemName))
            const b = new Set(tokenize(priceName))
            if (a.size === 0 || b.size === 0) return 0
            let inter = 0
            for (const t of a) if (b.has(t)) inter++
            return inter / Math.max(a.size, b.size)
          }
          const candidates = priceCatalog
          const attachMatched = (name: string): { matched_name?: string; unit_price?: number; unit?: string; currency?: string } => {
            let best: { name: string; unit?: string; price?: number; currency?: string } | null = null
            let bestScore = 0
            for (const p of candidates) {
              const sc = score(name, p.name)
              if (sc > bestScore && typeof p.price === 'number') { bestScore = sc; best = p }
            }
            if (best && bestScore >= 0.3) return { matched_name: best.name, unit_price: best.price || undefined, unit: best.unit || undefined, currency: best.currency || 'RUB' }
            return {}
          }
          let totals: number[] = []
          const withMatched = scenarios.map((sc) => {
            const items = (sc.items || []).map((it) => {
              const m = attachMatched(it.name)
              const unit_price = typeof m.unit_price === 'number' ? m.unit_price : undefined
              const quantity = 1
              const total = unit_price ? unit_price * quantity : undefined
              if (typeof total === 'number') totals.push(total)
              return { name: it.name, matched_name: m.matched_name, unit: m.unit, unit_price, quantity, total, currency: m.currency || 'RUB' }
            })
            return { ...sc, items }
          })
          if (withMatched.length) {
            const scenarioSums = withMatched.map((sc) => (sc.items || []).reduce((acc, it) => acc + (typeof it.total === 'number' ? it.total : 0), 0))
            const sMin = Math.min(...scenarioSums.filter((x) => Number.isFinite(x)))
            const sMax = Math.max(...scenarioSums.filter((x) => Number.isFinite(x)))
            if (Number.isFinite(sMin) && Number.isFinite(sMax)) { min = sMin; max = sMax }
            scenarios_json = JSON.stringify(withMatched)
          }
        } catch {}

        await upsertCollisionCost(k.id, { unit: estimate.unit || null, min, max, scenarios_json })
      }
      processed++
      if (processed % 20 === 0) {
        const progress = Math.floor((processed / keys.length) * 100)
        await updateTaskStatus(taskId, 'running', progress, `Обработано: ${processed}/${keys.length}`)
      }
    }
    await updateTaskStatus(taskId, 'done', 100, 'Готово')
  } catch (e: any) {
    await insertTaskLog(taskId, 'error', e?.message || String(e))
    await updateTaskStatus(taskId, 'error', 100, e?.message || 'Ошибка')
  }
}

async function runComputeRiskAll(taskId: number) {
  try {
    await updateTaskStatus(taskId, 'running', 0, 'Ранжирование важности')
    const keys = await getAllCellKeys()
    let processed = 0
    for (const k of keys) {
      if (cancelledTaskIds.has(taskId)) break
      const rowItems = await getAcceptedElementPrices(k.row_group, k.row_label, 'row', 50)
      const colItems = await getAcceptedElementPrices(k.col_group, k.col_label, 'col', 50)
      const risk = await llmRiskEstimate(`${k.row_group} / ${k.row_label} × ${k.col_group} / ${k.col_label}`, rowItems, colItems)
      if (risk) {
        await upsertCellRisk(k.id, { hazard: risk.hazard ?? null, importance: risk.importance ?? null, difficulty: risk.difficulty ?? null, rationale_json: risk.rationale_json || null })
      }
      processed++
      if (processed % 20 === 0) {
        const progress = Math.floor((processed / keys.length) * 100)
        await updateTaskStatus(taskId, 'running', progress, `Обработано: ${processed}/${keys.length}`)
      }
    }
    await updateTaskStatus(taskId, 'done', 100, 'Готово')
  } catch (e: any) {
    await insertTaskLog(taskId, 'error', e?.message || String(e))
    await updateTaskStatus(taskId, 'error', 100, e?.message || 'Ошибка')
  }
}

export async function startTask(type: TaskType): Promise<number> {
  const id = await insertTask(type)
  queueMicrotask(() => {
    if (type === 'sync_cells') runSyncCells(id)
    else if (type === 'build_cell_suggestions_all') runBuildCellSuggestionsAll(id)
    else if (type === 'auto_approve_elements') runAutoApproveElements(id)
    else if (type === 'compute_collisions_all') runComputeCollisionsAll(id)
    else if (type === 'compute_risk_all') runComputeRiskAll(id)
  })
  return id
}
