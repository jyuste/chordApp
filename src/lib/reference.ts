import { getScale, romanNumeral } from './music'
import type { KeyMode } from './types'

export const CHORD_FAMILIES = [
  { id: 'triads', name: 'Tríadas' },
  { id: 'suspended', name: 'Suspendidos' },
  { id: 'sixths', name: 'Sextas y añadidas' },
  { id: 'sevenths', name: 'Séptimas' },
  { id: 'extensions', name: 'Extensiones' },
  { id: 'altered', name: 'Alterados' },
]
export const CHORD_TYPES: { suffix: string; label: string; family: string; description: string }[] =
  [
    {
      suffix: '',
      label: 'Mayor',
      family: 'triads',
      description: 'Fundamental, tercera mayor y quinta justa.',
    },
    {
      suffix: 'm',
      label: 'Menor',
      family: 'triads',
      description: 'La tercera menor aporta el carácter menor.',
    },
    {
      suffix: 'dim',
      label: 'Disminuido',
      family: 'triads',
      description: 'Tercera menor y quinta disminuida: una tríada de tensión.',
    },
    {
      suffix: 'aug',
      label: 'Aumentado',
      family: 'triads',
      description: 'Tercera mayor y quinta aumentada.',
    },
    {
      suffix: '5',
      label: 'Quinta',
      family: 'triads',
      description: 'Fundamental y quinta, sin tercera que defina mayor o menor.',
    },
    {
      suffix: 'sus2',
      label: 'Segunda suspendida',
      family: 'suspended',
      description: 'La segunda mayor sustituye a la tercera.',
    },
    {
      suffix: 'sus4',
      label: 'Cuarta suspendida',
      family: 'suspended',
      description: 'La cuarta justa sustituye a la tercera.',
    },
    {
      suffix: '7sus4',
      label: 'Séptima suspendida',
      family: 'suspended',
      description: 'Cuarta suspendida y séptima menor, sin tercera.',
    },
    {
      suffix: '6',
      label: 'Sexta mayor',
      family: 'sixths',
      description: 'Tríada mayor con sexta mayor añadida.',
    },
    {
      suffix: 'm6',
      label: 'Sexta menor',
      family: 'sixths',
      description: 'Tríada menor con sexta mayor añadida.',
    },
    {
      suffix: '6/9',
      label: 'Sexta y novena',
      family: 'sixths',
      description: 'Tríada mayor con sexta y novena mayores, sin séptima.',
    },
    {
      suffix: 'add9',
      label: 'Novena añadida',
      family: 'sixths',
      description: 'Tríada mayor con novena mayor, sin séptima.',
    },
    {
      suffix: 'madd9',
      label: 'Menor con novena',
      family: 'sixths',
      description: 'Tríada menor con novena mayor añadida, sin séptima.',
    },
    {
      suffix: '7',
      label: 'Séptima dominante',
      family: 'sevenths',
      description: 'Tríada mayor con séptima menor. Puede actuar como dominante.',
    },
    {
      suffix: 'maj7',
      label: 'Séptima mayor',
      family: 'sevenths',
      description: 'Tríada mayor con séptima mayor.',
    },
    {
      suffix: 'm7',
      label: 'Séptima menor',
      family: 'sevenths',
      description: 'Tríada menor con séptima menor.',
    },
    {
      suffix: 'mMaj7',
      label: 'Menor con séptima mayor',
      family: 'sevenths',
      description: 'Combina tercera menor y séptima mayor.',
    },
    {
      suffix: 'dim7',
      label: 'Séptima disminuida',
      family: 'sevenths',
      description: 'Tríada disminuida con séptima disminuida.',
    },
    {
      suffix: 'm7b5',
      label: 'Semidisminuido',
      family: 'sevenths',
      description: 'Tríada disminuida con séptima menor.',
    },
    {
      suffix: '9',
      label: 'Novena dominante',
      family: 'extensions',
      description: 'Séptima dominante con novena mayor.',
    },
    {
      suffix: 'maj9',
      label: 'Novena mayor',
      family: 'extensions',
      description: 'Séptima mayor y novena mayor sobre una tríada mayor.',
    },
    {
      suffix: 'm9',
      label: 'Novena menor',
      family: 'extensions',
      description: 'Acorde menor con séptima menor y novena mayor.',
    },
    {
      suffix: '11',
      label: 'Undécima dominante',
      family: 'extensions',
      description: 'Extensión de la dominante hasta la undécima justa.',
    },
    {
      suffix: 'm11',
      label: 'Undécima menor',
      family: 'extensions',
      description: 'Acorde menor con séptima, novena y undécima.',
    },
    {
      suffix: '13',
      label: 'Trecena dominante',
      family: 'extensions',
      description: 'Dominante con trecena mayor; la fórmula muestra sus notas concretas.',
    },
    {
      suffix: 'maj13',
      label: 'Trecena mayor',
      family: 'extensions',
      description: 'Séptima mayor y trecena mayor con extensiones.',
    },
    {
      suffix: 'm13',
      label: 'Trecena menor',
      family: 'extensions',
      description: 'Acorde menor con séptima menor y trecena mayor.',
    },
    {
      suffix: '7b9',
      label: 'Dominante con novena bemol',
      family: 'altered',
      description: 'Séptima dominante con novena rebajada un semitono.',
    },
    {
      suffix: '7#9',
      label: 'Dominante con novena sostenida',
      family: 'altered',
      description: 'Séptima dominante con novena elevada un semitono.',
    },
    {
      suffix: '7b5',
      label: 'Dominante con quinta bemol',
      family: 'altered',
      description: 'La quinta disminuida sustituye a la quinta justa.',
    },
    {
      suffix: '7#5',
      label: 'Dominante con quinta sostenida',
      family: 'altered',
      description: 'La quinta aumentada sustituye a la quinta justa.',
    },
    {
      suffix: '7#11',
      label: 'Dominante con undécima sostenida',
      family: 'altered',
      description: 'Añade una undécima aumentada a la dominante.',
    },
    {
      suffix: '7b13',
      label: 'Dominante con trecena bemol',
      family: 'altered',
      description: 'Añade una trecena menor a la dominante.',
    },
    {
      suffix: 'maj7#11',
      label: 'Séptima mayor con undécima sostenida',
      family: 'altered',
      description: 'Séptima mayor con undécima aumentada, un color lidio.',
    },
  ]

