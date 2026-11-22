<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';
import '@/assets/styles/finance-tools.css';
type Right = { key: string; label: string; eligible: boolean; allowed: boolean };
type Rights = {
  userId: string;
  name: string;
  username: string;
  role: string;
  revision: number;
  entries: Right[];
};
const { pick } = useI18n();
const users = ref<{ id: string; full_name: string; username: string; is_active: number }[]>([]),
  userId = ref(''),
  rights = ref<Rights | null>(null),
  query = ref(''),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref('');
const visible = computed(
  () =>
    rights.value?.entries.filter((e) =>
      `${e.label} ${e.key}`.toLowerCase().includes(query.value.toLowerCase()),
    ) || [],
);
let version = 0;
async function load() {
  if (!userId.value) return;
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const value = await invoke<Rights>('read_user_rights', { userId: userId.value });
    if (current === version) rights.value = value;
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
async function save() {
  if (!rights.value || busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await invoke('save_user_rights', {
      request: {
        userId: userId.value,
        expectedRevision: rights.value.revision,
        deniedPermissions: rights.value.entries
          .filter((e) => e.eligible && !e.allowed)
          .map((e) => e.key),
      },
    });
    message.value = pick('User rights saved.', 'اختیارات محفوظ ہو گئے۔');
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
watch(userId, () => {
  rights.value = null;
  message.value = '';
  void load();
});
onMounted(async () => {
  try {
    users.value = await executeQuery(
      'SELECT id,full_name,username,is_active FROM users WHERE deleted_at IS NULL ORDER BY full_name',
    );
  } catch (e) {
    error.value = String(e);
  }
});
</script>
<template>
  <main class="tool-terminal compact-workspace money-terminal rights-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('User Rights', 'صارف کے اختیارات') }}</h1>
        <p>
          {{
            pick(
              'Enable or disable actions within a staff member’s existing role.',
              'صارف کے موجودہ کردار کے اندر اختیارات تبدیل کریں۔',
            )
          }}
        </p>
      </div>
      <button :disabled="loading || busy || !userId" @click="load">
        {{ pick('Reload rights', 'اختیارات دوبارہ لوڈ کریں') }}
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="money-toolbar">
      <label
        >{{ pick('User', 'صارف')
        }}<select v-model="userId" :disabled="busy">
          <option value="" disabled>{{ pick('Select user', 'صارف منتخب کریں') }}</option>
          <option v-for="user in users" :key="user.id" :value="user.id">
            {{ user.full_name }} · {{ user.username }}{{ user.is_active ? '' : ' · Inactive' }}
          </option>
        </select></label
      ><label
        >{{ pick('Find action', 'اختیار تلاش کریں') }}<input v-model="query" type="search" /></label
      ><strong v-if="rights">{{ rights.role }}</strong
      ><button
        class="money-save"
        :disabled="busy || loading || !rights || rights.role === 'admin'"
        @click="save"
      >
        {{ pick('Save rights', 'اختیارات محفوظ کریں') }}
      </button>
    </div>
    <small>{{
      rights?.role === 'admin'
        ? pick(
            'Administrator access is fixed so recovery remains available.',
            'منتظم کے اختیارات بحالی کے لیے محفوظ ہیں۔',
          )
        : pick(
            'Changes apply immediately. Actions may also need their related view permission.',
            'تبدیلی فوراً نافذ ہوگی۔ عمل کے لیے متعلقہ دیکھنے کا اختیار بھی ضروری ہو سکتا ہے۔',
          )
    }}</small>
    <section class="money-list">
      <CompactPages :items="visible" :row-height="40" :header-height="32" v-slot="{ rows }"
        ><table class="rights-table">
          <thead>
            <tr>
              <th>{{ pick('Action', 'اختیار') }}</th>
              <th>{{ pick('Available to role', 'کردار میں دستیاب') }}</th>
              <th>{{ pick('Allowed', 'اجازت') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item } in rows" :key="item.key">
              <td>
                {{ item.label }}
              </td>
              <td>{{ item.eligible ? pick('Yes', 'ہاں') : pick('No', 'نہیں') }}</td>
              <td>
                <input
                  v-model="item.allowed"
                  type="checkbox"
                  :data-permission="item.key"
                  :aria-label="item.label"
                  :disabled="busy || loading || !item.eligible || rights?.role === 'admin'"
                />
              </td>
            </tr>
            <tr v-if="!visible.length">
              <td colspan="3">
                {{
                  loading
                    ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                    : pick(
                        'Select a user to review their rights.',
                        'اختیارات دیکھنے کے لیے صارف منتخب کریں۔',
                      )
                }}
              </td>
            </tr>
          </tbody>
        </table></CompactPages
      >
    </section>
  </main>
</template>
<style scoped>
.rights-table th:first-child {
  width: 65%;
}
.rights-table input[type='checkbox'] {
  width: auto;
}
</style>
