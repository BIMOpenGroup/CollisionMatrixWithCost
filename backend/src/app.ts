import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { insertDiscipline, getDisciplines, bulkInsertPrices, getPrices, getMappingSuggestions, getElementSuggestions, db, getMappingSuggestionById, updateMappingSuggestionStatus, getPriceById, insertSuggestionEvent, getElementSuggestionById, updateElementSuggestionStatus, getSuggestionEvents, bulkUpsertCellKeys, getCellKeyByIndices, getCellSuggestions, updateCellSuggestionStatus, insertCellItem, getCellItems, getCellSummary, getCellSuggestionById, getCellStatusSummary, getTaskById, getTaskLogs, getRecentTasks, getCollisionCostByCell, getElementStatusSummary, getCellRiskByCell, getCalcItemsByCell, upsertCollisionCost } from './db'
import { startTask, cancelTask } from './tasks'
import { scrapeGarantPrices } from './scrapeGarant'
import { loadMatrixFromCsv, extractDisciplineGroups } from './matrix'
import { buildSuggestions } from './mapping'
import { buildElementSuggestions } from './elementMapping'
import { chatCompletionOpenAICompatible, llmRerank, llmDecideCell } from './llm'
import { buildCellSuggestions } from './cellMapping'

import { getCategoryByCost } from './utils/category'

import { generateMatrixCsv } from './csv'

