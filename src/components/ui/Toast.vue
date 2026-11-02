<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 3000,
})

const emit = defineEmits<{
  close: []
}>()

const show = ref(false)

onMounted(() => {
  show.value = true
  if (props.duration > 0) {
    setTimeout(() => {
      show.value = false
      setTimeout(() => emit('close'), 300)
    }, props.duration)
  }
})

function close() {
  show.value = false
  setTimeout(() => emit('close'), 300)
}

const bgColor = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}

const icon = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}
</script>

<template>
  <div
    :class="[
      'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white transition-all duration-300',
      bgColor[type],
      show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    ]"
  >
    <span class="text-xl font-bold">{{ icon[type] }}</span>
    <span class="font-medium">{{ message }}</span>
    <button @click="close" class="ml-2 hover:opacity-75">
      <span class="text-xl">×</span>
    </button>
  </div>
</template>
