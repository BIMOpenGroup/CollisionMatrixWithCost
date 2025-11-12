import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  delete process.env.MISTRAL_API_KEY
  delete process.env.OPENAI_API_KEY
})

import { llmRerank } from '../src/llm'

describe('llmRerank without providers', () => {
  it('returns null when no API keys', async () => {
    const res = await llmRerank('ОВ', [{ name: 'Монтаж радиатора', unit: 'шт', category: 'ОВ' }])
    expect(res).toBeNull()
  })
})

