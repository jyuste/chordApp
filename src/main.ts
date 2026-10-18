import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import ExploreView from './views/ExploreView.vue'
import IntervalsView from './views/IntervalsView.vue'
import ProgressionsView from './views/ProgressionsView.vue'
import LibraryView from './views/LibraryView.vue'
import DictionaryView from './views/DictionaryView.vue'
import FifthsView from './views/FifthsView.vue'
import './styles/main.scss'
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: ExploreView },
    { path: '/intervalos', component: IntervalsView },
    { path: '/diccionario', component: DictionaryView },
    { path: '/quintas', component: FifthsView },
    { path: '/progresiones', component: ProgressionsView },
    { path: '/biblioteca', component: LibraryView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
createApp(App).use(createPinia()).use(router).mount('#app')
