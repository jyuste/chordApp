import { Chord, Interval, Note, Scale } from 'tonal'
import type {
  ChordMatch,
  Instrument,
  IntervalInfo,
  KeyMode,
  ScaleInfo,
  Suggestion,
  Tuning,
  Voicing,
} from './types'

export const INSTRUMENTS: Record<Instrument, { name: string; strings: number }> = {
  guitar: { name: 'Guitarra', strings: 6 },
  bass4: { name: 'Bajo de 4 cuerdas', strings: 4 },
  bass5: { name: 'Bajo de 5 cuerdas', strings: 5 },
}
const tuning = (id: string, name: string, instrument: Instrument, notes: string[]): Tuning => ({
  id,
  name,
  instrument,
  notes,
})
export const PRESET_TUNINGS: Tuning[] = [
  tuning('guitar-standard', 'Estándar · E A D G B E', 'guitar', [
    'E2',
    'A2',
    'D3',
    'G3',
    'B3',
    'E4',
  ]),
  tuning('guitar-drop-d', 'Drop D', 'guitar', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']),
  tuning('guitar-eb', 'Mi bemol · Eb', 'guitar', ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4']),
  tuning('guitar-d', 'Re estándar', 'guitar', ['D2', 'G2', 'C3', 'F3', 'A3', 'D4']),
  tuning('guitar-dadgad', 'DADGAD', 'guitar', ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']),
  tuning('guitar-open-g', 'Sol abierto · Open G', 'guitar', ['D2', 'G2', 'D3', 'G3', 'B3', 'D4']),
  tuning('guitar-open-d', 'Re abierto · Open D', 'guitar', ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4']),
  tuning('bass4-standard', 'Estándar · E A D G', 'bass4', ['E1', 'A1', 'D2', 'G2']),
  tuning('bass4-drop-d', 'Drop D', 'bass4', ['D1', 'A1', 'D2', 'G2']),
  tuning('bass4-eb', 'Mi bemol · Eb', 'bass4', ['Eb1', 'Ab1', 'Db2', 'Gb2']),
  tuning('bass4-d', 'Re estándar', 'bass4', ['D1', 'G1', 'C2', 'F2']),
  tuning('bass5-standard', 'Estándar · B E A D G', 'bass5', ['B0', 'E1', 'A1', 'D2', 'G2']),
  tuning('bass5-tenor', 'Tenor · E A D G C', 'bass5', ['E1', 'A1', 'D2', 'G2', 'C3']),
  tuning('bass5-drop-a', 'Drop A', 'bass5', ['A0', 'E1', 'A1', 'D2', 'G2']),
]
export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const SCALE_TYPES = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major pentatonic',
  'minor pentatonic',
  'blues',
  'harmonic minor',
  'melodic minor',
  'chromatic',
]
const mod = (n: number) => ((n % 12) + 12) % 12
const clean = (s: string) => s.trim().replaceAll('♯', '#').replaceAll('♭', 'b')
const pc = (s: string) => Note.get(clean(s)).chroma
const unique = (values: number[]) => [...new Set(values)]
const validPcs = (notes: string[]) => notes.map(pc).filter((v): v is number => v !== undefined)
export function noteLabel(note: string, solfege = false): string {
  const parsed = Note.get(clean(note))
  if (parsed.empty) return note
  if (!solfege) return parsed.name
  const labels: Record<string, string> = {
    C: 'Do',
    D: 'Re',
    E: 'Mi',
    F: 'Fa',
    G: 'Sol',
    A: 'La',
    B: 'Si',
  }
  return `${labels[parsed.letter]}${parsed.acc}${parsed.oct ?? ''}`
}
export function fretNote(note: string, fret: number, capo = 0): string {
  const midi = Note.midi(clean(note))
  if (midi === null || !Number.isInteger(fret) || fret < 0 || !Number.isInteger(capo) || capo < 0)
    return ''
  const pitch = midi + fret + capo
  return pitch <= 127
    ? fret + capo === 0
      ? Note.get(clean(note)).name
      : Note.fromMidiSharps(pitch)
    : ''
}
export function positionNotes(t: Tuning, frets: (number | null)[], capo = 0): string[] {
  return t.notes.flatMap((note, index) => {
    const fret = frets[index]
    if (fret === null || fret === undefined) return []
    const pitch = fretNote(note, fret, capo)
    return pitch ? [pitch] : []
  })
}
// Only a final slash followed by a pitch class denotes a bass. The slash in
// chord aliases such as C6/9 belongs to the quality and must survive parsing.
function splitChord(name: string): { base: string; bass?: string } {
  const normalized = clean(name)
  const match = normalized.match(/^(.*)\/([A-G](?:#{1,2}|b{1,2})?)$/)
  return match ? { base: match[1]!, bass: match[2]! } : { base: normalized }
}
export function chordInfo(name: string): { name: string; notes: string[]; intervals: string[] } {
  const normalized = clean(name)
  const { base, bass } = splitChord(normalized)
  const chord = Chord.get(base)
  if (chord.empty || chord.bass || (bass && Note.get(bass).empty))
    return { name: normalized, notes: [], intervals: [] }
  // Keep the harmonic root first for degrees/highlights. A non-chord slash bass
  // is an additional advertised pitch and receives its interval from that root.
  const notes = [...chord.notes],
    intervals = [...chord.intervals]
  if (bass && !notes.some((note) => pc(note) === pc(bass))) {
    notes.push(bass)
    intervals.push(Interval.distance(chord.tonic!, bass))
  }
  return { name: normalized, notes, intervals }
}
const QUALITIES = [
  '',
  'm',
  '5',
  'dim',
  'aug',
  'sus2',
  'sus4',
  '6',
  'm6',
  '6add9',
  '7',
  'maj7',
  'm7',
  'mMaj7',
  'dim7',
  'm7b5',
  '7sus4',
  'add9',
  'madd9',
  '9',
  'maj9',
  'm9',
  '11',
  'm11',
  '13',
  'maj13',
  'm13',
  '7b9',
  '7#9',
  '7b5',
  '7#5',
  '7#11',
  '7b13',
  'maj7#11',
]
export function identifyChord(notes: string[]): ChordMatch[] {
  if (notes.length === 0 || notes.some((n) => pc(n) === undefined)) return []
  const pcs = unique(validPcs(notes))
  if (pcs.length < 2) return []
  const pitched = notes.map((n) => ({ note: Note.get(clean(n)), midi: Note.midi(clean(n)) }))
  const bass = pitched.every((n) => n.midi !== null)
    ? pitched.reduce((a, b) => (b.midi! < a.midi! ? b : a)).note
    : pitched[0]!.note
  const roots = [...new Set(notes.map((n) => Note.get(clean(n)).pc))]
  const result: ChordMatch[] = []
  for (const root of roots)
    for (const quality of QUALITIES) {
      const info = chordInfo(root + quality)
      if (!info.notes.length) continue
      const chordPcs = unique(validPcs(info.notes))
      if (pcs.some((p) => !chordPcs.includes(p))) continue
      const missing = info.notes.filter((n) => !pcs.includes(pc(n)!))
      const exact = missing.length === 0
      // A missing perfect fifth is conventional in seventh and extended chords.
      if (
        !exact &&
        !(
          info.notes.length >= 4 &&
          missing.length === 1 &&
          info.intervals[info.notes.indexOf(missing[0]!)] === '5P'
        )
      )
        continue
      const slash = pc(root) !== bass.chroma ? `/${bass.pc}` : ''
      result.push({
        ...info,
        name: root + quality + slash,
        exact,
        ...(missing.length ? { missing } : {}),
      })
    }
  return result
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        Number(a.name.includes('/')) - Number(b.name.includes('/')) ||
        a.name.length - b.name.length,
    )
    .slice(0, 24)
}
function fingerCount(frets: (number | null)[]): number {
  let count = frets.filter((f) => f !== null && f > 0).length
  for (const fret of new Set(frets.filter((f): f is number => f !== null && f > 0))) {
    const indices = frets.flatMap((f, i) => (f === fret ? [i] : []))
    // A barre cannot pass through a sounding open/lower-fretted string.
    let group = 0
    for (let i = indices[0]!; i <= indices[indices.length - 1]!; i++) {
      if (frets[i] !== null && frets[i]! < fret) {
        count -= Math.max(0, group - 1)
        group = 0
      } else if (frets[i] === fret) group++
    }
    count -= Math.max(0, group - 1)
  }
  return count
}
export function generateVoicings(
  name: string,
  t: Tuning,
  options: { minFret?: number; maxFret?: number; maxSpan?: number; capo?: number } = {},
): Voicing[] {
  const info = chordInfo(name)
  if (
    !info.notes.length ||
    !t.notes.length ||
    t.notes.length > 8 ||
    t.notes.some((n) => Note.midi(n) === null)
  )
    return []
  const { minFret = 0, maxFret = 12, maxSpan = 4, capo = 0 } = options
  if (
    ![minFret, maxFret, maxSpan, capo].every(Number.isInteger) ||
    minFret < 0 ||
    maxFret < minFret ||
    maxFret > 36 ||
    maxSpan < 0 ||
    maxSpan > 12 ||
    capo < 0 ||
    capo > 24
  )
    return []
  const targets = unique(validPcs(info.notes))
  const slash = splitChord(name).bass
  const requiredBass = slash ? pc(slash) : undefined
  // Every advertised chord tone must sound; omitted-fifth matches are only analysis suggestions.
  const required = targets
  if (required.length > t.notes.length) return []
  const found = new Map<string, Voicing>()
  let budget = 180000
  const openMidi = t.notes.map((n) => Note.midi(n)! + capo)
  for (let start = Math.max(1, minFret); start <= Math.max(1, maxFret); start++) {
    const choices = openMidi.map((midi) => {
      const frets: (number | null)[] = [null]
      if (minFret === 0 && targets.includes(mod(midi))) frets.push(0)
      for (let f = start; f <= Math.min(maxFret, start + maxSpan); f++)
        if (targets.includes(mod(midi + f))) frets.push(f)
      return frets
    })
    const visit = (index: number, frets: (number | null)[], sounding: number[]) => {
      if (--budget < 0) return
      if (
        required.some((p) => !sounding.some((n) => mod(n) === p)) &&
        required.filter((p) => !sounding.some((n) => mod(n) === p)).length > t.notes.length - index
      )
        return
      if (index === t.notes.length) {
        if (sounding.length < 2 || required.some((p) => !sounding.some((n) => mod(n) === p))) return
        if (requiredBass !== undefined && mod(Math.min(...sounding)) !== requiredBass) return
        if (fingerCount(frets) > 4) return
        const key = frets.map((f) => (f === null ? 'x' : f)).join(',')
        if (found.has(key)) return
        const pressed = frets.filter((f): f is number => f !== null && f > 0)
        const span = pressed.length ? Math.max(...pressed) - Math.min(...pressed) : 0
        const score =
          span * 3 +
          (pressed.length ? Math.min(...pressed) : 0) * 0.8 +
          frets.filter((f) => f === null).length * 2 +
          (mod(Math.min(...sounding)) === pc(info.notes[0]!) ? 0 : 4) +
          (targets.some((p) => !sounding.some((n) => mod(n) === p)) ? 6 : 0)
        found.set(key, { frets: [...frets], notes: positionNotes(t, frets, capo), score })
        return
      }
      for (const f of choices[index]!)
        visit(index + 1, [...frets, f], f === null ? sounding : [...sounding, openMidi[index]! + f])
    }
    visit(0, [], [])
    if (budget < 0) break
  }
  return [...found.values()].sort((a, b) => a.score - b.score).slice(0, 64)
}
export function getScale(root: string, type: string): ScaleInfo {
  const parsed = Note.get(clean(root))
  if (parsed.empty) return { name: `${root} ${type}`, notes: [], intervals: [] }
  const scale = Scale.get(`${parsed.pc} ${type}`)
  return { name: scale.name, notes: [...scale.notes], intervals: [...scale.intervals] }
}
export function compatibleScales(notes: string[]): ScaleInfo[] {
  if (!notes.length || notes.some((n) => pc(n) === undefined)) return []
  const pcs = unique(validPcs(notes))
  return NOTE_NAMES.flatMap((root) => SCALE_TYPES.map((type) => getScale(root, type)))
    .filter((s) => {
      const pitches = validPcs(s.notes)
      return pitches.length && pcs.every((p) => pitches.includes(p))
    })
    .sort((a, b) => a.notes.length - b.notes.length)
    .slice(0, 48)
}
const INTERVAL_NAMES: Record<number, string> = {
  1: 'Unísono',
  2: 'Segunda',
  3: 'Tercera',
  4: 'Cuarta',
  5: 'Quinta',
  6: 'Sexta',
  7: 'Séptima',
  8: 'Octava',
  9: 'Novena',
  10: 'Décima',
  11: 'Undécima',
  12: 'Duodécima',
  13: 'Decimotercera',
  14: 'Decimocuarta',
  15: 'Doble octava',
}
export function describeInterval(from: string, to: string): IntervalInfo {
  const a = Note.get(clean(from)),
    b = Note.get(clean(to))
  if (a.empty || b.empty)
    return {
      name: 'Intervalo no válido',
      semitones: 0,
      direction: '',
      symbol: '',
      explanation: 'Introduce dos notas válidas.',
    }
  const symbol = Interval.distance(a.name, b.name)
  const interval = Interval.get(symbol)
  if (interval.empty)
    return {
      name: 'Intervalo no válido',
      semitones: 0,
      direction: '',
      symbol: '',
      explanation: 'No se puede calcular este intervalo.',
    }
  const qualities: Record<string, string> = {
    P: 'justa',
    M: 'mayor',
    m: 'menor',
    A: 'aumentada',
    AA: 'doblemente aumentada',
    d: 'disminuida',
    dd: 'doblemente disminuida',
  }
  const size = Math.abs(interval.num)
  const base = INTERVAL_NAMES[size] ?? `Intervalo de ${size}ª`
  const quality = qualities[interval.q] ?? interval.q
  const name = `${base} ${size === 1 || size === 8 || size === 15 ? quality.replace(/a$/, 'o') : quality}`
  const direction =
    interval.semitones === 0 ? 'Unísono' : interval.dir < 0 ? 'Descendente' : 'Ascendente'
  return {
    name,
    semitones: interval.semitones,
    direction,
    symbol,
    explanation: `${a.name} → ${b.name}: ${name.toLowerCase()}, ${Math.abs(interval.semitones)} semitonos. ${direction}.`,
  }
}
export function romanNumeral(chord: string, key: string, mode: KeyMode = 'major'): string {
  const info = chordInfo(chord),
    scale = getScale(key, mode)
  if (!info.notes.length || !scale.notes.length) return ''
  const parsed = Chord.get(splitChord(chord).base)
  const root = pc(parsed.tonic ?? '')
  if (root === undefined) return ''
  const degree = scale.notes.findIndex((n) => pc(n) === root)
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  let numeral: string
  if (degree >= 0) numeral = numerals[degree]!
  else {
    const offset = mod(root - pc(scale.notes[0]!)!)
    const flatDegrees: Record<number, string> = {
      1: '♭II',
      3: '♭III',
      6: '♭V',
      8: '♭VI',
      10: '♭VII',
    }
    // In minor, numerals are relative to the natural minor scale: III, VI, VII.
    // Raised notes (such as the harmonic-minor leading tone) retain their alteration.
    const minorAlterations: Record<number, string> = {
      1: '♭II',
      4: '♯III',
      6: '♯IV',
      9: '♯VI',
      11: '♯VII',
    }
    numeral = (mode === 'minor' ? minorAlterations : flatDegrees)[offset] ?? '?'
  }
  if (parsed.quality === 'Minor' || parsed.quality === 'Diminished') numeral = numeral.toLowerCase()
  if (parsed.quality === 'Diminished') numeral += parsed.intervals.includes('7m') ? 'ø' : '°'
  else if (parsed.quality === 'Augmented') numeral += '+'
  const hasSeventh = parsed.intervals.some((i) => i.startsWith('7'))
  const extension = parsed.intervals.some((i) => i.startsWith('13'))
    ? '13'
    : parsed.intervals.some((i) => i.startsWith('11'))
      ? '11'
      : parsed.intervals.some((i) => i.startsWith('9'))
        ? '9'
        : '7'
  if (hasSeventh) numeral += (parsed.intervals.includes('7M') ? 'maj' : '') + extension
  else if (parsed.intervals.includes('6M')) numeral += parsed.intervals.includes('9M') ? '6/9' : '6'
  else if (parsed.intervals.includes('9M')) numeral += 'add9'
  return numeral
}
export function suggestHarmony(
  key: string,
  lastChord?: string,
  mode: KeyMode = 'major',
): Suggestion[] {
  const scale = getScale(key, mode)
  if (!scale.notes.length) return []
  const qualities =
    mode === 'minor' ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim']
  const result: Suggestion[] = scale.notes.map((root, i) => ({
    chord: root + qualities[i],
    kind: 'diatonic',
    reason: `${romanNumeral(root + qualities[i], key, mode)} de ${scale.notes[0]} ${mode === 'minor' ? 'menor natural' : 'mayor'}: acorde diatónico.`,
  }))
  if (lastChord) {
    const last = chordInfo(lastChord)
    if (last.notes.length) {
      const lastRoot = pc(last.notes[0]!)!
      const parsed = Chord.get(splitChord(lastChord).base)
      const isDominant =
        parsed.intervals.includes('3M') &&
        parsed.intervals.includes('5P') &&
        !parsed.intervals.includes('7M')
      for (const item of result)
        if (
          (mode === 'major' || isDominant) &&
          mod(pc(chordInfo(item.chord).notes[0]!)! - lastRoot) === 5
        ) {
          item.kind = 'resolution'
          item.reason =
            mode === 'minor'
              ? `Movimiento de dominante por quinta descendente: ${lastChord} resuelve en ${item.chord}.`
              : 'Movimiento de quinta descendente: resolución natural de la tensión.'
        }
    }
  }
  if (mode === 'minor') {
    const dominant = Note.transpose(scale.notes[0]!, '5P')
    const leadingTone = Note.transpose(scale.notes[0]!, '7M')
    for (const quality of ['', '7'])
      result.push({
        chord: dominant + quality,
        kind: 'tension',
        reason: `Dominante ${quality ? 'V7' : 'V'} de ${scale.notes[0]} menor: procede de la menor armónica, con el VII elevado (${leadingTone}), y prepara ${scale.notes[0]}m.`,
      })
  }
  for (const index of mode === 'minor' ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]) {
    const target = scale.notes[index]!
    const dominant = Note.transpose(target, '5P') + '7'
    result.push({
      chord: dominant,
      kind: 'tension',
      reason: `Dominante secundaria de ${target + qualities[index]} (V/${romanNumeral(target + qualities[index], key, mode)}): prepara su llegada.`,
    })
  }
  if (mode === 'minor') {
    for (const [interval, quality, label] of [
      ['1P', '', 'I mayor'],
      ['4P', '', 'IV mayor'],
      ['6M', 'm', 'vi menor'],
    ] as const)
      result.push({
        chord: Note.transpose(scale.notes[0]!, interval) + quality,
        kind: 'tension',
        reason: `Préstamo modal de la tonalidad mayor paralela (${label}): aporta el color de ${scale.notes[0]} mayor.`,
      })
    return result
  }
  for (const [interval, quality, label] of [
    ['4P', 'm', 'iv menor'],
    ['6m', '', '♭VI'],
    ['7m', '', '♭VII'],
  ] as const)
    result.push({
      chord: Note.transpose(scale.notes[0]!, interval) + quality,
      kind: 'tension',
      reason: `Préstamo modal de la tonalidad menor paralela (${label}): aporta un color más oscuro.`,
    })
  return result
}
export function transposeChord(name: string, semitones: number): string {
  if (!Number.isInteger(semitones) || !chordInfo(name).notes.length) return ''
  const { base, bass } = splitChord(name)
  const match = base!.match(/^([A-G](?:#{1,2}|b{1,2})?)(.*)$/)
  if (!match) return ''
  const interval = Interval.fromSemitones(semitones)
  const root = Note.transpose(match[1]!, interval)
  return root + match[2] + (bass ? '/' + Note.transpose(bass, interval) : '')
}
