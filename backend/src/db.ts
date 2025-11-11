import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'

sqlite3.verbose()

const dbPath = path.resolve(__dirname, '../data/cmw.db')
const dbDir = path.dirname(dbPath)

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

export const db = new sqlite3.Database(dbPath)

export function initDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS disciplines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          scope TEXT CHECK(scope IN ('row','col')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS prices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT,
          name TEXT NOT NULL,
          unit TEXT,
          price REAL,
          currency TEXT DEFAULT 'RUB',
          source TEXT NOT NULL,
          source_page TEXT NOT NULL,
          extra TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, unit, source_page)
        )`,
        (err) => {
          if (err) return reject(err)
          resolve()
        }
      )
    })
  })
}

export function insertDiscipline(name: string, scope: 'row' | 'col'): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO disciplines (name, scope) VALUES (?, ?)`,
      [name, scope],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function getDisciplines(): Promise<Array<{ id: number; name: string; scope: string }>> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, name, scope FROM disciplines ORDER BY name ASC`, (err, rows) => {
      if (err) return reject(err)
      resolve(rows as Array<{ id: number; name: string; scope: string }>)
    })
  })
}

export type PriceRow = {
  category?: string
  name: string
  unit?: string
  price?: number
  currency?: string
  source: string
  source_page: string
  extra?: string
}

export function insertPrice(row: PriceRow): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO prices (category, name, unit, price, currency, source, source_page, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.category || null,
        row.name,
        row.unit || null,
        typeof row.price === 'number' ? row.price : null,
        row.currency || 'RUB',
        row.source,
        row.source_page,
        row.extra || null,
      ],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function bulkInsertPrices(rows: PriceRow[]): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO prices (category, name, unit, price, currency, source, source_page, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      let count = 0
      for (const r of rows) {
        stmt.run(
          [
            r.category || null,
            r.name,
            r.unit || null,
            typeof r.price === 'number' ? r.price : null,
            r.currency || 'RUB',
            r.source,
            r.source_page,
            r.extra || null,
          ],
          (err) => {
            if (err) return reject(err)
            count++
          }
        )
      }
      stmt.finalize((err) => {
        if (err) return reject(err)
        resolve(count)
      })
    })
  })
}

export function getPrices(limit = 100): Promise<PriceRow[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT category, name, unit, price, currency, source, source_page, extra
       FROM prices
       ORDER BY category, name
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as PriceRow[])
      }
    )
  })
}