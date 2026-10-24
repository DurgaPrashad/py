import { AlertTriangle, Check, Copy, Download, Globe, Laptop, Minus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PRODUCT } from '../../config'
import { useAccount } from '../../features/account/account'
import { PageHeader, PrimaryLink, SiteShell } from './SiteShell'

interface Release {
  version: string
  file: string
  arch: string
  bytes: number
  built: string
}

const QUARANTINE_FIX = `xattr -dr com.apple.quarantine "/Applications/${PRODUCT}.app"`

/** The Mac app: download, install, and sign in with the website account. */
export function DownloadPage() {
  const [release, setRelease] = useState<Release | null | undefined>(undefined)
  const email = useAccount((s) => s.profile?.email ?? s.session?.user.email ?? null)
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}downloads/latest.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null))
  }, [])

  const href = release ? `${import.meta.env.BASE_URL}downloads/${release.file}` : null

  return (
    <SiteShell title="Download for Mac">
      <PageHeader eyebrow="Mac app" title={`${PRODUCT} for Mac`}>
        The same teleprompter and SI copilot as the web app, with faster on-device speech, offline presenting and second-display support. Sign in with
        the same account — your plan comes with you.
      </PageHeader>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm md:flex-row md:items-center md:p-9">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Laptop size={26} />
            </span>
            <div>
              <div className="text-[19px] font-semibold tracking-tight">{PRODUCT} for macOS</div>
              <div className="mt-1 text-[14px] text-slate-500">
                {release
                  ? `Version ${release.version} · Apple Silicon (M1 or later) · ${Math.max(1, Math.round(release.bytes / 1e6))} MB · updated ${release.built}`
                  : 'Apple Silicon (M1 or later) · macOS 11 or newer'}
              </div>
            </div>
          </div>
          {href ? (
            <a
              href={href}
              download
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-orange-600 px-6 text-[15px] font-medium text-white shadow-sm shadow-orange-600/20 hover:bg-orange-700"
            >
              <Download size={18} /> Download for Mac
            </a>
          ) : release === null ? (
            <span className="text-[14px] text-slate-500">The download is being updated — use the web app meanwhile.</span>
          ) : null}
        </div>
        {!isMac && (
          <p className="mt-4 flex items-center gap-2 text-[13.5px] text-slate-500">
            <AlertTriangle size={15} className="text-amber-500" /> You're not on a Mac — use the{' '}
            <Link to="/app" className="font-medium text-orange-700 underline">
              web app
            </Link>{' '}
            in Chrome or Edge instead.
          </p>
        )}

        <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.02em]">Install in two minutes</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          <InstallStep n={1} title="Download and unzip">
            Open the downloaded <b>.zip</b> (Safari unzips it for you) and drag <b>{PRODUCT}</b> into your <b>Applications</b> folder.
          </InstallStep>
          <InstallStep n={2} title="Open it the first time">
            The app is signed but not yet notarized by Apple, so macOS asks once. Open it, then go to <b>System Settings → Privacy & Security</b> and click{' '}
            <b>Open Anyway</b>. After that it opens normally.
          </InstallStep>
          <InstallStep n={3} title="Sign in with your website account">
            Click <b>Sign in</b> at the top right and use{' '}
            {email ? (
              <>
                <b>{email}</b> — the email you use on this website
              </>
            ) : (
              <>the email you use on this website</>
            )}
            . Your plan applies in the app straight away, and Settings shows the name and email that are signed in.
          </InstallStep>
          <InstallStep n={4} title="Allow the microphone, download the voice model">
            The first time you present, allow microphone access and download a speech model once (Base · English, 142 MB). Then it works offline.
          </InstallStep>
        </ol>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-[14px] text-slate-700">
            <b>“{PRODUCT} is damaged and can't be opened”?</b> That's macOS quarantine on downloaded apps. Run this once in Terminal, then open the app:
          </p>
          <CopyLine text={QUARANTINE_FIX} />
        </div>

        <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.02em]">Mac app or web app?</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-slate-50 text-[13px] text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Feature</th>
                <th className="px-5 py-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Laptop size={14} /> Mac app
                  </span>
                </th>
                <th className="px-5 py-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Globe size={14} /> Web app
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-slate-100 [&_td]:px-5 [&_td]:py-3">
              <Compare label="Teleprompter that follows your voice" mac web />
              <Compare label="Speech recognition" mac="Metal · Base model (more accurate)" web="WebGPU · Tiny model" />
              <Compare label="Works offline" mac web="After the first load" />
              <Compare label="Present on Meet, Zoom, Teams" mac="Share the slides window" web="Share the tab" />
              <Compare label="Second display / presenter console" mac web />
              <Compare label="Legacy .ppt files" mac web={false} />
              <Compare label="SI copilot — typed questions" mac web />
              <Compare label="SI copilot — listens to the call" mac={false} web="Chrome / Edge" />
              <Compare label="Same account and plan" mac web />
            </tbody>
          </table>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-3xl bg-slate-950 p-8 text-white md:flex-row md:items-center">
          <div>
            <div className="text-[20px] font-semibold tracking-tight">Not on a Mac, or want to start right now?</div>
            <p className="mt-1 text-[14.5px] text-white/65">The web app runs in Chrome or Edge with nothing to install.</p>
          </div>
          <PrimaryLink to="/app">Open the web app</PrimaryLink>
        </div>
      </section>
    </SiteShell>
  )
}

function InstallStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[13px] font-semibold text-white">{n}</span>
      <div>
        <h3 className="text-[15.5px] font-semibold">{title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-600 [&_b]:font-semibold [&_b]:text-slate-900">{children}</p>
      </div>
    </li>
  )
}

function Compare({ label, mac, web }: { label: string; mac: boolean | string; web: boolean | string }) {
  const cell = (v: boolean | string) =>
    v === true ? <Check size={17} className="text-emerald-600" /> : v === false ? <Minus size={17} className="text-slate-300" /> : <span className="text-slate-600">{v}</span>
  return (
    <tr>
      <td className="font-medium text-slate-800">{label}</td>
      <td>{cell(mac)}</td>
      <td>{cell(web)}</td>
    </tr>
  )
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-900 py-2.5 pr-2.5 pl-4">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12.5px] whitespace-nowrap text-slate-100">{text}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[12.5px] font-medium text-white hover:bg-white/20"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
