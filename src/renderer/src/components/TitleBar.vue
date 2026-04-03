<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Minus, Square, Maximize2, X, Sun, Moon } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/button.vue'
import { useTheme } from '@/composables/useTheme'

const { theme, toggle: toggleTheme } = useTheme()

const isMaximized = ref(false)

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  isMaximized.value = await window.api.invoke('window:is-maximized')
  unsubscribe = window.api.on('window:maximized', (val) => {
    isMaximized.value = val
  })
})

onUnmounted(() => unsubscribe?.())

async function minimize(): Promise<void> {
  await window.api.invoke('window:minimize')
}

async function toggleMaximize(): Promise<void> {
  const { isMaximized: next } = await window.api.invoke('window:maximize-toggle')
  isMaximized.value = next
}

async function close(): Promise<void> {
  await window.api.invoke('window:close')
}
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-[100] flex h-9 items-center
           border-b border-border bg-card text-card-foreground
           select-none [app-region:drag]"
    style="-webkit-app-region: drag"
  >
    <!-- App title -->
    <span class="px-3 text-xs font-medium text-muted-foreground select-none shrink-0">
      Minecraft Server Manager
    </span>

    <div class="mx-1 h-4 w-px bg-border shrink-0" />

    <!-- Nav links — no-drag so clicks register -->
    <nav class="flex items-center gap-0.5 overflow-x-auto px-1" style="-webkit-app-region: no-drag">
      <RouterLink
        to="/servers"
        class="rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
        active-class="!text-foreground bg-accent"
      >
        Servers
      </RouterLink>
      <RouterLink
        to="/settings"
        class="rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
        active-class="!text-foreground bg-accent"
      >
        Settings
      </RouterLink>
    </nav>

    <!-- Drag region fills all remaining space -->
    <span class="flex-1" />

    <!-- Controls — must NOT be draggable -->
    <div class="flex items-center" style="-webkit-app-region: no-drag">

      <!-- Theme toggle -->
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 rounded-none text-muted-foreground hover:text-foreground"
        :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <Sun v-if="theme === 'dark'" :size="15" :stroke-width="1.75" />
        <Moon v-else :size="15" :stroke-width="1.75" />
      </Button>

      <div class="mx-1 h-4 w-px bg-border" />

      <!-- Minimize -->
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 rounded-none text-muted-foreground hover:text-foreground"
        title="Minimize"
        @click="minimize"
      >
        <Minus :size="14" :stroke-width="1.75" />
      </Button>

      <!-- Maximize / Restore -->
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 rounded-none text-muted-foreground hover:text-foreground"
        :title="isMaximized ? 'Restore' : 'Maximize'"
        @click="toggleMaximize"
      >
        <Square v-if="!isMaximized" :size="13" :stroke-width="1.75" />
        <Maximize2 v-else :size="13" :stroke-width="1.75" />
      </Button>

      <!-- Close -->
      <Button
        variant="ghost"
        size="icon"
        class="h-9 w-9 rounded-none text-muted-foreground hover:bg-red-600 hover:text-white"
        title="Close"
        @click="close"
      >
        <X :size="14" :stroke-width="1.75" />
      </Button>
    </div>
  </header>
</template>
