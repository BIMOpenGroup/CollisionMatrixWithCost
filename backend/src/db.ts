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
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS suggestion_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('discipline','element','cell')),
          suggestion_id INTEGER NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('accepted','rejected')),
          price_id INTEGER NOT NULL,
          source TEXT,
          source_page TEXT,
          discipline TEXT,
          grp TEXT,
          element TEXT,
          axis TEXT CHECK(axis IN ('row','col')),
          cell_id INTEGER,
          row_index INTEGER,
          col_index INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS cell_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          row_index INTEGER NOT NULL,
          col_index INTEGER NOT NULL,
          row_group TEXT NOT NULL,
          row_label TEXT NOT NULL,
          col_group TEXT NOT NULL,
          col_label TEXT NOT NULL,
          UNIQUE(row_index, col_index)
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS cell_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cell_id INTEGER NOT NULL,
          work_type TEXT,
          price_id INTEGER NOT NULL,
          score REAL,
          method TEXT,
          status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(cell_id, price_id, work_type),
          FOREIGN KEY(cell_id) REFERENCES cell_keys(id) ON DELETE CASCADE,
          FOREIGN KEY(price_id) REFERENCES prices(id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS cell_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cell_id INTEGER NOT NULL,
          work_type TEXT,
          price_id INTEGER NOT NULL,
          quantity REAL,
          unit_price REAL,
          currency TEXT DEFAULT 'RUB',
          total REAL,
          source TEXT,
          source_page TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(cell_id) REFERENCES cell_keys(id) ON DELETE CASCADE,
          FOREIGN KEY(price_id) REFERENCES prices(id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS collision_costs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cell_id INTEGER NOT NULL UNIQUE,
          unit TEXT,
          min REAL,
          max REAL,
          scenarios_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(cell_id) REFERENCES cell_keys(id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS cell_risks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cell_id INTEGER NOT NULL UNIQUE,
          hazard REAL,
          importance REAL,
          difficulty REAL,
          rationale_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(cell_id) REFERENCES cell_keys(id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('queued','running','done','error')),
          progress INTEGER DEFAULT 0,
          message TEXT,
          started_at DATETIME,
          finished_at DATETIME
        )`,
        (err) => {
          if (err) return reject(err)
        }
      )

      db.run(
        `CREATE TABLE IF NOT EXISTS task_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          ts DATETIME DEFAULT CURRENT_TIMESTAMP,
          level TEXT DEFAULT 'info',
          message TEXT,
          data TEXT,
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
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

export function getPriceById(id: number): Promise<StoredPriceRow | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, category, name, unit, price, currency, source, source_page, extra FROM prices WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err)
        resolve((row as StoredPriceRow) || null)
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

export function getMappingSuggestions(
  discipline?: string,
  limit = 50
): Promise<(MappingSuggestion & { price_name?: string; price_unit?: string; price_category?: string; price?: number; price_currency?: string; price_source?: string; price_source_page?: string })[]> {
  return new Promise((resolve, reject) => {
    const base = `SELECT ms.id, ms.discipline, ms.price_id, ms.score, ms.method, ms.status, ms.created_at,
                         p.name AS price_name, p.unit AS price_unit, p.category AS price_category, p.price AS price, p.currency AS price_currency,
                         p.source AS price_source, p.source_page AS price_source_page
                  FROM mapping_suggestions ms
                  LEFT JOIN prices p ON p.id = ms.price_id`
    const where = discipline ? ` WHERE discipline = ?` : ''
    db.all(
      base + where + ` ORDER BY (ms.score IS NULL), ms.score DESC, ms.created_at DESC LIMIT ?`,
      discipline ? [discipline, limit] : [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as any)
      }
    )
  })
}

export function getMappingSuggestionById(id: number): Promise<MappingSuggestion | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, discipline, price_id, score, method, status, created_at FROM mapping_suggestions WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err)
        resolve((row as MappingSuggestion) || null)
      }
    )
  })
}

