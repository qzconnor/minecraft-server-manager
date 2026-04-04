<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        supported:   'border-transparent bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400',
        legacy:      'border-transparent bg-amber-500/15  text-amber-600  dark:text-amber-400',
        unsupported: 'border-transparent bg-muted          text-muted-foreground',
        default:     'border-border bg-muted text-muted-foreground',
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

type Variant = VariantProps<typeof badgeVariants>['variant']

interface Props { variant?: Variant; class?: string }
const props = withDefaults(defineProps<Props>(), {})
</script>

<template>
  <span :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </span>
</template>
