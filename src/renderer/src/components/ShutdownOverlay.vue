<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Loader2, Check } from 'lucide-vue-next'
import type { ServerStatus } from '../../../shared/ipc-types'

const visible = ref(false)
const servers = ref<{ name: string; status: ServerStatus }[]>([])

const unsubs: (() => void)[] = []

onMounted(() => {
  unsubs.push(
    window.api.on('app:shutting-down', ({ servers: names }) => {
      servers.value = names.map((name) => ({ name, status: 'stopping' as ServerStatus }))
      visible.value = true
    }),
    window.api.on('server:status-change', ({ name, status }) => {
      const entry = servers.value.find((s) => s.name === name)
      if (entry) entry.status = status
    })
  )
})

onUnmounted(() => unsubs.forEach((u) => u()))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-sm"
      >
        <div class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">

          <!-- Title -->
          <div class="mb-5 text-center">
            <div class="mb-2 flex justify-center">
              <Loader2 :size="28" class="animate-spin text-primary" />
            </div>
            <h2 class="text-sm font-semibold text-foreground">Shutting down servers…</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              The app will close automatically once all servers stop.
            </p>
          </div>

          <!-- Server list -->
          <div class="space-y-2">
            <div
              v-for="s in servers"
              :key="s.name"
              class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <span class="text-sm font-medium text-foreground">{{ s.name }}</span>

              <div class="flex items-center gap-1.5 text-xs">
                <!-- Stopped -->
                <template v-if="s.status === 'stopped'">
                  <Check :size="13" class="text-emerald-500" />
                  <span class="text-emerald-500">Stopped</span>
                </template>
                <!-- Stopping / any other transitioning state -->
                <template v-else>
                  <Loader2 :size="13" class="animate-spin text-muted-foreground" />
                  <span class="text-muted-foreground">Stopping…</span>
                </template>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