export interface CircleKey {
  major: string
  /** Tonic only, without the minor chord suffix. */
  minor: string
  accidentals: number
  kind: 'sharp' | 'flat' | 'natural'
  alternate?: { major: string; minor: string; accidentals: number; kind: 'sharp' | 'flat' }
}
export const CIRCLE_KEYS: CircleKey[] = [
  { major: 'C', minor: 'A', accidentals: 0, kind: 'natural' },
  { major: 'G', minor: 'E', accidentals: 1, kind: 'sharp' },
  { major: 'D', minor: 'B', accidentals: 2, kind: 'sharp' },
  { major: 'A', minor: 'F#', accidentals: 3, kind: 'sharp' },
  { major: 'E', minor: 'C#', accidentals: 4, kind: 'sharp' },
  {
    major: 'B',
    minor: 'G#',
    accidentals: 5,
    kind: 'sharp',
    alternate: { major: 'Cb', minor: 'Ab', accidentals: -7, kind: 'flat' },
  },
  {
    major: 'F#',
    minor: 'D#',
    accidentals: 6,
    kind: 'sharp',
    alternate: { major: 'Gb', minor: 'Eb', accidentals: -6, kind: 'flat' },
  },
  {
    major: 'Db',
    minor: 'Bb',
    accidentals: -5,
    kind: 'flat',
    alternate: { major: 'C#', minor: 'A#', accidentals: 7, kind: 'sharp' },
  },
  { major: 'Ab', minor: 'F', accidentals: -4, kind: 'flat' },
  { major: 'Eb', minor: 'C', accidentals: -3, kind: 'flat' },
  { major: 'Bb', minor: 'G', accidentals: -2, kind: 'flat' },
  { major: 'F', minor: 'D', accidentals: -1, kind: 'flat' },
]

export function keySignature(accidentals: number): string[] {
  if (!Number.isInteger(accidentals) || Math.abs(accidentals) > 7)
    throw new RangeError('La armadura debe tener entre siete bemoles y siete sostenidos.')
  const order =
    accidentals < 0
      ? ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']
      : ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']
  return order.slice(0, Math.abs(accidentals))
}

export function keyChords(root: string, mode: KeyMode): { name: string; degree: string }[] {
  const qualities =
    mode === 'minor' ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim']
  return getScale(root, mode).notes.map((note, index) => {
    const name = note + qualities[index]
    return { name, degree: romanNumeral(name, root, mode) }
  })
}
