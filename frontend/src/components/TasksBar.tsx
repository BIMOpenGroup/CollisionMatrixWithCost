import { Fragment } from 'react'

type Task = { id: number; type: string; status: string; progress: number; message?: string }
type Log = { ts: string; level: string; message?: string }

export default function TasksBar({ lastTask, activeLogs, onUpdateLogs }: { lastTask: Task | null; activeLogs: Log[]; onUpdateLogs: (logs: Log[]) => void }) {
  if (!lastTask) return null
  return (
    <div className="panel" style={{ marginBottom: 10 }}>
      <div className="sub">Задача: {lastTask.type} · Статус: {lastTask.status} · Прогресс: {lastTask.progress}% {lastTask.message ? `· ${lastTask.message}` : ''}</div>
      <div className="actions">
        <button title="Показать логи последней задачи" onClick={() => fetch(`http://localhost:3001/api/tasks/${lastTask.id}/logs?limit=200`).then((r) => r.json()).then((j) => onUpdateLogs((j?.logs || []) as any))}>Показать логи</button>
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
  )
}

