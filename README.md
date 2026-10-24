# Present

A local-first, AI-powered presentation teleprompter. Import a PDF or PowerPoint deck, write (or generate) the exact script for each slide, then present: Present listens to your microphone **on your machine**, follows what you say word by word, and shows an 8-word teleprompter strip that glides forward as you speak.

```
MICROPHONE → LOCAL SPEECH RECOGNITION → PARTIAL TRANSCRIPT → WORD ALIGNMENT → CURRENT WORD → 8-WORD WINDOW → LIVE HIGHLIGHT
```

Speech recognition is local — no cloud speech. It runs two ways from the same code:

- **Web app** — host the static build anywhere; Whisper runs *inside the browser* on WebGPU, and presentations live in the browser's storage.
- **Desktop app** (Tauri) — whisper.cpp with Metal, files on disk, second-display and floating-window presenting.

## Accounts, plans and the SI copilot

The hosted site (https://present.waspid.com) has accounts and paid plans; everything server-side runs inside Supabase Postgres, so the site itself stays static.

| Plan | Price | What it unlocks |
| --- | --- | --- |
| **Standard** (non-SI) | $4 / month · $24 / year | Presenting with the teleprompter, unlimited usage |
| **SI** (Super Intelligence) | $9 / month · $69 / year | Standard + the AI copilot (up to 300 answers a day); SI yearly also unlocks uploading files as sources |

There is no free plan or trial: after signing up, the app shows a plan picker and opens as soon as the payment goes through. Plans are prepaid (Razorpay Orders, USD) and never renew automatically.

- **Server functions** (`api/`, Vercel): `checkout` (Razorpay order; price from `private.plans`), `verify-payment` (HMAC signature → payment confirmed with Razorpay → captured if needed → `private.grant_plan`), `sync-payments` (applies paid orders whose confirmation was missed), `razorpay-webhook` (same, from Razorpay's side), and `copilot` (the built-in AI: checks the plan with `claim_copilot_use`, then streams Claude's answer). `npm run dev` serves them locally with `.env.local`.
- **Schema:** `supabase/migrations/` — profiles (one per account), payments, contact messages, `create_account`, `claim_copilot_use`, `grant_plan`. Apply with `psql -f` or the Supabase SQL editor.
- **Environment variables** — set them in Vercel → *Settings → Environment Variables* for **Production** (and in `.env.local` for local runs; see `.env.example`), then redeploy. Open `/api/health` to check: it shows, as yes/no, which settings are present and whether Razorpay and the database answer. Nothing secret is in the repo or the browser.

  | Variable | Needed for | Where to get it |
  | --- | --- | --- |
  | `RAZORPAY_KEY_ID` | Payments (or Supabase Vault secret `razorpay_key_id`) | Razorpay Dashboard → API Keys |
  | `RAZORPAY_KEY_SECRET` | Payments (or Supabase Vault secret `razorpay_key_secret`) | Razorpay Dashboard → API Keys |
  | `DATABASE_URL` | Payments | Supabase → Connect → *Transaction pooler* (port 6543). `POSTGRES_URL` from Vercel's Supabase integration works too |
  | `RAZORPAY_WEBHOOK_SECRET` | Webhook (recommended) | Razorpay → Webhooks → URL `https://present.waspid.com/api/razorpay-webhook`, events `payment.captured`, `order.paid` |
  | `ANTHROPIC_API_KEY` | Built-in AI (optional) | console.anthropic.com → API keys |
  | `AI_MODEL`, `AI_EFFORT` | Optional | default `claude-opus-5-5`, `low` |
- **Settings** (`private.settings`): AI model and effort, free SI answers, trial length, daily AI limit, sign-up rate limit. Prices: `private.plans` (keep `src/config.ts` in step).
- **Public client config:** `src/config.ts` (Supabase URL + publishable key; override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).
- **Sources:** the **+** button on a presentation (or *Sources* in the editor) adds material SI may use — typed text with SI, file uploads (PDF, .docx, text) with SI yearly (`profiles.si_yearly_until`). Files are read on the device; only their text is stored with the presentation.
- **SI with any AI:** *Settings → SI copilot* picks the built-in AI (server-side, site key) or the presenter's own API key for Anthropic Claude, OpenAI, Google Gemini, Groq, OpenRouter or any OpenAI-compatible endpoint (Ollama, LM Studio, DeepSeek…). Own keys stay on the device; answers stream straight from the provider (`src/features/copilot/providers.ts`), and `claim_copilot_use` still checks the SI plan / trial. Answer length and custom instructions apply to both.
- **Presenter view — exactly two floating panels** near the top: **1** the slim reading strip (current phrase, spoken word in orange) and **2** SI, stacked right under it (`Q` shows/hides). SI's header: listen (teal), SI (orange), Listening / Hearing a question / Processing / Answer ready, Ask, Answer `⌘↵`, history `⌘←/⌘→`, collapse, close; drag the grip to move it (double-click resets). Body: the question, then the streamed answer with figures emphasised and a highlight that follows your voice. Listening waits for the end of a question (1.3 s quiet). Code: `src/features/copilot/SiPanel.tsx`, `src/pages/PresentPage.tsx`.
- **Dashboard:** the Presentations page (web and Mac app) opens with the signed-in plan (days left, extend, buy), counts (presentations, slides, scripted slides, sources) and every feature marked included or locked. Everything is open without a plan except presenting (`/present/:id` is behind `RequirePlan`). Code: `src/features/account/PlanDashboard.tsx`.
- **Website pages:** `/`, `/pricing`, `/docs` (every feature, documented), `/download` (Mac app install guide), `/privacy`, `/terms`, `/refunds`, `/shipping`, `/cookies`, `/contact`, `/login`, `/signup`, `/account`. Settings shows the signed-in name, email and plan; the Mac app signs in with the same account. The web app is at `/app` and needs an account; presenting needs a paid plan.

## Web app

```bash
npm install          # also copies offline OCR / PDF / speech runtime assets into public/vendor
npm run dev          # http://localhost:1420
npm run build        # static site in dist/
```

**Hosting:** `dist/` is a static single-page site with real paths (`/pricing`, `/app`, `/present/…`), so the host must serve `index.html` for unknown paths.

- **Vercel** — import the repo; it detects Vite (build `npm run build`, output `dist`). `vercel.json` adds the rewrite. This is how present.waspid.com is hosted: pushing to `main` deploys it.
- **Netlify** — import the repo; `netlify.toml` is included (with the rewrite).
- **GitHub Pages** — in the repo settings set *Pages → Source* to *GitHub Actions*, then run the **Deploy to GitHub Pages** workflow (Actions tab). The site appears at `https://<user>.github.io/<repo>/` (built with `VITE_BASE`); Pages has no rewrites, so deep links only work when opened from the site.
- Hosts with a 25 MB per-file limit (e.g. Cloudflare Pages) won't serve the 27 MB speech runtime (`vendor/ort/*.wasm`).

**In the browser:** use Chrome or Edge (WebGPU and the floating teleprompter window). The first time you present, Present downloads the Whisper *Tiny English* model (~120 MB) from Hugging Face; the browser caches it and recognition then runs on the device (~0.2–0.3 s per update on a recent Mac). Slides, scripts and settings are kept in this browser (IndexedDB / localStorage) — nothing is uploaded. Legacy `.ppt` files need the desktop app (save as `.pptx` or PDF instead).

## Desktop app

Requirements: Node 20+, Rust (stable), CMake, and on macOS the Xcode Command Line Tools.

```bash
npm install
npm run app:dev      # launches the desktop app (Tauri) with hot reload
```

On first presentation the desktop app offers to download a Whisper model (Base English, 142 MB, recommended). You can also manage models, or import a `ggml-*.bin` you already have, under **Settings → Speech**. Models live in the app data folder:

- macOS: `~/Library/Application Support/com.reflexpresenter.app/models`

macOS asks for microphone access the first time you present. In development the permission belongs to your terminal app; in the bundled app it is requested with the message from `src-tauri/Info.plist`.

Release build:

```bash
npm run app:build    # → src-tauri/target/release/bundle/
npm run package:mac  # build + ad-hoc sign + zip into public/downloads (served by the website's Download button)
                     # (the desktop build strips website-only files: public/downloads, public/__dev__)
```

The website's front page (`/`) explains Present and offers this zip; the web app itself is at `/app`. The Mac app is ad-hoc signed but not notarized (that needs an Apple Developer ID), so a browser download shows “Apple could not verify…”. `public/install.sh` avoids it — curl downloads aren't quarantined:

```bash
curl -fsSL https://present.waspid.com/install.sh | sh
```

It installs to `/Applications` (or `~/Applications`) and opens the app. For a browser download: *System Settings → Privacy & Security → Open Anyway*, or `xattr -dr com.apple.quarantine /Applications/Present.app`.

## Using it

1. **Home** — create a blank presentation, import a PDF, or import PPTX/PPT (or drag a file onto the window). Search, rename, delete; each deck shows its slide count, last edit and estimated speaking time.
2. **Import** — every slide is rendered, its text extracted (with OCR fallback for text inside images), and a confidence score is shown. Scripts are pre-filled from speaker notes when the deck has them, otherwise from the slide text when extraction is trustworthy. Low-confidence OCR text is never silently turned into a script.
3. **Slide editor** — thumbnails on the left; preview, extracted text (editable), speaking script and private notes on the right. *Auto Extract Text*, *Run OCR*, *Use slide text as script*, *Clear Script*, add/delete slides. Autosaves; `⌘S` saves immediately.
4. **Present** — the teleprompter runs as a highlighted **top bar** across the top of the screen, close to your webcam; the slide fills the rest. Controls fade out until you move the mouse. Say your script naturally. (*Under camera* — a compact strip below the lens — and a bottom bar are in Settings → Teleprompter.)

### Presenting controls

| Key | Action |
| --- | --- |
| `→` / `Page Down` | Next slide |
| `←` / `Page Up` | Previous slide |
| `Space` | Pause / resume synchronization |
| `R` | Restart the current slide's script |
| `↑` / `↓` | Nudge the highlighted word (manual correction) |
| `T` | Show / hide the live transcript |
| `Esc` | Exit presentation mode |

Clicking a word in the strip also moves the cursor there. Shortcuts are rebindable in Settings; presentation clickers (Page Up/Down) always work.

**Voice commands** (configurable, on by default): *“Next slide”*, *“Previous slide”*, *“Repeat”*, *“Pause”*, *“Resume”*. A command only fires when it is the whole utterance — pause briefly, say it, pause again — so sentences that merely contain “next” never trigger it. A one-word command that is also the next word of your script is treated as script.

When a slide's script is finished the strip shows **End of slide**; slides never change on their own unless you enable *Automatically advance* (with a configurable delay).

**Presenter modes** (Settings → Presenting):

- **Window** / **Fullscreen** — everything in one window. On macOS, fullscreen stays in the current Space so screen-sharing apps can capture it.
- **Second display** — slides fill another screen (projector) while this screen keeps the teleprompter, current slide, next-slide preview and notes.
- **Screen share** — for Google Meet, Zoom or Teams. See below.

### Presenting to a video call (Meet, Zoom, Teams)

Choose **Screen share** mode, open the presentation and click **Start**. Your audience sees only the deck; the teleprompter stays with you:

- **Web app:** the teleprompter pops out into a small floating window (drag it right under your camera) and the browser tab shows only the deck. In Meet choose *Share screen → A tab* and pick the Present tab (Zoom / Teams: share that browser tab). The floating teleprompter is a separate window, so it is not part of the shared tab. Browsers without the floating-window feature (Safari, Firefox) get a slides-only pop-up window to share instead.
- **Desktop app:** the slides fill the screen in a window titled **“Present — Slides (share this window)”** and the presenter shrinks into a floating strip under the camera. In the meeting app choose *Share → Window* and pick the slides window. Zoom's *Advanced → Portion of Screen* framed on the slide also works.

The teleprompter is always an ordinary, visible window — Present doesn't hide anything from screen capture. If you share your *entire screen*, everything on it (including the teleprompter) is shared; share the tab or the slides window instead.

**Screen share shows a blank window?** Present's windows are capturable (a built-in diagnostic captures them through the same macOS window-capture path meeting apps use and finds the slide content). A blank share means macOS has not allowed the *meeting app* to record the screen: open *System Settings → Privacy & Security → Screen & System Audio Recording* (Settings → Presenting has a button that opens it, as does the sharing tip in presentation mode), switch on Zoom — or Chrome / your browser if you use Zoom on the web — then quit and reopen that app. macOS periodically asks for this permission again.

## Architecture

```
src/                         React + TypeScript + Tailwind (Vite)
  platform/                  desktop (Tauri) vs web: storage, files, windows, speech
    web/speech/              in-browser Whisper: AudioWorklet capture -> worker (WebGPU)
  pages/                     Home, Import, Editor, Present, Audience, Settings
  features/
    teleprompter/            the N-word strip (Teleprompter.tsx)
    speech/                  engine lifecycle hook, model manager, mic status
    presentation/            import / drag-and-drop flow
    slides/                  slide image, confidence badge
    settings/                defaults + persisted settings store
  services/
    alignment/               normalization, fuzzy matching, aligner, voice commands, SyncSession
    parser/                  pdf.js, PPTX (OOXML) parser + renderer, OCR, import orchestration
    speech/                  typed wrapper over the native engine
    storage/                 project persistence (via Rust)
  dev/                       development-only tooling (never in the production bundle)

src-tauri/src/               Rust
  speech/                    cpal capture → resampler → VAD → streaming whisper.cpp
  document_parser/           legacy .ppt text extraction, optional LibreOffice conversion
  storage.rs                 atomic JSON + asset storage in the app data dir
  window_manager.rs          fullscreen, monitors, audience window
```

### Speech engine (Rust, `src-tauri/src/speech`)

- **Capture**: `cpal`, any input device and sample format, downmixed and resampled (windowed-sinc low-pass + interpolation) to 16 kHz mono into a rolling buffer.
- **VAD**: energy-based with an adaptive noise floor. Silence is never sent to Whisper (that is where Whisper hallucinates), and pauses mark utterance boundaries (used by voice commands).
- **Streaming Whisper**: whisper.cpp via `whisper-rs` with Metal on Apple Silicon. While you speak, the most recent ~6 s of the utterance is re-transcribed every ~300 ms with the encoder context shrunk to the audio length; each pass emits a *partial* hypothesis with word timestamps, and a *final* one when you pause. Repetition loops are collapsed and decoding is capped to what the audio could contain.
- Measured on an Apple M5 with `base.en` (150 ms steps, 5 s window): **~85 ms per pass on average**, model load ~0.5–1 s after the first run (the very first run compiles Metal shaders, ~18 s once).

### Alignment (`src/services/alignment`)

Each hypothesis covers the last few seconds of speech, so the aligner matches its **tail** against the script with a local sequence alignment (Smith–Waterman style):

- **Normalization**: case, punctuation, diacritics, apostrophes, hyphenation; numbers, currency, percentages and ordinals spelled out (`150,000+` ≡ “one hundred fifty thousand”).
- **Fuzzy word similarity**: edit distance, truncated partial words, a phonetic key, and common recognizer equivalences. Short words must match exactly.
- **Fillers**: disfluencies (*um, uh, er, hmm*) are dropped; discourse fillers (*like, basically, actually, so, you know, I mean*) cost almost nothing to skip, so they never break sync.
- **Positional prior**: small forward steps are cheap; jumping ahead needs several distinctive words; moving **backwards** needs strong evidence confirmed by two consecutive hypotheses. Pauses add no words, so nothing moves; repeating a phrase re-matches where you already are, so nothing moves either.

`SyncSession` glues it together (slide changes, pause, commands) and is used by the UI and by the tests.

### Documents (`src/services/parser`, `src-tauri/src/document_parser`)

- **PDF**: pdf.js renders every page; text is rebuilt in reading order (lines → blocks → columns), repeated headers/footers and page numbers are removed, hyphenated line breaks re-joined. Garbled text layers or image-only slides are OCR'd.
- **PPTX**: parsed directly from OOXML (slide order, placeholder inheritance from layouts/masters, groups, tables, theme colours, speaker notes). If LibreOffice is installed it is used locally for pixel-exact slide images; otherwise a built-in renderer draws faithful previews (backgrounds, shapes, pictures, styled text, tables).
- **PPT** (legacy binary): a Rust parser for the MS-PPT record format extracts per-slide text and notes; slide images come from LibreOffice when available, otherwise clean text slides.
- **OCR**: Tesseract (WASM) with the English model bundled locally.

### Storage

Plain files in the app data folder: `projects/<id>/project.json` (presentation, slides, scripts, `words[]`), the copied source file, and slide images/thumbnails; `settings.json`; `models/`. Writes are atomic.

### Network use

Speech, slides and scripts never leave the device. The network is used for the one-time model download from Hugging Face, for sign-in and plan checks (Supabase), for payments (Razorpay Checkout), and — only when you use SI — to send a question and your deck text for an answer. Fonts, OCR data, PDF resources and recognition are all local.

## Testing

```bash
npm test             # alignment, normalization, commands, script drafting (Vitest)
npm run test:rust    # resampler, VAD, loop collapsing (+ .ppt parser with REFLEX_PPT_SAMPLE=/path/file.ppt)
npm run typecheck && npm run lint
```

The alignment tests replay **recorded whisper.cpp output** (`src/services/alignment/__fixtures__`) covering fillers, a repeated phrase, numbers, an ad-lib, a skipped sentence, re-reading a passage, and a voice command.

Development tools (all excluded from production builds):

- **Recognizer harness** — stream a 16 kHz WAV through the real engine in real time and print every hypothesis:
  `cd src-tauri && cargo run --release --example stream_file -- <model.bin> <speech.wav>`
  (`say -o s.aiff "…" && afconvert -f WAVE -d LEI16@16000 -c 1 s.aiff s.wav` makes test audio on macOS.)
- **Native self-tests** — `REFLEX_SELFTEST_FILE="/a/deck.pdf|/b/deck.pptx" npm run app:dev` imports files through the real backend and reports to the terminal; prefix an entry with `present:` (a script `.txt`) and set `REFLEX_DEV_AUDIO_FILE=/path/speech.wav` to run presentation mode end to end with a WAV file in place of the microphone.
- **Capture check** — `REFLEX_SELFTEST_FILE="capture:/path/deck.pdf"` opens the slides window and captures both windows with the macOS window-capture API, reporting how much real content each contains.
- **Browser test audio** — `npm run dev`, then open `http://localhost:1420/?devAudio=/path/to/speech.wav` (16 kHz WAV under `public/`) to feed a recording to the in-browser recognizer instead of the microphone.

## Known limitations

- Developed and verified on macOS (Apple Silicon). The stack is cross-platform (Windows/Linux builds use CPU recognition unless a GPU feature is enabled) but has not been tested there yet.
- Recognition updates every 150 ms; a word is typically highlighted 0.1–0.3 s after you finish saying it. *Settings → Teleprompter → Highlight: Next word* compensates by highlighting the word you are about to say.
- Without LibreOffice, PPTX previews are high-quality approximations (exotic shapes, charts, SmartArt and EMF/WMF images are simplified) and legacy `.ppt` slides are shown as text slides. Extracted text and notes are exact either way.
- Second-display mode has been implemented against the monitor APIs but not yet exercised with a physical second display in testing.
