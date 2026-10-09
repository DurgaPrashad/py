import { invoke } from '../services/tauri'

/** Dev only: mirror webview errors into the `tauri dev` terminal. */
export function forwardErrors() {
  const send = (level: string, message: string) => invoke('frontend_log', { level, message }).catch(() => {})
  window.addEventListener('error', (e) => send('error', `${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => send('error', `unhandled rejection: ${String(e.reason?.stack ?? e.reason)}`))
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    original(...args)
    send('error', args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
  const warn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    warn(...args)
    send('warn', args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
  }
}
