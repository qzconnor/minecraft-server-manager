<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { PlusCircle, ChevronRight, AlertCircle, ServerCog, Play, Square, Loader2 } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import Badge from '@/components/ui/badge.vue'
import CreateServerDialog from '@/components/CreateServerDialog.vue'
import type { ServerInfo, AppConfig, ServerStatus } from '../../../shared/ipc-types'

const config  = ref<AppConfig | null>(null)
const servers = ref<ServerInfo[]>([])
const dialog  = ref(false)

// name → status
const statuses = ref<Record<string, ServerStatus>>({})

async function load(): Promise<void> {
  config.value = await window.api.invoke('config:get')
  if (!config.value?.serversFolder) return
  servers.value = await window.api.invoke('server:list')
  // Fetch each server's current status
  const entries = await Promise.all(
    servers.value.map(async (s) => [s.name, await window.api.invoke('server:status', { name: s.name })] as const)
  )
  statuses.value = Object.fromEntries(entries)
}

onMounted(load)

// Subscribe to push status updates
const unsub = ref<(() => void) | null>(null)
onMounted(() => {
  unsub.value = window.api.on('server:status-change', ({ name, status }) => {
    statuses.value = { ...statuses.value, [name]: status }
  })
})
onUnmounted(() => unsub.value?.())

// Per-server action lock while a command is in-flight
const acting = ref<Record<string, boolean>>({})

async function startServer(name: string): Promise<void> {
  acting.value = { ...acting.value, [name]: true }
  try { await window.api.invoke('server:start', { name }) } finally {
    acting.value = { ...acting.value, [name]: false }
  }
}

async function stopServer(name: string): Promise<void> {
  acting.value = { ...acting.value, [name]: true }
  try { await window.api.invoke('server:stop', { name }) } finally {
    acting.value = { ...acting.value, [name]: false }
  }
}

const statusBadge = computed(() => (status: ServerStatus) => ({
  variant: status === 'running'  ? 'supported'
         : status === 'starting' || status === 'stopping' ? 'legacy'
         : 'unsupported',
  label: status === 'running' ? 'Running' : status === 'starting' ? 'Starting…' : status === 'stopping' ? 'Stopping…' : 'Stopped'
} as const))
</script>

<template>
  <div class="h-full overflow-y-auto space-y-5 pb-2">

    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-foreground">Servers</h1>
        <p class="text-sm text-muted-foreground">Manage your Minecraft servers.</p>
      </div>
      <Button :disabled="!config?.serversFolder" @click="dialog = true">
        <PlusCircle :size="15" /> New server
      </Button>
    </div>

    <!-- No folder warning -->
    <div v-if="config && !config.serversFolder"
         class="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
      <AlertCircle :size="16" class="mt-0.5 shrink-0 text-amber-500" />
      <div class="text-sm">
        <p class="font-medium text-foreground">No servers folder configured</p>
        <p class="mt-0.5 text-muted-foreground">
          Go to <RouterLink to="/settings" class="text-primary underline underline-offset-2">Settings</RouterLink>
          and choose a folder where your servers will be stored.
        </p>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="config?.serversFolder && servers.length === 0"
         class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
      <ServerCog :size="32" class="mb-3 text-muted-foreground/50" />
      <p class="text-sm font-medium text-foreground">No servers yet</p>
      <p class="mt-1 text-xs text-muted-foreground">Click "New server" to create your first one.</p>
    </div>

    <!-- Server list -->
    <div v-else-if="servers.length > 0" class="space-y-2">
      <div v-for="server in servers" :key="server.name"
           class="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">

        <!-- Clickable info area -->
        <RouterLink :to="`/servers/${encodeURIComponent(server.name)}`"
                    class="flex flex-1 items-center gap-3 min-w-0">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <ServerCog :size="16" class="text-muted-foreground" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground">{{ server.name }}</p>
            <p class="text-xs text-muted-foreground">
              Paper {{ server.version }} · build #{{ server.build }} · {{ server.ram }}MB RAM
            </p>
          </div>
        </RouterLink>

        <!-- Status + controls -->
        <div class="flex shrink-0 items-center gap-2">
          <Badge :variant="statusBadge(statuses[server.name] ?? 'stopped').variant">
            {{ statusBadge(statuses[server.name] ?? 'stopped').label }}
          </Badge>

          <!-- Start -->
          <Button
            v-if="(statuses[server.name] ?? 'stopped') === 'stopped'"
            size="icon"
            variant="ghost"
            class="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
            title="Start"
            :disabled="!!acting[server.name]"
            @click.prevent="startServer(server.name)"
          >
            <Loader2 v-if="acting[server.name]" :size="14" class="animate-spin" />
            <Play v-else :size="14" />
          </Button>

          <!-- Stop -->
          <Button
            v-else-if="(statuses[server.name]) === 'running'"
            size="icon"
            variant="ghost"
            class="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
            title="Stop"
            :disabled="!!acting[server.name]"
            @click.prevent="stopServer(server.name)"
          >
            <Loader2 v-if="acting[server.name]" :size="14" class="animate-spin" />
            <Square v-else :size="14" />
          </Button>

          <!-- Transitioning -->
          <Button v-else size="icon" variant="ghost" class="h-8 w-8" disabled>
            <Loader2 :size="14" class="animate-spin text-muted-foreground" />
          </Button>

          <RouterLink :to="`/servers/${encodeURIComponent(server.name)}`">
            <ChevronRight :size="15" class="text-muted-foreground" />
          </RouterLink>
        </div>
      </div>
    </div>
  </div>

  <CreateServerDialog v-model:open="dialog" @created="load" />
</template>
