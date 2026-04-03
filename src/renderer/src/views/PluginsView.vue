<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, Trash2, Loader2, Package, RefreshCw, RotateCcw } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import type { DevPlugin, PluginEntry, ServerStatus } from '../../../shared/ipc-types'

const route  = useRoute()
const router = useRouter()
const serverName = computed(() => decodeURIComponent(route.params.name as string))

const plugins    = ref<PluginEntry[]>([])
const devPlugins = ref<DevPlugin[]>([])
const loading    = ref(true)
const error      = ref<string | null>(null)
const adding     = ref(false)
const status     = ref<ServerStatus>('stopped')

const serverRunning = computed(() => status.value !== 'stopped')

async function load(): Promise<void> {
  loading.value = true
  try {
    const [p, d, s] = await Promise.all([
      window.api.invoke('plugin:list', { serverName: serverName.value }),
      window.api.invoke('plugin:list-dev', { serverName: serverName.value }),
      window.api.invoke('server:status', { name: serverName.value })
    ])
    plugins.value = p
    devPlugins.value = d
    status.value = s
  } finally {
    loading.value = false
  }
}

let unsub: (() => void) | null = null
onMounted(async () => {
  await load()
  unsub = window.api.on('server:status-change', ({ name, status: s }) => {
    if (name === serverName.value) status.value = s
  })
})
onUnmounted(() => unsub?.())

async function addDevPlugin(): Promise<void> {
  const sourcePath = await window.api.invoke('plugin:pick-jar')
  if (!sourcePath) return
  adding.value = true
  error.value = null
  try {
    const plugin = await window.api.invoke('plugin:add-dev', {
      serverName: serverName.value,
      sourcePath,
      action: 'reload'
    })
    devPlugins.value = [...devPlugins.value.filter(p => p.pluginName !== plugin.pluginName), plugin]
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    adding.value = false
  }
}

