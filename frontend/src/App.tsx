import { useEffect, useMemo, useState, Fragment } from 'react'
import './App.css'
import { loadMatrixAuto, MatrixResponse } from './data/loadMatrix'

type Column = { group: string; label: string }
type Row = { group: string; label: string }

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
  const [suggestions, setSuggestions] = useState<Array<{ id: number; price_id: number; price_name?: string; price_unit?: string; price_category?: string; score?: number }>>([])
  const [loadingSug, setLoadingSug] = useState(false)

  useEffect(() => {
    loadMatrixAuto()
      .then((j) => setData(j))
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
        setSuggestions(
          arr.map((s) => ({ id: s.id, price_id: s.price_id, price_name: s.price_name, price_unit: s.price_unit, price_category: s.price_category, score: s.score }))
        )
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingSug(false))
  }, [selected])

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

  return (
    <div className="container">
      <h1>Матрица коллизий (пример)</h1>
      {data ? (
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
                                  title={v}
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
                    </tr>
                  ))}
                  {!loadingSug && suggestions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="sub">Нет данных для выбранного элемента</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="loading">Загрузка матрицы…</div>
      )}
    </div>
  )
}

export default App
