import type { Extraction } from '../../types'

const METHOD_LABEL: Record<Extraction['method'], string> = {
  'pdf-text': 'PDF text',
  'pptx-xml': 'PowerPoint text',
  'ppt-binary': 'PowerPoint text',
  ocr: 'OCR',
  manual: 'Manual',
  none: 'No text',
}

/** "Text extraction confidence" indicator shown next to detected text. */
export function ConfidenceBadge({ extraction, compact }: { extraction: Extraction; compact?: boolean }) {
  const pct = Math.round(extraction.confidence * 100)
  const tone =
    extraction.method === 'none' || extraction.method === 'manual'
      ? 'text-subtle bg-line'
      : extraction.confidence >= 0.85
        ? 'text-success bg-success/10'
        : extraction.confidence >= 0.6
          ? 'text-warning bg-warning/10'
          : 'text-danger bg-danger/10'
  const showPct = extraction.method !== 'none' && extraction.method !== 'manual'
  return (
    <span
      title={`Text extraction confidence${extraction.note ? ` — ${extraction.note}` : ''}`}
      className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap tabular ${tone}`}
    >
      {compact ? (showPct ? `${pct}%` : METHOD_LABEL[extraction.method]) : `${METHOD_LABEL[extraction.method]}${showPct ? ` · ${pct}%` : ''}`}
    </span>
  )
}
