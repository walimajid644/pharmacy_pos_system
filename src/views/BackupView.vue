<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '@/lib/i18n'
type BackupResult = { path: string; created: boolean }
const { pick } = useI18n()
const defaultPath = ref('')
const destination = ref('')
const savedPath = ref('')
const busy = ref(false)
const error = ref('')
onMounted(async () => {
  try { defaultPath.value = (await invoke<BackupResult>('backup_status')).path }
  catch (e) { error.value = String(e) }
})
async function save() {
  busy.value = true; error.value = ''; savedPath.value = ''
  try { savedPath.value = (await invoke<BackupResult>('create_backup', { destinationDir: destination.value.trim() || null })).path }
  catch (e) { error.value = String(e) }
  finally { busy.value = false }
}
</script>
<template>
  <main class="tool-terminal backup-page"><header class="tool-header"><h2>{{ pick('Database backups', 'ڈیٹابیس بیک اپ') }}</h2></header>
    <p>{{ pick('The app saves a consistent SQLite backup automatically each day and retains the last seven daily backups.', 'ایپ روزانہ ایک درست SQLite بیک اپ محفوظ کرتی ہے اور سات دن کے بیک اپ رکھتی ہے۔') }}</p>
    <p><strong>{{ pick('Automatic backup folder', 'خودکار بیک اپ فولڈر') }}:</strong> <code>{{ defaultPath || '…' }}</code></p>
    <form @submit.prevent="save"><label>{{ pick('Optional existing folder or USB path', 'اختیاری موجودہ فولڈر یا USB کا پاتھ') }}<input v-model="destination" type="text" :placeholder="pick('Leave blank for automatic backup folder', 'خودکار فولڈر کے لیے خالی چھوڑیں')" /></label><button type="submit" :disabled="busy">{{ busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save backup now', 'ابھی بیک اپ محفوظ کریں') }}</button></form>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="savedPath" role="status">{{ pick('Backup saved:', 'بیک اپ محفوظ ہوا:') }} <code>{{ savedPath }}</code></p>
    <p>{{ pick('For recovery, close Pharmacy POS before replacing the database. Keep another copy of backups away from this computer.', 'بحالی کے لیے ڈیٹابیس بدلنے سے پہلے Pharmacy POS بند کریں۔ بیک اپ کی ایک کاپی دوسرے کمپیوٹر یا USB پر رکھیں۔') }}</p>
  </main>
</template>
<style scoped>.backup-page{max-width:900px;margin:auto;padding:2rem;color:var(--color-text-primary)}form{display:flex;align-items:end;gap:1rem;margin:2rem 0}label{display:grid;gap:.5rem;flex:1}input,button{padding:.7rem;background:var(--color-surface);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:var(--radius)}button{background:var(--color-primary);color:white;cursor:pointer}code{overflow-wrap:anywhere}.error{color:var(--color-danger)}</style>
