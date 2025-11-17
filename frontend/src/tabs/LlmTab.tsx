import { useState } from 'react'

export default function LlmTab() {
  const [providers, setProviders] = useState<Array<{ name: string; baseUrl: string; model: string; apiKeyPresent: boolean }>>([])
  const [llmPing, setLlmPing] = useState<{ provider?: string; content?: string } | null>(null)
  const [llmPingMsg, setLlmPingMsg] = useState('test')

  const loadProviders = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/debug/llm/providers')
      const j = await r.json()
      setProviders((j?.providers || []) as any)
    } catch (e) {}
  }

  const pingLLM = async () => {
    try {
      const r = await fetch('http://localhost:3001/api/debug/llm/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: llmPingMsg }) })
      const j = await r.json()
      setLlmPing({ provider: j?.provider, content: j?.content })
    } catch (e) {}
  }

  return (
    <div className="panel">
      <div className="actions" style={{ marginBottom: 8 }}>
        <button onClick={loadProviders}>Загрузить провайдеров</button>
      </div>
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
  )
}

