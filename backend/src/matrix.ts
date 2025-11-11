import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

export type MatrixColumn = { group: string; label: string }
export type MatrixRow = { group: string; label: string }
export type MatrixData = {
  columns: MatrixColumn[]
  rows: MatrixRow[]
  grid: string[][]
}

export function loadMatrixFromCsv(): MatrixData {
  const frontendCsv = path.resolve(__dirname, '../../frontend/public/matrix.csv')
  const exampleCsv = path.resolve(__dirname, '../../example/Матрица коллизий v2 - Лист1.csv')
  const csvPath = fs.existsSync(frontendCsv) ? frontendCsv : exampleCsv
  const csv = fs.readFileSync(csvPath, 'utf8')
  const records: string[][] = parse(csv, {
    skip_empty_lines: false,
  })

  if (records.length < 3) {
    throw new Error('CSV матрицы выглядит неполным')
  }

  const colGroupRow = records[0]
  const colLabelRow = records[1]

  // Заполняем группу колонок, распространяя последнее непустое значение
  const columns: MatrixColumn[] = []
  let currentColGroup = ''
  for (let i = 2; i < colLabelRow.length; i++) {
    const groupCell = (colGroupRow[i] || '').trim()
    if (groupCell) currentColGroup = groupCell
    const label = (colLabelRow[i] || '').trim()
    if (!label) continue
    columns.push({ group: currentColGroup, label })
  }

  const rows: MatrixRow[] = []
  const grid: string[][] = []
  let currentRowGroup = ''

  for (let r = 2; r < records.length; r++) {
    const row = records[r]
    if (!row || row.length === 0) continue

    // Строки-разделители: полностью пустые после первых двух ячеек
    const isSeparator = row.slice(2).every((c) => (c || '').trim() === '')
    if (isSeparator) continue

    const groupCell = (row[0] || '').trim()
    if (groupCell) currentRowGroup = groupCell
    const label = (row[1] || '').trim()
    if (!label) continue

    rows.push({ group: currentRowGroup, label })
    const values: string[] = []
    for (let c = 2; c < row.length; c++) {
      values.push(((row[c] || '').trim()) || '')
    }
    // Укорачиваем/дополняем строку значений до количества колонок
    const normalized = values.slice(0, columns.length)
    while (normalized.length < columns.length) normalized.push('')
    grid.push(normalized)
  }

  return { columns, rows, grid }
}

export function extractDisciplineGroups(matrix: MatrixData): {
  rowGroups: string[]
  colGroups: string[]
} {
  const rowGroups = Array.from(new Set(matrix.rows.map((r) => r.group).filter(Boolean)))
  const colGroups = Array.from(new Set(matrix.columns.map((c) => c.group).filter(Boolean)))
  return { rowGroups, colGroups }
}