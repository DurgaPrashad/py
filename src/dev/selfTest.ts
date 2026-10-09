/*
 * DEVELOPMENT ONLY. With `REFLEX_SELFTEST_FILE=/path/to/deck` set, the app
 * imports that file through the real native backend on startup, checks the
 * result, removes the test presentation again and reports to the terminal.
 */
import { useSettings } from '../features/settings/settingsStore'
import { importPresentation } from '../services/parser/importer'
import { createBlankPresentation } from '../services/parser/slides'
import { deletePresentation, listPresentations, loadPresentation, readFileBytes, savePresentation, withWords } from '../services/storage/projects'
import { errorMessage, fileUrl, invoke } from '../services/tauri'

const log = (message: string, level = 'info') => invoke('frontend_log', { level, message: `[selftest] ${message}` })

export async function runSelfTest() {
  // Only the presenter window drives tests (the slides window loads this app too).
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  if (getCurrentWindow().label !== 'main') return
  const files = await invoke<string | null>('dev_selftest_file')
  for (const file of files?.split('|').filter(Boolean) ?? []) {
    if (file === 'windows') await testWindows()
    else if (file.startsWith('capture:')) await testCapture(file.slice('capture:'.length))
    else if (file.startsWith('present:')) await testPresent(file.slice('present:'.length))
    else if (file.startsWith('present-share:')) await testPresent(file.slice('present-share:'.length), true)
    else await testFile(file)
  }
}

interface CaptureStats {
  width: number
  height: number
  nonBlack: number
  white: number
  distinctColors: number
}

/**
 * Can macOS window capture (what Zoom / Meet / Teams use) see our windows?
 * Imports a deck, opens the slides window for sharing, and captures it.
 */
async function testCapture(deck: string) {
  const { emitTo, listen } = await import('@tauri-apps/api/event')
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const describe = (s: CaptureStats) =>
    `${s.width}x${s.height} non-black ${Math.round(s.nonBlack * 100)}% white ${Math.round(s.white * 100)}% colors ${s.distinctColors}`
  try {
    const p = await importPresentation(deck, () => {})
    const ready = new Promise<void>((resolve) => void listen('present://audience-ready', () => resolve()))
    await invoke('open_audience_window', { projectId: p.id, monitorIndex: null, share: true })
    await ready
    await emitTo('audience', 'present://slide', { index: 1 })
    await sleep(1500)
    const slides = await invoke<CaptureStats>('dev_capture_window', { label: 'audience' })
    await log(`slides window capture: ${describe(slides)}`)
    window.location.hash = `#/edit/${p.id}`
    await sleep(800)
    const main = await invoke<CaptureStats>('dev_capture_window', { label: 'main' })
    await log(`presenter window capture: ${describe(main)}`)
    await invoke('set_main_fullscreen', { fullscreen: true })
    await sleep(1500)
    const full = await invoke<CaptureStats>('dev_capture_window', { label: 'main' })
    await log(`presenter window (fullscreen) capture: ${describe(full)}`)
    await invoke('set_main_fullscreen', { fullscreen: false })
    await invoke('close_audience_window')
    window.location.hash = '#/'
    await sleep(300)
    await deletePresentation(p.id)
    const ok = slides.white > 0.2 && slides.distinctColors > 3 && main.distinctColors > 3 && full.distinctColors > 3
    await log(ok ? 'SELFTEST PASS: windows are capturable with slide content' : 'SELFTEST FAIL: a captured window looked blank', ok ? 'info' : 'error')
  } catch (e) {
    await log(`SELFTEST FAIL: ${errorMessage(e)}`, 'error')
  }
}

/** Slides window for screen sharing + simple fullscreen. */
async function testWindows() {
  const { listen } = await import('@tauri-apps/api/event')
  const waitFor = (event: string, ms = 15_000) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms)
      void listen(event, () => {
        clearTimeout(t)
        resolve()
      })
    })
  try {
    const p = await createBlankPresentation('Window self-test')
    const ready = waitFor('present://audience-ready')
    const external = await invoke<boolean>('open_audience_window', { projectId: p.id, monitorIndex: null, share: true })
    await ready
    await log(`slides window opened (fullscreen on other display: ${external}) and its page is listening`)
    await invoke('set_main_fullscreen', { fullscreen: true })
    await new Promise((r) => setTimeout(r, 1200))
    await invoke('set_main_fullscreen', { fullscreen: false })
    await log('presenter simple fullscreen on/off ok')
    const closed = waitFor('present://audience-closed')
    await invoke('close_audience_window')
    await closed
    await deletePresentation(p.id)
    await log('SELFTEST PASS: slides window open/handshake/close')
  } catch (e) {
    await log(`SELFTEST FAIL: ${errorMessage(e)}`, 'error')
  }
}

