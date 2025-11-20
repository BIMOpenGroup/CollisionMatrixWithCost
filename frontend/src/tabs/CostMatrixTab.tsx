import { Fragment, useEffect, useMemo, useState } from 'react'
import { type MatrixResponse } from '../data/loadMatrix'

export default function CostMatrixTab({ data }: { data: MatrixResponse }) {
  const [cellSummary, setCellSummary] = useState<Array<{ row_index: number; col_index: number; min?: number; max?: number; sum?: number; unit?: string; hazard?: number }>>([])
  const [cellSummaryUnits, setCellSummaryUnits] = useState<Record<string, string>>({})
  const [cellSummaryHazard, setCellSummaryHazard] = useState<Record<string, number>>({})
  const [cellStatuses, setCellStatuses] = useState<Array<{ row_index: number; col_index: number; status: string }>>([])
  const [cellPanel, setCellPanel] = useState<{ rowIndex: number; colIndex: number; rowLabel?: string; colLabel?: string; rowGroup?: string; colGroup?: string } | null>(null)
  const [cellWorkType, setCellWorkType] = useState('')
  const [cellSug, setCellSug] = useState<Array<{ id: number; price_id: number; price_name?: string; price_unit?: string; price_category?: string; price_source?: string; price_source_page?: string; score?: number; status?: 'proposed' | 'accepted' | 'rejected'; work_type?: string }>>([])
  const [cellItems, setCellItems] = useState<Array<{ id: number; price_id: number; quantity?: number; unit_price?: number; currency?: string; total?: number; source?: string; source_page?: string; work_type?: string }>>([])
  const [calcItems, setCalcItems] = useState<{ row: Array<{ name?: string; unit?: string; price?: number; currency?: string }>; col: Array<{ name?: string; unit?: string; price?: number; currency?: string }>; row_total?: number; col_total?: number; row_currency?: string; col_currency?: string } | null>(null)
  const [collisionInfo, setCollisionInfo] = useState<{ unit?: string; min?: number; max?: number; scenarios?: Array<{ scenario: string; rationale?: string; items?: Array<{ price_id?: number; name: string; matched_name?: string; unit?: string; unit_price?: number; quantity?: number; total?: number; currency?: string }> }> } | null>(null)
  const [scenariosUi, setScenariosUi] = useState<Array<{ scenario: string; rationale?: string; items: Array<{ price_id?: number; name: string; quantity: number }> }>>([])
  const [editMode, setEditMode] = useState(false)
  const [addSel, setAddSel] = useState<Record<number, string>>({})

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
    } catch (e) {}
  }

  const loadCellStatuses = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/cells/status-summary')
      const j = await r.json()
      setCellStatuses(((j?.statuses || []) as any).map((s: any) => ({ row_index: s.row_index, col_index: s.col_index, status: s.status })))
    } catch (e) {}
  }

  useEffect(() => {
    loadCellSummary()
    loadCellStatuses()
  }, [])

  return (
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
                  {data.columns.slice(seg.start, seg.start + seg.length).map((c, i) => (
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
                  const r = data.rows[ri]
                  const rowVals = data.grid[ri]
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
                              <td key={`ccell-${ri}-${ciAbs}`} className="cell" style={{ cursor: 'pointer', backgroundColor: bg }} onClick={() => {
                                setCellPanel({ rowIndex: ri, colIndex: ciAbs, rowLabel: r.label, rowGroup: rseg.group, colLabel: data.columns[ciAbs].label, colGroup: data.columns[ciAbs].group })
                                fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any))
                                fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any))
                                fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/collision-cost`).then((r) => r.json()).then((j) => {
                                  const c = j?.collision || null
                                  const sc = (() => { try { return JSON.parse(c?.scenarios_json || '[]') } catch { return [] } })()
                                  setCollisionInfo(c ? { unit: c.unit, min: c.min, max: c.max, scenarios: sc } : null)
                                  setScenariosUi((Array.isArray(sc) ? sc : []).map((s: any) => ({ scenario: String(s?.scenario || ''), rationale: typeof s?.rationale === 'string' ? s.rationale : undefined, items: Array.isArray(s?.items) ? s.items.map((it: any) => ({ price_id: typeof it?.price_id === 'number' ? it.price_id : undefined, name: String(it?.name || it?.matched_name || ''), quantity: typeof it?.quantity === 'number' ? it.quantity : 1 })) : [] })))
                                  setEditMode(false)
                                })
                                fetch(`http://localhost:3001/api/cells/${ri}/${ciAbs}/calc-items`).then((r) => r.json()).then((j) => setCalcItems({ row: (j?.rowItems || []) as any, col: (j?.colItems || []) as any, row_total: typeof j?.row_total === 'number' ? j.row_total : undefined, col_total: typeof j?.col_total === 'number' ? j.col_total : undefined, row_currency: typeof j?.row_currency === 'string' ? j.row_currency : undefined, col_currency: typeof j?.col_currency === 'string' ? j.col_currency : undefined }))
                              }} title={`Σ ${display}${unit ? ` ${unit}` : ''}`}>{display}</td>
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
                    <td colSpan={2 + data.columns.length + (colSegments.length - 1)}></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {cellPanel && (
        <div className="suggestions">
          <div className="sug-head">Расчёт: <b>{cellPanel.rowGroup} / {cellPanel.rowLabel} × {cellPanel.colGroup} / {cellPanel.colLabel}</b></div>
          {collisionInfo && (
            <div className="panel">
              <div className="sub">Оценка коллизий</div>
              <div className="sub">Диапазон: {typeof collisionInfo.min === 'number' ? collisionInfo.min.toFixed(2) : '—'}–{typeof collisionInfo.max === 'number' ? collisionInfo.max.toFixed(2) : '—'} {collisionInfo.unit || ''}</div>
              <div className="sub">Затраты считаются по элементу строки</div>
              {calcItems && (
                <>
                  <div className="sub">Затраты (корректируется строка): {typeof calcItems.row_total === 'number' ? calcItems.row_total.toFixed(2) : '—'} {calcItems.row_currency || 'RUB'}</div>
                  <div className="sub">Затраты (корректируется колонка): {typeof calcItems.col_total === 'number' ? calcItems.col_total.toFixed(2) : '—'} {calcItems.col_currency || 'RUB'}</div>
                </>
              )}
              <div className="actions">
                <button title="Открыть/закрыть редактор сценариев" onClick={() => setEditMode((v) => !v)}>{editMode ? 'Закрыть редактор' : 'Редактировать сценарии'}</button>
                {editMode && (
                  <button title="Сохранить сценарии и пересчитать min–max" style={{ marginLeft: 8 }} onClick={() => {
                    const toSave = scenariosUi.map((s) => ({ scenario: s.scenario, rationale: s.rationale || undefined, items: s.items.map((it) => ({ price_id: it.price_id, name: it.name, quantity: it.quantity })) }))
                    fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/collision-scenarios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit: collisionInfo?.unit || null, scenarios: toSave }) })
                      .then(() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/collision-cost`).then((r) => r.json()).then((j) => {
                        const c = j?.collision || null
                        const sc = (() => { try { return JSON.parse(c?.scenarios_json || '[]') } catch { return [] } })()
                        setCollisionInfo(c ? { unit: c.unit, min: c.min, max: c.max, scenarios: sc } : null)
                        setScenariosUi((Array.isArray(sc) ? sc : []).map((s: any) => ({ scenario: String(s?.scenario || ''), rationale: typeof s?.rationale === 'string' ? s.rationale : undefined, items: Array.isArray(s?.items) ? s.items.map((it: any) => ({ price_id: typeof it?.price_id === 'number' ? it.price_id : undefined, name: String(it?.name || it?.matched_name || ''), quantity: typeof it?.quantity === 'number' ? it.quantity : 1 })) : [] })))
                        setEditMode(false)
                      }))
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
                  <div className="sub">Сценарии</div>
                  <div className="actions" style={{ marginBottom: 8 }}>
                    <button onClick={() => setScenariosUi((prev) => [...prev, { scenario: `Сценарий ${prev.length + 1}`, rationale: '', items: [] }])}>Добавить сценарий</button>
                  </div>
                  {scenariosUi.map((sc, si) => (
                    <div key={`sc-${si}`} className="panel" style={{ marginTop: 8 }}>
                      <div className="actions">
                        <input value={sc.scenario} onChange={(e) => setScenariosUi((prev) => prev.map((x, idx) => idx === si ? { ...x, scenario: e.target.value } : x))} style={{ width: '40%' }} />
                        <input value={sc.rationale || ''} onChange={(e) => setScenariosUi((prev) => prev.map((x, idx) => idx === si ? { ...x, rationale: e.target.value } : x))} style={{ width: '50%', marginLeft: 8 }} />
                        <button style={{ marginLeft: 8 }} onClick={() => setScenariosUi((prev) => prev.filter((_, idx) => idx !== si))}>Удалить</button>
                      </div>
                      <div className="actions" style={{ marginTop: 8 }}>
                        <select value={addSel[si] || ''} onChange={(e) => setAddSel((prev) => ({ ...prev, [si]: e.target.value }))}>
                          <option value="">Выберите работу</option>
                          {cellSug.map((s) => (
                            <option key={`opt-${si}-${s.id}`} value={String(s.price_id)}>{s.price_name || ''}</option>
                          ))}
                        </select>
                        <button style={{ marginLeft: 8 }} onClick={() => {
                          const val = addSel[si]
                          const opt = cellSug.find((s) => String(s.price_id) === val)
                          if (!opt) return
                          setScenariosUi((prev) => prev.map((x, idx) => idx === si ? { ...x, items: [...x.items, { price_id: opt.price_id, name: opt.price_name || '', quantity: 1 }] } : x))
                        }}>+ Работа</button>
                      </div>
                      <table className="sug-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Работа</th>
                            <th>Кол-во</th>
                            <th>Удалить</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sc.items.map((it, ii) => (
                            <tr key={`it-${si}-${ii}`}>
                              <td>{it.name}</td>
                              <td><input type="number" step="0.01" value={typeof it.quantity === 'number' ? it.quantity : 1} onChange={(e) => setScenariosUi((prev) => prev.map((x, idx) => idx === si ? { ...x, items: x.items.map((y, jj) => jj === ii ? { ...y, quantity: e.target.value === '' ? 1 : Number(e.target.value) } : y) } : x))} /></td>
                              <td><button onClick={() => setScenariosUi((prev) => prev.map((x, idx) => idx === si ? { ...x, items: x.items.filter((_, jj) => jj !== ii) } : x))}>Удалить</button></td>
                            </tr>
                          ))}
                          {sc.items.length === 0 && (
                            <tr>
                              <td colSpan={3} className="sub">Нет работ</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
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
            <button title="Сгенерировать релевантные цены для этой ячейки" onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/suggest`, { method: 'POST' }).then(() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)))}>Сгенерировать предложения (ячейка)</button>
            <button title="LLM примет/отклонит и добавит принятые в расчёт" onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/auto-approve`, { method: 'POST' }).then(() => { fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/suggestions?limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)); fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any)); loadCellSummary(); loadCellStatuses() })} style={{ marginLeft: 8 }}>Авто‑одобрить (LLM)</button>
            <select value={cellWorkType} onChange={(e) => { const v = e.target.value; setCellWorkType(v); fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/suggestions?work_type=${encodeURIComponent(v)}&limit=20`).then((r) => r.json()).then((j) => setCellSug((j?.suggestions || []) as any)) }}>
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
                  <td>{s.price_source_page ? (<a href={s.price_source_page} target="_blank" rel="noreferrer">{s.price_source || 'источник'}</a>) : (s.price_source || '—')}</td>
                  <td>
                    {s.status !== 'accepted' && (
                      <button onClick={() => fetch(`http://localhost:3001/api/cells/suggestions/${s.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) }).then(() => setCellSug((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'accepted' } : x))))}>Принять</button>
                    )}
                    {s.status !== 'rejected' && (
                      <button onClick={() => fetch(`http://localhost:3001/api/cells/suggestions/${s.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) }).then(() => setCellSug((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'rejected' } : x))))} style={{ marginLeft: 8 }}>Отклонить</button>
                    )}
                    <button style={{ marginLeft: 8 }} onClick={() => fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work_type: s.work_type || null, price_id: s.price_id }) }).then(() => { fetch(`http://localhost:3001/api/cells/${cellPanel!.rowIndex}/${cellPanel!.colIndex}/items`).then((r) => r.json()).then((j) => setCellItems((j?.items || []) as any)); loadCellSummary() })}>Добавить в ячейку</button>
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
                  <td>{i.source_page ? (<a href={i.source_page} target="_blank" rel="noreferrer">{i.source || 'источник'}</a>) : (i.source || '—')}</td>
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
  )
}

