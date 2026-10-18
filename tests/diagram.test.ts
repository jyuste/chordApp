import { describe, expect, it } from 'vitest'
import { analyzeDiagram } from '../src/lib/diagram'
function fixture(
  strings = 6,
  dots: (number | null)[] = [null, 3, 2, null, 1, null],
  firstFret = 1,
) {
  const width = 300,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4).fill(255)
  const pixel = (x: number, y: number, value = 0) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    data[i] = data[i + 1] = data[i + 2] = value
    data[i + 3] = 255
  }
  const xs = Array.from({ length: strings }, (_, i) => 40 + i * 40),
    ys = Array.from({ length: 6 }, (_, i) => 50 + i * 40)
  for (const x of xs) for (let y = 50; y <= 250; y++) pixel(x, y)
  for (const y of ys) for (let x = xs[0]!; x <= xs.at(-1)!; x++) pixel(x, y)
  for (let i = 0; i < strings; i++)
    if (dots[i] !== null && dots[i] !== undefined) {
      const cy = 50 + (dots[i]! - firstFret + 0.5) * 40
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy <= 36) pixel(xs[i]! + dx, cy + dy)
    }
  return { image: { width, height, data }, xs, ys, pixel }
}
describe('local diagram recognition', () => {
  it('recognizes only the filled marks in a six-string C diagram', () => {
    const { image, xs, ys, pixel } = fixture()
    // Open rings are deliberately unresolved, even when visible above the nut.
    for (const x of [160, 240])
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -5; dx <= 5; dx++)
          if (Math.abs(dx * dx + dy * dy - 25) < 6) pixel(x + dx, 30 + dy)
    const result = analyzeDiagram(image, 6)
    expect(result.detected).toBe(true)
    expect(result.frets).toEqual([null, 3, 2, null, 1, null])
    expect(result.stringXs).toEqual(xs)
    expect(result.fretYs).toEqual(ys)
    expect(result.confidence).toBeGreaterThan(0.65)
    expect(result.message).toContain('cuerdas al aire/silenciadas')
  })
  it('applies the declared first fret without guessing the diagram position', () => {
    const { image } = fixture(6, [null, 7, 6, null, 5, null], 5)
    expect(analyzeDiagram(image, 6, 5).frets).toEqual([null, 7, 6, null, 5, null])
  })
  it('supports four- and five-string diagrams with low string on the left', () => {
    expect(analyzeDiagram(fixture(4, [1, null, 3, 2]).image, 4).frets).toEqual([1, null, 3, 2])
    expect(analyzeDiagram(fixture(5, [null, 2, 3, null, 1]).image, 5).frets).toEqual([
      null,
      2,
      3,
      null,
      1,
    ])
  })
  it('rejects a blank, empty grid, solid image, and mismatched string count', () => {
    const blank = { width: 100, height: 100, data: new Uint8ClampedArray(40000).fill(255) }
    expect(analyzeDiagram(blank, 6).detected).toBe(false)
    expect(analyzeDiagram(fixture(6, []).image, 6).detected).toBe(false)
    const solid = { ...blank, data: new Uint8ClampedArray(40000) }
    for (let i = 3; i < solid.data.length; i += 4) solid.data[i] = 255
    expect(analyzeDiagram(solid, 6).detected).toBe(false)
    expect(analyzeDiagram(fixture(4, [1, null, 3, 2]).image, 6).detected).toBe(false)
    expect(analyzeDiagram(fixture().image, 4).detected).toBe(false)
  })
  it('rejects competing dots on a string instead of choosing a fret', () => {
    const { image, xs, pixel } = fixture()
    for (let dx = -6; dx <= 6; dx++)
      for (let dy = -6; dy <= 6; dy++) if (dx * dx + dy * dy <= 36) pixel(xs[1]! + dx, 70 + dy)
    expect(analyzeDiagram(image, 6).detected).toBe(false)
  })
  it('rejects interrupted grid lines and an unstructured noisy image', () => {
    const { image, pixel } = fixture()
    for (let y = 85; y < 165; y++) pixel(120, y, 255)
    expect(analyzeDiagram(image, 6).detected).toBe(false)
    const noise = new Uint8ClampedArray(200 * 200 * 4).fill(255)
    let seed = 42
    for (let i = 0; i < noise.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      if (seed % 5 === 0) noise[i] = noise[i + 1] = noise[i + 2] = 0
    }
    expect(analyzeDiagram({ width: 200, height: 200, data: noise }, 6).detected).toBe(false)
  })
  it('composites transparent background against white', () => {
    const { image } = fixture()
    for (let i = 0; i < image.data.length; i += 4)
      if (image.data[i] === 255) {
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 0
        image.data[i + 3] = 0
      }
    expect(analyzeDiagram(image, 6).frets).toEqual([null, 3, 2, null, 1, null])
  })
  it('bounds image dimensions, input buffer, fret range and supported instruments', () => {
    const { image } = fixture()
    for (const first of [0, 37, 1.5]) expect(analyzeDiagram(image, 6, first).detected).toBe(false)
    expect(analyzeDiagram(image, 6, 36).detected).toBe(false)
    expect(analyzeDiagram(image, 7).detected).toBe(false)
    expect(analyzeDiagram({ ...image, width: 1025 }, 6).detected).toBe(false)
    expect(analyzeDiagram({ ...image, data: new Uint8ClampedArray(1) }, 6).detected).toBe(false)
  })
})
