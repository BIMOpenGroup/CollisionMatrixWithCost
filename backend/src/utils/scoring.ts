import { normalize } from './text'
import type { StoredPriceRow } from '../db'

export type ScoreOptions = {
  /** Boost score if these keywords are found */
  keywords?: string[]
  /** 
   * Map of specific discipline/group names to extra keywords
   * e.g. { 'ОВ': ['вент', 'отоп'] }
   */
  contextKeywords?: Record<string, string[]>
}

/**
 * Calculates a relevance score for a price item against a set of search terms/context.
 */
export function calculateScore(
  context: string | string[], 
  price: StoredPriceRow, 
  options: ScoreOptions = {}
): number {
  const priceText = normalize(`${price.name} ${price.unit || ''} ${price.category || ''}`)
  let score = 0
  
  // 1. Keyword matching from options
  if (options.keywords) {
    for (const k of options.keywords) {
      if (priceText.includes(normalize(k))) score += 1
    }
  }

  // 2. Context-specific boosts
  if (options.contextKeywords && typeof context === 'string') {
    const extraKeys = options.contextKeywords[context] || []
    for (const k of extraKeys) {
      if (priceText.includes(normalize(k))) score += 0.5
    }
  }

  // 3. Direct token matching from context
  // If context is a string (e.g. "Wall"), we split it. If it's an array of tokens, we use them.
  const tokens = Array.isArray(context) 
    ? context.map(normalize) 
    : normalize(context).split(/\s+/)

  for (const t of tokens) {
    if (t && priceText.includes(t)) {
      // Base score for token match. 
      // We can make this more sophisticated (e.g. exact word match vs substring)
      score += 0.5
    }
  }

  return score
}
