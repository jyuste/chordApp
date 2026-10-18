<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Chord, Interval } from 'tonal'
import ChordDiagram from '../components/ChordDiagram.vue'
import { NOTE_NAMES, chordInfo, generateVoicings, noteLabel } from '../lib/music'
import { CHORD_FAMILIES, CHORD_TYPES } from '../lib/reference'
import { playNotes, progressionNotes, stopAudio } from '../lib/audio'
import type { InstrumentContext } from '../lib/types'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const route = useRoute()
const root = ref('C')
const family = ref('all')
const query = ref('')
const selected = ref('C')
const suffix = ref('')
const positionIndex = ref(0)
const error = ref('')
const status = ref('')
const playing = ref(false)
const saving = ref(false)
const clean = (value: string) =>
  value
    .trim()
    .replaceAll('♯', '#')
    .replaceAll('♭', 'b')
    .replace(/^[a-g]/, (letter) => letter.toUpperCase())
    .replace(
      /\/([a-g])((?:#{1,2}|b{1,2})?)$/,
      (_, letter: string, accidental: string) => '/' + letter.toUpperCase() + accidental,
    )
const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const context = computed<InstrumentContext>(() => {
  const { instrument, tuning, frets, capo, leftHanded } = store.settings
  return { instrument, tuning, frets, capo, leftHanded }
})
const info = computed(() => chordInfo(selected.value))
const selectedType = computed(() =>
  CHORD_TYPES.find((type) => root.value + type.suffix === selected.value),
)
const directChord = computed(() => {
  const value = clean(query.value)
  return value && chordInfo(value).notes.length ? value : ''
})
const visibleTypes = computed(() => {
  const needle = searchable(clean(query.value))
  return CHORD_TYPES.filter((type) => {
    if (family.value !== 'all' && family.value !== type.family) return false
    if (!needle) return true
    // Chord symbols are case-sensitive: Cm7 and CM7 describe different qualities.
    if (directChord.value) {
      const wanted = chordInfo(directChord.value)
      return (
        JSON.stringify(chordInfo(root.value + type.suffix).intervals) ===
          JSON.stringify(wanted.intervals) && Chord.get(directChord.value).tonic === root.value
      )
    }
    return [root.value + type.suffix, type.label, type.description].some((text) =>
      searchable(text).includes(needle),
    )
  })
})
const positions = computed(() =>
  generateVoicings(selected.value, context.value.tuning, {
    maxFret: context.value.frets - context.value.capo,
    capo: context.value.capo,
  }),
)
const position = computed(() => positions.value[positionIndex.value])
const soundingNotes = computed(
  () =>
    position.value?.notes ??
    progressionNotes({ id: 'dictionary', chord: selected.value, beats: 4 }, context.value),
)
const formula = computed(() =>
  info.value.intervals.map((symbol) => {
    const interval = Interval.get(symbol)
    const accidental =
      (
        {
          m: '♭',
          d: interval.num === 5 || interval.num === 4 ? '♭' : '♭♭',
          A: '♯',
          AA: '♯♯',
          dd: '♭♭',
        } as Record<string, string>
      )[interval.q] ?? ''
    return accidental + interval.num
  }),
)
const progressionLink = computed(() => ({
  path: '/progresiones',
  query: {
    chord: selected.value,
    ...(position.value ? { voicing: JSON.stringify(position.value.frets) } : {}),
  },
}))

function chooseChord(name: string) {
  const normalized = clean(name)
  if (!chordInfo(normalized).notes.length) {
    error.value = 'No se reconoce el acorde. Prueba Cmaj7, F#m7 o C/E.'
    return
  }
  const tonic = normalized.match(/^([A-G](?:#{1,2}|b{1,2})?)/)?.[1]
  if (tonic) root.value = tonic
  suffix.value = normalized.slice((tonic ?? root.value).length)
  selected.value = normalized
  error.value = ''
  status.value = ''
}
function chooseType(value: string) {
  suffix.value = value
  chooseChord(root.value + value)
}
function submitSearch() {
  if (directChord.value) chooseChord(directChord.value)
  else if (visibleTypes.value[0]) chooseType(visibleTypes.value[0].suffix)
  else error.value = 'No hay coincidencias. Prueba otro nombre o una fórmula como Cmaj7.'
}
watch(
  root,
  () => {
    selected.value = root.value + suffix.value
  },
  { flush: 'sync' },
)
watch(
  [selected, context],
  () => {
    positionIndex.value = 0
    status.value = ''
    error.value = ''
    stopAudio()
  },
  { deep: true },
)
watch(
  () => route.query.chord,
  (value) => {
    if (typeof value === 'string') {
      query.value = value
      chooseChord(value)
    }
  },
  { immediate: true },
)
async function listen(arpeggio = false) {
  error.value = ''
  playing.value = true
  try {
    await playNotes(soundingNotes.value, arpeggio)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo reproducir el acorde.'
  } finally {
    playing.value = false
  }
}
async function saveFavorite() {
  error.value = ''
  status.value = ''
  saving.value = true
  try {
    await store.saveFavorite({
      id: crypto.randomUUID(),
      name: selected.value,
      kind: position.value ? 'position' : 'chord',
      context: context.value,
      ...(position.value
        ? { frets: [...position.value.frets] }
        : { notes: [...soundingNotes.value] }),
      updatedAt: new Date().toISOString(),
    })
    status.value = 'Guardado en tu biblioteca.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo guardar el favorito.'
  } finally {
    saving.value = false
  }
}
onUnmounted(stopAudio)
</script>

<template>
  <div class="dictionary-view">
    <header class="page-head">
      <div>
        <div class="eyebrow">Consulta, escucha y toca</div>
        <h1>Diccionario de acordes.</h1>
        <p>De una tríada a una trecena: descubre sus notas y encuentra una posición.</p>
      </div>
    </header>
    <div class="dictionary-controls">
      <label
        >Fundamental del acorde
        <select v-model="root">
          <option v-if="!NOTE_NAMES.includes(root)" :value="root">
            {{ noteLabel(root, store.settings.solfege) }}
          </option>
          <option v-for="note in NOTE_NAMES" :key="note" :value="note">
            {{ noteLabel(note, store.settings.solfege) }}
          </option>
        </select>
      </label>
      <form class="search-form" @submit.prevent="submitSearch">
        <label for="chord-search"
          >Buscar por nombre o símbolo
          <input
            id="chord-search"
            v-model="query"
            type="search"
            placeholder="Menor, Cmaj7, C/E…"
            autocomplete="off"
            :spellcheck="false"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>
    </div>
    <div class="family-filters" role="group" aria-label="Familias de acordes">
      <button type="button" :aria-pressed="family === 'all'" @click="family = 'all'">Todos</button>
      <button
        v-for="item in CHORD_FAMILIES"
        :key="item.id"
        type="button"
        :aria-pressed="family === item.id"
        @click="family = item.id"
      >
        {{ item.name }}
      </button>
    </div>
    <div class="dictionary-content">
      <section class="catalogue" aria-label="Tipos de acordes">
        <div class="catalogue-heading">
          <h2>Explorar acordes</h2>
          <span>{{ visibleTypes.length }} tipos</span>
        </div>
        <button
          v-if="directChord"
          type="button"
          class="direct-result"
          :aria-pressed="selected === directChord"
          @click="chooseChord(directChord)"
        >
          Abrir {{ directChord }} <span>Ver notas y posiciones →</span>
        </button>
        <ul v-if="visibleTypes.length" class="chord-list">
          <li v-for="type in visibleTypes" :key="type.suffix">
            <button
              type="button"
              :aria-pressed="selected === root + type.suffix"
              @click="chooseType(type.suffix)"
            >
              <strong>{{ root + type.suffix }}</strong
              ><span>{{ type.label }}</span
              ><span aria-hidden="true">→</span>
            </button>
          </li>
        </ul>
        <p v-else-if="!directChord" class="empty">
          No hay coincidencias en esta familia. Prueba otra familia o borra la búsqueda.
        </p>
      </section>
      <section class="chord-detail" :aria-label="`Detalle de ${selected}`">
        <div class="detail-heading">
          <span class="eyebrow">Acorde seleccionado</span>
          <h2>{{ selected }}</h2>
          <p>{{ selectedType?.label ?? 'Acorde personalizado' }}</p>
        </div>
        <p class="description">
          {{
            selectedType?.description ??
            'Consulta la fórmula y las notas de este acorde. Si tiene una barra, la nota a su derecha indica el bajo.'
          }}
        </p>
        <dl class="chord-theory">
          <div>
            <dt>Fórmula</dt>
            <dd>{{ formula.join(' · ') }}</dd>
          </div>
          <div>
            <dt>Notas</dt>
            <dd>
              {{ info.notes.map((note) => noteLabel(note, store.settings.solfege)).join(' · ') }}
            </dd>
          </div>
        </dl>
        <div class="position-area">
          <p class="tuning-caption">
            {{ context.tuning.name }}<span v-if="context.capo"> · Cejilla {{ context.capo }}</span>
          </p>
          <template v-if="position">
            <ChordDiagram
              :tuning="context.tuning"
              :frets="position.frets"
              :capo="context.capo"
              :left-handed="context.leftHanded"
              :name="selected"
            />
            <div class="position-nav">
              <button
                type="button"
                aria-label="Posición anterior"
                :disabled="positionIndex === 0"
                @click="positionIndex--"
              >
                ←
              </button>
              <span>Posición {{ positionIndex + 1 }} de {{ positions.length }}</span>
              <button
                type="button"
                aria-label="Posición siguiente"
                :disabled="positionIndex >= positions.length - 1"
                @click="positionIndex++"
              >
                →
              </button>
            </div>
          </template>
          <p v-else class="no-position">
            No encontramos una posición completa para esta afinación y cejilla. Puedes escuchar
            todas sus notas y guardar el acorde.
          </p>
        </div>
        <div class="detail-actions">
          <button type="button" class="primary" :disabled="playing" @click="listen()">
            Escuchar acorde
          </button>
          <button type="button" :disabled="playing" @click="listen(true)">Arpegiar</button>
          <button type="button" :disabled="saving" @click="saveFavorite">
            {{ saving ? 'Guardando…' : 'Guardar favorito' }}
          </button>
        </div>
        <div class="detail-links">
          <RouterLink :to="{ path: '/', query: { chord: selected } }">Ver en el mástil →</RouterLink
          ><RouterLink :to="progressionLink">Añadir a progresión →</RouterLink>
        </div>
        <p v-if="status" class="save-status" role="status">{{ status }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/index' as *;
.dictionary-view {
  max-width: 1150px;
}
.dictionary-controls {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 24px;
  align-items: end;
}
.search-form {
  display: flex;
  gap: 10px;
  align-items: end;
  label {
    flex: 1;
    min-width: 0;
  }
}
.family-filters {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding: 22px 0 26px;
  button {
    font-size: 12px;
  }
}
button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}
.dictionary-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 1.12fr);
  gap: 38px;
  align-items: start;
}
.catalogue-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 14px;
  h2 {
    font-size: 16px;
    margin: 0;
  }
  span {
    color: var(--muted);
    font-size: 12px;
  }
}
.chord-list {
  padding: 0;
  margin: 0;
  list-style: none;
  border-top: 1px solid var(--line);
  li {
    border-bottom: 1px solid var(--line);
  }
  button {
    width: 100%;
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr) 15px;
    text-align: left;
    border-radius: 0;
    border: 0;
    padding: 15px 12px;
    background: transparent;
    strong {
      font-size: 17px;
    }
    span {
      color: var(--muted);
      font-size: 12px;
    }
    &:hover,
    &[aria-pressed='true'] {
      background: var(--accent-soft);
    }
  }
}
.direct-result {
  width: 100%;
  justify-content: space-between;
  text-align: left;
  margin-bottom: 12px;
  span {
    color: var(--muted);
    font-size: 11px;
  }
}
.chord-detail {
  padding: 27px 30px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}
.detail-heading {
  .eyebrow {
    margin: 0;
    font-size: 9px;
  }
  h2 {
    margin: 7px 0 3px;
    font-family: Georgia, serif;
    font-size: 45px;
    font-weight: 400;
  }
  p {
    color: var(--muted);
    margin-bottom: 18px;
    font-size: 13px;
  }
}
.description {
  color: var(--muted);
  font-size: 13px;
  max-width: 65ch;
}
.chord-theory {
  margin: 22px 0;
  display: grid;
  gap: 11px;
  div {
    display: grid;
    grid-template-columns: 65px minmax(0, 1fr);
    gap: 10px;
  }
  dt {
    color: var(--muted);
    font-size: 12px;
  }
  dd {
    margin: 0;
    font-weight: 600;
    font-size: 13px;
  }
}
.position-area {
  padding: 16px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.tuning-caption {
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}
.position-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-top: 13px;
  span {
    font-size: 12px;
    color: var(--muted);
  }
  button {
    width: 44px;
    padding: 0;
  }
}
.no-position {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 0;
}
.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 22px;
  button {
    font-size: 12px;
  }
}
.detail-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 13px;
  a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    color: var(--accent);
    text-underline-offset: 4px;
  }
}
.save-status {
  color: var(--accent);
  font-size: 13px;
  margin-top: 16px;
}
@media (max-width: 950px) {
  .dictionary-content {
    gap: 22px;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr);
  }
  .chord-detail {
    padding: 23px 20px;
  }
}
@include phone {
  .dictionary-controls {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .family-filters {
    padding: 18px 0 24px;
    gap: 6px;
  }
  .dictionary-content {
    display: flex;
    flex-direction: column;
  }
  .catalogue {
    width: 100%;
  }
  .chord-list {
    max-height: 290px;
    overflow-y: auto;
  }
  .chord-detail {
    width: 100%;
  }
  .chord-list button {
    grid-template-columns: 80px minmax(0, 1fr) 15px;
  }
}
</style>
