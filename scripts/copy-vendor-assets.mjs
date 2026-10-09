// Copies runtime assets that must be served locally (the app works offline)
// into public/vendor: the Tesseract OCR worker, WASM core and English model,
// the ONNX Runtime used for in-browser speech recognition, plus pdf.js
// character maps, standard fonts and image decoders.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'vendor')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'ocr', 'lang'), { recursive: true })
mkdirSync(join(out, 'ort'), { recursive: true })

const copy = (from, to) => {
  const src = join(nm, from)
  if (!existsSync(src)) throw new Error(`missing ${src} — run npm install`)
  cpSync(src, join(out, to), { recursive: true })
}

copy('tesseract.js/dist/worker.min.js', 'ocr/worker.min.js')
for (const f of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  copy(`tesseract.js-core/${f}.wasm.js`, `ocr/${f}.wasm.js`)
}
copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'ocr/lang/eng.traineddata.gz')

// ONNX Runtime (WebGPU + WASM) for in-browser speech recognition.
copy('onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort/ort-wasm-simd-threaded.asyncify.mjs')
copy('onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort/ort-wasm-simd-threaded.asyncify.wasm')

copy('pdfjs-dist/cmaps', 'pdfjs/cmaps')
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts')
copy('pdfjs-dist/wasm', 'pdfjs/wasm')
copy('pdfjs-dist/iccs', 'pdfjs/iccs')

console.log('vendor assets copied to public/vendor')
