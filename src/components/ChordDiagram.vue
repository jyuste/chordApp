<script setup lang="ts">
import { computed } from 'vue'
import { fretNote, noteLabel } from '../lib/music'
import type { Tuning } from '../lib/types'

const props = withDefaults(
  defineProps<{
    tuning: Tuning
    frets: (number | null)[]
    capo?: number
    leftHanded?: boolean
    name?: string
  }>(),
  { capo: 0, leftHanded: false, name: '' },
)

const width = 260
const height = 310
const left = 32
const right = 248
const top = 48
const bottom = 267
const count = computed(() => Math.max(1, props.tuning.notes.length))
const stringXs = computed(() =>
  Array.from({ length: count.value }, (_, visualIndex) => {
    const index = props.leftHanded ? count.value - visualIndex - 1 : visualIndex
    return {
      index,
      x:
        count.value === 1
          ? (left + right) / 2
          : left + ((right - left) * visualIndex) / (count.value - 1),
    }
  }),
)
const maxPressed = computed(() =>
  Math.max(0, ...props.frets.map((fret) => (Number.isInteger(fret) && fret !== null ? fret : 0))),
)
const boundedMax = computed(() => Math.min(36, maxPressed.value))
const startFret = computed(() => {
  if (boundedMax.value <= 5) return 1
  const pressed = props.frets.filter((f): f is number => f !== null && f > 0 && f <= 36)
  return pressed.length ? Math.min(...pressed) : 36
})
const visibleCount = computed(() =>
  Math.max(5, Math.min(36, boundedMax.value - startFret.value + 1)),
)
const fretYs = computed(() =>
  Array.from(
    { length: visibleCount.value + 1 },
    (_, i) => top + ((bottom - top) * i) / visibleCount.value,
  ),
)
const placements = computed(() =>
  stringXs.value.flatMap(({ index, x }) => {
    const fret = props.frets[index]
    if (fret === undefined || (fret !== null && (!Number.isInteger(fret) || fret < 0 || fret > 36)))
      return []
    if (fret === null) return [{ index, x, fret: -1, y: top - 18 }]
    if (fret === 0) return [{ index, x, fret, y: top - 18 }]
    if (fret < startFret.value || fret >= startFret.value + visibleCount.value) return []
    const y = top + ((bottom - top) * (fret - startFret.value + 0.5)) / visibleCount.value
    return [{ index, x, fret, y }]
  }),
)
const caption = computed(() =>
  props.capo > 0 ? 'Trastes relativos a la cejilla' : 'Diagrama de acordes',
)
const accessibleLabel = computed(() => {
  const positions = stringXs.value.map(({ index }) => {
    const fret = props.frets[index]
    const stringName = noteLabel(fretNote(props.tuning.notes[index] || '', 0, props.capo)) || `cuerda ${index + 1}`
    const position =
      fret === null || fret === undefined
        ? 'silenciada, ×'
        : fret === 0
          ? 'al aire, 0'
          : `traste ${fret}`
    return `${stringName}: ${position}`
  })
  return `${props.name ? `${props.name}. ` : ''}${positions.join('; ')}`
})
</script>

<template>
  <figure class="chord-diagram">
    <svg
      class="diagram"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-label="accessibleLabel"
      preserveAspectRatio="xMidYMin meet"
    >
      <g class="frets">
        <line
          v-for="(y, i) in fretYs"
          :key="`f${i}`"
          :x1="left"
          :x2="right"
          :y1="y"
          :y2="y"
          :class="{ nut: startFret === 1 && i === 0 }"
        />
      </g>
      <g class="strings">
        <line
          v-for="string in stringXs"
          :key="string.index"
          :x1="string.x"
          :x2="string.x"
          :y1="top"
          :y2="bottom"
        />
      </g>
      <g class="fret-labels">
        <text
          v-for="i in visibleCount"
          :key="`label${i}`"
          x="5"
          :y="top + ((bottom - top) * (i - 0.5)) / visibleCount + 4"
        >
          {{ startFret + i - 1 }}
        </text>
      </g>
      <g class="markers">
        <template v-for="point in placements" :key="point.index">
          <circle v-if="point.fret > 0" :cx="point.x" :cy="point.y" r="10" />
          <text v-else-if="point.fret === 0" class="open" :x="point.x" :y="point.y">○</text>
          <text v-else class="muted" :x="point.x" :y="point.y">×</text>
        </template>
      </g>
      <g class="note-strip">
        <text v-for="string in stringXs" :key="`note${string.index}`" :x="string.x" y="292">
          {{ noteLabel(fretNote(tuning.notes[string.index] || '', 0, capo)) }}
        </text>
      </g>
    </svg>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>

<style scoped lang="scss">
.chord-diagram {
  width: 100%;
  max-width: 260px;
  margin: 0 auto;
  color: var(--text);
  text-align: center;
}

.diagram {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.frets line,
.strings line {
  stroke: var(--line);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.frets line.nut {
  stroke: var(--text);
  stroke-width: 4;
}

.fret-labels text {
  fill: var(--muted);
  font: 11px sans-serif;
}

.markers circle {
  fill: var(--accent);
}

.markers text {
  fill: var(--text);
  font: 21px sans-serif;
  text-anchor: middle;
  dominant-baseline: central;
}

.markers text.open {
  font-size: 20px;
}

.markers text.muted {
  fill: var(--rust);
  font-weight: 700;
}

.note-strip text {
  fill: var(--muted);
  font: 11px sans-serif;
  text-anchor: middle;
}

figcaption {
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
