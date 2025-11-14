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
  const [tab, setTab] = useState<'matrix' | 'cost' | 'elements' | 'disciplines' | 'llm' | 'events'>('matrix')
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
  const [cellSummary, setCellSummary] = useState<Array<{ row_index: number; col_index: number; min?: number; max?: number; sum?: number }>>([])
  const [cellSummaryUnits, setCellSummaryUnits] = useState<Record<string, string>>({})
  const [cellSummaryHazard, setCellSummaryHazard] = useState<Record<string, number>>({})
  const [cellStatuses, setCellStatuses] = useState<Array<{ row_index: number; col_index: number; status: string }>>([])
  const [cellPanel, setCellPanel] = useState<{ rowIndex: number; colIndex: number; rowLabel?: string; colLabel?: string; rowGroup?: string; colGroup?: string } | null>(null)
  const [cellWorkType, setCellWorkType] = useState<string>('')
  const [cellSug, setCellSug] = useState<Array<{ id: number; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected'; work_type?: string }>>([])
  const [cellItems, setCellItems] = useState<Array<{ id: number; price_id: number; quantity?: number; unit_price?: number; currency?: string; total?: number; source?: string; source_page?: string; work_type?: string }>>([])
  const [calcItems, setCalcItems] = useState<{ row: Array<{ name?: string; unit?: string; price?: number; currency?: string }>; col: Array<{ name?: string; unit?: string; price?: number; currency?: string }> } | null>(null)
  const [tasks, setTasks] = useState<Array<{ id: number; type: string; status: string; progress: number; message?: string }>>([])
  const [lastTask, setLastTask] = useState<{ id: number; type: string; status: string; progress: number; message?: string } | null>(null)
  const [activeLogs, setActiveLogs] = useState<Array<{ ts: string; level: string; message?: string }>>([])
  const [collisionInfo, setCollisionInfo] = useState<{ unit?: string; min?: number; max?: number; scenarios?: Array<{ scenario: string; rationale?: string; items?: Array<{ name: string; matched_name?: string; unit_price?: number; quantity?: number; total?: number; currency?: string }> }> } | null>(null)
  const [scenariosEdit, setScenariosEdit] = useState<string>('')
  const [editMode, setEditMode] = useState<boolean>(false)
  const [elementStatuses, setElementStatuses] = useState<Record<string, { status: string }>>({})

  useEffect(() => {
    loadMatrixAuto()
      .then((j) => setData(j))
      .catch((e) => console.error(e))
  }, [])

  useEffect(() => {
    const tick = () => {
      fetch('http://localhost:3001/api/tasks?limit=5')
        .then((r) => r.json())
        .then((j) => {
          const arr = (j?.tasks || []) as any[]
          setTasks(arr)
          const latest = arr[0] || null
          setLastTask(latest || null)
          if (latest) {
            fetch(`http://localhost:3001/api/tasks/${latest.id}`)
              .then((r) => r.json())
              .then((jj) => setLastTask(jj?.task || latest))
              .catch(() => {})
            fetch(`http://localhost:3001/api/tasks/${latest.id}/logs?limit=50`)
              .then((r) => r.json())
              .then((jj) => setActiveLogs((jj?.logs || []) as any))
              .catch(() => {})
          } else {
            setActiveLogs([])
          }
        })
        .catch((e) => console.error(e))
    }
    const h = setInterval(tick, 3000)
    tick()
    return () => clearInterval(h)
  }, [])

  useEffect(() => {
    fetch('http://localhost:3001/api/mapping/elements/status-summary?axis=row')
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, { status: string }> = {}
        for (const s of (j?.statuses || []) as any[]) {
          map[`${s.grp}|${s.element}`] = { status: s.status }
        }
        setElementStatuses(map)
      })
      .catch((e) => console.error(e))
  }, [])

  const loadCellSummary = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/cells/summary')
      const j = await r.json()
      const arr = (j?.summary || []) as any[]
      setCellSummary(arr as any)
      const units: Record<string, string> = {}
      const hazards: Record<string, number> = {}
      for (const s of arr) {
        const key = `${s.row_index}|${s.col_index}`
        if (typeof s.unit === 'string') units[key] = s.unit
        if (typeof s.hazard === 'number') hazards[key] = s.hazard
      }
      setCellSummaryUnits(units)
      setCellSummaryHazard(hazards)
    } catch (e) { console.error(e) }
  }

  const loadCellStatuses = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/cells/status-summary')
      const j = await r.json()
      setCellStatuses(((j?.statuses || []) as any).map((s: any) => ({ row_index: s.row_index, col_index: s.col_index, status: s.status })))
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (tab === 'cost') {
      loadCellSummary()
      loadCellStatuses()
    }
  }, [tab])

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
      {lastTask && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="sub">Задача: {lastTask.type} · Статус: {lastTask.status} · Прогресс: {lastTask.progress}% {lastTask.message ? `· ${lastTask.message}` : ''}</div>
          <div className="actions">
            <button title="Показать логи последней задачи" onClick={() => fetch(`http://localhost:3001/api/tasks/${lastTask.id}/logs?limit=200`).then((r) => r.json()).then((j) => setActiveLogs((j?.logs || []) as any))}>Показать логи</button>
            {lastTask.status === 'running' && (
              <button title="Остановить текущую задачу" style={{ marginLeft: 8 }} onClick={() => fetch(`http://localhost:3001/api/tasks/${lastTask.id}/stop`, { method: 'POST' }).then(() => {}).catch((e) => console.error(e))}>отмена</button>
            )}
          </div>
          {activeLogs.length > 0 && (
            <div className="sub">Логи последней задачи</div>
          )}
          {activeLogs.length > 0 && (
            <table className="sug-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Уровень</th>
                  <th>Сообщение</th>
                </tr>
              </thead>
              <tbody>
                {activeLogs.map((l, i) => (
                  <tr key={i}>
                    <td>{l.ts}</td>
                    <td>{l.level}</td>
                    <td>{l.message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="actions">
        <button title="Просмотр исходной матрицы" onClick={() => setTab('matrix')}>Матрица</button>
        <button title="Матрица с диапазоном стоимости" onClick={() => setTab('cost')}>Матрица со стоимостью</button>
        <button title="Ранжирование прайса по элементам" onClick={() => setTab('elements')}>Элементы</button>
        <button title="Ранжирование прайса по дисциплинам" onClick={() => setTab('disciplines')}>Дисциплины</button>
        <button title="Провайдеры и пинг LLM" onClick={() => { setTab('llm'); loadProviders() }}>LLM</button>
        <button title="Журнал событий приёмки/отказа" onClick={() => { setTab('events'); loadEvents() }}>Журнал</button>
      </div>
      {data && tab === 'matrix' ? (
        <>
          <div className="meta">Источник: {data.source}</div>
          <div className="actions">
            {data.source.startsWith('api') && (
              <button title="Сохранить группы (строки/колонки) из CSV" disabled={saving} onClick={onSaveDisciplines}>
                {saving ? 'Сохранение…' : 'Сохранить дисциплины'}
              </button>
            )}
            {saveMsg && <span className="save-msg">{saveMsg}</span>}
            <button title="LLM принимает/отклоняет цены по элементам" style={{ marginLeft: 8 }} onClick={() => fetch('http://localhost:3001/api/tasks/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'auto_approve_elements' }) }).then(() => {}).catch((e) => console.error(e))}>Авто‑одобрить стоимости (Элементы, LLM)</button>
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
                          <th className="row-header" style={{ border: (() => { const st = elementStatuses[`${rseg.group}|${r.label}`]?.status; if (st === 'all_processed') return '2px solid #00b050'; if (st === 'in_progress') return '2px solid #ffd966'; return undefined })() }}>
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
                          <button title="Принять предложение для элемента" onClick={() => onSuggestionStatus(s.id, 'accepted')}>Принять</button>
                        )}
                        {s.status !== 'rejected' && (
                          <button title="Отклонить предложение для элемента" onClick={() => onSuggestionStatus(s.id, 'rejected')} style={{ marginLeft: 8 }}>Отклонить</button>
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
      {data && tab === 'cost' && (
        <>
          <div className="actions">
            <button title="Создать/обновить ключи ячеек" onClick={() => fetch('http://localhost:3001/api/cells/init', { method: 'POST' }).then(() => { loadCellSummary(); loadCellStatuses() })}>Синхронизировать ячейки</button>
            <button title="Обновить сводные min–max и Σ" onClick={() => { loadCellSummary(); loadCellStatuses() }}>Обновить сводку</button>
            <button title="LLM генерирует сценарии, сервер считает диапазон" style={{ marginLeft: 8 }} onClick={() => fetch('http://localhost:3001/api/tasks/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'compute_collisions_all' }) }).then(() => {}).catch((e) => console.error(e))}>Запустить расчёт коллизий (LLM)</button>
            <button title="LLM оценивает важность/опасность/сложность" style={{ marginLeft: 8 }} onClick={() => fetch('http://localhost:3001/api/tasks/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'compute_risk_all' }) }).then(() => {}).catch((e) => console.error(e))}>Запустить ранжирование важности (LLM)</button>
          </div>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr className="head-groups">
                  <th className="corner" rowSpan={2}>Группа</th>
                  <th className="element-header" rowSpan={2}>Элемент</th>
                  {colSegments.map((seg, si) => (
                    <Fragment key={`cg-${si}`}>
                      <th className="group-header" colSpan={seg.length}>{seg.group}</th>
                      {si < colSegments.length - 1 && <th className="col-sep" />}
                    </Fragment>
                  ))}
                </tr>
                <tr className="head-labels">
                  {colSegments.map((seg, si) => (
                    <Fragment key={`cl-${si}`}>
                      {data!.columns.slice(seg.start, seg.start + seg.length).map((c, i) => (
                        <th key={`cc-${seg.start + i}`} className="col-header">
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
                  <Fragment key={`crs-${rsi}`}>
                    {Array.from({ length: rseg.length }).map((_, off) => {
                      const ri = rseg.start + off
                      const r = data!.rows[ri]
                      const rowVals = data!.grid[ri]
                      return (
                        <tr key={`cr-${ri}`}>
                          {off === 0 && (
                            <th className="row-group" rowSpan={rseg.length}>{rseg.group}</th>
                          )}
                          <th className="row-header">
                            <div className="label">{r.label}</div>
                          </th>
                          {colSegments.map((cseg, csi) => (
                            <Fragment key={`ccs-${csi}`}>
                              {rowVals.slice(cseg.start, cseg.start + cseg.length).map((_, ci) => {
                                const ciAbs = cseg.start + ci
                                const summary = cellSummary.find((s) => s.row_index === ri && s.col_index === ciAbs)
                                const display = summary ? (summary.min && summary.max && summary.min !== summary.max ? `${(summary.min || 0).toFixed(2)}–${(summary.max || 0).toFixed(2)}` : (typeof summary.sum === 'number' ? summary.sum.toFixed(2) : '—')) : '—'
                                const unit = cellSummaryUnits[`${ri}|${ciAbs}`] || ''
                                const hz = cellSummaryHazard[`${ri}|${ciAbs}`]
                                const bgRisk = typeof hz === 'number' ? (hz >= 0.66 ? '#ffcccc' : hz >= 0.33 ? '#ffe699' : '#fff2cc') : undefined
                                const st = cellStatuses.find((x) => x.row_index === ri && x.col_index === ciAbs)?.status || ''
                                const bgStatus = st === 'all_accepted' ? '#C6EFCE' : st === 'all_rejected' ? '#F2DCDB' : undefined
                                const bg = bgRisk || bgStatus
                                return (
                                  <td
                                    key={`ccell-${ri}-${ciAbs}`}
                                    className="cell"
                                    style={{ cursor: 'pointer', backgroundColor: bg }}
                                    onClick={() => {
                                      setCellPanel({ rowIndex: ri, colIndex: ciAbs, rowLabel: r.label, rowGroup: rseg.group, colLabel: data!.columns[ciAbs].label, colGroup: data!.columns[ciAbs].group })
                                      fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any))
                                      fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any))
                                      fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/collision-cost`).then((r) => r.json()).then((j) => {
                                        const c = j?.collision || null
                                        const sc = (() => { try { return JSON.parse(c?.scenarios_json || '[]') } catch { return [] } })()
                                        setCollisionInfo(c ? { unit: c.unit, min: c.min, max: c.max, scenarios: sc } : null)
                                        setScenariosEdit(JSON.stringify(sc, null, 2))
                                        setEditMode(false)
                                      })
                                      fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/calc-items`).then((r) => r.json()).then((j) => setCalcItems({ row: (j?.rowItems || []) as any, col: (j?.colItems || []) as any }))
                                    }}
                                    title={`Σ ${display}${unit ? ` ${unit}` : ''}`}
                                  >
                                    {display}
                                  </td>
                                )
                              })}
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
          {cellPanel && (
            <div className="suggestions">
              <div className="sug-head">
                Расчёт: <b>{cellPanel.rowGroup} / {cellPanel.rowLabel} × {cellPanel.colGroup} / {cellPanel.colLabel}</b>
              </div>
              {collisionInfo && (
                <div className="panel">
                  <div className="sub">Оценка коллизий</div>
                  <div className="sub">Диапазон: {typeof collisionInfo.min === 'number' ? collisionInfo.min.toFixed(2) : '—'}–{typeof collisionInfo.max === 'number' ? collisionInfo.max.toFixed(2) : '—'} {collisionInfo.unit || ''}</div>
                  <div className="actions">
                    <button title="Открыть/закрыть редактор JSON сценариев" onClick={() => setEditMode((v) => !v)}>{editMode ? 'Закрыть редактор' : 'Редактировать сценарии'}</button>
                    {editMode && (
                      <button title="Сохранить JSON, сопоставить работы с прайсом и пересчитать min–max" style={{ marginLeft: 8 }} onClick={() => {
                        try {
                          const parsed = JSON.parse(scenariosEdit)
                          fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/collision-scenarios`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit: collisionInfo.unit || null, scenarios: parsed }),
                          }).then(() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/collision-cost`).then((r) => r.json()).then((j) => {
                            const c = j?.collision || null
                            const sc = (() => { try { return JSON.parse(c?.scenarios_json || '[]') } catch { return [] } })()
                            setCollisionInfo(c ? { unit: c.unit, min: c.min, max: c.max, scenarios: sc } : null)
                            setScenariosEdit(JSON.stringify(sc, null, 2))
                            setEditMode(false)
                          }))
                        } catch {}
                      }}>Сохранить</button>
                    )}
                  </div>
                  {Array.isArray(collisionInfo.scenarios) && collisionInfo.scenarios.length > 0 && (
                    <table className="sug-table">
                      <thead>
                        <tr>
                          <th>Сценарий</th>
                          <th>Обоснование</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collisionInfo.scenarios.map((s, i) => (
                          <tr key={i}>
                            <td>{s.scenario}</td>
                            <td>{s.rationale || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {Array.isArray(collisionInfo.scenarios) && collisionInfo.scenarios.some((s) => Array.isArray(s.items) && s.items.length > 0) && (
                    <table className="sug-table" style={{ marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th>Сценарий</th>
                          <th>Работа</th>
                          <th>Соответствие</th>
                          <th>Ед.</th>
                          <th>Ед. цена</th>
                          <th>Кол-во</th>
                          <th>Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collisionInfo.scenarios.flatMap((s, si) => (s.items || []).map((it, ii) => (
                          <tr key={`${si}-${ii}`}>
                            <td>{s.scenario}</td>
                            <td>{it.name}</td>
                            <td>{it.matched_name || '—'}</td>
                            <td>{it.unit || '—'}</td>
                            <td>{typeof it.unit_price === 'number' ? it.unit_price.toFixed(2) : '—'}</td>
                            <td>{typeof it.quantity === 'number' ? it.quantity : '—'}</td>
                            <td>{typeof it.total === 'number' ? it.total.toFixed(2) : '—'}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  )}
                  {editMode && (
                    <div className="panel" style={{ marginTop: 8 }}>
                      <div className="sub">JSON сценариев</div>
                      <textarea value={scenariosEdit} onChange={(e) => setScenariosEdit(e.target.value)} style={{ width: '100%', height: 200 }} />
                    </div>
                  )}
                </div>
              )}
              {calcItems && (
                <div className="panel">
                  <div className="sub">Позиции, учтённые в расчёте</div>
                  <table className="sug-table">
                    <thead>
                      <tr>
                        <th>Источник</th>
                        <th>Наименование</th>
                        <th>Цена</th>
                        <th>Ед.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcItems.row.map((i, idx) => (
                        <tr key={`r-${idx}`}>
                          <td>Строка</td>
                          <td>{i.name || '—'}</td>
                          <td>{typeof i.price === 'number' ? `${(i.price || 0).toFixed(2)} ${i.currency || 'RUB'}` : '—'}</td>
                          <td>{i.unit || '—'}</td>
                        </tr>
                      ))}
                      {calcItems.col.map((i, idx) => (
                        <tr key={`c-${idx}`}>
                          <td>Колонка</td>
                          <td>{i.name || '—'}</td>
                          <td>{typeof i.price === 'number' ? `${(i.price || 0).toFixed(2)} ${i.currency || 'RUB'}` : '—'}</td>
                          <td>{i.unit || '—'}</td>
                        </tr>
                      ))}
                      {calcItems.row.length === 0 && calcItems.col.length === 0 && (
                        <tr>
                          <td colSpan={3} className="sub">Нет принятых позиций</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="actions">
                <button title="Сгенерировать релевантные цены для этой ячейки" onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/suggest`, { method: 'POST' }).then(() => fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)))}>Сгенерировать предложения (ячейка)</button>
                <button title="LLM примет/отклонит и добавит принятые в расчёт" onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/auto-approve`, { method: 'POST' }).then(() => { fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)); fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any)); loadCellSummary(); loadCellStatuses() })} style={{ marginLeft: 8 }}>Авто‑одобрить (LLM)</button>
                <select value={cellWorkType} onChange={(e) => { const v = e.target.value; setCellWorkType(v); fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/suggestions?work_type=${encodeURIComponent(v)}&limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)) }}>
                  <option value="">Все виды работ</option>
                  {Array.from(new Set(cellSug.map((s) => s.work_type).filter(Boolean))).map((wt, i) => (
                    <option key={`${wt}-${i}`} value={wt as string}>{wt as string}</option>
                  ))}
                </select>
              </div>
              <table className="sug-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Вид работ</th>
                    <th>Наименование</th>
                    <th>Ед.</th>
                    <th>Категория</th>
                    <th>Score</th>
                    <th>Источник</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {cellSug.map((s) => (
                    <tr key={s.id}>
                      <td>{s.price_id}</td>
                      <td>{s.work_type || '—'}</td>
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
                          <button onClick={() => fetch(`http://localhost:3001/api/cells/suggestions/${s.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) }).then(() => setCellSug((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'accepted' } : x))))}>Принять</button>
                        )}
                        {s.status !== 'rejected' && (
                          <button onClick={() => fetch(`http://localhost:3001/api/cells/suggestions/${s.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) }).then(() => setCellSug((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'rejected' } : x))))} style={{ marginLeft: 8 }}>Отклонить</button>
                        )}
                        <button style={{ marginLeft: 8 }} onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work_type: s.work_type || null, price_id: s.price_id }) }).then(() => { fetch(`http://localhost:3001/api/cells/${cellPanel.rowIndex}/${cellPanel.colIndex}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any)); loadCellSummary() })}>Добавить в ячейку</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sub">Принятые позиции ячейки</div>
              <table className="sug-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Вид работ</th>
                    <th>Цена</th>
                    <th>Кол-во</th>
                    <th>Ед. цена</th>
                    <th>Итого</th>
                    <th>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {cellItems.map((i) => (
                    <tr key={i.id}>
                      <td>{i.price_id}</td>
                      <td>{i.work_type || '—'}</td>
                      <td>{i.currency || 'RUB'}</td>
                      <td>{typeof i.quantity === 'number' ? i.quantity : '—'}</td>
                      <td>{typeof i.unit_price === 'number' ? i.unit_price.toFixed(2) : '—'}</td>
                      <td>{typeof i.total === 'number' ? i.total.toFixed(2) : '—'}</td>
                      <td>
                        {i.source_page ? (
                          <a href={i.source_page} target="_blank" rel="noreferrer">{i.source || 'источник'}</a>
                        ) : (
                          i.source || '—'
                        )}
                      </td>
                    </tr>
                  ))}
                  {cellItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="sub">Нет принятых позиций</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === 'elements' && (
        <div className="panel">
          <div className="actions">
            <button title="Сгенерировать предложения цен по всем элементам" onClick={onGenerateElementSuggestions}>Сгенерировать предложения (элементы)</button>
            <span className="save-msg">{genMsg}</span>
          </div>
          <div className="sub">Выберите строку в матрице, чтобы загрузить ранжирование прайса по элементу</div>
        </div>
      )}
      {tab === 'disciplines' && (
        <div className="panel">
          <div className="actions">
            <button title="Сгенерировать предложения цен по дисциплинам" onClick={onGenerateDisciplineSuggestions}>Сгенерировать предложения (дисциплины)</button>
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
            <button title="Проверить доступность LLM" onClick={pingLLM}>Пинг</button>
            {llmPing && <span className="save-msg">{llmPing.provider}: {llmPing.content || ''}</span>}
          </div>
        </div>
      )}
      {tab === 'events' && (
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
  
