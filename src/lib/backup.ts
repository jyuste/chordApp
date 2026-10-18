import { Note } from 'tonal'
import type { Backup, Favorite, InstrumentContext, Progression, Settings, Tuning } from './types'

type RecordValue = Record<string, unknown>
function fail(path: string, reason: string): never {
  throw new Error(`Copia no válida: ${path} ${reason}. Revisa el archivo y vuelve a importarlo.`)
}
function object(value: unknown, path: string, allowed: string[]): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'debe ser un objeto')
  const item = value as RecordValue
  for (const key of Object.keys(item))
    if (!allowed.includes(key)) fail(`${path}.${key}`, 'es un campo desconocido')
  return item
}
function string(value: unknown, path: string, max = 160): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(path, `debe ser un texto de 1 a ${max} caracteres`)
}
function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
  integer = true,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    fail(path, `debe ser ${integer ? 'un entero' : 'un número'} entre ${min} y ${max}`)
}
function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') fail(path, 'debe ser verdadero o falso')
}
function date(value: unknown, path: string) {
  string(value, path, 40)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))
    fail(path, 'debe ser una fecha ISO válida')
}
function array(value: unknown, path: string, max = 5000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    fail(path, `debe ser una lista de hasta ${max} elementos`)
  return value
}
function instrument(value: unknown, path: string) {
  if (!['guitar', 'bass4', 'bass5'].includes(value as string))
    fail(path, 'debe ser guitar, bass4 o bass5')
}
function tuning(value: unknown, path: string) {
  const t = object(value, path, ['id', 'name', 'instrument', 'notes', 'custom'])
  string(t.id, `${path}.id`)
  string(t.name, `${path}.name`)
  instrument(t.instrument, `${path}.instrument`)
  const notes = array(t.notes, `${path}.notes`, 6)
  if (notes.length !== (t.instrument === 'guitar' ? 6 : t.instrument === 'bass4' ? 4 : 5))
    fail(`${path}.notes`, 'no tiene el número de cuerdas del instrumento')
  notes.forEach((note, index) => {
    const p = `${path}.notes[${index}]`
    string(note, p, 8)
    const midi = Note.midi(note)
    if (!/^[A-G](?:#{1,2}|b{1,2})?\d$/.test(note) || midi === null || midi < 12 || midi > 108)
      fail(p, 'debe ser una nota con octava entre C0 y C8 (por ejemplo, E2)')
  })
  if (t.custom !== undefined) boolean(t.custom, `${path}.custom`)
}
function context(value: unknown, path: string, settings = false) {
  const c = object(value, path, [
    'instrument',
    'tuning',
    'frets',
    'capo',
    'leftHanded',
    ...(settings ? ['theme', 'solfege'] : []),
  ])
  instrument(c.instrument, `${path}.instrument`)
  tuning(c.tuning, `${path}.tuning`)
  if ((c.tuning as RecordValue).instrument !== c.instrument)
    fail(`${path}.tuning`, 'debe corresponder al instrumento')
  number(c.frets, `${path}.frets`, 12, 36)
  number(c.capo, `${path}.capo`, 0, Math.min(12, c.frets - 1))
  boolean(c.leftHanded, `${path}.leftHanded`)
  if (settings) {
    if (!['system', 'light', 'dark'].includes(c.theme as string))
      fail(`${path}.theme`, 'debe ser system, light o dark')
    boolean(c.solfege, `${path}.solfege`)
  }
}
function frets(value: unknown, path: string, ctx: InstrumentContext) {
  const values = array(value, path, 6)
  if (values.length !== ctx.tuning.notes.length) fail(path, 'debe tener una posición por cuerda')
  values.forEach((f, i) => {
    if (f !== null) number(f, `${path}[${i}]`, 0, ctx.frets - ctx.capo)
  })
}
function favorite(value: unknown, path: string) {
  const f = object(value, path, ['id', 'name', 'kind', 'notes', 'context', 'frets', 'updatedAt'])
  string(f.id, `${path}.id`)
  string(f.name, `${path}.name`)
  date(f.updatedAt, `${path}.updatedAt`)
  if (!['chord', 'scale', 'position'].includes(f.kind as string))
    fail(`${path}.kind`, 'debe ser chord, scale o position')
  context(f.context, `${path}.context`)
  if (f.notes !== undefined) {
    const notes = array(f.notes, `${path}.notes`, 25)
    if (!notes.length) fail(`${path}.notes`, 'debe contener al menos una nota')
    notes.forEach((note, index) => {
      string(note, `${path}.notes[${index}]`, 8)
      if (!/^[A-G](?:#{1,2}|b{1,2})?\d$/.test(note) || Note.midi(note) === null)
        fail(`${path}.notes[${index}]`, 'debe ser una nota con octava, por ejemplo C4')
    })
  }
  if (f.frets !== undefined) frets(f.frets, `${path}.frets`, f.context as InstrumentContext)
}
function progression(value: unknown, path: string) {
  const p = object(value, path, [
    'id',
    'name',
    'key',
    'mode',
    'tempo',
    'steps',
    'context',
    'updatedAt',
  ])
  string(p.id, `${path}.id`)
  string(p.name, `${path}.name`)
  string(p.key, `${path}.key`, 24)
  if (p.mode !== undefined && p.mode !== 'major' && p.mode !== 'minor')
    fail(`${path}.mode`, 'debe ser major o minor')
  number(p.tempo, `${path}.tempo`, 30, 300)
  date(p.updatedAt, `${path}.updatedAt`)
  context(p.context, `${path}.context`)
  const ids = new Set<string>()
  array(p.steps, `${path}.steps`, 256).forEach((value, index) => {
    const pathStep = `${path}.steps[${index}]`
    const s = object(value, pathStep, ['id', 'chord', 'beats', 'voicing'])
    string(s.id, `${pathStep}.id`)
    if (ids.has(s.id)) fail(`${pathStep}.id`, 'está repetido')
    ids.add(s.id)
    string(s.chord, `${pathStep}.chord`, 80)
    number(s.beats, `${pathStep}.beats`, 0.25, 16, false)
    if (s.voicing !== undefined)
      frets(s.voicing, `${pathStep}.voicing`, p.context as InstrumentContext)
  })
}
export function parseBackup(text: string): Backup {
  if (text.length > 10_000_000) fail('el archivo', 'supera el límite de 10 MB')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    fail('el archivo', 'no contiene JSON válido')
  }
  const b = object(value, 'la copia', [
    'version',
    'exportedAt',
    'tunings',
    'favorites',
    'progressions',
    'settings',
  ])
  if (b.version !== 1)
    fail('version', 'debe ser 1; esta versión de la aplicación no puede leer otras versiones')
  date(b.exportedAt, 'exportedAt')
  for (const [field, validate] of [
    ['tunings', tuning],
    ['favorites', favorite],
    ['progressions', progression],
  ] as const) {
    const ids = new Set<string>()
    array(b[field], field).forEach((item, index) => {
      validate(item, `${field}[${index}]`)
      const id = (item as RecordValue).id as string
      if (ids.has(id)) fail(`${field}[${index}].id`, 'está repetido en el archivo')
      ids.add(id)
    })
  }
  if (b.settings !== undefined) context(b.settings, 'settings', true)
  return b as unknown as Backup
}
export function validateTuning(value: Tuning) {
  tuning(value, 'afinación')
}
export function validateFavorite(value: Favorite) {
  favorite(value, 'favorito')
}
export function validateProgression(value: Progression) {
  progression(value, 'progresión')
}
export function validateSettings(value: Settings) {
  context(value, 'ajustes', true)
}
