import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, UserRole } from '@/lib/types'
import { invoke } from '@tauri-apps/api/core'
import { usePurchaseDraftStore } from '@/stores/purchaseDraft'
import { useCartStore } from '@/stores/cart'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)
  const isAuthenticated = computed(() => currentUser.value !== null)

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const user = await invoke<User | null>('login_user', { username, password })
      if (!user) return false
      currentUser.value = user
      return true
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  async function logout() {
    // Discard local drafts immediately, even if the native bridge is delayed.
    currentUser.value = null
    useCartStore().clearCart()
    usePurchaseDraftStore().clear()
    await invoke('logout_user')
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await invoke('change_password', { currentPassword, newPassword })
    if (currentUser.value) currentUser.value.must_change_password = false
  }

  function hasRole(roles: UserRole[]): boolean {
    if (!currentUser.value) return false
    return roles.includes(currentUser.value.role)
  }

  return {
    currentUser,
    isAuthenticated,
    login,
    logout,
    changePassword,
    hasRole,
  }
})
