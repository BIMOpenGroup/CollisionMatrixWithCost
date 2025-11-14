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
    let processed = 0
    for (const k of keys) {
      if (cancelledTaskIds.has(taskId)) break
      const rowItems = await getAcceptedElementPrices(k.row_group, k.row_label, 'row', 50)
      const colItems = await getAcceptedElementPrices(k.col_group, k.col_label, 'col', 50)
      const estimate = await llmCollisionEstimate(`${k.row_group} / ${k.row_label} × ${k.col_group} / ${k.col_label}`, rowItems, colItems)
      if (estimate) {
        await upsertCollisionCost(k.id, { unit: estimate.unit || null, min: typeof estimate.price_min === 'number' ? estimate.price_min : null, max: typeof estimate.price_max === 'number' ? estimate.price_max : null, scenarios_json: estimate.scenarios_json || null })
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
