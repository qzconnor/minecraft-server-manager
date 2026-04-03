<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Send, Trash2, Loader2,
  Play, Square, RotateCcw, RefreshCw, FolderOpen, Package
} from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import Badge from '@/components/ui/badge.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { parseMinecraftColors } from '@/lib/minecraft-colors'
import type { ServerInfo, ServerStatus } from '../../../shared/ipc-types'

const route  = useRoute()
const router = useRouter()

const serverName = computed(() => decodeURIComponent(route.params.name as string))

// ── Server info & status ──────────────────────────────────────────────────────

const server = ref<ServerInfo | null>(null)
const status = ref<ServerStatus>('stopped')

// ── Unified log ───────────────────────────────────────────────────────────────

type LogType = 'stdout' | 'stderr' | 'command' | 'response' | 'rcon-error' | 'system'

interface LogEntry { type: LogType; text: string; time: string }

// Module-level cache — survives navigation to sub-routes (e.g. Plugins) and back
const logCache = new Map<string, LogEntry[]>()

const log      = ref<LogEntry[]>([])
const consoleEl = ref<HTMLElement | null>(null)
const MAX_LINES = 2000

function addLog(type: LogType, text: string): void {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  log.value.push({ type, text, time })
  if (log.value.length > MAX_LINES) log.value.splice(0, log.value.length - MAX_LINES)
  nextTick(() => { if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight })
}

// ── RCON ──────────────────────────────────────────────────────────────────────

const rconConnected  = ref(false)
const rconConnecting = ref(false)
const rconSending    = ref(false)
const rconCmd        = ref('')

