<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import {
  Guitar,
  Layers,
  ArrowUpRight,
  Library,
  SlidersHorizontal,
  Sun,
  Moon,
  WifiOff,
  X,
  Music2,
  Download,
  BookOpen,
  CircleDot,
} from '@lucide/vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useAppStore } from './stores/app'
import InstrumentSettings from './components/InstrumentSettings.vue'
const store = useAppStore()
const showSettings = ref(false)
const online = ref(navigator.onLine)
const { needRefresh, updateServiceWorker } = useRegisterSW()
const nav = [
  { to: '/', label: 'Explorar', icon: Guitar, short: 'Explorar' },
  { to: '/diccionario', label: 'Diccionario', icon: BookOpen, short: 'Acordes' },
  { to: '/quintas', label: 'Círculo de quintas', icon: CircleDot, short: 'Quintas' },
  { to: '/intervalos', label: 'Intervalos', short: 'Intervalos', icon: ArrowUpRight },
  { to: '/progresiones', label: 'Progresiones', short: 'Crear', icon: Layers },
  { to: '/biblioteca', label: 'Biblioteca', short: 'Biblioteca', icon: Library },
]
const media = matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
const actualDark = computed(
  () => store.settings.theme === 'dark' || (store.settings.theme === 'system' && systemDark.value),
)
function applyTheme() {
  document.documentElement.dataset.theme = actualDark.value ? 'dark' : 'light'
}
function systemThemeChanged() {
  systemDark.value = media.matches
  applyTheme()
}
function connectivity() {
  online.value = navigator.onLine
}
async function toggleTheme() {
  store.settings.theme = actualDark.value ? 'light' : 'dark'
  try {
    await store.saveSettings()
  } catch {
    store.error = 'No se pudo guardar la apariencia en este dispositivo.'
  }
}
watch(() => store.settings.theme, applyTheme)
let previousFocus: HTMLElement | null = null
function openSettings(event: MouseEvent) {
  previousFocus = event.currentTarget as HTMLElement
  showSettings.value = true
}
watch(showSettings, async (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    await nextTick()
    document.querySelector<HTMLElement>('.settings-sheet button')?.focus()
  } else {
    document.body.style.overflow = ''
    await nextTick()
    previousFocus?.focus()
  }
})
function sheetKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showSettings.value = false
    return
  }
  if (event.key === 'Tab') {
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        '.settings-sheet button:not(:disabled),.settings-sheet input,.settings-sheet select',
      ),
    ].filter((el) => el.offsetParent !== null)
    const first = nodes[0],
      last = nodes.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

onMounted(async () => {
  await store.init()
  applyTheme()
  media.addEventListener('change', systemThemeChanged)
  window.addEventListener('online', connectivity)
  window.addEventListener('offline', connectivity)
})
onUnmounted(() => {
  media.removeEventListener('change', systemThemeChanged)
  window.removeEventListener('online', connectivity)
  window.removeEventListener('offline', connectivity)
})
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-symbol"><Music2 :size="23" /></span
        ><span
          >entrecuerdas<span class="brand-caption">UN ESPACIO PARA ENTENDER</span></span
        ></RouterLink
      >
      <div class="nav-caption">TU LABORATORIO MUSICAL</div>
      <nav aria-label="Navegación principal">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :aria-label="item.label"
          :class="{ selected: $route.path === item.to }"
          ><component :is="item.icon" :size="19" /><span class="nav-label-full">{{
            item.label
          }}</span
          ><span class="nav-label-short">{{ item.short }}</span
          ><span v-if="$route.path === item.to" class="nav-dot"
        /></RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-note">
          <span class="local-dot" /><span
            >Tu música, contigo.<small>Sin cuentas. Sin distracciones.</small></span
          >
        </div>
        <button class="ghost theme" @click="toggleTheme">
          <Sun v-if="actualDark" :size="17" /><Moon v-else :size="17" />{{
            actualDark ? 'Modo claro' : 'Modo oscuro'
          }}</button
        ><span class="version">HECHO PARA EXPLORAR · v0.1</span>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          Tu espacio <span>/</span> {{ nav.find((n) => n.to === $route.path)?.label }}
        </div>
        <div class="row">
          <span class="local-status"
            ><span class="local-dot" />{{
              online ? 'Guardado en este dispositivo' : 'Sin conexión'
            }}</span
          ><button class="instrument-switch" @click="openSettings">
            <Guitar :size="17" /><span>{{
              store.settings.instrument === 'guitar'
                ? 'Guitarra'
                : store.settings.instrument === 'bass4'
                  ? 'Bajo · 4 cuerdas'
                  : 'Bajo · 5 cuerdas'
            }}</span
            ><SlidersHorizontal :size="15" />
          </button>
        </div>
      </header>
      <main id="main-content">
        <div v-if="store.error" class="notice error" role="alert">{{ store.error }}</div>
        <RouterView v-if="store.ready" />
        <div v-else class="empty">Preparando tu espacio musical…</div>
      </main>
    </div>
    <div v-if="showSettings" class="settings-backdrop" @click.self="showSettings = false">
      <section
        class="settings-sheet"
        @keydown="sheetKey"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div class="row between">
          <h2 id="settings-title">Tu instrumento</h2>
          <button
            class="icon-button ghost"
            aria-label="Cerrar ajustes"
            @click="showSettings = false"
          >
            <X />
          </button>
        </div>
        <InstrumentSettings @done="showSettings = false" />
      </section>
    </div>
    <div v-if="needRefresh" class="update-banner" role="status">
      <Download :size="18" />Hay una nueva versión.<button @click="updateServiceWorker()">
        Actualizar</button
      ><button class="icon-button" aria-label="Cerrar aviso" @click="needRefresh = false">
        <X :size="16" />
      </button>
    </div>
    <div v-if="!online" class="offline-indicator"><WifiOff :size="14" /> Modo sin conexión</div>
  </div>
