<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'radix-vue'
import { Package, RefreshCw, RotateCcw, Loader2, TriangleAlert } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'

interface PendingChange {
  serverName: string
  pluginName: string
  action: 'reload' | 'restart'
}

const queue   = ref<PendingChange[]>([])
const current = ref<PendingChange | null>(null)
const acting  = ref(false)
const open    = ref(false)
const error   = ref<string | null>(null)

function showNext(): void {
  if (current.value || queue.value.length === 0) return
  current.value = queue.value.shift()!
  error.value = null
  open.value = true
}

let unsub: (() => void) | null = null
onMounted(() => {
  unsub = window.api.on('plugin:changed', (payload) => {
    queue.value = queue.value.filter(
      q => !(q.serverName === payload.serverName && q.pluginName === payload.pluginName)
    )
    queue.value.push(payload)
    showNext()
  })
})
onUnmounted(() => unsub?.())

function dismiss(): void {
  open.value = false
  current.value = null
  error.value = null
  setTimeout(showNext, 150)
}

async function performAction(): Promise<void> {
  if (!current.value) return
  const { serverName, action } = current.value
  acting.value = true
  error.value = null
  try {
    if (action === 'reload') {
      const connected = await window.api.invoke('rcon:is-connected', { serverName })
      if (!connected) await window.api.invoke('rcon:connect', { serverName })
      await window.api.invoke('rcon:send', { serverName, command: 'reload confirm' })
    } else {
      await window.api.invoke('server:restart', { name: serverName })
    }
    dismiss()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => { if (!v) dismiss() }">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2
               rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none"
        @pointer-down-outside="(e) => { if (document.getElementById('app-titlebar')?.contains(e.detail.originalEvent.target as Node)) e.preventDefault() }"
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Package :size="22" class="text-primary" />
          </div>

          <div>
            <DialogTitle class="text-sm font-semibold text-foreground">Plugin changed</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              <span class="font-mono font-medium text-foreground">{{ current?.pluginName }}</span>
              has been updated on <span class="font-medium text-foreground">{{ current?.serverName }}</span>.
            </DialogDescription>
          </div>

          <!-- Action info -->
          <div class="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <RefreshCw v-if="current?.action === 'reload'" :size="13" class="shrink-0 text-primary" />
            <RotateCcw v-else :size="13" class="shrink-0 text-primary" />
            <span>
              Configured action:
              <span class="font-medium text-foreground capitalize">{{ current?.action }}</span>
              the server
            </span>
          </div>

          <!-- Error -->
          <div v-if="error" class="flex w-full items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
            <TriangleAlert :size="13" class="mt-0.5 shrink-0" />
            <span>{{ error }}</span>
          </div>

          <div class="flex w-full gap-2">
            <Button class="flex-1" variant="outline" :disabled="acting" @click="dismiss">
              Dismiss
            </Button>
            <Button class="flex-1" :disabled="acting" @click="performAction">
              <Loader2 v-if="acting" :size="13" class="animate-spin" />
              <RefreshCw v-else-if="current?.action === 'reload'" :size="13" />
              <RotateCcw v-else :size="13" />
              {{ current?.action === 'reload' ? 'Reload' : 'Restart' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
