<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useTheme } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'
import Toast from '@/components/ui/Toast.vue'

const { toasts, remove } = useToast()
const { theme } = useTheme()
const { language } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const idleLimitMs = 5 * 60 * 1000
let lastActivity = Date.now()
let lastHeartbeat = 0
let idleTimer: ReturnType<typeof setInterval> | undefined
let locking = false
let removeCloseListener: (() => void) | undefined
let closingAllowed = false

async function lockSession() {
  if (locking || !auth.isAuthenticated) return
  locking = true
  try {
    void auth.logout().catch(error => {
      console.error('Could not close expired native session:', error)
    })
    await router.replace('/login')
  } finally {
    locking = false
  }
}

function recordActivity() {
  if (!auth.isAuthenticated || locking) return
  const now = Date.now()
  if (now - lastActivity >= idleLimitMs) {
    void lockSession()
    return
  }
  lastActivity = now
  if (now - lastHeartbeat < 30_000) return
  lastHeartbeat = now
  void invoke('touch_session').catch(() => void lockSession())
}

watch(() => auth.currentUser, user => {
  if (user) {
    lastActivity = Date.now()
    lastHeartbeat = 0
  }
})

// Initialize theme and language on app mount
onMounted(() => {
  console.log(`App initialized with theme: ${theme.value}, language: ${language.value}`)
  window.addEventListener('keydown', recordActivity)
  window.addEventListener('pointerdown', recordActivity)
  idleTimer = setInterval(() => {
    if (auth.isAuthenticated && Date.now() - lastActivity >= idleLimitMs) void lockSession()
  }, 1000)
  void getCurrentWindow().onCloseRequested(async event => {
    if (closingAllowed || !auth.isAuthenticated || !auth.hasRole(['admin', 'manager'])) return
    event.preventDefault()
    try {
      const status = await invoke<{ path: string; created: boolean }>('backup_status')
      const prompt = language.value === 'ur'
        ? 'آج درست بیک اپ محفوظ نہیں ہوا۔ بند کرنے سے پہلے ڈیٹابیس کا بیک اپ بنائیں؟'
        : 'No valid backup was saved today. Save a database backup before closing?'
      if (!status.created && window.confirm(prompt)) {
        try { await invoke('create_backup', { destinationDir: null }) }
        catch (error) { window.alert(`Backup failed: ${String(error)}`) }
      }
    } catch { /* An expired session must not trap the desktop window. */ }
    closingAllowed = true
    await getCurrentWindow().close()
  }).then(unlisten => { removeCloseListener = unlisten })
})
onUnmounted(() => {
  removeCloseListener?.()
  window.removeEventListener('keydown', recordActivity)
  window.removeEventListener('pointerdown', recordActivity)
  if (idleTimer) clearInterval(idleTimer)
})
</script>

<template>
  <RouterView />
  
  <!-- Toast notifications -->
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
    <Toast
      v-for="toast in toasts"
      :key="toast.id"
      :message="toast.message"
      :type="toast.type"
      :duration="toast.duration"
      @close="remove(toast.id)"
    />
  </div>
</template>
