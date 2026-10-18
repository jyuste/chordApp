<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Guitar,
} from '@lucide/vue'
import { Note } from 'tonal'
import { useAppStore } from '../stores/app'
import {
  NOTE_NAMES,
  chordInfo,
  generateVoicings,
  positionNotes,
  noteLabel,
  romanNumeral,
  suggestHarmony,
  transposeChord,
} from '../lib/music'
import ChordDiagram from '../components/ChordDiagram.vue'
import { playNotes, playProgression, stopAudio } from '../lib/audio'
import type { InstrumentContext, KeyMode, ProgressionStep } from '../lib/types'

const store = useAppStore(),
  route = useRoute(),
  router = useRouter()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function snapshot(): InstrumentContext {
  const { instrument, tuning, frets, capo, leftHanded } = store.settings
  return { instrument, tuning: clone(tuning), frets, capo, leftHanded }
}
const makeStep = (chord: string): ProgressionStep => ({ id: crypto.randomUUID(), chord, beats: 4 })
const id = ref<string>(crypto.randomUUID()),
  name = ref('Mi primera progresión'),
  key = ref('C'),
  mode = ref<KeyMode>('major'),
  tempo = ref(90)
const steps = ref<ProgressionStep[]>(['C', 'Am', 'F', 'G'].map(makeStep))
const context = ref<InstrumentContext>(snapshot()),
  newChord = ref(''),
  shift = ref(2),
  loop = ref(false)
const playing = ref(false),
  activeStep = ref(-1),
  saving = ref(false),
  saved = ref(false),
  status = ref(''),
  error = ref('')
let playbackVersion = 0,
  loadedRouteId = '',
  incomingSignature = ''
