import '../env'
import { initDB, bulkInsertPrices, getPrices } from '../db'
import { scrapeGarantPrices } from '../scrapeGarant'
import { loadMatrixFromCsv, extractDisciplineGroups } from '../matrix'
import { buildSuggestions } from '../mapping'
import { buildElementSuggestions } from '../elementMapping'
import fs from 'fs'
import path from 'path'

async function main() {
  process.env.LLM_DEBUG = process.env.LLM_DEBUG || '1'
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test'

  await initDB()
  const scraped = await scrapeGarantPrices()
  const inserted = await bulkInsertPrices(scraped)
  console.log(`[runMapping] scraped=${scraped.length} inserted=${inserted}`)

  const matrix = loadMatrixFromCsv()
  const { rowGroups, colGroups } = extractDisciplineGroups(matrix)
  const disciplines = Array.from(new Set([...(rowGroups || []), ...(colGroups || [])])).filter(Boolean)
  const prices = await getPrices(10000)

  const sugg = await buildSuggestions(disciplines, prices, 10)
  console.log(`[runMapping] mapping_suggestions persisted count=${sugg.count}`)

  const elem = await buildElementSuggestions(matrix, prices, 8)
  console.log(`[runMapping] element_suggestions persisted count=${elem.count}`)

  const logPath = path.resolve(__dirname, '../../logs/llm.log')
  if (fs.existsSync(logPath)) {
    const raw = fs.readFileSync(logPath, 'utf-8')
    const lines = raw.split(/\r?\n/).slice(-50)
    console.log('[runMapping] LLM log tail:\n' + lines.join('\n'))
  } else {
    console.log('[runMapping] LLM log not found')
  }
}

main().catch((e) => {
  console.error('[runMapping] error:', e?.message || e)
  process.exit(1)
})
