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