const totalBeats = computed(() =>
  steps.value.reduce((total, step) => total + (Number.isFinite(step.beats) ? step.beats : 0), 0),
)
const duration = computed(() =>
  Number.isFinite(tempo.value) && tempo.value > 0
    ? Math.round((totalBeats.value * 60) / tempo.value)
    : 0,
)
const suggestions = computed(() => suggestHarmony(key.value, steps.value.at(-1)?.chord, mode.value))
const selectedStepId = ref<string | null>(null)
const positionIndex = ref(0)
const positionPanel = ref<HTMLElement>()
const selectedStep = computed(() => steps.value.find((step) => step.id === selectedStepId.value))
const positions = computed(() => {
  const step = selectedStep.value
  if (!step || !chordInfo(step.chord).notes.length) return []
  const generated = generateVoicings(step.chord, context.value.tuning, {
    minFret: 0,
    maxFret: context.value.frets - context.value.capo,
    maxSpan: 4,
    capo: context.value.capo,
  })
  const stored = step.voicing
  if (
    stored?.length === context.value.tuning.notes.length &&
    stored.some((f) => f !== null) &&
    stored.every(
      (f) =>
        f === null ||
        (Number.isInteger(f) && f >= 0 && f <= context.value.frets - context.value.capo),
    )
  ) {
    return [
      {
        frets: [...stored],
        notes: positionNotes(context.value.tuning, stored, context.value.capo),
        score: 0,
      },
      ...generated.filter((v) => JSON.stringify(v.frets) !== JSON.stringify(stored)),
    ]
  }
  return generated
})
const displayedPosition = computed(() => positions.value[positionIndex.value])
const positionStored = computed(
  () =>
    !!selectedStep.value?.voicing &&
    JSON.stringify(selectedStep.value.voicing) === JSON.stringify(displayedPosition.value?.frets),
)
watch(
  () => [selectedStep.value?.id, selectedStep.value?.chord, context.value],
  () => (positionIndex.value = 0),
  { deep: true },
)
async function showPositions(step: ProgressionStep) {
  selectedStepId.value = step.id
  await nextTick()
  positionPanel.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
function usePosition() {
  if (!selectedStep.value || !displayedPosition.value) return
  selectedStep.value.voicing = [...displayedPosition.value.frets]
  positionIndex.value = 0
  status.value = 'Posición elegida. Guarda la progresión para conservarla.'
}
async function hearPosition() {
  if (!displayedPosition.value) return
  stop()
  try {
    await playNotes(displayedPosition.value.notes)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo reproducir la posición.'
  }
}
const validation = computed(() => {
  if (!name.value.trim()) return 'Ponle un nombre a tu progresión.'
  if (!Number.isFinite(tempo.value) || tempo.value < 30 || tempo.value > 300)
    return 'El tempo debe estar entre 30 y 300 BPM.'
  if (!steps.value.length) return 'Añade al menos un acorde para continuar.'
  for (const [index, step] of steps.value.entries()) {
    if (!chordInfo(step.chord).notes.length)
      return `Revisa el acorde ${index + 1}: «${step.chord || 'sin nombre'}».`
    if (!Number.isFinite(step.beats) || step.beats < 0.25 || step.beats > 16)
      return `La duración del acorde ${index + 1} debe estar entre 0,25 y 16 pulsos.`
  }
  return ''
})
function stop() {
  playbackVersion++
  stopAudio()
  playing.value = false
  activeStep.value = -1
}
function resetValues() {
  stop()
  id.value = crypto.randomUUID()
  name.value = 'Mi primera progresión'
  key.value = 'C'
  mode.value = 'major'
  selectedStepId.value = null
  tempo.value = 90
  steps.value = ['C', 'Am', 'F', 'G'].map(makeStep)
  context.value = snapshot()
  saved.value = false
  newChord.value = ''
  status.value = ''
  error.value = ''
}
async function startNew() {
  loadedRouteId = ''
  incomingSignature = ''
  resetValues()
  try {
    await router.replace({ path: '/progresiones', query: {} })
  } catch {
    error.value = 'No se pudo abrir una nueva progresión.'
  }
}
function add(chord: string, voicing?: (number | null)[]) {
  const normalized = chord.trim()
  if (!chordInfo(normalized).notes.length) {
    error.value = 'No reconozco ese acorde. Prueba C, Am7, F#dim o C/E.'
    return
  }
  if (steps.value.length >= 256) {
    error.value = 'Esta progresión ya tiene 256 acordes. Crea otra para continuar.'
    return
  }
  stop()
  steps.value.push({ ...makeStep(normalized), ...(voicing ? { voicing: [...voicing] } : {}) })
  newChord.value = ''
  error.value = ''
  status.value = ''
}
function move(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= steps.value.length) return
  const step = steps.value.splice(index, 1)[0]!
  steps.value.splice(target, 0, step)
}
function remove(index: number) {
  steps.value.splice(index, 1)
}
function chordChanged(step: ProgressionStep) {
  delete step.voicing
}
async function save() {
  error.value = ''
  status.value = ''
  if (validation.value) {
    error.value = validation.value
    return
  }
  saving.value = true
  try {
    const { instrument, tuning, frets, capo, leftHanded } = context.value
    await store.saveProgression({
      id: id.value,
      name: name.value.trim(),
      key: key.value,
      mode: mode.value,
      tempo: tempo.value,
      steps: clone(steps.value),
      context: { instrument, tuning: clone(tuning), frets, capo, leftHanded },
      updatedAt: new Date().toISOString(),
    })
    saved.value = true
    status.value = 'Progresión guardada en tu biblioteca.'
    loadedRouteId = id.value
    await router.replace({ path: '/progresiones', query: { id: id.value } })
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'No se pudo guardar. Comprueba el almacenamiento del navegador.'
  } finally {
    saving.value = false
  }
}
async function play() {
  error.value = ''
  if (validation.value) {
    error.value = validation.value
    return
  }
  stop()
  const version = playbackVersion
  playing.value = true
  try {
    await playProgression(
      clone(steps.value),
      tempo.value,
      loop.value,
      (index) => {
        if (version === playbackVersion) activeStep.value = index
      },
      clone(context.value),
    )
  } catch (cause) {
    if (version === playbackVersion)
      error.value = cause instanceof Error ? cause.message : 'No se pudo iniciar el audio.'
  } finally {
    if (version === playbackVersion) {
      playing.value = false
      activeStep.value = -1
    }
  }
}
function transpose() {
  if (
    !Number.isInteger(shift.value) ||
    shift.value < -6 ||
    shift.value > 6 ||
    steps.value.some((s) => !chordInfo(s.chord).notes.length)
  ) {
    error.value = 'Revisa los acordes antes de transponer.'
    return
  }
  stop()
  const next = steps.value.map((step) => ({
    id: step.id,
    chord: transposeChord(step.chord, shift.value),
    beats: step.beats,
  }))
  const rootChord = transposeChord(key.value, shift.value)
  const chroma = Note.chroma(rootChord)
  if (next.some((step) => !step.chord) || chroma === undefined) {
    error.value = 'No se pudo transponer la progresión.'
    return
  }
  steps.value = next
  key.value = NOTE_NAMES.find((n) => Note.chroma(n) === chroma) ?? rootChord
  error.value = ''
  status.value =
    'Tonalidad y acordes transpuestos. Las posiciones guardadas se han retirado para que puedas elegir otras en la nueva tonalidad.'
}
watch(
  [steps, key, mode, tempo, name],
  () => {
    stop()
    status.value = ''
  },
  { deep: true, flush: 'sync' },
)
watch(
  () => [
    route.query.id,
    route.query.chord,
    route.query.voicing,
    route.query.chords,
    route.query.key,
    route.query.mode,
  ],
  async () => {
    error.value = ''
    const requestedId = typeof route.query.id === 'string' ? route.query.id : ''
    if (requestedId && requestedId !== loadedRouteId) {
      const progression = store.progressions.find((p) => p.id === requestedId)
      if (!progression) {
        error.value = 'No se encuentra esta progresión en la biblioteca de este dispositivo.'
        return
      }
      stop()
      id.value = progression.id
      name.value = progression.name
      key.value = progression.key
      mode.value = progression.mode ?? 'major'
      selectedStepId.value = null
      tempo.value = progression.tempo
      steps.value = clone(progression.steps)
      context.value = clone(progression.context)
      saved.value = true
      loadedRouteId = progression.id
      const { instrument, tuning, frets, capo, leftHanded } = progression.context
      Object.assign(store.settings, { instrument, tuning: clone(tuning), frets, capo, leftHanded })
      try {
        await store.saveSettings()
      } catch {
        error.value =
          'La progresión se abrió, pero no se pudieron guardar los ajustes del instrumento.'
      }
    } else if (!requestedId && loadedRouteId) {
      loadedRouteId = ''
      resetValues()
    }
    if (!requestedId && typeof route.query.chords === 'string') {
      const signature = JSON.stringify([
        'pattern',
        route.query.chords,
        route.query.key,
        route.query.mode,
      ])
      if (signature === incomingSignature) return
      try {
        const pattern: unknown = JSON.parse(route.query.chords)
        const root = typeof route.query.key === 'string' ? Note.get(route.query.key) : Note.get('C')
        const nextMode = route.query.mode ?? 'major'
        if (
          !Array.isArray(pattern) ||
          !pattern.length ||
          pattern.length > 16 ||
          pattern.some((c) => typeof c !== 'string' || !chordInfo(c).notes.length) ||
          root.empty ||
          root.oct !== undefined ||
          (nextMode !== 'major' && nextMode !== 'minor')
        )
          throw new Error()
        stop()
        steps.value = pattern.map(makeStep)
        key.value = root.pc
        mode.value = nextMode
        name.value = `Recorrido en ${root.pc} ${nextMode === 'minor' ? 'menor' : 'mayor'}`
        context.value = snapshot()
        saved.value = false
        selectedStepId.value = null
        incomingSignature = signature
      } catch {
        error.value =
          'No se pudo abrir este recorrido. Revisa los acordes y la tonalidad del enlace.'
      }
      return
    }
    const incoming = typeof route.query.chord === 'string' ? route.query.chord : ''
    if (!incoming) {
      incomingSignature = ''
      return
    }
    const signature = JSON.stringify([requestedId, incoming, route.query.voicing])
    if (signature === incomingSignature) return
    incomingSignature = signature
    let voicing: (number | null)[] | undefined
    if (typeof route.query.voicing === 'string') {
      try {
        const parsed: unknown = JSON.parse(route.query.voicing)
        if (
          Array.isArray(parsed) &&
          parsed.length === context.value.tuning.notes.length &&
          parsed.every(
            (f) =>
              f === null ||
              (Number.isInteger(f) && f >= 0 && f <= context.value.frets - context.value.capo),
          )
        )
          voicing = parsed
        else throw new Error()
      } catch {
        error.value = 'La posición recibida no es válida. Se añadirá solo el acorde.'
      }
    }
    const positionError = error.value
    add(incoming, voicing)
    if (positionError) error.value = positionError
  },
  { immediate: true },
)
onUnmounted(stop)
</script>

