<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { INSTRUMENTS, noteLabel } from '../lib/music'
import type { Instrument, Tuning } from '../lib/types'
const emit = defineEmits<{ done: [] }>()
const store = useAppStore()
const editing = ref(false)
const editId = ref('')
const name = ref('')
const notes = ref<string[]>([])
const error = ref('')
const available = computed(() => {
  const values = store.tunings.filter((t) => t.instrument === store.settings.instrument)
  const current = store.settings.tuning
  if (current.instrument === store.settings.instrument && !values.some((t) => t.id === current.id))
    values.push(current)
  return values
})
async function safeSave() {
  error.value = ''
  store.settings.frets = Math.max(12, Math.min(36, Math.round(Number(store.settings.frets) || 22)))
  store.settings.capo = Math.max(
    0,
    Math.min(12, store.settings.frets - 1, Math.round(Number(store.settings.capo) || 0)),
  )
  try {
    await store.saveSettings()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function changeInstrument() {
  store.settings.tuning = JSON.parse(JSON.stringify(available.value[0]))
  void safeSave()
}
function selectTuning(event: Event) {
  const t = available.value.find((x) => x.id === (event.target as HTMLSelectElement).value)
  if (t) {
    store.settings.tuning = JSON.parse(JSON.stringify(t))
    void safeSave()
  }
}
function edit(t?: Tuning) {
  editId.value = t?.custom ? t.id : ''
  name.value = t?.custom ? t.name : `${store.settings.tuning.name} · copia`
  notes.value = [...(t || store.settings.tuning).notes]
  editing.value = true
  error.value = ''
}
async function removeTuning() {
  try {
    await store.deleteTuning(store.settings.tuning.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
async function save() {
  try {
    const value: Tuning = {
      id: editId.value || crypto.randomUUID(),
      name: name.value.trim(),
      notes: notes.value.map((n) => n.trim()),
      instrument: store.settings.instrument,
      custom: true,
    }
    await store.saveTuning(value)
    store.settings.tuning = JSON.parse(JSON.stringify(value))
    await safeSave()
    editing.value = false
  } catch (e) {
    error.value = String(e)
  }
}
</script>
<template>
  <div class="stack settings-content">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p class="muted">
      La afinación es el punto de partida. Todas las posiciones se calculan para tu instrumento.
    </p>
    <label
      >Instrumento<select v-model="store.settings.instrument" @change="changeInstrument">
        <option v-for="(item, id) in INSTRUMENTS" :key="id" :value="id as Instrument">
          {{ item.name }}
        </option>
      </select></label
    ><label
      >Afinación<select :value="store.settings.tuning.id" @change="selectTuning">
        <option v-for="t in available" :key="t.id" :value="t.id">
          {{ t.name }}{{ t.custom ? ' · personal' : '' }}
        </option>
      </select></label
    >
    <div class="row">
      <span v-for="(n, i) in store.settings.tuning.notes" :key="i" class="note-pill">{{
        noteLabel(n, store.settings.solfege)
      }}</span>
    </div>
    <div class="row">
      <button @click="edit()">Crear afinación</button
      ><button v-if="store.settings.tuning.custom" @click="edit(store.settings.tuning)">
        Editar</button
      ><button v-if="store.settings.tuning.custom" class="danger" @click="removeTuning">
        Eliminar
      </button>
    </div>
    <form v-if="editing" class="stack tuning-editor" @submit.prevent="save">
      <h3>Afinación personal</h3>
      <label>Nombre<input v-model="name" required maxlength="80" /></label>
      <div class="fields">
        <label v-for="(_, i) in notes" :key="i"
          >Cuerda {{ notes.length - i
          }}<input v-model="notes[i]" required placeholder="E2" aria-label="Nota con octava"
        /></label>
      </div>
      <small>De la cuerda más grave a la más aguda. Usa nota y octava: E2, F#2, Bb1…</small>
      <div class="row">
        <button class="primary">Guardar afinación</button
        ><button type="button" @click="editing = false">Cancelar</button>
      </div>
    </form>
    <div class="fields">
      <label
        >Número de trastes<input
          v-model.number="store.settings.frets"
          type="number"
          min="12"
          max="36"
          @change="safeSave" /></label
      ><label
        >Cejilla · traste<input
          v-model.number="store.settings.capo"
          type="number"
          min="0"
          :max="Math.min(12, store.settings.frets - 1)"
          @change="safeSave"
      /></label>
    </div>
    <label class="check"
      ><input v-model="store.settings.leftHanded" type="checkbox" @change="safeSave" />Orientación
      para zurdos</label
    ><label class="check"
      ><input v-model="store.settings.solfege" type="checkbox" @change="safeSave" />Mostrar
      Do–Re–Mi</label
    ><label
      >Apariencia<select v-model="store.settings.theme" @change="safeSave">
        <option value="system">Según el dispositivo</option>
        <option value="light">Clara</option>
        <option value="dark">Oscura</option>
      </select></label
    ><button class="primary" @click="emit('done')">Listo, a tocar</button>
  </div>
</template>
<style scoped lang="scss">
.settings-content {
  margin-top: 25px;
}
.tuning-editor {
  padding: 18px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  h3 {
    margin: 0;
  }
}
</style>
