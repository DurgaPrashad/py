import { useEffect, useState } from 'react'
import { isMissingModelError, speech, type EngineState } from '../../services/speech/speechService'
import { errorMessage } from '../../services/tauri'
import type { Settings } from '../../types'

export type SpeechStatus = EngineState | 'missing-model' | 'disabled'

/**
 * Runs the local speech engine while `active`. Restarts when the model or
 * microphone settings change, and stops on unmount.
 */
export function useSpeechEngine(active: boolean, cfg: Settings['speech']) {
  const [status, setStatus] = useState<SpeechStatus>(active ? 'loading' : 'disabled')
  const [message, setMessage] = useState('')
  const [device, setDevice] = useState('')
  const [attempt, setAttempt] = useState(0)

  const { modelId, deviceId, language, stepMs, windowMs, silenceMs, vadSensitivity, fastDecode, biasWithScript } = cfg

  useEffect(() => {
    if (!active) {
      setStatus('disabled')
      return
    }
    let live = true
    setStatus('loading')
    setMessage('Starting speech engine…')
    const unlisten = speech.onStatus((e) => {
      if (!live) return
      if (e.state === 'error') {
        setStatus('error')
        setMessage(e.message)
      } else if (e.state === 'listening' || e.state === 'loading') {
        setStatus(e.state)
        setMessage(e.message)
      }
    })
    speech
      .start({ modelId, deviceId, language, stepMs, windowMs, silenceMs, vadSensitivity, fastDecode, biasWithScript })
      .then((info) => {
        if (live) setDevice(info.device)
      })
      .catch((e) => {
        const msg = errorMessage(e)
        if (!live || msg === 'SUPERSEDED') return
        if (isMissingModelError(msg)) {
          setStatus('missing-model')
          setMessage('')
        } else {
          setStatus('error')
          setMessage(msg)
        }
      })
    return () => {
      live = false
      unlisten.then((f) => f())
      speech.stop().catch(() => {})
    }
  }, [active, attempt, modelId, deviceId, language, stepMs, windowMs, silenceMs, vadSensitivity, fastDecode, biasWithScript])

  return { status, message, device, retry: () => setAttempt((a) => a + 1) }
}
