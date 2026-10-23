import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from './defaults'

describe('settings migration', () => {
  it('moves untouched v1 values to the new defaults and keeps custom ones', () => {
    const v1 = {
      version: 1,
      speech: { ...DEFAULT_SETTINGS.speech, stepMs: 300, windowMs: 8000 },
      teleprompter: { ...DEFAULT_SETTINGS.teleprompter, position: 'top', width: 88, transitionMs: 260, fontSize: 52 },
    }
    const s = mergeSettings(v1)
    expect(s.version).toBe(3)
    expect(s.speech.stepMs).toBe(150)
    expect(s.speech.windowMs).toBe(8000)
    expect(s.teleprompter.position).toBe('top')
    expect(s.teleprompter.transitionMs).toBe(140)
    expect(s.teleprompter.fontSize).toBe(52)
    expect(s.display.autoHideControls).toBe(true)
  })

  it('moves the old under-camera default to the top bar (v2 -> v3)', () => {
    const s = mergeSettings({ version: 2, teleprompter: { ...DEFAULT_SETTINGS.teleprompter, position: 'camera' } })
    expect(s.teleprompter.position).toBe('top')
    expect(mergeSettings({ version: 3, teleprompter: { ...DEFAULT_SETTINGS.teleprompter, position: 'camera' } }).teleprompter.position).toBe('camera')
  })

  it('keeps a deliberately chosen top strip', () => {
    const s = mergeSettings({ version: 1, teleprompter: { ...DEFAULT_SETTINGS.teleprompter, position: 'top', width: 70 } })
    expect(s.teleprompter.position).toBe('top')
  })
})
