<script setup lang="ts">
import { computed } from 'vue'
import { Interval, Note } from 'tonal'
import { fretNote, noteLabel } from '../lib/music'
import type { Tuning } from '../lib/types'

const props = withDefaults(
  defineProps<{
    tuning: Tuning
    modelValue: (number | null)[]
    capo?: number
    leftHanded?: boolean
    highlights?: string[]
    root?: string
    solfege?: boolean
    mode?: 'identify' | 'explore'
    startFret?: number
    visibleFrets?: number
    labels?: 'notes' | 'degrees'
  }>(),
  {
    capo: 0,
    leftHanded: false,
    highlights: () => [],
    root: '',
    solfege: false,
    mode: 'identify',
    startFret: 1,
    visibleFrets: 5,
    labels: 'notes',
  },
)

const emit = defineEmits<{
  'update:modelValue': [frets: (number | null)[]]
  note: [note: string]
}>()

const view = { left: 150, top: 70, fretWidth: 92, stringGap: 44, bottom: 28 }
const stringCount = computed(() => props.tuning.notes.length)
const width = computed(() => view.left + view.fretWidth * Math.max(1, props.visibleFrets) + 24)
const height = computed(
  () => view.top + Math.max(1, stringCount.value - 1) * view.stringGap + view.bottom,
)
const rightEdge = computed(() => view.left + view.fretWidth * Math.max(1, props.visibleFrets))
const rows = computed(() =>
  Array.from({ length: stringCount.value }, (_, visualIndex) => {
    const index = stringCount.value - visualIndex - 1
    return { index, y: view.top + visualIndex * view.stringGap, note: props.tuning.notes[index] }
  }),
)
const fretNumbers = computed(() =>
  Array.from({ length: Math.max(1, props.visibleFrets) }, (_, i) => props.startFret + i),
)
const markers = computed(() => {
  const points = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]
  return fretNumbers.value.flatMap((fret) => {
    const position = fret - props.startFret
    if (position < 0 || position >= props.visibleFrets || !points.includes(fret)) return []
    const x = cellX(position) + view.fretWidth / 2
    const middleY = view.top + ((stringCount.value - 1) * view.stringGap) / 2
    return fret === 12 || fret === 24
      ? [
          { x, y: middleY - 10 },
          { x, y: middleY + 10 },
        ]
      : [{ x, y: middleY }]
  })
})

function cellX(position: number) {
  return (
    view.left + (props.leftHanded ? props.visibleFrets - position - 1 : position) * view.fretWidth
  )
}

const pitchClass = (note: string) => Note.chroma(note)
const rootChroma = computed(() => (props.root ? pitchClass(props.root) : null))
const highlightChromas = computed(
  () =>
    new Set(
      props.highlights.map(pitchClass).filter((n): n is number => n !== undefined && n !== null),
    ),
)

function noteAt(stringIndex: number, fret: number) {
  return fretNote(props.tuning.notes[stringIndex], fret + props.capo)
}

function displayLabel(note: string) {
  const spelled =
    props.highlights.find((n) => pitchClass(n) === pitchClass(note)) || Note.pitchClass(note)
  if (props.labels === 'degrees' && props.root) {
    const iv = Interval.get(Interval.distance(Note.pitchClass(props.root), spelled))
    if (!iv.empty) {
      const simple = ((Math.abs(iv.num) - 1) % 7) + 1
      const normal = [1, 4, 5].includes(simple) ? 'P' : 'M'
      const accidental =
        iv.q === normal
          ? ''
          : iv.q === 'A'
            ? '♯'
            : iv.q === 'm'
              ? '♭'
              : iv.q === 'd'
                ? [1, 4, 5].includes(simple)
                  ? '♭'
                  : '♭♭'
                : ''
      return `${accidental}${simple}`
    }
  }
  return noteLabel(spelled, props.solfege)
}

function isHighlighted(note: string) {
  const chroma = pitchClass(note)
  return chroma !== undefined && chroma !== null && highlightChromas.value.has(chroma)
}

function isRoot(note: string) {
  const chroma = pitchClass(note)
  return rootChroma.value !== null && chroma === rootChroma.value
}

function toggleFret(index: number, fret: number) {
  const note = noteAt(index, fret)
  if (props.mode === 'explore') {
    emit('note', note)
    return
  }
  const next = [...props.modelValue]
  next[index] = (next[index] ?? null) === fret ? null : fret
  emit('update:modelValue', next)
}

function toggleOpen(index: number) {
  const note = noteAt(index, 0)
  if (props.mode === 'explore') {
    emit('note', note)
    return
  }
  const next = [...props.modelValue]
  next[index] = next[index] === 0 ? null : 0
  emit('update:modelValue', next)
}

function toggleMuted(index: number) {
  if (props.mode === 'explore') return
  const next = [...props.modelValue]
  next[index] = next[index] === null ? 0 : null
  emit('update:modelValue', next)
}

function onKey(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

function ariaFor(note: string, location: string) {
  return `${noteLabel(note, props.solfege)}, ${location}${props.mode === 'explore' ? ', escuchar nota' : ', seleccionar'}`
}
</script>

<template>
  <div class="fretboard-scroll">
    <svg
      class="fretboard"
      :viewBox="`0 0 ${width} ${height}`"
      role="group"
      :aria-label="`Mástil, ${tuning.name}${leftHanded ? ', orientación para zurdos' : ''}`"
      :style="{ '--string-count': stringCount }"
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ead8b7" />
          <stop offset=".48" stop-color="#f1e2c8" />
          <stop offset="1" stop-color="#e7d2ad" />
        </linearGradient>
        <linearGradient id="neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#906a45" />
          <stop offset="1" stop-color="#6c4c32" />
        </linearGradient>
      </defs>

      <text class="fret-number" x="30" y="42">SILENCIO</text>
      <text class="fret-number" x="108" y="42">AL AIRE</text>
      <text
        v-for="(fret, i) in fretNumbers"
        :key="`number-${fret}`"
        class="fret-number"
        :x="cellX(i) + view.fretWidth / 2"
        y="42"
      >
        {{ fret }}
      </text>

      <rect
        class="neck"
        :x="view.left"
        :y="view.top - 8"
        :width="rightEdge - view.left"
        :height="Math.max(1, stringCount - 1) * view.stringGap + 16"
        rx="7"
      />
      <rect
        class="fingerboard"
        :x="view.left + 4"
        :y="view.top - 5"
        :width="rightEdge - view.left - 4"
        :height="Math.max(1, stringCount - 1) * view.stringGap + 10"
        rx="4"
      />

      <g class="position-markers" aria-hidden="true">
        <circle
          v-for="(marker, i) in markers"
          :key="`marker-${i}`"
          :cx="marker.x"
          :cy="marker.y"
          r="5.5"
        />
      </g>

      <g v-for="(fret, i) in fretNumbers" :key="`fret-${fret}`">
        <line
          class="fret-wire"
          :x1="view.left + (leftHanded ? visibleFrets - i - 1 : i) * view.fretWidth"
          :x2="view.left + (leftHanded ? visibleFrets - i - 1 : i) * view.fretWidth"
          :y1="view.top - 6"
          :y2="view.top + (stringCount - 1) * view.stringGap + 6"
        />
      </g>
      <line
        class="nut"
        :x1="leftHanded ? rightEdge - 3 : view.left + 3"
        :x2="leftHanded ? rightEdge - 3 : view.left + 3"
        :y1="view.top - 6"
        :y2="view.top + (stringCount - 1) * view.stringGap + 6"
      />

      <g v-for="row in rows" :key="`string-${row.index}`">
        <text class="string-name" x="60" :y="row.y + 4">{{ noteLabel(row.note, solfege) }}</text>
        <line
          class="string-line"
          :class="{ wound: row.index < 3 }"
          :x1="view.left + 4"
          :x2="rightEdge"
          :y1="row.y"
          :y2="row.y"
          :stroke-width="1.15 + (stringCount - row.index) * 0.28"
        />

        <g
          class="control open-control"
          :class="{
            selected: modelValue[row.index] === 0,
            highlighted: mode === 'explore' && isHighlighted(noteAt(row.index, 0)),
            root: isRoot(noteAt(row.index, 0)),
          }"
          role="button"
          tabindex="0"
          :aria-label="ariaFor(noteAt(row.index, 0), `cuerda ${stringCount - row.index} al aire`)"
          @click="toggleOpen(row.index)"
          @keydown="onKey($event, () => toggleOpen(row.index))"
        >
          <circle class="hit-area" cx="108" :cy="row.y" r="22" />
          <circle class="open-ring" cx="108" :cy="row.y" r="7" />
          <text
            v-if="
              modelValue[row.index] === 0 ||
              (mode === 'explore' && isHighlighted(noteAt(row.index, 0)))
            "
            class="selected-label"
            x="108"
            :y="row.y + 4"
          >
            {{ displayLabel(noteAt(row.index, 0)) }}
          </text>
        </g>
        <g
          class="control mute-control"
          :class="{ selected: modelValue[row.index] === null }"
          role="button"
          tabindex="0"
          :aria-label="`Silenciar cuerda ${stringCount - row.index}, ${row.note}`"
          @click="toggleMuted(row.index)"
          @keydown="onKey($event, () => toggleMuted(row.index))"
        >
          <circle class="hit-area" cx="24" :cy="row.y" r="22" />
          <template v-if="modelValue[row.index] === null">
            <line class="mute-mark" x1="18" :y1="row.y - 6" x2="30" :y2="row.y + 6" />
            <line class="mute-mark" x1="30" :y1="row.y - 6" x2="18" :y2="row.y + 6" />
          </template>
          <text v-else class="mute-x" x="24" :y="row.y + 4">×</text>
        </g>

        <g v-for="(fret, fretIndex) in fretNumbers" :key="`cell-${row.index}-${fret}`">
          <g
            class="control fret-control"
            :class="{
              selected: modelValue[row.index] === fret,
              highlighted: isHighlighted(noteAt(row.index, fret)),
              root: isRoot(noteAt(row.index, fret)),
            }"
            role="button"
            tabindex="0"
            :aria-label="
              ariaFor(noteAt(row.index, fret), `cuerda ${stringCount - row.index}, traste ${fret}`)
            "
            @click="toggleFret(row.index, fret)"
            @keydown="onKey($event, () => toggleFret(row.index, fret))"
          >
            <rect
              class="hit-area cell-hit"
              :x="cellX(fretIndex) + 2"
              :y="row.y - 22"
              :width="view.fretWidth - 4"
              height="44"
              rx="7"
            />
            <circle
              v-if="isHighlighted(noteAt(row.index, fret)) || modelValue[row.index] === fret"
              class="note-marker"
              :cx="cellX(fretIndex) + view.fretWidth / 2"
              :cy="row.y"
              r="14"
            />
            <text
              v-if="isHighlighted(noteAt(row.index, fret)) || modelValue[row.index] === fret"
              class="note-label"
              :x="cellX(fretIndex) + view.fretWidth / 2"
              :y="row.y + 4"
            >
              {{ displayLabel(noteAt(row.index, fret)) }}
            </text>
          </g>
        </g>
      </g>

      <rect
        v-if="capo > 0"
        class="capo"
        :x="leftHanded ? rightEdge - 8 : view.left - 4"
        :y="view.top - 9"
        width="8"
        :height="(stringCount - 1) * view.stringGap + 18"
        rx="4"
      />
      <text
        v-if="capo > 0"
        class="capo-label"
        :x="leftHanded ? rightEdge - 4 : view.left"
        :y="height - 4"
      >
        CAPO {{ capo }}
      </text>
    </svg>
  </div>
