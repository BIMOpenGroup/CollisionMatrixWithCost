import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { insertDiscipline, getDisciplines, bulkInsertPrices, getPrices, getMappingSuggestions, getElementSuggestions, db, getMappingSuggestionById, updateMappingSuggestionStatus, getPriceById, insertSuggestionEvent, getElementSuggestionById, updateElementSuggestionStatus, getSuggestionEvents } from './db'
import { scrapeGarantPrices } from './scrapeGarant'
import { loadMatrixFromCsv, extractDisciplineGroups } from './matrix'
import { buildSuggestions } from './mapping'
import { buildElementSuggestions } from './elementMapping'
import { chatCompletionOpenAICompatible, llmRerank } from './llm'

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

  return app
}
