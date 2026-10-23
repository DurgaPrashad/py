import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '../../platform'
import type { CallListener } from '../../platform/web/speech/callListener'
import { errorMessage } from '../../services/tauri'
import type { Presentation } from '../../types'
import { useAccount } from '../account/account'
import { useSettings } from '../settings/settingsStore'
import { CopilotError, deckContext, runCopilot } from './api'
import { QuestionTracker } from './questions'

export interface QA {
  id: number
  question: string
  source: 'call' | 'typed'
  status: 'answering' | 'done' | 'error'
  /** Streams in while status is 'answering'. */
  answer?: string
  error?: string
  /** SI_REQUIRED etc., to offer an upgrade. */
  code?: string | null
}

export type ListenState = { state: 'idle' | 'starting' | 'listening' | 'error'; message?: string }

let nextId = 1

/**
 * State of the SI copilot during a presentation: listening to the call,
 * spotting questions, and asking the AI for answers grounded in the deck.
 */
export function useCopilot(p: Presentation | null, slideIndex: number, modelId: string) {
  const [items, setItems] = useState<QA[]>([])
  const [listen, setListen] = useState<ListenState>({ state: 'idle' })
  const [caption, setCaption] = useState('')
  const autoAnswer = useSettings((s) => s.settings.si.autoAnswer)
  const updateSettings = useSettings((s) => s.update)
  const setAutoAnswer = useCallback((on: boolean) => updateSettings('si', { autoAnswer: on }), [updateSettings])
  const listener = useRef<CallListener | null>(null)
  const tracker = useRef(new QuestionTracker())
  const latest = useRef({ p, slideIndex, autoAnswer })
  useEffect(() => {
    latest.current = { p, slideIndex, autoAnswer }
  })

  const update = (id: number, patch: Partial<QA>) => setItems((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const answer = useCallback(async (id: number, question: string) => {
    const { p: deck, slideIndex: at } = latest.current
    if (!deck) return
    try {
      const si = useSettings.getState().settings.si
      const res = await runCopilot(si, 'answer', question, deckContext(deck, at), (soFar) => update(id, { answer: soFar }))
      update(id, { status: 'done', answer: res.text })
      if (!res.si) void useAccount.getState().refresh().catch(() => null)
    } catch (e) {
      update(id, { status: 'error', answer: undefined, error: errorMessage(e), code: e instanceof CopilotError ? e.code : null })
    }
  }, [])

  /** Ask now (typed), or record a detected question (answered if auto-answer is on). */
  const ask = useCallback(
    (question: string, source: QA['source'] = 'typed') => {
      const text = question.trim()
      if (!text) return
      const id = nextId++
      const run = source === 'typed' || latest.current.autoAnswer
      const item: QA = { id, question: text, source, status: run ? 'answering' : 'done' }
      setItems((list) => [item, ...list].slice(0, 30))
      if (run) void answer(id, text)
    },
    [answer],
  )

  /** Answer a detected question that auto-answer skipped. */
  const answerItem = useCallback(
    (item: QA) => {
      update(item.id, { status: 'answering', error: undefined, code: undefined })
      void answer(item.id, item.question)
    },
    [answer],
  )

  const stopListening = useCallback(async () => {
    await listener.current?.stop()
    listener.current = null
    setListen({ state: 'idle' })
    setCaption('')
  }, [])

  const startListening = useCallback(async () => {
    if (platform.kind !== 'web') {
      setListen({ state: 'error', message: 'Listening to calls is available in the web app (Chrome or Edge). You can type questions here.' })
      return
    }
    setListen({ state: 'starting' })
    try {
      const { CallListener } = await import('../../platform/web/speech/callListener')
      const l = new CallListener()
      listener.current = l
      tracker.current = new QuestionTracker()
      l.onTranscript = (e) => {
        setCaption(e.text)
        if (!e.isFinal) return
        const q = tracker.current.push(e.text)
        if (q) ask(q, 'call')
      }
      l.onEnded = () => {
        listener.current = null
        setListen({ state: 'idle' })
        setCaption('')
      }
      await l.start(modelId)
      if (listener.current === l) setListen({ state: 'listening' })
    } catch (e) {
      listener.current = null
      const msg = errorMessage(e)
      if (msg !== 'SUPERSEDED') setListen({ state: 'error', message: msg })
    }
  }, [ask, modelId])

  useEffect(() => () => void listener.current?.stop(), [])

  return { items, listen, caption, autoAnswer, setAutoAnswer, ask, answerItem, startListening, stopListening, clear: () => setItems([]) }
}

export type Copilot = ReturnType<typeof useCopilot>
