// Test-only entry. No mocked commands or production authentication bypass.
// The driver authenticates a synthetic account through the real native API.
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import router from '../../src/router';
import App from '../../src/App.vue';
import { useAuthStore } from '../../src/stores/auth';
import { useCartStore } from '../../src/stores/cart';
import { useI18n } from '../../src/lib/i18n';
import { useTheme } from '../../src/lib/theme';
import '../../src/assets/styles/index.css';
import { installErrorHandling, observeDiagnostics } from '../../src/lib/diagnostics';
import { appDataDir } from '@tauri-apps/api/path';

const diagnostics: Array<{ event: string; source: string }> = [];
observeDiagnostics((notice) => diagnostics.push(notice));

const app = createApp(App);
app.use(createPinia());
app.use(router);
await router.isReady();
installErrorHandling(app);
app.mount('#app');
Object.assign(window, {
  nativeAcceptance: {
    isolationId: 'com.pharmacypos.codex.acceptance20261108b',
    invoke,
    router,
    auth: useAuthStore(),
    cart: useCartStore(),
    i18n: useI18n(),
    theme: useTheme(),
    diagnostics,
    appDataDir,
  },
});
