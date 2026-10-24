// Renders the link-preview image (public/og.png, 1200×630) and the home-screen
// icon (public/apple-touch-icon.png) from SVG. Run: node scripts/og-image.mjs
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const font = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="78%" cy="18%" r="70%">
      <stop offset="0" stop-color="#ff8a3d" stop-opacity=".28"/>
      <stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0b0f"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Logo -->
  <g transform="translate(72 64)">
    <rect width="52" height="52" rx="12" fill="#17171c" stroke="#ffffff" stroke-opacity=".08"/>
    <rect x="10" y="15" width="32" height="5" rx="2.5" fill="#f5f5f7" opacity=".35"/>
    <rect x="10" y="24" width="21" height="5" rx="2.5" fill="#ff8a3d"/>
    <rect x="10" y="33" width="27" height="5" rx="2.5" fill="#f5f5f7" opacity=".35"/>
    <text x="68" y="35" ${font} font-size="28" font-weight="600" fill="#ffffff">Present</text>
  </g>

  <!-- Headline -->
  <text ${font} font-weight="700" fill="#ffffff" font-size="62" letter-spacing="-1.5">
    <tspan x="72" y="220">Never go blank</tspan>
    <tspan x="72" y="292">in a pitch <tspan fill="#ff8a3d">or a meeting.</tspan></tspan>
  </text>
  <text ${font} font-size="25" fill="#ffffff" fill-opacity=".62">
    <tspan x="72" y="360">Your script follows your voice. When they ask a question,</tspan>
    <tspan x="72" y="394">SI hands you the answer — from your own deck.</tspan>
  </text>

  <!-- The two panels -->
  <g transform="translate(72 450)">
    <rect width="760" height="58" rx="16" fill="#141419" stroke="#ffffff" stroke-opacity=".09"/>
    <text x="28" y="38" ${font} font-size="25" fill="#ffffff" fill-opacity=".38">We're raising</text>
    <rect x="186" y="12" width="88" height="34" rx="9" fill="#ff8a3d" fill-opacity=".16" stroke="#ff8a3d" stroke-opacity=".45"/>
    <text x="198" y="38" ${font} font-size="25" font-weight="600" fill="#ff8a3d">$1.5M</text>
    <text x="288" y="38" ${font} font-size="25" fill="#ffffff">for 18 months of runway</text>

    <rect y="70" width="760" height="58" rx="16" fill="#18191d" stroke="#ffffff" stroke-opacity=".1"/>
    <circle cx="30" cy="99" r="6" fill="#2dd4bf"/>
    <text x="48" y="107" ${font} font-size="20" font-weight="700" fill="#fdba74">SI</text>
    <text x="80" y="107" ${font} font-size="20" fill="#ffffff" fill-opacity=".72">“How will you use the money?”</text>
    <text x="616" y="107" ${font} font-size="18" fill="#fdba74">✓ Answer ready</text>
  </g>

  <text x="1128" y="590" text-anchor="end" ${font} font-size="20" fill="#ffffff" fill-opacity=".45">present.waspid.com</text>
</svg>`

await sharp(Buffer.from(og)).png().toFile('public/og.png')

const icon = await readFile('public/favicon.svg')
await sharp(icon, { density: 600 }).resize(180, 180).png().toFile('public/apple-touch-icon.png')
console.log('Wrote public/og.png and public/apple-touch-icon.png')
