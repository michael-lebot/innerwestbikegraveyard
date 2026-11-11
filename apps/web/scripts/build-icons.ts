// Draws the site's raster icons (git-ignored) from app/icon.svg, the header's headstone on a 16 × 16 grid: the iPhone
// home-screen icon, and favicon.ico for Safari before 26, which can't show SVG icons (SPEC §9). `dev` and `build` run
// it first.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const app = new URL('../app/', import.meta.url)
const icon = await sharp(await readFile(new URL('icon.svg', app)))
  .png()
  .toBuffer()
// Each pixel of the art becomes a whole square of pixels, so its edges stay crisp.
const scaled = (factor: number) => sharp(icon).resize(16 * factor, 16 * factor, { kernel: 'nearest' })

// iOS fills a transparent home-screen icon with black, so this one sits on the header's night slate.
const NIGHT = '#1f2a36'
const home = await scaled(10)
  .flatten({ background: NIGHT })
  .extend({ top: 10, bottom: 10, left: 10, right: 10, background: NIGHT })
  .png()
  .toBuffer()
await writeFile(new URL('apple-icon.png', app), home)

// An .ico holding one 32 × 32 PNG, which every browser reads: a 6-byte header, one 16-byte entry, then the PNG.
const png = await scaled(2).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2) // an icon,
header.writeUInt16LE(1, 4) // with one image:
header.writeUInt8(32, 6) // 32 px wide,
header.writeUInt8(32, 7) // 32 px high,
header.writeUInt16LE(1, 10) // one colour plane,
header.writeUInt16LE(32, 12) // 32 bits a pixel,
header.writeUInt32LE(png.length, 14) // this many bytes long,
header.writeUInt32LE(header.length, 18) // straight after the header.
await writeFile(new URL('favicon.ico', app), Buffer.concat([header, png]))
console.info(`apple-icon.png: 180 × 180; favicon.ico: 32 × 32, ${header.length + png.length} B`)
