<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'

const router = useRouter()
const auth = useAuthStore()
const { pick } = useI18n()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  if (newPassword.value !== confirmPassword.value) {
    error.value = pick('New passwords do not match.', 'نئے پاس ورڈ ایک جیسے نہیں ہیں۔')
    return
  }
  if (newPassword.value.length < 12) {
    error.value = pick('Use at least 12 characters for the new password.', 'نئے پاس ورڈ میں کم از کم ۱۲ حروف استعمال کریں۔')
    return
  }
  busy.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    await router.replace('/')
  } catch (cause) {
    error.value = String(cause)
  } finally {
    busy.value = false
  }
}

async function signOut() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background p-6">
    <form class="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm" @submit.prevent="save">
      <header class="space-y-2">
        <h1 class="text-2xl font-bold">{{ pick('Change your password', 'اپنا پاس ورڈ تبدیل کریں') }}</h1>
        <p class="text-sm text-muted-foreground" v-if="auth.currentUser?.must_change_password">
          {{ pick('Change the default administrator password before using Pharmacy POS.', 'فارمیسی POS استعمال کرنے سے پہلے ایڈمن کا ڈیفالٹ پاس ورڈ تبدیل کریں۔') }}
        </p>
        <p class="text-sm text-muted-foreground" v-else>{{ pick('Choose a password with at least 12 characters.', 'کم از کم ۱۲ حروف کا پاس ورڈ منتخب کریں۔') }}</p>
      </header>
      <label class="block space-y-1">{{ pick('Current password', 'موجودہ پاس ورڈ') }}
        <input v-model="currentPassword" type="password" autocomplete="current-password" required class="w-full rounded border bg-background p-2" />
      </label>
      <label class="block space-y-1">{{ pick('New password', 'نیا پاس ورڈ') }}
        <input v-model="newPassword" type="password" autocomplete="new-password" :minlength="12" required class="w-full rounded border bg-background p-2" />
      </label>
      <label class="block space-y-1">{{ pick('Confirm new password', 'نئے پاس ورڈ کی تصدیق کریں') }}
        <input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" required class="w-full rounded border bg-background p-2" />
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <div class="flex gap-3">
        <button :disabled="busy" type="submit" class="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
          {{ busy ? pick('Saving...', 'محفوظ ہو رہا ہے...') : pick('Save password', 'پاس ورڈ محفوظ کریں') }}
        </button>
        <button :disabled="busy" type="button" class="rounded border px-4 py-2" @click="signOut">{{ pick('Sign out', 'لاگ آؤٹ') }}</button>
      </div>
    </form>
  </main>
</template>