<template>
  <div class="page-head">
    <div>
      <div class="eyebrow">DE UN ACORDE A UNA HISTORIA</div>
      <h1>Dale forma a tu próxima idea<span class="heading-dot">.</span></h1>
      <p>Conecta acordes, escucha el recorrido y encuentra tu propio camino.</p>
    </div>
    <button class="new-button" @click="startNew"><Plus :size="16" />Nueva progresión</button>
  </div>
  <div class="composer-layout">
    <section class="panel composer-panel">
      <div class="row between composer-heading">
        <div class="eyebrow">TU MESA DE COMPOSICIÓN</div>
        <span class="badge">{{ saved ? 'En tu biblioteca' : 'Nueva idea' }}</span>
      </div>
      <label class="name-field"
        >Nombre de la progresión<input
          v-model="name"
          maxlength="160"
          placeholder="Ponle nombre a tu idea"
      /></label>
      <div class="fields setup-fields">
        <label
          >Tónica<select v-model="key">
            <option v-if="!NOTE_NAMES.includes(key)" :value="key">{{ key }}</option>
            <option v-for="note in NOTE_NAMES" :key="note" :value="note">
              {{ noteLabel(note, store.settings.solfege) }}
            </option>
          </select></label
        ><label
          >Modo<select v-model="mode">
            <option value="major">Mayor</option>
            <option value="minor">Menor</option>
          </select></label
        ><label
          >Tempo · BPM<input v-model.number="tempo" type="number" min="30" max="300" step="1"
        /></label>
        <div class="context-note">
          <Music2 :size="17" />
          <div>
            {{ context.tuning.name
            }}<small
              >{{ context.tuning.notes.length }} cuerdas ·
              {{ context.capo ? `Cejilla ${context.capo}` : 'Sin cejilla' }}</small
            >
          </div>
        </div>
      </div>
      <div class="sequence-heading row between">
        <h2>Tu secuencia</h2>
        <span class="muted">{{ steps.length }} acordes · {{ totalBeats }} pulsos</span>
      </div>
      <div v-if="!steps.length" class="sequence-empty">
        <Music2 :size="28" />
        <p>Todo empieza con un acorde.</p>
        <span>Añádelo abajo o elige una sugerencia.</span>
      </div>
      <ol v-else class="sequence" aria-label="Secuencia de acordes">
        <li
          v-for="(step, index) in steps"
          :key="step.id"
          class="chord-step"
          :class="{
            sounding: playing && activeStep === index,
            invalid: !chordInfo(step.chord).notes.length,
            inspected: selectedStepId === step.id,
          }"
          :aria-current="playing && activeStep === index ? 'step' : undefined"
        >
          <div class="row between step-header">
            <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span
            ><button
              class="icon-button ghost remove-step"
              :aria-label="`Eliminar acorde ${index + 1}`"
              @click="remove(index)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
          <label class="chord-input"
            ><span class="sr-only">Acorde {{ index + 1 }}</span
            ><input
              v-model="step.chord"
              :aria-invalid="!chordInfo(step.chord).notes.length"
              maxlength="40"
              placeholder="Cmaj7"
              @input="chordChanged(step)"
              @focus="showPositions(step)"
              @click="showPositions(step)"
          /></label>
          <span class="roman">{{ romanNumeral(step.chord, key, mode) || 'Revisa el acorde' }}</span>
          <button
            class="position-trigger"
            :aria-label="`Ver posiciones de ${step.chord}, acorde ${index + 1}`"
            :aria-expanded="selectedStepId === step.id"
            aria-controls="chord-position-panel"
            @click="showPositions(step)"
          >
            <Guitar :size="14" />Ver posiciones
          </button>
          <label class="beats-field"
            >Pulsos<input
              v-model.number="step.beats"
              type="number"
              min=".25"
              max="16"
              step=".25"
              :aria-label="`Pulsos del acorde ${index + 1}`"
          /></label>
          <div class="row between step-footer">
            <span>{{ step.voicing ? 'Posición guardada' : 'Voz armónica' }}</span>
            <div class="row">
              <button
                class="icon-button ghost"
                :disabled="index === 0"
                :aria-label="`Mover acorde ${index + 1} a la izquierda`"
                @click="move(index, -1)"
              >
                <ArrowLeft :size="14" /></button
              ><button
                class="icon-button ghost"
                :disabled="index === steps.length - 1"
                :aria-label="`Mover acorde ${index + 1} a la derecha`"
                @click="move(index, 1)"
              >
                <ArrowRight :size="14" />
              </button>
            </div>
          </div>
        </li>
      </ol>
      <section
        v-if="selectedStep"
        id="chord-position-panel"
        ref="positionPanel"
        class="position-panel"
        aria-labelledby="position-heading"
      >
        <div class="row between position-heading">
          <div>
            <div class="eyebrow">DEL ACORDE AL INSTRUMENTO</div>
            <h2 id="position-heading">Posiciones de {{ selectedStep.chord || 'tu acorde' }}</h2>
          </div>
          <button
            class="icon-button ghost"
            aria-label="Cerrar posiciones"
            @click="selectedStepId = null"
          >
            <X :size="18" />
          </button>
        </div>
        <template v-if="displayedPosition">
          <div class="position-content">
            <ChordDiagram
              :name="selectedStep.chord"
              :tuning="context.tuning"
              :frets="displayedPosition.frets"
              :capo="context.capo"
              :left-handed="context.leftHanded"
            />
            <div class="position-details">
              <span class="badge">{{
                positionStored ? 'Posición guardada' : 'Posición sugerida'
              }}</span>
              <p class="muted">
                {{ context.tuning.name
                }}<span v-if="context.capo"> · Cejilla {{ context.capo }}</span>
              </p>
              <div class="row position-notes">
                <span v-for="(note, i) in displayedPosition.notes" :key="i" class="note-pill">{{
                  noteLabel(note, store.settings.solfege)
                }}</span>
              </div>
              <div class="row position-navigation">
                <button
                  class="icon-button"
                  aria-label="Posición anterior"
                  :disabled="positionIndex === 0"
                  @click="positionIndex--"
                >
                  <ChevronLeft :size="16" /></button
                ><span>Posición {{ positionIndex + 1 }} de {{ positions.length }}</span
                ><button
                  class="icon-button"
                  aria-label="Posición siguiente"
                  :disabled="positionIndex >= positions.length - 1"
                  @click="positionIndex++"
                >
                  <ChevronRight :size="16" />
                </button>
              </div>
              <div class="row">
                <button @click="hearPosition"><Play :size="14" />Escuchar posición</button
                ><button class="primary" :disabled="positionStored" @click="usePosition">
                  {{ positionStored ? 'Ya está elegida' : 'Usar esta posición' }}
                </button>
              </div>
              <p class="position-help">
                ×: cuerda silenciada · ○: al aire. La posición elegida se usará al reproducir la
                progresión.
              </p>
            </div>
          </div>
        </template>
        <p v-else class="notice">
          {{
            chordInfo(selectedStep.chord).notes.length
              ? 'No hay una posición completa para este acorde con esta afinación y una extensión de cuatro trastes. Algunos acordes extendidos necesitan más notas que cuerdas disponibles.'
              : 'Escribe un acorde válido para ver sus posiciones.'
          }}
        </p>
      </section>
      <form class="add-chord row" @submit.prevent="add(newChord)">
        <label
          ><span class="sr-only">Añadir acorde por nombre</span
          ><input v-model="newChord" placeholder="C, Am7, F#dim, C/E…" maxlength="40" /></label
        ><button :disabled="!newChord.trim() || steps.length >= 256">
          <Plus :size="16" />Añadir acorde
        </button>
      </form>
      <div class="transport row between">
        <div class="row">
          <button class="primary" :disabled="!steps.length" @click="playing ? stop() : play()">
            <Pause v-if="playing" :size="16" /><Play v-else :size="16" fill="currentColor" />{{
              playing ? 'Detener' : 'Escuchar progresión'
            }}</button
          ><button
            class="loop-button"
            :class="{ enabled: loop }"
            :aria-pressed="loop"
            @click="
              () => {
                loop = !loop
                stop()
              }
            "
          >
            <Repeat2 :size="16" />Bucle
          </button>
        </div>
        <span class="duration">{{ duration }} s <span>por vuelta</span></span>
      </div>
      <div class="save-row row between">
        <p>Tu idea se guarda en este dispositivo.</p>
        <button :disabled="saving" @click="save">
          <Check v-if="saving" :size="16" /><Bookmark v-else :size="16" />{{
            saving ? 'Guardando…' : saved ? 'Guardar cambios' : 'Guardar progresión'
          }}
        </button>
      </div>
    </section>
    <aside class="composer-sidebar">
      <section class="panel suggestions-panel">
        <div class="eyebrow">UN POSIBLE SIGUIENTE PASO</div>
        <h2>¿Hacia dónde vamos?</h2>
        <p class="muted">
          Escucha las posibilidades de {{ noteLabel(key, store.settings.solfege) }}
          {{ mode === 'minor' ? 'menor' : 'mayor' }}.
        </p>
        <div class="suggestions">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion.chord + suggestion.reason"
            class="suggestion"
            :class="suggestion.kind"
            :title="suggestion.reason"
            @click="add(suggestion.chord)"
          >
            <span class="row between"
              ><strong>{{ suggestion.chord }}</strong
              ><Plus :size="14" /></span
            ><small>{{ suggestion.reason }}</small>
          </button>
        </div>
        <p class="suggestion-note">
          La tensión es una posibilidad expresiva. La melodía, el bajo y tu oído deciden qué
          funciona.
        </p>
      </section>
      <section class="panel transpose-panel">
        <div class="eyebrow">LA MISMA IDEA, OTRO COLOR</div>
        <h2>Cambia de tonalidad</h2>
        <p class="muted">Mueve juntos todos los acordes y la tonalidad.</p>
        <div class="row">
          <label
            ><span class="sr-only">Semitonos de transposición</span
            ><select v-model.number="shift">
              <option v-for="amount in 13" :key="amount" :value="amount - 7">
                {{ amount - 7 > 0 ? '+' : '' }}{{ amount - 7 }} semitonos
              </option>
            </select></label
          ><button
            class="icon-button"
            aria-label="Transponer progresión"
            :disabled="!shift || !steps.length"
            @click="transpose"
          >
            <RotateCcw :size="17" />
          </button>
        </div>
      </section>
    </aside>
  </div>
  <p v-if="error" class="error notice" role="alert">{{ error }}</p>
  <p v-if="status" class="notice" role="status">{{ status }}</p>
  <div class="page-bottom">
    <span class="local-dot" />Un acorde abre una puerta. El siguiente decide el paisaje.
  </div>
