import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDB, insertDiscipline, getDisciplines, bulkInsertPrices, getPrices, getMappingSuggestions, getElementSuggestions } from './db'
import { scrapeGarantPrices } from './scrapeGarant'
import { loadMatrixFromCsv, extractDisciplineGroups } from './matrix'
import { buildSuggestions } from './mapping'
import { buildElementSuggestions } from './elementMapping'

const app = express()
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/] }))
app.use(express.json())

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

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

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[backend] Listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('[backend] DB init error:', err)
    process.exit(1)
  })