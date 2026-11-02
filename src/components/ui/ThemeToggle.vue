<script setup lang="ts">
import { useTheme } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'

const { toggleTheme, isDark } = useTheme()
const { t } = useI18n()
</script>

<template>
  <button
    @click="toggleTheme"
    class="theme-toggle"
    :title="isDark() ? t('light_mode') : t('dark_mode')"
    :aria-label="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
  >
    <!-- Sun icon for light mode (show when dark) -->
    <svg
      v-if="isDark()"
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>

    <!-- Moon icon for dark mode (show when light) -->
    <svg
      v-else
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background-color: var(--color-hover);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: var(--transition-fast);
}

.theme-toggle:hover {
  background-color: var(--color-border);
  transform: scale(1.05);
}

.theme-toggle:active {
  transform: scale(0.95);
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
