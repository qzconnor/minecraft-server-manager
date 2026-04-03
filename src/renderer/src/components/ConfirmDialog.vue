<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'radix-vue'
import { TriangleAlert } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'

defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2
               rounded-xl border border-border bg-card p-6 shadow-2xl
               focus:outline-none"
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10">
            <TriangleAlert :size="22" class="text-red-500" />
          </div>

          <div>
            <DialogTitle class="text-base font-semibold text-foreground">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-sm text-muted-foreground">
              {{ description }}
            </DialogDescription>
          </div>

          <div class="flex w-full gap-2">
            <Button class="flex-1" variant="outline" :disabled="loading"
                    @click="emit('update:open', false)">
              Cancel
            </Button>
            <Button class="flex-1 bg-red-500 text-white hover:bg-red-600"
                    :disabled="loading" @click="emit('confirm')">
              <Loader2 v-if="loading" :size="13" class="animate-spin" />
              {{ confirmLabel ?? 'Confirm' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
