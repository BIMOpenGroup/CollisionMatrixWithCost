import fs from 'node:fs'
import path from 'node:path'

function parseArgs() {
  const args = new Map()
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.startsWith('--') ? a.slice(2).split('=') : [a, 'true']
    args.set(k, v)
  }
  return args
}

function parseCsv(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const probe = lines.find((l) => l.includes(',') || l.includes(';')) || ''
  const delimiter = (probe.match(/;/g) || []).length > (probe.match(/,/g) || []).length ? ';' : ','
  const rows = []
  for (const line of lines) {
    const row = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
        } else { field += ch }
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === delimiter) { row.push(field); field = '' }
        else field += ch
      }
    }
    row.push(field)
    rows.push(row)
  }
  return rows
}

function buildMatrixFromRecords(records) {
  if (!records || records.length < 3) return { columns: [], rows: [], grid: [] }
  const colGroupRow = records[0]
  const colLabelRow = records[1]
  const columns = []
  let currentColGroup = ''
  for (let i = 2; i < colLabelRow.length; i++) {
    const groupCell = (colGroupRow[i] || '').trim()
    if (groupCell) currentColGroup = groupCell
    const label = (colLabelRow[i] || '').trim()
    if (!label) continue
    columns.push({ group: currentColGroup, label })
  }
  const rows = []
  const grid = []
  let currentRowGroup = ''
  for (let r = 2; r < records.length; r++) {
    const row = records[r]
    if (!row || row.length === 0) continue
    const isSeparator = row.slice(2).every((c) => (c || '').trim() === '')
    if (isSeparator) continue
    const groupCell = (row[0] || '').trim()
    if (groupCell) currentRowGroup = groupCell
    const label = (row[1] || '').trim()
    if (!label) continue
    rows.push({ group: currentRowGroup, label })
    const values = []
    for (let c = 2; c < row.length; c++) values.push(((row[c] || '').trim()) || '')
    const normalized = values.slice(0, columns.length)
    while (normalized.length < columns.length) normalized.push('')
    grid.push(normalized)
  }
  return { columns, rows, grid }
}

async function main() {
  const args = parseArgs()
  const outPath = path.resolve('src/assets/baked-matrix.json')
  let matrix

  if (args.has('api')) {
    const api = args.get('api')
    const res = await fetch(api)
    matrix = await res.json()
    matrix.source = `baked-from-api:${api}`
  } else {
    const csv = args.get('csv') || 'public/matrix.csv'
    const text = fs.readFileSync(csv, 'utf8')
    const records = parseCsv(text)
    matrix = buildMatrixFromRecords(records)
    matrix.source = `baked-from-csv:${csv}`
  }

  fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2), 'utf8')
  console.log(`Written baked matrix to ${outPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })