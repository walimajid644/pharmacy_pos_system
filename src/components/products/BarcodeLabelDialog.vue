<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { reportDiagnostic } from '@/lib/diagnostics';

import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import type { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { encodeCode39 } from '@/lib/code39';
import { useToast } from '@/composables/useToast';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ product: Product }>();
const emit = defineEmits<{ close: [] }>();
const toast = useToast();
const labelDialog = ref<HTMLElement | null>(null);
useDialogKeyboard(labelDialog, () => emit('close'));
const labelCount = ref(1);
const printingLabels = ref(false);
const labelBarcode = computed(() => encodeCode39(props.product?.barcode || ''));
const labelCopies = computed(() =>
  Array.from({ length: Number(labelCount.value) || 0 }, (_, index) => index),
);
let cleanupPrint: (() => void) | undefined;

onBeforeUnmount(() => cleanupPrint?.());

async function printLabels() {
  if (printingLabels.value) return;
  if (
    !props.product ||
    !labelBarcode.value ||
    !Number.isInteger(Number(labelCount.value)) ||
    Number(labelCount.value) < 1 ||
    Number(labelCount.value) > 100
  ) {
    toast.warning('Choose 1 to 100 labels');
    return;
  }
  printingLabels.value = true;
  await nextTick();
  document.body.classList.add('printing-labels');
  const pageStyle = document.createElement('style');
  pageStyle.textContent = '@page { size: 75mm 35mm; margin: 0; }';
  document.head.appendChild(pageStyle);
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    pageStyle.remove();
    document.body.classList.remove('printing-labels');
    printingLabels.value = false;
    cleanupPrint = undefined;
  };
  cleanupPrint = cleanup;
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
  } catch {
    window.removeEventListener('afterprint', cleanup);
    cleanup();
    reportDiagnostic('operation_failed', 'workspace');
    toast.error('Could not open the print dialog');
  }
}
</script>

<template>
  <div
    class="compact-dialog barcode-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @pointerdown.self.prevent
  >
    <section
      ref="labelDialog"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Print barcode labels"
      class="compact-dialog-card barcode-dialog-card"
    >
      <h2 class="text-xl font-semibold">{{ uiLabel('Print barcode labels') }}</h2>
      <p class="mt-2 text-sm">{{ product.name }} · {{ product.barcode }}</p>
      <p class="mt-1 text-xs text-muted-foreground">
        {{
          uiLabel(
            '75 × 35 mm Code 39 labels. Select a desktop label printer and matching paper in the print dialog.',
          )
        }}
      </p>
      <label class="mt-4 block text-sm"
        >{{ uiLabel('Number of labels') }}
        <input
          v-model.number="labelCount"
          type="number"
          min="1"
          max="100"
          step="1"
          class="mt-1 block w-28 rounded border bg-background p-2"
        />
      </label>
      <div v-if="labelBarcode" class="mt-4 rounded border bg-white p-3 text-center text-black">
        <div class="truncate text-xs">{{ product.name }}</div>
        <svg
          class="mx-auto h-12 w-full"
          :viewBox="`0 0 ${labelBarcode.width} 30`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Barcode ${product.barcode}`"
        >
          <rect
            v-for="(bar, index) in labelBarcode.bars"
            :key="index"
            :x="bar.x"
            y="0"
            :width="bar.width"
            height="30"
            fill="black"
          />
        </svg>
        <div class="font-mono text-xs">{{ product.barcode }}</div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button variant="outline" @click="emit('close')">Cancel</Button
        ><Button @click="printLabels">{{ uiLabel('Print labels') }}</Button>
      </div>
    </section>
  </div>
  <Teleport to="body">
    <div v-if="printingLabels && labelBarcode" class="barcode-print-root">
      <section v-for="copy in labelCopies" :key="copy" class="barcode-print-label">
        <div class="barcode-print-name">{{ product.name }}</div>
        <svg
          :viewBox="`0 0 ${labelBarcode.width} 30`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Barcode ${product.barcode}`"
        >
          <rect
            v-for="(bar, index) in labelBarcode.bars"
            :key="index"
            :x="bar.x"
            y="0"
            :width="bar.width"
            height="30"
            fill="black"
          />
        </svg>
        <div class="barcode-print-code">{{ product.barcode }}</div>
        <div class="barcode-print-price">{{ formatCurrency(product.unit_price) }}</div>
      </section>
    </div>
  </Teleport>
</template>

<style>
.barcode-print-root {
  display: none;
}
@media print {
  body.printing-labels > *:not(.barcode-print-root) {
    display: none !important;
  }
  body > .barcode-print-root {
    display: block !important;
    color: #000;
    background: #fff;
  }
  .barcode-print-label {
    width: 75mm;
    height: 35mm;
    box-sizing: border-box;
    padding: 2mm;
    text-align: center;
    font:
      8pt Arial,
      sans-serif;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  .barcode-print-label:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .barcode-print-name {
    height: 5mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .barcode-print-label svg {
    display: block;
    width: 71mm;
    height: 16mm;
    shape-rendering: crispEdges;
  }
  .barcode-print-code {
    direction: ltr;
    font: 7pt monospace;
    margin-top: 1mm;
  }
  .barcode-print-price {
    margin-top: 1mm;
    font-weight: bold;
  }
}
</style>