export function updateMappingSuggestionStatus(id: number, status: 'accepted' | 'rejected' | 'proposed'): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE mapping_suggestions SET status = ? WHERE id = ?`, [status, id], (err) => {
      if (err) return reject(err)
      resolve()
    })
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
): Promise<(ElementSuggestion & { price_name?: string; price_unit?: string; price_category?: string; price?: number; price_currency?: string; price_source?: string; price_source_page?: string })[]> {
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
                        p.name AS price_name, p.unit AS price_unit, p.category AS price_category, p.price AS price, p.currency AS price_currency,
                        p.source AS price_source, p.source_page AS price_source_page
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

export function getElementSuggestionById(id: number): Promise<ElementSuggestion | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, grp, element, axis, price_id, score, method, status, created_at FROM element_suggestions WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err)
        resolve((row as ElementSuggestion) || null)
      }
    )
  })
}

export function updateElementSuggestionStatus(id: number, status: 'accepted' | 'rejected' | 'proposed'): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE element_suggestions SET status = ? WHERE id = ?`, [status, id], (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

export function insertSuggestionEvent(row: {
  type: 'discipline' | 'element'
  suggestion_id: number
  action: 'accepted' | 'rejected'
  price_id: number
  source?: string | null
  source_page?: string | null
  discipline?: string | null
  grp?: string | null
  element?: string | null
  axis?: 'row' | 'col' | null
}): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO suggestion_events (type, suggestion_id, action, price_id, source, source_page, discipline, grp, element, axis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.type,
        row.suggestion_id,
        row.action,
        row.price_id,
        row.source || null,
        row.source_page || null,
        row.discipline || null,
        row.grp || null,
        row.element || null,
        row.axis || null,
      ],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function getSuggestionEvents(limit = 200): Promise<Array<{ id: number; type: string; suggestion_id: number; action: string; price_id: number; source?: string; source_page?: string; discipline?: string; grp?: string; element?: string; axis?: string; created_at: string }>> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, type, suggestion_id, action, price_id, source, source_page, discipline, grp, element, axis, created_at
       FROM suggestion_events ORDER BY created_at DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as any)
      }
    )
  })
}

export function bulkUpsertCellKeys(rows: Array<{ row_index: number; col_index: number; row_group: string; row_label: string; col_group: string; col_label: string }>): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT INTO cell_keys (row_index, col_index, row_group, row_label, col_group, col_label)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(row_index, col_index) DO UPDATE SET
           row_group=excluded.row_group,
           row_label=excluded.row_label,
           col_group=excluded.col_group,
           col_label=excluded.col_label`
      )
      let count = 0
      for (const r of rows) {
        stmt.run([r.row_index, r.col_index, r.row_group, r.row_label, r.col_group, r.col_label], (err) => {
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

export function getCellKeyByIndices(row_index: number, col_index: number): Promise<{ id: number; row_group: string; row_label: string; col_group: string; col_label: string } | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, row_group, row_label, col_group, col_label FROM cell_keys WHERE row_index = ? AND col_index = ?`,
      [row_index, col_index],
      (err, row) => {
        if (err) return reject(err)
        resolve((row as any) || null)
      }
    )
  })
}

export function getAllCellKeys(limit = 100000): Promise<Array<{ id: number; row_index: number; col_index: number; row_group: string; row_label: string; col_group: string; col_label: string }>> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, row_index, col_index, row_group, row_label, col_group, col_label FROM cell_keys ORDER BY row_index, col_index LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as any)
      }
    )
  })
}

