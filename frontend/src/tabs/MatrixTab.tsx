import { Fragment, useMemo, useState } from 'react'
import { valueColor, cellCategory } from '../utils/matrix'
import { type MatrixResponse } from '../data/loadMatrix'

export default function MatrixTab({ data, elementStatuses, onSaveDisciplines }: { data: MatrixResponse; elementStatuses: Record<string, { status: string }>; onSaveDisciplines: () => Promise<void> | void }) {
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [selected, setSelected] = useState<{ grp: string; element: string } | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ id: number; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected' }>>([])
  const [loadingSug, setLoadingSug] = useState(false)

  const colCount = data.columns.length
  const rowCount = data.rows.length

  const colSegments = useMemo(() => {
    if (data.columns.length === 0) return [] as { group: string; start: number; length: number }[]
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

  const rowSegments = useMemo(() => {
    if (data.rows.length === 0) return [] as { group: string; start: number; length: number }[]
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

  const loadSuggestions = async (grp: string, element: string) => {
    setLoadingSug(true)
    try {
      const r = await fetch(`http://localhost:3001/api/mapping/elements?grp=${encodeURIComponent(grp)}&element=${encodeURIComponent(element)}&axis=row&limit=12`)
      const j = await r.json()
      const arr = (j?.suggestions || []) as any[]
      setSuggestions(arr.map((s) => ({ id: s.id, price_id: s.price_id, price_name: s.price_name, price_unit: s.price_unit, price_category: s.price_category, price_source: s.price_source, price_source_page: s.price_source_page, score: s.score, status: s.status })))
    } catch (e) {
    } finally {
      setLoadingSug(false)
    }
  }

  const onSuggestionStatus = async (id: number, status: 'accepted' | 'rejected') => {
    try {
      await fetch(`http://localhost:3001/api/mapping/elements/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    } catch (e) {}
  }

  const onSaveClick = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await onSaveDisciplines()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="actions">
        {data.source.startsWith('api') && (
          <button title="Сохранить группы (строки/колонки) из CSV" disabled={saving} onClick={onSaveClick}>{saving ? 'Сохранение…' : 'Сохранить дисциплины'}</button>
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
                  {data.columns.slice(seg.start, seg.start + seg.length).map((c, i) => (
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
                  const r = data.rows[ri]
                  const rowVals = data.grid[ri]
                  return (
                    <tr key={`r-${ri}`}>
                      {off === 0 && (
                        <th className="row-group" rowSpan={rseg.length}>{rseg.group}</th>
                      )}
                      <th className="row-header" style={{ border: (() => { const st = elementStatuses[`${rseg.group}|${r.label}`]?.status; if (st === 'all_processed') return '2px solid #00b050'; if (st === 'in_progress') return '2px solid #ffd966'; return undefined })() }}>
                        <div className="label" style={{ cursor: 'pointer' }} onClick={() => { setSelected({ grp: rseg.group, element: r.label }); loadSuggestions(rseg.group, r.label) }}>{r.label}</div>
                      </th>
                      {colSegments.map((cseg, csi) => (
                        <Fragment key={`cs-${csi}`}>
                          {rowVals.slice(cseg.start, cseg.start + cseg.length).map((v, ci) => (
                            <td key={`cell-${ri}-${cseg.start + ci}`} style={{ backgroundColor: valueColor(v) }} className="cell" title={`${v}${v ? ' • ' : ''}${cellCategory(v)}`}>{v}</td>
                          ))}
                          {csi < colSegments.length - 1 && <td className="col-sep" />}
                        </Fragment>
                      ))}
                    </tr>
                  )
                })}
                {rsi < rowSegments.length - 1 && (
                  <tr className="row-sep">
                    <td colSpan={2 + data.columns.length + (colSegments.length - 1)}></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="summary">Строк: {rowCount} · Колонок: {colCount}</div>
      <div className="meta">Источник: {data.source}</div>
      {selected && (
        <div className="suggestions">
          <div className="sug-head">Ранжирование прайса: <b>{selected.grp}</b> → <b>{selected.element}</b>{loadingSug && <span className="sub"> Загрузка…</span>}</div>
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
                  <td>{s.price_source_page ? (<a href={s.price_source_page} target="_blank" rel="noreferrer">{s.price_source || 'источник'}</a>) : (s.price_source || '—')}</td>
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
  )
}

