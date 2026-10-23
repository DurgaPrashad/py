import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AI_DAILY_LIMIT, FREE_AI_ANSWERS, PLANS, PRODUCT, TRIAL_DAYS } from '../../config'
import { PageHeader, SiteShell } from './SiteShell'

const TOC: [string, string][] = [
  ['getting-started', 'Getting started'],
  ['import', 'Import a deck'],
  ['scripts', 'Write your script'],
  ['teleprompter', 'The teleprompter'],
  ['presenting', 'Presenting & shortcuts'],
  ['voice-commands', 'Voice commands'],
  ['calls', 'Present on a call'],
  ['second-display', 'Second display'],
  ['si-copilot', 'SI copilot'],
  ['ai-providers', 'AI providers & API keys'],
  ['plans', 'Plans & billing'],
  ['mac-app', 'Mac app'],
  ['privacy', 'Privacy & your data'],
  ['troubleshooting', 'Troubleshooting'],
]

/** Product documentation: every feature, in order of a typical first session. */
export function DocsPage() {
  return (
    <SiteShell title="Docs">
      <PageHeader eyebrow="Docs" title={`How to use ${PRODUCT}`}>
        Everything the app can do — from importing a deck to getting live answers on a call.
      </PageHeader>
      <div className="mx-auto flex max-w-6xl gap-12 px-4 py-12 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-0.5 text-[13.5px]">
            <p className="mb-3 text-[11.5px] font-semibold tracking-[0.14em] text-slate-400 uppercase">On this page</p>
            {TOC.map(([id, label]) => (
              <Link key={id} to={`/docs#${id}`} className="block rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 flex-1 text-[15px] leading-[1.75] text-slate-700 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-slate-800 [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_strong]:text-slate-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
            {TOC.map(([id, label]) => (
              <Link key={id} to={`/docs#${id}`} className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-slate-600">
                {label}
              </Link>
            ))}
          </div>

          <Doc id="getting-started" title="Getting started">
            <ol>
              <li>
                <Link to="/signup" className="link">Create an account</Link> with your email and a password. You get a {TRIAL_DAYS}-day free trial and{' '}
                {FREE_AI_ANSWERS} SI copilot answers — no card needed.
              </li>
              <li>
                Open the <Link to="/app" className="link">web app</Link> in <strong>Chrome or Edge</strong> on a computer (or install the{' '}
                <Link to="/download" className="link">Mac app</Link> and sign in with the same email).
              </li>
              <li>Import a PDF or PowerPoint deck, or start a blank presentation.</li>
              <li>Write or paste what you want to say for each slide.</li>
              <li>
                Click <strong>Present</strong>. The first time, the browser asks for the microphone and downloads the speech model once (~120 MB), then
                the teleprompter follows your voice.
              </li>
            </ol>
          </Doc>

          <Doc id="import" title="Import a deck">
            <p>
              On the Presentations page choose <strong>Import PDF</strong> or <strong>Import PowerPoint</strong>, or drag a file onto the window. Supported:
              PDF, PPTX and (in the Mac app) legacy PPT.
            </p>
            <ul>
              <li>Every slide is rendered, and its text is extracted in reading order — with OCR for text inside images.</li>
              <li>Each slide shows an <strong>extraction confidence</strong>. Low-confidence OCR text is never silently used as a script.</li>
              <li>Speaker notes become the starting script automatically.</li>
              <li>Decks are stored on your device (in the browser, or on disk in the Mac app) — they are not uploaded.</li>
            </ul>
          </Doc>

          <Doc id="scripts" title="Write your script">
            <p>The editor shows slide thumbnails on the left, and for the selected slide: the preview, the extracted text, the speaking script and notes.</p>
            <ul>
              <li>
                <strong>Paste or type</strong> exactly what you want to say in <em>Speaking script</em> — this is what the teleprompter follows.
              </li>
              <li>
                <strong>Use slide text as script</strong> turns the slide's text into a starting script; <strong>Draft with AI</strong> (SI) writes a natural
                spoken script for the slide from its text and notes.
              </li>
              <li>
                <strong>Auto Extract Text</strong> and <strong>Run OCR</strong> re-read a slide; you can correct the extracted text by hand.
              </li>
              <li>
                <strong>Q&A prep notes</strong> (one box for the whole deck) hold facts the SI copilot may use in answers: traction, revenue, pricing, team,
                competitors, your raise, common objections.
              </li>
              <li>
                Changes save automatically; <code>⌘S</code> saves immediately. <code>⌥↑</code> / <code>⌥↓</code> move between slides.
              </li>
            </ul>
          </Doc>

          <Doc id="teleprompter" title="The teleprompter">
            <p>
              While you present, Reflex listens on your device and highlights each word as you say it, moving the text along at your pace. Pauses, fillers
              (“um”, “like”), repeats and skipped words don't throw it off.
            </p>
            <p>
              <strong>Layout:</strong> the <strong>Top bar</strong> is the default — a highlighted strip across the top of the screen, close to your
              webcam. You can switch to <strong>Under camera</strong> (a compact strip right below the lens) or a <strong>Bottom bar</strong> in{' '}
              <em>Settings → Teleprompter</em>.
            </p>
            <p>
              Also in Settings: words visible (4–14), font size, width, background opacity, text speed, alignment, highlight style (pill, underline,
              colour, bold), highlighting the word just spoken or the next word, dimming spoken words, uppercase, and a live transcript line.
            </p>
          </Doc>

          <Doc id="presenting" title="Presenting & shortcuts">
            <table className="mt-4 w-full text-[14px]">
              <tbody className="[&_td]:border-t [&_td]:border-slate-200 [&_td]:py-2 [&_td:first-child]:w-44 [&_td:first-child]:font-medium [&_td:first-child]:text-slate-900">
                <tr><td>→ / Page Down</td><td>Next slide (presentation clickers work too)</td></tr>
                <tr><td>← / Page Up</td><td>Previous slide</td></tr>
                <tr><td>Space</td><td>Pause / resume voice sync</td></tr>
                <tr><td>R</td><td>Restart the current slide's script</td></tr>
                <tr><td>↑ / ↓</td><td>Nudge the highlighted word back or forward</td></tr>
                <tr><td>T</td><td>Show / hide the live transcript</td></tr>
                <tr><td>Q</td><td>Open / close the SI copilot</td></tr>
                <tr><td>Esc</td><td>Exit presentation mode</td></tr>
              </tbody>
            </table>
            <p>
              Clicking a word in the strip also moves the highlight there. When a slide's script is finished the strip shows <strong>End of slide</strong>;
              slides only change automatically if you turn on <em>Automatically advance</em>. Shortcuts can be changed in Settings.
            </p>
          </Doc>

          <Doc id="voice-commands" title="Voice commands">
            <p>
              Say <strong>“Next slide”</strong>, <strong>“Previous slide”</strong>, <strong>“Repeat”</strong>, <strong>“Pause”</strong> or{' '}
              <strong>“Resume”</strong> on its own, with a short pause before and after. Commands inside normal sentences are ignored, so saying “next
              quarter” never changes the slide. Phrases can be edited in <em>Settings → Voice commands</em>.
            </p>
          </Doc>

          <Doc id="calls" title="Present on a call (Meet, Zoom, Teams)">
            <p>
              Use <strong>On a call</strong> (Presentations page) or <strong>Present on a call</strong> (editor). The audience sees only your slides; the
              teleprompter stays with you.
            </p>
            <ul>
              <li>
                <strong>Browser:</strong> click <strong>Start</strong>. The teleprompter — and the SI copilot, if switched on — pops out into a small floating
                window you can place under your camera. The tab shows only the deck: in Meet choose <em>Share screen → A tab</em> and pick the Reflex tab
                (Zoom/Teams: share that browser tab).
              </li>
              <li>
                <strong>Mac app:</strong> the slides fill the screen in a window called <em>Reflex — Slides (share this window)</em>; share that window.
              </li>
            </ul>
            <p>
              Share the <strong>tab</strong> or the <strong>slides window</strong>, not “Entire screen” — sharing the entire screen shows everything on it,
              including the teleprompter.
            </p>
          </Doc>

          <Doc id="second-display" title="Second display">
            <p>
              Choose <em>Settings → Presenting → Second display</em>. Pick the audience display (a monitor, projector, or an iPad with Sidecar) and the slides
              go full-screen there, while your screen becomes a presenter console with the teleprompter, current and next slide, notes, timer and the SI
              copilot.
            </p>
          </Doc>

          <Doc id="si-copilot" title="SI copilot">
            <p>
              SI (Smart Intelligence) suggests answers to the questions people ask you on a call, using only your deck, scripts, notes and Q&A prep notes. It
              never invents numbers: if your material doesn't cover a question, it says so and suggests an honest follow-up.
            </p>
            <ol>
              <li>
                While presenting press <code>Q</code> (or the ✦ button) to open the copilot.
              </li>
              <li>
                Click <strong>Listen to the call</strong> (Chrome/Edge) and choose the tab your meeting runs in with <strong>“Also share tab audio”</strong>{' '}
                switched on. The call audio is transcribed on your computer.
              </li>
              <li>
                When someone asks a question, it appears in the panel and an answer streams in seconds later. Turn off <em>Answer detected questions
                automatically</em> to answer only the ones you click.
              </li>
              <li>You can also type any question at any time.</li>
            </ol>
            <p>
              In call mode the copilot appears in the floating teleprompter window, so it's never part of the tab you share. In the Mac app you can type
              questions; listening to call audio needs the web app.
            </p>
          </Doc>

          <Doc id="ai-providers" title="AI providers & API keys">
            <p>
              In <em>Settings → SI copilot</em> choose where answers come from:
            </p>
            <ul>
              <li>
                <strong>Built-in AI</strong> — Claude, run by {PRODUCT}. Nothing to set up; up to {AI_DAILY_LIMIT} answers a day on SI.
              </li>
              <li>
                <strong>Your own API key</strong> — Anthropic Claude, OpenAI, Google Gemini, Groq, OpenRouter, or <strong>Custom</strong>: any
                OpenAI-compatible API such as Ollama, LM Studio, DeepSeek, Mistral or Together (enter its base URL, e.g. <code>http://localhost:11434/v1</code>).
              </li>
            </ul>
            <p>
              Paste the key, pick a model (or type any model id), and press <strong>Test</strong>. Keys are stored only on your device and requests go
              straight to the provider — they never pass through our servers. The provider bills you for that usage under its own terms. You can also set
              the <strong>answer length</strong> and <strong>custom instructions</strong> (tone, facts to always mention) for every answer.
            </p>
          </Doc>

          <Doc id="plans" title="Plans & billing">
            <ul>
              <li>
                <strong>Free trial</strong> — {TRIAL_DAYS} days of Standard plus {FREE_AI_ANSWERS} SI answers.
              </li>
              <li>
                <strong>Standard (non-SI)</strong> — ${PLANS.standard_monthly.price}/month or ${PLANS.standard_yearly.price}/year. The teleprompter for
                your own script, unlimited usage.
              </li>
              <li>
                <strong>SI</strong> — ${PLANS.si_monthly.price}/month or ${PLANS.si_yearly.price}/year. Standard plus the AI copilot and AI script drafts.
              </li>
            </ul>
            <p>
              Pay on your <Link to="/account" className="link">account page</Link> with Razorpay (USD). Plans are prepaid and{' '}
              <strong>never renew automatically</strong>; buying again adds time on top of what you have left. Your plan follows your account into the Mac
              app. Refunds: see the <Link to="/refunds" className="link">refund policy</Link>.
            </p>
          </Doc>

          <Doc id="mac-app" title="Mac app">
            <p>
              The <Link to="/download" className="link">Mac app</Link> (Apple Silicon) runs speech recognition with Metal, works offline after a one-time
              model download, presents on a second display, and opens legacy <code>.ppt</code> files. Sign in with the <strong>same email</strong> you use
              on the website — your trial or plan applies there automatically, and <em>Settings</em> shows the name and email that are signed in.
            </p>
          </Doc>

          <Doc id="privacy" title="Privacy & your data">
            <ul>
              <li>Your voice is transcribed on your device; audio is never recorded or uploaded.</li>
              <li>Decks, scripts and notes are stored on your device.</li>
              <li>
                Only when SI answers a question are that question and your deck text sent to the AI provider you chose (built-in, or your own).
              </li>
              <li>
                Your account (email, name), plan and payment records are stored with Supabase; card details stay with Razorpay. See the{' '}
                <Link to="/privacy" className="link">privacy policy</Link>.
              </li>
            </ul>
          </Doc>

          <Doc id="troubleshooting" title="Troubleshooting">
            <ul>
              <li>
                <strong>“Microphone access was blocked”</strong> — allow the microphone in the browser's site settings (the icon left of the address bar),
                then press Retry.
              </li>
              <li>
                <strong>The teleprompter doesn't move</strong> — check the mic indicator at the bottom left, try <em>Settings → Speech → Test microphone</em>,
                and make sure sync isn't paused (Space).
              </li>
              <li>
                <strong>“No call audio was shared”</strong> — when picking the tab in <em>Listen to the call</em>, switch on “Also share tab audio”.
              </li>
              <li>
                <strong>An AI provider rejects the key</strong> — re-paste it in Settings → SI and press Test; check the model id and that your account has
                credit.
              </li>
              <li>
                <strong>Screen share shows a blank window (Mac)</strong> — allow your meeting app under <em>System Settings → Privacy & Security → Screen &
                System Audio Recording</em>, then restart it.
              </li>
              <li>
                Still stuck? <Link to="/contact?topic=support" className="link">Contact us</Link>.
              </li>
            </ul>
          </Doc>
        </article>
      </div>
    </SiteShell>
  )
}

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-slate-200 pb-10 [&_.link]:font-medium [&_.link]:text-orange-700 [&_.link]:underline [&_.link]:underline-offset-2 [&+section]:pt-10">
      <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>
      {children}
    </section>
  )
}
