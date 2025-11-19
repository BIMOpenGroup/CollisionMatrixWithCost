import { load } from 'cheerio'
import { fetch } from 'undici'
import { PriceRow } from './db'
import { normalize, parsePrice } from './utils/text'

const SOURCE_HOST = 'garantstroikompleks.ru'
const SOURCE_PAGE = 'https://garantstroikompleks.ru/prajs-list'

function headerToKey(h: string): string | undefined {
  const s = normalize(h).toLowerCase()
  if (!s) return undefined
  if (s.includes('наимен') || s.includes('работ') || s.includes('услуг')) return 'name'
  if (s.includes('ед') || s.includes('измер')) return 'unit'
  if (s.includes('стоим') || s.includes('цена') || s.includes('руб')) return 'price'
  if (s.includes('катег') || s.includes('раздел')) return 'category'
  return undefined
}

export async function scrapeGarantPrices(): Promise<PriceRow[]> {
  const res = await fetch(SOURCE_PAGE, {
    headers: {
      'User-Agent': 'CMWC-Scraper/1.0 (+https://github.com/)'
    }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_PAGE}: ${res.status} ${res.statusText}`)
  }
  const html = await res.text()
  const $ = load(html)

  const rows: PriceRow[] = []

  // Determine category by nearest preceding header before each table
  function tableCategory($table: any): string | undefined {
    const prevHeader = $table.prevAll('h1, h2, h3, h4, h5').first()
    const cat = normalize(prevHeader.text())
    return cat || undefined
  }

  $('table').each((_, el) => {
    const $table = $(el)
    const category = tableCategory($table)

    // Read header cells
    const headerCells: string[] = []
    let $headerRow = $table.find('thead tr').first()
    if ($headerRow.length === 0) {
      $headerRow = $table.find('tr').first()
    }
    $headerRow.find('th, td').each((__, h) => {
      headerCells.push(normalize($(h).text()))
    })

    const keys = headerCells.map(headerToKey)
    // fallback assignments if not found
    if (keys.every((k) => !k)) {
      // Try a typical order: name | unit | price
      keys[0] = 'name'
      keys[1] = keys[1] || 'unit'
      keys[2] = keys[2] || 'price'
    }

    // Iterate body rows
    const $rows = $table.find('tbody tr').length ? $table.find('tbody tr') : $table.find('tr').slice(1)
    $rows.each((__, tr) => {
      const $tr = $(tr)
      const cells = $tr.find('td')
      if (!cells.length) return
      const rec: Partial<PriceRow> = {
        category,
        source: SOURCE_HOST,
        source_page: SOURCE_PAGE,
      }
      cells.each((i, td) => {
        const key = keys[i]
        const text = normalize($(td).text())
        if (!text) return
        if (key === 'name') rec.name = text
        else if (key === 'unit') rec.unit = text
        else if (key === 'price') rec.price = parsePrice(text)
      })

      if (rec.name) {
        rows.push({
          category: rec.category,
          name: rec.name,
          unit: rec.unit,
          price: rec.price,
          currency: 'RUB',
          source: SOURCE_HOST,
          source_page: SOURCE_PAGE,
        })
      }
    })
  })

  // Deduplicate by name+unit+source_page
  const uniq = new Map<string, PriceRow>()
  for (const r of rows) {
    const key = `${(r.name || '').toLowerCase()}|${(r.unit || '').toLowerCase()}|${r.source_page}`
    if (!uniq.has(key)) uniq.set(key, r)
  }
  return Array.from(uniq.values())
}