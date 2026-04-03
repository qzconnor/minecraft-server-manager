<script setup lang="ts">
import { onMounted } from 'vue'
import { useIpc } from '@/composables/useIpc'

const { data: systemInfo, loading, execute: fetchSystemInfo } = useIpc('app:get-system-info')
const { data: appVersion, execute: fetchVersion } = useIpc('app:get-version')

onMounted(() => {
  fetchSystemInfo()
  fetchVersion()
})

const rows = [
  { label: 'App version', key: 'appVersion' },
  { label: 'Platform',    key: 'platform' },
  { label: 'Arch',        key: 'arch' },
  { label: 'Node',        key: 'nodeVersion' },
  { label: 'Electron',    key: 'electronVersion' },
] as const
</script>

<template>
  <div class="h-full overflow-y-auto space-y-4 pb-2">
    <div>
      <h1 class="text-lg font-semibold text-foreground">System</h1>
      <p class="text-sm text-muted-foreground">Runtime info from the main process.</p>
    </div>

    <section class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>

      <table v-else-if="systemInfo" class="w-full text-sm">
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.label"
            class="border-b border-border last:border-0"
          >
            <td class="w-1/3 py-2 pr-4 text-muted-foreground">{{ row.label }}</td>
            <td class="py-2 font-mono text-foreground">
              {{ row.key === 'appVersion' ? (appVersion ?? '—') : systemInfo[row.key] }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
