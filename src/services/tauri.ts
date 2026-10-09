import { convertFileSrc, invoke } from '@tauri-apps/api/core'

export { invoke }

/** True when running inside the Tauri shell (false in a plain browser tab). */
export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Webview URL for a local file in the app data directory. */
export function fileUrl(path: string | null | undefined, version?: number): string {
  if (!path) return ''
  // Already a URL (browser preview / blob assets).
  if (/^(blob:|https?:|data:)/.test(path)) return path
  const url = convertFileSrc(path)
  return version ? `${url}?v=${version}` : url
}

/** Error messages from Rust commands arrive as plain strings. */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}
