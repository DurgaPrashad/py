import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../components/Toast'
import { platform } from '../../platform'
import { SUPPORTED_EXTENSIONS, sourceTypeOf } from '../../services/parser/formats'

const FILTERS = {
  pdf: { label: 'PDF', extensions: ['pdf'] },
  powerpoint: { label: 'PowerPoint', extensions: ['pptx', 'ppt', 'ppsx', 'pps', 'potx', 'pptm'] },
  any: { label: 'Presentations', extensions: SUPPORTED_EXTENSIONS },
}

/** Pick or receive a presentation file and hand it to the import screen. */
export function useImportFlow() {
  const navigate = useNavigate()

  const start = (path: string) => {
    if (!sourceTypeOf(path)) {
      toast('Unsupported file. Use a PDF, PPTX or PPT presentation.', 'error')
      return
    }
    navigate('/import', { state: { path } })
  }

  const pick = async (kind: keyof typeof FILTERS = 'any') => {
    const f = FILTERS[kind]
    const path = await platform.files.pick(f.extensions, f.label)
    if (path) start(path)
  }

  return { pick, start }
}

/** Native file drag-and-drop onto the window. Returns whether a drag is over it. */
export function useFileDrop(onDrop: (paths: string[]) => void, enabled = true): boolean {
  const [over, setOver] = useState(false)
  const cb = useRef(onDrop)
  useLayoutEffect(() => {
    cb.current = onDrop
  })

  useEffect(() => {
    if (!enabled) return
    return platform.files.onDrop((paths) => cb.current(paths), setOver)
  }, [enabled])

  return over
}
