/**
 * The built-in AI for SI (Super Intelligence).
 *   GET  /api/copilot  ->  { configured }
 *   POST /api/copilot  { mode, input, context, style }  ->  the answer, streamed as plain text.
 * Checks the SI plan / trial first (claim_copilot_use, as the user), then
 * streams Claude's answer with ANTHROPIC_API_KEY. Response headers x-si and
 * x-free-left carry the plan state. A failure after streaming has started is
 * sent in-band after a NUL character: "\u0000{json error}".
 */
import Anthropic from '@anthropic-ai/sdk'
import { CORS, env, handle, HttpError, json, preflight, readJson } from './_lib/http.js'
import { systemPrompt, type Mode } from './_lib/prompts.js'
import { requireUser, rpcAsUser } from './_lib/supabase.js'

const MODEL = () => env('AI_MODEL') ?? 'claude-opus-5-5'
const EFFORT = () => (env('AI_EFFORT') ?? 'low') as 'low' | 'medium' | 'high'
const MAX_CONTEXT = 400_000

export const OPTIONS = preflight

export function GET(): Promise<Response> {
  return handle(async () => json({ configured: !!env('ANTHROPIC_API_KEY'), model: MODEL() }))
}

interface Body {
  mode?: Mode
  input?: string
  context?: string
  style?: string
  /** Recent questions and answers, for follow-ups. */
  history?: string
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { mode = 'answer', input = '', context = '', style = '', history = '' } = await readJson<Body>(request)
    if (mode !== 'answer' && mode !== 'script' && mode !== 'suggest') throw new HttpError(400, 'Unknown mode.')
    if (!input.trim()) throw new HttpError(400, 'Nothing to answer.')
    const apiKey = env('ANTHROPIC_API_KEY')
    if (!apiKey) throw new HttpError(503, "The built-in AI isn't switched on yet. Add your own API key in Settings → SI.", 'AI_NOT_CONFIGURED')

    const claim = await rpcAsUser<{ si: boolean; free_left: number | null }>(user, 'claim_copilot_use', { p_mode: mode, p_builtin: true })

    const client = new Anthropic({ apiKey, maxRetries: 1 })
    const stream = client.beta.messages.stream(
      {
        model: MODEL(),
        max_tokens: mode === 'suggest' ? 1500 : 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: EFFORT() },
        system: systemPrompt(mode, style),
        messages: [
          {
            role: 'user',
            content: [
              // The deck repeats across questions during a call: cache it.
              { type: 'text', text: `<material>\n${context.slice(0, MAX_CONTEXT)}\n</material>`, cache_control: { type: 'ephemeral' } },
              ...(mode === 'answer' && history.trim() ? [{ type: 'text' as const, text: `<conversation>\n${history.slice(-6000)}\n</conversation>` }] : []),
              { type: 'text', text: mode === 'answer' ? `<question>${input.slice(0, 2000)}</question>` : `<slide>${input.slice(0, 8000)}</slide>` },
            ],
          },
        ],
      },
      { signal: request.signal },
    )

    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') controller.enqueue(encoder.encode(event.delta.text))
          }
          const final = await stream.finalMessage()
          if (final.stop_reason === 'refusal') {
            controller.enqueue(encoder.encode(`\u0000${JSON.stringify({ error: 'No answer was generated for this one. Try rephrasing the question.' })}`))
          }
        } catch (e) {
          const message =
            e instanceof Anthropic.RateLimitError
              ? 'The AI is busy right now — try again in a moment.'
              : e instanceof Anthropic.AuthenticationError
                ? 'The built-in AI key was rejected. Check ANTHROPIC_API_KEY.'
                : e instanceof Anthropic.APIError
                  ? `The AI service returned an error${e.status ? ` (${e.status})` : ''}.`
                  : 'The AI service is unavailable right now.'
          console.error('copilot stream failed', e)
          controller.enqueue(encoder.encode(`\u0000${JSON.stringify({ error: message })}`))
        }
        controller.close()
      },
      cancel() {
        stream.abort()
      },
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS,
        'x-si': String(claim.si),
        'x-free-left': claim.free_left === null ? '' : String(claim.free_left),
      },
    })
  })
}
