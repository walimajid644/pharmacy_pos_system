<script setup lang="ts" generic="T">
import { computed, ref, watch, onUpdated } from 'vue';
import { useElementSize, useResizeObserver } from '@vueuse/core';
import { useI18n } from '@/lib/i18n';
const props = withDefaults(
  defineProps<{
    items: T[];
    rowHeight?: number;
    headerHeight?: number;
    followAdded?: boolean;
    activeIndex?: number;
  }>(),
  { rowHeight: 54, headerHeight: 34, followAdded: false },
);
defineSlots<{ default(props: { rows: { item: T; index: number }[] }): unknown }>();
const { pick, formatNumber } = useI18n();
const region = ref<HTMLElement | null>(null);
const { height } = useElementSize(region);
const page = ref(0);
const followTail = ref(false);
const measuredRow = ref(0);
const measuredHeader = ref(0);
function measureTable() {
  const table = region.value?.querySelector('table');
  if (!props.items.length) return;
  if (!table) {
    const first = region.value?.firstElementChild;
    const list = first?.matches('ul,.line-items,.suppliers-grid') ? first : region.value;
    const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
    measuredRow.value = Math.max(
      measuredRow.value,
      ...Array.from(list?.children || [], (row) =>
        Math.ceil(row.getBoundingClientRect().height + gap),
      ),
    );
    return;
  }
  const rowHeight = Math.max(
    0,
    ...Array.from(table.tBodies[0]?.rows || [], (row) => row.getBoundingClientRect().height),
  );
  measuredRow.value = Math.max(measuredRow.value, Math.ceil(rowHeight));
  measuredHeader.value = Math.max(
    measuredHeader.value,
    Math.ceil(
      (table.tHead?.getBoundingClientRect().height || 0) +
        (table.tFoot?.getBoundingClientRect().height || 0),
    ),
  );
}
useResizeObserver(region, measureTable);
onUpdated(measureTable);
const size = computed(() =>
  Math.max(
    1,
    Math.floor(
      (height.value - Math.max(props.headerHeight, measuredHeader.value)) /
        Math.max(props.rowHeight, measuredRow.value),
    ),
  ),
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
    followTail.value = props.followAdded && count > previous;
    page.value = followTail.value ? pages.value - 1 : 0;
  },
);
watch(pages, () => {
  page.value = followTail.value ? pages.value - 1 : Math.min(page.value, pages.value - 1);
});
watch([() => props.activeIndex, size], ([index]) => {
  if (index != null && index >= 0)
    page.value = Math.min(pages.value - 1, Math.floor(index / size.value));
});
</script>

<template>
  <div class="compact-pages">
    <div ref="region" class="compact-page-content"><slot :rows="rows" /></div>
    <nav v-if="pages > 1" class="compact-pager" :aria-label="pick('List pages', 'فہرست کے صفحات')">
      <button
        type="button"
        :disabled="page === 0"
        @click="
          followTail = false;
          page--;
        "
      >
        ‹ {{ pick('Previous', 'پچھلا') }}
      </button>
      <span
        >{{ formatNumber(page + 1) }} / {{ formatNumber(pages) }} · {{ formatNumber(items.length) }}
        {{ pick('records', 'ریکارڈ') }}</span
      >
      <button
        type="button"
        :disabled="page + 1 >= pages"
        @click="
          followTail = false;
          page++;
        "
      >
        {{ pick('Next', 'اگلا') }} ›
      </button>
    </nav>
  </div>
</template>
