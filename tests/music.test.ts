import { describe, expect, it } from 'vitest'
import { Note } from 'tonal'
import {
  PRESET_TUNINGS,
  chordInfo,
  compatibleScales,
  describeInterval,
  fretNote,
  generateVoicings,
  getScale,
  identifyChord,
  noteLabel,
  positionNotes,
  romanNumeral,
  suggestHarmony,
  transposeChord,
} from '../src/lib/music'
const guitar = PRESET_TUNINGS.find((t) => t.id === 'guitar-standard')!
const bass = PRESET_TUNINGS.find((t) => t.id === 'bass5-standard')!
const chromas = (notes: string[]) => [...new Set(notes.map((n) => Note.chroma(n)))].sort()
describe('pitched notes and tunings', () => {
  it('retains B0 and applies capo exactly once', () => {
    expect(fretNote('B0', 0)).toBe('B0')
    expect(positionNotes(bass, [0, null, null, null, null])).toEqual(['B0'])
    expect(positionNotes(guitar, [0, null, null, null, null, 0], 2)).toEqual(['F#2', 'F#4'])
    expect(fretNote('E2', 3, 2)).toBe('A2')
    expect(noteLabel('Bb0', true)).toBe('Sib0')
  })
  it('rejects invalid notes and fret positions', () => {
    expect(fretNote('nope', 2)).toBe('')
    expect(fretNote('E2', -1)).toBe('')
    expect(fretNote('E2', 0.5)).toBe('')
    expect(positionNotes(guitar, [null, null, null, null, null, null])).toEqual([])
  })
})
describe('chord theory', () => {
  it('finds the actual lowest pitch even for reentrant input ordering', () => {
    expect(identifyChord(['G4', 'C4', 'E3']).some((c) => c.exact && c.name === 'C/E')).toBe(true)
  })
  it('keeps ambiguous sixth and minor seventh identities', () => {
    const matches = identifyChord(['C3', 'E3', 'G3', 'A3'])
    expect(matches.some((c) => c.exact && c.name === 'C6')).toBe(true)
    expect(matches.some((c) => c.exact && c.name === 'Am7/C')).toBe(true)
  })
  it('recognizes enharmonics and labels omitted fifths separately', () => {
    expect(identifyChord(['Db3', 'F3', 'G#3']).some((c) => c.exact && c.name === 'Db')).toBe(true)
    const incomplete = identifyChord(['C3', 'E3', 'Bb3']).find((c) => c.name === 'C7')
    expect(incomplete?.exact).toBe(false)
    expect(incomplete?.missing).toEqual(['G'])
    expect(identifyChord(['C3', 'bad'])).toEqual([])
  })
  it('includes non-chord slash basses without losing the harmonic root', () => {
    expect(chordInfo('C/D')).toMatchObject({
      notes: ['C', 'E', 'G', 'D'],
      intervals: ['1P', '3M', '5P', '2M'],
    })
    expect(chordInfo('C/E/G').notes).toEqual([])
    expect(chordInfo('C6/9').notes).toEqual(['C', 'E', 'G', 'A', 'D'])
    expect(transposeChord('C6/9/E', 2)).toBe('D6/9/F#')
    expect(transposeChord('C/D', -2)).toBe('Bb/C')
  })
  it('recognizes altered extensions without calling them a plain seventh', () => {
    expect(
      identifyChord(['C3', 'E3', 'G3', 'Bb3', 'F#4']).some((c) => c.exact && c.name === 'C7#11'),
    ).toBe(true)
    expect(romanNumeral('G9', 'C')).toBe('V9')
    expect(romanNumeral('Dm11', 'C')).toBe('ii11')
    expect(romanNumeral('C6/9', 'C')).toBe('I6/9')
    expect(romanNumeral('Bm7b5', 'C')).toBe('viiø7')
  })
  it('preserves chord spelling, extensions and transposed inversions', () => {
    expect(chordInfo('Dbmaj7').notes).toEqual(['Db', 'F', 'Ab', 'C'])
    expect(chordInfo('C/E').notes).toEqual(['C', 'E', 'G'])
    expect(transposeChord('Cmaj7/E', 2)).toBe('Dmaj7/F#')
    expect(chordInfo('potato').notes).toEqual([])
    expect(chordInfo('C/nope').notes).toEqual([])
    expect(transposeChord('potato', 2)).toBe('')
  })
})
describe('voicing search', () => {
  it('returns bounded, playable candidates that exactly contain chord tones', () => {
    const voicings = generateVoicings('C', guitar, { maxFret: 9, maxSpan: 3, capo: 2 })
    expect(voicings.length).toBeGreaterThan(0)
    expect(voicings.length).toBeLessThanOrEqual(64)
    for (const v of voicings) {
      expect(v.frets).toHaveLength(6)
      expect(chromas(v.notes)).toEqual(chromas(chordInfo('C').notes))
      expect(v.notes).toEqual(positionNotes(guitar, v.frets, 2))
      const pressed = v.frets.filter((f): f is number => f !== null && f > 0)
      expect(Math.max(...pressed) - Math.min(...pressed)).toBeLessThanOrEqual(3)
      expect(v.frets.every((f) => f === null || (f >= 0 && f <= 9))).toBe(true)
    }
  })
  it('enforces inversion bass and fret range', () => {
    const voicings = generateVoicings('C/E', guitar, { minFret: 3, maxFret: 10 })
    expect(voicings.length).toBeGreaterThan(0)
    for (const v of voicings) {
      expect(Math.min(...v.notes.map((n) => Note.midi(n)!)) % 12).toBe(4)
      expect(v.frets.every((f) => f === null || (f >= 3 && f <= 10))).toBe(true)
    }
    expect(generateVoicings('bad', guitar)).toEqual([])
    expect(generateVoicings('C', guitar, { minFret: 5, maxFret: 2 })).toEqual([])
    expect(generateVoicings('C', guitar, { maxFret: 1000 })).toEqual([])
  })
  it('includes an external slash bass in every generated voicing', () => {
    const voicings = generateVoicings('C/D', guitar)
    expect(voicings.length).toBeGreaterThan(0)
    for (const v of voicings) {
      expect(Math.min(...v.notes.map((n) => Note.midi(n)!)) % 12).toBe(2)
      expect(chromas(v.notes)).toEqual(chromas(['C', 'D', 'E', 'G']))
    }
  })
  it('allows a real full barre while keeping all seventh-chord tones', () => {
    const f = generateVoicings('F', guitar, { maxFret: 3, maxSpan: 2 })
    expect(f.some((v) => v.frets.join(',') === '1,3,3,2,1,1')).toBe(true)
    const tetrads = generateVoicings('Cmaj7', guitar)
    expect(tetrads.length).toBeGreaterThan(0)
    expect(
      tetrads.every((v) => chromas(v.notes).join() === chromas(['C', 'E', 'G', 'B']).join()),
    ).toBe(true)
    // Four bass strings cannot advertise five distinct required pitches.
    expect(
      generateVoicings(
        'C9',
        PRESET_TUNINGS.find((t) => t.id === 'bass4-standard')!,
      ),
    ).toEqual([])
    // Every sounding string here has a distinct, required fretted pitch: five
    // separate fingers are impossible even when all required pitches fit the allowed span.
    const artificial = {
      id: 'test',
      name: 'Test',
      instrument: 'bass5' as const,
      notes: ['C3', 'C3', 'C3', 'C3', 'C3'],
    }
    const impossible = generateVoicings('Cmaj9', artificial, {
      minFret: 1,
      maxFret: 12,
      maxSpan: 10,
    })
    expect(impossible).toEqual([])
  })
  it('supports the fully open instrument at a zero maximum fret', () => {
    const open = PRESET_TUNINGS.find((t) => t.id === 'guitar-open-g')!
    expect(
      generateVoicings('G', open, { maxFret: 0 }).some((v) => v.frets.every((f) => f === 0)),
    ).toBe(true)
  })
})
describe('scales, intervals and harmony', () => {
  it('retains directed compound intervals and enharmonic spelling', () => {
    expect(describeInterval('C4', 'D5')).toMatchObject({
      symbol: '9M',
      semitones: 14,
      direction: 'Ascendente',
    })
    expect(describeInterval('C4', 'B3')).toMatchObject({
      symbol: '-2m',
      semitones: -1,
      direction: 'Descendente',
    })
    expect(describeInterval('C4', 'F#4').symbol).toBe('4A')
    expect(describeInterval('C4', 'Gb4').symbol).toBe('5d')
    expect(describeInterval('bad', 'C').symbol).toBe('')
  })
  it('returns spelled scales and compatible bounded suggestions', () => {
    expect(getScale('F', 'major').notes).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E'])
    expect(getScale('invalid', 'major').notes).toEqual([])
    const scales = compatibleScales(['C', 'E', 'G'])
    expect(scales.length).toBeLessThanOrEqual(48)
    expect(
      scales.every((s) => chromas(['C', 'E', 'G']).every((p) => chromas(s.notes).includes(p))),
    ).toBe(true)
    expect(compatibleScales(['oops'])).toEqual([])
    expect(romanNumeral('Am', 'C')).toBe('vi')
    expect(romanNumeral('G7', 'C')).toBe('V7')
    expect(suggestHarmony('C', 'G7').some((s) => s.chord === 'C' && s.kind === 'resolution')).toBe(
      true,
    )
    expect(
      suggestHarmony('C').some(
        (s) => s.chord === 'D7' && s.reason.includes('Dominante secundaria'),
      ),
    ).toBe(true)
    expect(
      suggestHarmony('C').some((s) => s.chord === 'Fm' && s.reason.includes('Préstamo modal')),
    ).toBe(true)
    expect(suggestHarmony('invalid')).toEqual([])
  })
})

