import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDB, insertDiscipline, getDisciplines } from './db'
import { loadMatrixFromCsv, extractDisciplineGroups } from './matrix'

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