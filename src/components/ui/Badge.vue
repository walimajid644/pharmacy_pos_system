<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
  outline?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'md',
  dot: false,
  outline: false,
})

// Map legacy variants
const normalizedVariant = computed(() => {
  if (props.variant === 'secondary') return 'info'
  if (props.variant === 'primary') return 'brand'
  return props.variant
})

const badgeClass = computed(() => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-full transition-colors whitespace-nowrap'
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-1.5 text-base gap-2',
  }[props.size]
  
  // Variant classes with outline support
  const variantClasses = props.outline 
    ? {
        neutral: 'bg-transparent border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300',
        brand: 'bg-transparent border border-brand-500 text-brand-700 dark:text-brand-400',
        success: 'bg-transparent border border-success-500 text-success-700 dark:text-success-400',
        warning: 'bg-transparent border border-warning-500 text-warning-700 dark:text-warning-400',
        danger: 'bg-transparent border border-danger-500 text-danger-700 dark:text-danger-400',
        info: 'bg-transparent border border-info-500 text-info-700 dark:text-info-400',
      }[normalizedVariant.value]
    : {
        neutral: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700',
        brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-400 border border-brand-200 dark:border-brand-800',
        success: 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400 border border-success-200 dark:border-success-800',
        warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-400 border border-warning-200 dark:border-warning-800',
        danger: 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-400 border border-danger-200 dark:border-danger-800',
        info: 'bg-info-100 text-info-800 dark:bg-info-900/30 dark:text-info-400 border border-info-200 dark:border-info-800',
      }[normalizedVariant.value]
  
  return cn(baseClasses, sizeClasses, variantClasses)
})

const dotClass = computed(() => {
  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  }[props.size]
  
  return cn('rounded-full', dotSize)
})

const dotColorClass = computed(() => {
  return {
    neutral: 'bg-neutral-500',
    brand: 'bg-brand-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    info: 'bg-info-500',
  }[normalizedVariant.value]
})
</script>

<template>
  <span :class="badgeClass">
    <span v-if="dot" :class="[dotClass, dotColorClass]" aria-hidden="true"></span>
    <slot />
  </span>
</template>
