import { useEffect, useState } from 'react'
import { speech } from '../../services/speech/speechService'
import type { SpeechStatus } from './useSpeechEngine'
import { LevelMeter } from './LevelMeter'

/**
 * Quiet "● Listening" / "○ Paused" indicator. The level meter is optional;
 * when shown it subscribes to level events itself so 20 Hz updates never
 * re-render the presenter.
 */
export function MicStatus({
  status,
  paused,
  device,
  showLevel = false,
}: {
  status: SpeechStatus
  paused: boolean
  device?: string
  showLevel?: boolean
}) {
  const [level, setLevel] = useState({ level: 0, speaking: false })
  useEffect(() => {
    if (!showLevel) return
    const unlisten = speech.onLevel(setLevel)
    return () => {
      unlisten.then((f) => f())
    }
  }, [showLevel])

  const listening = status === 'listening'
  const label =
    status === 'listening'
      ? paused
        ? 'Paused'
        : 'Listening'
      : status === 'loading'
        ? 'Starting…'
        : status === 'error'
          ? 'Microphone error'
          : status === 'missing-model'
            ? 'No speech model'
            : status === 'disabled'
              ? 'Voice sync off'
              : 'Stopped'
  return (
    <div className="flex items-center gap-2.5" title={device ? `Microphone: ${device}` : undefined}>
      <span className="relative flex h-2.5 w-2.5 items-center justify-center">
        {listening && !paused ? (
          <span className="h-2 w-2 rounded-full bg-success/80" />
        ) : (
          <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] ${status === 'error' ? 'border-danger' : 'border-subtle'}`} />
        )}
      </span>
      <span className={`text-[12px] ${status === 'error' ? 'text-danger' : 'text-subtle'}`}>{label}</span>
      {listening && showLevel && <LevelMeter level={level.level} active={!paused} />}
    </div>
  )
}
