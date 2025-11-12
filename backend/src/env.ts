import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

const envPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

