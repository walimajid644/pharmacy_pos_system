<script setup lang="ts">
import { onActionKeydown } from '@/lib/actionKeys';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import CompactPages from '@/components/ui/CompactPages.vue';
import { executeQuery } from '@/lib/database';
import { csvCell } from '@/lib/csv';
import {
  reportCatalog,
  reportParameters,
  type ReportDefinition,
  type ReportRecord,
} from '@/lib/reportCatalog';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/lib/i18n';
import { useFinancePrint } from '@/composables/useFinancePrint';
import '@/assets/styles/finance-tools.css';
const auth = useAuthStore();
const settings = useSettingsStore();
const router = useRouter();
const { formatCurrency, formatNumber, formatDate, formatDateTime, isRTL } = useI18n();
const { printing, print } = useFinancePrint();
const today = new Date();
const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const from = ref(localDate.slice(0, 8) + '01');
const to = ref(localDate);
const choices = computed(() => reportCatalog.filter((r) => auth.can(r.permission)));
const selected = ref(choices.value[0]?.id || '');
const definition = computed(() => choices.value.find((r) => r.id === selected.value));
const result = ref<{
  report: ReportDefinition;
  rows: ReportRecord[];
  period: string;
  generated: string;
} | null>(null);
const loading = ref(false);
const error = ref('');
watch(selected, () => {
  result.value = null;
  error.value = '';
});
watch(
  () => auth.currentUser?.permissions,
  () => {
    result.value = null;
  },
);
onMounted(() => settings.loadSettings());
async function generate() {
  const report = definition.value;
  if (!report || loading.value) return;
  error.value = '';
  result.value = null;
  if (
    report.dated &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(from.value) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to.value) ||
      from.value > to.value)
  ) {
    error.value = uiLabel('Choose a valid date range with From on or before To.');
    return;
  }
  loading.value = true;
  try {
    const rows = await executeQuery<ReportRecord>(
      report.query,
      reportParameters(report, from.value, to.value),
    );
    if (selected.value === report.id && auth.can(report.permission))
      result.value = {
        report,
        rows,
        period: report.dated ? `${from.value} to ${to.value}` : 'Current register / stock',
        generated: new Date().toISOString(),
      };
  } catch {
    error.value = uiLabel('Could not generate this report. Check your access and try again.');
  } finally {
    loading.value = false;
  }
}
function cell(row: ReportRecord, col: ReportDefinition['columns'][number]) {
  const value = row[col.key];
  if (col.money) return formatCurrency(Number(value || 0));
  if (typeof value === 'number') return formatNumber(value);
  if (col.key === 'order_date' && value) return formatDate(value);
  if (col.key === 'state' && value) return uiLabel(value);
  if (col.key === 'status' && value) return uiLabel(value);
  return value ?? '';
}
function periodText(period: string) {
  const dates = period.split(' to ');
  return dates.length === 2
    ? `${formatDate(dates[0])} ${uiLabel('to')} ${formatDate(dates[1])}`
    : uiLabel(period);
}
function download() {
  const data = result.value;
  if (!data) return;
  const lines = [
    [uiLabel(data.report.title), periodText(data.period)],
    [uiLabel(data.report.note)],
    data.report.columns.map((c) => uiLabel(c.label)),
    ...data.rows.map((row) => data.report.columns.map((c) => row[c.key])),
  ];
  const url = URL.createObjectURL(
    new Blob(['\ufeff' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.report.id}-${localDate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <section class="money-terminal report-center" @keydown="onActionKeydown">
    <header class="money-toolbar">
      <h1>{{ uiLabel('Report Center') }}</h1>
      <Button variant="outline" @click="router.push('/reports')">{{
        uiLabel('Sales & Inventory Reports')
      }}</Button>
    </header>
    <form class="report-filters" @submit.prevent="generate">
      <label
        >{{ uiLabel('Report')
        }}<select v-model="selected" :disabled="loading">
          <option v-for="report in choices" :key="report.id" :value="report.id">
            {{ uiLabel(report.title) }}
          </option>
        </select></label
      >
      <label
        >{{ uiLabel('From')
        }}<input v-model="from" type="date" :disabled="!definition?.dated || loading" /></label
      ><label
        >{{ uiLabel('To')
        }}<input v-model="to" type="date" :disabled="!definition?.dated || loading"
      /></label>
      <Button
        aria-keyshortcuts="Control+enter"
        :title="uiLabel('Generate report (Ctrl+Enter)')"
        type="submit"
        :disabled="loading || !definition"
        >{{ uiLabel(loading ? 'Generating…' : 'Generate') }}</Button
      >
    </form>
    <p v-if="definition" class="report-note">{{ uiLabel(definition.note) }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="result">
      <div class="money-toolbar">
        <strong
          >{{ uiLabel(result.report.title) }} · {{ formatNumber(result.rows.length) }}
          {{ uiLabel('rows') }}</strong
        ><span>{{ periodText(result.period) }}</span
        ><Button variant="outline" @click="download">{{ uiLabel('Export CSV') }}</Button
        ><Button aria-keyshortcuts="Control+p" :disabled="printing" @click="print">{{
          uiLabel('Print')
        }}</Button>
      </div>
      <div class="money-list report-results">
        <CompactPages
          :key="result.report.id + result.generated"
          :items="result.rows"
          :row-height="35"
          v-slot="{ rows }"
          ><table>
            <thead>
              <tr>
                <th v-for="col in result.report.columns" :key="col.key">
                  {{ uiLabel(col.label) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item, index } in rows" :key="index">
                <td
                  v-for="col in result.report.columns"
                  :key="col.key"
                  :title="String(cell(item, col))"
                >
                  {{ cell(item, col) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!result.rows.length">
            {{ uiLabel('No records for this report.') }}
          </p></CompactPages
        >
      </div>
      <footer>
        <span>{{ uiLabel('Ctrl+Enter: Generate · Ctrl+P: Print results') }}</span
        ><br />{{ uiLabel('Generated') }} {{ formatDateTime(result.generated) }}
        {{ uiLabel('· Print and CSV include every result row.') }}
      </footer>
    </template>
    <p v-else-if="!loading">{{ uiLabel('Choose a report and press Generate.') }}</p>
    <Teleport to="body"
      ><article v-if="printing && result" class="finance-print-root" :dir="isRTL ? 'rtl' : 'ltr'">
        <h1>{{ settings.settings?.company_name || 'Pharmacy POS' }}</h1>
        <h2>{{ uiLabel(result.report.title) }}</h2>
        <p>
          {{ periodText(result.period) }} {{ uiLabel('· Generated') }}
          {{ formatDateTime(result.generated) }}
        </p>
        <p>{{ uiLabel(result.report.note) }}</p>
        <table>
          <thead>
            <tr>
              <th v-for="col in result.report.columns" :key="col.key">{{ uiLabel(col.label) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in result.rows" :key="index">
              <td v-for="col in result.report.columns" :key="col.key">{{ cell(row, col) }}</td>
            </tr>
          </tbody>
        </table>
        <p>{{ formatNumber(result.rows.length) }} {{ uiLabel('rows') }}</p>
      </article></Teleport
    >
  </section>
</template>
<style scoped>
.report-center {
  gap: 8px;
}
.report-filters {
  display: flex;
  gap: 10px;
  align-items: end;
}
.report-filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.report-filters label:first-child {
  flex: 1;
}
select,
input {
  padding: 8px;
  color: var(--text-primary);
  background: var(--surface-card);
  border: 1px solid var(--border);
}
.report-note,
footer {
  font-size: 12px;
  color: var(--text-secondary);
}
.report-results {
  min-height: 0;
}
table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
td,
th {
  padding: 8px 5px;
  font-size: 12px;
  text-align: start;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[role='alert'] {
  color: var(--color-danger);
}
</style>
