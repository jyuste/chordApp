import { describe, expect, it } from 'vitest'
import { Note } from 'tonal'
import {
  CHORD_FAMILIES,
  CHORD_TYPES,
  CIRCLE_KEYS,
  keyChords,
  keySignature,
} from '../src/lib/reference'
import { chordInfo, getScale } from '../src/lib/music'

const chromas = (notes: string[]) => notes.map((note) => Note.chroma(note)).sort()
describe('musical reference', () => {
  it('includes a usable, varied chord catalogue for every tonic', () => {
    expect(CHORD_TYPES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(CHORD_TYPES.map((type) => type.suffix)).size).toBe(CHORD_TYPES.length)
    for (const type of CHORD_TYPES) {
      expect(CHORD_FAMILIES.some((family) => family.id === type.family)).toBe(true)
      for (const root of ['C', 'F#', 'Bb'])
        expect(chordInfo(root + type.suffix).notes.length).toBeGreaterThan(1)
    }
  })
  it('spells the twelve relative major and minor keys in clockwise fifth order', () => {
    expect(CIRCLE_KEYS).toHaveLength(12)
    expect(CIRCLE_KEYS.map((key) => key.major)).toEqual([
      'C',
      'G',
      'D',
      'A',
      'E',
      'B',
      'F#',
      'Db',
      'Ab',
      'Eb',
      'Bb',
      'F',
    ])
    expect(CIRCLE_KEYS.map((key) => key.minor)).toEqual([
      'A',
      'E',
      'B',
      'F#',
      'C#',
      'G#',
      'D#',
      'Bb',
      'F',
      'C',
      'G',
      'D',
    ])
    CIRCLE_KEYS.forEach((key, index) => {
      expect(
        (Note.chroma(key.major)! - Note.chroma(CIRCLE_KEYS[(index + 11) % 12]!.major)! + 12) % 12,
      ).toBe(7)
      expect(chromas(getScale(key.major, 'major').notes)).toEqual(
        chromas(getScale(key.minor, 'minor').notes),
      )
      const signature = keySignature(key.accidentals)
      expect(
        getScale(key.major, 'major')
          .notes.filter((note) => /[#b]/.test(note))
          .sort(),
      ).toEqual([...signature].sort())
      if (key.alternate) {
        expect(chromas(getScale(key.alternate.major, 'major').notes)).toEqual(
          chromas(getScale(key.major, 'major').notes),
        )
        expect(chromas(getScale(key.alternate.minor, 'minor').notes)).toEqual(
          chromas(getScale(key.minor, 'minor').notes),
        )
      }
    })
  })
  it('preserves all written accidentals, including E#, B#, Cb and Fb', () => {
    expect(keySignature(0)).toEqual([])
    expect(keySignature(6)).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#'])
    expect(keySignature(7)).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'])
    expect(keySignature(-7)).toEqual(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'])
    for (const value of [8, -8, 1.5, NaN, Infinity])
      expect(() => keySignature(value)).toThrow(RangeError)
  })
  it('builds major and natural minor diatonic chords with their degrees', () => {
    expect(keyChords('A', 'minor')).toEqual([
      { name: 'Am', degree: 'i' },
      { name: 'Bdim', degree: 'ii°' },
      { name: 'C', degree: 'III' },
      { name: 'Dm', degree: 'iv' },
      { name: 'Em', degree: 'v' },
      { name: 'F', degree: 'VI' },
      { name: 'G', degree: 'VII' },
    ])
    expect(keyChords('C', 'major').map((chord) => chord.name)).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
      'Bdim',
    ])
    expect(keyChords('Cb', 'major').map((chord) => chord.name)).toEqual([
      'Cb',
      'Dbm',
      'Ebm',
      'Fb',
      'Gb',
      'Abm',
      'Bbdim',
    ])
    expect(keyChords('A#', 'minor').map((chord) => chord.name)).toEqual([
      'A#m',
      'B#dim',
      'C#',
      'D#m',
      'E#m',
      'F#',
      'G#',
    ])
    expect(keyChords('invalid', 'major')).toEqual([])
  })
})
