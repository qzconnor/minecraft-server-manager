<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { FolderOpen, Check } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import type { AppConfig } from '../../../shared/ipc-types'

const config  = ref<AppConfig | null>(null)
const saved   = ref(false)

onMounted(async () => {
  config.value = await window.api.invoke('config:get')
})

async function pickFolder(): Promise<void> {
  const folder = await window.api.invoke('config:pick-folder')
  if (!folder) return
  config.value = await window.api.invoke('config:set', { serversFolder: folder })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}
</script>

<template>
  <div class="h-full overflow-y-auto space-y-5 pb-2">

    <div>
      <h1 class="text-lg font-semibold text-foreground">Settings</h1>
      <p class="text-sm text-muted-foreground">Configure Minecraft Server Manager.</p>
    </div>

    <section class="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
      <div>
        <h2 class="text-sm font-semibold text-foreground">Servers folder</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          The directory where all new servers will be created.
        </p>
      </div>

      <!-- Current path -->
      <div
        class="flex min-h-9 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        :class="config?.serversFolder ? 'text-foreground font-mono' : 'text-muted-foreground italic'"
      >
        <FolderOpen :size="14" class="shrink-0 text-muted-foreground" />
        {{ config?.serversFolder ?? 'Not configured' }}
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" @click="pickFolder">
          <FolderOpen :size="14" />
          {{ config?.serversFolder ? 'Change folder' : 'Choose folder' }}
        </Button>
        <span
          v-if="saved"
          class="flex items-center gap-1 text-xs text-emerald-500"
        >
          <Check :size="13" /> Saved
        </span>
      </div>
    </section>

  </div>
</template>
