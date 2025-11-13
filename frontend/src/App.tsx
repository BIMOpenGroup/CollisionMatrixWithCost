import { useEffect, useMemo, useState, Fragment } from 'react'
import './App.css'
import { loadMatrixAuto, type MatrixResponse } from './data/loadMatrix'


// MatrixResponse теперь импортируется из фронтенд-лоадера

function valueColor(v: string): string {
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

function App() {
  const [data, setData] = useState<MatrixResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string>('')
  const [selected, setSelected] = useState<{ grp: string; element: string } | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ id: number; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected' }>>([])
  const [loadingSug, setLoadingSug] = useState(false)
  const [tab, setTab] = useState<'matrix' | 'elements' | 'disciplines' | 'llm' | 'events'>('matrix')
  const [genMsg, setGenMsg] = useState<string>('')
  const [disciplines, setDisciplines] = useState<Array<{ id: number; name: string; scope: string }>>([])
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('')
  const [discSuggestions, setDiscSuggestions] = useState<Array<{ id: number; discipline: string; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected' }>>([])
  const [loadingDisc, setLoadingDisc] = useState(false)
  const [events, setEvents] = useState<Array<{ id: number; type: string; suggestion_id: number; action: string; price_id: number; source?: string; source_page?: string; discipline?: string; grp?: string; element?: string; axis?: string; created_at: string }>>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [providers, setProviders] = useState<Array<{ name: string; baseUrl: string; model: string; apiKeyPresent: boolean }>>([])
  const [llmPing, setLlmPing] = useState<{ provider?: string; content?: string } | null>(null)
  const [llmPingMsg, setLlmPingMsg] = useState<string>('test')

  useEffect(() => {
    loadMatrixAuto()
      .then((j) => setData(j))
      .catch((e) => console.error(e))
  }, [])

  useEffect(() => {
    fetch('http://localhost:3001/api/disciplines')
      .then((r) => r.json())
      .then((j) => setDisciplines((j?.disciplines || []) as any))
      .catch((e) => console.error(e))
  }, [])

  const colCount = data?.columns.length || 0
  const rowCount = data?.rows.length || 0

  // Сегменты по колонкам (непрерывные группы)
  const colSegments = useMemo(() => {
    if (!data || data.columns.length === 0) return [] as { group: string; start: number; length: number }[]
    const segs: { group: string; start: number; length: number }[] = []
    let current = data.columns[0].group
    let start = 0
    for (let i = 1; i < data.columns.length; i++) {
      const g = data.columns[i].group
      if (g !== current) {
        segs.push({ group: current, start, length: i - start })
        current = g
        start = i
      }
    }
    segs.push({ group: current, start, length: data.columns.length - start })
    return segs
  }, [data])

  // Сегменты по строкам (для rowSpan левой колонки "Группа")
  const rowSegments = useMemo(() => {
    if (!data || data.rows.length === 0) return [] as { group: string; start: number; length: number }[]
    const segs: { group: string; start: number; length: number }[] = []
    let current = data.rows[0].group
    let start = 0
    for (let i = 1; i < data.rows.length; i++) {
      const g = data.rows[i].group
      if (g !== current) {
        segs.push({ group: current, start, length: i - start })
        current = g
        start = i
      }
    }
    segs.push({ group: current, start, length: data.rows.length - start })
    return segs
  }, [data])

  useEffect(() => {
    if (!selected) return
    const { grp, element } = selected
    setLoadingSug(true)
    fetch(`http://localhost:3001/api/mapping/elements?grp=${encodeURIComponent(grp)}&element=${encodeURIComponent(element)}&axis=row&limit=12`)
      .then((r) => r.json())
      .then((j) => {
        const arr = (j?.suggestions || []) as any[]
        setSuggestions(arr.map((s) => ({ id: s.id, price_id: s.price_id, price_name: s.price_name, price_unit: s.price_unit, price_category: s.price_category, price_source: s.price_source, price_source_page: s.price_source_page, score: s.score, status: s.status })))
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingSug(false))
  }, [selected])

  const onSuggestionStatus = async (id: number, status: 'accepted' | 'rejected') => {
    try {
      await fetch(`http://localhost:3001/api/mapping/elements/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    } catch (e) {
      console.error(e)
    }
  }

  const onSaveDisciplines = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const r = await fetch('http://localhost:3001/api/disciplines/save', {
        method: 'POST',
      })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setSaveMsg(`Сохранено: ${j.inserted}, всего: ${j.total}`)
    } catch (e: any) {
      setSaveMsg(`Ошибка: ${e?.message || 'unknown'}`)
    } finally {
      setSaving(false)
    }
  }

  const onGenerateElementSuggestions = async () => {
    setGenMsg('')
    try {
      const r = await fetch('http://localhost:3001/api/mapping/elements/suggest', { method: 'POST' })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setGenMsg(`Элементы: ${j.count}`)
    } catch (e: any) {
      setGenMsg(`Ошибка: ${e?.message || 'unknown'}`)
    }
  }

  const onGenerateDisciplineSuggestions = async () => {
    setGenMsg('')
    try {
      const r = await fetch('http://localhost:3001/api/mapping/suggest', { method: 'POST' })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setGenMsg(`Дисциплины: ${j.count}`)
    } catch (e: any) {
      setGenMsg(`Ошибка: ${e?.message || 'unknown'}`)
    }
  }

  const loadDisciplineSuggestions = async (name: string) => {
    setLoadingDisc(true)
    try {
      const r = await fetch(`http://localhost:3001/api/mapping?discipline=${encodeURIComponent(name)}&limit=50`)
      const j = await r.json()
      const arr = (j?.suggestions || []) as any[]
      setDiscSuggestions(arr.map((s) => ({ id: s.id, discipline: s.discipline, price_id: s.price_id, price_name: s.price_name, price_unit: s.price_unit, price_category: s.price_category, price_source: s.price_source, price_source_page: s.price_source_page, score: s.score, status: s.status })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDisc(false)
    }
  }

  const onDiscSuggestionStatus = async (id: number, status: 'accepted' | 'rejected') => {
    try {
      await fetch(`http://localhost:3001/api/mapping/suggestions/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setDiscSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    } catch (e) {
      console.error(e)
    }
  }

  const loadEvents = async () => {
    setLoadingEvents(true)
    try {
      const r = await fetch('http://localhost:3001/api/events/suggestions?limit=200')
      const j = await r.json()
      setEvents((j?.events || []) as any)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingEvents(false)
    }
  }

  const loadProviders = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/debug/llm/providers')
      const j = await r.json()
      setProviders((j?.providers || []) as any)
    } catch (e) {
      console.error(e)
    }
  }

  const pingLLM = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/debug/llm/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: llmPingMsg }),
      })
      const j = await r.json()
      setLlmPing({ provider: j?.provider, content: j?.content })
    } catch (e) {
      console.error(e)
    }
  }

  function cellCategory(v: string): 'Major' | 'Medium' | 'Minor' | 'None' {
    const t = v.trim()
    if (t === 'Р-150') return 'Major'
    if (t === 'Р-100' || t === 'Д') return 'Medium'
    if (t === 'Р-50' || t === 'П') return 'Minor'
    return 'None'
  }

  return (
    <div className="container">
      <h1>Матрица коллизий (пример)</h1>
      <div className="actions">
        <button onClick={() => setTab('matrix')}>Матрица</button>
        <button onClick={() => setTab('elements')}>Элементы</button>
        <button onClick={() => setTab('disciplines')}>Дисциплины</button>
        <button onClick={() => { setTab('llm'); loadProviders() }}>LLM</button>
        <button onClick={() => { setTab('events'); loadEvents() }}>Журнал</button>
      </div>
      {data && tab === 'matrix' ? (
        <>
          <div className="meta">Источник: {data.source}</div>
          <div className="actions">
            {data.source.startsWith('api') && (
              <button disabled={saving} onClick={onSaveDisciplines}>
                {saving ? 'Сохранение…' : 'Сохранить дисциплины'}
              </button>
            )}
            {saveMsg && <span className="save-msg">{saveMsg}</span>}
          </div>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr className="head-groups">
                  <th className="corner" rowSpan={2}>Группа</th>
                  <th className="element-header" rowSpan={2}>Элемент</th>
                  {colSegments.map((seg, si) => (
                    <Fragment key={`g-${si}`}>
                      <th className="group-header" colSpan={seg.length}>{seg.group}</th>
                      {si < colSegments.length - 1 && <th className="col-sep" />}
                    </Fragment>
                  ))}
                </tr>
                <tr className="head-labels">
                  {colSegments.map((seg, si) => (
                    <Fragment key={`l-${si}`}>
                      {data!.columns.slice(seg.start, seg.start + seg.length).map((c, i) => (
                        <th key={`c-${seg.start + i}`} className="col-header">
                          <div className="label">{c.label}</div>
                        </th>
                      ))}
                      {si < colSegments.length - 1 && <th className="col-sep" />}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowSegments.map((rseg, rsi) => (
                  <Fragment key={`rs-${rsi}`}>
                    {Array.from({ length: rseg.length }).map((_, off) => {
                      const ri = rseg.start + off
                      const r = data!.rows[ri]
                      const rowVals = data!.grid[ri]
                      return (
                        <tr key={`r-${ri}`}>
                          {off === 0 && (
                            <th className="row-group" rowSpan={rseg.length}>{rseg.group}</th>
                          )}
                          <th className="row-header">
                            <div className="label" style={{ cursor: 'pointer' }} onClick={() => setSelected({ grp: rseg.group, element: r.label })}>{r.label}</div>
                          </th>
                          {colSegments.map((cseg, csi) => (
                            <Fragment key={`cs-${csi}`}>
                              {rowVals.slice(cseg.start, cseg.start + cseg.length).map((v, ci) => (
                                <td
                                  key={`cell-${ri}-${cseg.start + ci}`}
                                  style={{ backgroundColor: valueColor(v) }}
                                  className="cell"
                                  title={`${v}${v ? ' • ' : ''}${cellCategory(v)}`}
                                >
                                  {v}
                                </td>
                              ))}
                              {csi < colSegments.length - 1 && <td className="col-sep" />}
                            </Fragment>
                          ))}
                        </tr>
                      )
                    })}
                    {rsi < rowSegments.length - 1 && (
                      <tr className="row-sep">
                        <td colSpan={2 + data!.columns.length + (colSegments.length - 1)}></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="summary">
            Строк: {rowCount} · Колонок: {colCount}
          </div>
          {selected && (
            <div className="suggestions">
              <div className="sug-head">
                Ранжирование прайса: <b>{selected.grp}</b> → <b>{selected.element}</b>
                {loadingSug && <span className="sub"> Загрузка…</span>}
              </div>
              <table className="sug-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Наименование</th>
                    <th>Ед.</th>
                    <th>Категория</th>
                    <th>Score</th>
                    <th>Источник</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.price_id}</td>
                      <td>{s.price_name || '—'}</td>
                      <td>{s.price_unit || '—'}</td>
                      <td>{s.price_category || '—'}</td>
                      <td>{typeof s.score === 'number' ? s.score.toFixed(2) : '—'}</td>
                      <td>
                        {s.price_source_page ? (
                          <a href={s.price_source_page} target="_blank" rel="noreferrer">{s.price_source || 'источник'}</a>
                        ) : (
                          s.price_source || '—'
                        )}
                      </td>
                      <td>
                        {s.status !== 'accepted' && (
                          <button onClick={() => onSuggestionStatus(s.id, 'accepted')}>Принять</button>
                        )}
                        {s.status !== 'rejected' && (
                          <button onClick={() => onSuggestionStatus(s.id, 'rejected')} style={{ marginLeft: 8 }}>Отклонить</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loadingSug && suggestions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="sub">Нет данных для выбранного элемента</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
      {tab === 'elements' && (
        <div className="panel">
          <div className="actions">
            <button onClick={onGenerateElementSuggestions}>Сгенерировать предложения (элементы)</button>
            <span className="save-msg">{genMsg}</span>
          </div>
          <div className="sub">Выберите строку в матрице, чтобы загрузить ранжирование прайса по элементу</div>
        </div>
      )}
      {tab === 'disciplines' && (
        <div className="panel">
          <div className="actions">
            <button onClick={onGenerateDisciplineSuggestions}>Сгенерировать предложения (дисциплины)</button>
            <span className="save-msg">{genMsg}</span>
          </div>
          <div className="actions">
            <select value={selectedDiscipline} onChange={(e) => { const v = e.target.value; setSelectedDiscipline(v); if (v) loadDisciplineSuggestions(v) }}>
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
                  <td>
                    {s.price_source_page ? (
                      <a href={s.price_source_page} target="_blank" rel="noreferrer">{s.price_source || 'источник'}</a>
                    ) : (
                      s.price_source || '—'
                    )}
                  </td>
                  <td>
                    {s.status !== 'accepted' && (
                      <button onClick={() => onDiscSuggestionStatus(s.id, 'accepted')}>Принять</button>
                    )}
                    {s.status !== 'rejected' && (
                      <button onClick={() => onDiscSuggestionStatus(s.id, 'rejected')} style={{ marginLeft: 8 }}>Отклонить</button>
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
      )}
      {tab === 'llm' && (
        <div className="panel">
          <div className="sub">Провайдеры</div>
          <table className="sug-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Base URL</th>
                <th>Модель</th>
                <th>Ключ</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={`${p.name}-${i}`}>
                  <td>{p.name}</td>
                  <td>{p.baseUrl}</td>
                  <td>{p.model}</td>
                  <td>{p.apiKeyPresent ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <input value={llmPingMsg} onChange={(e) => setLlmPingMsg(e.target.value)} />
            <button onClick={pingLLM}>Пинг</button>
            {llmPing && <span className="save-msg">{llmPing.provider}: {llmPing.content || ''}</span>}
          </div>
        </div>
      )}
      {tab === 'events' && (
        <div className="panel">
          <div className="actions">
            <button onClick={loadEvents}>Обновить</button>
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
                  <td>
                    {e.source_page ? (
                      <a href={e.source_page} target="_blank" rel="noreferrer">{e.source || 'источник'}</a>
                    ) : (
                      e.source || '—'
                    )}
                  </td>
                  <td>{e.discipline || '—'}</td>
                  <td>{e.grp || '—'}</td>
                  <td>{e.element || '—'}</td>
                  <td>{e.axis || '—'}</td>
                  <td>{e.created_at}</td>
                </tr>
              ))}
              {!loadingEvents && events.length === 0 && (
                <tr>
                  <td colSpan={10} className="sub">Нет событий</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!data && tab === 'matrix' && <div className="loading">Загрузка матрицы…</div>}
    </div>
  )
}

export default App
