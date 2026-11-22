<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth';
import '@/assets/styles/finance-tools.css';
type Review = {
  planId: string;
  sha256: string;
  preparedAt: number;
  summary: {
    company: string;
    products: number;
    invoices: number;
    latestInvoice: string | null;
    latestInvoiceDate?: string | null;
    administrators: string[];
    openDrawers: number;
    sourceFile: string;
  };
};
type Status = {
  maintenance: boolean;
  pending: boolean;
  lastRestore: { restoredAt: string; safetyBackup: string } | null;
};
const { pick, formatDateTime } = useI18n();
const auth = useAuthStore();
const source = ref(''),
  review = ref<Review | null>(null),
  password = ref(''),
  confirmation = ref(''),
  acknowledged = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref(''),
  safety = ref('');
const status = ref<Status>({ maintenance: false, pending: false, lastRestore: null });
async function loadStatus() {
  status.value = await invoke<Status>('restore_status');
  auth.maintenance = status.value.maintenance;
}
async function inspect() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  review.value = null;
  password.value = '';
  confirmation.value = '';
  acknowledged.value = false;
  try {
    review.value = await invoke<Review>('prepare_restore', { sourcePath: source.value.trim() });
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function restore() {
  if (!review.value || !acknowledged.value || busy.value) return;
  busy.value = true;
  auth.maintenance = true;
  error.value = '';
  try {
    const result = await invoke<{ scheduled: boolean; safetyBackup: string }>('queue_restore', {
      planId: review.value.planId,
      password: password.value,
      confirmation: confirmation.value,
    });
    safety.value = result.safetyBackup;
    status.value.maintenance = true;
    status.value.pending = result.scheduled;
    password.value = '';
    message.value = pick(
      'Safety backup saved. Restarting to apply the reviewed backup…',
      'حفاظتی بیک اپ محفوظ۔ بحالی کے لیے ایپ دوبارہ شروع ہو رہی ہے…',
    );
    await invoke('restart_for_restore');
  } catch (e) {
    error.value = String(e);
    try {
      await loadStatus();
    } catch {
      // The restart button remains available if the bridge closes during shutdown.
    }
  } finally {
    password.value = '';
    busy.value = false;
  }
}
async function restart() {
  try {
    await invoke('restart_for_restore');
  } catch (e) {
    error.value = String(e);
  }
}
watch(source, () => {
  review.value = null;
  password.value = '';
  confirmation.value = '';
  acknowledged.value = false;
});
onMounted(() => loadStatus().catch((e) => (error.value = String(e))));
</script>
<template>
  <main class="tool-terminal compact-workspace money-terminal restore-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Restore Data', 'ڈیٹا بحال کریں') }}</h1>
        <p>
          {{
            pick(
              'Inspect a backup, review its contents, then restore during restart.',
              'بیک اپ کی جانچ اور جائزہ لے کر دوبارہ آغاز پر بحال کریں۔',
            )
          }}
        </p>
      </div>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form class="money-toolbar restore-source" @submit.prevent="inspect">
      <label
        >{{ pick('Backup file path', 'بیک اپ فائل کا پاتھ')
        }}<input
          v-model="source"
          required
          :disabled="busy || status.maintenance"
          placeholder="C:\Backups\pharmacy.db" /></label
      ><button :disabled="busy || status.maintenance || !source.trim()">
        {{ busy ? pick('Working…', 'کام جاری ہے…') : pick('Inspect backup', 'بیک اپ کی جانچ') }}
      </button>
    </form>
    <div class="money-body">
      <section class="restore-review">
        <h2>{{ pick('Backup contents', 'بیک اپ کا مواد') }}</h2>
        <dl v-if="review">
          <dt>{{ pick('File', 'فائل') }}</dt>
          <dd>{{ review.summary.sourceFile }}</dd>
          <dt>{{ pick('Pharmacy', 'فارمیسی') }}</dt>
          <dd>{{ review.summary.company }}</dd>
          <dt>{{ pick('Products', 'مصنوعات') }}</dt>
          <dd>{{ review.summary.products }}</dd>
          <dt>{{ pick('Saved invoices', 'محفوظ انوائس') }}</dt>
          <dd>{{ review.summary.invoices }}</dd>
          <dt>{{ pick('Latest invoice', 'آخری انوائس') }}</dt>
          <dd>
            {{ review.summary.latestInvoice || '—' }} {{ review.summary.latestInvoiceDate || '' }}
          </dd>
          <dt>{{ pick('Backup administrators', 'بیک اپ کے منتظمین') }}</dt>
          <dd>{{ review.summary.administrators.join(', ') }}</dd>
          <dt>{{ pick('Open drawers in backup', 'بیک اپ میں کھلی درازیں') }}</dt>
          <dd>{{ review.summary.openDrawers }}</dd>
        </dl>
        <p v-else>
          {{
            pick(
              'Select a Pharmacy POS SQLite backup and inspect it first.',
              'فارمیسی کا SQLite بیک اپ منتخب کر کے پہلے جانچ کریں۔',
            )
          }}
        </p>
        <p>
          {{
            pick(
              'The selected file stays unchanged. Restore creates a separate safety copy of the current database before replacement.',
              'اصل بیک اپ تبدیل نہیں ہوگا۔ بحالی سے پہلے موجودہ ڈیٹابیس کی حفاظتی نقل بنے گی۔',
            )
          }}
        </p>
        <p v-if="status.lastRestore">
          {{ pick('Last restore', 'آخری بحالی') }}:
          {{ formatDateTime(status.lastRestore.restoredAt)
          }}<small>{{ status.lastRestore.safetyBackup }}</small>
        </p>
        <p v-if="safety">
          {{ pick('Safety backup', 'حفاظتی بیک اپ') }}: <code>{{ safety }}</code>
        </p>
      </section>
      <form class="money-editor restore-confirm" @submit.prevent="restore">
        <h2>{{ pick('Confirm replacement', 'تبدیلی کی تصدیق') }}</h2>
        <p>
          {{
            pick(
              'Current transactions and settings will be replaced by the reviewed backup. Sign in afterwards with an administrator account from that backup.',
              'موجودہ اندراجات اور ترتیبات منتخب بیک اپ سے بدل جائیں گے۔ پھر بیک اپ کے منتظم سے لاگ ان کریں۔',
            )
          }}
        </p>
        <label class="money-check"
          ><input
            v-model="acknowledged"
            type="checkbox"
            :disabled="!review || busy || status.maintenance"
          />{{
            pick(
              'I reviewed the backup and accept replacing current data.',
              'میں نے جائزہ لیا اور موجودہ ڈیٹا بدلنے کی تصدیق کرتا ہوں۔',
            )
          }}</label
        ><label
          >{{ pick('Current administrator password', 'موجودہ منتظم کا پاس ورڈ')
          }}<input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="!review || busy || status.maintenance" /></label
        ><label
          >{{ pick('Type RESTORE', 'RESTORE لکھیں')
          }}<input
            v-model="confirmation"
            autocomplete="off"
            :disabled="!review || busy || status.maintenance" /></label
        ><button
          class="money-save"
          :disabled="
            !review ||
            !acknowledged ||
            !password ||
            confirmation !== 'RESTORE' ||
            busy ||
            status.maintenance
          "
        >
          {{ pick('Restore and restart', 'بحال کر کے دوبارہ شروع کریں') }}</button
        ><button v-if="status.maintenance" type="button" :disabled="busy" @click="restart">
          {{ pick('Restart app', 'ایپ دوبارہ شروع کریں') }}
        </button>
      </form>
    </div>
  </main>
</template>
<style scoped>
.restore-source > label {
  flex: 1;
}
.restore-review {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 0;
}
.restore-review dl {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  margin: 12px 0;
}
.restore-review dd,
.restore-review code,
.restore-review small {
  overflow-wrap: anywhere;
}
.restore-review p {
  font-size: 12px;
  margin-top: 14px;
}
.restore-review dt {
  color: var(--text-secondary);
}
</style>
