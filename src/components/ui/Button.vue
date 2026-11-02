<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'default' | 'destructive'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'default'
  disabled?: boolean
  loading?: boolean
  icon?: boolean
  fullWidth?: boolean
  ripple?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  icon: false,
  fullWidth: false,
  ripple: true,
})

// Map legacy variants to new ones
const normalizedVariant = computed(() => {
  if (props.variant === 'default') return 'primary'
  if (props.variant === 'destructive') return 'danger'
  return props.variant
})

// Map legacy sizes to new ones
const normalizedSize = computed(() => {
  if (props.size === 'default') return 'md'
  return props.size
})

const buttonClass = computed(() => {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden'
  
  // Size classes
  const sizeClasses = {
    xs: 'h-8 text-xs rounded-md',
    sm: 'h-9 text-sm rounded-md',
    md: 'h-10 text-base rounded-md',
    lg: 'h-12 text-lg rounded-md',
    xl: 'h-14 text-xl rounded-lg',
  }[normalizedSize.value]
  
  // Padding based on icon-only or regular
  const paddingClasses = props.icon 
    ? 'aspect-square px-0'
    : {
        xs: 'px-3',
        sm: 'px-4',
        md: 'px-6',
        lg: 'px-8',
        xl: 'px-10',
      }[normalizedSize.value]
  
  // Variant classes with new color system
  const variantClasses = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm hover:shadow-md focus-visible:ring-4 focus-visible:ring-brand-500/30',
    secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 active:bg-neutral-400 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-visible:ring-4 focus-visible:ring-neutral-500/30',
    outline: 'border-2 border-neutral-300 bg-transparent hover:bg-neutral-100 active:bg-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-800 focus-visible:ring-4 focus-visible:ring-neutral-500/30',
    ghost: 'bg-transparent hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:ring-4 focus-visible:ring-neutral-500/30',
    danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 shadow-sm hover:shadow-md focus-visible:ring-4 focus-visible:ring-danger-500/30',
  }[normalizedVariant.value]
  
  // Interactive states (disabled when disabled or loading)
  const interactiveClasses = (!props.disabled && !props.loading) 
    ? 'hover:-translate-y-0.5 active:translate-y-0' 
    : ''
  
  const fullWidthClass = props.fullWidth ? 'w-full' : ''
  const rippleClass = props.ripple ? 'ripple-effect' : ''
  
  return cn(
    baseClasses,
    sizeClasses,
    paddingClasses,
    variantClasses,
    interactiveClasses,
    fullWidthClass,
    rippleClass
  )
})

const loadingSpinnerSize = computed(() => {
  return {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
  }[normalizedSize.value]
})
</script>

<template>
  <button 
    :class="buttonClass" 
    :disabled="disabled || loading"
    :type="$attrs.type as string || 'button'"
  >
    <!-- Loading spinner -->
    <svg 
      v-if="loading" 
      :class="[loadingSpinnerSize, 'animate-spin']"
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        class="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        stroke-width="4"
      />
      <path 
        class="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    
    <!-- Button content -->
    <slot v-if="!loading" />
    <span v-else-if="$slots.default" class="opacity-0">
      <slot />
    </span>
  </button>
</template>

<style scoped>
/* Ripple effect styles are in global CSS (index.css) */
</style>
