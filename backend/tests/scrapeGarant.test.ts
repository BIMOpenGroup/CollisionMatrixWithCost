import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const html = fs.readFileSync(path.resolve(__dirname, './fixtures/garant.html'), 'utf8')

vi.mock('undici', () => {
  return {
    fetch: async () => ({ ok: true, text: async () => html, status: 200, statusText: 'OK' }),
  }
})

import { scrapeGarantPrices } from '../src/scrapeGarant'

describe('scrapeGarantPrices', () => {
  it('parses table and normalizes price', async () => {
    const rows = await scrapeGarantPrices()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const r = rows.find((x) => x.name.includes('радиатора'))
    expect(r?.unit).toBe('шт')
    expect(r?.price).toBe(12345.67)
    const names = new Set(rows.map((x) => `${x.name.toLowerCase()}|${(x.unit || '').toLowerCase()}`))
    expect(names.size).toBe(rows.length)
  })
})

