export function valueColor(v: string): string {
  switch (v.trim()) {
    case 'N/A':
      return '#E6E6E6'
    case 'П':
      return '#DDEBF7'
    case 'Д':
      return '#F8CBAD'
    case 'Р-50':
      return '#FFF2CC'
    case 'Р-100':
      return '#F4B183'
    case 'Р-150':
      return '#ED7D31'
    default:
      return '#FFFFFF'
  }
}

export function cellCategory(v: string): 'Major' | 'Medium' | 'Minor' | 'None' {
  const t = v.trim()
  if (t === 'Р-150') return 'Major'
  if (t === 'Р-100' || t === 'Д') return 'Medium'
  if (t === 'Р-50' || t === 'П') return 'Minor'
  return 'None'
}

