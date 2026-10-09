import type { Presentation, Slide } from '../../types'
import { tokenizeScript } from '../alignment/normalize'
import { platform } from '../../platform'

/** Re-derive the alignment words whenever a script changes. */
export function withWords(slide: Slide): Slide {
  return { ...slide, words: tokenizeScript(slide.script) }
}

export async function listPresentations(): Promise<Presentation[]> {
  const all = await platform.storage.listProjects()
  return all.filter((p) => p && p.id && Array.isArray(p.slides)).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadPresentation(id: string): Promise<Presentation> {
  return platform.storage.loadProject(id)
}

export async function savePresentation(p: Presentation, touch = true): Promise<Presentation> {
  const next = touch ? { ...p, updatedAt: Date.now() } : p
  await platform.storage.saveProject(next)
  return next
}

export function deletePresentation(id: string): Promise<void> {
  return platform.storage.deleteProject(id)
}

/** Copy the user's file into the project folder; returns the stored path. */
export function importSource(id: string, sourcePath: string): Promise<string> {
  return platform.storage.importSource(id, sourcePath)
}

/** Write a binary asset (e.g. `slides/<id>.jpg`) and return its absolute path. */
export function writeAsset(projectId: string, name: string, bytes: Uint8Array): Promise<string> {
  return platform.storage.writeAsset(projectId, name, bytes)
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  return platform.storage.readBytes(path)
}

/** Where presentations are stored, for display in Settings. */
export function dataLocation(): Promise<string> {
  return platform.storage.dataLocation()
}

/** Estimated speaking time for a script at the given pace. */
export function estimateMs(words: number, wpm: number): number {
  return (words / Math.max(60, wpm)) * 60_000
}

export function presentationWordCount(p: Presentation): number {
  return p.slides.reduce((n, s) => n + s.words.length, 0)
}
