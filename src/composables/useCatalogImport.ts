import { computed, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useRouter } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import {
  readCatalogFile,
  normalizeCatalog,
  catalogTemplate,
  type CatalogRow,
} from '@/lib/catalogFile';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';

export function useCatalogImport() {
  const { pick } = useI18n(),
    router = useRouter();

  type Preview = {
    valid: boolean;
    products: number;
    batches: number;
    newCategories: number;
    newManufacturers: number;
    rows: Array<{ row: number; sku: string; name: string; errors: string[]; warnings: string[] }>;
  };

  type Result = {
    operationId: string;
    products: number;
    batches: number;
    categories: number;
    manufacturers: number;
  };

  const sheets = ref<Array<{ sheet: string; data: unknown[][] }>>([]),
    sheet = ref(0),
    filename = ref(''),
    rows = ref<CatalogRow[]>([]),
    create = ref(false),
    preview = ref<Preview | null>(null),
    result = ref<Result | null>(null),
    error = ref(''),
    busy = ref(false),
    page = ref(0),
    confirm = ref(false),
    dialog = ref<HTMLElement | null>(null),
    ack = ref(false),
    requestId = ref(crypto.randomUUID()),
    onlyErrors = ref(false);

  const shown = computed(
      () => preview.value?.rows.filter((r) => !onlyErrors.value || r.errors.length) || [],
    ),
    paged = computed(() => shown.value.slice(page.value * 100, (page.value + 1) * 100));

  useDialogKeyboard(dialog, () => {
    if (!busy.value) confirm.value = false;
  });

  watch([sheet, create], () => {
    preview.value = null;
    result.value = null;
    error.value = '';
    requestId.value = crypto.randomUUID();
    page.value = 0;
  });

  function template() {
    const url = URL.createObjectURL(
      new Blob([catalogTemplate()], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pharmacy-catalog-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fileChanged(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    busy.value = true;
    preview.value = null;
    result.value = null;
    error.value = '';
    rows.value = [];
    sheets.value = [];
    requestId.value = crypto.randomUUID();
    try {
      sheets.value = await readCatalogFile(file);
      sheet.value = 0;
      filename.value = file.name;
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
      input.value = '';
    }
  }

  async function validate() {
    busy.value = true;
    error.value = '';
    preview.value = null;
    result.value = null;
    page.value = 0;
    requestId.value = crypto.randomUUID();
    try {
      rows.value = normalizeCatalog(sheets.value[sheet.value].data);
      preview.value = await invoke<Preview>('preview_catalog_import', {
        request: { requestId: requestId.value, createLookups: create.value, rows: rows.value },
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  async function save() {
    if (!ack.value || !preview.value?.valid || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      result.value = await invoke<Result>('import_catalog', {
        request: { requestId: requestId.value, createLookups: create.value, rows: rows.value },
      });
      confirm.value = false;
      preview.value = null;
      rows.value = [];
      sheets.value = [];
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  return {
    pick,
    router,
    sheets,
    sheet,
    filename,
    rows,
    create,
    preview,
    result,
    error,
    busy,
    page,
    confirm,
    dialog,
    ack,
    onlyErrors,
    shown,
    paged,
    template,
    fileChanged,
    validate,
    save,
    ref,
  };
}
