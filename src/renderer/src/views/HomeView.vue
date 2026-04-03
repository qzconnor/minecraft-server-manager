<script setup lang="ts">
import { ref } from 'vue'
import { useIpc } from '@/composables/useIpc'
import Button from '@/components/ui/button.vue'

const name = ref('')
const {
  data: greeting,
  loading: greetingLoading,
  error: greetingError,
  execute: sayHello
} = useIpc('greeting:say-hello')

async function handleGreet(): Promise<void> {
  if (!name.value.trim()) return
  await sayHello({ name: name.value.trim() })
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-lg font-semibold text-foreground">Home</h1>
      <p class="text-sm text-muted-foreground">Typesafe IPC greeting example.</p>
    </div>

    <section class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 class="mb-1 text-sm font-semibold text-foreground">Greeting</h2>
      <p class="mb-3 text-xs text-muted-foreground">
        Calls
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">greeting:say-hello</code>
        on the main process.
      </p>

      <form class="flex gap-2" @submit.prevent="handleGreet">
        <input
          v-model="name"
          placeholder="Your name"
          class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm
                 text-foreground placeholder:text-muted-foreground
                 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button type="submit" :disabled="greetingLoading || !name.trim()">
          {{ greetingLoading ? 'Sending…' : 'Say hello' }}
        </Button>
      </form>

      <p v-if="greetingError" class="mt-2 text-xs text-red-500">{{ greetingError }}</p>

      <div
        v-if="greeting"
        class="mt-3 rounded-md border-l-2 border-primary bg-muted px-3 py-2"
      >
        <p class="text-sm text-foreground">{{ greeting.message }}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Main-process timestamp: {{ new Date(greeting.timestamp).toLocaleTimeString() }}
        </p>
      </div>
    </section>
  </div>
</template>