function countTable(name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) AS c FROM ${name}`, (err: any, row: any) => {
      if (err) return reject(err)
      resolve(Number(row?.c || 0))
    })
  })
}

export function createApp() {
  const app = express()
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/] }))
  app.use(express.json())

  app.get('/api/matrix', (req, res) => {
    try {
      const matrix = loadMatrixFromCsv()
      res.json({
        columns: matrix.columns,
        rows: matrix.rows,
        grid: matrix.grid,
        source: path.resolve(__dirname, '../../example/Матрица коллизий v2 - Лист1.csv'),
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to load matrix' })
    }
  })

  app.get('/api/export/matrix', async (req, res) => {
    try {
      const csv = await generateMatrixCsv()
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="matrix_cost.csv"')
      res.send(csv)
    } catch (e: any) {
      res.status(500).send(e?.message || 'Failed to export CSV')
    }
  })

  app.post('/api/prices/scrape', async (req, res) => {
    try {
      const rows = await scrapeGarantPrices()
      const inserted = await bulkInsertPrices(rows)
      res.json({ scraped: rows.length, inserted })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to scrape prices' })
    }
  })

  app.get('/api/prices', async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100
      const rows = await getPrices(limit)
      res.json({ prices: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to read prices' })
    }
  })

  app.post('/api/disciplines/save', async (req, res) => {
    try {
      const matrix = loadMatrixFromCsv()
      const { rowGroups, colGroups } = extractDisciplineGroups(matrix)
      let inserted = 0
      for (const rg of rowGroups) {
        await insertDiscipline(rg, 'row')
        inserted++
      }
      for (const cg of colGroups) {
        await insertDiscipline(cg, 'col')
        inserted++
      }
      const all = await getDisciplines()
      res.json({ inserted, total: all.length, disciplines: all })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save disciplines' })
    }
  })

  app.get('/api/disciplines', async (req, res) => {
    try {
      const all = await getDisciplines()
      res.json({ disciplines: all })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to read disciplines' })
    }
  })

  app.post('/api/mapping/suggest', async (req, res) => {
    try {
      const matrix = loadMatrixFromCsv()
      const { rowGroups, colGroups } = extractDisciplineGroups(matrix)
      const disciplines = Array.from(new Set([...(rowGroups || []), ...(colGroups || [])])).filter(Boolean)
      const prices = await getPrices(10000)
      const { count, byDiscipline } = await buildSuggestions(disciplines, prices, 10)
      res.json({ ok: true, count, disciplines: Object.keys(byDiscipline) })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to build mapping suggestions' })
    }
  })

  app.get('/api/mapping', async (req, res) => {
    try {
      const discipline = typeof req.query.discipline === 'string' ? req.query.discipline : undefined
      const limit = req.query.limit ? Number(req.query.limit) : 50
      const rows = await getMappingSuggestions(discipline, limit)
      res.json({ ok: true, suggestions: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read mapping suggestions' })
    }
  })

  app.post('/api/mapping/suggestions/:id/status', async (req, res) => {
    try {
      const id = Number(req.params.id)
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const status = body.status === 'accepted' || body.status === 'rejected' || body.status === 'proposed' ? body.status : undefined
      if (!Number.isFinite(id) || !status) return res.status(400).json({ ok: false, error: 'Required: numeric :id and body { status }' })
      const sug = await getMappingSuggestionById(id)
      if (!sug) return res.status(404).json({ ok: false, error: 'Suggestion not found' })
      await updateMappingSuggestionStatus(id, status)
      const price = await getPriceById(sug.price_id)
      await insertSuggestionEvent({ type: 'discipline', suggestion_id: id, action: status === 'accepted' ? 'accepted' : 'rejected', price_id: sug.price_id, source: price?.source || null, source_page: price?.source_page || null, discipline: sug.discipline || null, grp: null, element: null, axis: null })
      res.json({ ok: true, id, status })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to update suggestion status' })
    }
  })

  app.post('/api/mapping/elements/suggest', async (req, res) => {
    try {
      const matrix = loadMatrixFromCsv()
      const prices = await getPrices(10000)
      const { count, elements } = await buildElementSuggestions(matrix, prices, 8)
      res.json({ ok: true, count, elements })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to build element suggestions' })
    }
  })

  app.get('/api/mapping/elements', async (req, res) => {
    try {
      const grp = typeof req.query.grp === 'string' ? req.query.grp : undefined
      const element = typeof req.query.element === 'string' ? req.query.element : undefined
      const axis = typeof req.query.axis === 'string' ? (req.query.axis === 'row' ? 'row' : req.query.axis === 'col' ? 'col' : undefined) : undefined
      const limit = req.query.limit ? Number(req.query.limit) : 50
      const rows = await getElementSuggestions({ grp, element, axis }, limit)
      res.json({ ok: true, suggestions: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read element suggestions' })
    }
  })

  app.post('/api/mapping/elements/:id/status', async (req, res) => {
    try {
      const id = Number(req.params.id)
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const status = body.status === 'accepted' || body.status === 'rejected' || body.status === 'proposed' ? body.status : undefined
      if (!Number.isFinite(id) || !status) return res.status(400).json({ ok: false, error: 'Required: numeric :id and body { status }' })
      const sug = await getElementSuggestionById(id)
      if (!sug) return res.status(404).json({ ok: false, error: 'Element suggestion not found' })
      await updateElementSuggestionStatus(id, status)
      const price = await getPriceById(sug.price_id)
      await insertSuggestionEvent({ type: 'element', suggestion_id: id, action: status === 'accepted' ? 'accepted' : 'rejected', price_id: sug.price_id, source: price?.source || null, source_page: price?.source_page || null, discipline: null, grp: sug.grp || null, element: sug.element || null, axis: sug.axis || null })
      res.json({ ok: true, id, status })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to update element suggestion status' })
    }
  })

  app.get('/api/events/suggestions', async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 200
      const rows = await getSuggestionEvents(limit)
      res.json({ ok: true, events: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read suggestion events' })
    }
  })

  app.get('/api/debug/llm/providers', (req, res) => {
    try {
      const providers: Array<{ name: string; baseUrl: string; model: string; apiKeyPresent: boolean }> = []
      const baseUrl = process.env.LLM_BASE_URL || ''
      const model = process.env.LLM_MODEL || ''
      const apiKeyPresent = Boolean(process.env.LLM_API_KEY)
      providers.push({ name: 'llm', baseUrl, model, apiKeyPresent })
      res.json({ ok: true, llmDebugEnabled: process.env.LLM_DEBUG === '1', providers })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read LLM providers' })
    }
  })

  app.post('/api/debug/llm/ping', async (req, res) => {
    try {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const message = typeof body.message === 'string' ? body.message : 'test'
      const temperature = typeof body.temperature === 'number' ? body.temperature : 0.1

      const apiKey = process.env.LLM_API_KEY
      const baseUrl = process.env.LLM_BASE_URL
      const model = process.env.LLM_MODEL
      if (!apiKey || !baseUrl || !model) return res.status(400).json({ ok: false, error: 'LLM_* env vars not set' })

      const content = await chatCompletionOpenAICompatible({
        baseUrl,
        apiKey,
        model,
        temperature,
        messages: [
          { role: 'system', content: 'Ответь строго JSON объектом вида {"pong":true,"echo":"..."}.' },
          { role: 'user', content: message },
        ],
      })

      res.json({ ok: true, provider: 'llm', baseUrl, model, content })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'LLM ping failed' })
    }
  })

  app.post('/api/debug/llm/rerank', async (req, res) => {
    try {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const discipline: string | undefined = typeof body.discipline === 'string' ? body.discipline : undefined
      const candidates: Array<{ name: string; unit?: string; category?: string }> = Array.isArray(body.candidates) ? body.candidates : []
      if (!discipline || !candidates.length) return res.status(400).json({ ok: false, error: 'Required: { discipline: string, candidates: [{name, unit?, category?}] }' })
      const result = await llmRerank(discipline, candidates)
      res.json({ ok: true, discipline, candidates, result })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'LLM rerank failed' })
    }
  })

  app.get('/api/debug/logs/llm', (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 200
      const logPath = path.resolve(__dirname, '../logs/llm.log')
      if (!fs.existsSync(logPath)) return res.json({ ok: true, lines: [], totalLines: 0 })
      const raw = fs.readFileSync(logPath, 'utf-8')
      const lines = raw.split(/\r?\n/)
      const tail = lines.slice(Math.max(0, lines.length - limit))
      res.json({ ok: true, lines: tail, totalLines: lines.length, returned: tail.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read LLM logs' })
    }
  })

  app.get('/api/debug/db/counts', async (req, res) => {
    try {
      const [disciplinesCount, pricesCount, mappingCount, elementsCount] = await Promise.all([
        countTable('disciplines'),
        countTable('prices'),
        countTable('mapping_suggestions'),
        countTable('element_suggestions'),
      ])
      res.json({ ok: true, counts: { disciplines: disciplinesCount, prices: pricesCount, mapping_suggestions: mappingCount, element_suggestions: elementsCount } })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read DB counts' })
    }
  })

  app.post('/api/tasks/start', async (req, res) => {
    try {
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const type: string = typeof body.type === 'string' ? body.type : ''
      const allowed = new Set(['sync_cells','auto_approve_elements','build_cell_suggestions_all','compute_collisions_all','compute_risk_all'])
      if (!allowed.has(type)) return res.status(400).json({ ok: false, error: 'Invalid type' })
      const task_id = await startTask(type as any)
      res.json({ ok: true, task_id })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to start task' })
    }
  })

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid id' })
      const row = await getTaskById(id)
      if (!row) return res.status(404).json({ ok: false, error: 'Task not found' })
      res.json({ ok: true, task: row })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read task' })
    }
  })

  app.get('/api/tasks/:id/logs', async (req, res) => {
    try {
      const id = Number(req.params.id)
      const limit = req.query.limit ? Number(req.query.limit) : 200
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid id' })
      const rows = await getTaskLogs(id, limit)
      res.json({ ok: true, logs: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read task logs' })
    }
  })

  app.get('/api/tasks', async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 10
      const rows = await getRecentTasks(limit)
      res.json({ ok: true, tasks: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read tasks' })
    }
  })

  app.post('/api/tasks/:id/stop', async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid id' })
      await cancelTask(id)
      res.json({ ok: true, id })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to stop task' })
    }
  })

  app.post('/api/cells/init', async (req, res) => {
    try {
      const matrix = loadMatrixFromCsv()
      const rows: Array<{ row_index: number; col_index: number; row_group: string; row_label: string; col_group: string; col_label: string }> = []
      for (let ri = 0; ri < matrix.rows.length; ri++) {
        for (let ci = 0; ci < matrix.columns.length; ci++) {
          rows.push({ row_index: ri, col_index: ci, row_group: matrix.rows[ri].group, row_label: matrix.rows[ri].label, col_group: matrix.columns[ci].group, col_label: matrix.columns[ci].label })
        }
      }
      const count = await bulkUpsertCellKeys(rows)
      res.json({ ok: true, count })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to init cell keys' })
    }
  })

  app.post('/api/cells/:rowIndex/:colIndex/suggest', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const matrix = loadMatrixFromCsv()
      const prices = await getPrices(10000)
      const result = await buildCellSuggestions(matrix, rowIndex, colIndex, prices, 8)
      res.json({ ok: true, ...result })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to build cell suggestions' })
    }
  })

  app.get('/api/cells/:rowIndex/:colIndex/suggestions', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      const workType = typeof req.query.work_type === 'string' ? req.query.work_type : undefined
      const key = await getCellKeyByIndices(rowIndex, colIndex)
      if (!key) return res.json({ ok: true, suggestions: [], total: 0 })
      const rows = await getCellSuggestions(key.id, { work_type: workType }, req.query.limit ? Number(req.query.limit) : 50)
      res.json({ ok: true, suggestions: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read cell suggestions' })
    }
  })

  app.post('/api/cells/suggestions/:id/status', async (req, res) => {
    try {
      const id = Number(req.params.id)
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const status = body.status === 'accepted' || body.status === 'rejected' || body.status === 'proposed' ? body.status : undefined
      if (!Number.isFinite(id) || !status) return res.status(400).json({ ok: false, error: 'Required: numeric :id and body { status }' })
      await updateCellSuggestionStatus(id, status)
      res.json({ ok: true, id, status })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to update cell suggestion status' })
    }
  })

  app.post('/api/cells/:rowIndex/:colIndex/items', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const price_id = Number(body.price_id)
      const work_type = typeof body.work_type === 'string' ? body.work_type : undefined
      const quantity = typeof body.quantity === 'number' ? body.quantity : undefined
      const unit_price = typeof body.unit_price === 'number' ? body.unit_price : undefined
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex) || !Number.isFinite(price_id)) return res.status(400).json({ ok: false, error: 'Required: rowIndex, colIndex, price_id' })
      await insertCellItem(rowIndex, colIndex, { work_type: work_type || null, price_id, quantity: quantity ?? null, unit_price: unit_price ?? null })
      res.json({ ok: true })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to insert cell item' })
    }
  })

  app.get('/api/cells/:rowIndex/:colIndex/items', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      const rows = await getCellItems(rowIndex, colIndex)
      res.json({ ok: true, items: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read cell items' })
    }
  })

  app.get('/api/cells/:rowIndex/:colIndex/collision-cost', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const row = await getCollisionCostByCell(rowIndex, colIndex)
      const category = row ? getCategoryByCost(row.max || row.min || null) : null
      res.json({ ok: true, collision: row ? { ...row, category } : null })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read collision cost' })
    }
  })

  app.post('/api/cells/:rowIndex/:colIndex/collision-scenarios', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      const body = typeof req.body === 'object' && req.body ? req.body : {}
      const scenarios: Array<{ scenario: string; rationale?: string; measures?: Record<string, number>; items?: Array<{ name?: string; price_id?: number; quantity?: number }> }> = Array.isArray(body.scenarios) ? body.scenarios : []
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const key = await getCellKeyByIndices(rowIndex, colIndex)
      if (!key) return res.status(404).json({ ok: false, error: 'Cell not found' })
      const prices = await getPrices(10000)
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
      const attachMatched = (name: string): { matched_name?: string; unit_price?: number; unit?: string; currency?: string } => {
        let best: { name: string; unit?: string; price?: number; currency?: string } | null = null
        let bestScore = 0
        for (const p of prices) {
          const sc = score(name, p.name)
          if (sc > bestScore && typeof p.price === 'number') { bestScore = sc; best = p }
        }
        if (best && bestScore >= 0.3) return { matched_name: best.name, unit_price: best.price || undefined, unit: best.unit || undefined, currency: best.currency || 'RUB' }
        return {}
      }
      const unitKey = (u?: string): 'area_m2' | 'length_m' | 'volume_m3' | 'count' | null => {
        const s = (u || '').toLowerCase()
        if (!s) return null
        if (/(м2|м²)/.test(s)) return 'area_m2'
        if (/(м3|м³)/.test(s)) return 'volume_m3'
        if (/шт/.test(s)) return 'count'
        if (/(п\.м|м\.п|\bм\b)/.test(s) || (/м/.test(s) && !/(м2|м²|м3|м³)/.test(s))) return 'length_m'
        return null
      }
      const withMatched: Array<any> = []
      for (const sc of scenarios) {
        const items: Array<any> = []
        for (const it of (sc.items || [])) {
          let matched_name: string | undefined
          let unit_price: number | undefined
          let unit: string | undefined
          let currency: string = 'RUB'
          if (Number.isFinite(Number((it as any).price_id))) {
            const p = await getPriceById(Number((it as any).price_id))
            if (p) {
              matched_name = p.name
              unit = p.unit || undefined
              unit_price = typeof p.price === 'number' ? p.price : undefined
              currency = p.currency || 'RUB'
            }
          } else {
            const m = attachMatched(String((it as any).name || ''))
            matched_name = m.matched_name
            unit = m.unit
            unit_price = typeof m.unit_price === 'number' ? m.unit_price : undefined
            currency = m.currency || 'RUB'
          }
          const key = unitKey(unit)
          const measures = (sc.measures || {}) as Record<string, number>
          const quantity = (typeof (it as any).quantity === 'number' && Number.isFinite((it as any).quantity))
            ? Number((it as any).quantity)
            : (key && typeof measures[key] === 'number' && Number.isFinite(measures[key]!))
              ? Number(measures[key]!)
              : 1
          const total = unit_price ? unit_price * quantity : undefined
          items.push({ name: String((it as any).name || matched_name || ''), price_id: Number.isFinite(Number((it as any).price_id)) ? Number((it as any).price_id) : undefined, matched_name, unit, unit_price, quantity, total, currency })
        }
        withMatched.push({ ...sc, items })
      }
      const scenarioSums = withMatched.map((sc) => (sc.items || []).reduce((acc: number, it: { total?: number }) => acc + (typeof it.total === 'number' ? it.total : 0), 0))
      const sMin = Math.min(...scenarioSums.filter((x) => Number.isFinite(x)))
      const sMax = Math.max(...scenarioSums.filter((x) => Number.isFinite(x)))
      const category = getCategoryByCost(Number.isFinite(sMax) ? sMax : (Number.isFinite(sMin) ? sMin : null))
      const unit = body.unit && typeof body.unit === 'string' ? body.unit : null
      await upsertCollisionCost(key.id, { unit: unit || null, min: Number.isFinite(sMin) ? sMin : null, max: Number.isFinite(sMax) ? sMax : null, scenarios_json: JSON.stringify(withMatched) })
      res.json({ ok: true, min: Number.isFinite(sMin) ? sMin : null, max: Number.isFinite(sMax) ? sMax : null, category })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to update scenarios' })
    }
  })

  app.get('/api/mapping/elements/status-summary', async (req, res) => {
    try {
      const axis = typeof req.query.axis === 'string' && (req.query.axis === 'row' || req.query.axis === 'col') ? (req.query.axis as 'row' | 'col') : 'row'
      const rows = await getElementStatusSummary(axis)
      res.json({ ok: true, statuses: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read element status summary' })
    }
  })

  app.get('/api/cells/:rowIndex/:colIndex/risk', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const row = await getCellRiskByCell(rowIndex, colIndex)
      res.json({ ok: true, risk: row })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read cell risk' })
    }
  })

  app.get('/api/cells/:rowIndex/:colIndex/calc-items', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const payload = await getCalcItemsByCell(rowIndex, colIndex)
      res.json({ ok: true, ...payload })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read calc items' })
    }
  })

  app.get('/api/cells/summary', async (req, res) => {
    try {
      const rows = await getCellSummary()
      res.json({ ok: true, summary: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read cell summary' })
    }
  })

  app.get('/api/cells/status-summary', async (req, res) => {
    try {
      const rows = await getCellStatusSummary()
      res.json({ ok: true, statuses: rows, total: rows.length })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to read cell status summary' })
    }
  })

  app.post('/api/cells/:rowIndex/:colIndex/auto-approve', async (req, res) => {
    try {
      const rowIndex = Number(req.params.rowIndex)
      const colIndex = Number(req.params.colIndex)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return res.status(400).json({ ok: false, error: 'rowIndex/colIndex required' })
      const key = await getCellKeyByIndices(rowIndex, colIndex)
      if (!key) return res.status(404).json({ ok: false, error: 'Cell not found' })
      const suggestions = await getCellSuggestions(key.id, {}, 50)
      if (!suggestions.length) return res.json({ ok: true, updated: 0 })
      const decisions = await llmDecideCell(`${key.row_group} / ${key.row_label} × ${key.col_group} / ${key.col_label}`, suggestions.map((s) => ({ suggestion_id: s.id, price_id: s.price_id, name: s.price_name || '', unit: s.price_unit, category: s.price_category, score: s.score })))
      let updated = 0
      if (decisions && decisions.length) {
        for (const d of decisions) {
          const sugId = d.suggestion_id || suggestions.find((s) => s.price_id === d.price_id)?.id
          if (!sugId) continue
          await updateCellSuggestionStatus(sugId, d.action === 'accept' ? 'accepted' : 'rejected')
          updated++
          const sugRow = await getCellSuggestionById(sugId)
          if (sugRow && d.action === 'accept') {
            await insertCellItem(rowIndex, colIndex, { work_type: null, price_id: sugRow.price_id, quantity: typeof d.quantity === 'number' ? d.quantity : null, unit_price: typeof d.unit_price === 'number' ? d.unit_price : null })
          }
        }
      }
      res.json({ ok: true, updated })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to auto-approve cell suggestions' })
    }
  })

  return app
}
