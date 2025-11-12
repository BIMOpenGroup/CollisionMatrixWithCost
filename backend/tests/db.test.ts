import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SQLITE_DB_PATH = ':memory:'
})

describe('db basic operations', () => {
  it('initializes tables and inserts/reads data', async () => {
    const dbMod = await import('../src/db')
    const { initDB, insertPrice, getPrices, bulkInsertMappingSuggestions, getMappingSuggestions, bulkInsertElementSuggestions, getElementSuggestions } = dbMod
    await initDB()

    await insertPrice({ category: 'ОВ', name: 'Монтаж радиатора', unit: 'шт', price: 1000, currency: 'RUB', source: 'test', source_page: 'test://page' })
    await insertPrice({ category: 'АР', name: 'Установка двери', unit: 'шт', price: 500, currency: 'RUB', source: 'test', source_page: 'test://page2' })
    const prices = await getPrices(10)
    expect(prices.length).toBe(2)

    const rad = prices.find((p) => p.name.includes('радиатора'))!
    await bulkInsertMappingSuggestions([{ discipline: 'ОВ', price_id: rad.id, score: 0.9, method: 'test' }])
    const mapRows = await getMappingSuggestions('ОВ', 10)
    expect(mapRows.length).toBeGreaterThanOrEqual(1)

    await bulkInsertElementSuggestions([{ grp: 'ОВ (Отоп.)', element: 'Радиаторы', axis: 'row', price_id: rad.id, score: 0.8, method: 'test' }])
    const elemRows = await getElementSuggestions({ grp: 'ОВ (Отоп.)', element: 'Радиаторы', axis: 'row' }, 10)
    expect(elemRows.length).toBeGreaterThanOrEqual(1)
    expect(elemRows[0].price_name).toBeDefined()
  })
})

