import { describe, it, expect } from 'vitest'

import { imageDimensions } from '../image-dimensions'

function bytes(...parts: Array<number[] | string>): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(part, (c) => c.charCodeAt(0)))
    else out.push(...part)
  }
  return Uint8Array.from(out)
}
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff]

describe('imageDimensions', () => {
  it('reads a PNG header', () => {
    const png = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(1280), be32(840), [8, 6, 0, 0, 0])
    expect(imageDimensions(png)).toEqual({ width: 1280, height: 840 })
  })

  it('reads a GIF header', () => {
    expect(imageDimensions(bytes('GIF89a', le16(320), le16(240), [0, 0, 0]))).toEqual({ width: 320, height: 240 })
  })

  it('reads the three WebP chunk kinds', () => {
    const riff = (chunk: string, body: number[]) => bytes('RIFF', be32(0).reverse(), 'WEBP', chunk, be32(0).reverse(), body)
    expect(imageDimensions(riff('VP8X', [0, 0, 0, 0, ...le24(1279), ...le24(839), 0, 0]))).toEqual({ width: 1280, height: 840 })
    // VP8L: signature byte 0x2f, then 14 bits of width-1 and 14 bits of height-1.
    const w = 1000 - 1, h = 940 - 1
    const b0 = w & 0xff, b1 = ((w >> 8) & 0x3f) | ((h & 0x03) << 6), b2 = (h >> 2) & 0xff, b3 = (h >> 10) & 0x0f
    expect(imageDimensions(riff('VP8L', [0x2f, b0, b1, b2, b3, 0, 0, 0, 0, 0]))).toEqual({ width: 1000, height: 940 })
    // VP8: a 3-byte frame tag, the start code, then 14-bit width and height.
    expect(imageDimensions(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(420), 0, 0]))).toEqual({ width: 640, height: 420 })
  })

  it('walks JPEG segments to the frame header', () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...Array(14).fill(0)]
    const sof0 = [0xff, 0xc0, ...be16(17), 8, ...be16(600), ...be16(800), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(imageDimensions(bytes([0xff, 0xd8], app0, sof0))).toEqual({ width: 800, height: 600 })
  })

  it('answers null for anything it does not know', () => {
    expect(imageDimensions(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(imageDimensions(bytes([0xff, 0xd8, 0x00, 0x00]))).toBeNull()
    expect(imageDimensions(new Uint8Array(0))).toBeNull()
  })
})
