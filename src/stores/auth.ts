import { reportDiagnostic } from '@/lib/diagnostics';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, UserRole } from '@/lib/types';
import { invoke } from '@tauri-apps/api/core';
import { usePurchaseDraftStore } from '@/stores/purchaseDraft';
import { routePermissions } from '@/lib/permissions';
import { useCartStore } from '@/stores/cart';

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null);
  const maintenance = ref(false);
  const isAuthenticated = computed(() => currentUser.value !== null);

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const user = await invoke<User | null>('login_user', { username, password });
      if (!user) return false;
      currentUser.value = user;
      maintenance.value = false;
      return true;
    } catch {
      reportDiagnostic('operation_failed', 'auth');
      return false;
    }
  }

  async function logout(reason: 'user' | 'idle' | 'window_close' = 'user') {
    // Discard local drafts immediately, even if the native bridge is delayed.
    currentUser.value = null;
    maintenance.value = false;
    useCartStore().clearCart();
    usePurchaseDraftStore().clear();
    await invoke('logout_user', { reason });
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await invoke('change_password', { currentPassword, newPassword });
    if (currentUser.value) currentUser.value.must_change_password = false;
  }

  function can(permission: string): boolean {
    if (!currentUser.value) return false;
    return currentUser.value.permissions
      ? currentUser.value.permissions.includes(permission)
      : true;
  }
  function canRoute(path: string): boolean {
    const required = routePermissions(path);
    return required.length === 0 || required.some(can);
  }
  async function refreshPermissions() {
    if (
      maintenance.value ||
      !currentUser.value?.permissions ||
      currentUser.value.must_change_password
    )
      return;
    try {
      const fresh = await invoke<{ role: UserRole; permissions: string[] }>('current_permissions');
      if (currentUser.value) {
        currentUser.value.role = fresh.role;
        currentUser.value.permissions = fresh.permissions;
      }
    } catch {
      currentUser.value = null;
      useCartStore().clearCart();
      usePurchaseDraftStore().clear();
    }
  }
  function hasRole(roles: UserRole[]): boolean {
    if (!currentUser.value) return false;
    return roles.includes(currentUser.value.role);
  }

  return {
    currentUser,
    maintenance,
    isAuthenticated,
    login,
    logout,
    changePassword,
    hasRole,
    can,
    canRoute,
    refreshPermissions,
  };
});
