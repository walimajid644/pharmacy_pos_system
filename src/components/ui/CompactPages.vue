<script setup lang="ts" generic="T">
import { computed, ref, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useI18n } from '@/lib/i18n';
const props = withDefaults(
  defineProps<{
    items: T[];
    rowHeight?: number;
    headerHeight?: number;
    followAdded?: boolean;
  }>(),
  { rowHeight: 54, headerHeight: 34, followAdded: false },
);
defineSlots<{ default(props: { rows: { item: T; index: number }[] }): unknown }>();
const { pick, formatNumber } = useI18n();
const region = ref<HTMLElement | null>(null);
const { height } = useElementSize(region);
const page = ref(0);
const size = computed(() =>
  Math.max(1, Math.floor((height.value - props.headerHeight) / props.rowHeight)),
);
const pages = computed(() => Math.max(1, Math.ceil(props.items.length / size.value)));
const rows = computed(() =>
  props.items
    .slice(page.value * size.value, (page.value + 1) * size.value)
    .map((item, offset) => ({ item, index: page.value * size.value + offset })),
);
watch(
  () => props.items.length,
  (count, previous) => {
    if (props.followAdded && count > previous) page.value = pages.value - 1;
    else page.value = 0;
  },
);
watch(pages, () => {
  page.value = Math.min(page.value, pages.value - 1);
});
</script>

<template>
  <div class="compact-pages">
    <div ref="region" class="compact-page-content"><slot :rows="rows" /></div>
    <nav v-if="pages > 1" class="compact-pager" :aria-label="pick('List pages', 'فہرست کے صفحات')">
      <button type="button" :disabled="page === 0" @click="page--">
        ‹ {{ pick('Previous', 'پچھلا') }}
      </button>
      <span
        >{{ formatNumber(page + 1) }} / {{ formatNumber(pages) }} · {{ formatNumber(items.length) }}
        {{ pick('records', 'ریکارڈ') }}</span
      >
      <button type="button" :disabled="page + 1 >= pages" @click="page++">
        {{ pick('Next', 'اگلا') }} ›
      </button>
    </nav>
  </div>
</template>
