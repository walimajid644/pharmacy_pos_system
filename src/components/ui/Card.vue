<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'default' | 'elevated' | 'outlined' | 'flat'
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  hoverable?: boolean
  clickable?: boolean
  as?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  padding: 'md',
  hoverable: false,
  clickable: false,
  as: 'div',
})

const cardClass = computed(() => {
  const baseClasses = 'rounded-lg bg-surface-primary transition-all duration-200'
  
  const variantClasses = {
    default: 'border border-border-primary shadow-sm',
    elevated: 'shadow-lg border border-border-primary',
    outlined: 'border-2 border-border-primary',
    flat: 'bg-surface-secondary',
  }[props.variant]
  
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  }[props.padding]
  
  const interactiveClasses = (props.hoverable || props.clickable)
    ? 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'
    : ''
  
  return cn(baseClasses, variantClasses, paddingClasses, interactiveClasses)
})
</script>

<template>
  <component :is="as" :class="cardClass">
    <slot />
  </component>
</template>
