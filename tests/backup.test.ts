import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parseBackup } from '../src/lib/backup'
import { useAppStore } from '../src/stores/app'
import type { Backup } from '../src/lib/types'
const tuning = {
  id: 'test-tuning',
  name: 'Mi afinación',
  instrument: 'guitar' as const,
  notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  custom: true,
}
const backup = (): Backup => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  tunings: [structuredClone(tuning)],
  favorites: [],
  progressions: [],
})
describe('validación de copias', () => {
  it('acepta un archivo completo y permite omitir ajustes', () => {
    expect(parseBackup(JSON.stringify(backup())).tunings).toHaveLength(1)
  })
  it.each([
    (b: any) => {
      b.version = 2
    },
    (b: any) => {
      b.tunings[0].notes[0] = 'banana'
    },
    (b: any) => {
      b.tunings[0].notes.pop()
    },
    (b: any) => {
      b.tunings.push(b.tunings[0])
    },
    (b: any) => {
      b.unknown = true
    },
    (b: any) => {
      b.exportedAt = 'ayer'
    },
  ])('rechaza datos corruptos con un mensaje útil', (mutate) => {
    const b = backup()
    mutate(b)
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/Copia no válida/)
  })
  it('rechaza posiciones y tempo fuera de rango', () => {
    setActivePinia(createPinia())
    const store = useAppStore()
    const b = backup()
    b.progressions = [
      {
        id: 'p1',
        name: 'Prueba',
        key: 'C',
        tempo: 0,
        context: store.settings,
        updatedAt: new Date().toISOString(),
        steps: [],
      },
    ]
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/tempo/)
    b.progressions[0]!.tempo = 120
    b.progressions[0]!.context = { ...store.settings }
    delete (b.progressions[0]!.context as any).theme
    delete (b.progressions[0]!.context as any).solfege
    b.progressions[0]!.steps = [{ id: 's1', chord: 'C', beats: 4, voicing: [99, 0, 0, 0, 0, 0] }]
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/voicing/)
  })
})
describe('persistencia y fusión', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('guarda objetos reactivos y los recupera tras abrir otra tienda', async () => {
    const first = useAppStore()
    await first.init()
    first.settings.theme = 'dark'
    await first.saveSettings()
    await first.saveTuning(tuning)
    setActivePinia(createPinia())
    const second = useAppStore()
    await second.init()
    expect(second.settings.theme).toBe('dark')
    expect(second.customTunings.some((t) => t.id === tuning.id)).toBe(true)
  })
  it('omite idénticos, conserva conflictos y aplica ajustes solo si existen', async () => {
    const store = useAppStore()
    await store.init()
    await store.saveTuning(tuning)
    expect(await store.importBackup(backup())).toEqual({ added: 0, conflicts: 0 })
    const changed = backup()
    changed.tunings[0]!.name = 'Cambio importado'
    expect(await store.importBackup(changed)).toEqual({ added: 1, conflicts: 1 })
    expect(store.customTunings.find((t) => t.id === tuning.id)?.name).toBe('Mi afinación')
    expect(
      store.customTunings.some((t) => t.name === 'Cambio importado (copia)' && t.id !== tuning.id),
    ).toBe(true)
    const theme = store.settings.theme
    await store.importBackup(backup())
    expect(store.settings.theme).toBe(theme)
    const withSettings = backup()
    withSettings.settings = { ...store.settings, theme: 'light' }
    await store.importBackup(withSettings)
    expect(store.settings.theme).toBe('light')
    const exported = store.exportBackup()
    exported.settings!.theme = 'dark'
    expect(store.settings.theme).toBe('light')
  })
})

it('rechaza posiciones fuera del mástil disponible con cejilla y una cejilla que agota el mástil', () => {
  setActivePinia(createPinia())
  const store = useAppStore()
  const b = backup()
  const { instrument, tuning, frets, leftHanded } = store.settings
  b.favorites = [
    {
      id: 'f-capo',
      name: 'E',
      kind: 'position',
      context: { instrument, tuning, frets, leftHanded, capo: 12 },
      frets: [11, null, null, null, null, null],
      updatedAt: new Date().toISOString(),
    },
  ]
  expect(() => parseBackup(JSON.stringify(b))).toThrow(/frets/)
  b.favorites[0]!.frets![0] = 10
  expect(parseBackup(JSON.stringify(b)).favorites).toHaveLength(1)
  b.favorites[0]!.context.frets = 12
  expect(() => parseBackup(JSON.stringify(b))).toThrow(/capo/)
})

describe('modo tonal de las progresiones', () => {
  beforeEach(() => setActivePinia(createPinia()))
  const progression = () => {
    const { instrument, tuning, frets, capo, leftHanded } = useAppStore().settings
    return {
      id: 'p-minor',
      name: 'La menor',
      key: 'A',
      tempo: 120,
      context: { instrument, tuning, frets, capo, leftHanded },
      updatedAt: new Date().toISOString(),
      steps: [{ id: 's-minor', chord: 'Am', beats: 4 }],
    }
  }
  it('admite modos mayor y menor y mantiene las copias antiguas sin mutarlas', () => {
    const b = backup()
    b.progressions = [progression()]
    expect(parseBackup(JSON.stringify(b)).progressions[0]).not.toHaveProperty('mode')
    for (const mode of ['major', 'minor'] as const) {
      b.progressions[0]!.mode = mode
      const parsed = parseBackup(JSON.stringify(b))
      expect(parsed.version).toBe(1)
      expect(parsed.progressions[0]!.mode).toBe(mode)
    }
  })
  it.each(['dorian', '', null, 1, true])('rechaza un modo desconocido: %s', (mode) => {
    const b = backup()
    b.progressions = [progression()]
    Object.assign(b.progressions[0]!, { mode })
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/mode/)
  })
  it('conserva el modo menor al guardar, recuperar, exportar e importar', async () => {
    const first = useAppStore()
    await first.init()
    await first.saveProgression({ ...progression(), mode: 'minor' })
    setActivePinia(createPinia())
    const second = useAppStore()
    await second.init()
    expect(second.progressions.find((p) => p.id === 'p-minor')?.mode).toBe('minor')
    const exported = parseBackup(JSON.stringify(second.exportBackup()))
    const saved = exported.progressions.find((p) => p.id === 'p-minor')!
    expect(saved.mode).toBe('minor')
    saved.id = 'p-minor-import'
    await second.importBackup(exported)
    expect(second.progressions.find((p) => p.id === 'p-minor-import')?.mode).toBe('minor')
  })
})
