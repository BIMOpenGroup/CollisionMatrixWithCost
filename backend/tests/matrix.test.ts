import { describe, it, expect, vi } from 'vitest'
import path from 'path'

vi.mock('fs', async () => {
  const actual = await import('fs')
  const fixturePath = path.resolve(__dirname, './fixtures/matrix.csv')
  const fixture = actual.readFileSync(fixturePath, 'utf8')
  return {
    ...actual,
    existsSync: (p: any) => {
      const s = String(p).replace(/\\/g, '/')
      if (s.endsWith('/frontend/public/matrix.csv')) return true
      if (s.includes('Матрица коллизий v2 - Лист1.csv')) return true
      return actual.existsSync(p as any)
    },
    readFileSync: (p: any, enc?: any) => {
      const s = String(p).replace(/\\/g, '/')
      if (s.endsWith('/frontend/public/matrix.csv')) return fixture
      if (s.includes('Матрица коллизий v2 - Лист1.csv')) return fixture
      return actual.readFileSync(p as any, enc as any)
    },
  }
})

import { loadMatrixFromCsv, extractDisciplineGroups } from '../src/matrix'

describe('matrix CSV parsing', () => {
  it('loads matrix with consistent shape', () => {
    const m = loadMatrixFromCsv()
    expect(Array.isArray(m.columns)).toBe(true)
    expect(Array.isArray(m.rows)).toBe(true)
    expect(Array.isArray(m.grid)).toBe(true)
    expect(m.columns.length).toBeGreaterThan(0)
    expect(m.rows.length).toBeGreaterThan(0)
    expect(m.grid.length).toBe(m.rows.length)
    for (const row of m.grid) expect(row.length).toBe(m.columns.length)
  })

  it('extracts discipline groups', () => {
    const m = loadMatrixFromCsv()
    const { rowGroups, colGroups } = extractDisciplineGroups(m)
    expect(Array.isArray(rowGroups)).toBe(true)
    expect(Array.isArray(colGroups)).toBe(true)
    expect(rowGroups.length).toBeGreaterThan(0)
    expect(colGroups.length).toBeGreaterThan(0)
  })
})
