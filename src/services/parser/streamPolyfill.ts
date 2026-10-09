// WebKit (macOS WKWebView) lacks async iteration of ReadableStream, which
// pdf.js uses (`for await (const chunk of stream)`). Standard polyfill.
const proto = (globalThis as unknown as { ReadableStream?: { prototype: Record<symbol, unknown> } }).ReadableStream?.prototype
if (proto && !proto[Symbol.asyncIterator]) {
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export {}