async function rconConnect(silent = false): Promise<void> {
  if (rconConnecting.value || rconConnected.value) return
  rconConnecting.value = true
  try {
    await window.api.invoke('rcon:connect', { serverName: serverName.value })
    rconConnected.value = true
    if (!silent) addLog('system', `RCON connected on port ${server.value?.rconPort}.`)
  } catch (e) {
    if (!silent) addLog('rcon-error', `RCON: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    rconConnecting.value = false
  }
}

async function rconReconnect(): Promise<void> {
  // Disconnect first if still registered
  try { await window.api.invoke('rcon:disconnect', { serverName: serverName.value }) } catch { /* ignore */ }
  rconConnected.value = false
  addLog('system', 'Reconnecting RCON…')
  await rconConnect()
}

async function sendCommand(): Promise<void> {
  const cmd = rconCmd.value.trim()
  if (!cmd || !rconConnected.value || rconSending.value) return
  rconCmd.value = ''
  addLog('command', `> ${cmd}`)
  rconSending.value = true
  try {
    const response = await window.api.invoke('rcon:send', { serverName: serverName.value, command: cmd })
    if (response) addLog('response', response)
  } catch (e) {
    addLog('rcon-error', e instanceof Error ? e.message : String(e))
  } finally {
    rconSending.value = false
  }
}

// ── Process controls ──────────────────────────────────────────────────────────

const acting = ref(false)

async function startServer(): Promise<void> {
  acting.value = true
  try { await window.api.invoke('server:start', { name: serverName.value }) }
  catch (e) { addLog('stderr', e instanceof Error ? e.message : String(e)) }
  finally { acting.value = false }
}

async function stopServer(): Promise<void> {
  acting.value = true
  try { await window.api.invoke('server:stop', { name: serverName.value }) }
  catch (e) { addLog('stderr', e instanceof Error ? e.message : String(e)) }
  finally { acting.value = false }
}

async function restartServer(): Promise<void> {
  acting.value = true
  try { await window.api.invoke('server:restart', { name: serverName.value }) }
  catch (e) { addLog('stderr', e instanceof Error ? e.message : String(e)) }
  finally { acting.value = false }
}

// ── Open folder ───────────────────────────────────────────────────────────

function openFolder(): void {
  if (server.value) window.api.invoke('shell:open-path', { path: server.value.path })
}

// ── Delete ────────────────────────────────────────────────────────────────────

const confirmDelete = ref(false)
const deleting      = ref(false)

async function executeDelete(): Promise<void> {
  deleting.value = true
  try {
    await window.api.invoke('server:delete', { name: serverName.value })
    router.replace('/servers')
  } catch (e) {
    addLog('stderr', e instanceof Error ? e.message : String(e))
    deleting.value = false
    confirmDelete.value = false
  }
}

// ── Push subscriptions + auto-connect ────────────────────────────────────────

const unsubs: (() => void)[] = []

async function loadLastLog(): Promise<void> {
  const content = await window.api.invoke('server:read-log', { name: serverName.value })
  if (!content) return
  addLog('system', '─── previous session log ───')
  for (const line of content.split('\n')) {
    if (line) addLog('stdout', line)
  }
  addLog('system', '─────────────────────────────')
}

onMounted(async () => {
  server.value = await window.api.invoke('server:get', { name: serverName.value })
  if (!server.value) { router.replace('/servers'); return }

  status.value = await window.api.invoke('server:status', { name: serverName.value })

  // Restore cached log (from a previous visit to this view)
  const cached = logCache.get(serverName.value)
  if (cached) {
    log.value = cached
  } else if (status.value === 'stopped') {
    // First visit and server stopped — load last log file
    await loadLastLog()
  }

  // Subscribe to push events
  unsubs.push(
    window.api.on('server:status-change', ({ name, status: s }) => {
      if (name !== serverName.value) return
      const prev = status.value
      status.value = s
      // Clear log and cache, start fresh when server begins starting
      if (prev === 'stopped' && s === 'starting') {
        log.value = []
        logCache.delete(serverName.value)
      }
      // Auto-connect RCON once the server reports "running"
      if (s === 'running') {
        setTimeout(() => rconConnect(true), 1000) // small delay for RCON listener to be ready
      }
    }),
    window.api.on('server:output', ({ name, line, source }) => {
      if (name !== serverName.value) return
      addLog(source, line)
    }),
    window.api.on('rcon:disconnected', ({ serverName: n }) => {
      if (n !== serverName.value) return
      rconConnected.value = false
      addLog('system', 'RCON disconnected.')
    })
  )

  // Auto-connect RCON if server is already running
  if (status.value === 'running') await rconConnect(true)
})

onUnmounted(() => {
  unsubs.forEach((u) => u())
  logCache.set(serverName.value, log.value)
})

// ── Status helpers ────────────────────────────────────────────────────────────

const statusVariant = computed(() =>
  status.value === 'running'  ? 'supported'
  : status.value === 'starting' || status.value === 'stopping' ? 'legacy'
  : 'unsupported'
)
const statusLabel = computed(() =>
  status.value === 'running'   ? 'Running'
  : status.value === 'starting' ? 'Starting…'
  : status.value === 'stopping' ? 'Stopping…'
  : 'Stopped'
)

// Color per log type
const logClass: Record<LogType, string> = {
  stdout:      'text-foreground/80',
  stderr:      'text-red-400',
  command:     'text-primary/70',
  response:    'text-foreground',
  'rcon-error':'text-red-400',
  system:      'text-muted-foreground/70 italic',
}
</script>

<template>
  <div class="flex h-full flex-col gap-5">

    <!-- Header -->
    <div class="flex flex-wrap items-start gap-3">
      <Button variant="ghost" size="icon" class="mt-0.5 shrink-0" @click="router.back()">
        <ArrowLeft :size="16" />
      </Button>

      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-lg font-semibold text-foreground">{{ serverName }}</h1>
          <Badge :variant="statusVariant">{{ statusLabel }}</Badge>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground font-mono">
          Paper {{ server?.version }} · build #{{ server?.build }} · :{{ server?.port }} · {{ server?.ram }}MB
        </p>
      </div>

      <!-- Process controls -->
      <div class="flex shrink-0 items-center gap-1.5">
        <Button size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                title="Open server folder" @click="openFolder">
          <FolderOpen :size="14" />
        </Button>
        <Button size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                title="Manage plugins"
                @click="router.push(`/servers/${encodeURIComponent(serverName)}/plugins`)">
          <Package :size="14" />
        </Button>
        <Button v-if="status === 'stopped'" size="sm" :disabled="acting" @click="startServer">
          <Loader2 v-if="acting" :size="13" class="animate-spin" />
          <Play v-else :size="13" />
          Start
        </Button>
        <template v-else-if="status === 'running'">
          <Button size="sm" variant="outline" :disabled="acting" @click="restartServer">
            <Loader2 v-if="acting" :size="13" class="animate-spin" />
            <RotateCcw v-else :size="13" />
            Restart
          </Button>
          <Button size="sm" variant="outline"
                  class="text-red-500 hover:bg-red-500/10 hover:text-red-400 border-red-500/20"
                  :disabled="acting" @click="stopServer">
            <Square :size="13" /> Stop
          </Button>
        </template>
        <Button v-else size="sm" variant="outline" disabled>
          <Loader2 :size="13" class="animate-spin" /> {{ statusLabel }}
        </Button>
      </div>

      <!-- Delete -->
      <div class="flex shrink-0 items-center border-l border-border pl-3">
        <Button size="icon" variant="ghost"
                class="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                title="Delete server" :disabled="status !== 'stopped'"
                @click="confirmDelete = true">
          <Trash2 :size="14" />
        </Button>
      </div>

      <ConfirmDialog
        v-model:open="confirmDelete"
        title="Delete server?"
        :description="`'${serverName}' and all its files will be permanently deleted. This cannot be undone.`"
        confirm-label="Delete"
        :loading="deleting"
        @confirm="executeDelete"
      />
    </div>

    <!-- Console -->
    <div class="flex flex-1 flex-col min-h-0 rounded-lg border border-border bg-card shadow-sm overflow-hidden">

      <!-- Toolbar -->
      <div class="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span class="text-xs font-medium text-muted-foreground">Console</span>
        <div class="flex items-center gap-1">
          <!-- RCON indicator -->
          <span :class="rconConnected ? 'text-emerald-500' : 'text-muted-foreground/50'"
                class="text-xs font-medium px-1.5">
            {{ rconConnected ? '● RCON' : '○ RCON' }}
          </span>
          <!-- Reconnect RCON -->
          <Button variant="ghost" size="sm"
                  class="h-7 gap-1 text-xs text-muted-foreground"
                  :disabled="rconConnecting"
                  title="Reconnect RCON"
                  @click="rconReconnect">
            <Loader2 v-if="rconConnecting" :size="11" class="animate-spin" />
            <RefreshCw v-else :size="11" />
            Reconnect RCON
          </Button>
          <!-- Clear -->
          <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground"
                  title="Clear console" @click="log = []">
            <Trash2 :size="11" />
          </Button>
        </div>
      </div>

      <!-- Output -->
      <div ref="consoleEl"
           class="flex-1 min-h-0 overflow-y-auto bg-[oklch(0.10_0.01_264)] p-3 font-mono text-xs">
        <div v-if="log.length === 0" class="text-muted-foreground/30 select-none">
          {{ status === 'stopped' ? 'Start the server to see output.' : 'Waiting for output…' }}
        </div>
        <div v-for="(entry, i) in log" :key="i" class="flex gap-2 leading-5">
          <span class="shrink-0 select-none text-muted-foreground/30">{{ entry.time }}</span>
          <span :class="logClass[entry.type]"
                class="break-all whitespace-pre-wrap min-w-0"
                v-html="parseMinecraftColors(entry.text)" />
        </div>
      </div>

      <!-- RCON input -->
      <div class="flex gap-2 border-t border-border p-2">
        <input
          v-model="rconCmd"
          :disabled="!rconConnected || rconSending"
          placeholder="RCON command… (Enter to send)"
          class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs
                 text-foreground placeholder:text-muted-foreground
                 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                 disabled:cursor-not-allowed disabled:opacity-40"
          @keydown.enter.prevent="sendCommand"
        />
        <Button size="sm" :disabled="!rconConnected || !rconCmd.trim() || rconSending"
                @click="sendCommand">
          <Loader2 v-if="rconSending" :size="13" class="animate-spin" />
          <Send v-else :size="13" />
        </Button>
      </div>
    </div>

  </div>
</template>
