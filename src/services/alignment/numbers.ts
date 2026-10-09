// Spell numbers out as words so that "150,000+" in a script and "one hundred
// fifty thousand" (or "150,000") from the recognizer normalize to the same
// token sequence.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES: [number, string][] = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
]

function underThousand(n: number): string[] {
  const out: string[] = []
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], 'hundred')
    n %= 100
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)])
    n %= 10
    if (n) out.push(ONES[n])
  } else if (n > 0 || out.length === 0) {
    out.push(ONES[n])
  }
  return out
}

export function integerToWords(n: number): string[] {
  if (!Number.isFinite(n) || n < 0 || n >= 1e15) return [String(n)]
  n = Math.floor(n)
  if (n === 0) return ['zero']
  const out: string[] = []
  for (const [value, name] of SCALES) {
    if (n >= value) {
      out.push(...underThousand(Math.floor(n / value)), name)
      n %= value
    }
  }
  if (n > 0) out.push(...underThousand(n))
  return out
}

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
}

export function toOrdinal(words: string[]): string[] {
  if (!words.length) return words
  const last = words[words.length - 1]
  let ord: string
  if (ORDINAL_IRREGULAR[last]) ord = ORDINAL_IRREGULAR[last]
  else if (last.endsWith('y')) ord = last.slice(0, -1) + 'ieth'
  else ord = last + 'th'
  return [...words.slice(0, -1), ord]
}

const SUFFIX_SCALE: Record<string, string> = { k: 'thousand', m: 'million', mm: 'million', b: 'billion', bn: 'billion', t: 'trillion' }
const CURRENCY: Record<string, string> = { $: 'dollars', '€': 'euros', '£': 'pounds', '¥': 'yen', '₹': 'rupees' }

// [currency][digits][.decimals][scale suffix][%|+][ordinal / plural suffix]
const NUMBER_RE = /^([$€£¥₹]?)(\d[\d,]*)(?:\.(\d+))?(k|mm|m|bn|b|t)?(%|\+)?(st|nd|rd|th|s)?$/

/** Expand a single numeric token, or return null if it is not numeric. */
export function expandNumber(token: string): string[] | null {
  const m = NUMBER_RE.exec(token)
  if (!m) return null
  const [, currency, intPart, decimals, scale, sign, suffix] = m
  const digits = intPart.replace(/,/g, '')
  if (!digits) return null
  let words = integerToWords(parseInt(digits, 10))
  if (decimals) {
    words = [...words, 'point', ...decimals.split('').map((d) => ONES[Number(d)])]
  }
  if (scale) words.push(SUFFIX_SCALE[scale])
  if (suffix === 'st' || suffix === 'nd' || suffix === 'rd' || suffix === 'th') words = toOrdinal(words)
  if (suffix === 's') {
    // "1990s" -> "nineteen nineties" is how people say it; approximate with
    // a plural on the last word, which fuzzy matching tolerates.
    const last = words[words.length - 1]
    words = [...words.slice(0, -1), last.endsWith('y') ? last.slice(0, -1) + 'ies' : last + 's']
  }
  if (sign === '%') words.push('percent')
  if (sign === '+') words.push('plus')
  if (currency) words.push(CURRENCY[currency])
  return words
}
