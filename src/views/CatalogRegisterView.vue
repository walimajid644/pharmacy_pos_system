<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import CompactPages from '@/components/ui/CompactPages.vue';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import { reportDiagnostic } from '@/lib/diagnostics';
import { diagnosticReason } from '@/lib/diagnosticContext';
import { errorMessage } from '@/lib/errors';

type Kind = 'category' | 'manufacturer' | 'shelf';
type Entry = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
  assignedCount: number;
};
const route = useRoute(),
  router = useRouter(),
  toast = useToast();
const { pick, formatNumber } = useI18n();
const registers = [
  { path: '/categories', kind: 'category' as Kind, en: 'Categories', ur: 'زمرے', max: 120 },
  {
    path: '/manufacturers',
    kind: 'manufacturer' as Kind,
    en: 'Companies',
    ur: 'کمپنیاں',
    max: 120,
  },
  {
    path: '/shelf-locations',
    kind: 'shelf' as Kind,
    en: 'Shelves / Locations',
    ur: 'شیلف / مقامات',
    max: 80,
  },
];
const config = computed(() => registers.find((item) => item.path === route.path) || registers[0]);
const entries = ref<Entry[]>([]),
  loading = ref(false),
  busy = ref(false),
  error = ref('');
const query = ref(''),
  status = ref('all'),
  nameInput = ref<HTMLInputElement | null>(null);
