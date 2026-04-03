import { createRouter, createWebHashHistory } from 'vue-router'

// Electron has no HTTP server — hash history is required.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/servers' },
    {
      path: '/servers',
      name: 'servers',
      component: () => import('@/views/ServersView.vue')
    },
    {
      path: '/servers/:name',
      name: 'server-detail',
      component: () => import('@/views/ServerDetailView.vue')
    },
    {
      path: '/servers/:name/plugins',
      name: 'server-plugins',
      component: () => import('@/views/PluginsView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    },
  ]
})

export default router
