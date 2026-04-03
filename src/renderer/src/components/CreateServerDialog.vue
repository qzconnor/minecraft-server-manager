<script setup lang="ts">
import { ref, watch, computed, toRaw } from 'vue'
import {
  DialogRoot, DialogPortal, DialogOverlay,
  DialogContent, DialogTitle, DialogDescription, DialogClose
} from 'radix-vue'
import { X, ServerCog, Loader2, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import Input from '@/components/ui/input.vue'
import Badge from '@/components/ui/badge.vue'
import type { PaperVersion, PaperBuild, SupportStatus } from '../../../shared/ipc-types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: []
}>()

// ── State ─────────────────────────────────────────────────────────────────────

const name        = ref('')
const versions    = ref<PaperVersion[]>([])
const selectedV   = ref('')
const build       = ref<PaperBuild | null>(null)
const acceptEula  = ref(false)
const port         = ref(25565)
const usedPorts    = ref<number[]>([])
const rconPort     = ref(25575)
const rconPassword = ref('')
const ram          = ref(2048)

function generatePassword(): void {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  rconPassword.value = Array.from(
    { length: 16 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

const loadingVersions = ref(false)
const loadingBuild    = ref(false)
const creating        = ref(false)
const downloadPct     = ref<number | null>(null)
const error           = ref<string | null>(null)

// ── Fetch build ───────────────────────────────────────────────────────────────

async function fetchBuild(version: string): Promise<void> {
  if (!version) return
  build.value = null
  loadingBuild.value = true
  error.value = null
  try {
    build.value = await window.api.invoke('paper:get-latest-build', { version })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingBuild.value = false
  }
}

// ── Fetch versions on open ────────────────────────────────────────────────────

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  // reset
  name.value = ''; selectedV.value = ''; build.value = null
  acceptEula.value = false; error.value = null; downloadPct.value = null
  rconPort.value = 25575; ram.value = 2048; generatePassword()

  // fetch next available port + used ports for validation
  const [servers, nextPort] = await Promise.all([
    window.api.invoke('server:list'),
    window.api.invoke('server:next-port')
  ])
  usedPorts.value = servers.map((s) => s.port)
  port.value = nextPort

  loadingVersions.value = true
  try {
    versions.value = await window.api.invoke('paper:get-versions')
    const supported = versions.value.find(v => v.support.status === 'SUPPORTED')
    const initial = supported?.key ?? versions.value[0]?.key ?? ''
    selectedV.value = initial
    // Call directly — don't rely on watch firing after a same-tick reset
    await fetchBuild(initial)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingVersions.value = false
  }
})

// ── Re-fetch build when user changes version ──────────────────────────────────

watch(selectedV, (v) => { fetchBuild(v) })

// ── Subscribe to download progress ───────────────────────────────────────────

let unsubProgress: (() => void) | null = null
watch(creating, (active) => {
  if (active) {
    unsubProgress = window.api.on('server:download-progress', ({ percent }) => {
      downloadPct.value = percent
    })
  } else {
    unsubProgress?.(); unsubProgress = null
  }
})

// ── Computed ──────────────────────────────────────────────────────────────────

const portError = computed(() =>
  usedPorts.value.includes(port.value) ? `Port ${port.value} is already used by another server.` : null
)

const canCreate = computed(() =>
  name.value.trim().length > 0 &&
  !!build.value &&
  acceptEula.value &&
  rconPassword.value.length > 0 &&
  !portError.value &&
  !creating.value
)

const statusLabel: Record<SupportStatus, string> = {
  SUPPORTED:   'Supported',
  LEGACY:      'Legacy',
  UNSUPPORTED: 'Unsupported'
}

// ── Create ────────────────────────────────────────────────────────────────────

async function handleCreate(): Promise<void> {
  if (!canCreate.value || !build.value) return
  creating.value = true
  error.value = null
  try {
    await window.api.invoke('server:create', {
      name: name.value.trim(),
      version: selectedV.value,
      build: toRaw(build.value)!,
      acceptEula: acceptEula.value,
      port: port.value,
      rconPort: rconPort.value,
      rconPassword: rconPassword.value,
      ram: ram.value
    })
    emit('created')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    creating.value = false
    downloadPct.value = null
  }
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
                            data-[state=open]:animate-in data-[state=closed]:animate-out
                            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2
               max-h-[calc(100vh-4rem)] overflow-y-auto
               rounded-2xl border border-border bg-card shadow-2xl
               data-[state=open]:animate-in data-[state=closed]:animate-out
               data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
               data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ServerCog :size="20" class="text-primary" />
            </div>
            <div>
              <DialogTitle class="text-sm font-semibold text-foreground">New Server</DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground">Configure a new PaperMC Minecraft server</DialogDescription>
            </div>
          </div>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0 text-muted-foreground">
              <X :size="14" />
            </Button>
          </DialogClose>
        </div>

        <form @submit.prevent="handleCreate">
          <div class="space-y-0 divide-y divide-border">

            <!-- Error -->
            <div v-if="error" class="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
              <p class="text-xs text-red-500">{{ error }}</p>
            </div>

            <!-- ── Basics ── -->
            <div class="space-y-4 px-6 py-5">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">General</p>

              <!-- Name -->
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-foreground">Server name</label>
                <Input v-model="name" placeholder="my-survival-server" :disabled="creating" />
              </div>

              <!-- Version -->
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-foreground">Minecraft version</label>
                <div v-if="loadingVersions" class="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 :size="13" class="animate-spin" /> Loading versions…
                </div>
                <select
                  v-else
                  v-model="selectedV"
                  :disabled="creating"
                  class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                         disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option v-for="v in versions" :key="v.key" :value="v.key">
                    {{ v.key }} — {{ statusLabel[v.support.status] ?? v.support.status }}
                  </option>
                </select>

                <!-- Inline build chips -->
                <div v-if="loadingBuild" class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 :size="11" class="animate-spin" /> Fetching build info…
                </div>
                <div v-else-if="build" class="flex flex-wrap items-center gap-2">
                  <span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                    #{{ build.number }}
                  </span>
                  <Badge :variant="build.channel === 'DEFAULT' ? 'supported' : 'legacy'">
                    {{ build.channel }}
                  </Badge>
                  <span class="text-xs text-muted-foreground">
                    {{ (build.download.size / 1_000_000).toFixed(1) }} MB
                  </span>
                  <span v-if="build.javaFlags.length" class="text-xs text-muted-foreground">
                    · {{ build.javaFlags.length }} optimised JVM flags
                  </span>
                </div>
              </div>
            </div>

            <!-- ── Resources & Network ── -->
            <div class="space-y-4 px-6 py-5">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resources & Network</p>
              <div class="grid grid-cols-2 gap-4">
                <!-- RAM -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-foreground">Memory</label>
                  <div class="flex items-center gap-2">
                    <Input
                      :model-value="String(ram)"
                      type="number" min="512" max="65536" step="512"
                      :disabled="creating"
                      @update:model-value="ram = Number($event)"
                    />
                    <span class="shrink-0 text-xs text-muted-foreground">MB</span>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ ram >= 1024 ? `${(ram / 1024).toFixed(ram % 1024 === 0 ? 0 : 1)} GB` : `${ram} MB` }}
                  </p>
                </div>

                <!-- Server port -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-foreground">Server port</label>
                  <Input
                    :model-value="String(port)"
                    type="number" min="1024" max="65535"
                    :disabled="creating"
                    @update:model-value="port = Number($event)"
                  />
                  <p v-if="portError" class="text-xs text-red-500">{{ portError }}</p>
                </div>
              </div>
            </div>

            <!-- ── RCON ── -->
            <div class="space-y-4 px-6 py-5">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">RCON</p>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-foreground">Port</label>
                  <Input
                    :model-value="String(rconPort)"
                    type="number" min="1024" max="65535"
                    :disabled="creating"
                    @update:model-value="rconPort = Number($event)"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-foreground">Password</label>
                  <div class="flex gap-1.5">
                    <Input v-model="rconPassword" :disabled="creating" class="font-mono text-xs min-w-0" />
                    <Button type="button" variant="outline" size="icon" class="shrink-0"
                            :disabled="creating" title="Generate password" @click="generatePassword">
                      <RefreshCw :size="13" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── EULA + Actions ── -->
            <div class="space-y-4 px-6 py-5">
              <label class="flex cursor-pointer items-start gap-3">
                <input v-model="acceptEula" type="checkbox" :disabled="creating"
                       class="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
                <span class="text-xs text-muted-foreground leading-relaxed">
                  I accept the
                  <a class="text-primary underline underline-offset-2 hover:opacity-80"
                     href="https://aka.ms/MinecraftEULA" target="_blank">
                    Minecraft End User License Agreement
                  </a>
                </span>
              </label>

              <!-- Download progress -->
              <div v-if="creating && downloadPct !== null" class="space-y-1.5">
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>Downloading JAR…</span>
                  <span class="font-mono">{{ downloadPct }}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary transition-all duration-300"
                       :style="{ width: `${downloadPct}%` }" />
                </div>
              </div>

              <div class="flex justify-end gap-2">
                <DialogClose as-child>
                  <Button type="button" variant="outline" :disabled="creating">Cancel</Button>
                </DialogClose>
                <Button type="submit" :disabled="!canCreate">
                  <Loader2 v-if="creating" :size="14" class="animate-spin" />
                  {{ creating ? (downloadPct !== null ? 'Downloading…' : 'Creating…') : 'Create server' }}
                </Button>
              </div>
            </div>

          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
