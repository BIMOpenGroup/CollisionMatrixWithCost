import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

beforeAll(() => {
  process.env.SQLITE_DB_PATH = ':memory:'
})

describe('API basic endpoints', () => {
  it('returns db counts and prices', async () => {
    const { initDB, insertPrice } = await import('../src/db')
    const { createApp } = await import('../src/app')
    await initDB()
    const app = createApp()

    let res = await request(app).get('/api/debug/db/counts')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    await insertPrice({ category: 'ОВ', name: 'Монтаж радиатора', unit: 'шт', price: 1000, currency: 'RUB', source: 'test', source_page: 'test://page' })

    res = await request(app).get('/api/prices?limit=10')
    expect(res.status).toBe(200)
    expect(res.body.prices.length).toBe(1)
  })
})

