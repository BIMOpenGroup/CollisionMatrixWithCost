import './env'
import { createApp } from './app'
import { initDB } from './db'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

initDB()
  .then(() => {
    const app = createApp()
    app.listen(PORT, () => {
      console.log(`[backend] Listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('[backend] DB init error:', err)
    process.exit(1)
  })
