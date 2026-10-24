import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { platform } from '../../platform'
import type { CallListener } from '../../platform/web/speech/callListener'
import { SyncSession } from '../../services/alignment/syncSession'
import { errorMessage } from '../../services/tauri'
import type { Presentation, TranscriptEvent } from '../../types'
import { entitlements, useAccount } from '../account/account'
import { useSettings } from '../settings/settingsStore'
import { CopilotError, deckContext, runCopilot } from './api'
import { answerLayout } from './AnswerText'
import { QuestionTracker } from './questions'
import { localSuggestions, parseSuggestions } from './suggestions'

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
  at: number
}

export type ListenState = 'idle' | 'starting' | 'listening'

/** Quiet time after a question before answering, so multi-part questions arrive whole. */
const SETTLE_MS = 1300
/** "Answer now" uses what was said on the call in this window. */
const RECENT_MS = 30_000
/** How long a notice (e.g. a listening problem) stays up. */
const NOTICE_MS = 6000

let nextId = 1
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * State of the SI (Super Intelligence) assistant during a presentation:
 * listening to the call, deciding when a question is complete, asking the AI
 * (with the recent conversation for follow-ups), suggesting likely questions
 * for the slide on screen, and following the presenter's voice through the
 * answer being read.
 */
export function useCopilot(p: Presentation | null, slideIndex: number, modelId: string, open: boolean) {
  const [items, setItems] = useState<QA[]>([])
  const [viewId, setViewId] = useState<number | null>(null)
  const [listen, setListen] = useState<ListenState>('idle')
  const [notice, setNoticeState] = useState<string | null>(null)
  /** Live call transcript: recent finished phrases plus the one in progress. */
  const [heard, setHeard] = useState<{ final: string[]; partial: string }>({ final: [], partial: '' })
  const [readIndex, setReadIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<{ key: string; questions: string[]; loading: boolean }>({ key: '', questions: [], loading: false })
  const autoAnswer = useSettings((s) => s.settings.si.autoAnswer)
  const updateSettings = useSettings((s) => s.update)
  const setAutoAnswer = useCallback((on: boolean) => updateSettings('si', { autoAnswer: on }), [updateSettings])

  const listener = useRef<CallListener | null>(null)
  const tracker = useRef(new QuestionTracker())
  const pending = useRef<{ text: string; timer?: ReturnType<typeof setTimeout> } | null>(null)
  const recent = useRef<{ text: string; at: number }[]>([])
  const reading = useRef<{ id: number; session: SyncSession } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const suggestionCache = useRef(new Map<string, string[]>())
  const itemsRef = useRef(items)
  const latest = useRef({ p, slideIndex, autoAnswer })
  useEffect(() => {
    latest.current = { p, slideIndex, autoAnswer }
    itemsRef.current = items
  })

  const setNotice = useCallback((message: string | null) => {
    clearTimeout(noticeTimer.current)
    setNoticeState(message)
    if (message) noticeTimer.current = setTimeout(() => setNoticeState(null), NOTICE_MS)
  }, [])

  const update = (id: number, patch: Partial<QA>) => setItems((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  /** The last few answered questions, oldest first, for follow-ups. */
  const historyFor = (id: number) =>
    itemsRef.current
      .filter((q) => q.id !== id && q.status === 'done' && q.answer)
      .slice(0, 3)
      .reverse()
      .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
      .join('\n\n')

  const answer = useCallback(async (id: number, question: string) => {
    const { p: deck, slideIndex: at } = latest.current
    if (!deck) return
    try {
      const si = useSettings.getState().settings.si
      const res = await runCopilot(si, 'answer', question, deckContext(deck, at), {
        history: historyFor(id),
        onText: (soFar) => update(id, { answer: soFar }),
      })
      update(id, { status: 'done', answer: res.text })
      if (!res.si) void useAccount.getState().refresh().catch(() => null)
    } catch (e) {
      update(id, { status: 'error', answer: undefined, error: errorMessage(e), code: e instanceof CopilotError ? e.code : null })
    }
  }, [])

  /**
   * Add a question; it's answered now if typed, forced, or auto-answer is on.
   * The same question twice in a row (double Enter / click) is ignored.
   */
  const ask = useCallback(
    (question: string, source: QA['source'] = 'typed', force = false): boolean => {
      const text = question.trim()
      if (!text) return false
      const key = norm(text)
      const dup = itemsRef.current.find((q) => norm(q.question) === key && (q.status === 'answering' || Date.now() - q.at < 3000))
      if (dup) {
        setViewId(dup.id === itemsRef.current[0]?.id ? null : dup.id)
        return false
      }
      const id = nextId++
      const run = force || source === 'typed' || latest.current.autoAnswer
      const item: QA = { id, question: text, source, status: run ? 'answering' : 'done', at: Date.now() }
      itemsRef.current = [item, ...itemsRef.current]
      setItems((list) => [item, ...list].slice(0, 30))
      setViewId(null) // jump to the newest
      if (run) void answer(id, text)
      return true
    },
    [answer],
  )

  const answerItem = useCallback(
    (item: QA) => {
      update(item.id, { status: 'answering', error: undefined, code: undefined, answer: undefined })
      void answer(item.id, item.question)
    },
    [answer],
  )

  const firePending = useCallback(() => {
    const q = pending.current
    if (!q) return
    clearTimeout(q.timer)
    pending.current = null
    recent.current = []
    ask(q.text, 'call')
  }, [ask])

  const settleLater = useCallback(() => {
    if (!pending.current) return
    clearTimeout(pending.current.timer)
    pending.current.timer = setTimeout(firePending, SETTLE_MS)
  }, [firePending])

  /** Call transcript in: show it, and decide when a question is complete. */
  const onCallSpeech = useCallback(
    (e: TranscriptEvent) => {
      if (!e.isFinal) {
        setHeard((h) => ({ ...h, partial: e.text }))
        settleLater() // they're still talking: wait for the end of the question
        return
      }
      setHeard((h) => ({ final: [...h.final, e.text].slice(-6), partial: '' }))
      const now = Date.now()
      recent.current = [...recent.current.filter((r) => now - r.at < RECENT_MS), { text: e.text, at: now }]
      if (pending.current) {
        pending.current.text = `${pending.current.text} ${e.text}`.trim()
        settleLater()
        return
      }
      const q = tracker.current.push(e.text, now)
      if (q) {
        pending.current = { text: q }
        settleLater()
      }
    },
    [settleLater],
  )

  /** ⌘↵: answer what was just asked (even if it didn't sound like a question). False if nothing was heard. */
  const answerNow = useCallback((): boolean => {
    if (pending.current) {
      const q = pending.current
      clearTimeout(q.timer)
      pending.current = null
      recent.current = []
      return ask(q.text, 'call', true)
    }
    const now = Date.now()
    const text = recent.current
      .filter((r) => now - r.at < RECENT_MS)
      .slice(-2)
      .map((r) => r.text)
      .join(' ')
    if (!text.trim()) return false
    recent.current = []
    return ask(text, 'call', true)
  }, [ask])

  const clearTranscript = useCallback(() => {
    setHeard({ final: [], partial: '' })
    recent.current = []
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
  }, [])

  const stopListening = useCallback(async () => {
    await listener.current?.stop()
    listener.current = null
    setListen('idle')
    setHeard((h) => ({ ...h, partial: '' }))
  }, [])

  const startListening = useCallback(async () => {
    if (platform.kind !== 'web') {
      setNotice('Listening to calls works in the web app (Chrome or Edge). You can type questions here.')
      return
    }
    setListen('starting')
    setNotice(null)
    try {
      const { CallListener } = await import('../../platform/web/speech/callListener')
      const l = new CallListener()
      listener.current = l
      tracker.current = new QuestionTracker()
      l.onTranscript = onCallSpeech
      l.onEnded = () => {
        listener.current = null
        setListen('idle')
      }
      await l.start(modelId)
      if (listener.current === l) setListen('listening')
    } catch (e) {
      listener.current = null
      setListen('idle')
      const msg = errorMessage(e)
      // Cancelling the share picker is a choice, not an error.
      if (msg !== 'SUPERSEDED' && msg !== 'Sharing was cancelled.') setNotice(msg)
    }
  }, [onCallSpeech, modelId, setNotice])

  useEffect(
    () => () => {
      void listener.current?.stop()
      if (pending.current) clearTimeout(pending.current.timer)
      clearTimeout(noticeTimer.current)
    },
    [],
  )

  // ------------------------------------------------ suggested questions

  const slide = p?.slides[slideIndex]
  const suggestionKey = p && slide ? `${p.id}:${slide.id}:${slide.script.length}:${slide.extractedText.length}` : ''
  const loadSuggestions = useCallback(
    async (force = false) => {
      const { p: deck, slideIndex: at } = latest.current
      const current = deck?.slides[at]
      if (!deck || !current) return
      const key = `${deck.id}:${current.id}:${current.script.length}:${current.extractedText.length}`
      const cached = suggestionCache.current.get(key)
      if (cached && !force) {
        setSuggestions({ key, questions: cached, loading: false })
        return
      }
      const fallback = localSuggestions(current)
      const ent = entitlements(useAccount.getState().profile)
      if (!useAccount.getState().session || !ent.canAsk) {
        setSuggestions({ key, questions: fallback, loading: false })
        return
      }
      setSuggestions({ key, questions: cached ?? fallback, loading: true })
      try {
        const slideText = [current.extractedText, current.script].filter((t) => t.trim()).join('\n\n') || `Slide ${at + 1}`
        const res = await runCopilot(useSettings.getState().settings.si, 'suggest', slideText, deckContext(deck, at))
        const questions = parseSuggestions(res.text)
        const final = questions.length ? questions : fallback
        suggestionCache.current.set(key, final)
        setSuggestions((s) => (s.key === key ? { key, questions: final, loading: false } : s))
      } catch {
        setSuggestions((s) => (s.key === key ? { key, questions: fallback, loading: false } : s))
      }
    },
    [],
  )

  // New slide (while the assistant is open): fresh suggestions, after a short pause.
  useEffect(() => {
    if (!open || !suggestionKey) return
    const t = setTimeout(() => void loadSuggestions(), 500)
    return () => clearTimeout(t)
  }, [open, suggestionKey, loadSuggestions])

  // ------------------------------------------------ viewing & reading answers

  const index = Math.max(0, viewId === null ? 0 : items.findIndex((q) => q.id === viewId))
  const current: QA | undefined = items[index]
  const layout = useMemo(() => (current?.status === 'done' && current.answer ? answerLayout(current.answer) : null), [current?.status, current?.answer])

  // A finished answer gets its own aligner: the presenter's voice moves the highlight.
  useEffect(() => {
    if (!current || !layout) {
      reading.current = null
      setReadIndex(-1)
      return
    }
    if (reading.current?.id === current.id) return
    reading.current = { id: current.id, session: new SyncSession(layout.words, null) }
    setReadIndex(-1)
  }, [current, layout])

  /** The presenter's microphone transcript (from the teleprompter engine). */
  const onPresenterSpeech = useCallback((e: TranscriptEvent) => {
    const r = reading.current
    if (!r || !useSettings.getState().settings.si.followVoice) return
    const res = r.session.handle(e)
    if (res.outcome?.moved) setReadIndex(r.session.aligner.wordIndex)
  }, [])

  const go = useCallback(
    (delta: number) => {
      if (!items.length) return
      const next = Math.max(0, Math.min(items.length - 1, index + delta))
      setViewId(next === 0 ? null : items[next].id)
    },
    [items, index],
  )

  return {
    items,
    current,
    index,
    layout,
    readIndex,
    /** Older answers are further down the list: ⌘← goes back in time. */
    older: () => go(1),
    newer: () => go(-1),
    listen,
    notice,
    dismissNotice: () => setNotice(null),
    heard,
    suggestions: suggestions.key === suggestionKey ? suggestions : { key: suggestionKey, questions: localSuggestions(slide), loading: false },
    refreshSuggestions: () => void loadSuggestions(true),
    autoAnswer,
    setAutoAnswer,
    ask,
    answerItem,
    answerNow,
    startListening,
    stopListening,
    clearTranscript,
    onPresenterSpeech,
    clear: () => {
      setItems([])
      itemsRef.current = []
      setViewId(null)
      clearTranscript()
    },
  }
}

export type Copilot = ReturnType<typeof useCopilot>
