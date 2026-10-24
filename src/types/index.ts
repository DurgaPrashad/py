/** One display word of a script plus its normalized comparison tokens. */
export interface ScriptWord {
  text: string
  tokens: string[]
}

export type SourceType = 'pdf' | 'pptx' | 'ppt' | 'blank'

export type ExtractionMethod = 'pdf-text' | 'pptx-xml' | 'ppt-binary' | 'ocr' | 'manual' | 'none'

export interface Extraction {
  method: ExtractionMethod
  /** 0..1, shown to the user as "Text extraction confidence". */
  confidence: number
  note?: string
}

export interface Slide {
  id: string
  slideNumber: number
  /** Absolute path of the full-size slide render, or null for text-only slides. */
  image: string | null
  thumbnail: string | null
  extractedText: string
  extraction: Extraction
  script: string
  words: ScriptWord[]
  notes: string
}

/** How slide images were produced. */
export type SlideRenderer = 'pdf' | 'office-pdf' | 'pptx-preview' | 'text'

export interface Presentation {
  version: 1
  id: string
  name: string
  /** Where the user imported the file from. */
  filePath: string
  /** Private copy inside the app data directory. */
  sourcePath: string | null
  sourceType: SourceType
  renderer: SlideRenderer
  /** Slide width / height. */
  aspectRatio: number
  createdAt: number
  updatedAt: number
  slides: Slide[]
  /** Facts the SI copilot may use when answering questions (traction, team, pricing…). */
  qaNotes?: string
  /** Material SI may draw on: typed text, or text extracted from uploaded files. */
  sources?: Source[]
}

export interface Source {
  id: string
  kind: 'text' | 'file'
  title: string
  /** Plain text the SI copilot reads. */
  content: string
  fileName?: string
  addedAt: number
}

export type VoiceCommand = 'next' | 'previous' | 'repeat' | 'pause' | 'resume'

export type ShortcutAction = 'next' | 'previous' | 'togglePause' | 'restart' | 'exit'

export type HighlightStyle = 'pill' | 'underline' | 'color' | 'bold'

/** Where SI copilot answers come from: the built-in AI, or the presenter's own API key. */
export type AiProvider = 'reflex' | 'anthropic' | 'openai' | 'gemini' | 'groq' | 'openrouter' | 'custom'
export type OwnKeyProvider = Exclude<AiProvider, 'reflex'>

export interface Settings {
  version: 5
  speech: {
    modelId: string
    deviceId: string | null
    language: string
    stepMs: number
    windowMs: number
    silenceMs: number
    vadSensitivity: number
    fastDecode: boolean
    biasWithScript: boolean
  }
  teleprompter: {
    wordsVisible: number
    fontSize: number
    /** Percent of the window width. */
    width: number
    /** Background opacity of the strip, 0..1. */
    opacity: number
    /** camera: compact strip right under the camera / notch, top-centre of the display. */
    position: 'camera' | 'top' | 'bottom'
    align: 'left' | 'center' | 'right'
    highlightStyle: HighlightStyle
    /** Highlight the word just spoken, or the next word to say. */
    highlightTarget: 'spoken' | 'next'
    /** Duration of the window movement animation ("text speed"). */
    transitionMs: number
    dimSpoken: boolean
    uppercase: boolean
    showTranscript: boolean
  }
  theme: 'dark' | 'light' | 'system'
  voiceCommands: {
    enabled: boolean
    phrases: Record<VoiceCommand, string[]>
  }
  autoAdvance: {
    enabled: boolean
    delayMs: number
  }
  display: {
    /** dual: slides on another display; share: slides-only window for screen sharing. */
    mode: 'window' | 'fullscreen' | 'dual' | 'share'
    audienceMonitor: number | null
    /** Small input level bars next to the mic status. */
    showLevelMeter: boolean
    /** Fade the bottom controls out while presenting until the mouse moves. */
    autoHideControls: boolean
  }
  shortcuts: Record<ShortcutAction, string>
  wordsPerMinute: number
  /** SI copilot. API keys are stored only on this device. */
  si: {
    provider: AiProvider
    keys: Record<OwnKeyProvider, string>
    models: Record<OwnKeyProvider, string>
    /** OpenAI-compatible endpoint for the custom provider (Ollama, LM Studio, DeepSeek, Together…). */
    baseUrl: string
    answerLength: 'short' | 'standard' | 'detailed'
    /** Extra guidance for every answer, e.g. "Always mention we're SOC 2 compliant". */
    instructions: string
    /** Answer questions heard on the call without a click. */
    autoAnswer: boolean
    /** Where the copilot sits while presenting: a box under the top text bar, or a side panel. */
    panel: 'top' | 'side'
    /** Answer text size (px). */
    textSize: number
    /** Width of the box under the top bar (% of the window). */
    width: number
    /** Opacity of the copilot's black background, 0..1. */
    opacity: number
    /** How the word you're reading is marked in an answer. */
    highlightStyle: HighlightStyle
    /** Move the highlight through an answer as you read it aloud. */
    followVoice: boolean
  }
}

export interface ModelInfo {
  id: string
  label: string
  file: string
  sizeMb: number
  englishOnly: boolean
  description: string
  installed: boolean
  custom: boolean
  path: string
}

export interface InputDevice {
  id: string
  name: string
  isDefault: boolean
}

export interface TranscriptWord {
  text: string
  startMs: number
  endMs: number
  probability: number
}

export interface TranscriptEvent {
  utteranceId: number
  seq: number
  text: string
  words: TranscriptWord[]
  isFinal: boolean
  windowStartMs: number
  windowEndMs: number
  inferenceMs: number
}

export interface MonitorInfo {
  index: number
  name: string
  width: number
  height: number
  x: number
  y: number
  scaleFactor: number
  isCurrent: boolean
}
