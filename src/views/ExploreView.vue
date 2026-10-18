<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import {
  Play,
  Bookmark,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Guitar,
  Info,
  ArrowUpRight,
  Mic,
  Camera,
  Piano,
  X,
  Square,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { Note } from 'tonal'
import { useAppStore } from '../stores/app'
import {
  NOTE_NAMES,
  SCALE_TYPES,
  positionNotes,
  identifyChord,
  chordInfo,
  generateVoicings,
  getScale,
  compatibleScales,
  noteLabel,
  fretNote,
} from '../lib/music'
import { playNotes, stopAudio, startPitchDetection, stopPitchDetection } from '../lib/audio'
import { analyzeDiagram, type DiagramAnalysis } from '../lib/diagram'
import { SCALE_LABELS, scaleLabel } from '../lib/presentation'
import Fretboard from '../components/Fretboard.vue'
const store = useAppStore()
const router = useRouter()
const route = useRoute()
const mode = ref<'identify' | 'explore'>('identify')
const selected = ref<(number | null)[]>(
  store.settings.tuning.id === 'guitar-standard'
    ? [0, 2, 2, 1, 0, 0]
    : store.settings.tuning.notes.map(() => null),
)
const startFret = ref(1)
const root = ref('C')
const chordSuffix = ref('')
const target = ref<'chord' | 'scale' | 'note'>('chord')
const scaleType = ref('major')
const labels = ref<'notes' | 'degrees'>('notes')
const maxSpan = ref(4)
const chordIndex = ref(0)
const notice = ref('')
const error = ref('')
const capture = ref<'mic' | 'photo' | 'keyboard' | null>(null)
const playing = ref(false)
const pitch = ref<{ note: string; cents: number; frequency: number; confidence: number } | null>(
  null,
)
let stopMic: (() => void) | undefined
const listening = ref(false)
const photoImage = ref<HTMLImageElement>()
const firstFret = ref(1)
const diagramAnalysis = ref<DiagramAnalysis | null>(null)
const diagramFrets = ref<(number | null)[]>([])
const analyzing = ref(false)
const photoUrl = ref('')
const photoKind = ref('diagram')
const keys = ref<string[]>([])
const notes = computed(() =>
  capture.value === 'keyboard'
    ? keys.value
    : positionNotes(store.settings.tuning, selected.value, store.settings.capo),
)
const matches = computed(() => identifyChord(notes.value))
const activeMatch = computed(
  () => matches.value[Math.min(chordIndex.value, Math.max(0, matches.value.length - 1))],
)
const queryChord = computed(() => root.value + chordSuffix.value)
const scale = computed(() => getScale(root.value, scaleType.value))
const queryInfo = computed(() => chordInfo(queryChord.value))
const highlights = computed(() =>
  mode.value === 'identify'
    ? []
    : target.value === 'scale'
      ? scale.value.notes
      : target.value === 'note'
        ? [root.value]
        : queryInfo.value.notes,
)
const voicings = computed(() =>
  mode.value === 'explore' && target.value === 'chord'
    ? generateVoicings(queryChord.value, store.settings.tuning, {
        minFret: startFret.value === 1 ? 0 : startFret.value,
        maxFret: Math.min(startFret.value + 4, store.settings.frets - store.settings.capo),
        maxSpan: maxSpan.value,
        capo: store.settings.capo,
      })
    : [],
)
const voicingIndex = ref(0)
const voicing = computed(() => voicings.value[voicingIndex.value])
const boardSelection = computed({
  get: () =>
    mode.value === 'explore'
      ? target.value === 'chord'
        ? voicing.value?.frets || selected.value
        : store.settings.tuning.notes.map(() => null)
      : selected.value,
  set: (v) => (selected.value = v),
})
const resultTitle = computed(() =>
  mode.value === 'identify'
    ? activeMatch.value?.name || 'Tu próxima idea'
    : target.value === 'scale'
      ? scaleLabel(scale.value.name, store.settings.solfege)
      : target.value === 'note'
        ? noteLabel(root.value, store.settings.solfege)
        : queryChord.value,
)
const resultNotes = computed(() =>
  mode.value === 'identify'
    ? notes.value
    : target.value === 'chord'
      ? queryInfo.value.notes
      : target.value === 'scale'
        ? scale.value.notes
        : [root.value],
)
const resultIntervals = computed(() =>
  mode.value === 'identify'
    ? activeMatch.value?.intervals || []
    : target.value === 'scale'
      ? scale.value.intervals
      : target.value === 'chord'
        ? queryInfo.value.intervals
        : [],
)
const compatible = computed(() =>
  notes.value.length >= 2 ? compatibleScales(notes.value).slice(0, 8) : [],
)
const canPlay = computed(() =>
  mode.value === 'identify' ? notes.value.length > 0 : resultNotes.value.length > 0,
)
const keyboardNotes = Array.from({ length: 25 }, (_, i) => Note.fromMidi(48 + i))
const black = (n: string) => n.includes('#') || n.includes('b')
watch(
  () => store.settings.tuning.id,
  () => {
    selected.value = store.settings.tuning.notes.map(() => null)
    keys.value = []
    startFret.value = 1
    chordIndex.value = 0
  },
  { flush: 'sync' },
)
watch([queryChord, startFret, maxSpan], () => (voicingIndex.value = 0))
watch(notes, () => (chordIndex.value = 0))
function reset() {
  selected.value = store.settings.tuning.notes.map(() => null)
  keys.value = []
  notice.value = ''
}
async function listen(arpeggio = false) {
  error.value = ''
  try {
    playing.value = true
    const ns =
      mode.value === 'identify'
        ? notes.value
        : target.value === 'chord' && voicing.value
          ? voicing.value.notes
          : resultNotes.value.map((n) => (/\d/.test(n) ? n : n + '3'))
    await playNotes(ns, arpeggio)
  } catch (e) {
    error.value = String(e)
  } finally {
    playing.value = false
  }
}
async function playNote(n: string) {
  try {
    await playNotes([n])
  } catch (e) {
    error.value = String(e)
  }
}
async function favorite() {
  if (!canPlay.value) return
  try {
    await store.saveFavorite({
      id: crypto.randomUUID(),
      name:
        mode.value === 'explore' && target.value === 'scale'
          ? scaleLabel(scale.value.name, store.settings.solfege)
          : resultTitle.value,
      kind:
        capture.value === 'keyboard'
          ? 'chord'
          : mode.value === 'explore' && target.value === 'scale'
            ? 'scale'
            : 'position',
      ...(capture.value === 'keyboard'
        ? { notes: [...keys.value] }
        : mode.value === 'explore' && target.value === 'note'
          ? { notes: [root.value + '3'] }
          : {}),
      context: JSON.parse(
        JSON.stringify({
          instrument: store.settings.instrument,
          tuning: store.settings.tuning,
          frets: store.settings.frets,
          capo: store.settings.capo,
          leftHanded: store.settings.leftHanded,
        }),
      ),
      frets:
        capture.value === 'keyboard'
          ? undefined
          : mode.value === 'identify'
            ? [...selected.value]
            : target.value === 'chord' && voicing.value
              ? [...voicing.value.frets]
              : undefined,
      updatedAt: new Date().toISOString(),
    })
    notice.value = 'Guardado en tu biblioteca'
  } catch (e) {
    error.value = String(e)
  }
}
function addProgression() {
  const name =
    mode.value === 'identify'
      ? activeMatch.value?.name
      : target.value === 'chord'
        ? queryChord.value
        : undefined
  if (name)
    router.push({
      path: '/progresiones',
      query: {
        chord: name,
        ...(capture.value !== 'keyboard' && (mode.value === 'identify' || voicing.value)
          ? {
              voicing: JSON.stringify(
                mode.value === 'identify' ? selected.value : voicing.value?.frets,
              ),
            }
          : {}),
      },
    })
}
let micRequest = 0
async function microphone() {
  if (listening.value) {
    micRequest++
    stopPitchDetection()
    stopMic?.()
    stopMic = undefined
    listening.value = false
    return
  }
  const request = ++micRequest
  error.value = ''
  listening.value = true
  try {
    const stop = await startPitchDetection((p) => (pitch.value = p))
    if (request !== micRequest || capture.value !== 'mic') {
      stop()
      return
    }
    stopMic = stop
  } catch (e) {
    if (request === micRequest) {
      error.value = e instanceof Error ? e.message : String(e)
      listening.value = false
    }
  }
}

function setCapture(value: typeof capture.value) {
  micRequest++
  stopPitchDetection()
  stopMic?.()
  stopMic = undefined
  listening.value = false
  pitch.value = null
  capture.value = capture.value === value ? null : value
}
function loadPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'Selecciona una imagen.'
    return
  }
  if (file.size > 15 * 1024 * 1024) {
    error.value = 'La imagen debe ocupar menos de 15 MB.'
    return
  }
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = URL.createObjectURL(file)
  diagramAnalysis.value = null
  mode.value = 'identify'
  reset()
}
async function analyzePhoto() {
  const image = photoImage.value
  if (!image) return
  error.value = ''
  analyzing.value = true
  diagramAnalysis.value = null
  try {
    await image.decode()
    if (image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error('Reduce la resolución de la imagen antes de analizarla.')
    const factor = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No se pudo leer la imagen.')
    ctx.fillStyle = '#faf9f4'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = analyzeDiagram(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
      store.settings.tuning.notes.length,
      firstFret.value,
    )
    diagramAnalysis.value = result
    diagramFrets.value = [...result.frets]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    analyzing.value = false
  }
}
function applyDiagram() {
  if (
    diagramFrets.value.some((f) => f !== null && f > store.settings.frets - store.settings.capo)
  ) {
    error.value = 'Una posición supera los trastes disponibles. Revisa el traste inicial.'
    return
  }
  mode.value = 'identify'
  capture.value = 'photo'
  selected.value = [...diagramFrets.value]
  startFret.value = Math.max(
    1,
    Math.min(firstFret.value, store.settings.frets - store.settings.capo - 4),
  )
  notice.value = 'Posición confirmada. El mástil muestra las notas que has elegido.'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleKey(n: string) {
  if (keys.value.includes(n)) keys.value = keys.value.filter((k) => k !== n)
  else keys.value = [...keys.value, n]
  void playNote(n)
}
function restoreFavorite(id: unknown) {
  if (typeof id !== 'string') return
  const item = store.favorites.find((f) => f.id === id)
  if (!item) return
  Object.assign(store.settings, JSON.parse(JSON.stringify(item.context)))
  void store.saveSettings()
  if (item.kind === 'scale') {
    const [tonic, ...rest] = item.name.split(' ')
    root.value = tonic || 'C'
    scaleType.value = rest.join(' ')
    mode.value = 'explore'
    target.value = 'scale'
  } else if (item.notes?.length) {
    capture.value = 'keyboard'
    keys.value = [...item.notes]
    mode.value = 'identify'
  } else if (item.frets) {
    mode.value = 'identify'
    capture.value = null
    selected.value = [...item.frets]
    const pressed = item.frets.filter((f): f is number => f !== null && f > 0)
    startFret.value = Math.max(
      1,
      Math.min(
        pressed.length ? Math.min(...pressed) : 1,
        store.settings.frets - store.settings.capo - 4,
      ),
    )
  }
}
watch(() => route.query.favorite, restoreFavorite, { immediate: true, flush: 'post' })
const standardSuffixes = [
  '',
  'm',
  '5',
  'dim',
  'aug',
  'sus2',
  'sus4',
  '6',
  'm6',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'dim7',
  'add9',
  '9',
  'maj9',
  'm9',
  '11',
  '13',
  '7b9',
  '7#9',
  '7#11',
  '7b13',
]
watch(
  () => route.query.chord,
  (value) => {
    if (typeof value !== 'string') return
    if (!chordInfo(value).notes.length) {
      error.value = 'No se reconoce el acorde del enlace.'
      return
    }
    const match = value.match(/^([A-G](?:#{1,2}|b{1,2})?)(.*)$/)
    if (!match) return
    setCapture(null)
    mode.value = 'explore'
    target.value = 'chord'
    root.value = match[1]!
    chordSuffix.value = match[2]!
    startFret.value = 1
    voicingIndex.value = 0
  },
  { immediate: true },
)

onUnmounted(() => {
  micRequest++
  stopPitchDetection()
  stopMic?.()
  stopAudio()
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
})
</script>
<template>
  <div class="page-head">
    <div>
      <div class="eyebrow">CADA NOTA TIENE ALGO QUE CONTAR</div>
      <h1>Explora el mástil<span class="heading-dot">.</span></h1>
      <p>Encuentra el nombre de lo que tocas. Entiende por qué suena así.</p>
    </div>
    <div class="head-illustration" aria-hidden="true">
      <Guitar :size="52" :stroke-width="0.8" /><span>De la curiosidad<br />a la música.</span>
    </div>
  </div>
  <div class="explore-layout">
    <section class="instrument-panel panel">
      <div class="row between section-toolbar">
        <div class="segmented" aria-label="Modo de exploración">
          <button :class="{ active: mode === 'identify' }" @click="mode = 'identify'">
            Identificar</button
          ><button :class="{ active: mode === 'explore' }" @click="mode = 'explore'">
            Explorar
          </button>
        </div>
        <span class="badge"><span class="status-dot" />{{ store.settings.tuning.name }}</span>
      </div>
      <div v-if="mode === 'identify'" class="board-instruction">
        <span class="step-number">01</span>
        <div>
          <strong>¿Qué estás tocando?</strong>
          <p>Toca las cuerdas y los trastes para dibujar tu acorde.</p>
        </div>
        <button class="icon-button ghost" aria-label="Limpiar mástil" @click="reset">
          <RotateCcw :size="16" />
        </button>
      </div>
      <div v-else class="explore-controls">
        <div class="fields">
          <label
            >Quiero explorar<select v-model="target">
              <option value="chord">Un acorde</option>
              <option value="scale">Una escala</option>
              <option value="note">Una nota</option>
            </select></label
          ><label
            >Fundamental<select v-model="root">
              <option v-if="!NOTE_NAMES.includes(root)" :value="root">
                {{ noteLabel(root, store.settings.solfege) }}
              </option>
              <option v-for="n in NOTE_NAMES" :key="n" :value="n">
                {{ noteLabel(n, store.settings.solfege) }}
              </option>
            </select></label
          ><label v-if="target === 'chord'"
            >Tipo de acorde<select v-model="chordSuffix">
              <option v-if="!standardSuffixes.includes(chordSuffix)" :value="chordSuffix">
                {{ chordSuffix || 'Mayor' }}
              </option>
              <option value="">Mayor</option>
              <option value="m">Menor</option>
              <option value="5">Power chord · 5</option>
              <option value="dim">Disminuido</option>
              <option value="aug">Aumentado</option>
              <option value="sus2">Suspendido · 2</option>
              <option value="sus4">Suspendido · 4</option>
              <option value="6">Sexta · 6</option>
              <option value="m6">Menor sexta</option>
              <option value="7">Dominante · 7</option>
              <option value="maj7">Mayor séptima</option>
              <option value="m7">Menor séptima</option>
              <option value="m7b5">Semidisminuido</option>
              <option value="dim7">Disminuido séptima</option>
              <option value="add9">Añadida · 9</option>
              <option value="9">Dominante · 9</option>
              <option value="maj9">Mayor · 9</option>
              <option value="m9">Menor · 9</option>
              <option value="11">Dominante · 11</option>
              <option value="13">Dominante · 13</option>
              <option value="7b9">Séptima ♭9</option>
              <option value="7#9">Séptima ♯9</option>
              <option value="7#11">Séptima ♯11</option>
              <option value="7b13">Séptima ♭13</option>
            </select></label
          ><label v-if="target === 'scale'"
            >Escala<select v-model="scaleType">
              <option v-for="s in SCALE_TYPES" :key="s" :value="s">
                {{ SCALE_LABELS[s] || s }}
              </option>
            </select></label
          >
        </div>
      </div>
      <div class="fretboard-wrap">
        <Fretboard
          v-model="boardSelection"
          :tuning="store.settings.tuning"
          :capo="store.settings.capo"
          :left-handed="store.settings.leftHanded"
          :highlights="highlights"
          :root="mode === 'identify' ? activeMatch?.notes[0] || '' : root"
          :solfege="store.settings.solfege"
          :mode="mode"
          :start-fret="startFret"
          :visible-frets="Math.min(5, store.settings.frets - store.settings.capo - startFret + 1)"
          :labels="labels"
          @note="playNote"
        />
      </div>
      <p class="scroll-hint">Desliza el mástil para ver los demás trastes →</p>
      <div class="board-footer row between">
        <div class="row fret-nav">
          <button
            class="icon-button ghost"
            aria-label="Trastes anteriores"
            :disabled="startFret <= 1"
            @click="startFret = Math.max(1, startFret - 5)"
          >
            <ChevronLeft :size="16" /></button
          ><span
            >Trastes {{ startFret }}–{{
              Math.min(startFret + 4, store.settings.frets - store.settings.capo)
            }}</span
          ><button
            class="icon-button ghost"
            aria-label="Trastes siguientes"
            :disabled="startFret + 4 >= store.settings.frets - store.settings.capo"
            @click="
              startFret = Math.min(store.settings.frets - store.settings.capo - 4, startFret + 5)
            "
          >
            <ChevronRight :size="16" />
          </button>
        </div>
        <div class="legend">
          <span class="legend-dot root" />Fundamental <span class="legend-dot" />{{
            mode === 'identify' ? 'Nota seleccionada' : 'Nota del conjunto'
          }}
        </div>
      </div>
      <div v-if="mode === 'explore' && target === 'chord'" class="voicing-control row between">
        <span v-if="voicings.length">Posición {{ voicingIndex + 1 }} de {{ voicings.length }}</span
        ><span v-else>Sin posiciones en esta zona. Amplía la extensión o cambia de trastes.</span>
        <div class="row">
          <button
            class="icon-button"
            aria-label="Posición anterior"
            :disabled="!voicingIndex"
            @click="voicingIndex--"
          >
            <ChevronLeft :size="16" /></button
          ><button
            class="icon-button"
            aria-label="Posición siguiente"
            :disabled="voicingIndex >= voicings.length - 1"
            @click="voicingIndex++"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>
      <details>
        <summary>Ajustes de visualización</summary>
        <div class="fields">
          <label
            >Mostrar<select v-model="labels">
              <option value="notes">Nombres de notas</option>
              <option value="degrees">Grados del acorde o escala</option>
            </select></label
          ><label v-if="mode === 'explore' && target === 'chord'"
            >Extensión máxima · {{ maxSpan }} trastes<input
              v-model.number="maxSpan"
              type="range"
              min="1"
              max="5"
          /></label>
        </div>
        <p class="muted small-note">
          Las cuerdas sin marcar están silenciadas. El círculo junto a la cejuela indica cuerda al
          aire.
          {{
            store.settings.capo
              ? 'Cejilla en traste ' + store.settings.capo + '. Posiciones relativas a la cejilla.'
              : ''
          }}
        </p>
      </details>
    </section>
    <section class="result-panel panel">
      <div class="row between">
        <div class="eyebrow">
          {{ mode === 'identify' ? 'ESTO ES LO QUE SUENA' : 'TU DESCUBRIMIENTO' }}
        </div>
        <span v-if="activeMatch && mode === 'identify'" class="badge">{{
          activeMatch.exact ? 'Coincidencia exacta' : 'Interpretación parcial'
        }}</span>
      </div>
      <div class="result-chord" :class="{ placeholder: !canPlay }">{{ resultTitle }}</div>
      <p class="result-caption">
        {{
          mode === 'identify'
            ? activeMatch
              ? activeMatch.exact
                ? 'Un nombre para las notas que has elegido.'
                : 'Una posible lectura con notas omitidas.'
              : 'Marca al menos dos notas para buscar acordes.'
            : target === 'scale'
              ? 'Un mapa de posibilidades en tu instrumento.'
              : target === 'note'
                ? 'La misma nota, en diferentes lugares.'
                : 'Explora sus notas y encuentra tu posición.'
        }}
      </p>
      <p v-if="mode === 'identify' && activeMatch?.missing?.length" class="small-note muted">
        Notas omitidas:
        {{ activeMatch.missing.map((n) => noteLabel(n, store.settings.solfege)).join(', ') }}
      </p>
      <div class="row note-list">
        <span v-for="(n, i) in resultNotes" :key="i" class="note-pill">{{
          noteLabel(n.replace(/-?\d+$/, ''), store.settings.solfege)
        }}</span>
      </div>
      <div v-if="resultIntervals.length" class="formula">
        <span>Fórmula</span><strong>{{ resultIntervals.join(' · ') }}</strong>
      </div>
      <div class="row play-actions">
        <button class="primary" :disabled="!canPlay" @click="listen(false)">
          <Play :size="15" fill="currentColor" />Escuchar</button
        ><button :disabled="!canPlay" @click="listen(true)">Arpegiar</button>
      </div>
      <div class="result-divider" />
      <button class="save-action" :disabled="!canPlay" @click="favorite">
        <Bookmark :size="16" />Guardar en biblioteca<Plus :size="14" /></button
      ><button
        class="save-action"
        :disabled="mode === 'identify' ? !activeMatch : target !== 'chord'"
        @click="addProgression"
      >
        <Plus :size="16" />Añadir a progresión<ArrowUpRight :size="14" />
      </button>
      <p v-if="notice" class="saved-notice" role="status">{{ notice }}</p>
      <details v-if="matches.length > 1 && mode === 'identify'" class="alternatives">
        <summary>Otras interpretaciones · {{ matches.length - 1 }}</summary>
        <button
          v-for="(m, i) in matches.slice(0, 16)"
          :key="m.name + i"
          :class="{ chosen: chordIndex === i }"
          @click="chordIndex = i"
        >
          {{ m.name }} <small>{{ m.exact ? 'Exacta' : 'Parcial' }}</small>
        </button>
        <p class="muted small-note">El contexto y el bajo ayudan a elegir el nombre más útil.</p>
      </details>
    </section>
  </div>
  <p v-if="error" role="alert" class="error">{{ error }}</p>
  <section class="discovery-strip">
    <div class="discovery-icon"><Info :size="20" :stroke-width="1.5" /></div>
    <div>
      <div class="eyebrow">UN POCO DE TEORÍA, MUCHA MÚSICA</div>
      <h3>Las mismas notas pueden contar historias distintas.</h3>
      <p>
        Un acorde cambia de función según su bajo y los acordes que lo rodean. Escucha, compara y
        elige tu lectura.
      </p>
    </div>
    <RouterLink to="/intervalos" class="theory-link"
      >Explorar intervalos <ArrowUpRight :size="16"
    /></RouterLink>
  </section>
  <section class="entry-tools">
    <div class="row between">
      <h2>Otras formas de explorar</h2>
      <span class="muted">Del instrumento a la idea</span>
    </div>
    <div class="tool-buttons">
      <button :class="{ chosen: capture === 'mic' }" @click="setCapture('mic')">
        <Mic :size="21" /><span>Usar el micrófono<small>Reconoce una nota a la vez</small></span
        ><ArrowUpRight :size="16" /></button
      ><button :class="{ chosen: capture === 'photo' }" @click="setCapture('photo')">
        <Camera :size="21" /><span
          >Consultar una imagen<small>Transcribe una posición al mástil</small></span
        ><ArrowUpRight :size="16" /></button
      ><button
        :class="{ chosen: capture === 'keyboard' }"
        @click="
          () => {
            setCapture('keyboard')
            mode = 'identify'
          }
        "
      >
        <Piano :size="21" /><span
          >Teclado virtual<small>Escucha e identifica otras voces</small></span
        ><ArrowUpRight :size="16" />
      </button>
    </div>
  </section>
  <section v-if="capture === 'mic'" class="panel capture-panel stack">
    <div class="row between">
      <h2>Una nota, toda tu atención</h2>
      <button class="icon-button ghost" aria-label="Cerrar micrófono" @click="setCapture('mic')">
        <X :size="18" />
      </button>
    </div>
    <p class="muted">
      Toca una sola cuerda y deja que suene. La detección de acordes simultáneos todavía no está
      disponible.
    </p>
    <div class="pitch-display">
      <strong>{{ pitch ? noteLabel(pitch.note, store.settings.solfege) : '—' }}</strong
      ><span>{{
        pitch
          ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents.toFixed(0)} cents · ${pitch.frequency.toFixed(1)} Hz`
          : listening
            ? 'Escuchando… Busca una nota sostenida.'
            : 'El micrófono solo se activa al pulsar.'
      }}</span
      ><meter
        v-if="pitch"
        :value="pitch.cents"
        min="-50"
        max="50"
        low="-5"
        high="5"
        optimum="0"
        aria-label="Desviación de afinación"
      />
    </div>
    <div>
      <button class="primary" @click="microphone">
        <Square v-if="listening" :size="16" /><Mic v-else :size="16" />{{
          listening ? 'Detener micrófono' : 'Activar micrófono'
        }}
      </button>
    </div>
    <small
      >El audio se procesa en este dispositivo. En graves, espera a que la nota se
      estabilice.</small
    >
  </section>
  <section v-if="capture === 'photo'" class="panel capture-panel stack">
    <h2>De la imagen al mástil</h2>
    <p class="muted">
      Abre un diagrama y obtén una propuesta de posiciones para revisarla. Las fotos de manos se
      transcriben manualmente en el mástil. Confirma siempre afinación, traste inicial y cuerdas al
      aire o silenciadas.
    </p>
    <div class="fields">
      <label
        >Tipo de imagen<select v-model="photoKind" @change="diagramAnalysis = null">
          <option value="diagram">Diagrama de acorde</option>
          <option value="hand">Mano sobre el instrumento</option>
        </select></label
      ><label>Imagen de referencia<input type="file" accept="image/*" @change="loadPhoto" /></label>
    </div>
    <img
      v-if="photoUrl"
      ref="photoImage"
      class="reference-photo"
      :src="photoUrl"
      alt="Imagen de referencia para transcribir el acorde"
    />
    <div v-if="photoUrl && photoKind === 'diagram'" class="stack">
      <div class="fields">
        <label
          >Primer traste del diagrama<input
            v-model.number="firstFret"
            type="number"
            min="1"
            max="36"
            @change="diagramAnalysis = null"
        /></label>
        <div class="analyze-action">
          <button :disabled="analyzing" @click="analyzePhoto">
            {{ analyzing ? 'Leyendo diagrama…' : 'Analizar diagrama' }}
          </button>
        </div>
      </div>
      <p class="muted small-note">
        Lectura experimental de diagramas verticales con líneas y puntos oscuros. Recorta el dibujo
        y sitúa la cuerda grave a la izquierda. Se procesa aquí, sin subir la imagen.
      </p>
      <div v-if="diagramAnalysis" class="stack">
        <p class="notice">{{ diagramAnalysis.message }}</p>
        <template v-if="diagramAnalysis.detected"
          ><div class="fields">
            <label v-for="(_, i) in diagramFrets" :key="i"
              >Cuerda {{ diagramFrets.length - i }} · {{ store.settings.tuning.notes[i]
              }}<select v-model="diagramFrets[i]">
                <option :value="null">Silenciada / sin confirmar</option>
                <option :value="0">Al aire</option>
                <option v-for="f in store.settings.frets - store.settings.capo" :key="f" :value="f">
                  Traste {{ f }}
                </option>
              </select></label
            >
          </div>
          <div><button class="primary" @click="applyDiagram">Confirmar posiciones</button></div>
          <small
            >Las cuerdas sin punto se proponen silenciadas. Indica las que suenan al aire antes de
            confirmar.</small
          ></template
        >
      </div>
    </div>
    <p v-if="photoKind === 'hand'" class="notice">
      La posición de los dedos no asegura qué cuerdas suenan. Indica al aire o silenciada para cada
      cuerda antes de interpretar el acorde.
    </p>
  </section>
  <section v-if="capture === 'keyboard'" class="panel capture-panel stack">
    <div class="row between">
      <h2>Un teclado, el mismo lenguaje</h2>
      <button @click="keys = []">Limpiar teclas</button>
    </div>
    <p class="muted">
      Selecciona varias teclas. El resultado de arriba mostrará los acordes posibles.
    </p>
    <div class="keyboard-scroll">
      <div class="keyboard">
        <button
          v-for="n in keyboardNotes"
          :key="n"
          :aria-pressed="keys.includes(n)"
          :aria-label="n"
          :class="{ black: black(n), pressed: keys.includes(n) }"
          @click="toggleKey(n)"
        >
          <span>{{ noteLabel(n, store.settings.solfege) }}</span>
        </button>
      </div>
    </div>
  </section>
  <section v-if="compatible.length && mode === 'identify'" class="panel compatible">
    <h2>Escalas que contienen tus notas</h2>
    <div class="row">
      <button
        v-for="s in compatible"
        :key="s.name"
        @click="
          () => {
            mode = 'explore'
            target = 'scale'
            root = s.notes[0] || 'C'
            scaleType = s.name.replace(/^[^ ]+ /, '')
          }
        "
      >
        {{ scaleLabel(s.name, store.settings.solfege) }}
      </button>
    </div>
    <p class="muted small-note">Coincidencias por notas; el contexto determina la tonalidad.</p>
  </section>
  <div class="page-bottom">
    <span class="local-dot" />Tu biblioteca se guarda en este dispositivo. Puedes llevarla contigo
    desde Biblioteca.
  </div>
</template>
<style scoped lang="scss">
@use '../styles/index' as *;
.scroll-hint {
  display: none;
  font-size: 10px;
  color: var(--muted);
  margin: 3px 0 10px;
}
.heading-dot {
  color: var(--rust);
}
.head-illustration {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  transform: rotate(-7deg);
  padding-right: 12px;
  span {
    font-family: Georgia, serif;
    font-size: 13px;
    font-style: italic;
    line-height: 1.6;
    transform: rotate(7deg);
  }
}
.explore-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 22px;
  align-items: start;
}
.instrument-panel {
  padding: 22px 24px;
}
.section-toolbar {
  margin-bottom: 23px;
}
.status-dot {
  height: 5px;
  width: 5px;
  background: var(--accent);
  border-radius: 50%;
}
.board-instruction {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  strong {
    font-size: 14px;
    font-weight: 500;
  }
  p {
    font-size: 12px;
    color: var(--muted);
    margin: 5px 0 0;
  }
  button {
    margin-left: auto;
  }
}
.step-number {
  border: 1px solid var(--line);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font:
    11px Georgia,
    serif;
  color: var(--muted);
  flex-shrink: 0;
}
.fretboard-wrap {
  margin: 7px -8px 0;
}
.board-footer {
  margin: 5px -7px 16px;
  gap: 2px;
}
.fret-nav {
  gap: 2px;
  font-size: 10px;
  color: var(--muted);
}
.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: var(--muted);
}
.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: 7px;
  &.root {
    background: var(--rust);
  }
}
.small-note {
  font-size: 11px;
  margin: 12px 0 0;
}
.result-panel {
  padding: 24px;
  min-height: 423px;
}
.result-panel .eyebrow {
  font-size: 9px;
  letter-spacing: 1.3px;
  margin: 0;
}
.result-panel .badge {
  font-size: 8px;
  padding: 4px 6px;
}
.result-chord {
  font-family: Georgia, serif;
  font-size: 58px;
  line-height: 1.2;
  letter-spacing: -2px;
  margin-top: 29px;
  overflow-wrap: anywhere;
  color: var(--accent);
  &.placeholder {
    font-size: 31px;
    letter-spacing: -0.5px;
  }
}
.result-caption {
  font-size: 11px;
  color: var(--muted);
  margin: 8px 0 19px;
  line-height: 1.6;
}
.note-list {
  gap: 7px;
}
.note-list .note-pill {
  min-width: 33px;
  min-height: 33px;
  font-size: 12px;
  border: 0;
  border-radius: 5px;
  padding: 6px 9px;
}
.formula {
  display: flex;
  gap: 16px;
  font-size: 11px;
  margin: 20px 0;
  color: var(--muted);
  strong {
    font-weight: 500;
    color: var(--text);
  }
}
.play-actions {
  gap: 8px;
  button {
    font-size: 11px;
    min-height: 40px;
  }
}
.result-divider {
  height: 1px;
  background: var(--line);
  margin: 23px 0 10px;
}
.save-action {
  border: 0;
  background: transparent;
  width: 100%;
  justify-content: flex-start;
  padding: 8px 0;
  font-size: 11px;
  color: var(--muted);
  svg:last-child {
    margin-left: auto;
  }
}
.saved-notice {
  font-size: 11px;
  color: var(--accent);
  margin: 10px 0;
}
.alternatives {
  margin-top: 12px;
  button {
    display: flex;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 6px;
  }
}
.chosen {
  background: var(--accent-soft) !important;
  border-color: var(--accent) !important;
}
.explore-controls {
  margin: 12px 0 20px;
}
.voicing-control {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 18px;
}
.discovery-strip {
  display: flex;
  gap: 17px;
  padding: 28px 2px 29px;
  border-bottom: 1px solid var(--line);
  align-items: center;
}
.discovery-icon {
  width: 39px;
  height: 39px;
  background: var(--accent-soft);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--accent);
  flex-shrink: 0;
}
.discovery-strip .eyebrow {
  font-size: 8px;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
}
.discovery-strip h3 {
  font-family: Georgia, serif;
  font-size: 17px;
  font-weight: 400;
  margin: 0 0 7px;
}
.discovery-strip p {
  font-size: 11px;
  color: var(--muted);
  margin: 0;
  max-width: 530px;
}
.theory-link {
  font-size: 11px;
  white-space: nowrap;
  text-decoration: none;
  display: flex;
  gap: 9px;
  align-items: center;
  margin-left: auto;
  color: var(--accent);
}
.entry-tools {
  padding-top: 29px;
  h2 {
    font-size: 16px;
    margin: 0;
  }
  .between > .muted {
    font-size: 10px;
  }
}
.tool-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 13px;
  margin-top: 18px;
  button {
    padding: 17px 15px;
    justify-content: flex-start;
    border-radius: 10px;
    gap: 13px;
    text-align: left;
    > svg {
      color: var(--accent);
      flex-shrink: 0;
    }
    span {
      font-size: 11px;
      font-weight: 500;
    }
    small {
      display: block;
      font-size: 9px;
      font-weight: 400;
      margin-top: 6px;
    }
    svg:last-child {
      margin-left: auto;
      width: 13px;
    }
  }
}
.capture-panel,
.compatible {
  margin-top: 22px;
}
.capture-panel h2 {
  margin: 0;
}
.capture-panel p {
  margin: 0;
}
.pitch-display {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 15px;
  padding: 15px;
  strong {
    font-family: Georgia, serif;
    font-size: 70px;
    color: var(--accent);
  }
  span {
    color: var(--muted);
  }
  meter {
    width: 220px;
  }
}
.analyze-action {
  display: flex;
  align-items: flex-end;
}
.reference-photo {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
  align-self: start;
  border-radius: 8px;
}
.keyboard-scroll {
  overflow: auto;
}
.keyboard {
  display: flex;
  width: max-content;
  padding: 5px 0 15px;
  button {
    width: 56px;
    height: 160px;
    border-radius: 0 0 6px 6px;
    align-items: flex-end;
    padding: 8px 2px;
    font-size: 9px;
    position: relative;
    flex-shrink: 0;
    background: #f3f0e3;
    color: #33483e;
  }
  .black {
    background: #293c35;
    color: #e8ecdf;
    height: 100px;
    width: 44px;
    margin: 0 -22px;
    z-index: 2;
  }
  .pressed {
    background: var(--accent);
    color: var(--surface);
    &.black {
      background: var(--rust);
    }
  }
}
@media (min-width: 1500px) {
  .explore-layout {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}
@media (max-width: 1250px) {
  .explore-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .result-panel {
    min-height: 0;
  }
  .result-chord {
    margin-top: 15px;
  }
  .head-illustration {
    display: none;
  }
  .result-panel .play-actions {
    margin-top: 15px;
  }
  .tool-buttons {
    gap: 8px;
    button {
      padding: 14px 10px;
      gap: 8px;
    }
    > button > svg:last-child {
      display: none;
    }
  }
}
@include phone {
  .scroll-hint {
    display: block;
  }
  .section-toolbar {
    gap: 10px;
    .badge {
      font-size: 9px;
    }
  }
  .segmented button {
    padding: 8px 12px;
    font-size: 12px;
  }
  .instrument-panel {
    padding: 15px;
  }
  .board-instruction p {
    font-size: 11px;
  }
  .board-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .legend {
    margin-left: 10px;
  }
  .discovery-strip {
    align-items: flex-start;
    flex-wrap: wrap;
    padding-top: 24px;
  }
  .discovery-strip > div:nth-child(2) {
    flex: 1;
  }
  .theory-link {
    margin-left: 55px;
  }
  .tool-buttons {
    grid-template-columns: 1fr;
    button {
      padding: 15px;
      font-size: 13px;
      span {
        font-size: 13px;
      }
      small {
        font-size: 11px;
      }
      svg:last-child {
        display: block;
      }
    }
  }
  .entry-tools > .between > .muted {
    display: none;
  }
  .result-panel {
    padding: 22px;
  }
  .result-chord {
    font-size: 52px;
  }
  .result-caption {
    font-size: 12px;
  }
  .play-actions button {
    font-size: 12px;
  }
  .save-action {
    font-size: 12px;
  }
  .formula {
    font-size: 12px;
  }
  .capture-panel .fields {
    grid-template-columns: 1fr;
  }
}
</style>
