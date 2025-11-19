/**
 * Normalizes a string for comparison:
 * - Lowercases
 * - Replaces 'ё' with 'е'
 * - Trims whitespace
 * - Optionally removes extra spaces
 */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tokenizes a string into significant words.
 * filters out common prepositions and short words.
 */
export function tokenize(s: string): string[] {
  const stopWords = new Set([
    'и', 'в', 'на', 'из', 'для', 'по', 'под', 
    'шт', 'м', 'мм', 'м2', 'м3', 'ед', 
    'работ', 'работы', 'монтаж', 'демонтаж', 'устройство'
  ])
  
  return normalize(s)
    .split(/[^a-zа-я0-9]+/gi)
    .filter(w => w.length > 1 && !stopWords.has(w))
}

export function parsePrice(text: string): number | undefined {
  const raw = normalize(text)
  if (!raw) return undefined
  // Extract first decimal number, allow comma as decimal separator
  const m = raw.match(/[0-9]+(?:[\s.,][0-9]{3})*(?:[.,][0-9]+)?/)
  if (!m) return undefined
  const num = m[0]
  const cleaned = num
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove thousands dot separators
    .replace(/,(?=\d{2,})/g, '.') // convert decimal comma to dot
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}
