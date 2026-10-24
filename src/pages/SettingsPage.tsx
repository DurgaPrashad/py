import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, Loader2, Mic, PlugZap, RotateCcw, Sparkles, Square } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Kbd, Segmented, Select, Slider, Toggle } from '../components/controls'
import { TitleBar } from '../components/TitleBar'
import { PRODUCT } from '../config'
import { daysLeft, entitlements, useAccount } from '../features/account/account'
import { builtInAvailable } from '../features/copilot/api'
import { complete, PROVIDERS } from '../features/copilot/providers'
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
import { errorMessage } from '../services/tauri'
import type { InputDevice, ModelInfo, MonitorInfo, OwnKeyProvider, ShortcutAction, VoiceCommand } from '../types'

const SECTIONS = [
  ['si', 'SI copilot'],
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
  const { hash } = useLocation()
  const [active, setActive] = useState<string>(() => (SECTIONS.some(([id]) => `#${id}` === hash) ? hash.slice(1) : 'si'))

  useEffect(() => {
    document.title = `Settings · ${PRODUCT}`
  }, [])

  // Deep links such as /settings#si (from the SI copilot panel).
  useEffect(() => {
    const id = hash.slice(1)
    if (SECTIONS.some(([s]) => s === id)) document.getElementById(`section-${id}`)?.scrollIntoView({ block: 'start' })
  }, [hash])

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
        <nav className="flex w-[220px] shrink-0 flex-col border-r border-line px-3 py-5">
          <AccountCard />
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
            <SiSection />

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
              <Row label="Text speed" hint="How quickly the text moves to the next words. Fastest is the default — slide left to slow it down.">
                <Slider
                  value={720 - settings.teleprompter.transitionMs}
                  min={120}
                  max={660}
                  step={20}
                  onChange={(v) => update('teleprompter', { transitionMs: 720 - v })}
                  format={(v) => (v >= 640 ? 'Fastest' : v > 480 ? 'Snappy' : v > 300 ? 'Smooth' : 'Gentle')}
                />
              </Row>
              <Row label="Position" hint="Top bar (default) runs across the top of the screen, close to your webcam. Under camera is a compact strip right below the lens.">
                <Segmented
                  value={settings.teleprompter.position}
                  onChange={(position) => update('teleprompter', { position })}
                  options={[
                    { value: 'top', label: 'Top bar' },
                    { value: 'camera', label: 'Under camera' },
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
              : 'The slides fill the screen in their own window and the teleprompter floats under your camera. In Meet, Zoom or Teams share the “Present — Slides” window.'
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

// ------------------------------------------------------------------ SI copilot

const PROVIDER_ORDER: OwnKeyProvider[] = ['anthropic', 'openai', 'gemini', 'groq', 'openrouter', 'custom']

function SiSection() {
  const si = useSettings((s) => s.settings.si)
  const update = useSettings((s) => s.update)
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const [builtIn, setBuiltIn] = useState<boolean | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; message?: string }>({ state: 'idle' })
  const own = si.provider === 'reflex' ? null : si.provider

  useEffect(() => {
    if (!session) return
    builtInAvailable()
      .then(setBuiltIn)
      .catch(() => setBuiltIn(false))
  }, [session])
  useEffect(() => setTest({ state: 'idle' }), [si.provider])

  const setKey = (v: string) => own && update('si', { keys: { ...si.keys, [own]: v } })
  const setModel = (v: string) => own && update('si', { models: { ...si.models, [own]: v } })

  const runTest = async () => {
    setTest({ state: 'running' })
    const started = performance.now()
    try {
      const text = await complete(si, {
        system: 'You are a connection test. Reply with a short greeting of at most five words.',
        material: 'Connection test from Present.',
        prompt: 'Say hello.',
        maxTokens: 1000,
      })
      setTest({ state: 'ok', message: `Connected in ${((performance.now() - started) / 1000).toFixed(1)} s — “${text.slice(0, 60)}”` })
    } catch (e) {
      setTest({ state: 'error', message: errorMessage(e) })
    }
  }

  const planLine = !session ? (
    <>
      <Link to="/login" className="font-medium text-accent hover:underline">
        Sign in
      </Link>{' '}
      to use SI.
    </>
  ) : ent.si ? (
    <>SI plan active — {daysLeft(profile?.si_until ?? null)} days left.</>
  ) : (
    <>
      {ent.freeAnswersLeft > 0 ? `${ent.freeAnswersLeft} free SI answers left to try. ` : 'Your free SI answers are used up. '}
      <Link to="/account?plan=si_monthly" className="font-medium text-accent hover:underline">
        Get SI
      </Link>{' '}
      for unlimited use.
    </>
  )

  return (
    <Section
      id="si"
      title="SI copilot"
      description="Super Intelligence suggests answers to the questions people ask on your calls, from your deck and Q&A prep notes. Use the built-in AI, or connect any AI provider with your own API key."
    >
      <div className="flex items-center gap-2.5 py-3.5 text-[13px] text-muted">
        <Sparkles size={15} className="shrink-0 text-accent" />
        <span>{planLine}</span>
      </div>

      <div className="py-4">
        <div className="mb-2.5 text-[13.5px]">AI provider</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <ProviderCard
            active={si.provider === 'reflex'}
            title="Built-in AI"
            subtitle={builtIn === null ? 'Claude, no key needed' : builtIn ? 'Ready · no key needed' : 'Not switched on yet'}
            warn={builtIn === false}
            onClick={() => update('si', { provider: 'reflex' })}
          />
          {PROVIDER_ORDER.map((p) => (
            <ProviderCard
              key={p}
              active={si.provider === p}
              title={PROVIDERS[p].label}
              subtitle={si.keys[p] || PROVIDERS[p].keyOptional ? si.models[p] || 'Choose a model' : 'Add your API key'}
              ready={!!si.keys[p] || (!!PROVIDERS[p].keyOptional && !!si.models[p])}
              onClick={() => update('si', { provider: p })}
            />
          ))}
        </div>
      </div>

      {own ? (
        <>
          <Row label="API key" hint={`Stored only on this device. Requests go straight from here to ${PROVIDERS[own].label}; the key never reaches our servers.`}>
            <div className="flex w-full items-center gap-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                value={si.keys[own]}
                onChange={(e) => setKey(e.target.value.trim())}
                placeholder={PROVIDERS[own].keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-app px-2.5 font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-subtle focus:border-accent"
              />
              <button
                type="button"
                title={showKey ? 'Hide key' : 'Show key'}
                onClick={() => setShowKey((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Row>
          {own === 'custom' && (
            <Row label="API base URL" hint="The part before /chat/completions — e.g. http://localhost:11434/v1 (Ollama) or https://api.deepseek.com/v1.">
              <input
                value={si.baseUrl}
                onChange={(e) => update('si', { baseUrl: e.target.value.trim() })}
                placeholder="https://…/v1"
                spellCheck={false}
                className="h-8 w-full rounded-lg border border-line bg-app px-2.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
              />
            </Row>
          )}
          <Row label="Model" hint={PROVIDERS[own].note}>
            <input
              list={`models-${own}`}
              value={si.models[own]}
              onChange={(e) => setModel(e.target.value.trim())}
              spellCheck={false}
              className="h-8 w-full rounded-lg border border-line bg-app px-2.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
            />
            <datalist id={`models-${own}`}>
              {PROVIDERS[own].models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Row>
          <div className="flex items-center justify-between gap-6 py-3">
            <div className="min-w-0">
              <div className="text-[13.5px]">Test connection</div>
              <div
                className={`mt-0.5 text-[12px] leading-snug ${test.state === 'ok' ? 'text-success' : test.state === 'error' ? 'text-danger' : 'text-subtle'}`}
              >
                {test.message ?? 'Sends a tiny request with this key and model.'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {PROVIDERS[own].keyUrl && (
                <button
                  type="button"
                  onClick={() => void platform.openExternal(PROVIDERS[own].keyUrl!).catch(() => null)}
                  className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
                >
                  Get a key <ExternalLink size={12} />
                </button>
              )}
              <Button
                size="sm"
                icon={test.state === 'running' ? <Loader2 size={13} className="animate-spin" /> : test.state === 'ok' ? <Check size={13} /> : <PlugZap size={13} />}
                disabled={test.state === 'running' || (!si.keys[own] && !PROVIDERS[own].keyOptional)}
                onClick={runTest}
              >
                Test
              </Button>
            </div>
          </div>
        </>
      ) : (
        builtIn === false && (
          <div className="py-3.5 text-[12.5px] leading-relaxed text-warning">
            The built-in AI isn't switched on for this site yet — choose a provider above and add your own API key.
          </div>
        )
      )}

      <Row label="Answer length" hint="How much the copilot writes for each question.">
        <Segmented
          value={si.answerLength}
          onChange={(answerLength) => update('si', { answerLength })}
          options={[
            { value: 'short', label: 'Short' },
            { value: 'standard', label: 'Standard' },
            { value: 'detailed', label: 'Detailed' },
          ]}
        />
      </Row>
      <div className="py-4">
        <div className="text-[13.5px]">Custom instructions</div>
        <div className="mt-0.5 text-[12px] text-subtle">Applied to every answer and AI script draft — tone, facts to always mention, words to avoid.</div>
        <textarea
          value={si.instructions}
          onChange={(e) => update('si', { instructions: e.target.value })}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Sound confident but humble. Mention that we're SOC 2 compliant when security comes up. Use US dollars."
          className="mt-2.5 w-full resize-y rounded-lg border border-line bg-app px-3 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent"
        />
      </div>
      <Row label="Answer detected questions automatically" hint="Off: questions heard on the call are listed, and you click to get an answer.">
        <Toggle checked={si.autoAnswer} onChange={(autoAnswer) => update('si', { autoAnswer })} />
      </Row>

      <div className="pt-6 pb-2 text-[12px] font-semibold tracking-wide text-subtle uppercase">Look while presenting</div>
      <SiPreview />
      <Row label="Where it appears" hint="Under the top bar keeps answers next to your script. Press Q while presenting to show or hide it.">
        <Segmented
          value={si.panel}
          onChange={(panel) => update('si', { panel })}
          options={[
            { value: 'top', label: 'Under the top bar' },
            { value: 'side', label: 'Side panel' },
          ]}
        />
      </Row>
      <Row label="Text size">
        <Slider value={si.textSize} min={11} max={24} onChange={(textSize) => update('si', { textSize })} format={(v) => `${v}px`} />
      </Row>
      {si.panel === 'top' && (
        <Row label="Box width" hint="Width of the answer box under the top bar.">
          <Slider value={si.width} min={30} max={100} onChange={(width) => update('si', { width })} format={(v) => `${v}%`} />
        </Row>
      )}
      <Row label="Background opacity" hint="How dark the black background behind the answers is. Lower shows more of the slide through it.">
        <Slider value={si.opacity} min={0.2} max={1} step={0.02} onChange={(opacity) => update('si', { opacity })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
    </Section>
  )
}

function ProviderCard({
  active,
  title,
  subtitle,
  ready,
  warn,
  onClick,
}: {
  active: boolean
  title: string
  subtitle: string
  ready?: boolean
  warn?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface hover:bg-hover'
      }`}
    >
      <span className="flex w-full items-center gap-1.5 text-[13px] font-medium">
        <span className="truncate">{title}</span>
        {ready && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-success" title="Key added" />}
      </span>
      <span className={`mt-0.5 w-full truncate text-[11.5px] ${warn ? 'text-warning' : 'text-subtle'}`}>{subtitle}</span>
    </button>
  )
}

/** Who is signed in (name and email), their plan, and account actions. */
function AccountCard() {
  const navigate = useNavigate()
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const signOut = useAccount((s) => s.signOut)
  const ent = entitlements(profile)

  if (!session) {
    return (
      <div className="mb-5 rounded-xl border border-line bg-surface p-3">
        <div className="text-[12.5px] leading-snug text-muted">Not signed in. Sign in with the email you use on the website to bring your plan here.</div>
        <Button size="sm" variant="primary" className="mt-2.5 w-full" onClick={() => navigate('/login?next=/settings')}>
          Sign in
        </Button>
      </div>
    )
  }
  const email = profile?.email ?? session.user.email ?? ''
  const name = profile?.full_name?.trim() || email.split('@')[0]
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent uppercase">
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-fg" title={name}>
            {name}
          </div>
          <div className="truncate text-[11.5px] text-subtle" title={email}>
            {email}
          </div>
        </div>
      </div>
      <span
        className={`mt-2.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${
          ent.si ? 'bg-accent-soft text-accent' : ent.standard ? 'bg-hover text-fg' : ent.trial ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
        }`}
      >
        {ent.planName}
        {ent.trial && profile ? ` · ${daysLeft(profile.trial_until)} days left` : ''}
      </span>
      <div className="mt-2.5 flex items-center gap-3 border-t border-line pt-2.5 text-[12px]">
        <Link to="/account" className="text-muted hover:text-fg">
          Manage account
        </Link>
        <button
          type="button"
          className="ml-auto text-muted hover:text-fg"
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** A sample SI answer box with the current text size and background opacity. */
function SiPreview() {
  const si = useSettings((s) => s.settings.si)
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-line bg-[linear-gradient(135deg,#f6f5f1_0%,#e8e4dc_100%)] p-5">
      <div
        className="mx-auto rounded-2xl border border-white/10 px-3.5 py-2.5 text-white shadow-xl backdrop-blur"
        style={{ background: `rgb(8 8 10 / ${Math.round(si.opacity * 100)}%)`, width: si.panel === 'top' ? `${Math.max(40, si.width)}%` : '60%' }}
      >
        <div className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Sparkles size={12} className="text-accent" /> SI copilot
        </div>
        <div className="mt-1.5 text-white/55" style={{ fontSize: Math.max(10.5, si.textSize - 2) }}>
          How will you use the money you're raising?
        </div>
        <div className="mt-1 whitespace-pre-line" style={{ fontSize: si.textSize, lineHeight: 1.55 }}>
          {'We’re raising $1.5M for 18 months of runway.\n• 50% engineering\n• 30% go-to-market'}
        </div>
      </div>
    </div>
  )
}