</template>
<style scoped lang="scss">
@use './styles/index' as *;
.skip-link {
  position: fixed;
  top: -80px;
  left: 20px;
  padding: 12px;
  background: var(--surface);
  z-index: 100;
  &:focus {
    top: 10px;
  }
}
.app-shell {
  min-height: 100dvh;
}
.nav-label-short {
  display: none;
}
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 239px;
  padding: 35px 21px 25px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.brand {
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: Georgia, serif;
  font-size: 23px;
  letter-spacing: -0.8px;
  margin-bottom: 59px;
}
.brand-symbol {
  background: var(--accent);
  color: var(--surface);
  border-radius: 10px;
  width: 36px;
  height: 40px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.brand-caption {
  display: block;
  letter-spacing: 1.45px;
  font:
    8px -apple-system,
    sans-serif;
  margin-top: 8px;
  color: var(--muted);
}
.nav-caption {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  margin: 0 10px 17px;
}
nav {
  display: grid;
  gap: 7px;
}
nav a {
  display: flex;
  align-items: center;
  gap: 13px;
  text-decoration: none;
  padding: 14px 15px;
  font-size: 13px;
  color: var(--muted);
  border-radius: 8px;
  min-height: 47px;
}
nav a.selected {
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}
.nav-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: auto;
}
.sidebar-bottom {
  margin-top: auto;
}
.local-note {
  border-top: 1px solid var(--line);
  padding: 25px 7px 15px;
  display: flex;
  gap: 9px;
  font-size: 12px;
}
.local-note small {
  display: block;
  font-size: 10px;
  margin-top: 6px;
}
.local-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  display: inline-block;
  flex-shrink: 0;
  margin-top: 4px;
}
.theme {
  font-size: 12px;
  color: var(--muted);
}
.version {
  display: block;
  font-size: 8px;
  letter-spacing: 1.1px;
  color: var(--muted);
  margin: 24px 9px 0;
}
.workspace {
  margin-left: 239px;
}
.topbar {
  height: 88px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  gap: 15px;
}
.breadcrumb {
  font-size: 12px;
  color: var(--muted);
  span {
    padding: 0 12px;
    color: var(--line);
  }
}
.local-status {
  font-size: 10px;
  color: var(--muted);
  display: flex;
  gap: 7px;
}
.instrument-switch {
  font-size: 12px;
  background: var(--surface);
}
main {
  max-width: 1450px;
  margin: auto;
  padding: 38px 40px 40px;
}
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: #17251e66;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}
.settings-sheet {
  width: min(510px, 100%);
  background: var(--surface);
  padding: 25px;
  overflow: auto;
  box-shadow: -15px 0 60px #18251c20;
  h2 {
    margin: 0;
  }
}
.update-banner {
  position: fixed;
  bottom: 25px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  box-shadow: 0 10px 60px #17251e33;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 18px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}
.offline-indicator {
  position: fixed;
  bottom: 8px;
  right: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
}
@media (max-width: 1100px) {
  .sidebar {
    width: 205px;
    padding-inline: 15px;
  }
  .workspace {
    margin-left: 205px;
  }
  .brand {
    font-size: 20px;
  }
  .topbar {
    padding-inline: 25px;
  }
  .local-status {
    display: none;
  }
  main {
    padding: 30px 25px;
  }
}
@include phone {
  .sidebar {
    inset: auto 0 0;
    width: auto;
    height: calc(71px + env(safe-area-inset-bottom));
    padding: 5px 6px env(safe-area-inset-bottom);
    border: 0;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  .brand,
  .nav-caption,
  .sidebar-bottom {
    display: none;
  }
  nav {
    display: flex;
    justify-content: space-around;
    gap: 0;
  }
  nav a {
    flex-direction: column;
    gap: 6px;
    font-size: 10px;
    padding: 9px 2px;
    min-width: 0;
    flex: 1;
    font-size: 9px;
    .nav-label-full {
      display: none;
    }
    .nav-label-short {
      display: block;
      white-space: nowrap;
    }
  }
  .nav-dot {
    display: none;
  }
  .workspace {
    margin-left: 0;
    padding-bottom: 85px;
  }
  .topbar {
    height: 67px;
    padding: 0 18px;
  }
  .breadcrumb {
    font-size: 11px;
  }
  .instrument-switch {
    font-size: 11px;
    padding: 8px 10px;
  }
  .topbar > .row {
    gap: 0;
  }
  main {
    padding: 26px 18px;
  }
  .offline-indicator {
    bottom: 78px;
  }
  .update-banner {
    bottom: 85px;
    font-size: 12px;
    gap: 7px;
    padding: 8px;
    max-width: 96vw;
    white-space: normal;
  }
}
</style>
