import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Column = { group: string; label: string }
type Row = { group: string; label: string }

type MatrixResponse = {
  columns: Column[]
  rows: Row[]
  grid: string[][]
  source: string
}

function valueColor(v: string): string {
  switch (v.trim()) {
    case 'N/A':
      return '#bdc3c7'
    case 'П':
      return '#2ecc71'
    case 'Д':
      return '#9b59b6'
    case 'Р-50':
      return '#f1c40f'
    case 'Р-100':
      return '#e67e22'
    case 'Р-150':
      return '#e74c3c'
    default:
      return '#ecf0f1'
  }
}

function App() {
  const [data, setData] = useState<MatrixResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string>('')

  useEffect(() => {
    fetch('http://localhost:3001/api/matrix')
      .then((r) => r.json())
      .then((j: MatrixResponse) => setData(j))
      .catch((e) => {
        console.error(e)
      })
  }, [])

  const colCount = data?.columns.length || 0
  const rowCount = data?.rows.length || 0

  const headerCells = useMemo(() => {
    if (!data) return []
    return data.columns.map((c, i) => (
      <th key={i} className="col-header">
        <div className="label">{c.label}</div>
        <div className="sub">{c.group}</div>
      </th>
    ))
  }, [data])

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
          <div className="meta">Источник CSV: {data.source}</div>
          <div className="actions">
            <button disabled={saving} onClick={onSaveDisciplines}>
              {saving ? 'Сохранение…' : 'Сохранить дисциплины'}
            </button>
            {saveMsg && <span className="save-msg">{saveMsg}</span>}
          </div>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="sticky">Группа / Элемент</th>
                  {headerCells}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, ri) => (
                  <tr key={ri}>
                    <th className="row-header">
                      <div className="label">{r.label}</div>
                      <div className="sub">{r.group}</div>
                    </th>
                    {data.grid[ri].map((v, ci) => (
                      <td
                        key={ci}
                        style={{ backgroundColor: valueColor(v) }}
                        className="cell"
                        title={v}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="summary">
            Строк: {rowCount} · Колонок: {colCount}
          </div>
        </>
      ) : (
        <div className="loading">Загрузка матрицы…</div>
      )}
    </div>
  )
}

export default App
