<script setup lang="ts">
import { RouterView } from 'vue-router'
import TitleBar from '@/components/TitleBar.vue'
import ShutdownOverlay from '@/components/ShutdownOverlay.vue'
import PluginChangedDialog from '@/components/PluginChangedDialog.vue'
</script>

<template>
  <TitleBar />

  <ShutdownOverlay />

  <PluginChangedDialog />

  <main class="fixed inset-0 top-9 overflow-hidden bg-background">
    <div class="flex h-full flex-col px-4 pt-6 pb-4">
      <RouterView />
    </div>
  </main>
</template>
