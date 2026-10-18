import Dexie, { type Table } from 'dexie'
import { defineStore } from 'pinia'
import { PRESET_TUNINGS } from '../lib/music'
import {
  parseBackup,
  validateFavorite,
  validateProgression,
  validateSettings,
  validateTuning,
} from '../lib/backup'
import type { Backup, Favorite, Progression, Settings, Tuning } from '../lib/types'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
class LibraryDatabase extends Dexie {
  settings!: Table<{ id: string; value: Settings }, string>
  tunings!: Table<Tuning, string>
  favorites!: Table<Favorite, string>
  progressions!: Table<Progression, string>
  constructor() {
    super('entrecuerdas')
    this.version(1).stores({
      settings: 'id',
      tunings: 'id,instrument',
      favorites: 'id,kind,updatedAt',
      progressions: 'id,updatedAt',
    })
    this.version(2)
      .stores({
        settings: 'id',
        tunings: 'id,instrument',
        favorites: 'id,kind,updatedAt',
        progressions: 'id,updatedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tunings')
          .toCollection()
          .modify((t) => {
            t.custom = true
          })
      })
  }
}
const db = new LibraryDatabase()
const defaultSettings = (): Settings => ({
  instrument: 'guitar',
  tuning: {
    id: 'guitar-standard',
    name: 'Estándar',
    instrument: 'guitar',
    notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  frets: 22,
  capo: 0,
  leftHanded: false,
  theme: 'system',
  solfege: false,
})
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${stable(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
export const useAppStore = defineStore('app', {
  state: () => ({
    settings: defaultSettings(),
    customTunings: [] as Tuning[],
    favorites: [] as Favorite[],
    progressions: [] as Progression[],
    ready: false,
    error: '',
  }),
  getters: { tunings: (state) => [...PRESET_TUNINGS, ...state.customTunings] },
  actions: {
    async init() {
      if (this.ready) return
      try {
        const [saved, tunings, favorites, progressions] = await Promise.all([
          db.settings.get('main'),
          db.tunings.toArray(),
          db.favorites.toArray(),
          db.progressions.toArray(),
        ])
        if (saved) {
          validateSettings(saved.value)
          this.settings = saved.value
        }
        this.customTunings = tunings
        this.favorites = favorites
        this.progressions = progressions
        this.error = ''
      } catch {
        this.error =
          'No se pudo abrir la biblioteca local. Comprueba que el navegador permita guardar datos y recarga la aplicación.'
      } finally {
        this.ready = true
      }
    },
    async saveSettings() {
      const value = clone(this.settings)
      validateSettings(value)
      await db.settings.put({ id: 'main', value })
    },
    async saveTuning(tuning: Tuning) {
      const value = { ...clone(tuning), custom: true }
      validateTuning(value)
      if (PRESET_TUNINGS.some((t) => t.id === value.id))
        throw new Error(
          'Elige otro identificador para tu afinación: este pertenece a una afinación incluida.',
        )
      const settings =
        this.settings.tuning.id === value.id
          ? { ...clone(this.settings), tuning: value }
          : undefined
      await db.transaction('rw', [db.tunings, db.settings], async () => {
        await db.tunings.put(value)
        if (settings) await db.settings.put({ id: 'main', value: settings })
      })
      this.customTunings = [...this.customTunings.filter((t) => t.id !== value.id), value]
      if (settings) this.settings = settings
    },
    async deleteTuning(id: string) {
      const fallback = PRESET_TUNINGS.find((t) => t.instrument === this.settings.instrument)
      const settings =
        this.settings.tuning.id === id && fallback
          ? { ...clone(this.settings), tuning: clone(fallback) }
          : undefined
      await db.transaction('rw', [db.tunings, db.settings], async () => {
        await db.tunings.delete(id)
        if (settings) await db.settings.put({ id: 'main', value: settings })
      })
      this.customTunings = this.customTunings.filter((t) => t.id !== id)
      if (settings) this.settings = settings
    },
    async saveFavorite(favorite: Favorite) {
      const value = clone(favorite)
      validateFavorite(value)
      await db.favorites.put(value)
      this.favorites = [...this.favorites.filter((f) => f.id !== value.id), value]
    },
    async deleteFavorite(id: string) {
      await db.favorites.delete(id)
      this.favorites = this.favorites.filter((f) => f.id !== id)
    },
    async saveProgression(progression: Progression) {
      const value = clone(progression)
      validateProgression(value)
      await db.progressions.put(value)
      this.progressions = [...this.progressions.filter((p) => p.id !== value.id), value]
    },
    async deleteProgression(id: string) {
      await db.progressions.delete(id)
      this.progressions = this.progressions.filter((p) => p.id !== id)
    },
    exportBackup(): Backup {
      return clone({
        version: 1,
        exportedAt: new Date().toISOString(),
        tunings: this.customTunings,
        favorites: this.favorites,
        progressions: this.progressions,
        settings: this.settings,
      })
    },
    async importBackup(input: Backup): Promise<{ added: number; conflicts: number }> {
      const backup = parseBackup(JSON.stringify(input))
      let added = 0
      let conflicts = 0
      function merge<T extends { id: string; name: string }>(
        existing: T[],
        incoming: T[],
        reserved: T[] = [],
      ) {
        const result = clone(existing)
        const known = new Map([...reserved, ...result].map((item) => [item.id, item]))
        for (const item of incoming) {
          const current = known.get(item.id)
          if (current && stable(current) === stable(item)) continue
          const next = clone(item)
          if (current) {
            next.id = crypto.randomUUID()
            next.name = `${next.name.slice(0, 150)} (copia)`
            conflicts++
          }
          result.push(next)
          known.set(next.id, next)
          added++
        }
        return result
      }
      const tunings = merge(
        this.customTunings,
        backup.tunings.map((t) => ({ ...t, custom: true })),
        PRESET_TUNINGS,
      )
      const favorites = merge(this.favorites, backup.favorites)
      const progressions = merge(this.progressions, backup.progressions)
      const settings = clone(backup.settings ?? this.settings)
      await db.transaction(
        'rw',
        [db.settings, db.tunings, db.favorites, db.progressions],
        async () => {
          await db.tunings.bulkPut(tunings)
          await db.favorites.bulkPut(favorites)
          await db.progressions.bulkPut(progressions)
          await db.settings.put({ id: 'main', value: settings })
        },
      )
      this.customTunings = tunings
      this.favorites = favorites
      this.progressions = progressions
      this.settings = settings
      return { added, conflicts }
    },
  },
})
