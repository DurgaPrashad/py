import { isTauri } from '../services/tauri'
import { desktop } from './desktop'
import type { Platform } from './types'
import { web } from './web'

/** The desktop app (Tauri) or the hosted web app. */
export const platform: Platform = isTauri() ? desktop : web

export type { CameraAnchor, LegacySlide, Platform } from './types'