/**
 * Presentation mode end to end: speech engine (fed by REFLEX_DEV_AUDIO_FILE)
 * -> Tauri events -> alignment -> teleprompter position.
 */
async function testPresent(scriptPath: string, share = false) {
  try {
    const script = new TextDecoder().decode(await readFileBytes(scriptPath)).trim()
    while (!useSettings.getState().loaded) await new Promise((r) => setTimeout(r, 50))
    // Present fullscreen (as users do) unless told otherwise; not persisted.
    const mode = (share ? 'share' : (await invoke<string | null>('dev_selftest_shots').catch(() => null)) ? 'fullscreen' : 'window') as 'fullscreen' | 'window' | 'share'
    useSettings.setState((st) => ({ settings: { ...st.settings, display: { ...st.settings.display, mode } } }))
    const blank = await createBlankPresentation('Self-test')
    const p = await savePresentation({ ...blank, slides: [withWords({ ...blank.slides[0], script })] })
    const words = p.slides[0].words
    const started = performance.now()
    let last = -1
    let atEnd = false
    let backwards = 0
    ;(window as { __reflexTrace?: (t: object) => void }).__reflexTrace = (t) => {
      const e = t as { word: number; end: boolean; heard: string }
      if (e.word < last) backwards++
      if (e.word !== last) void log(`${Math.round(performance.now() - started)} ms  word ${e.word} "${words[e.word]?.text}"  heard: ${JSON.stringify(e.heard.slice(-48))}`)
      last = e.word
      atEnd ||= e.end
    }
    window.location.hash = `#/present/${p.id}`
    if (share) {
      // Click "Start" on the video-call setup card.
      for (let i = 0; i < 40; i++) {
        const start = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start')
        if (start) {
          start.click()
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    const anchor = await invoke<{ centerX: number; top: number; notch: number }>('camera_anchor').catch(() => null)
    await log(`camera anchor: ${JSON.stringify(anchor)} window ${window.innerWidth}x${window.innerHeight}`)
    const shots = await invoke<string | null>('dev_selftest_shots').catch(() => null)
    let shot = 0
    const deadline = performance.now() + 60_000
    while (!atEnd && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250))
      // Save a few native captures of the presenter while it follows speech.
      if (shots && last >= [4, 14, 30][shot]) {
        await invoke('dev_capture_window', { label: 'main', savePath: `${shots}/present-${shot}.bmp` }).catch(() => {})
        if (share) await invoke('dev_capture_window', { label: 'audience', savePath: `${shots}/slides-${shot}.bmp` }).catch((e) => log(`slides capture failed: ${errorMessage(e)}`))
        shot++
      }
    }
    delete (window as { __reflexTrace?: unknown }).__reflexTrace
    window.location.hash = '#/'
    await new Promise((r) => setTimeout(r, 500))
    await deletePresentation(p.id)
    if (!atEnd) throw new Error(`teleprompter stopped at word ${last} of ${words.length}`)
    if (backwards) throw new Error(`teleprompter moved backwards ${backwards} times`)
    await log(`SELFTEST PASS: followed ${words.length} words to the end in ${Math.round(performance.now() - started)} ms`)
  } catch (e) {
    await log(`SELFTEST FAIL: ${errorMessage(e)}`, 'error')
  }
}

async function testFile(file: string) {
  const started = performance.now()
  try {
    await log(`importing ${file}`)
    const p = await importPresentation(file, (pr) => {
      if (pr.stage !== 'rendering' || pr.slide) void log(`${pr.stage} ${pr.current}/${pr.total} ${pr.message}`)
    })
    await log(`imported ${p.slides.length} slides as ${p.renderer} in ${Math.round(performance.now() - started)} ms`)
    for (const s of p.slides) {
      await log(
        `slide ${s.slideNumber}: [${s.extraction.method} ${Math.round(s.extraction.confidence * 100)}%] text=${JSON.stringify(s.extractedText.slice(0, 90))} script=${JSON.stringify(s.script.slice(0, 70))} words=${s.words.length}`,
      )
    }
    const loaded = await loadPresentation(p.id)
    if (loaded.slides.length !== p.slides.length) throw new Error('reloaded presentation differs')
    const listed = await listPresentations()
    if (!listed.some((x) => x.id === p.id)) throw new Error('presentation missing from list')
    for (const s of loaded.slides) {
      const img = new Image()
      img.src = fileUrl(s.thumbnail)
      await img.decode()
      if (!img.naturalWidth) throw new Error(`thumbnail ${s.slideNumber} did not load`)
    }
    await log(`thumbnails load through the asset protocol (${loaded.slides.length})`)
    await deletePresentation(p.id)
    await log(`SELFTEST PASS in ${Math.round(performance.now() - started)} ms`)
  } catch (e) {
    await log(`SELFTEST FAIL: ${errorMessage(e)}`, 'error')
  }
}
