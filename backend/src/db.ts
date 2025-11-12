import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'

sqlite3.verbose()

const defaultDbPath = path.resolve(__dirname, '../data/cmw.db')
const configuredPath = (process.env.SQLITE_DB_PATH || '').trim()
const dbPath = configuredPath ? configuredPath : defaultDbPath
const isMemory = dbPath === ':memory:'
const dbDir = isMemory ? '' : path.dirname(dbPath)

if (!isMemory) {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
}

export const db = new sqlite3.Database(dbPath)

export function initDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.exec(`PRAGMA foreign_keys = ON`)
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
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS mapping_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discipline TEXT NOT NULL,
          price_id INTEGER NOT NULL,
          score REAL,
          method TEXT,
          status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(discipline, price_id),
          FOREIGN KEY(price_id) REFERENCES prices(id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS element_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          grp TEXT NOT NULL,
          element TEXT NOT NULL,
          axis TEXT NOT NULL CHECK(axis IN ('row','col')),
          price_id INTEGER NOT NULL,
          score REAL,
          method TEXT,
          status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(grp, element, axis, price_id),
          FOREIGN KEY(price_id) REFERENCES prices(id) ON DELETE CASCADE
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

export type StoredPriceRow = PriceRow & { id: number }

export function insertPrice(row: PriceRow): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO prices (category, name, unit, price, currency, source, source_page, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name, unit, source_page) DO UPDATE SET
         category=excluded.category,
         price=excluded.price,
         currency=excluded.currency,
         source=excluded.source,
         extra=excluded.extra`,
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
        `INSERT INTO prices (category, name, unit, price, currency, source, source_page, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name, unit, source_page) DO UPDATE SET
           category=excluded.category,
           price=excluded.price,
           currency=excluded.currency,
           source=excluded.source,
           extra=excluded.extra`
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

export function getPrices(limit = 100): Promise<StoredPriceRow[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, category, name, unit, price, currency, source, source_page, extra
       FROM prices
       ORDER BY category, name
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as StoredPriceRow[])
      }
    )
  })
}

export type MappingSuggestionInput = {
  discipline: string
  price_id: number
  score?: number
  method?: string
  status?: 'proposed' | 'accepted' | 'rejected'
}

export type MappingSuggestion = MappingSuggestionInput & { id: number; created_at: string }

export function insertMappingSuggestion(s: MappingSuggestionInput): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO mapping_suggestions (discipline, price_id, score, method, status)
       VALUES (?, ?, ?, ?, COALESCE(?, 'proposed'))`,
      [s.discipline, s.price_id, s.score || null, s.method || null, s.status || null],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function bulkInsertMappingSuggestions(suggestions: MappingSuggestionInput[]): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO mapping_suggestions (discipline, price_id, score, method, status)
         VALUES (?, ?, ?, ?, COALESCE(?, 'proposed'))`
      )
      let count = 0
      for (const s of suggestions) {
        stmt.run([s.discipline, s.price_id, typeof s.score === 'number' ? s.score : null, s.method || null, s.status || null], (err) => {
          if (err) return reject(err)
          count++
        })
      }
      stmt.finalize((err) => {
        if (err) return reject(err)
        resolve(count)
      })
    })
  })
}

export function getMappingSuggestions(discipline?: string, limit = 50): Promise<MappingSuggestion[]> {
  return new Promise((resolve, reject) => {
    const base = `SELECT id, discipline, price_id, score, method, status, created_at
                  FROM mapping_suggestions`
    const where = discipline ? ` WHERE discipline = ?` : ''
    db.all(
      base + where + ` ORDER BY (score IS NULL), score DESC, created_at DESC LIMIT ?`,
      discipline ? [discipline, limit] : [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as MappingSuggestion[])
      }
    )
  })
}

export type ElementSuggestionInput = {
  grp: string
  element: string
  axis: 'row' | 'col'
  price_id: number
  score?: number
  method?: string
  status?: 'proposed' | 'accepted' | 'rejected'
}

export type ElementSuggestion = ElementSuggestionInput & { id: number; created_at: string }

export function bulkInsertElementSuggestions(suggestions: ElementSuggestionInput[]): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO element_suggestions (grp, element, axis, price_id, score, method, status)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'proposed'))`
      )
      let count = 0
      for (const s of suggestions) {
        stmt.run(
          [s.grp, s.element, s.axis, s.price_id, typeof s.score === 'number' ? s.score : null, s.method || null, s.status || null],
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

export function getElementSuggestions(
  filter: { grp?: string; element?: string; axis?: 'row' | 'col' },
  limit = 50
): Promise<(ElementSuggestion & { price_name?: string; price_unit?: string; price_category?: string; price?: number; price_currency?: string })[]> {
  return new Promise((resolve, reject) => {
    const whereParts: string[] = []
    const params: any[] = []
    if (filter.grp) {
      whereParts.push('es.grp = ?')
      params.push(filter.grp)
    }
    if (filter.element) {
      whereParts.push('es.element = ?')
      params.push(filter.element)
    }
    if (filter.axis) {
      whereParts.push('es.axis = ?')
      params.push(filter.axis)
    }
    const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : ''
    const sql = `SELECT es.id, es.grp, es.element, es.axis, es.price_id, es.score, es.method, es.status, es.created_at,
                        p.name AS price_name, p.unit AS price_unit, p.category AS price_category, p.price AS price, p.currency AS price_currency
                 FROM element_suggestions es
                 LEFT JOIN prices p ON p.id = es.price_id${where}
                 ORDER BY (es.score IS NULL), es.score DESC, es.created_at DESC
                 LIMIT ?`
    params.push(limit)
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}
