<script setup lang="ts">
import { onMounted, ref } from 'vue'

const version = ref('')
onMounted(async () => {
  const v = await window.api.invoke('app:get-version')
  version.value = v
})
</script>

<template>
  <span v-if="version">v{{ version }}</span>
</template>
