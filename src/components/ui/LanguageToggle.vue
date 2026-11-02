<script setup lang="ts">
import { useI18n, type Language } from '@/lib/i18n'

const { language, setLanguage } = useI18n()

const languages: { value: Language; label: string; urLabel: string }[] = [
  { value: 'en', label: 'EN', urLabel: 'انگریزی' },
  { value: 'mixed', label: 'EN/UR', urLabel: 'دونوں' },
  { value: 'ur', label: 'UR', urLabel: 'اردو' },
]

function cycleLanguage() {
  const currentIndex = languages.findIndex(l => l.value === language.value)
  const nextIndex = (currentIndex + 1) % languages.length
  setLanguage(languages[nextIndex].value)
}

const currentLang = () => {
  return languages.find(l => l.value === language.value)
}
</script>

<template>
  <button
    @click="cycleLanguage"
    class="language-toggle"
    :title="`Language: ${currentLang()?.label}`"
    :aria-label="`Switch language. Current: ${currentLang()?.label}`"
  >
    <span class="label">{{ currentLang()?.label }}</span>
  </button>
</template>

<style scoped>
.language-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 3.5rem;
  height: 2.5rem;
  padding: 0 0.75rem;
  border-radius: var(--radius);
  background-color: var(--color-hover);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: var(--transition-fast);
  font-weight: 500;
  font-size: 0.875rem;
}

.language-toggle:hover {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.language-toggle:active {
  transform: scale(0.95);
}

.label {
  font-family: var(--font-en);
}
</style>
