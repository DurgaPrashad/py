/*
 * DEVELOPMENT ONLY. With `REFLEX_SELFTEST_FILE=/path/to/deck` set, the app
 * imports that file through the real native backend on startup, checks the
 * result, removes the test presentation again and reports to the terminal.
 */
import { useSettings } from '../features/settings/settingsStore'
import type { Settings } from '../types'
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
    else if (file.startsWith('present-vertical:')) await testPresent(file.slice('present-vertical:'.length), false, { direction: 'vertical', lines: 3 })
    else if (file.startsWith('present-lines:')) await testPresent(file.slice('present-lines:'.length), false, { direction: 'horizontal', lines: 3 })
    else if (file.startsWith('present-share-vertical:')) await testPresent(file.slice('present-share-vertical:'.length), true, { direction: 'vertical', lines: 3 })
    else if (file.startsWith('present-share-lines:')) await testPresent(file.slice('present-share-lines:'.length), true, { direction: 'horizontal', lines: 2 })
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
    // The floating strip can ask to be left out of captures; the slides stay in.
    const strip = async (hideFromCapture: boolean) => {
      await invoke('set_presenter_compact', { compact: true, width: 900, height: 118, hideFromCapture })
      await sleep(800)
      const asked = await invoke<boolean>('dev_window_hidden_from_capture', { label: 'main' })
      const seen = await invoke<CaptureStats>('dev_capture_window', { label: 'main' }).then(describe, errorMessage)
      await log(`strip, hide ${hideFromCapture}: asked macOS to skip it ${asked}, older capture path: ${seen}`)
      return asked
    }
    const stripHidden = await strip(true)
    const slidesBehind = await invoke<CaptureStats>('dev_capture_window', { label: 'audience' })
    await log(`slides window behind the hidden strip: ${describe(slidesBehind)}`)
    const stripShown = await strip(false)
    await strip(true)
    await invoke('set_presenter_compact', { compact: false, width: 0, height: 0, hideFromCapture: false })
    await sleep(300)
    const restored = await invoke<boolean>('dev_window_hidden_from_capture', { label: 'main' })
    await invoke('close_audience_window')
    window.location.hash = '#/'
    await sleep(300)
    await deletePresentation(p.id)
    const ok =
      slides.white > 0.2 && slides.distinctColors > 3 && main.distinctColors > 3 && full.distinctColors > 3 && stripHidden && !stripShown && !restored && slidesBehind.white > 0.2
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

/** The floating strip: SI opens and closes through its dropdown, and the recording switch reaches the window. */
async function testFloatingStrip(shots: string) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const size = () => `${window.innerWidth}x${window.innerHeight}`
  const hidden = () => invoke<boolean>('dev_window_hidden_from_capture', { label: 'main' })
  const setHidden = (hideFloatingFromCapture: boolean) =>
    useSettings.setState((st) => ({ settings: { ...st.settings, display: { ...st.settings.display, hideFloatingFromCapture } } }))
  const closed = size()
  ;[...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('SI'))?.click()
  await sleep(800)
  const open = size()
  await log(`with SI open: ${describeReading()}`)
  await invoke('dev_capture_window', { label: 'main', savePath: `${shots}/present-si.bmp` }).catch(() => {})
  document.querySelector<HTMLElement>('[aria-label^="Close SI"]')?.click()
  await sleep(800)
  await log(`SI dropdown: closed ${closed}, open ${open}, closed again ${size()}; ${describeReading()}`)
  const off = await hidden()
  setHidden(true)
  await sleep(500)
  const on = await hidden()
  setHidden(false)
  await sleep(500)
  await log(`recording switch: off ${off}, on ${on}, off again ${await hidden()}`)
}

/** What the reading text really shows, read back from the page. */
function describeReading(): string {
  const box = [...document.querySelectorAll('.select-none')].find((el) => el.querySelector('span'))
  if (!box) return 'no reading text'
  const words = [...box.querySelectorAll<HTMLElement>('span:not([aria-hidden])')]
  const current = words.find((w) => w.style.color.includes('accent'))
  const shown = words.filter((w) => Number(w.style.opacity) > 0)
  const tops = [...new Set(shown.map((w) => w.offsetTop))]
  const track = current?.parentElement
  return `current "${current?.textContent}" index ${current ? words.indexOf(current) : -1}, shown ${shown.length} words on ${tops.length} lines, first "${shown[0]?.textContent}", track ${track?.style.transform}`
}

/**
 * Presentation mode end to end: speech engine (fed by REFLEX_DEV_AUDIO_FILE)
 * -> Tauri events -> alignment -> teleprompter position.
 */
async function testPresent(scriptPath: string, share = false, reading?: Pick<Settings['teleprompter'], 'direction' | 'lines'>) {
  try {
    const script = new TextDecoder().decode(await readFileBytes(scriptPath)).trim()
    while (!useSettings.getState().loaded) await new Promise((r) => setTimeout(r, 50))
    // Present fullscreen (as users do) unless told otherwise; not persisted.
    const mode = (share ? 'share' : (await invoke<string | null>('dev_selftest_shots').catch(() => null)) ? 'fullscreen' : 'window') as 'fullscreen' | 'window' | 'share'
    useSettings.setState((st) => ({ settings: { ...st.settings, display: { ...st.settings.display, mode, hideFloatingFromCapture: false }, teleprompter: { ...st.settings.teleprompter, ...reading } } }))
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
      for (let i = 0; i < 80; i++) {
        // The speech setup card has a Start button too; wait for this one.
        const onCard = document.body.textContent?.includes('Present to a video call')
        const start = onCard ? [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start') : null
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
        await log(`on screen at word ${last}: ${describeReading()}`)
        await invoke('dev_capture_window', { label: 'main', savePath: `${shots}/present-${shot}.bmp` }).catch(() => {})
        if (share) await invoke('dev_capture_window', { label: 'audience', savePath: `${shots}/slides-${shot}.bmp` }).catch((e) => log(`slides capture failed: ${errorMessage(e)}`))
        shot++
      }
    }
    if (shots) {
      // Let the text settle, then compare what the page says with what was painted.
      // (A covered window stops animating; the floating strip is always on top.)
      let frames = 0
      const count = () => {
        frames++
        if (frames < 1000) requestAnimationFrame(count)
      }
      requestAnimationFrame(count)
      await new Promise((r) => setTimeout(r, 1500))
      await log(`settled at the end (${Math.round(frames / 1.5)} frames/s, window ${window.innerWidth}x${window.innerHeight}): ${describeReading()}`)
      await invoke('dev_capture_window', { label: 'main', savePath: `${shots}/present-end.bmp` }).catch(() => {})
      if (share) await testFloatingStrip(shots)
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
