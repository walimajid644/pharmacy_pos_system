<script setup lang="ts">
import { ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import DesktopNav from '@/components/DesktopNav.vue';
import HomeView from '@/views/HomeView.vue';
import { useDashboardWorkspace } from '@/composables/useDashboardWorkspace';

const {
  authStore,
  t,
  pick,
  shortcutHelpOpen,
  workspaceMode,
  workspaceDialog,
  closeWorkspace,
  onWorkspaceKeydown,
  pageTitle,
} = useDashboardWorkspace();
const bindworkspaceDialog = bindTemplateRef(workspaceDialog);
const helpDialog = ref<HTMLElement | null>(null);
useDialogKeyboard(helpDialog, () => {
  shortcutHelpOpen.value = false;
});
</script>

<template>
  <div class="dashboard-layout dashboard-overview">
    <!-- Header -->
    <header class="dashboard-header" :inert="workspaceMode">
      <div class="header-content">
        <!-- Navigation -->
        <div class="nav-row"><DesktopNav /></div>
      </div>
    </header>

    <!-- Main content -->
    <main class="dashboard-main" :inert="workspaceMode">
      <HomeView />
    </main>
    <div v-if="workspaceMode" class="workspace-overlay" @click.self="closeWorkspace">
      <section
        :ref="bindworkspaceDialog"
        class="workspace-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="pageTitle"
        @keydown="onWorkspaceKeydown"
      >
        <header class="workspace-titlebar">
          <div>
            <strong>{{ pageTitle }}</strong><small>{{
              pick('Desktop workspace', 'ڈیسک ٹاپ ورک اسپیس')
            }}</small>
          </div>
          <button
            type="button"
            class="workspace-close"
            aria-keyshortcuts="Escape"
            :title="pick('Close window (Esc)', 'ونڈو بند کریں (Esc)')"
            :aria-label="pick('Close window', 'ونڈو بند کریں')"
            @click="closeWorkspace"
          >
            ×
          </button>
        </header>
        <div class="workspace-body"><RouterView /></div>
      </section>
    </div>
    <div
      v-if="shortcutHelpOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      @click.self="shortcutHelpOpen = false"
    >
      <section
        ref="helpDialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="pick('Keyboard shortcuts', 'کی بورڈ شارٹ کٹس')"
        class="w-[30rem] rounded-lg border bg-background p-6 shadow-xl"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-bold">{{ pick('Keyboard shortcuts', 'کی بورڈ شارٹ کٹس') }}</h2>
          <button
            type="button"
            class="rounded border px-3 py-1"
            :title="pick('Close shortcut help (Esc)', 'شارٹ کٹ مدد بند کریں (Esc)')"
            aria-keyshortcuts="Escape"
            @click="shortcutHelpOpen = false"
          >
            {{ pick('Close', 'بند کریں') }}
          </button>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt>F1</dt>
          <dd>{{ pick('Show or hide this help', 'مدد دکھائیں یا چھپائیں') }}</dd>
          <template v-if="authStore.hasRole(['admin', 'manager', 'cashier'])"
            ><dt>F2</dt>
            <dd>
              {{ pick('POS product or barcode search', 'پی او ایس مصنوعات یا بار کوڈ تلاش') }}
            </dd>
            <dt>F3</dt>
            <dd>{{ pick('POS customer selection', 'پی او ایس گاہک کا انتخاب') }}</dd></template
          >
          <template v-if="authStore.hasRole(['admin', 'manager'])"
            ><dt>F4</dt>
            <dd>{{ pick('Products search', 'مصنوعات کی تلاش') }}</dd></template
          >
          <dt>Alt+D</dt>
          <dd>{{ t('dashboard') }}</dd>
          <dt>Ctrl+Shift+L</dt>
          <dd>{{ pick('Log out (asks for confirmation)', 'لاگ آؤٹ (تصدیق کے ساتھ)') }}</dd>
          <dt>Esc</dt>
          <dd>{{ pick('Close shortcut help', 'شارٹ کٹ مدد بند کریں') }}</dd>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
}
.workspace-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.56);
}
.workspace-dialog {
  display: flex;
  flex-direction: column;
  width: min(1125px, 100%);
  height: min(935px, calc(100vh - 32px));
  min-height: 350px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
}
.workspace-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 5px 10px 5px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-primary);
}
.workspace-titlebar strong,
.workspace-titlebar small {
  display: block;
}
.workspace-titlebar strong {
  font-size: 0.9rem;
}
.workspace-titlebar small {
  font-size: 0.65rem;
  color: var(--color-text-secondary);
}
.workspace-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 1.25rem;
  cursor: pointer;
}
.workspace-close:hover {
  background: var(--color-hover);
  border-color: var(--color-border);
}
.workspace-close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.workspace-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.workspace-body :deep(.pos-terminal) {
  height: 100%;
  min-height: 0;
}
.dashboard-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.header-content {
  padding: 3px 12px;
}
.nav-row {
  min-width: 0;
}
.dashboard-header :deep(.nav-button) {
  min-height: 22px;
  padding: 2px 6px;
  gap: 4px;
  border-radius: 2px;
  font:
    11px/1.2 Arial,
    Tahoma,
    sans-serif;
}
.dashboard-header :deep(.nav-menu) {
  padding: 4px;
  border-radius: 3px;
}
.dashboard-header :deep(.nav-menu-item) {
  min-height: 26px;
  padding: 4px 7px;
  gap: 6px;
  border-radius: 2px;
  font:
    11px/1.2 Arial,
    Tahoma,
    sans-serif;
}
.dashboard-header :deep(.account-summary) {
  padding: 5px 7px;
  gap: 6px;
}
.dashboard-header :deep(.account-avatar) {
  width: 26px;
  height: 26px;
}
.dashboard-header :deep(.account-summary strong) {
  font-size: 12px;
}
.dashboard-header :deep(.account-summary small) {
  font-size: 10px;
}

.dashboard-main {
  flex: 1;
  min-width: 0;
}
.dashboard-overview .dashboard-main {
  display: flex;
  flex-direction: column;
}
@media (min-width: 1000px) and (min-height: 500px) {
  .dashboard-overview {
    height: 100dvh;
    min-height: 0;
  }
  .dashboard-overview .dashboard-header {
    flex-shrink: 0;
  }
  .dashboard-overview .dashboard-main {
    min-height: 0;
  }
}
@media (max-width: 1100px) {
  .header-content {
    padding-inline: 1rem;
  }
}
</style>
