export type KeyMode = 'major' | 'minor'
export type Instrument = 'guitar' | 'bass4' | 'bass5'
export interface Tuning {
  id: string
  name: string
  instrument: Instrument
  notes: string[]
  custom?: boolean
}
export interface InstrumentContext {
  instrument: Instrument
  tuning: Tuning
  frets: number
  capo: number
  leftHanded: boolean
}
export interface Settings extends InstrumentContext {
  theme: 'system' | 'light' | 'dark'
  solfege: boolean
}
export interface ChordMatch {
  name: string
  notes: string[]
  intervals: string[]
  exact: boolean
  missing?: string[]
}
export interface Voicing {
  frets: (number | null)[]
  notes: string[]
  score: number
}
export interface ScaleInfo {
  name: string
  notes: string[]
  intervals: string[]
}
export interface IntervalInfo {
  name: string
  semitones: number
  direction: string
  symbol: string
  explanation: string
}
export interface Suggestion {
  chord: string
  reason: string
  kind: 'diatonic' | 'tension' | 'resolution'
}
export interface ProgressionStep {
  id: string
  chord: string
  beats: number
  voicing?: (number | null)[]
}
export interface Progression {
  id: string
  name: string
  key: string
  mode?: KeyMode
  tempo: number
  steps: ProgressionStep[]
  context: InstrumentContext
  updatedAt: string
}
export interface Favorite {
  id: string
  name: string
  kind: 'chord' | 'scale' | 'position'
  notes?: string[]
  context: InstrumentContext
  frets?: (number | null)[]
  updatedAt: string
}
export interface Backup {
  version: 1
  exportedAt: string
  tunings: Tuning[]
  favorites: Favorite[]
  progressions: Progression[]
  settings?: Settings
}
