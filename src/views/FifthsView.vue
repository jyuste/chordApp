<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Play, Layers, BookOpen } from '@lucide/vue'
import { Note } from 'tonal'
import FifthsWheel from '../components/FifthsWheel.vue'
import { CIRCLE_KEYS, keyChords, keySignature } from '../lib/reference'
import { getScale, noteLabel, suggestHarmony } from '../lib/music'
import { playNotes, progressionNotes, stopAudio } from '../lib/audio'
import { useAppStore } from '../stores/app'
import type { KeyMode } from '../lib/types'
const store = useAppStore()
const selected = ref(0),
  mode = ref<KeyMode>('major'),
  alternate = ref(false),
  error = ref('')
const entry = computed(() => CIRCLE_KEYS[selected.value]!)
const spelling = computed(() =>
  alternate.value && entry.value.alternate ? entry.value.alternate : entry.value,
)
const wheelKeys = computed(() =>
  CIRCLE_KEYS.map((key, i) => (i === selected.value ? { ...key, ...spelling.value } : key)),
)
const tonic = computed(() => (mode.value === 'major' ? spelling.value.major : spelling.value.minor))
const modeName = computed(() => (mode.value === 'major' ? 'mayor' : 'menor'))
const relative = computed(() =>
  mode.value === 'major'
    ? `${noteLabel(spelling.value.minor, store.settings.solfege)} menor`
    : `${noteLabel(spelling.value.major, store.settings.solfege)} mayor`,
)
const signature = computed(() => keySignature(spelling.value.accidentals))
const signatureLabel = computed(() =>
  !signature.value.length
    ? 'Sin sostenidos ni bemoles'
    : `${signature.value.length} ${spelling.value.kind === 'sharp' ? (signature.value.length === 1 ? 'sostenido' : 'sostenidos') : signature.value.length === 1 ? 'bemol' : 'bemoles'}`,
)
const scale = computed(() => getScale(tonic.value, mode.value))
const chords = computed(() => keyChords(tonic.value, mode.value))
const harmonicDominant = computed(() =>
  mode.value === 'minor'
    ? suggestHarmony(tonic.value, undefined, 'minor').find(
        (s) => s.reason.includes('armónica') && s.chord.endsWith('7'),
      )
    : undefined,
)
const example = computed(() =>
  [
    0,
    mode.value === 'minor' ? 5 : 4,
    mode.value === 'minor' ? 2 : 5,
    mode.value === 'minor' ? 6 : 3,
  ].map((i) => chords.value[i]!.name),
)
const progressionLink = computed(() => ({
  path: '/progresiones',
  query: { chords: JSON.stringify(example.value), key: tonic.value, mode: mode.value },
}))
function select(index: number, nextMode: KeyMode = mode.value) {
  const nextIndex = (index + 12) % 12
  if (nextIndex !== selected.value) alternate.value = false
  selected.value = nextIndex
  mode.value = nextMode
  error.value = ''
}
async function listenScale() {
  error.value = ''
  try {
    let previous = -1
    const notes = scale.value.notes.map((n) => {
      let midi = Note.midi(n + '3')!
      while (midi <= previous) midi += 12
      previous = midi
      return Note.fromMidi(midi)
    })
    await playNotes(notes, true)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
async function listenChord(chord: string) {
  error.value = ''
  try {
    await playNotes(progressionNotes({ id: 'preview', chord, beats: 4 }, store.settings))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onUnmounted(stopAudio)
</script>
<template>
  <header class="page-head">
    <div>
      <div class="eyebrow">UN MAPA PARA CONECTAR TU MÚSICA</div>
      <h1>Círculo de quintas.</h1>
      <p>Tonalidades, relativas y acordes. Descubre qué hay a un paso de tu idea.</p>
    </div>
  </header>
  <div class="fifths-layout">
    <section class="panel wheel-panel" aria-label="Mapa de tonalidades">
      <div class="row between">
        <div class="segmented" aria-label="Anillo del círculo">
          <button
            :class="{ active: mode === 'major' }"
            :aria-pressed="mode === 'major'"
            @click="mode = 'major'"
          >
            Mayores</button
          ><button
            :class="{ active: mode === 'minor' }"
            :aria-pressed="mode === 'minor'"
            @click="mode = 'minor'"
          >
            Menores
          </button>
        </div>
        <span class="badge">12 tonalidades · 2 anillos</span>
      </div>
      <FifthsWheel
        :keys="wheelKeys"
        :selected="selected"
        :mode="mode"
        :solfege="store.settings.solfege"
        @select="select"
      />
      <div class="row key-controls">
        <button class="icon-button" aria-label="Quinta anterior" @click="select(selected - 1)">
          <ArrowLeft :size="16" /></button
        ><label
          >Tonalidad del círculo<select
            :value="selected"
            @change="select(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="(key, i) in CIRCLE_KEYS" :key="key.major" :value="i">
              {{ noteLabel(key.major, store.settings.solfege) }} mayor /
              {{ noteLabel(key.minor, store.settings.solfege) }} menor
            </option>
          </select></label
        ><button class="icon-button" aria-label="Quinta siguiente" @click="select(selected + 1)">
          <ArrowRight :size="16" />
        </button>
      </div>
      <p class="wheel-help">
        En sentido horario subes una quinta; en sentido contrario, una cuarta. Las dos tonalidades
        de cada sector comparten armadura.
      </p>
    </section>
    <section class="panel key-panel" aria-labelledby="key-heading">
      <div class="eyebrow">TU TONALIDAD</div>
      <h2 id="key-heading">
        {{ noteLabel(tonic, store.settings.solfege) }} <span>{{ modeName }}</span>
      </h2>
      <p class="relative-line">
        {{ mode === 'major' ? 'Relativa menor' : 'Relativa mayor' }}:
        <button class="relative-button" @click="mode = mode === 'major' ? 'minor' : 'major'">
          {{ relative }} <ArrowUpRight :size="13" />
        </button>
      </p>
      <div class="signature">
        <h3>Armadura · {{ signatureLabel }}</h3>
        <div v-if="signature.length" class="row">
          <span v-for="note in signature" :key="note" class="note-pill">{{
            noteLabel(note, store.settings.solfege)
          }}</span>
        </div>
        <p v-else class="muted">Todas las notas de esta escala son naturales.</p>
      </div>
      <label v-if="entry.alternate" class="check enharmonic"
        ><input v-model="alternate" type="checkbox" />Usar escritura enarmónica:
        {{ alternate ? entry.major : entry.alternate.major }} /
        {{ alternate ? entry.minor : entry.alternate.minor }}m</label
      >
      <p v-if="entry.alternate" class="small-note muted">
        La otra escritura suena igual en temperamento igual; cambian los nombres de las notas y la
        armadura.
      </p>
      <div class="scale-block">
        <div class="row between">
          <h3>Notas de la escala {{ mode === 'minor' ? 'menor natural' : 'mayor' }}</h3>
          <button
            class="icon-button ghost"
            aria-label="Escuchar escala de la tonalidad"
            @click="listenScale"
          >
            <Play :size="15" />
          </button>
        </div>
        <div class="row">
          <span v-for="note in scale.notes" :key="note" class="note-pill">{{
            noteLabel(note, store.settings.solfege)
          }}</span>
        </div>
      </div>
      <div class="key-chords">
        <h3>Acordes de la tonalidad</h3>
        <div class="chord-table">
          <div v-for="chord in chords" :key="chord.name" class="key-chord-row">
            <span class="degree">{{ chord.degree }}</span
            ><RouterLink
              :to="{ path: '/diccionario', query: { chord: chord.name } }"
              :aria-label="`Consultar ${chord.name} en el diccionario`"
              >{{ chord.name }}<ArrowUpRight :size="13" /></RouterLink
            ><button
              class="icon-button ghost"
              :aria-label="`Escuchar ${chord.name}`"
              @click="listenChord(chord.name)"
            >
              <Play :size="13" />
            </button>
          </div>
        </div>
        <p v-if="harmonicDominant" class="notice">
          <strong>{{ harmonicDominant.chord }}</strong
          >: {{ harmonicDominant.reason }}
          <button class="small" @click="listenChord(harmonicDominant.chord)">
            Escuchar dominante
          </button>
        </p>
      </div>
    </section>
  </div>
  <section class="panel connection-panel">
    <div>
      <div class="eyebrow">DEL MAPA A UNA CANCIÓN</div>
      <h2>Prueba este recorrido.</h2>
      <p class="example-chords">{{ example.join(' → ') }}</p>
      <p class="muted">
        Un punto de partida en {{ noteLabel(tonic, store.settings.solfege) }} {{ modeName }}. Puedes
        cambiar cada acorde y elegir sus posiciones.
      </p>
    </div>
    <RouterLink class="action-link" :to="progressionLink"
      ><Layers :size="17" />Crear esta progresión<ArrowUpRight :size="16"
    /></RouterLink>
  </section>
  <div class="guide">
    <h2>Cómo leer el círculo</h2>
    <div>
      <p>
        <strong>Quintas vecinas.</strong> Las tonalidades contiguas comparten seis de sus siete
        notas. Son caminos útiles para cambiar de color sin alejarte demasiado.
      </p>
      <p>
        <strong>Mayor y relativa menor.</strong> Comparten las mismas notas y armadura, con una
        tónica diferente. C mayor y A menor son el primer ejemplo.
      </p>
      <p>
        <strong>Menor natural y armónica.</strong> El anillo interior muestra la menor natural. Al
        elevar su séptimo grado aparece la dominante mayor, una tensión habitual para volver al
        acorde menor.
      </p>
    </div>
  </div>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <p class="page-bottom">
    <BookOpen :size="14" />Pulsa cualquier acorde del mapa para consultar su fórmula y posiciones.
  </p>
</template>
<style scoped lang="scss">
@use '../styles/index' as *;
.fifths-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 1fr);
  gap: 22px;
  align-items: start;
}
.wheel-panel {
  padding: 24px;
  min-width: 0;
}
.wheel-panel .badge {
  font-size: 9px;
}
.key-controls {
  gap: 9px;
  justify-content: center;
  align-items: flex-end;
  label {
    flex: 1;
    max-width: 300px;
  }
}
.wheel-help {
  font-size: 12px;
  color: var(--muted);
  margin: 21px 0 0;
  line-height: 1.7;
}
.key-panel {
  min-width: 0;
}
.key-panel > h2 {
  font:
    42px Georgia,
    serif;
  color: var(--accent);
  margin: 14px 0 10px;
  span {
    font-size: 23px;
    color: var(--muted);
  }
}
.relative-line {
  font-size: 12px;
  color: var(--muted);
}
.relative-button {
  display: inline-flex;
  border: 0;
  min-height: 32px;
  padding: 0 5px;
  font-size: 12px;
  color: var(--accent);
  background: transparent;
}
.signature,
.scale-block,
.key-chords {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  h3 {
    font-size: 13px;
    margin-bottom: 13px;
  }
  .row {
    gap: 6px;
  }
  .note-pill {
    font-size: 12px;
    min-width: 32px;
    min-height: 34px;
    padding: 6px 8px;
  }
}
.signature .muted {
  font-size: 12px;
  margin: 0;
}
.enharmonic {
  margin-top: 18px;
  font-size: 12px;
}
.small-note {
  font-size: 11px;
  margin: 3px 0 0;
}
.scale-block .between h3 {
  margin: 0;
}
.key-chords .notice {
  font-size: 11px;
  margin: 16px 0 0;
  button {
    margin-top: 10px;
    font-size: 11px;
    display: flex;
  }
}
.chord-table {
  display: grid;
}
.key-chord-row {
  display: grid;
  grid-template-columns: 45px minmax(0, 1fr) 44px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  min-height: 46px;
  gap: 10px;
  .degree {
    font-size: 12px;
    color: var(--rust);
  }
  a {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    min-height: 44px;
    font:
      20px Georgia,
      serif;
    color: var(--accent);
    svg {
      margin-left: auto;
      color: var(--muted);
    }
  }
}
.connection-panel {
  margin-top: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  h2 {
    font:
      26px Georgia,
      serif;
    margin-bottom: 12px;
  }
  .eyebrow {
    font-size: 9px;
    margin-bottom: 12px;
  }
  .muted {
    font-size: 12px;
    max-width: 65ch;
    margin: 0;
  }
}
.example-chords {
  font:
    25px Georgia,
    serif;
  color: var(--accent);
  margin: 0 0 15px;
}
.action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px 16px;
  min-height: 44px;
  background: var(--accent);
  color: var(--surface);
  text-decoration: none;
  border-radius: 8px;
  font-size: 12px;
  flex-shrink: 0;
}
.guide {
  margin: 30px 0 0;
  h2 {
    font-size: 18px;
  }
  div {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 25px;
  }
  p {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }
  strong {
    display: block;
    color: var(--text);
    margin-bottom: 7px;
  }
}
@media (max-width: 1100px) {
  .fifths-layout {
    grid-template-columns: 1fr;
  }
  .wheel-panel > .fifths-wheel {
    max-width: 480px;
  }
  .connection-panel {
    align-items: flex-start;
    flex-direction: column;
  }
  .guide div {
    grid-template-columns: 1fr;
    gap: 17px;
  }
}
@include phone {
  .wheel-panel {
    padding: 16px;
  }
  .wheel-panel > .between {
    justify-content: center;
    .badge {
      display: none;
    }
  }
  .key-panel {
    padding: 20px;
  }
  .key-controls {
    gap: 6px;
    select {
      font-size: 12px;
    }
  }
  .key-panel > h2 {
    font-size: 38px;
  }
  .connection-panel {
    padding: 20px;
  }
  .example-chords {
    font-size: 22px;
  }
  .action-link {
    width: 100%;
  }
  .guide {
    padding-inline: 2px;
  }
}
</style>
