import { useState } from 'react'

export default function EventsTab() {
  const [events, setEvents] = useState<Array<{ id: number; type: string; suggestion_id: number; action: string; price_id: number; source?: string; source_page?: string; discipline?: string; grp?: string; element?: string; axis?: string; created_at: string }>>([])
  const [loading, setLoading] = useState(false)

  const loadEvents = async () => {
    setLoading(true)
    try {
      const r = await fetch('http://localhost:3001/api/events/suggestions?limit=200')
      const j = await r.json()
      setEvents((j?.events || []) as any)
    } catch (e) {}
    finally { setLoading(false) }
  }

  return (
    <div className="panel">
      <div className="actions">
        <button title="Обновить список событий" onClick={loadEvents}>Обновить</button>
      </div>
      <table className="sug-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Тип</th>
            <th>Действие</th>
            <th>Цена</th>
            <th>Источник</th>
            <th>Дисциплина</th>
            <th>Группа</th>
            <th>Элемент</th>
            <th>Ось</th>
            <th>Время</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.id}</td>
              <td>{e.type}</td>
              <td>{e.action}</td>
              <td>{e.price_id}</td>
              <td>{e.source_page ? (<a href={e.source_page} target="_blank" rel="noreferrer">{e.source || 'источник'}</a>) : (e.source || '—')}</td>
              <td>{e.discipline || '—'}</td>
              <td>{e.grp || '—'}</td>
              <td>{e.element || '—'}</td>
              <td>{e.axis || '—'}</td>
              <td>{e.created_at}</td>
            </tr>
          ))}
          {!loading && events.length === 0 && (
            <tr>
              <td colSpan={10} className="sub">Нет событий</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

