<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import { loginSchema } from '@/lib/schemas'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Card from '@/components/ui/Card.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import LanguageToggle from '@/components/ui/LanguageToggle.vue'
import BilingualText from '@/components/ui/BilingualText.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t, pick } = useI18n()
const loading = ref(false)
const errorMessage = ref('')
const rememberMe = ref(false)

const username = ref('')
const password = ref('')
const errors = reactive({ username: '', password: '' })

async function onSubmit() {
  const result = loginSchema.safeParse({ username: username.value, password: password.value })
  errors.username = ''
  errors.password = ''
  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'username') errors.username = pick('Username must be at least 3 characters', 'صارف نام کم از کم 3 حروف کا ہونا چاہیے')
      if (issue.path[0] === 'password') errors.password = pick('Password must be at least 6 characters', 'پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے')
    }
    return
  }
  loading.value = true
  errorMessage.value = ''

  try {
    const success = await authStore.login(result.data.username, result.data.password)
    
    if (success) {
      router.push(authStore.currentUser?.must_change_password ? '/change-password' : '/')
    } else {
      errorMessage.value = pick('Invalid username or password', 'صارف نام یا پاس ورڈ غلط ہے')
    }
  } catch (error) {
    errorMessage.value = pick('An error occurred during login. Please try again.', 'لاگ ان کے دوران خرابی ہوئی۔ دوبارہ کوشش کریں۔')
    console.error('Login error:', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-container">
    <div class="login-background" aria-hidden="true"></div>
    <div class="login-controls"><LanguageToggle /><ThemeToggle /></div>

    <Card class="login-card">
      <section class="login-brand" :aria-label="pick('Pharmacy POS', 'فارمیسی پی او ایس')">
        <div class="login-logo" aria-hidden="true">✚</div>
        <p class="brand-eyebrow">{{ pick('Pharmacy management', 'فارمیسی مینجمنٹ') }}</p>
        <h1 class="login-title">Pharmacy POS</h1>
        <p class="login-title-ur font-urdu">فارمیسی پی او ایس</p>
        <p class="brand-description">{{ pick('A clear workspace for every shift.', 'ہر شفٹ کے لیے آسان کام کی جگہ۔') }}</p>
      </section>

      <section class="login-form-panel">
        <div class="form-heading"><h2><BilingualText textKey="login" /></h2><p>{{ pick('Sign in to continue to the desktop workspace.', 'ڈیسک ٹاپ پر کام جاری رکھنے کے لیے لاگ ان کریں۔') }}</p></div>
        <form class="login-form" @submit.prevent="onSubmit">
          <div class="form-field"><label for="username" class="form-label"><BilingualText textKey="username" /></label><Input id="username" v-model="username" :placeholder="t('username')" :error="errors.username" :disabled="loading" autocomplete="username" class="form-input" /></div>
          <div class="form-field"><label for="password" class="form-label"><BilingualText textKey="password" /></label><Input id="password" v-model="password" type="password" :placeholder="t('password')" :error="errors.password" :disabled="loading" autocomplete="current-password" class="form-input" /></div>
          <label class="remember-label"><input v-model="rememberMe" type="checkbox" class="remember-checkbox" /><span><BilingualText textKey="remember_me" /></span></label>
          <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
          <Button type="submit" :disabled="loading" class="login-button" size="lg">{{ loading ? pick('Signing in…', 'لاگ ان ہو رہا ہے…') : pick('Sign in', 'لاگ ان کریں') }}</Button>
        </form>
        <p class="login-footer">{{ pick('For authorized pharmacy staff', 'صرف مجاز فارمیسی عملے کے لیے') }}</p>
      </section>
    </Card>
  </main>
</template>

<style scoped>
.login-container{position:relative;display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:64px 28px 28px;overflow:auto;background:var(--color-background);color:var(--color-text-primary)}
.login-background{position:absolute;inset:0;background:linear-gradient(115deg,#e3f4f1 0%,#f7faf9 50%,#e7f0f5 100%);pointer-events:none}
[data-theme='dark'] .login-background{background:linear-gradient(115deg,#0f172a 0%,#172637 52%,#0f262b 100%)}
.login-controls{position:absolute;z-index:2;top:16px;inset-inline-end:24px;display:flex;gap:10px}
.login-card{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr);width:min(890px,100%);min-height:410px;overflow:hidden;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);box-shadow:0 24px 60px rgba(15,23,42,.13)}
.login-brand{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:36px 42px;background:linear-gradient(150deg,#0f766e,#0d9488);color:#fff}.login-logo{display:grid;place-items:center;width:54px;height:54px;margin-bottom:24px;border:1px solid rgba(255,255,255,.56);border-radius:12px;background:rgba(255,255,255,.12);font-size:30px;font-weight:700}.brand-eyebrow{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}.login-title{margin:0;font-size:clamp(25px,2.5vw,34px);font-weight:800;line-height:1.15}.login-title-ur{margin:9px 0 0;font-size:22px;line-height:1.8}.brand-description{max-width:260px;margin:26px 0 0;font-size:14px;line-height:1.5;opacity:.88}
.login-form-panel{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:32px 44px}.form-heading{margin-bottom:20px}.form-heading h2{margin:0;font-size:23px;font-weight:750;line-height:1.2}.form-heading p{margin:7px 0 0;color:var(--color-text-secondary);font-size:13px}.login-form{display:flex;flex-direction:column;gap:14px}.form-field{display:flex;flex-direction:column;gap:6px}.form-label{font-size:13px;font-weight:700}.form-input{width:100%}.remember-label{display:flex;align-items:center;gap:9px;width:max-content;max-width:100%;color:var(--color-text-secondary);font-size:13px;cursor:pointer}.remember-checkbox{width:15px;height:15px;accent-color:#0d9488}.error-banner{padding:9px 11px;border:1px solid var(--color-danger);border-radius:7px;background:rgba(220,38,38,.08);color:var(--color-danger);font-size:12px}.login-button{width:100%;min-height:42px;background:#0f766e;color:#fff;font-weight:700}.login-button:hover:not(:disabled){background:#115e59}.login-footer{margin:15px 0 0;color:var(--color-text-secondary);font-size:11px;text-align:center}
.login-container :deep(input:focus-visible),.login-container :deep(button:focus-visible){outline:2px solid #0d9488;outline-offset:2px}
@media(max-height:680px){.login-container{padding-top:44px;padding-bottom:14px}.login-controls{top:8px}.login-card{min-height:0}.login-brand{padding:25px 36px}.login-logo{margin-bottom:12px}.brand-description{margin-top:14px}.login-form-panel{padding:22px 36px}.form-heading{margin-bottom:13px}.login-form{gap:10px}.login-footer{margin-top:9px}}
@media(max-width:760px){.login-container{padding:62px 16px 18px}.login-card{grid-template-columns:1fr;width:min(510px,100%)}.login-brand{padding:18px 25px}.login-logo,.brand-description{display:none}.login-title{font-size:22px}.login-title-ur{font-size:17px;margin-top:0}.login-form-panel{padding:22px 25px}}
</style>
