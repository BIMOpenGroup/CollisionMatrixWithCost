import { useEffect, useState } from 'react'

export default function DisciplinesTab({ disciplines, genMsg, onGenerate }: { disciplines: Array<{ id: number; name: string; scope: string }>; genMsg: string; onGenerate: () => Promise<void> | void }) {
  const [selectedDiscipline, setSelectedDiscipline] = useState('')
  const [discSuggestions, setDiscSuggestions] = useState<Array<{ id: number; discipline: string; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected' }>>([])
  const [loadingDisc, setLoadingDisc] = useState(false)

  useEffect(() => {
    if (!selectedDiscipline) return
    loadDisciplineSuggestions(selectedDiscipline)
  }, [selectedDiscipline])

  const loadDisciplineSuggestions = async (name: string) => {
    setLoadingDisc(true)
    try {
      const r = await fetch(`http://localhost:3001/api/mapping?discipline=${encodeURIComponent(name)}&limit=50`)
      const j = await r.json()
      const arr = (j?.suggestions || []) as any[]
      setDiscSuggestions(arr.map((s) => ({ id: s.id, discipline: s.discipline, price_id: s.price_id, price_name: s.price_name, price_unit: s.price_unit, price_category: s.price_category, price_source: s.price_source, price_source_page: s.price_source_page, score: s.score, status: s.status })))
    } catch (e) {
    } finally {
      setLoadingDisc(false)
    }
  }

  const onDiscSuggestionStatus = async (id: number, status: 'accepted' | 'rejected') => {
    try {
      await fetch(`http://localhost:3001/api/mapping/suggestions/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      setDiscSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    } catch (e) {}
  }

  return (
    <div className="panel">
      <div className="actions">
        <button title="Сгенерировать предложения цен по дисциплинам" onClick={onGenerate}>Сгенерировать предложения (дисциплины)</button>
        <span className="save-msg">{genMsg}</span>
      </div>
      <div className="actions">
        <select value={selectedDiscipline} onChange={(e) => setSelectedDiscipline(e.target.value)}>
          <option value="">Выберите дисциплину</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>
      <table className="sug-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Дисциплина</th>
            <th>Наименование</th>
            <th>Ед.</th>
            <th>Категория</th>
            <th>Score</th>
            <th>Источник</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          {discSuggestions.map((s) => (
            <tr key={s.id}>
              <td>{s.price_id}</td>
              <td>{s.discipline}</td>
              <td>{s.price_name || '—'}</td>
              <td>{s.price_unit || '—'}</td>
              <td>{s.price_category || '—'}</td>
              <td>{typeof s.score === 'number' ? s.score.toFixed(2) : '—'}</td>
              <td>{s.price_source_page ? (<a href={s.price_source_page} target="_blank" rel="noreferrer">{s.price_source || 'источник'}</a>) : (s.price_source || '—')}</td>
              <td>
                {s.status !== 'accepted' && (
                  <button title="Принять предложение по дисциплине" onClick={() => onDiscSuggestionStatus(s.id, 'accepted')}>Принять</button>
                )}
                {s.status !== 'rejected' && (
                  <button title="Отклонить предложение по дисциплине" onClick={() => onDiscSuggestionStatus(s.id, 'rejected')} style={{ marginLeft: 8 }}>Отклонить</button>
                )}
              </td>
            </tr>
          ))}
          {!loadingDisc && discSuggestions.length === 0 && (
            <tr>
              <td colSpan={8} className="sub">Нет данных. Выберите дисциплину</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

