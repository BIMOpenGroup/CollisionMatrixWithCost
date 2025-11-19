import { stringify } from 'csv-stringify/sync'
import { getAllCellKeys, getCellSummary } from './db'
import { getCategoryByCost } from './utils/category'

export async function generateMatrixCsv(): Promise<string> {
  const summaries = await getCellSummary()
  const summaryMap = new Map<string, { min?: number; max?: number }>()
  for (const s of summaries) {
    summaryMap.set(`${s.row_index}:${s.col_index}`, s)
  }

  const keys = await getAllCellKeys()
  
  const records: any[] = []
  
  for (const k of keys) {
    const sum = summaryMap.get(`${k.row_index}:${k.col_index}`)
    const cost = sum?.max || sum?.min || null
    const category = getCategoryByCost(cost)
    
    records.push({
      'Row Group': k.row_group,
      'Row Label': k.row_label,
      'Col Group': k.col_group,
      'Col Label': k.col_label,
      'Cost Min': sum?.min || '',
      'Cost Max': sum?.max || '',
      'Category': category || '',
      'Hazard': (sum as any)?.hazard || '',
      'Importance': (sum as any)?.importance || '',
      'Difficulty': (sum as any)?.difficulty || ''
    })
  }

  return stringify(records, { header: true })
}
