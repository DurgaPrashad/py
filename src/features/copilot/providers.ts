/*
 * SI with the presenter's own API key. Requests go straight from this device
 * to the provider (the key never touches our server) and answers stream in,
 * so the first words show up while the rest is still being written.
 */
import type { OwnKeyProvider, Settings } from '../../types'

export interface ProviderInfo {
  label: string
  /** Where to create a key. */
  keyUrl: string | null
  keyPlaceholder: string
  /** Model suggestions; any model id the provider accepts can be typed. */
  models: string[]
  /** Base URL of an OpenAI-compatible API (not used by Anthropic / Gemini). */
  baseUrl?: string
  keyOptional?: boolean
  note: string
}

export const PROVIDERS: Record<OwnKeyProvider, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    note: 'Claude Opus 5.5 gives the most careful answers; Haiku 5.5 is the fastest.',
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    models: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'],
    baseUrl: 'https://api.openai.com/v1',
    note: 'Uses the Chat Completions API.',
  },
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
    note: 'Keys from Google AI Studio.',
  },
  groq: {
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
    baseUrl: 'https://api.groq.com/openai/v1',
    note: 'Very fast open models — good for live answers.',
  },
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    models: ['openai/gpt-5-mini', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
    baseUrl: 'https://openrouter.ai/api/v1',
    note: 'One key for hundreds of models; use any model id from openrouter.ai/models.',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    keyUrl: null,
    keyPlaceholder: 'Optional for local servers',
    models: ['llama3.1', 'qwen2.5', 'deepseek-chat', 'mistral-small-latest'],
    keyOptional: true,
    note: 'Any API with an OpenAI-style /chat/completions endpoint: Ollama, LM Studio, DeepSeek, Mistral, Together, Azure OpenAI…',
  },
}

export interface CompletionRequest {
  system: string
  /** The deck material: identical across questions in a call (cached where supported). */
  material: string
  prompt: string
  maxTokens?: number
  onText?: (soFar: string) => void
  signal?: AbortSignal
}

/** Is this provider set up enough to try? */
export function ownKeyReady(si: Settings['si']): boolean {
  if (si.provider === 'reflex') return false
  const p = si.provider
  return !!si.models[p].trim() && (!!PROVIDERS[p].keyOptional || !!si.keys[p].trim()) && (p !== 'custom' || !!si.baseUrl.trim())
}

/** Runs one completion with the presenter's own provider and key. */
export async function complete(si: Settings['si'], req: CompletionRequest): Promise<string> {
  const provider = si.provider as OwnKeyProvider
  const key = si.keys[provider].trim()
  const model = si.models[provider].trim()
  if (!model) throw new Error('Choose a model in Settings → SI.')
  if (!key && !PROVIDERS[provider].keyOptional) throw new Error(`Add your ${PROVIDERS[provider].label} API key in Settings → SI.`)
  if (provider === 'anthropic') return completeAnthropic(key, model, req)
  if (provider === 'gemini') return completeGemini(key, model, req)
  const base = (provider === 'custom' ? si.baseUrl : PROVIDERS[provider].baseUrl!).trim().replace(/\/+$/, '')
  if (!base) throw new Error('Enter the API base URL in Settings → SI.')
  return completeOpenAiCompatible(provider, base, key, model, req)
}

// ------------------------------------------------------------------ Claude

// Effort and server-side fallbacks exist on current Claude models only.
const SUPPORTS_EFFORT = /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[678])/
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5-1|sonnet-5-5)/

async function completeAnthropic(apiKey: string, model: string, req: CompletionRequest): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  // The key is the presenter's own and stays on their device.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
  const fallback = SUPPORTS_FALLBACK.test(model)
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: req.maxTokens ?? 4000,
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      ...(SUPPORTS_EFFORT.test(model) ? { output_config: { effort: 'low' as const } } : {}),
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `<material>\n${req.material}\n</material>`, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    },
    { signal: req.signal },
  )
  let text = ''
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text
        req.onText?.(text)
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') throw new Error('Claude declined to answer this one. Try rephrasing the question.')
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the API key. Check it in Settings → SI.')
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error(`Anthropic: this key can't use ${model}.`)
    if (e instanceof Anthropic.NotFoundError) throw new Error(`Anthropic: model “${model}” was not found.`)
    if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic rate limit reached — try again in a moment.')
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic error${e.status ? ` (${e.status})` : ''}: ${e.message}`)
    throw e
  }
  return text.trim()
}

// ------------------------------------------------------------------ OpenAI-compatible

async function completeOpenAiCompatible(provider: OwnKeyProvider, base: string, key: string, model: string, req: CompletionRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin
    headers['X-Title'] = 'Reflex Presenter'
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal: req.signal,
    body: JSON.stringify({
      model,
      stream: true,
      // OpenAI's newer models only take max_completion_tokens; compatible servers expect max_tokens.
      ...(provider === 'openai' ? { max_completion_tokens: req.maxTokens ?? 4000 } : { max_tokens: req.maxTokens ?? 1200 }),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: `<material>\n${req.material}\n</material>\n\n${req.prompt}` },
      ],
    }),
  }).catch((e: Error) => {
    if (e.name === 'AbortError') throw e
    // OpenAI sends auth errors without CORS headers, so the browser only sees a network failure.
    if (provider === 'openai') throw new Error('OpenAI didn’t accept the request — usually an invalid API key, or a model this key can’t use.')
    throw new Error(`Couldn't reach ${base}. ${provider === 'custom' ? 'Check the URL and that the server allows requests from this site (CORS).' : e.message}`)
  })
  if (!res.ok) throw new Error(`${PROVIDERS[provider].label}: ${await errorText(res)}`)
  let text = ''
  await readSse(res, (data) => {
    const chunk = (JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] }).choices?.[0]?.delta?.content
    if (chunk) {
      text += chunk
      req.onText?.(text)
    }
  })
  return text.trim()
}

// ------------------------------------------------------------------ Gemini

async function completeGemini(key: string, model: string, req: CompletionRequest) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: req.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: `<material>\n${req.material}\n</material>\n\n${req.prompt}` }] }],
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4000 },
    }),
  })
  if (!res.ok) throw new Error(`Google Gemini: ${await errorText(res)}`)
  let text = ''
  await readSse(res, (data) => {
    const parts = (JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }).candidates?.[0]?.content?.parts
    const chunk = parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
    if (chunk) {
      text += chunk
      req.onText?.(text)
    }
  })
  return text.trim()
}

// ------------------------------------------------------------------ helpers

/** Calls `onData` with each `data:` payload of a server-sent-events response. */
async function readSse(res: Response, onData: (data: string) => void) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        onData(data)
      } catch {
        // keep-alive comments or partial JSON from odd servers
      }
    }
  }
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  let msg = ''
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message ?? '')
  } catch {
    msg = body.slice(0, 200)
  }
  if (res.status === 401 || res.status === 403) return `the API key was rejected (${res.status}). ${msg}`.trim()
  if (res.status === 404) return `model or endpoint not found (404). ${msg}`.trim()
  if (res.status === 429) return `rate limit or quota reached (429). ${msg}`.trim()
  return `${msg || res.statusText || 'request failed'} (${res.status})`
}
