import type { TaskRow } from '../db'

export function getCategoryByCost(cost: number | null): 'Major' | 'Medium' | 'Minor' | null {
  if (typeof cost !== 'number') return null
  if (cost <= 50000) return 'Minor'
  if (cost <= 500000) return 'Medium'
  return 'Major'
}