async function removeDevPlugin(pluginName: string): Promise<void> {
  try {
    await window.api.invoke('plugin:remove-dev', { serverName: serverName.value, pluginName })
    devPlugins.value = devPlugins.value.filter(p => p.pluginName !== pluginName)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function updateAction(pluginName: string, action: 'reload' | 'restart'): Promise<void> {
  await window.api.invoke('plugin:update-action', { serverName: serverName.value, pluginName, action })
  devPlugins.value = devPlugins.value.map(p => p.pluginName === pluginName ? { ...p, action } : p)
}

function isDevPlugin(name: string): boolean {
  return devPlugins.value.some(p => p.pluginName === name)
}

async function togglePlugin(pluginName: string, enable: boolean): Promise<void> {
  try {
    await window.api.invoke('plugin:toggle', { serverName: serverName.value, pluginName, enable })
    plugins.value = plugins.value.map(p => p.name === pluginName ? { ...p, disabled: !enable } : p)
    // If dev plugin, reflect in devPlugins list too (for watcher state awareness)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function toggleDevPlugin(pluginName: string, enable: boolean): Promise<void> {
  await togglePlugin(pluginName, enable)
}
</script>

<template>
  <div class="flex h-full flex-col gap-5">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="icon" class="shrink-0" @click="router.back()">
        <ArrowLeft :size="16" />
      </Button>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-semibold text-foreground">Plugins</h1>
        <p class="text-xs text-muted-foreground font-mono">{{ serverName }}</p>
      </div>
      <Button :disabled="adding" @click="addDevPlugin">
        <Loader2 v-if="adding" :size="14" class="animate-spin" />
        <Plus v-else :size="14" />
        Link dev plugin
      </Button>
    </div>

    <!-- Server running warning -->
    <div v-if="serverRunning"
         class="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
      <Loader2 :size="12" class="animate-spin shrink-0" />
      Plugin toggles are disabled while the server is running — stop the server first.
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-500">
      {{ error }}
    </div>

    <!-- Dev plugins section -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium text-foreground">Dev plugins</h2>
        <span class="text-xs text-muted-foreground">Watched &amp; symlinked</span>
      </div>

      <div v-if="devPlugins.length === 0"
           class="rounded-lg border border-dashed border-border py-8 text-center">
        <Package :size="28" class="mx-auto mb-2 text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No dev plugins linked yet.</p>
        <p class="mt-0.5 text-xs text-muted-foreground/70">Click "Link dev plugin" to watch a JAR and symlink it.</p>
      </div>

      <div v-else class="space-y-2">
        <div v-for="dp in devPlugins" :key="dp.pluginName"
             class="rounded-lg border border-border bg-card p-4 shadow-sm"
             :class="{ 'opacity-60': plugins.find(p => p.name === dp.pluginName)?.disabled }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground">{{ dp.pluginName }}</p>
              <p class="mt-0.5 truncate font-mono text-xs text-muted-foreground" :title="dp.sourcePath">
                {{ dp.sourcePath }}
              </p>
              <p v-if="plugins.find(p => p.name === dp.pluginName)?.disabled"
                 class="mt-1 text-[11px] text-amber-500">Watching paused — plugin disabled</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <!-- Enable/disable toggle -->
              <button
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                :class="!plugins.find(p => p.name === dp.pluginName)?.disabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                :title="serverRunning ? 'Stop the server before toggling plugins' : plugins.find(p => p.name === dp.pluginName)?.disabled ? 'Enable plugin' : 'Disable plugin'"
                :disabled="serverRunning"
                @click="toggleDevPlugin(dp.pluginName, !!plugins.find(p => p.name === dp.pluginName)?.disabled)"
              >
                <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      :class="!plugins.find(p => p.name === dp.pluginName)?.disabled ? 'translate-x-[18px]' : 'translate-x-0.5'" />
              </button>
              <!-- Action toggle -->
              <div class="flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted p-0.5">
                <button
                  class="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="dp.action === 'reload'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'"
                  @click="updateAction(dp.pluginName, 'reload')"
                >
                  <span class="flex items-center gap-1"><RefreshCw :size="11" /> Reload</span>
                </button>
                <button
                  class="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="dp.action === 'restart'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'"
                  @click="updateAction(dp.pluginName, 'restart')"
                >
                  <span class="flex items-center gap-1"><RotateCcw :size="11" /> Restart</span>
                </button>
              </div>
              <Button size="icon" variant="ghost"
                      class="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      @click="removeDevPlugin(dp.pluginName)">
                <Trash2 :size="14" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Installed plugins -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium text-foreground">Installed plugins</h2>
        <span class="text-xs text-muted-foreground">{{ plugins.length }} JARs in plugins/</span>
      </div>

      <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 :size="13" class="animate-spin" /> Loading…
      </div>
      <div v-else-if="plugins.length === 0"
           class="rounded-lg border border-dashed border-border py-6 text-center">
        <p class="text-sm text-muted-foreground">No plugins installed.</p>
      </div>
      <div v-else class="space-y-1.5">
        <div v-for="entry in plugins" :key="entry.name"
             class="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
             :class="{ 'opacity-60': entry.disabled }">
          <Package :size="13" class="shrink-0 text-muted-foreground" />
          <span class="flex-1 truncate font-mono text-xs"
                :class="entry.disabled ? 'text-muted-foreground line-through' : 'text-foreground'">
            {{ entry.name }}
          </span>
          <span v-if="isDevPlugin(entry.name)"
                class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            dev
          </span>
          <!-- Toggle -->
          <button
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            :class="!entry.disabled ? 'bg-primary' : 'bg-muted-foreground/30'"
            :title="serverRunning ? 'Stop the server before toggling plugins' : entry.disabled ? 'Enable plugin' : 'Disable plugin'"
            :disabled="serverRunning"
            @click="togglePlugin(entry.name, entry.disabled)"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                  :class="!entry.disabled ? 'translate-x-[18px]' : 'translate-x-0.5'" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