export function bulkInsertCellSuggestions(rows: Array<{ cell_id: number; work_type?: string | null; price_id: number; score?: number; method?: string; status?: 'proposed' | 'accepted' | 'rejected' }>): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO cell_suggestions (cell_id, work_type, price_id, score, method, status)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 'proposed'))`
      )
      let count = 0
      for (const r of rows) {
        stmt.run([r.cell_id, r.work_type || null, r.price_id, typeof r.score === 'number' ? r.score : null, r.method || null, r.status || null], (err) => {
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

export function getCellSuggestions(cell_id: number, filter: { work_type?: string }, limit = 50): Promise<Array<{ id: number; cell_id: number; work_type?: string; price_id: number; score?: number; method?: string; status?: string; created_at: string; price_name?: string; price_unit?: string; price_category?: string; price?: number; price_currency?: string; price_source?: string; price_source_page?: string }>> {
  return new Promise((resolve, reject) => {
    const whereParts: string[] = [`cs.cell_id = ?`]
    const params: any[] = [cell_id]
    if (filter.work_type) {
      whereParts.push('cs.work_type = ?')
      params.push(filter.work_type)
    }
    const where = ` WHERE ${whereParts.join(' AND ')}`
    const sql = `SELECT cs.id, cs.cell_id, cs.work_type, cs.price_id, cs.score, cs.method, cs.status, cs.created_at,
                        p.name AS price_name, p.unit AS price_unit, p.category AS price_category, p.price AS price, p.currency AS price_currency,
                        p.source AS price_source, p.source_page AS price_source_page
                 FROM cell_suggestions cs
                 LEFT JOIN prices p ON p.id = cs.price_id${where}
                 ORDER BY (cs.score IS NULL), cs.score DESC, cs.created_at DESC
                 LIMIT ?`
    params.push(limit)
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export function updateCellSuggestionStatus(id: number, status: 'accepted' | 'rejected' | 'proposed'): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE cell_suggestions SET status = ? WHERE id = ?`, [status, id], (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

export function getCellSuggestionById(id: number): Promise<{ id: number; cell_id: number; price_id: number; status: string } | null> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id, cell_id, price_id, status FROM cell_suggestions WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err)
      resolve((row as any) || null)
    })
  })
}