</template>

<style scoped lang="scss">
.position-trigger {
  width: 100%;
  font-size: 11px;
  min-height: 44px;
  margin: 5px 0;
  color: var(--accent);
}
.chord-step.inspected {
  border-color: var(--accent);
}
.position-panel {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  scroll-margin-block: 18px;
}
.position-heading {
  margin-bottom: 10px;
  .eyebrow {
    font-size: 8px;
    margin-bottom: 7px;
  }
  h2 {
    margin: 0;
    font-size: 19px;
    font-family: Georgia, serif;
    font-weight: 400;
  }
}
.position-content {
  display: grid;
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}
.position-details {
  min-width: 0;
  > .muted {
    font-size: 11px;
    margin: 12px 0;
  }
  button {
    font-size: 11px;
  }
}
.position-notes {
  gap: 5px;
  .note-pill {
    min-width: 32px;
    min-height: 32px;
    padding: 5px;
    font-size: 11px;
  }
}
.position-navigation {
  margin: 16px 0;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.position-help {
  font-size: 11px;
  line-height: 1.6;
  color: var(--muted);
  margin: 15px 0 0;
}
@media (max-width: 600px) {
  .position-content {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .position-content > :first-child {
    justify-self: center;
  }
  .position-panel {
    padding: 12px;
  }
}
.heading-dot {
  color: var(--rust);
}
.new-button {
  white-space: nowrap;
}
.composer-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 285px;
  gap: 22px;
  align-items: start;
}
.composer-panel {
  padding: 25px;
}
.composer-heading {
  margin-bottom: 24px;
}
.composer-heading .eyebrow {
  margin: 0;
  font-size: 9px;
}
.name-field {
  display: grid;
  gap: 9px;
  font-size: 11px;
  color: var(--muted);
  input {
    font-family: Georgia, serif;
    font-size: 24px;
    color: var(--text);
    padding: 10px 0;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    width: 100%;
  }
}
.setup-fields {
  margin-top: 23px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 100px;
  .context-note {
    grid-column: 1 / -1;
    padding-top: 0;
  }
  gap: 15px;
}
.context-note {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 11px;
  color: var(--accent);
  padding-top: 17px;
  small {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-top: 5px;
  }
}
.sequence-heading {
  margin-top: 33px;
  margin-bottom: 16px;
  h2 {
    margin: 0;
    font-size: 17px;
  }
  .muted {
    font-size: 10px;
  }
}
.sequence {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.chord-step {
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 12px 12px 7px;
  background: var(--surface);
  transition:
    background 0.2s,
    border-color 0.2s;
  &.sounding {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  &.invalid {
    border-color: var(--rust);
  }
}
.step-header {
  gap: 3px;
}
.step-number {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--muted);
}
.remove-step {
  opacity: 0.6;
  min-height: 26px;
  width: 26px;
  padding: 4px !important;
}
.chord-input input {
  font:
    32px Georgia,
    serif;
  color: var(--accent);
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 5px 0;
  border-radius: 0;
  min-height: 48px;
}
.roman {
  display: block;
  color: var(--rust);
  font-size: 12px;
  min-height: 22px;
}
.beats-field {
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  margin: 12px 0;
  color: var(--muted);
  input {
    width: 65px;
    padding: 6px;
    font-size: 12px;
    min-height: 32px;
  }
}
.step-footer {
  border-top: 1px solid var(--line);
  padding-top: 6px;
  gap: 2px;
  > span {
    font-size: 8px;
    color: var(--muted);
  }
  > .row {
    gap: 0;
  }
  .icon-button {
    width: 25px;
    min-height: 27px;
    padding: 4px;
  }
}
.add-chord {
  margin-top: 16px;
  gap: 9px;
  label {
    flex: 1;
    min-width: 0;
  }
  input {
    width: 100%;
    font-size: 12px;
  }
  button {
    font-size: 11px;
    white-space: nowrap;
  }
}
.transport {
  border-top: 1px solid var(--line);
  margin-top: 25px;
  padding-top: 23px;
  gap: 12px;
  flex-wrap: wrap;
  > .row {
    gap: 8px;
  }
  button {
    font-size: 11px;
  }
}
.loop-button {
  color: var(--muted);
  &.enabled {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--accent);
  }
}
.duration {
  font-family: Georgia, serif;
  font-size: 21px;
  color: var(--accent);
  span {
    font:
      10px -apple-system,
      sans-serif;
    color: var(--muted);
    margin-left: 4px;
  }
}
.save-row {
  border-top: 1px solid var(--line);
  margin-top: 22px;
  padding-top: 18px;
  gap: 12px;
  flex-wrap: wrap;
  p {
    font-size: 10px;
    color: var(--muted);
    margin: 0;
  }
  button {
    font-size: 11px;
  }
}
.composer-sidebar {
  display: grid;
  gap: 18px;
}
.suggestions-panel,
.transpose-panel {
  padding: 23px;
  h2 {
    font-family: Georgia, serif;
    font-weight: 400;
    font-size: 23px;
    margin: 15px 0 10px;
  }
  .eyebrow {
    font-size: 8px;
    letter-spacing: 1.4px;
  }
  .muted {
    font-size: 11px;
    line-height: 1.7;
  }
}
.suggestions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 20px;
  max-height: 510px;
  overflow: auto;
  padding: 1px;
}
.suggestion {
  display: block;
  text-align: left;
  min-width: 0;
  padding: 10px 9px;
  border-radius: 7px;
  strong {
    font:
      19px Georgia,
      serif;
    color: var(--accent);
  }
  small {
    font-size: 9px;
    line-height: 1.5;
    display: block;
    color: var(--muted);
    margin-top: 6px;
  }
  .row {
    gap: 3px;
  }
  &.tension strong {
    color: var(--rust);
  }
  &.resolution {
    background: var(--accent-soft);
  }
}
.suggestion-note {
  font-size: 10px;
  color: var(--muted);
  line-height: 1.7;
  margin-bottom: 0;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.transpose-panel > .row {
  gap: 8px;
  margin-top: 16px;
  label {
    flex: 1;
    min-width: 0;
  }
  select {
    width: 100%;
    font-size: 11px;
  }
}
.sequence-empty {
  text-align: center;
  padding: 35px 15px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  p {
    font-family: Georgia, serif;
    font-size: 22px;
    color: var(--text);
  }
  span {
    font-size: 12px;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 1200px) {
  .composer-layout {
    grid-template-columns: 1fr;
  }
  .composer-sidebar {
    grid-template-columns: minmax(0, 1fr) 260px;
    align-items: start;
  }
  .suggestions {
    grid-template-columns: repeat(3, 1fr);
    max-height: 340px;
  }
  .setup-fields {
    grid-template-columns: 1fr 110px 1fr;
  }
}
@media (max-width: 680px) {
  .page-head {
    flex-wrap: wrap;
    gap: 18px;
  }
  .composer-panel {
    padding: 18px;
  }
  .setup-fields {
    grid-template-columns: 1fr 100px;
  }
  .context-note {
    grid-column: 1/-1;
    padding-top: 0;
  }
  .sequence {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .composer-sidebar {
    grid-template-columns: 1fr;
  }
  .suggestions {
    grid-template-columns: repeat(2, 1fr);
  }
  .sequence-heading .muted {
    font-size: 9px;
  }
  .add-chord {
    flex-wrap: wrap;
    label {
      flex-basis: 100%;
    }
    button {
      width: 100%;
    }
  }
  .transport > .row {
    flex-wrap: wrap;
  }
  .save-row {
    align-items: flex-start;
    flex-direction: column;
    button {
      width: 100%;
    }
  }
  .name-field input {
    font-size: 22px;
  }
  .new-button {
    font-size: 12px;
  }
  .duration {
    font-size: 19px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chord-step {
    transition: none;
  }
}
</style>
