<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { localDateKey } from '@/lib/businessDay';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';
import '@/assets/styles/finance-tools.css';
type Entry = { id: string; occurred_at: string; event: string; username: string; reason: string };
const { pick, formatDateTime } = useI18n();
const from = ref(localDateKey().slice(0, 7) + '-01'),
  to = ref(localDateKey()),
  query = ref(''),
  event = ref(''),
  entries = ref<Entry[]>([]),
  loading = ref(false),
  error = ref(''),
  truncated = ref(false);
let version = 0;
function label(value: string) {
  return (
    {
      sign_in: pick('Signed in', 'لاگ ان'),
      failed_sign_in: pick('Failed sign-in', 'ناکام لاگ ان'),
      sign_out: pick('Signed out', 'لاگ آؤٹ'),
      session_expired: pick('Session expired', 'سیشن ختم'),
      window_closed: pick('Window closed', 'ونڈو بند'),
    }[value as 'sign_in'] || value
  );
}
function reasonLabel(value: string) {
  const labels: Record<string, string> = {
    authenticated: pick('Authenticated', 'تصدیق شدہ'),
    invalid_credentials: pick('Username or password did not match', 'نام یا پاس ورڈ درست نہیں'),
    idle_timeout: pick('Inactive for 12 hours', '12 گھنٹے غیر فعال'),
    user_request: pick('User signed out', 'صارف نے لاگ آؤٹ کیا'),
    window_close: pick('App window closed', 'ایپ کی ونڈو بند ہوئی'),
  };
  return labels[value] || value;
}
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const value = await invoke<{ entries: Entry[]; truncated: boolean }>('read_login_history', {
      fromDate: from.value,
      toDate: to.value,
      query: query.value,
      event: event.value,
    });
    if (current === version) {
      entries.value = value.entries;
      truncated.value = value.truncated;
    }
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
watch([from, to, event], () => void load());
onMounted(load);
</script>
<template>
  <main class="tool-terminal compact-workspace money-terminal login-history">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Login History', 'لاگ ان کی تاریخ') }}</h1>
        <p>
          {{
            pick(
              'Sign-ins, failed attempts, sign-outs and session expiry. History starts with this update.',
              'لاگ ان، ناکام کوشش، لاگ آؤٹ اور سیشن کا اختتام۔ تاریخ اس اپ ڈیٹ سے شروع ہے۔',
            )
          }}
        </p>
      </div>
      <button :disabled="loading" @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <form class="money-toolbar" @submit.prevent="load">
      <label>{{ pick('From', 'سے') }}<input v-model="from" type="date" /></label
      ><label>{{ pick('To', 'تک') }}<input v-model="to" type="date" :max="localDateKey()" /></label
      ><label
        >{{ pick('Username', 'صارف کا نام')
        }}<input v-model="query" type="search" maxlength="80" /></label
      ><label
        >{{ pick('Event', 'واقعہ')
        }}<select v-model="event">
          <option value="">{{ pick('All events', 'تمام واقعات') }}</option>
          <option
            v-for="e in [
              'sign_in',
              'failed_sign_in',
              'sign_out',
              'session_expired',
              'window_closed',
            ]"
            :key="e"
            :value="e"
          >
            {{ label(e) }}
          </option>
        </select></label
      ><button :disabled="loading">{{ pick('Search', 'تلاش') }}</button>
    </form>
    <small v-if="truncated">{{
      pick(
        'Showing 1000 events. Narrow the dates or username for older events.',
        'پرانی تاریخ کے لیے تلاش محدود کریں۔',
      )
    }}</small>
    <section class="money-list">
      <CompactPages :items="entries" :row-height="40" :header-height="32" v-slot="{ rows }"
        ><table>
          <thead>
            <tr>
              <th>{{ pick('Local date / time', 'مقامی تاریخ / وقت') }}</th>
              <th>{{ pick('Username', 'صارف کا نام') }}</th>
              <th>{{ pick('Event', 'واقعہ') }}</th>
              <th>{{ pick('Reason', 'وجہ') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item } in rows" :key="item.id">
              <td>{{ formatDateTime(item.occurred_at) }}</td>
              <td>{{ item.username }}</td>
              <td>{{ label(item.event) }}</td>
              <td>{{ reasonLabel(item.reason) }}</td>
            </tr>
            <tr v-if="!entries.length">
              <td colspan="4">
                {{
                  loading
                    ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                    : pick('No login events match.', 'کوئی واقعہ نہیں ملا۔')
                }}
              </td>
            </tr>
          </tbody>
        </table></CompactPages
      >
    </section>
  </main>
</template>