describe('minor key harmony', () => {
  it('uses natural minor degrees and preserves chord qualities and extensions', () => {
    const chords = ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']
    expect(chords.map((chord) => romanNumeral(chord, 'A', 'minor'))).toEqual([
      'i',
      'ii°',
      'III',
      'iv',
      'v',
      'VI',
      'VII',
    ])
    expect(romanNumeral('E7', 'A', 'minor')).toBe('V7')
    expect(romanNumeral('G#dim', 'A', 'minor')).toBe('♯vii°')
    expect(romanNumeral('Bm7b5', 'A', 'minor')).toBe('iiø7')
    expect(romanNumeral('Cm', 'C', 'minor')).toBe('i')
    expect(romanNumeral('Eb', 'C', 'minor')).toBe('III')
    expect(romanNumeral('Am', 'C')).toBe(romanNumeral('Am', 'C', 'major'))
  })
  it('separates natural minor, harmonic minor dominants and parallel major borrowing', () => {
    const suggestions = suggestHarmony('A', undefined, 'minor')
    expect(suggestions.filter((s) => s.kind === 'diatonic').map((s) => s.chord)).toEqual([
      'Am',
      'Bdim',
      'C',
      'Dm',
      'Em',
      'F',
      'G',
    ])
    for (const chord of ['E', 'E7']) {
      expect(suggestions.find((s) => s.chord === chord)).toMatchObject({ kind: 'tension' })
      expect(suggestions.find((s) => s.chord === chord)?.reason).toMatch(/armónica.*G#/)
    }
    const borrowed = suggestions.filter((s) => s.reason.includes('Préstamo modal'))
    expect(borrowed.map((s) => s.chord)).toEqual(['A', 'D', 'F#m'])
    expect(borrowed.every((s) => s.reason.includes('mayor paralela'))).toBe(true)
    const secondary = suggestions.filter((s) => s.reason.includes('Dominante secundaria'))
    expect(secondary.map((s) => s.chord)).toEqual(['G7', 'A7', 'B7', 'C7', 'D7'])
    expect(secondary.every((s) => !s.reason.includes('Bdim'))).toBe(true)
    expect(suggestHarmony('C')).toEqual(suggestHarmony('C', undefined, 'major'))
  })
  it('recognizes actual dominant resolutions without calling every fifth a resolution', () => {
    for (const chord of ['E', 'E7', 'E7/G#'])
      expect(suggestHarmony('A', chord, 'minor').find((s) => s.chord === 'Am')?.kind).toBe(
        'resolution',
      )
    for (const chord of ['Em', 'Emaj7', 'Bdim'])
      expect(suggestHarmony('A', chord, 'minor').some((s) => s.kind === 'resolution')).toBe(false)
    expect(
      suggestHarmony('C', undefined, 'minor')
        .slice(0, 7)
        .map((s) => s.chord),
    ).toEqual(['Cm', 'Ddim', 'Eb', 'Fm', 'Gm', 'Ab', 'Bb'])
    expect(suggestHarmony('invalid', undefined, 'minor')).toEqual([])
  })
})
