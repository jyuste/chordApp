<script setup lang="ts">
import { computed } from 'vue'
import { Note } from 'tonal'
import { noteLabel } from '../lib/music'

type WheelKey = {
  major: string
  minor: string
  accidentals: number
  kind: 'sharp' | 'flat' | 'natural'
}
type Mode = 'major' | 'minor'

const props = withDefaults(
  defineProps<{
    keys: WheelKey[]
    selected?: number
    mode?: Mode
    solfege?: boolean
  }>(),
  { selected: 0, mode: 'major', solfege: false },
)
const emit = defineEmits<{ select: [index: number, mode: Mode] }>()

const center = 260
const majorOuter = 238
const majorInner = 174
const minorOuter = 170
const minorInner = 112
const order = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
const orderedKeys = computed(() => {
  const byPitch = new Map<number, number>()
  props.keys.forEach((key, index) => {
    const pitch = Note.chroma(key.major)
    if (pitch !== undefined && !byPitch.has(pitch)) byPitch.set(pitch, index)
  })
  return order.map((pitch) => byPitch.get(pitch) ?? -1)
})

function point(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) }
}

function sectorPath(inner: number, outer: number, start: number, end: number) {
  const a = point(outer, start)
  const b = point(outer, end)
  const c = point(inner, end)
  const d = point(inner, start)
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`
}

const wedges = computed(() =>
  Array.from({ length: 12 }, (_, slot) => {
    const index = orderedKeys.value[slot] ?? -1
    const angle = -90 + slot * 30
    return {
      slot,
      index,
      majorPath: sectorPath(majorInner, majorOuter, angle - 14, angle + 14),
      minorPath: sectorPath(minorInner, minorOuter, angle - 14, angle + 14),
      majorPoint: point((majorInner + majorOuter) / 2, angle),
      minorPoint: point((minorInner + minorOuter) / 2, angle),
    }
  }),
)

function label(index: number, mode: Mode) {
  if (index < 0 || !props.keys[index]) return ''
  const note = mode === 'major' ? props.keys[index].major : props.keys[index].minor
  const name = noteLabel(note, props.solfege)
  return mode === 'minor' ? `${name}m` : name
}

function ariaLabel(index: number, mode: Mode) {
  if (index < 0 || !props.keys[index]) return 'Tonalidad no disponible'
  const note = mode === 'major' ? props.keys[index].major : props.keys[index].minor
  return `${noteLabel(note, props.solfege)} ${mode === 'major' ? 'mayor' : 'menor'}`
}

function activate(index: number, mode: Mode) {
  if (index >= 0) emit('select', index, mode)
}

function onKeydown(event: KeyboardEvent, index: number, mode: Mode) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activate(index, mode)
  }
}

const selectedName = computed(() => label(props.selected, props.mode))
</script>

<template>
  <figure class="fifths-wheel">
    <svg class="wheel" viewBox="0 0 520 520" role="group" aria-label="Círculo de quintas">
      <g v-for="wedge in wedges" :key="`major-${wedge.slot}`">
        <g
          v-if="wedge.index >= 0"
          class="key-sector major-sector"
          :class="{
            selected: selected === wedge.index && mode === 'major',
            paired: selected === wedge.index && mode === 'minor',
          }"
          role="button"
          :tabindex="0"
          :aria-label="ariaLabel(wedge.index, 'major')"
          :aria-pressed="selected === wedge.index && mode === 'major'"
          @click="activate(wedge.index, 'major')"
          @keydown="onKeydown($event, wedge.index, 'major')"
        >
          <path :d="wedge.majorPath" />
          <text :x="wedge.majorPoint.x" :y="wedge.majorPoint.y">
            {{ label(wedge.index, 'major') }}
          </text>
          <circle
            v-if="selected === wedge.index && mode === 'major'"
            class="selection-dot"
            :cx="wedge.majorPoint.x"
            :cy="wedge.majorPoint.y + 18"
            r="3"
          />
        </g>
        <g
          v-if="wedge.index >= 0"
          class="key-sector minor-sector"
          :class="{
            selected: selected === wedge.index && mode === 'minor',
            paired: selected === wedge.index && mode === 'major',
          }"
          role="button"
          :tabindex="0"
          :aria-label="ariaLabel(wedge.index, 'minor')"
          :aria-pressed="selected === wedge.index && mode === 'minor'"
          @click="activate(wedge.index, 'minor')"
          @keydown="onKeydown($event, wedge.index, 'minor')"
        >
          <path :d="wedge.minorPath" />
          <text :x="wedge.minorPoint.x" :y="wedge.minorPoint.y">
            {{ label(wedge.index, 'minor') }}
          </text>
          <circle
            v-if="selected === wedge.index && mode === 'minor'"
            class="selection-dot"
            :cx="wedge.minorPoint.x"
            :cy="wedge.minorPoint.y + 15"
            r="3"
          />
        </g>
      </g>
      <circle class="center-disc" :cx="center" :cy="center" r="105" />
      <text class="center-key" :x="center" :y="center - 3">{{ selectedName }}</text>
      <text class="center-mode" :x="center" :y="center + 22">
        {{ mode === 'major' ? 'mayor' : 'menor' }}
      </text>
    </svg>
    <figcaption>
      <span>Mayores · anillo exterior</span><span>Menores · anillo interior</span>
    </figcaption>
  </figure>
</template>

<style scoped lang="scss">
.fifths-wheel {
  width: 100%;
  max-width: 560px;
  min-width: 0;
  margin: 0 auto;
}

.wheel {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.key-sector {
  cursor: pointer;
  outline: none;
}

.key-sector path {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 2;
  transition:
    fill 140ms ease,
    stroke 140ms ease,
    stroke-width 140ms ease;
}

.minor-sector path {
  fill: color-mix(in srgb, var(--surface) 86%, var(--accent) 14%);
}

.key-sector:hover path {
  fill: color-mix(in srgb, var(--surface) 70%, var(--accent) 30%);
}

.key-sector text {
  fill: var(--text);
  font: 600 18px sans-serif;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}

.minor-sector text {
  font-size: 15px;
}

.key-sector.selected path {
  fill: var(--accent);
  stroke: var(--accent);
  stroke-width: 3;
}

.key-sector.selected text {
  fill: var(--surface);
}

.key-sector.paired path {
  stroke: var(--accent);
  stroke-width: 3;
}

.key-sector:focus-visible path {
  stroke: var(--rust);
  stroke-width: 4;
}

.selection-dot {
  fill: currentColor;
  pointer-events: none;
}

.center-disc {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 2;
}

.center-key,
.center-mode {
  fill: var(--text);
  text-anchor: middle;
  dominant-baseline: central;
}

.center-key {
  font: 700 27px sans-serif;
}

.center-mode {
  fill: var(--muted);
  font: 13px sans-serif;
}

figcaption {
  display: flex;
  justify-content: center;
  gap: 1rem;
  color: var(--muted);
  font-size: 0.78rem;
}

@media (max-width: 380px) {
  .key-sector text {
    font-size: 15px;
  }

  .minor-sector text {
    font-size: 13px;
  }
}
</style>
