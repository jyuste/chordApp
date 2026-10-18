<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Note } from 'tonal'
import { describeInterval, NOTE_NAMES, noteLabel } from '../lib/music'
import { playNotes, stopAudio } from '../lib/audio'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const from = ref('A')
const to = ref('F#')
const audioError = ref('')
const playing = ref(false)

const presets = [
  { from: 'A', to: 'F#' },
  { from: 'C', to: 'G' },
  { from: 'C', to: 'F#' },
  { from: 'E', to: 'G' },
  { from: 'C4', to: 'D5' },
]

type Calculation =
  | { valid: false; error: string }
  | { valid: true; fromNote: string; toNote: string; info: ReturnType<typeof describeInterval> }

function parsedNote(value: string) {
  return Note.get(value.trim().replaceAll('♯', '#').replaceAll('♭', 'b'))
}

const calculation = computed<Calculation>(() => {
  const a = parsedNote(from.value)
  const b = parsedNote(to.value)
  if (!from.value.trim() || !to.value.trim() || a.empty || b.empty) {
    return { valid: false, error: 'Escribe dos notas válidas, como A y F# o C4 y D5.' }
  }
  if ((a.oct !== undefined) !== (b.oct !== undefined)) {
    return {
      valid: false,
      error: 'Indica la octava en las dos notas o en ninguna, por ejemplo A3 y F#4.',
    }
  }

  let fromNote = a.name ?? from.value.trim()
  let toNote = b.name ?? to.value.trim()
  if (a.oct === undefined) {
    fromNote = `${a.pc}3`
    toNote = Note.transpose(fromNote, describeInterval(a.pc, b.pc).symbol)
  }
  return { valid: true, fromNote, toNote, info: describeInterval(fromNote, toNote) }
})

const harmonicHint = computed(() => {
  if (!calculation.value.valid) return ''
  const interval = calculation.value.info
  const tonic = noteLabel(parsedNote(from.value).pc, store.settings.solfege)
  if (Math.abs(interval.semitones) % 12 === 9 && /6M|13M/.test(interval.symbol))
    return `Sobre un acorde de ${tonic}, esta nota puede funcionar como sexta o trecena (6/13). Su efecto depende de las otras notas y de cómo se resuelve.`
  if ([1, 6, 11].includes(Math.abs(interval.semitones) % 12))
    return 'Esta distancia puede aportar tensión. Su grado de disonancia depende del registro, el timbre, las otras notas y la resolución: escúchala en contexto.'
  return 'Prueba esta distancia dentro de un acorde o una progresión. La consonancia y la tensión dependen también del contexto musical.'
})

function choosePreset(preset: { from: string; to: string }) {
  from.value = preset.from
  to.value = preset.to
  audioError.value = ''
}

function swapNotes() {
  ;[from.value, to.value] = [to.value, from.value]
  audioError.value = ''
}

async function listen(arpeggio: boolean) {
  if (!calculation.value.valid) return
  audioError.value = ''
  playing.value = true
  try {
    await playNotes([calculation.value.fromNote, calculation.value.toNote], arpeggio)
  } catch (error) {
    audioError.value =
      error instanceof Error ? error.message : 'No se pudo reproducir el intervalo.'
  } finally {
    playing.value = false
  }
}

onUnmounted(stopAudio)
</script>