export function insertCellItem(row_index: number, col_index: number, payload: { work_type?: string | null; price_id: number; quantity?: number | null; unit_price?: number | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    getCellKeyByIndices(row_index, col_index)
      .then((cell) => {
        if (!cell) throw new Error('Cell key not found')
        db.get(`SELECT price, currency, source, source_page FROM prices WHERE id = ?`, [payload.price_id], (err, prow: any) => {
          if (err) return reject(err)
          const unitPrice = typeof payload.unit_price === 'number' ? payload.unit_price : (typeof prow?.price === 'number' ? prow.price : null)
          const qty = typeof payload.quantity === 'number' ? payload.quantity : 1
          const total = unitPrice && qty ? unitPrice * qty : null
          db.run(
            `INSERT INTO cell_items (cell_id, work_type, price_id, quantity, unit_price, currency, total, source, source_page)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cell.id, payload.work_type || null, payload.price_id, qty || null, unitPrice || null, prow?.currency || 'RUB', total || null, prow?.source || null, prow?.source_page || null],
            (e2) => {
              if (e2) return reject(e2)
              resolve()
            }
          )
        })
      })
      .catch(reject)
  })
}

export function getCellItems(row_index: number, col_index: number): Promise<Array<{ id: number; cell_id: number; work_type?: string; price_id: number; quantity?: number; unit_price?: number; currency?: string; total?: number; source?: string; source_page?: string; created_at: string }>> {
  return new Promise((resolve, reject) => {
    getCellKeyByIndices(row_index, col_index)
      .then((cell) => {
        if (!cell) return resolve([])
        db.all(`SELECT id, cell_id, work_type, price_id, quantity, unit_price, currency, total, source, source_page, created_at FROM cell_items WHERE cell_id = ? ORDER BY created_at DESC`, [cell.id], (err, rows) => {
          if (err) return reject(err)
          resolve(rows as any)
        })
      })
      .catch(reject)
  })
}

export function getCellSummary(): Promise<Array<{ row_index: number; col_index: number; min?: number; max?: number; sum?: number }>> {
  return new Promise((resolve, reject) => {
    const sql = `SELECT ck.row_index, ck.col_index,
                        COALESCE(cc.min, MIN(ci.total)) AS min,
                        COALESCE(cc.max, MAX(ci.total)) AS max,
                        SUM(ci.total) AS sum,
                        cc.unit AS unit,
                        cr.hazard AS hazard,
                        cr.importance AS importance,
                        cr.difficulty AS difficulty
                 FROM cell_keys ck
                 LEFT JOIN cell_items ci ON ci.cell_id = ck.id
                 LEFT JOIN collision_costs cc ON cc.cell_id = ck.id
                 LEFT JOIN cell_risks cr ON cr.cell_id = ck.id
                 GROUP BY ck.row_index, ck.col_index`
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export function getCellStatusSummary(): Promise<Array<{ row_index: number; col_index: number; total: number; accepted: number; rejected: number; proposed: number; status: string }>> {
  return new Promise((resolve, reject) => {
    const sql = `SELECT ck.row_index, ck.col_index,
                        COUNT(cs.id) AS total,
                        SUM(CASE WHEN cs.status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
                        SUM(CASE WHEN cs.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                        SUM(CASE WHEN cs.status = 'proposed' THEN 1 ELSE 0 END) AS proposed,
                        CASE
                          WHEN COUNT(cs.id) > 0 AND SUM(CASE WHEN cs.status = 'accepted' THEN 1 ELSE 0 END) = COUNT(cs.id) THEN 'all_accepted'
                          WHEN COUNT(cs.id) > 0 AND SUM(CASE WHEN cs.status = 'rejected' THEN 1 ELSE 0 END) = COUNT(cs.id) THEN 'all_rejected'
                          WHEN COUNT(cs.id) = 0 THEN 'none'
                          ELSE 'mixed'
                        END AS status
                 FROM cell_keys ck
                 LEFT JOIN cell_suggestions cs ON cs.cell_id = ck.id
                 GROUP BY ck.row_index, ck.col_index`
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export function getElementStatusSummary(axis: 'row' | 'col' | 'all' = 'row'): Promise<Array<{ grp: string; element: string; axis: string; total: number; accepted: number; rejected: number; proposed: number; status: string }>> {
  return new Promise((resolve, reject) => {
    const where = axis === 'all' ? '' : ` WHERE es.axis = ?`
    const params = axis === 'all' ? [] : [axis]
    const sql = `SELECT es.grp AS grp, es.element AS element, es.axis AS axis,
                        COUNT(es.id) AS total,
                        SUM(CASE WHEN es.status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
                        SUM(CASE WHEN es.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                        SUM(CASE WHEN es.status = 'proposed' THEN 1 ELSE 0 END) AS proposed,
                        CASE
                          WHEN COUNT(es.id) = 0 THEN 'none'
                          WHEN SUM(CASE WHEN es.status = 'proposed' THEN 1 ELSE 0 END) = 0 THEN 'all_processed'
                          WHEN SUM(CASE WHEN es.status != 'proposed' THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
                          ELSE 'none'
                        END AS status
                 FROM element_suggestions es${where}
                 GROUP BY es.grp, es.element, es.axis`
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export type TaskRow = { id: number; type: string; status: 'queued'|'running'|'done'|'error'; progress: number; message?: string | null; started_at?: string | null; finished_at?: string | null }

export function insertTask(type: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tasks (type, status, progress) VALUES (?, 'queued', 0)`,
      [type],
      function (this: sqlite3.RunResult, err) {
        if (err) return reject(err)
        resolve(this.lastID as number)
      }
    )
  })
}

export function updateTaskStatus(id: number, status: 'queued'|'running'|'done'|'error', progress?: number, message?: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const finished = status === 'done' || status === 'error'
    db.run(
      `UPDATE tasks SET status = ?, progress = COALESCE(?, progress), message = COALESCE(?, message), started_at = COALESCE(started_at, CASE WHEN ? = 'running' THEN CURRENT_TIMESTAMP ELSE started_at END), finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id = ?`,
      [status, typeof progress === 'number' ? Math.max(0, Math.min(100, Math.floor(progress))) : null, message || null, status, finished ? 1 : 0, id],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function getTaskById(id: number): Promise<TaskRow | null> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id, type, status, progress, message, started_at, finished_at FROM tasks WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err)
      resolve((row as any) || null)
    })
  })
}

export function getRecentTasks(limit = 10): Promise<TaskRow[]> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, type, status, progress, message, started_at, finished_at FROM tasks ORDER BY COALESCE(started_at, finished_at) DESC NULLS LAST, id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export function insertTaskLog(task_id: number, level: 'info'|'warn'|'error', message: string, data?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO task_logs (task_id, level, message, data) VALUES (?, ?, ?, ?)`, [task_id, level, message, data !== undefined ? JSON.stringify(data) : null], (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

export function getTaskLogs(task_id: number, limit = 200): Promise<Array<{ id: number; ts: string; level: string; message?: string; data?: string }>> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, ts, level, message, data FROM task_logs WHERE task_id = ? ORDER BY id DESC LIMIT ?`, [task_id, limit], (err, rows) => {
      if (err) return reject(err)
      resolve(rows as any)
    })
  })
}

export function upsertCollisionCost(cell_id: number, payload: { unit?: string | null; min?: number | null; max?: number | null; scenarios_json?: string | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO collision_costs (cell_id, unit, min, max, scenarios_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cell_id) DO UPDATE SET unit=excluded.unit, min=excluded.min, max=excluded.max, scenarios_json=excluded.scenarios_json, created_at=CURRENT_TIMESTAMP`,
      [cell_id, payload.unit || null, typeof payload.min === 'number' ? payload.min : null, typeof payload.max === 'number' ? payload.max : null, payload.scenarios_json || null],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function getCollisionCostByCell(row_index: number, col_index: number): Promise<{ unit?: string; min?: number; max?: number; scenarios_json?: string; created_at: string } | null> {
  return new Promise((resolve, reject) => {
    getCellKeyByIndices(row_index, col_index)
      .then((cell) => {
        if (!cell) return resolve(null)
        db.get(`SELECT unit, min, max, scenarios_json, created_at FROM collision_costs WHERE cell_id = ?`, [cell.id], (err, row) => {
          if (err) return reject(err)
          resolve((row as any) || null)
        })
      })
      .catch(reject)
  })
}

export function upsertCellRisk(cell_id: number, payload: { hazard?: number | null; importance?: number | null; difficulty?: number | null; rationale_json?: string | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO cell_risks (cell_id, hazard, importance, difficulty, rationale_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cell_id) DO UPDATE SET hazard=excluded.hazard, importance=excluded.importance, difficulty=excluded.difficulty, rationale_json=excluded.rationale_json, created_at=CURRENT_TIMESTAMP`,
      [cell_id, typeof payload.hazard === 'number' ? payload.hazard : null, typeof payload.importance === 'number' ? payload.importance : null, typeof payload.difficulty === 'number' ? payload.difficulty : null, payload.rationale_json || null],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

export function getCellRiskByCell(row_index: number, col_index: number): Promise<{ hazard?: number; importance?: number; difficulty?: number; rationale_json?: string; created_at: string } | null> {
  return new Promise((resolve, reject) => {
    getCellKeyByIndices(row_index, col_index)
      .then((cell) => {
        if (!cell) return resolve(null)
        db.get(`SELECT hazard, importance, difficulty, rationale_json, created_at FROM cell_risks WHERE cell_id = ?`, [cell.id], (err, row) => {
          if (err) return reject(err)
          resolve((row as any) || null)
        })
      })
      .catch(reject)
  })
}

export function getCalcItemsByCell(row_index: number, col_index: number): Promise<{ rowItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>; colItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }> }> {
  return new Promise((resolve, reject) => {
    getCellKeyByIndices(row_index, col_index)
      .then(async (cell) => {
        if (!cell) return resolve({ rowItems: [], colItems: [] })
        const rowItems = await getAcceptedElementPrices(cell.row_group, cell.row_label, 'row', 50)
        const colItems = await getAcceptedElementPrices(cell.col_group, cell.col_label, 'col', 50)
        resolve({ rowItems, colItems })
      })
      .catch(reject)
  })
}

export function getAcceptedElementPrices(grp: string, element: string, axis: 'row'|'col', limit = 50): Promise<Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT es.price_id, p.name, p.unit, p.category, p.price, p.currency
       FROM element_suggestions es
       LEFT JOIN prices p ON p.id = es.price_id
       WHERE es.grp = ? AND es.element = ? AND es.axis = ? AND es.status = 'accepted'
       ORDER BY es.created_at DESC
       LIMIT ?`,
      [grp, element, axis, limit],
      (err, rows) => {
        if (err) return reject(err)
        resolve(rows as any)
      }
    )
  })
}
