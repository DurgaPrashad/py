import type { SourceType } from '../../types'

export function sourceTypeOf(path: string): SourceType | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['pptx', 'ppsx', 'potx', 'pptm'].includes(ext)) return 'pptx'
  if (['ppt', 'pps', 'pot'].includes(ext)) return 'ppt'
  return null
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'pptx', 'ppsx', 'potx', 'pptm', 'ppt', 'pps', 'pot']
