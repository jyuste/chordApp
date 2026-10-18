<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Bookmark,
  Music2,
  Guitar,
  Download,
  Upload,
  Play,
  Square,
  Trash2,
  Copy,
  ArrowUpRight,
  FolderOpen,
  Check,
  X,
  ShieldCheck,
} from '@lucide/vue'
import { Note } from 'tonal'
import { useAppStore } from '../stores/app'
import { parseBackup } from '../lib/backup'
import { chordInfo, getScale, INSTRUMENTS, noteLabel, positionNotes } from '../lib/music'
import { playNotes, playProgression, stopAudio } from '../lib/audio'
import type { Backup, Favorite, Progression, Tuning } from '../lib/types'

const store = useAppStore()
type Section = 'favorites' | 'progressions' | 'tunings'
const section = ref<Section>('favorites')
const tabs = computed(() => [
  { id: 'favorites' as Section, label: 'Favoritos', count: store.favorites.length, icon: Bookmark },
  {
    id: 'progressions' as Section,
    label: 'Progresiones',
    count: store.progressions.length,
    icon: Music2,
  },
  {
    id: 'tunings' as Section,
    label: 'Afinaciones',
    count: store.customTunings.length,
    icon: Guitar,
  },
])
const favorites = computed(() =>
  [...store.favorites].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
const progressions = computed(() =>
  [...store.progressions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
)
const notice = ref('')
const error = ref('')
const deleting = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement>()
const preview = ref<Backup | null>(null)
const filename = ref('')
const playing = ref('')
let audioToken = 0
function clearMessages() {
  error.value = ''
  notice.value = ''
}
function stop() {
  audioToken++
  stopAudio()
  playing.value = ''
}
onBeforeUnmount(stop)
function rootName(value: string) {
  const aliases: Record<string, string> = {
    do: 'C',
    re: 'D',
    mi: 'E',
    fa: 'F',
    sol: 'G',
    la: 'A',
    si: 'B',
  }
  return value.replace(
    /^(Do|Re|Mi|Fa|Sol|La|Si)(?=[#b♯♭\s\d]|$)/i,
    (root) => aliases[root.toLowerCase()]!,
  )
}
function favoriteNotes(item: Favorite): string[] {
  if (item.notes?.length) return [...item.notes]
  if (item.frets?.some((f) => f !== null))
    return positionNotes(item.context.tuning, item.frets, item.context.capo)
  const name = rootName(item.name)
  if (item.kind === 'scale') {
    const match = /^([A-G](?:#|b|♯|♭)?)\s+(.+)$/i.exec(name)
    if (!match) return []
    const types: Record<string, string> = {
      mayor: 'major',
      menor: 'minor',
      'menor natural': 'minor',
      cromática: 'chromatic',
      dórica: 'dorian',
      frigia: 'phrygian',
      lidia: 'lydian',
      mixolidia: 'mixolydian',
      locria: 'locrian',
      'pentatónica mayor': 'major pentatonic',
      'pentatónica menor': 'minor pentatonic',
      'menor armónica': 'harmonic minor',
      'menor melódica': 'melodic minor',
    }
    return getScale(match[1]!, types[match[2]!.toLowerCase()] ?? match[2]!).notes.map(
      (n) => `${n}3`,
    )
  }
  const chord = chordInfo(name)
  if (chord.notes.length) return chord.notes.map((n) => `${n}3`)
  const note = Note.get(name)
  return note.empty ? [] : [note.oct === undefined ? `${note.pc}3` : note.name]
}
function labels(notes: string[]) {
  return notes.map((n) => noteLabel(n, store.settings.solfege)).join(' · ')
}
function kindLabel(item: Favorite) {
  return { chord: 'Acorde', scale: 'Escala', position: 'Posición' }[item.kind]
}
async function listenFavorite(item: Favorite) {
  if (playing.value === item.id) {
    stop()
    return
  }
  stop()
  clearMessages()
  const token = audioToken
  playing.value = item.id
  try {
    const notes = favoriteNotes(item)
    if (!notes.length)
      throw new Error(
        'No se han podido recuperar las notas. Abre este favorito en Explorar para revisar su nombre.',
      )
    await playNotes(notes, item.kind === 'scale')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (token === audioToken) playing.value = ''
  }
}
async function listenProgression(item: Progression) {
  if (playing.value === item.id) {
    stop()
    return
  }
  stop()
  clearMessages()
  const token = audioToken
  playing.value = item.id
  try {
    await playProgression(item.steps, item.tempo, false, undefined, item.context)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (token === audioToken) playing.value = ''
  }
}
async function remove(kind: Section, id: string) {
  clearMessages()
  busy.value = true
  try {
    if (playing.value === id) stop()
    if (kind === 'favorites') await store.deleteFavorite(id)
    else if (kind === 'progressions') await store.deleteProgression(id)
    else await store.deleteTuning(id)
    deleting.value = ''
    notice.value = 'Eliminado de tu biblioteca.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function duplicate(item: Progression | Tuning, kind: 'progressions' | 'tunings') {
  clearMessages()
  busy.value = true
  try {
    const copy = JSON.parse(JSON.stringify(item)) as Progression | Tuning
    copy.id = crypto.randomUUID()
    copy.name = `${copy.name.slice(0, 150)} (copia)`
    if (kind === 'progressions') {
      const p = copy as Progression
      p.updatedAt = new Date().toISOString()
      p.steps.forEach((step) => {
        step.id = crypto.randomUUID()
      })
      await store.saveProgression(p)
    } else await store.saveTuning(copy as Tuning)
    notice.value = 'Copia guardada. La original sigue en tu biblioteca.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
function exportLibrary() {
  clearMessages()
  try {
    const data = store.exportBackup()
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `entrecuerdas-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = 'Copia preparada. Guárdala en un lugar seguro para poder recuperar tu música.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
async function selectFile(event: Event) {
  clearMessages()
  preview.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error(
        'El archivo supera los 5 MB. Elige una copia JSON de Entrecuerdas más pequeña.',
      )
    preview.value = parseBackup(await file.text())
    filename.value = file.name
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function confirmImport() {
  if (!preview.value) return
  clearMessages()
  busy.value = true
  try {
    stop()
    const result = await store.importBackup(preview.value)
    notice.value = `Importación completada: ${result.added} elementos añadidos y ${result.conflicts} conflictos conservados como copia. Los elementos idénticos se han omitido.`
    preview.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="library-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">TU BIBLIOTECA</div>
        <h1>Tu música, a mano.</h1>
        <p>Tus descubrimientos, guardados en este dispositivo. Sin cuentas.</p>
      </div>
      <div class="library-symbol" aria-hidden="true">
        <Bookmark :size="27" :stroke-width="1.3" />
      </div>
    </header>
    <div class="library-layout">
      <section class="collection" aria-label="Tu colección">
        <div class="collection-tabs" aria-label="Filtrar biblioteca">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :aria-pressed="section === tab.id"
            :class="{ active: section === tab.id }"
            @click="
              () => {
                section = tab.id
                deleting = ''
              }
            "
          >
            <component :is="tab.icon" :size="16" /><span>{{ tab.label }}</span
            ><small>{{ tab.count }}</small>
          </button>
        </div>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <p v-if="error" class="error notice" role="alert">{{ error }}</p>
        <div v-if="section === 'favorites'" class="item-list">
          <article v-for="item in favorites" :key="item.id" class="saved-item panel">
            <div class="item-top">
              <span class="badge">{{ kindLabel(item) }}</span
              ><span class="item-instrument">{{ INSTRUMENTS[item.context.instrument].name }}</span>
            </div>
            <h2>{{ item.name }}</h2>
            <p class="saved-notes">
              {{ labels(favoriteNotes(item)) || 'Abre el favorito para revisar sus notas' }}
            </p>
            <p class="context-line">
              {{ item.context.tuning.name
              }}<span v-if="item.context.capo"> · Cejilla {{ item.context.capo }}</span>
            </p>
            <div class="item-actions">
              <button
                class="small"
                :disabled="!favoriteNotes(item).length"
                @click="listenFavorite(item)"
              >
                <Square v-if="playing === item.id" :size="14" /><Play v-else :size="14" />{{
                  playing === item.id ? 'Detener' : 'Escuchar'
                }}</button
              ><RouterLink :to="{ path: '/', query: { favorite: item.id } }" class="text-link"
                >Explorar<ArrowUpRight :size="14" /></RouterLink
              ><button
                class="ghost icon-button delete-button"
                :aria-label="`Eliminar favorito ${item.name}`"
                @click="deleting = 'favorites:' + item.id"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <div v-if="deleting === 'favorites:' + item.id" class="delete-confirm">
              <p>¿Eliminar este favorito?</p>
              <div class="row">
                <button class="small danger" :disabled="busy" @click="remove('favorites', item.id)">
                  Sí, eliminar</button
                ><button class="small ghost" @click="deleting = ''">Cancelar</button>
              </div>
            </div>
          </article>
          <div v-if="!favorites.length" class="empty panel">
            <Bookmark :size="29" :stroke-width="1.2" />
            <h2>Aquí empiezan tus ideas.</h2>
            <p>
              Guarda un acorde, una escala o una posición desde Explorar. La próxima vez, estarán
              aquí.
            </p>
            <RouterLink to="/" class="explore-link"
              >Ir a Explorar <ArrowUpRight :size="15"
            /></RouterLink>
          </div>
        </div>
        <div v-else-if="section === 'progressions'" class="item-list">
          <article v-for="item in progressions" :key="item.id" class="saved-item panel">
            <div class="item-top">
              <span class="badge">Progresión</span
              ><span class="item-instrument"
                >{{ item.tempo }} BPM · {{ item.key }}
                {{ item.mode === 'minor' ? 'menor' : 'mayor' }}</span
              >
            </div>
            <h2>{{ item.name }}</h2>
            <p class="chord-sequence">
              {{ item.steps.map((step) => step.chord).join(' → ') || 'Sin acordes todavía' }}
            </p>
            <p class="context-line">
              {{ INSTRUMENTS[item.context.instrument].name }} · {{ item.context.tuning.name }}
            </p>
            <div class="item-actions">
              <button class="small" :disabled="!item.steps.length" @click="listenProgression(item)">
                <Square v-if="playing === item.id" :size="14" /><Play v-else :size="14" />{{
                  playing === item.id ? 'Detener' : 'Escuchar'
                }}</button
              ><RouterLink :to="{ path: '/progresiones', query: { id: item.id } }" class="text-link"
                >Editar<ArrowUpRight :size="14" /></RouterLink
              ><button
                class="ghost icon-button"
                :disabled="busy"
                :aria-label="`Duplicar progresión ${item.name}`"
                @click="duplicate(item, 'progressions')"
              >
                <Copy :size="16" /></button
              ><button
                class="ghost icon-button delete-button"
                :aria-label="`Eliminar progresión ${item.name}`"
                @click="deleting = 'progressions:' + item.id"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <div v-if="deleting === 'progressions:' + item.id" class="delete-confirm">
              <p>¿Eliminar esta progresión?</p>
              <div class="row">
                <button
                  class="small danger"
                  :disabled="busy"
                  @click="remove('progressions', item.id)"
                >
                  Sí, eliminar</button
                ><button class="small ghost" @click="deleting = ''">Cancelar</button>
              </div>
            </div>
          </article>
          <div v-if="!progressions.length" class="empty panel">
            <Music2 :size="29" :stroke-width="1.2" />
            <h2>Una idea lleva a otra.</h2>
            <p>
              Combina acordes y guarda tus primeras progresiones para seguir desarrollándolas
              después.
            </p>
            <RouterLink to="/progresiones" class="explore-link"
              >Crear una progresión <ArrowUpRight :size="15"
            /></RouterLink>
          </div>
        </div>
        <div v-else class="item-list">
          <article v-for="item in store.customTunings" :key="item.id" class="saved-item panel">
            <div class="item-top">
              <span class="badge">Personal</span
              ><span class="item-instrument">{{ INSTRUMENTS[item.instrument].name }}</span>
            </div>
            <h2>{{ item.name }}</h2>
            <p class="saved-notes">{{ labels(item.notes) }}</p>
            <p class="context-line">De la cuerda más grave a la más aguda.</p>
            <div class="item-actions">
              <button class="small" :disabled="busy" @click="duplicate(item, 'tunings')">
                <Copy :size="14" />Duplicar</button
              ><button
                class="ghost icon-button delete-button"
                :aria-label="`Eliminar afinación ${item.name}`"
                @click="deleting = 'tunings:' + item.id"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <div v-if="deleting === 'tunings:' + item.id" class="delete-confirm">
              <p>¿Eliminar esta afinación? Tus favoritos conservan sus posiciones y afinación.</p>
              <div class="row">
                <button class="small danger" :disabled="busy" @click="remove('tunings', item.id)">
                  Sí, eliminar</button
                ><button class="small ghost" @click="deleting = ''">Cancelar</button>
              </div>
            </div>
          </article>
          <div v-if="!store.customTunings.length" class="empty panel">
            <Guitar :size="30" :stroke-width="1.2" />
            <h2>Encuentra tu propia afinación.</h2>
            <p>
              Las afinaciones que crees en «Mi instrumento» aparecerán aquí. Las afinaciones
              incluidas siguen disponibles allí.
            </p>
          </div>
        </div>
      </section>
      <aside class="backup-panel panel">
        <div class="backup-icon"><FolderOpen :size="22" :stroke-width="1.4" /></div>
        <h2>Que tus ideas se queden.</h2>
        <p>Descarga una copia de tu biblioteca y llévala a otro navegador o dispositivo.</p>
        <button class="primary" @click="exportLibrary">
          <Download :size="16" />Exportar biblioteca</button
        ><button :disabled="busy" @click="fileInput?.click()">
          <Upload :size="16" />Importar una copia</button
        ><input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Archivo de copia de seguridad"
          @change="selectFile"
        /><small>Archivo JSON · hasta 5 MB</small>
        <div class="local-note">
          <ShieldCheck :size="17" />
          <p>
            Todo se guarda en este navegador. Si borras sus datos o cambias de dispositivo,
            necesitarás una copia para recuperarlo.
          </p>
        </div>
      </aside>
    </div>
    <section v-if="preview" class="import-preview panel" aria-labelledby="import-title">
      <div class="row between">
        <div>
          <div class="eyebrow">REVISAR ANTES DE IMPORTAR</div>
          <h2 id="import-title">Tu copia está lista.</h2>
        </div>
        <button
          class="ghost icon-button"
          :disabled="busy"
          aria-label="Cancelar importación"
          @click="preview = null"
        >
          <X :size="19" />
        </button>
      </div>
      <p class="filename">{{ filename }}</p>
      <div class="preview-counts">
        <div>
          <strong>{{ preview.favorites.length }}</strong
          ><span>favoritos</span>
        </div>
        <div>
          <strong>{{ preview.progressions.length }}</strong
          ><span>progresiones</span>
        </div>
        <div>
          <strong>{{ preview.tunings.length }}</strong
          ><span>afinaciones</span>
        </div>
      </div>
      <p class="notice">
        Se combinará con tu biblioteca actual. Los elementos idénticos se omiten; si un
        identificador coincide y el contenido cambia, se conserva una copia con otro nombre.
        {{
          preview.settings
            ? 'También se aplicarán los ajustes de instrumento y apariencia de esta copia.'
            : 'Se mantendrán tus ajustes actuales.'
        }}
      </p>
      <div class="row">
        <button class="primary" :disabled="busy" @click="confirmImport">
          <Check :size="16" />{{ busy ? 'Importando…' : 'Confirmar importación' }}</button
        ><button :disabled="busy" @click="preview = null">Cancelar</button>
      </div>
    </section>
    <p class="page-bottom">
      <ShieldCheck :size="13" />Tu biblioteca es tuya. Exporta una copia de vez en cuando.
    </p>
  </div>
</template>

<style scoped lang="scss">
.library-symbol {
  height: 64px;
  width: 64px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--accent);
  background: var(--surface);
}
.library-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 28px;
  align-items: start;
}
.collection {
  min-width: 0;
}
.collection-tabs {
  display: flex;
  gap: 5px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
  padding-bottom: 13px;
  button {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 9px 11px;
    gap: 8px;
    small {
      font-size: 10px;
      border-radius: 5px;
      background: var(--bg);
      padding: 3px 6px;
    }
  }
  button.active {
    background: var(--accent-soft);
    color: var(--accent);
    small {
      background: var(--surface);
      color: var(--accent);
    }
  }
}
.item-list {
  display: grid;
  gap: 15px;
}
.saved-item {
  padding: 22px 24px;
  h2 {
    font-size: 23px;
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
    margin: 17px 0 10px;
    overflow-wrap: anywhere;
  }
}
.item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.item-instrument {
  font-size: 11px;
  color: var(--muted);
}
.saved-notes {
  font-size: 14px;
  letter-spacing: 0.25px;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
.context-line {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 17px;
  overflow-wrap: anywhere;
}
.chord-sequence {
  font-size: 17px;
  color: var(--accent);
  overflow-wrap: anywhere;
}
.item-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.text-link,
.explore-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  min-height: 44px;
}
.text-link:hover,
.explore-link:hover {
  text-decoration: underline;
}
.delete-button {
  margin-left: auto;
  color: var(--muted);
  &:hover {
    color: var(--rust);
  }
}
.delete-confirm {
  border-top: 1px solid var(--line);
  margin-top: 14px;
  padding-top: 16px;
  p {
    font-size: 13px;
    margin-bottom: 8px;
  }
}
.empty {
  padding: 57px 35px;
  min-height: 310px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  > svg {
    color: var(--accent);
    margin-bottom: 22px;
  }
  h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
    font-size: 25px;
    margin-bottom: 12px;
  }
  p {
    max-width: 355px;
    font-size: 13px;
    margin-bottom: 17px;
  }
}
.backup-panel {
  margin-top: 0;
  padding: 25px 23px;
  h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
    font-size: 23px;
    line-height: 1.2;
    margin-bottom: 15px;
  }
  p {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 21px;
  }
  button {
    width: 100%;
    font-size: 12px;
    margin-bottom: 10px;
  }
  small {
    display: block;
    text-align: center;
    font-size: 10px;
    margin-top: 2px;
  }
}
.backup-icon {
  color: var(--accent);
  margin-bottom: 24px;
}
.local-note {
  display: flex;
  gap: 9px;
  border-top: 1px solid var(--line);
  margin-top: 25px;
  padding-top: 18px;
  color: var(--muted);
  svg {
    flex-shrink: 0;
    margin-top: 3px;
  }
  p {
    font-size: 11px;
    line-height: 1.65;
    margin: 0;
  }
}
.import-preview {
  margin-top: 28px;
  max-width: 850px;
  h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 27px;
    font-weight: 400;
    margin: 0;
  }
  .eyebrow {
    margin-bottom: 10px;
  }
  .filename {
    font-size: 12px;
    color: var(--muted);
    overflow-wrap: anywhere;
    margin-top: 15px;
  }
  .notice {
    margin: 22px 0;
    font-size: 12px;
  }
}
.preview-counts {
  display: flex;
  gap: 48px;
  margin-top: 22px;
  div {
    display: grid;
    gap: 5px;
  }
  strong {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
    font-size: 30px;
  }
  span {
    font-size: 11px;
    color: var(--muted);
  }
}
@media (max-width: 1000px) {
  .library-layout {
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 20px;
  }
  .collection-tabs {
    button {
      padding: 9px 7px;
      gap: 5px;
      font-size: 12px;
    }
  }
}
@media (max-width: 760px) {
  .library-layout {
    grid-template-columns: 1fr;
  }
  .backup-panel {
    margin-top: 10px;
  }
  .library-symbol {
    height: 48px;
    width: 48px;
    flex-shrink: 0;
  }
  .collection-tabs {
    justify-content: space-between;
    button {
      padding: 9px 7px;
      font-size: 12px;
      svg {
        display: none;
      }
    }
  }
  .saved-item {
    padding: 20px;
  }
  .empty {
    padding: 40px 22px;
    min-height: 280px;
  }
  .preview-counts {
    gap: 30px;
  }
  .item-instrument {
    font-size: 10px;
  }
  .item-actions {
    gap: 9px;
  }
  .backup-panel h2 {
    font-size: 25px;
  }
}
@media (max-width: 380px) {
  .library-symbol {
    display: none;
  }
  .collection-tabs button {
    font-size: 11px;
    padding: 8px 5px;
  }
  .preview-counts {
    gap: 20px;
  }
}
</style>
