<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, type TranslationKey } from '@/lib/i18n'

const props = defineProps<{
  textKey: TranslationKey
  showBoth?: boolean
}>()

const { tEn, tUr, language } = useI18n()

const showEn = computed(() => 
  props.showBoth || language.value === 'en' || language.value === 'mixed'
)

const showUr = computed(() => 
  props.showBoth || language.value === 'ur' || language.value === 'mixed'
)

const separator = computed(() => 
  language.value === 'mixed' ? ' / ' : ''
)
</script>

<template>
  <span class="bilingual-text">
    <span v-if="showEn" class="en" dir="ltr">{{ tEn(textKey) }}</span>
    <span v-if="showEn && showUr" class="separator">{{ separator }}</span>
    <span v-if="showUr" class="ur" dir="rtl" lang="ur">{{ tUr(textKey) }}</span>
  </span>
</template>

<style scoped>
.bilingual-text {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.en {
  font-family: var(--font-en);
}

.ur {
  font-family: var(--font-ur);
  font-size: 0.95em;
}

.separator {
  color: var(--color-text-secondary);
  font-weight: 300;
}
</style>
