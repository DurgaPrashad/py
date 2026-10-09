import { ArrowLeft, Mic, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Kbd, Segmented, Select, Slider, Toggle } from '../components/controls'
import { TitleBar } from '../components/TitleBar'
import { DEFAULT_SETTINGS } from '../features/settings/defaults'
import { useSettings } from '../features/settings/settingsStore'
import { MicStatus } from '../features/speech/MicStatus'
import { ModelList } from '../features/speech/ModelList'
import { useSpeechEngine } from '../features/speech/useSpeechEngine'
import { Teleprompter } from '../features/teleprompter/Teleprompter'
import { DEFAULT_COMMAND_PHRASES } from '../services/alignment/commands'
import { tokenizeScript } from '../services/alignment/normalize'
import { speech } from '../services/speech/speechService'
import { dataLocation } from '../services/storage/projects'
import { platform } from '../platform'
import type { InputDevice, ModelInfo, MonitorInfo, ShortcutAction, VoiceCommand } from '../types'

const SECTIONS = [
  ['speech', 'Speech'],
  ['teleprompter', 'Teleprompter'],
  ['presenting', 'Presenting'],
  ['voice', 'Voice commands'],
  ['keys', 'Keyboard shortcuts'],
  ['appearance', 'Appearance'],
] as const

const SAMPLE =
  'Today I want to show you how we are building the operating infrastructure for global Voice AI. We have validated the product with more than 150,000 directly verifiable AI calls.'

const LANGUAGES = [
  ['en', 'English'],
  ['auto', 'Detect automatically'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['zh', 'Chinese'],
] as const

const SHORTCUT_LABEL: Record<ShortcutAction, string> = {
  next: 'Next slide',
  previous: 'Previous slide',
  togglePause: 'Pause / resume sync',
  restart: 'Restart current slide',
  exit: 'Exit presentation mode',
}

const COMMAND_LABEL: Record<VoiceCommand, string> = {
  next: 'Next slide',
  previous: 'Previous slide',
  repeat: 'Restart slide script',
  pause: 'Pause synchronization',
  resume: 'Resume synchronization',
}

function keyLabel(code: string): string {
  const map: Record<string, string> = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Enter: 'Return' }
  return map[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '')
}

