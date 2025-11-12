import { fetch } from 'undici'
import fs from 'fs'
import path from 'path'

export type LLMRankResult = { index: number; score: number }

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

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

function debugLog(message: string, data?: any) {
  if (!debugEnabled()) return
  const ts = new Date().toISOString()
  const line = `[LLM][${ts}] ${message}${data !== undefined ? ` ${JSON.stringify(safeData(data))}` : ''}`
  try { console.log(line) } catch {}
  try {
    const dir = path.resolve(__dirname, '../logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'llm.log'), line + '\n')
  } catch {}
}

export async function chatCompletionOpenAICompatible(params: {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  headers?: Record<string, string>
  responseFormat?: 'json_object'
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
  debugLog('request:init', { baseUrl: params.baseUrl, model: params.model })
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  debugLog('response:status', { status: res.status, statusText: res.statusText })
  if (!res.ok) return null
  const data = (await res.json()) as any
  const content = data?.choices?.[0]?.message?.content
  debugLog('response:content:received', { hasContent: Boolean(content) })
  return typeof content === 'string' ? content : null
}

function parseRankJson(content: string): LLMRankResult[] | null {
  try {
    const parsed = JSON.parse(content)
    const arr = Array.isArray(parsed) ? parsed : parsed?.rank || []
    const results: LLMRankResult[] = []
    for (const item of arr) {
      const idx = Number((item as any).index)
      const score = Number((item as any).score)
      if (Number.isFinite(idx) && Number.isFinite(score)) results.push({ index: idx, score })
    }
    return results.length ? results : null
  } catch {
    return null
  }
}

export async function llmRerank(
  discipline: string,
  candidates: Array<{ name: string; unit?: string; category?: string }>
): Promise<LLMRankResult[] | null> {
  const mistralKey = process.env.MISTRAL_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!mistralKey && !openaiKey) return null

  const system = `Ты помощник-сметчик. На входе дисциплина (направление работ) и список позиций из прайс-листа.
Задача: расставить приоритет (0..1) по релевантности дисциплине. Верни JSON-массив [{index, score}].`
  const user = `Дисциплина: ${discipline}\nКандидаты:\n${candidates
    .map((c, i) => `${i}. ${c.name}${c.unit ? ` (${c.unit})` : ''}${c.category ? ` — ${c.category}` : ''}`)
    .join('\n')}`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  const providers: Array<{ baseUrl: string; apiKey: string; model: string }> = []
  if (mistralKey) {
    providers.push({
      baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
      apiKey: mistralKey,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
    })
  }
  if (openaiKey) {
    providers.push({
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    })
  }

  for (const p of providers) {
    try {
      debugLog('provider:attempt', { baseUrl: p.baseUrl, model: p.model, discipline, candidatesCount: candidates.length })
      const content = await chatCompletionOpenAICompatible({
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        model: p.model,
        messages,
        temperature: 0.2,
      })
      const parsed = content ? parseRankJson(content) : null
      debugLog('provider:parsed', { baseUrl: p.baseUrl, model: p.model, resultCount: parsed?.length || 0 })
      if (parsed && parsed.length) return parsed
    } catch (e: any) {
      debugLog('provider:error', { baseUrl: p.baseUrl, model: p.model, error: e?.message || String(e) })
    }
  }

  return null
}