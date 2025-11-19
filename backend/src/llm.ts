import { fetch } from 'undici'
import fs from 'fs'
import path from 'path'

export type LLMRankResult = { index: number; score: number }
export type LLMDecision = { suggestion_id?: number; price_id?: number; action: 'accept' | 'reject'; quantity?: number; unit_price?: number }
export type LLMElementDecision = { id?: number; price_id?: number; action: 'accept' | 'reject'; quantity?: number; unit_price?: number }

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

function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
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
    const dir = path.resolve(__dirname, '../logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'llm.log'), line + '\n')
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
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

function parseDecisionJson(content: string): LLMDecision[] | null {
  try {
    const parsed = JSON.parse(content)
    const arr = Array.isArray(parsed) ? parsed : parsed?.decisions || []
    const results: LLMDecision[] = []
    for (const item of arr) {
      const action = String((item as any).action || '').toLowerCase() as 'accept' | 'reject'
      if (action !== 'accept' && action !== 'reject') continue
      const suggestion_id = (item as any).suggestion_id
      const price_id = (item as any).price_id
      const quantity = (item as any).quantity
      const unit_price = (item as any).unit_price
      const out: LLMDecision = { action }
      if (Number.isFinite(Number(suggestion_id))) out.suggestion_id = Number(suggestion_id)
      if (Number.isFinite(Number(price_id))) out.price_id = Number(price_id)
      if (Number.isFinite(Number(quantity))) out.quantity = Number(quantity)
      if (Number.isFinite(Number(unit_price))) out.unit_price = Number(unit_price)
      results.push(out)
    }
    return results.length ? results : null
  } catch {
    return null
  }
}

function parseElementDecisionJson(content: string): LLMElementDecision[] | null {
  try {
    const parsed = JSON.parse(content)
    const arr = Array.isArray(parsed) ? parsed : parsed?.decisions || []
    const results: LLMElementDecision[] = []
    for (const item of arr) {
      const action = String((item as any).action || '').toLowerCase() as 'accept' | 'reject'
      if (action !== 'accept' && action !== 'reject') continue
      const id = (item as any).id
      const price_id = (item as any).price_id
      const quantity = (item as any).quantity
      const unit_price = (item as any).unit_price
      const out: LLMElementDecision = { action }
      if (Number.isFinite(Number(id))) out.id = Number(id)
      if (Number.isFinite(Number(price_id))) out.price_id = Number(price_id)
      if (Number.isFinite(Number(quantity))) out.quantity = Number(quantity)
      if (Number.isFinite(Number(unit_price))) out.unit_price = Number(unit_price)
      results.push(out)
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
  const cfg = getLLMConfig()
  if (!cfg) return null

  const system = `Ты — CRA‑AI. Цель — минимизация Стоимости Переделки на площадке.
Если контекст — дисциплина/элемент, оцени релевантность позиций прайса указанным работам.
Если контекст описывает ячейку (строка × колонка), определи ранги конфликтующих элементов по Иерархии: 1 КР; 2 АР; 3 ВК‑Самотек; 4 ОВ‑магистрали; 5 Напорные системы; 6 ЭОМ/СС. Назначь "Жертву" — элемент с более высоким числовым рангом (более гибкий).
Повышай score для работ, типичных для модификации Жертвы, и понижай для работ, предполагающих изменение Рангов 1–2.
Ответь строго JSON‑массивом [{index, score}] с индексами из списка кандидатов; score в диапазоне 0..1.`
  const user = `Дисциплина: ${discipline}\nКандидаты:\n${candidates
    .map((c, i) => `${i}. ${c.name}${c.unit ? ` (${c.unit})` : ''}${c.category ? ` — ${c.category}` : ''}`)
    .join('\n')}`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  try {
    debugLog('provider:attempt', { baseUrl: cfg.baseUrl, model: cfg.model, discipline, candidatesCount: candidates.length })
    const content = await chatCompletionOpenAICompatible({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages,
      temperature: 0.2,
    })
    const parsed = content ? parseRankJson(content) : null
    debugLog('provider:parsed', { baseUrl: cfg.baseUrl, model: cfg.model, resultCount: parsed?.length || 0 })
    if (parsed && parsed.length) return parsed
  } catch (e: any) {
    debugLog('provider:error', { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
  }

  return null
}
function getLLMConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL
  if (!apiKey || !baseUrl || !model) return null
  apiKey.trim()
  baseUrl.trim()
  model.trim()
  return { baseUrl, apiKey, model }
}

export async function llmDecideCell(
  context: string,
  candidates: Array<{ suggestion_id: number; price_id: number; name: string; unit?: string; category?: string; score?: number }>
): Promise<LLMDecision[] | null> {
  const cfg = getLLMConfig()
  if (!cfg) return null
  const system = `Ты — CRA‑AI. На входе ячейка матрицы (строка × колонка) и список предложений.
Сначала определи ранги элементов строки и колонки по Иерархии (1 КР … 6 ЭОМ/СС) и назначь "Жертву" (элемент с более высоким числовым рангом).
Прими позиции, соответствующие типовым работам по модификации Жертвы и минимизирующие Стоимость Переделки; отклони позиции, требующие изменения элементов Рангов 1–2 или не относящиеся к контексту.
Ответь строго JSON‑массивом [{suggestion_id, action, quantity?, unit_price?}]. Не придумывай quantity и unit_price.`
  const user = `Ячейка: ${context}
Предложения:
${candidates
    .map((c) => `- suggestion_id=${c.suggestion_id}; price_id=${c.price_id}; name=${c.name}${c.unit ? ` (${c.unit})` : ''}${c.category ? `; category=${c.category}` : ''}${typeof c.score === 'number' ? `; score=${c.score}` : ''}`)
    .join('\n')}`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  try {
    debugLog('provider:attempt:decide', { baseUrl: cfg.baseUrl, model: cfg.model, context, candidatesCount: candidates.length })
    const content = await chatCompletionOpenAICompatible({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature: 0.1 })
    const parsed = content ? parseDecisionJson(content) : null
    debugLog('provider:parsed:decide', { baseUrl: cfg.baseUrl, model: cfg.model, resultCount: parsed?.length || 0 })
    if (parsed && parsed.length) return parsed
  } catch (e: any) {
    debugLog('provider:error:decide', { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
  }
  return null
}

export async function llmDecideElement(
  context: string,
  candidates: Array<{ id?: number; price_id: number; name: string; unit?: string; category?: string; price?: number }>
): Promise<LLMElementDecision[] | null> {
  const cfg = getLLMConfig()
  if (!cfg) return null
  const system = `Ты помощник-сметчик. На входе элемент матрицы и список предложений цен.
Задача: решить какие принять/отклонить. Верни JSON-массив [{id?, price_id, action, quantity?, unit_price?}].`
  const user = `Элемент: ${context}
Предложения:
${candidates
    .map((c, i) => `- ${typeof c.id === 'number' ? `id=${c.id}; ` : ''}price_id=${c.price_id}; name=${c.name}${c.unit ? ` (${c.unit})` : ''}${c.category ? `; category=${c.category}` : ''}${typeof c.price === 'number' ? `; price=${c.price}` : ''}`)
    .join('\n')}`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  try {
    debugLog('provider:attempt:decide:element', { baseUrl: cfg.baseUrl, model: cfg.model, context, candidatesCount: candidates.length })
    const content = await chatCompletionOpenAICompatible({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature: 0.1 })
    const parsed = content ? parseElementDecisionJson(content) : null
    debugLog('provider:parsed:decide:element', { baseUrl: cfg.baseUrl, model: cfg.model, resultCount: parsed?.length || 0 })
    if (parsed && parsed.length) return parsed
  } catch (e: any) {
    debugLog('provider:error:decide:element', { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
  }
  return null
}

export async function llmCollisionEstimate(
  context: string,
  rowItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>,
  colItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>
): Promise<{ unit?: string; price_min?: number; price_max?: number; scenarios_json?: string } | null> {
  const cfg = getLLMConfig()
  if (!cfg) return null
  const system = `Ты — CRA‑AI. На входе коллизия двух элементов матрицы и принятые цены по элементу строки и колонки.
Определи ранги и "Жертву" по Иерархии. Сгенерируй 3–5 реалистичных сценариев устранения коллизии на площадке с фокусом на минимизацию Стоимости Переделки.
Для каждого сценария перечисли типовые работы (items) — короткие названия как в прайсе, без выдуманных единиц измерения и без цен; добавь краткое обоснование (rationale) со ссылкой на факторы Иерархии/логистики.
Верни JSON: {unit:'м'|'м²'|'м³', price_min:number, price_max:number, scenarios:[{scenario:string, rationale:string, items:[{name:string}]}]}. Диапазон price_min/price_max оцени как порядок величины; точные цены будут рассчитаны отдельно.`
  const user = `Ячейка: ${context}
Строка: ${rowItems.map((i) => `${i.name}${i.unit ? ` (${i.unit})` : ''}${typeof i.price === 'number' ? `; price=${i.price}` : ''}`).join('; ')}
Колонка: ${colItems.map((i) => `${i.name}${i.unit ? ` (${i.unit})` : ''}${typeof i.price === 'number' ? `; price=${i.price}` : ''}`).join('; ')}`
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  try {
    debugLog('provider:attempt:collision', { baseUrl: cfg.baseUrl, model: cfg.model, context, rowCount: rowItems.length, colCount: colItems.length })
    const content = await chatCompletionOpenAICompatible({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature: 0.1 })
    let unit: string | undefined
    let price_min: number | undefined
    let price_max: number | undefined
    let scenarios_json: string | undefined
    try {
      const parsed = JSON.parse(String(content || '{}'))
      unit = typeof parsed?.unit === 'string' ? parsed.unit : undefined
      price_min = Number(parsed?.price_min)
      price_max = Number(parsed?.price_max)
      const sc = parsed?.scenarios
      scenarios_json = sc ? JSON.stringify(sc) : undefined
    } catch {}
    debugLog('provider:parsed:collision', { baseUrl: cfg.baseUrl, model: cfg.model, unit, price_min, price_max })
    return { unit, price_min: Number.isFinite(price_min) ? price_min : undefined, price_max: Number.isFinite(price_max) ? price_max : undefined, scenarios_json }
  } catch (e: any) {
    debugLog('provider:error:collision', { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
  }
  return null
}

export async function llmRiskEstimate(
  context: string,
  rowItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>,
  colItems: Array<{ price_id: number; name?: string; unit?: string; category?: string; price?: number; currency?: string }>
): Promise<{ hazard?: number; importance?: number; difficulty?: number; rationale_json?: string } | null> {
  const cfg = getLLMConfig()
  if (!cfg) return null
  const system = `Ты — CRA‑AI. На входе ячейка матрицы с принятыми позициями по строке и колонке.
Оцени риск по онтологии: 1) Identify (ранги элементов); 2) Determine Victim ("Жертва"); 3) Evaluate Range (диапазон затрат по Матрице); 4) Synthesize.
Верни строгий JSON {hazard:0..1, importance:0..1, difficulty:0..1, rationale:[{factor:string, note?:string}]}. hazard — потенциальная тяжесть/безопасность; importance — влияние на сроки/стоимость; difficulty — технологическая/логистическая сложность.`
  const user = `Ячейка: ${context}
Строка: ${rowItems.map((i) => `${i.name}${i.unit ? ` (${i.unit})` : ''}${typeof i.price === 'number' ? `; price=${i.price}` : ''}`).join('; ')}
Колонка: ${colItems.map((i) => `${i.name}${i.unit ? ` (${i.unit})` : ''}${typeof i.price === 'number' ? `; price=${i.price}` : ''}`).join('; ')}`
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  try {
    debugLog('provider:attempt:risk', { baseUrl: cfg.baseUrl, model: cfg.model, context, rowCount: rowItems.length, colCount: colItems.length })
    const content = await chatCompletionOpenAICompatible({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature: 0.1 })
    let hazard: number | undefined
    let importance: number | undefined
    let difficulty: number | undefined
    let rationale_json: string | undefined
    try {
      const parsed = JSON.parse(String(content || '{}'))
      hazard = Number(parsed?.hazard)
      importance = Number(parsed?.importance)
      difficulty = Number(parsed?.difficulty)
      const r = parsed?.rationale
      rationale_json = r ? JSON.stringify(r) : undefined
    } catch {}
    debugLog('provider:parsed:risk', { baseUrl: cfg.baseUrl, model: cfg.model, hazard, importance, difficulty })
    return {
      hazard: Number.isFinite(hazard) ? Math.max(0, Math.min(1, hazard!)) : undefined,
      importance: Number.isFinite(importance) ? Math.max(0, Math.min(1, importance!)) : undefined,
      difficulty: Number.isFinite(difficulty) ? Math.max(0, Math.min(1, difficulty!)) : undefined,
      rationale_json,
    }
  } catch (e: any) {
    debugLog('provider:error:risk', { baseUrl: cfg.baseUrl, model: cfg.model, error: e?.message || String(e) })
  }
  return null
}
