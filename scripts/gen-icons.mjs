// Generates icon-192.png and icon-512.png (no native deps) — a themed calendar glyph.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size) {
  const px = (x, y, r, g, b) => {
    const o = y * (size * 4 + 1) + 1 + x * 4
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
  }
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) px(x, y, 15, 17, 23) // #0f1117 bg
  }
  const s = size / 64
  const rect = (x0, y0, w, h, col) => {
    for (let y = Math.round(y0 * s); y < Math.round((y0 + h) * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round((x0 + w) * s); x++)
        px(x, y, col[0], col[1], col[2])
  }
  const accent = [124, 156, 255]
  // calendar frame
  rect(12, 16, 40, 4, accent)
  rect(12, 46, 40, 4, accent)
  rect(12, 16, 4, 34, accent)
  rect(48, 16, 4, 34, accent)
  rect(12, 24, 40, 3, accent)
  // dots
  rect(20, 34, 7, 7, [95, 208, 160])
  rect(30, 34, 7, 7, [255, 180, 84])
  rect(40, 34, 7, 7, [124, 156, 255])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
for (const sz of [192, 512]) {
  writeFileSync(join(outDir, `icon-${sz}.png`), png(sz))
  console.log(`wrote icon-${sz}.png`)
}