<template>
  <div class="intervals-view">
    <header class="page-head">
      <div>
        <div class="eyebrow">Escucha la distancia</div>
        <h1>Entre una nota y otra.</h1>
        <p>Elige dos notas y descubre cómo suena el espacio que las separa.</p>
      </div>
    </header>

    <section class="note-panel" aria-label="Notas del intervalo">
      <div class="note-fields">
        <label for="interval-from"
          >Nota de referencia
          <input
            id="interval-from"
            v-model="from"
            list="interval-note-names"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="A o A3"
            aria-describedby="interval-note-help"
          />
        </label>
        <button
          class="swap-button"
          type="button"
          aria-label="Intercambiar notas"
          title="Intercambiar notas"
          @click="swapNotes"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4v15m0 0-4-4m4 4 4-4M17 20V5m0 0-4 4m4-4 4 4" />
          </svg>
        </button>
        <label for="interval-to"
          >Nota de destino
          <input
            id="interval-to"
            v-model="to"
            list="interval-note-names"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="F# o F#4"
            aria-describedby="interval-note-help"
          />
        </label>
        <datalist id="interval-note-names">
          <option v-for="note in NOTE_NAMES" :key="note" :value="note" />
        </datalist>
      </div>
      <p id="interval-note-help" class="input-help">
        Puedes escribir alteraciones o añadir octavas, por ejemplo C4 y D5.
      </p>

      <div class="preset-row" aria-label="Ejemplos de intervalos">
        <span>Prueba:</span>
        <button
          v-for="preset in presets"
          :key="`${preset.from}-${preset.to}`"
          class="preset"
          type="button"
          :aria-label="`${preset.from} → ${preset.to}`"
          @click="choosePreset(preset)"
        >
          {{ noteLabel(preset.from, store.settings.solfege) }} <span aria-hidden="true">→</span>
          {{ noteLabel(preset.to, store.settings.solfege) }}
        </button>
      </div>
    </section>

    <section v-if="calculation.valid" class="interval-result" aria-live="polite" aria-atomic="true">
      <div class="result-copy">
        <span class="result-overline"
          >{{ noteLabel(calculation.fromNote, store.settings.solfege) }}
          <span aria-hidden="true">→</span>
          {{ noteLabel(calculation.toNote, store.settings.solfege) }}</span
        >
        <h2>{{ calculation.info.name }}</h2>
        <p>{{ calculation.info.explanation }}</p>
        <p class="harmonic-hint">{{ harmonicHint }}</p>
        <div class="listen-actions">
          <button class="primary" type="button" :disabled="playing" @click="listen(false)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" /></svg
            >Escuchar juntas
          </button>
          <button type="button" :disabled="playing" @click="listen(true)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h2m3-4v8m4-11v14m4-11v8m4-4h-1" /></svg
            >Escuchar sucesivas
          </button>
        </div>
        <p v-if="audioError" class="error audio-error" role="alert">{{ audioError }}</p>
      </div>
      <div
        class="result-detail"
        :aria-label="`${Math.abs(calculation.info.semitones)} semitonos, ${calculation.info.direction}`"
      >
        <span class="detail-number">{{ Math.abs(calculation.info.semitones) }}</span>
        <span class="detail-unit">semitonos</span>
        <span class="direction-badge">{{ calculation.info.direction }}</span>
        <span class="interval-symbol">{{ calculation.info.symbol }}</span>
      </div>
    </section>
    <p v-else class="error interval-error" role="alert">{{ calculation.error }}</p>

    <p class="page-bottom">
      <span class="note-pill">Do–Si</span> La misma distancia puede sonar diferente al subirla o
      recorrerla nota a nota.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/index' as *;

.intervals-view {
  max-width: 1000px;
}
.page-head {
  margin-bottom: 28px;
}
.page-head p {
  max-width: 58ch;
}
.note-panel {
  padding: 26px 28px 21px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.note-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
  align-items: end;
  gap: 19px;
}
.note-fields label {
  color: var(--text);
  font-size: 13px;
}
.note-fields input {
  margin-top: 1px;
  font-size: 18px;
  font-weight: 600;
}
.swap-button {
  width: 44px;
  padding: 0;
  color: var(--muted);
}
.swap-button svg,
.listen-actions svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}
.input-help {
  margin: 11px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 21px;
  padding-top: 17px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.preset {
  min-height: 38px;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
}
.preset span {
  color: var(--muted);
  padding: 0 3px;
}
.interval-result {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 205px;
  align-items: center;
  gap: 30px;
  padding: 31px 34px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.result-overline {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.result-overline span {
  margin: 0 5px;
}
.result-copy h2 {
  margin: 9px 0 8px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 31px;
  font-weight: 400;
  letter-spacing: -0.6px;
  text-transform: lowercase;
}
.harmonic-hint {
  margin-top: 14px;
  max-width: 65ch;
}
.result-copy p {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 0;
}
.listen-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 23px;
}
.listen-actions button {
  min-height: 44px;
  font-size: 12px;
}
.result-detail {
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 12px;
  border-radius: 12px;
  background: var(--accent-soft);
  text-align: center;
}
.detail-number {
  color: var(--accent);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 51px;
  line-height: 1;
}
.detail-unit {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
}
.direction-badge {
  margin-top: 12px;
  padding: 5px 9px;
  border-radius: 20px;
  background: var(--surface);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}
.interval-symbol {
  margin-top: 8px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.interval-error {
  margin: 15px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.audio-error {
  margin-top: 13px !important;
}
.page-bottom {
  margin-top: 24px;
  font-size: 12px;
}
.page-bottom .note-pill {
  min-width: auto;
  min-height: 28px;
  margin-right: 5px;
  padding: 4px 8px;
  color: var(--accent);
  font-size: 10px;
  vertical-align: middle;
}

@include phone {
  .note-panel {
    padding: 19px 17px;
  }
  .note-fields {
    grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
    gap: 8px;
  }
  .note-fields label {
    font-size: 11px;
  }
  .note-fields input {
    min-width: 0;
    padding: 10px;
    font-size: 16px;
  }
  .swap-button {
    width: 40px;
  }
  .preset-row {
    gap: 6px;
  }
  .preset {
    min-height: 36px;
    padding: 5px 8px;
  }
  .interval-result {
    grid-template-columns: 1fr;
    gap: 22px;
    padding: 23px 19px;
  }
  .result-copy h2 {
    font-size: 28px;
  }
  .result-detail {
    min-height: 120px;
  }
  .detail-number {
    font-size: 43px;
  }
}
</style>