</template>

<style scoped lang="scss">
.fretboard-scroll {
  width: 100%;
  overflow-x: auto;
  padding: 2px 0 8px;
  scrollbar-color: #c7b79c transparent;
}

.fretboard {
  display: block;
  width: 100%;
  min-width: 700px;
  height: auto;
  overflow: visible;
  color: var(--text, #352e27);
  font-family: inherit;
}

.neck {
  fill: url(#neck);
}
.fingerboard {
  fill: url(#wood);
}
.fret-number {
  fill: var(--muted, #85796b);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-anchor: middle;
}
.string-name {
  fill: var(--muted, #74675a);
  font-size: 12px;
  font-weight: 700;
  text-anchor: start;
}
.fret-wire {
  stroke: #8c7155;
  stroke-width: 1.4;
  opacity: 0.7;
}
.nut {
  stroke: #f7edda;
  stroke-width: 4;
  stroke-linecap: round;
}
.string-line {
  stroke: #897d6c;
  opacity: 0.9;
}
.string-line.wound {
  stroke: #615b53;
}
.position-markers circle {
  fill: #b39a76;
  opacity: 0.42;
}
.open-control.selected .open-ring,
.open-control.highlighted .open-ring {
  fill: var(--accent);
  stroke: var(--accent);
  r: 14;
}
.open-control.root.selected .open-ring,
.open-control.root.highlighted .open-ring {
  fill: var(--rust);
  stroke: var(--rust);
}
.open-ring {
  fill: none;
  stroke: #83786b;
  stroke-width: 1.8;
}
.mute-x {
  fill: #918578;
  font-size: 19px;
  font-weight: 400;
  text-anchor: middle;
}
.selected-label {
  fill: #f9f6ec;
  font-size: 8px;
  font-weight: 700;
  text-anchor: middle;
}
.mute-mark {
  stroke: #b64f3b;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.control {
  cursor: pointer;
  outline: none;
}
.hit-area {
  fill: transparent;
}
.cell-hit {
  pointer-events: all;
}
.fret-control .note-marker {
  fill: #4f8064;
  stroke: #f7edda;
  stroke-width: 1.5;
}
.fret-control .note-label {
  fill: #f9f6ec;
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
  pointer-events: none;
}
.fret-control.highlighted .note-marker {
  fill: #4f8064;
}
.fret-control.root .note-marker {
  fill: #bd6248;
}
.fret-control.selected:not(.root) .note-marker {
  fill: var(--accent, #4f8064);
}
.fret-control:focus-visible .cell-hit,
.open-control:focus-visible .hit-area,
.mute-control:focus-visible .hit-area {
  stroke: #bf6047;
  stroke-width: 2;
}
.fret-control:not(.highlighted):not(.selected):focus-visible .cell-hit {
  fill: #bf604714;
}
.capo {
  fill: #aa563f;
  opacity: 0.9;
}
.capo-label {
  fill: #aa563f;
  font-size: 9px;
  font-weight: 700;
  text-anchor: middle;
}

@media (max-width: 640px) {
  .fretboard {
    min-width: 700px;
  }
}
</style>
