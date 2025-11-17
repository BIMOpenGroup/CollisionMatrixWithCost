import { useEffect, useState } from 'react'
import './App.css'
import { loadMatrixAuto, type MatrixResponse } from './data/loadMatrix'
import TasksBar from './components/TasksBar'
import MatrixTab from './tabs/MatrixTab'
import CostMatrixTab from './tabs/CostMatrixTab'
import ElementsTab from './tabs/ElementsTab'
import DisciplinesTab from './tabs/DisciplinesTab'
import LlmTab from './tabs/LlmTab'
import EventsTab from './tabs/EventsTab'

export default function AppOrchestrator() {
  const [data, setData] = useState<MatrixResponse | null>(null)
  const [tab, setTab] = useState<'matrix' | 'cost' | 'elements' | 'disciplines' | 'llm' | 'events'>('matrix')
  const [genMsg, setGenMsg] = useState('')
  const [disciplines, setDisciplines] = useState<Array<{ id: number; name: string; scope: string }>>([])
  const [, setTasks] = useState<Array<{ id: number; type: string; status: string; progress: number; message?: string }>>([])
  const [lastTask, setLastTask] = useState<{ id: number; type: string; status: string; progress: number; message?: string } | null>(null)
  const [activeLogs, setActiveLogs] = useState<Array<{ ts: string; level: string; message?: string }>>([])
  const [elementStatuses, setElementStatuses] = useState<Record<string, { status: string }>>({})

  useEffect(() => {
    loadMatrixAuto().then(setData).catch(() => {})
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
          if (!latest) setActiveLogs([])
        }).catch(() => {})
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
        for (const s of (j?.statuses || []) as any[]) map[`${s.grp}|${s.element}`] = { status: s.status }
        setElementStatuses(map)
      }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'disciplines') {
      fetch('http://localhost:3001/api/disciplines')
        .then((r) => r.json())
        .then((j) => setDisciplines((j?.disciplines || []) as any))
        .catch(() => {})
    }
  }, [tab])

  const onSaveDisciplines = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/disciplines/save', { method: 'POST' })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
    } catch {}
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

  return (
    <div className="container">
      <h1>Матрица коллизий (пример)</h1>
      <TasksBar lastTask={lastTask} activeLogs={activeLogs} onUpdateLogs={setActiveLogs} />
      <div className="actions">
        <button title="Просмотр исходной матрицы" onClick={() => setTab('matrix')}>Матрица</button>
        <button title="Матрица с диапазоном стоимости" onClick={() => setTab('cost')}>Матрица со стоимостью</button>
        <button title="Ранжирование прайса по элементам" onClick={() => setTab('elements')}>Элементы</button>
        <button title="Ранжирование прайса по дисциплинам" onClick={() => setTab('disciplines')}>Дисциплины</button>
        <button title="Провайдеры и пинг LLM" onClick={() => setTab('llm')}>LLM</button>
        <button title="Журнал событий приёмки/отказа" onClick={() => setTab('events')}>Журнал</button>
      </div>
      {data && tab === 'matrix' && <MatrixTab data={data} elementStatuses={elementStatuses} onSaveDisciplines={onSaveDisciplines} />}
      {data && tab === 'cost' && <CostMatrixTab data={data} />}
      {tab === 'elements' && <ElementsTab genMsg={genMsg} onGenerate={onGenerateElementSuggestions} />}
      {tab === 'disciplines' && <DisciplinesTab disciplines={disciplines} genMsg={genMsg} onGenerate={onGenerateDisciplineSuggestions} />}
      {tab === 'llm' && <LlmTab />}
      {tab === 'events' && <EventsTab />}
      {!data && tab === 'matrix' && <div className="loading">Загрузка матрицы…</div>}
    </div>
  )
}

