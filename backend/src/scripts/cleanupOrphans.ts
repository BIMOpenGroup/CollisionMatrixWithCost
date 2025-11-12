import { db, initDB } from '../db'

async function main() {
  await initDB()
  await new Promise<void>((resolve, reject) => {
    db.run(`DELETE FROM mapping_suggestions WHERE price_id NOT IN (SELECT id FROM prices)`, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
  await new Promise<void>((resolve, reject) => {
    db.run(`DELETE FROM element_suggestions WHERE price_id NOT IN (SELECT id FROM prices)`, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
  console.log('[cleanupOrphans] done')
}

main().catch((e) => {
  console.error('[cleanupOrphans] error:', e?.message || e)
  process.exit(1)
})

