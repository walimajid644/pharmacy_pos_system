<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: string | number | null
  type?: string
  placeholder?: string
  disabled?: boolean
  error?: string
  label?: string
  hint?: string
  required?: boolean
  size?: 'sm' | 'md' | 'lg'
  prefix?: string
  suffix?: string
  prefixIcon?: string
  suffixIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'prefixClick': []
  'suffixClick': []
}>()

const attrs = useAttrs()

const inputClass = computed(() => {
  const baseClasses = 'w-full border-2 rounded-md transition-all duration-150 focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-neutral-800'
  
  const sizeClasses = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-base',
    lg: 'h-12 px-5 text-lg',
  }[props.size]
  
  const stateClasses = props.error
    ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20 bg-danger-50 dark:bg-danger-950/20'
    : 'border-neutral-300 focus:border-brand-500 focus:ring-brand-500/20 dark:border-neutral-600'
  
  return cn(baseClasses, sizeClasses, stateClasses)
})

const labelClass = computed(() => 
  cn(
    'block font-medium mb-1.5',
    props.size === 'sm' ? 'text-sm' : props.size === 'lg' ? 'text-base' : 'text-sm',
    'text-text-primary'
  )
)

const hasPrefixPadding = computed(() => 
  (props.prefix || props.prefixIcon) ? 'pl-10' : ''
)

const hasSuffixPadding = computed(() => 
  (props.suffix || props.suffixIcon) ? 'pr-10' : ''
)

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = props.type === 'number' ? Number(target.value) : target.value
  emit('update:modelValue', value)
}

function handlePrefixClick() {
  if (props.prefixIcon) {
    emit('prefixClick')
  }
}

function handleSuffixClick() {
  if (props.suffixIcon) {
    emit('suffixClick')
  }
}
</script>

<template>
  <div class="w-full space-y-1.5" :class="attrs.class">
    <!-- Label -->
    <label v-if="label" :class="labelClass">
      {{ label }}
      <span v-if="required" class="text-danger-500 ml-0.5">*</span>
    </label>
    
    <!-- Input wrapper with prefix/suffix -->
    <div class="relative flex items-center">
      <!-- Prefix text or icon -->
      <div 
        v-if="prefix || prefixIcon"
        class="absolute left-3 flex items-center"
        :class="{ 'cursor-pointer': prefixIcon }"
        @click="handlePrefixClick"
      >
        <span v-if="prefixIcon" class="text-text-secondary text-lg">
          {{ prefixIcon }}
        </span>
        <span v-else-if="prefix" class="text-text-secondary text-sm font-medium">
          {{ prefix }}
        </span>
      </div>
      
      <!-- Input field -->
      <input
        v-bind="Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class'))"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :class="[inputClass, hasPrefixPadding, hasSuffixPadding]"
        :aria-invalid="!!error"
        :aria-describedby="error ? 'input-error' : hint ? 'input-hint' : undefined"
        @input="handleInput"
      />
      
      <!-- Suffix text or icon -->
      <div 
        v-if="suffix || suffixIcon"
        class="absolute right-3 flex items-center"
        :class="{ 'cursor-pointer': suffixIcon }"
        @click="handleSuffixClick"
      >
        <span v-if="suffixIcon" class="text-text-secondary text-lg">
          {{ suffixIcon }}
        </span>
        <span v-else-if="suffix" class="text-text-secondary text-sm font-medium">
          {{ suffix }}
        </span>
      </div>
    </div>
    
    <!-- Error message -->
    <p v-if="error" id="input-error" class="text-sm text-danger-500 flex items-center gap-1.5">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{{ error }}</span>
    </p>
    
    <!-- Hint text -->
    <p v-else-if="hint" id="input-hint" class="text-sm text-text-secondary">
      {{ hint }}
    </p>
  </div>
</template>
