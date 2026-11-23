<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
import { localDateKey } from '@/lib/businessDay';
import { useSettingsStore } from '@/stores/settings';
import Button from '@/components/ui/Button.vue';

type BackupResult = { path: string; created: boolean };
const { pick } = useI18n();
const router = useRouter();
const settings = useSettingsStore();
const defaultPath = ref('');
const destination = ref('');
const savedPath = ref('');
const backupDate = ref(localDateKey());
const dailyVerified = ref<boolean | null>(null);
const checking = ref(true);
const busy = ref(false);
const error = ref('');
const backupName = computed(() => `pharmacy-${backupDate.value}-[unique ID].db`);
const effectiveDestination = computed(() => destination.value.trim() || defaultPath.value);
onMounted(async () => {
  try {
    const status = await invoke<BackupResult>('backup_status');
    defaultPath.value = status.path;
    dailyVerified.value = status.created;
  } catch (e) {
    error.value = String(e);
  } finally {
    checking.value = false;
  }
});
async function save() {
  if (busy.value || checking.value) return;
  busy.value = true;
  error.value = '';
  savedPath.value = '';
  backupDate.value = localDateKey();
  try {
    savedPath.value = (
      await invoke<BackupResult>('create_backup', {
        destinationDir: destination.value.trim() || null,
      })
    ).path;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="tool-terminal compact-workspace backup-page">
    <section class="backup-card" :aria-label="pick('Database backup', 'ڈیٹابیس بیک اپ')">
      <header class="backup-brandbar">
        <div class="backup-brand">
          <span aria-hidden="true">✚</span>
          <div>
            <strong>{{ settings.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{
              pick('Data protection', 'ڈیٹا کا تحفظ')
            }}</small>
          </div>
        </div>
        <h2>{{ pick('Database Backup', 'ڈیٹابیس بیک اپ') }}</h2>
      </header>
      <form class="backup-form" @submit.prevent="save">
        <fieldset class="backup-fields" :disabled="busy || checking">
          <label class="backup-field backup-date"
            ><span>{{ pick('Backup Date', 'بیک اپ کی تاریخ') }}</span
            ><input :value="backupDate" type="date" readonly aria-label="Backup date"
          /></label>
          <label class="backup-field"
            ><span>{{ pick('Backup Name', 'بیک اپ کا نام') }}</span
            ><input :value="backupName" readonly aria-label="Backup name"
          /></label>
          <p class="backup-field-hint">
            {{
              pick(
                'A unique filename is assigned when the backup is saved.',
                'بیک اپ محفوظ ہونے پر منفرد فائل نام دیا جاتا ہے۔',
              )
            }}
          </p>
          <div class="backup-field backup-folder">
            <label for="backup-destination">{{
              pick('Select Folder', 'فولڈر منتخب کریں')
            }}</label><input
              id="backup-destination"
              v-model="destination"
              type="text"
              :placeholder="
                defaultPath ||
                pick('Optional existing folder or USB path', 'موجودہ فولڈر یا USB کا پاتھ')
              "
              aria-label="Backup destination folder"
            /><Button
              type="button"
              variant="outline"
              :disabled="busy || checking || !destination"
              @click="destination = ''"
              >{{ pick('Use default', 'ڈیفالٹ') }}</Button
            >
          </div>
          <p class="backup-field-hint">
            {{
              pick(
                'Enter an existing folder or USB path, or leave blank for the automatic folder.',
                'موجودہ فولڈر یا USB کا پاتھ درج کریں، یا خودکار فولڈر کے لیے خالی چھوڑیں۔',
              )
            }}
          </p>
          <div class="backup-field backup-path">
            <span>{{ pick('Destination', 'منزل') }}</span><output
              aria-label="Effective backup destination"
              >{{
                effectiveDestination ||
                (checking
                  ? pick('Checking…', 'جانچ جاری ہے…')
                  : pick('Automatic backup folder', 'خودکار بیک اپ فولڈر'))
              }}</output
            >
          </div>
          <div class="backup-daily-status">
            <span aria-hidden="true">◷</span>
            <div>
              <strong>{{ pick('Daily automatic backups', 'روزانہ خودکار بیک اپ') }}</strong>
              <p>
                {{
                  pick(
                    'Consistent SQLite snapshots, checked for integrity. Seven days of daily backups are retained.',
                    'SQLite بیک اپ کی سالمیت جانچی جاتی ہے۔ سات دن کے روزانہ بیک اپ محفوظ رکھے جاتے ہیں۔',
                  )
                }}
              </p>
              <small>{{
                checking
                  ? pick(
                      'Checking today’s automatic backup…',
                      'آج کے خودکار بیک اپ کی جانچ جاری ہے…',
                    )
                  : dailyVerified === true
                    ? pick(
                        'Today’s automatic backup is verified.',
                        'آج کا خودکار بیک اپ تصدیق شدہ ہے۔',
                      )
                    : dailyVerified === false
                      ? pick(
                          'Today’s automatic backup is not yet available.',
                          'آج کا خودکار بیک اپ ابھی دستیاب نہیں ہے۔',
                        )
                      : pick(
                          'Automatic backup status could not be checked.',
                          'خودکار بیک اپ کی جانچ نہیں ہو سکی۔',
                        )
              }}</small>
            </div>
          </div>
        </fieldset>
        <div class="backup-feedback" aria-live="polite" :aria-busy="busy">
          <div v-if="busy" class="backup-progress" role="status">
            <span>{{
              pick('Creating and checking your backup…', 'بیک اپ بنایا اور جانچا جا رہا ہے…')
            }}</span><progress :aria-label="pick('Backup progress', 'بیک اپ کی پیش رفت')" />
          </div>
          <p v-if="error" role="alert" class="backup-error">{{ error }}</p>
          <div v-if="savedPath" class="backup-saved" role="status">
            <strong>{{
              pick('Backup saved and verified', 'بیک اپ محفوظ اور تصدیق شدہ')
            }}</strong><code>{{ savedPath }}</code>
          </div>
        </div>
        <footer class="backup-actions">
          <span class="backup-retention-note">{{
            pick(
              'Keep another copy on a USB or another computer.',
              'ایک کاپی USB یا دوسرے کمپیوٹر پر رکھیں۔',
            )
          }}</span>
          <Button type="button" variant="outline" :disabled="busy" @click="router.push('/')">{{
            pick('Exit', 'بند کریں')
          }}</Button>
          <Button type="submit" permission="backup.export" :disabled="busy || checking">{{
            busy
              ? pick('Saving…', 'محفوظ ہو رہا ہے…')
              : pick('Save backup now', 'ابھی بیک اپ محفوظ کریں')
          }}</Button>
        </footer>
      </form>
    </section>
    <p class="backup-restore-note">
      {{
        pick(
          'Administrators can inspect and restore a backup through Admin → Restore Data.',
          'منتظم Admin → Restore Data سے بیک اپ کی جانچ اور بحالی کر سکتا ہے۔',
        )
      }}
    </p>
  </main>
</template>

<style scoped>
.backup-page {
  width: 100%;
  min-height: 0;
  color: var(--text-primary);
}
.backup-card {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  min-height: 0;
  margin: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  overflow: auto;
}
.backup-brandbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.backup-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.backup-brand > span {
  color: var(--color-primary);
  font-size: 32px;
}
.backup-brand strong {
  display: block;
  font-size: 20px;
}
.backup-brand small {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
}
.backup-brandbar h2 {
  color: var(--color-primary);
  font-size: 18px;
}
.backup-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.backup-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
  min-width: 0;
  margin: 0;
  padding: 20px;
  border: 0;
}
.backup-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.backup-field > span,
.backup-folder > label {
  flex: 0 0 110px;
  font-weight: 600;
  text-align: right;
}
.backup-field input {
  width: 100%;
  flex: 1;
  min-width: 0;
}
.backup-date {
  justify-content: flex-end;
  margin-bottom: 8px;
}
.backup-date input {
  flex: 0 1 180px;
}
.backup-field input:read-only {
  background: var(--surface-page);
  color: var(--text-secondary);
}
.backup-field-hint {
  margin: -3px 0 0 118px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}
.backup-folder :deep(button) {
  flex-shrink: 0;
  white-space: normal;
  height: auto;
  min-height: 27px;
}
.backup-path {
  align-items: start;
}
.backup-path output {
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  min-height: 27px;
  background: var(--surface-page);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow-wrap: anywhere;
}
.backup-daily-status {
  display: flex;
  gap: 10px;
  margin: 7px 0 0 118px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-page);
}
.backup-daily-status > span {
  color: var(--color-primary);
  font-size: 22px;
}
.backup-daily-status strong {
  font-size: 12px;
}
.backup-daily-status p,
.backup-daily-status small {
  display: block;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}
.backup-feedback {
  padding: 0 20px;
  overflow-wrap: anywhere;
}
.backup-feedback:has(> *) {
  padding-bottom: 12px;
}
.backup-error {
  color: var(--color-danger);
  font-size: 12px;
}
.backup-saved {
  display: grid;
  gap: 5px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-page);
  font-size: 12px;
}
.backup-saved strong {
  color: var(--color-primary);
}
.backup-saved code {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.backup-progress {
  display: grid;
  gap: 7px;
  font-size: 12px;
}
.backup-progress progress {
  width: 100%;
  height: 7px;
  accent-color: var(--color-primary);
}
.backup-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-page);
}
.backup-retention-note {
  flex: 1;
  max-width: 310px;
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 10px;
}
.backup-actions :deep(button) {
  height: auto;
  min-height: 32px;
  padding: 5px 10px;
  font-size: 12px;
  flex-shrink: 0;
}
.backup-restore-note {
  width: min(760px, 100%);
  margin: 8px auto;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}
@media (max-width: 650px) {
  .backup-brandbar {
    flex-wrap: wrap;
  }
  .backup-fields {
    padding: 12px;
  }
  .backup-field > span,
  .backup-folder > label {
    flex-basis: 85px;
  }
  .backup-field-hint {
    margin-left: 93px;
  }
  .backup-daily-status {
    margin-left: 0;
  }
  .backup-actions {
    flex-wrap: wrap;
  }
  .backup-retention-note {
    flex-basis: 100%;
    max-width: none;
  }
}
@media (max-height: 650px) {
  .backup-brandbar {
    padding: 7px 14px;
  }
  .backup-fields {
    padding: 12px 16px;
    gap: 7px;
  }
  .backup-daily-status {
    padding: 7px;
    margin-top: 3px;
  }
  .backup-actions {
    padding: 7px 12px;
  }
}
</style>
