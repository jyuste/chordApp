/** Offline recognition of conventional vertical chord diagrams, never hand photos. */
export interface DiagramAnalysis {
  frets: (number | null)[]
  detected: boolean
  /** Evidence score, not a calibrated probability. */
  confidence: number
  message: string
  stringXs: number[]
  fretYs: number[]
}
interface Run {
  center: number
  width: number
  strength: number
}
function runs(profile: number[], threshold: number): Run[] {
  const result: Run[] = []
  for (let i = 0; i < profile.length; i++) {
    if (profile[i]! < threshold) continue
    const start = i
    let weighted = 0,
      weight = 0,
      strength = 0
    while (i < profile.length && profile[i]! >= threshold) {
      weighted += i * profile[i]!
      weight += profile[i]!
      strength = Math.max(strength, profile[i]!)
      i++
    }
    result.push({ center: weighted / weight, width: i - start, strength })
  }
  return result
}
function regularGroup(candidates: Run[], count: number, minGap: number): Run[] | null {
  let best: Run[] | null = null,
    bestScore = -Infinity
  // Bound the search: clear diagrams contain few line candidates; noisy photos do not.
  if (candidates.length < count || candidates.length > 40) return null
  for (let a = 0; a < candidates.length; a++)
    for (let b = a + count - 1; b < candidates.length; b++) {
      const gap = (candidates[b]!.center - candidates[a]!.center) / (count - 1)
      if (gap < minGap) continue
      const group: Run[] = []
      let error = 0
      for (let step = 0; step < count; step++) {
        const target = candidates[a]!.center + step * gap
        const nearest = candidates
          .slice(a, b + 1)
          .reduce((x, y) => (Math.abs(x.center - target) < Math.abs(y.center - target) ? x : y))
        const distance = Math.abs(nearest.center - target)
        if (distance > Math.max(1.5, gap * 0.055) || group.includes(nearest)) break
        group.push(nearest)
        error += distance / gap
      }
      if (group.length !== count || group.some((line) => line.width > gap * 0.2)) continue
      const score = group.reduce((sum, line) => sum + line.strength, 0) - error * 100
      if (score > bestScore) {
        best = group
        bestScore = score
      }
    }
  return best
}
export function analyzeDiagram(
  image: { width: number; height: number; data: Uint8ClampedArray },
  stringCount: number,
  firstFret = 1,
): DiagramAnalysis {
  const fail = (
    message = 'No se detecta un diagrama claro. Recorta la cuadrícula o transcribe la posición manualmente.',
  ): DiagramAnalysis => ({
    frets: Array.from({ length: [4, 5, 6].includes(stringCount) ? stringCount : 0 }, () => null),
    detected: false,
    confidence: 0,
    message,
    stringXs: [],
    fretYs: [],
  })
  const { width, height, data } = image
  if (
    ![4, 5, 6].includes(stringCount) ||
    !Number.isInteger(firstFret) ||
    firstFret < 1 ||
    firstFret > 36 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 40 ||
    height < 40 ||
    width > 1024 ||
    height > 1024 ||
    data.length !== width * height * 4
  )
    return fail(
      'Imagen o traste inicial no válido. Usa un diagrama de hasta 1024 × 1024 píxeles y un traste entre 1 y 36.',
    )
  const dark = new Uint8Array(width * height),
    columns = Array<number>(width).fill(0)
  let ink = 0
  for (let index = 0; index < dark.length; index++) {
    const offset = index * 4,
      alpha = data[offset + 3]! / 255
    const luminance =
      (0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!) * alpha +
      255 * (1 - alpha)
    if (luminance < 105) {
      dark[index] = 1
      columns[index % width]!++
      ink++
    }
  }
  if (ink < width || ink > dark.length * 0.4) return fail()
  const verticalCandidates = runs(columns, Math.max(20, height * 0.25))
  // Extra strong verticals could be a different instrument or multiple diagrams.
  // Never reinterpret a six-string diagram as a cropped four-string one.
  if (verticalCandidates.length !== stringCount) return fail()
  const vertical = regularGroup(verticalCandidates, stringCount, 8)
  if (!vertical) return fail()
  const xs = vertical.map((line) => line.center),
    x0 = Math.round(xs[0]!),
    x1 = Math.round(xs.at(-1)!)
  if (x1 - x0 < width * 0.25) return fail()
  const rows = Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) for (let x = x0; x <= x1; x++) rows[y]! += dark[y * width + x]!
  const horizontalCandidates = runs(rows, (x1 - x0 + 1) * 0.88)
  if (horizontalCandidates.length < 3 || horizontalCandidates.length > 18) return fail()
  // Require all detected boundaries to form a regular sequence. An ambiguous
  // subgrid is rejected instead of silently changing which fret is the first.
  const horizontal = regularGroup(horizontalCandidates, horizontalCandidates.length, 8)
  if (!horizontal) return fail()
  const ys = horizontal.map((line) => line.center),
    y0 = Math.round(ys[0]!),
    y1 = Math.round(ys.at(-1)!)
  const gapX = (x1 - x0) / (stringCount - 1),
    gapY = (y1 - y0) / (ys.length - 1)
  if (gapY / gapX < 0.5 || gapY / gapX > 2.5 || ys.length - 2 + firstFret > 36) return fail()
  // Check uninterrupted strings throughout the proposed fret grid. Projection
  // peaks alone could be unrelated marks in a photograph or a page of text.
  for (const line of vertical) {
    let covered = 0
    for (let y = y0; y <= y1; y++) {
      let hit = false
      for (
        let x = Math.max(0, Math.floor(line.center - line.width / 2));
        x <= Math.min(width - 1, Math.ceil(line.center + line.width / 2));
        x++
      )
        if (dark[y * width + x]) hit = true
      if (hit) covered++
    }
    if (covered / (y1 - y0 + 1) < 0.9) return fail()
  }
  const frets: (number | null)[] = Array(stringCount).fill(null)
  const radius = Math.max(3, Math.floor(Math.min(gapX, gapY) * 0.26))
  let weakest = 1,
    dots = 0
  for (let string = 0; string < stringCount; string++) {
    const hits: { row: number; density: number }[] = []
    const xCenter = xs[string]!,
      excluded = Math.max(1, Math.ceil(vertical[string]!.width / 2))
    for (let row = 0; row < ys.length - 1; row++) {
      const yCenter = (ys[row]! + ys[row + 1]!) / 2
      let black = 0,
        total = 0,
        left = 0,
        right = 0
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          // Ignore the string itself and inspect a circular region strictly inside
          // the fret cell. Ink must extend on both sides of the string.
          if (Math.abs(dx) <= excluded || dx * dx + dy * dy > radius * radius) continue
          const x = Math.round(xCenter) + dx,
            y = Math.round(yCenter) + dy
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          total++
          if (dark[y * width + x]) {
            black++
            if (dx < 0) left++
            else right++
          }
        }
      const density = black / Math.max(1, total)
      if (density >= 0.16 && left >= 3 && right >= 3) hits.push({ row, density })
      // A weak mark is uncertainty, not evidence that a string is unplayed.
      else if (density > 0.065)
        return fail(
          'Hay marcas ambiguas dentro de la cuadrícula. Confirma la posición manualmente.',
        )
    }
    if (hits.length > 1)
      return fail(
        'Hay varias marcas en una cuerda. Recorta un solo diagrama y confirma la posición.',
      )
    if (hits.length === 1) {
      frets[string] = firstFret + hits[0]!.row
      weakest = Math.min(weakest, hits[0]!.density)
      dots++
    }
  }
  if (!dots)
    return fail(
      'Se encontró una cuadrícula, pero no posiciones claras. Confirma las cuerdas al aire o silenciadas manualmente.',
    )
  return {
    frets,
    detected: true,
    confidence: Math.min(0.95, 0.65 + Math.min(0.2, weakest * 0.35) + Math.min(0.1, dots * 0.025)),
    message:
      'Posición sugerida por la cuadrícula. Confirma cuerdas al aire/silenciadas y el traste inicial antes de aplicarla; las cuerdas sin marca quedan sin asignar.',
    stringXs: xs,
    fretYs: ys,
  }
}