export function SettingsPage() {
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [active, setActive] = useState<string>('speech')

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        left={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)}>
              Back
            </Button>
            <span className="text-[13.5px] font-medium">Settings</span>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav className="w-[200px] shrink-0 border-r border-line px-3 py-5">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault()
                setActive(id)
                document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`mb-0.5 flex h-8 items-center rounded-lg px-3 text-[13px] ${active === id ? 'bg-hover font-medium text-fg' : 'text-muted hover:text-fg'}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-10 pt-8 pb-24">
            <SpeechSection />

            <Section id="teleprompter" title="Teleprompter" description="How the live 8-word strip looks while you present.">
              <TeleprompterPreview />
              <Row label="Words visible" hint="Exactly this many words are shown at a time.">
                <Slider value={settings.teleprompter.wordsVisible} min={4} max={14} onChange={(v) => update('teleprompter', { wordsVisible: v })} format={(v) => `${v} words`} />
              </Row>
              <Row label="Font size">
                <Slider value={settings.teleprompter.fontSize} min={22} max={84} onChange={(v) => update('teleprompter', { fontSize: v })} format={(v) => `${v}px`} />
              </Row>
              <Row label="Teleprompter width">
                <Slider value={settings.teleprompter.width} min={40} max={100} onChange={(v) => update('teleprompter', { width: v })} format={(v) => `${v}%`} />
              </Row>
              <Row label="Background opacity">
                <Slider value={settings.teleprompter.opacity} min={0.2} max={1} step={0.02} onChange={(v) => update('teleprompter', { opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </Row>
              <Row label="Text speed" hint="How quickly the strip glides to the next words.">
                <Slider
                  value={720 - settings.teleprompter.transitionMs}
                  min={120}
                  max={600}
                  step={20}
                  onChange={(v) => update('teleprompter', { transitionMs: 720 - v })}
                  format={(v) => (v > 480 ? 'Snappy' : v > 300 ? 'Smooth' : 'Gentle')}
                />
              </Row>
              <Row label="Position" hint="Under camera keeps the text right below your webcam, so you look into the lens while reading.">
                <Segmented
                  value={settings.teleprompter.position}
                  onChange={(position) => update('teleprompter', { position })}
                  options={[
                    { value: 'camera', label: 'Under camera' },
                    { value: 'top', label: 'Top bar' },
                    { value: 'bottom', label: 'Bottom bar' },
                  ]}
                />
              </Row>
              <Row label="Text alignment">
                <Segmented
                  value={settings.teleprompter.align}
                  onChange={(align) => update('teleprompter', { align })}
                  options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
                />
              </Row>
              <Row label="Highlight style">
                <Segmented
                  value={settings.teleprompter.highlightStyle}
                  onChange={(highlightStyle) => update('teleprompter', { highlightStyle })}
                  options={[
                    { value: 'pill', label: 'Pill' },
                    { value: 'underline', label: 'Underline' },
                    { value: 'color', label: 'Color' },
                    { value: 'bold', label: 'Bold' },
                  ]}
                />
              </Row>
              <Row label="Highlight" hint="The word you just said, or the next word to say (compensates for recognition delay).">
                <Segmented
                  value={settings.teleprompter.highlightTarget}
                  onChange={(highlightTarget) => update('teleprompter', { highlightTarget })}
                  options={[{ value: 'spoken', label: 'Current word' }, { value: 'next', label: 'Next word' }]}
                />
              </Row>
              <Row label="Dim words already spoken">
                <Toggle checked={settings.teleprompter.dimSpoken} onChange={(dimSpoken) => update('teleprompter', { dimSpoken })} />
              </Row>
              <Row label="Uppercase">
                <Toggle checked={settings.teleprompter.uppercase} onChange={(uppercase) => update('teleprompter', { uppercase })} />
              </Row>
              <Row label="Show live transcript" hint="Display what the speech engine hears under the strip. Toggle with T while presenting.">
                <Toggle checked={settings.teleprompter.showTranscript} onChange={(showTranscript) => update('teleprompter', { showTranscript })} />
              </Row>
            </Section>

            <PresentingSection />

            <Section id="voice" title="Voice commands" description="Say a command on its own, with a short pause before and after. Commands inside normal sentences are ignored.">
              <Row label="Enable voice commands">
                <Toggle checked={settings.voiceCommands.enabled} onChange={(enabled) => update('voiceCommands', { enabled })} />
              </Row>
              {(Object.keys(COMMAND_LABEL) as VoiceCommand[]).map((cmd) => (
                <Row key={cmd} label={COMMAND_LABEL[cmd]} hint="Comma-separated phrases">
                  <PhraseInput
                    value={settings.voiceCommands.phrases[cmd]}
                    disabled={!settings.voiceCommands.enabled}
                    onChange={(list) => update('voiceCommands', { phrases: { ...settings.voiceCommands.phrases, [cmd]: list } })}
                  />
                </Row>
              ))}
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => update('voiceCommands', { phrases: DEFAULT_COMMAND_PHRASES })}>
                  Restore default phrases
                </Button>
              </div>
            </Section>

            <Section id="keys" title="Keyboard shortcuts" description="Click a shortcut, then press the key you want. Presentation clickers (Page Up / Page Down) always work.">
              {(Object.keys(SHORTCUT_LABEL) as ShortcutAction[]).map((action) => (
                <Row key={action} label={SHORTCUT_LABEL[action]}>
                  <KeyCapture value={settings.shortcuts[action]} onChange={(code) => update('shortcuts', { [action]: code })} />
                </Row>
              ))}
              <Row label="Nudge the highlighted word">
                <span className="flex gap-1">
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd>
                </span>
              </Row>
              <Row label="Toggle live transcript">
                <Kbd>T</Kbd>
              </Row>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => update('shortcuts', DEFAULT_SETTINGS.shortcuts)}>
                  Restore defaults
                </Button>
              </div>
            </Section>

            <Section id="appearance" title="Appearance">
              <Row label="Theme">
                <Segmented
                  value={settings.theme}
                  onChange={(theme) => update('theme', theme)}
                  options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]}
                />
              </Row>
              <StorageRow />
            </Section>
          </div>
        </main>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ sections

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={`section-${id}`} className="scroll-mt-6 pt-8 first:pt-0">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-4 divide-y divide-line border-y border-line">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-8 py-2.5">
      <div className="min-w-0">
        <div className="text-[13.5px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-subtle">{hint}</div>}
      </div>
      <div className="flex w-[300px] shrink-0 justify-end">{children}</div>
    </div>
  )
}

function SpeechSection() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const sp = settings.speech
  const [devices, setDevices] = useState<InputDevice[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [testing, setTesting] = useState(false)
  const [heard, setHeard] = useState('')
  const engine = useSpeechEngine(testing, sp)

  useEffect(() => {
    speech.listDevices().then(setDevices).catch(() => setDevices([]))
    speech.listModels().then(setModels).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    if (!testing) return
    setHeard('')
    const unlisten = speech.onTranscript((e) => setHeard(e.text))
    return () => {
      unlisten.then((f) => f())
    }
  }, [testing])

  const model = models.find((m) => m.id === sp.modelId)
  const multilingual = model ? !model.englishOnly : false

  return (
    <Section
      id="speech"
      title="Speech recognition"
      description={
        platform.kind === 'web'
          ? 'Whisper runs inside this browser (WebGPU). Audio never leaves this device.'
          : 'Runs locally with whisper.cpp. Audio never leaves this computer.'
      }
    >
      <div className="py-4">
        <div className="mb-2.5 text-[13.5px]">Speech model</div>
        <ModelList selected={sp.modelId} onSelect={(modelId) => update('speech', { modelId })} />
      </div>
      <Row label="Microphone">
        <Select
          className="w-full"
          value={sp.deviceId ?? ''}
          onChange={(v) => update('speech', { deviceId: v || null })}
          options={[{ value: '', label: 'Default microphone' }, ...devices.map((d) => ({ value: d.id, label: d.name + (d.isDefault ? ' (default)' : '') }))]}
        />
      </Row>
      <div className="py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[13.5px]">Test microphone</div>
            <div className="mt-0.5 text-[12px] text-subtle">Speak and check that your words appear below.</div>
          </div>
          <div className="flex items-center gap-3">
            {testing && <MicStatus status={engine.status} paused={false} device={engine.device} showLevel />}
            <Button size="sm" icon={testing ? <Square size={12} /> : <Mic size={13} />} onClick={() => setTesting((t) => !t)}>
              {testing ? 'Stop' : 'Start test'}
            </Button>
          </div>
        </div>
        {testing && (
          <div className="selectable mt-3 min-h-[44px] rounded-lg border border-line bg-app px-3 py-2.5 text-[13.5px]">
            {engine.status === 'error' ? (
              <span className="text-danger">{engine.message}</span>
            ) : engine.status === 'missing-model' ? (
              <span className="text-warning">Download a speech model above first.</span>
            ) : (
              heard || <span className="text-subtle">{engine.status === 'loading' ? 'Starting…' : 'Listening…'}</span>
            )}
          </div>
        )}
      </div>
      {multilingual && (
        <Row label="Language">
          <Select className="w-full" value={sp.language} onChange={(language) => update('speech', { language })} options={LANGUAGES.map(([value, label]) => ({ value, label }))} />
        </Row>
      )}
      <Row label="Responsiveness" hint="How often recognition updates. Faster uses more CPU.">
        <Slider value={sp.stepMs} min={200} max={800} step={50} onChange={(stepMs) => update('speech', { stepMs })} format={(v) => `${v} ms`} />
      </Row>
      <Row label="Listening window" hint="Seconds of recent speech re-read on each update.">
        <Slider value={sp.windowMs} min={3000} max={10000} step={500} onChange={(windowMs) => update('speech', { windowMs })} format={(v) => `${(v / 1000).toFixed(1)} s`} />
      </Row>
      <Row label="Pause length" hint="Silence that ends a phrase. Voice commands are detected after it.">
        <Slider value={sp.silenceMs} min={300} max={1500} step={50} onChange={(silenceMs) => update('speech', { silenceMs })} format={(v) => `${v} ms`} />
      </Row>
      <Row label="Voice detection sensitivity" hint="Raise for quiet voices, lower for noisy rooms.">
        <Slider value={sp.vadSensitivity} min={0} max={1} step={0.05} onChange={(vadSensitivity) => update('speech', { vadSensitivity })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      {platform.kind === 'desktop' && (
        <>
          <Row label="Fast decoding" hint="Limits the model's audio context to the listening window. Much lower latency.">
            <Toggle checked={sp.fastDecode} onChange={(fastDecode) => update('speech', { fastDecode })} />
          </Row>
          <Row label="Bias toward script vocabulary" hint="Experimental. Gives the recognizer the script you have already spoken as context.">
            <Toggle checked={sp.biasWithScript} onChange={(biasWithScript) => update('speech', { biasWithScript })} />
          </Row>
        </>
      )}
    </Section>
  )
}

function PresentingSection() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  useEffect(() => {
    platform.windows.listMonitors().then(setMonitors).catch(() => setMonitors([]))
  }, [])
  const others = monitors.filter((m) => !m.isCurrent)

  return (
    <Section id="presenting" title="Presenting">
      <Row
        label="Presenter mode"
        hint={
          settings.display.mode === 'share'
            ? platform.kind === 'web'
              ? 'The teleprompter floats in its own small window and this tab shows only the deck. In Meet, Zoom or Teams share “This tab” — the audience sees just the slides.'
              : 'The slides fill the screen in their own window and the teleprompter floats under your camera. In Meet, Zoom or Teams share the “Reflex — Slides” window.'
            : 'Second display puts the slides on another screen. Screen share is for video calls: share only the slides, keep the teleprompter with you.'
        }
      >
        <Segmented
          value={settings.display.mode}
          onChange={(mode) => update('display', { mode })}
          options={[
            { value: 'window', label: 'Window' },
            { value: 'fullscreen', label: 'Fullscreen' },
            { value: 'dual', label: 'Second display' },
            { value: 'share', label: 'Screen share' },
          ]}
        />
      </Row>
      {platform.windows.openScreenRecordingSettings && (
        <Row
          label="Screen share shows a blank window?"
          hint="macOS gives meeting apps a blank picture until they are allowed under Screen Recording. Allow Zoom (or Chrome / your browser for Zoom on the web), then quit and reopen it."
        >
          <Button size="sm" onClick={() => platform.windows.openScreenRecordingSettings?.().catch(() => {})}>
            Open Screen Recording settings
          </Button>
        </Row>
      )}
      {settings.display.mode === 'dual' && (
        <Row label="Audience display" hint={others.length ? undefined : 'Only one display is connected right now.'}>
          <Select
            className="w-full"
            value={settings.display.audienceMonitor === null ? '' : String(settings.display.audienceMonitor)}
            onChange={(v) => update('display', { audienceMonitor: v === '' ? null : Number(v) })}
            options={[
              { value: '', label: 'Automatic (first other display)' },
              ...monitors.map((m) => ({
                value: String(m.index),
                label: `${m.name} — ${Math.round(m.width / m.scaleFactor)}×${Math.round(m.height / m.scaleFactor)}${m.isCurrent ? ' (this display)' : ''}`,
              })),
            ]}
          />
        </Row>
      )}
      <Row label="Automatically advance when the script finishes" hint="Off by default: say “Next” or press → instead.">
        <Toggle checked={settings.autoAdvance.enabled} onChange={(enabled) => update('autoAdvance', { enabled })} />
      </Row>
      {settings.autoAdvance.enabled && (
        <Row label="Delay before advancing">
          <Slider value={settings.autoAdvance.delayMs} min={500} max={6000} step={250} onChange={(delayMs) => update('autoAdvance', { delayMs })} format={(v) => `${(v / 1000).toFixed(1)} s`} />
        </Row>
      )}
      <Row label="Hide controls while presenting" hint="The bottom bar fades out and returns when you move the mouse.">
        <Toggle checked={settings.display.autoHideControls} onChange={(autoHideControls) => update('display', { autoHideControls })} />
      </Row>
      <Row label="Show microphone level meter">
        <Toggle checked={settings.display.showLevelMeter} onChange={(showLevelMeter) => update('display', { showLevelMeter })} />
      </Row>
      <Row label="Speaking pace" hint="Used for duration estimates.">
        <Slider value={settings.wordsPerMinute} min={90} max={200} step={5} onChange={(v) => update('wordsPerMinute', v)} format={(v) => `${v} wpm`} />
      </Row>
    </Section>
  )
}

function TeleprompterPreview() {
  const tp = useSettings((s) => s.settings.teleprompter)
  const words = useMemo(() => tokenizeScript(SAMPLE), [])
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % words.length), 420)
    return () => clearInterval(t)
  }, [words.length])
  return (
    <div className="py-4">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-line">
        <div style={{ background: `color-mix(in srgb, var(--app-bg) ${Math.round(tp.opacity * 100)}%, #1d1d22)` }}>
          <div className="mx-auto" style={{ width: `${tp.width}%` }}>
            <Teleprompter words={words} current={i} config={tp} />
          </div>
        </div>
        <div className="flex h-24 items-center justify-center text-[12px] text-subtle">Slide</div>
      </div>
    </div>
  )
}

function PhraseInput({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <input
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const list = text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        if (list.length) onChange(list)
        else setText(value.join(', '))
      }}
      className="h-8 w-full rounded-lg border border-line bg-app px-2.5 text-[13px] outline-none focus:border-accent disabled:opacity-40"
    />
  )
}

function KeyCapture({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape' || value === 'Escape') onChange(e.code)
      setListening(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, onChange, value])
  return (
    <button
      type="button"
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      className={`flex h-8 min-w-[96px] items-center justify-center rounded-lg border px-3 text-[13px] font-medium ${
        listening ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-app hover:border-line-strong'
      }`}
    >
      {listening ? 'Press a key…' : keyLabel(value)}
    </button>
  )
}

function StorageRow() {
  const [dir, setDir] = useState('')
  useEffect(() => {
    dataLocation()
      .then(setDir)
      .catch(() => {})
  }, [])
  return (
    <Row label="Data location" hint="Presentations, scripts, settings and speech models are stored here only.">
      <span className="selectable truncate text-right text-[12px] text-subtle" title={dir}>
        {dir}
      </span>
    </Row>
  )
}
