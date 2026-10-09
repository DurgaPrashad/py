const BULLET = /^[\s•\-–—*·▪◦●○■□➢►✓✔]+/
const ENDS_SENTENCE = /[.!?:;…]["”’)]?$/
const ENDS_OPEN = /([,&\-–—/(]|\b(and|or|but|for|of|to|the|a|an|with|in|on|by|from|that|which|our|your|their|is|are)\b)$/i

/**
 * Turn extracted slide text into a speakable first-draft script. Lines that
 * are visual wraps of the same phrase are joined; bullets, blank-line
 * paragraphs and finished sentences become separate sentences.
 */
export function textToScript(text: string): string {
  const sentences: string[] = []
  let current = ''
  const flush = () => {
    if (current) sentences.push(ENDS_SENTENCE.test(current) ? current : `${current}.`)
    current = ''
  }
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) {
      flush()
      continue
    }
    const bullet = BULLET.test(trimmed)
    const line = trimmed.replace(BULLET, '').replace(/\s+/g, ' ').trim()
    if (!line) continue
    const wraps = current && !bullet && !ENDS_SENTENCE.test(current) && (/^[a-z(]/.test(line) || ENDS_OPEN.test(current))
    if (wraps) current += ` ${line}`
    else {
      flush()
      current = line
    }
  }
  flush()
  return sentences.join(' ')
}