const draft = reactive({
  id: null as string | null,
  name: '',
  description: '',
  isActive: true,
  expectedUpdatedAt: null as string | null,
});
const visible = computed(() =>
  entries.value.filter(
    (entry) =>
      (status.value === 'all' || entry.isActive === (status.value === 'active')) &&
      `${entry.name} ${entry.description || ''}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
let version = 0;
function reset() {
  Object.assign(draft, {
    id: null,
    name: '',
    description: '',
    isActive: true,
    expectedUpdatedAt: null,
  });
  error.value = '';
}
function edit(entry: Entry) {
  if (busy.value) return;
  Object.assign(draft, {
    id: entry.id,
    name: entry.name,
    description: entry.description || '',
    isActive: entry.isActive,
    expectedUpdatedAt: entry.updatedAt,
  });
  error.value = '';
  void nextTick(() => nameInput.value?.focus());
}
async function load() {
  const current = ++version;
  loading.value = true;
  try {
    const rows = await invoke<Entry[]>('list_catalog_register', { kind: config.value.kind });
    if (current === version) entries.value = rows;
  } catch (cause) {
    const code = reportDiagnostic('operation_failed', 'catalog', {
      operation: 'register_load',
      reason: diagnosticReason(cause),
    });
    if (current === version)
      error.value = `${errorMessage(cause)} · ${pick('Support code', 'سپورٹ کوڈ')}: ${code}`;
  } finally {
    if (current === version) loading.value = false;
  }
}
async function save(entry?: Entry) {
  if (busy.value || loading.value) return;
  const kind = config.value.kind;
  const request = entry
    ? {
        kind,
        id: entry.id,
        name: entry.name,
        description: entry.description,
        isActive: !entry.isActive,
        expectedUpdatedAt: entry.updatedAt,
      }
    : { kind, ...draft, name: draft.name.trim(), description: draft.description.trim() || null };
  if (!request.name) {
    nameInput.value?.focus();
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await invoke<string>('save_catalog_register', { request });
    if (config.value.kind === kind) {
      reset();
      await load();
      toast.success(pick('Register saved', 'رجسٹر محفوظ ہو گیا'));
      if (!entry) void nextTick(() => nameInput.value?.focus());
    }
  } catch (cause) {
    const code = reportDiagnostic('operation_failed', 'catalog', {
      operation: 'register_save',
      reason: diagnosticReason(cause),
    });
    if (config.value.kind === kind)
      error.value = `${errorMessage(cause)} · ${pick('Support code', 'سپورٹ کوڈ')}: ${code}`;
  } finally {
    busy.value = false;
  }
}
watch(
  () => route.path,
  () => {
    reset();
    entries.value = [];
    query.value = '';
    status.value = 'all';
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <main class="tool-terminal compact-workspace catalog-register">
    <header class="tool-header">
      <div>
        <h1>{{ pick(config.en, config.ur) }}</h1>
        <p>{{ pick('Reusable product register', 'مصنوعات کے لیے مشترکہ رجسٹر') }}</p>
      </div>
      <div class="register-header-actions">
        <button type="button" :disabled="busy" @click="router.push('/products')">
          {{ pick('Products', 'مصنوعات') }}</button><button
          type="button"
          :disabled="busy || loading"
          @click="load"
        >
          {{ pick('Refresh', 'تازہ کریں') }}
        </button>
      </div>
    </header>
    <nav class="register-tabs" :aria-label="pick('Product registers', 'مصنوعات کے رجسٹر')">
      <button
        v-for="item in registers"
        :key="item.kind"
        type="button"
        :aria-current="config.kind === item.kind ? 'page' : undefined"
        :disabled="busy"
        @click="router.push(item.path)"
      >
        {{ pick(item.en, item.ur) }}
      </button>
    </nav>
    <p v-if="error" role="alert" class="register-error">{{ error }}</p>
    <div class="register-body">
      <section class="register-list" :aria-label="pick('Register entries', 'رجسٹر کی فہرست')">
        <div class="register-filters">
          <label class="register-search"
            >{{ pick('Search', 'تلاش') }}<input v-model="query" type="search" /></label
          ><label
            >{{ pick('Status', 'حیثیت')
            }}<select v-model="status">
              <option value="all">{{ pick('All', 'تمام') }}</option>
              <option value="active">{{ pick('Active', 'فعال') }}</option>
              <option value="inactive">{{ pick('Inactive', 'غیر فعال') }}</option>
            </select></label
          >
        </div>
        <p v-if="loading" class="register-status" role="status">
          {{ pick('Loading…', 'لوڈ ہو رہا ہے…') }}
        </p>
        <CompactPages
          v-else
          :items="visible"
          :row-height="44"
          :header-height="30"
          v-slot="{ rows }"
        >
          <table class="register-table">
            <thead>
              <tr>
                <th>{{ pick('Name', 'نام') }}</th>
                <th>{{ pick('Description', 'تفصیل') }}</th>
                <th>{{ pick('Products', 'مصنوعات') }}</th>
                <th>{{ pick('Status', 'حیثیت') }}</th>
                <th>{{ pick('Actions', 'اختیارات') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="{ item } in rows"
                :key="item.id"
                :class="{ 'is-selected': draft.id === item.id }"
              >
                <td :title="item.name">{{ item.name }}</td>
                <td :title="item.description || ''">{{ item.description || '—' }}</td>
                <td>{{ formatNumber(item.assignedCount) }}</td>
                <td>{{ item.isActive ? pick('Active', 'فعال') : pick('Inactive', 'غیر فعال') }}</td>
                <td>
                  <div class="register-row-actions">
                    <button type="button" :disabled="busy" @click="edit(item)">
                      {{ pick('Edit', 'ترمیم') }}</button><button
                      type="button"
                      :disabled="busy"
                      @click="save(item)"
                    >
                      {{
                        item.isActive
                          ? pick('Deactivate', 'غیر فعال کریں')
                          : pick('Activate', 'فعال کریں')
                      }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!visible.length">
                <td colspan="5" class="register-status">
                  {{
                    pick(
                      'No entries match. Add a new entry using the form.',
                      'کوئی نتیجہ نہیں ملا۔ فارم سے نیا اندراج شامل کریں۔',
                    )
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </section>
      <aside class="register-editor">
        <h2>
          {{ draft.id ? pick('Edit entry', 'اندراج میں ترمیم') : pick('New entry', 'نیا اندراج') }}
        </h2>
        <form @submit.prevent="save()">
          <label for="register-name"
            >{{ pick('Name', 'نام')
            }}<input
              id="register-name"
              ref="nameInput"
              v-model="draft.name"
              required
              :maxlength="config.max"
              :disabled="busy"
              autocomplete="off"
          /></label>
          <label for="register-description"
            >{{ pick('Description', 'تفصیل')
            }}<textarea
              id="register-description"
              v-model="draft.description"
              maxlength="1000"
              rows="3"
              :disabled="busy"
            ></textarea>
          </label>
          <label class="register-active"
            ><input
              id="register-active"
              v-model="draft.isActive"
              type="checkbox"
              :disabled="busy"
            />{{ pick('Active', 'فعال') }}</label
          >
          <p>
            {{
              pick(
                'Inactive entries stay linked to existing products and can be reactivated.',
                'غیر فعال اندراجات موجودہ مصنوعات سے جڑے رہتے ہیں اور دوبارہ فعال کیے جا سکتے ہیں۔',
              )
            }}
          </p>
          <div class="register-form-actions">
            <button type="submit" class="register-save" :disabled="busy || loading">
              {{
                busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save', 'محفوظ کریں')
              }}</button><button type="button" :disabled="busy" @click="reset">
              {{ pick('New / Clear', 'نیا / صاف کریں') }}
            </button>
          </div>
        </form>
      </aside>
    </div>
    <footer class="tool-summary">
      <span
        >{{ pick('Entries shown', 'نظر آنے والے اندراجات') }}: {{ formatNumber(visible.length) }} /
        {{ formatNumber(entries.length) }}</span
      >
    </footer>
  </main>
</template>

<style scoped>
.catalog-register {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
}
.catalog-register button {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-card);
  color: var(--text-primary);
}
.catalog-register button:disabled {
  opacity: 0.5;
  cursor: default;
}
.register-header-actions,
.register-tabs,
.register-row-actions,
.register-form-actions {
  display: flex;
  gap: 5px;
  align-items: center;
}
.register-tabs {
  flex-shrink: 0;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
}
#app .catalog-register .register-tabs [aria-current='page'],
#app .catalog-register .register-save {
  background: var(--color-primary-600);
  color: var(--text-inverse);
  border-color: var(--color-primary-600);
}
.register-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
}
.register-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.register-filters {
  display: flex;
  gap: 8px;
  align-items: end;
  padding: 8px;
  flex-shrink: 0;
}
.register-filters label {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.register-search {
  flex: 1;
}
.register-filters :is(input, select) {
  width: 100%;
}
.register-list :deep(.compact-pages) {
  flex: 1;
  min-height: 0;
}
.register-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.register-table th {
  padding: 5px;
  height: 30px;
  text-align: start;
  border-bottom: 1px solid var(--border);
}
.register-table th:nth-child(1) {
  width: 23%;
}
.register-table th:nth-child(2) {
  width: 24%;
}
.register-table th:nth-child(3) {
  width: 10%;
}
.register-table th:nth-child(4) {
  width: 13%;
}
.register-table th:nth-child(5) {
  width: 30%;
}
.register-table td {
  height: 44px;
  padding: 5px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.register-row-actions {
  flex-wrap: wrap;
}
.register-row-actions button {
  padding: 3px 5px;
  font-size: 10px;
}
.register-table .is-selected {
  background: var(--color-primary-50);
}
.register-editor {
  padding: 10px;
  border-inline-start: 1px solid var(--border);
  background: var(--surface-page);
  min-width: 0;
}
.register-editor h2 {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}
.register-editor form {
  display: grid;
  gap: 10px;
}
.register-editor label {
  display: grid;
  gap: 4px;
  font-weight: 600;
}
.register-editor :is(input:not([type='checkbox']), textarea) {
  width: 100%;
  min-width: 0;
  background: var(--surface-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 5px;
  border-radius: var(--radius-sm);
}
#app .catalog-register .register-editor textarea {
  resize: none;
  height: 66px;
}
.register-editor .register-active {
  display: flex;
  align-items: center;
  gap: 6px;
}
.register-editor p {
  font-size: 10px;
  color: var(--text-secondary);
}
.register-status {
  padding: 12px;
  white-space: normal !important;
}
.register-error {
  padding: 6px 10px;
  color: var(--color-danger);
  background: var(--banner-danger-bg);
  flex-shrink: 0;
}
@media (max-width: 700px) {
  .register-body {
    grid-template-columns: minmax(0, 1fr) 210px;
  }
  .register-tabs {
    flex-wrap: wrap;
  }
}
</style>
