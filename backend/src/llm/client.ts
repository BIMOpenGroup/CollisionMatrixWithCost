import { fetch } from 'undici'
import fs from 'fs'
import path from 'path'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function debugEnabled(): boolean {
  return process.env.LLM_DEBUG === '1'
}

function safeData(obj: any): any {
  if (obj && typeof obj === 'object') {
    const copy: any = {}
    for (const [k, v] of Object.entries(obj)) {
      if (/key/i.test(k)) copy[k] = '[hidden]'
      else copy[k] = v
    }
    return copy
  }
  return obj
}

function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate()
  )
  const hrs = pad(d.getHours())
  const mins = pad(d.getMinutes())
  const secs = pad(d.getSeconds())
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  const offMin = -d.getTimezoneOffset()
  const sign = offMin >= 0 ? '+' : '-'
  const offH = pad(Math.floor(Math.abs(offMin) / 60))
  const offM = pad(Math.abs(offMin) % 60)
  return `${year}-${month}-${day}T${hrs}:${mins}:${secs}.${ms}${sign}${offH}:${offM}`
}

function debugLog(message: string, data?: any) {
  if (!debugEnabled()) return
  const tsLocal = formatLocalIso(new Date())
  const line = `[LLM][${tsLocal}] ${message}${data !== undefined ? ` ${JSON.stringify(safeData(data))}` : ''}`
  try { console.log(line) } catch {}
  try {
    const dir = path.resolve(__dirname, '../../logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'llm.log'), line + '\n')
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
}

export function getLLMConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL
  if (!apiKey || !baseUrl || !model) return null
  return { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() }
}

export async function chatCompletionOpenAICompatible(params: {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  headers?: Record<string, string>
  responseFormat?: 'json_object'
  delayMs?: number
  maxRetries?: number
}): Promise<string | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.apiKey}`,
  }
  if (params.headers) {
    for (const [k, v] of Object.entries(params.headers)) headers[k] = v
  }
  const body = {
    model: params.model,
    messages: params.messages,
    temperature: typeof params.temperature === 'number' ? params.temperature : 0.2,
    response_format: { type: params.responseFormat || 'json_object' },
  }
  const url = `${params.baseUrl.replace(/\/+$|\/$/g, '')}/chat/completions`
  const delayMs = typeof params.delayMs === 'number' ? params.delayMs : Number(process.env.LLM_REQUEST_DELAY_MS || '300')
  const maxRetries = typeof params.maxRetries === 'number' ? params.maxRetries : Math.max(0, Number(process.env.LLM_MAX_RETRIES || '2'))
  const retryable = new Set([429, 500, 502, 503, 504])

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await sleep(delayMs + attempt * 200)
    debugLog('request:init', { baseUrl: params.baseUrl, model: params.model, attempt })
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    debugLog('response:status', { status: res.status, statusText: res.statusText, attempt })
    if (!res.ok) {
      if (retryable.has(res.status) && attempt < maxRetries) {
        continue
      }
      return null
    }
    const data = (await res.json()) as any
    const content = data?.choices?.[0]?.message?.content
    debugLog('response:content:received', { hasContent: Boolean(content), attempt })
    if (typeof content === 'string') {
      debugLog('response:content:text', { content })
    }
    return typeof content === 'string' ? content : null
  }
  return null
}

/**
 * Generic wrapper for LLM requests that expects a JSON response.
 */
export async function llmRequest<T>(
  logName: string,
  messages: ChatMessage[],
  parser: (content: string) => T | null,
  temperature = 0.1
): Promise<T | null> {
  const cfg = getLLMConfig()
  if (!cfg) return null

  try {
    debugLog(`provider:attempt:${logName}`, { baseUrl: cfg.baseUrl, model: cfg.model })
    const content = await chatCompletionOpenAICompatible({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages,
      temperature,
    })
    
    const result = content ? parser(content) : null
    debugLog(`provider:parsed:${logName}`, { baseUrl: cfg.baseUrl, model: cfg.model, success: Boolean(result) })
    return result
  } catch (e: any) {
    debugLog(`provider:error:${logName}`, { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
    return null
  }
}
