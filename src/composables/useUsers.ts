import { reportDiagnostic } from '@/lib/diagnostics';
import { errorMessage } from '@/lib/errors';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { ref, onMounted, computed } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { generateUUID } from '@/lib/utils';
import { hashPassword } from '@/lib/password';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import type { User, UserRole } from '@/lib/types';

export function useUsers() {
  const label = useWorkspaceLabels();

  const toast = useToast();

  const authStore = useAuthStore();

  const users = ref<User[]>([]);

  const searchQuery = ref('');

  const loading = ref(false);

  const showModal = ref(false);

  const editingUser = ref<User | null>(null);

  // Form state
  const formData = ref({
    username: '',
    password: '',
    full_name: '',
    role: 'cashier' as UserRole,
    is_active: true,
  });

  const filteredUsers = computed(() => {
    if (!searchQuery.value) return users.value;

    const query = searchQuery.value.toLowerCase();
    return users.value.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.full_name.toLowerCase().includes(query) ||
        u.role.toLowerCase().includes(query),
    );
  });

  onMounted(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    loading.value = true;
    try {
      users.value = await executeQuery<User>(
        'SELECT id, username, full_name, role, is_active, last_login, created_at, updated_at, deleted_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC',
      );
    } catch {
      reportDiagnostic('operation_failed', 'auth');
      toast.error('Failed to load users');
    } finally {
      loading.value = false;
    }
  }

  function openAddModal() {
    editingUser.value = null;
    formData.value = {
      username: '',
      password: '',
      full_name: '',
      role: 'cashier',
      is_active: true,
    };
    showModal.value = true;
  }

  function openEditModal(user: User) {
    editingUser.value = user;
    formData.value = {
      username: user.username,
      password: '', // Don't pre-fill password
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    };
    showModal.value = true;
  }

  async function saveUser() {
    if (!formData.value.username || !formData.value.full_name) {
      toast.warning('Username and full name are required');
      return;
    }

    if (!editingUser.value && !formData.value.password) {
      toast.warning('Password is required for new users');
      return;
    }
    if (
      formData.value.password &&
      (formData.value.password.length < 12 ||
        new TextEncoder().encode(formData.value.password).length > 72)
    ) {
      toast.warning('Passwords must be at least 12 characters and at most 72 bytes');
      return;
    }
    if (formData.value.password === 'admin123') {
      toast.warning('Choose a password other than the default administrator password');
      return;
    }

    // Prevent editing yourself
    if (editingUser.value && editingUser.value.id === authStore.currentUser?.id) {
      if (formData.value.role !== editingUser.value.role) {
        toast.error('You cannot change your own role');
        return;
      }
      if (!formData.value.is_active) {
        toast.error('You cannot deactivate yourself');
        return;
      }
    }

    loading.value = true;
    try {
      const now = new Date().toISOString();

      if (editingUser.value) {
        // Update existing user
        if (formData.value.password) {
          // If password provided, update it
          const hashedPassword = await hashPassword(formData.value.password);
          await executeUpdate(
            `UPDATE users SET 
              username = ?, password_hash = ?, full_name = ?, role = ?, is_active = ?, updated_at = ?
             WHERE id = ?`,
            [
              formData.value.username,
              hashedPassword,
              formData.value.full_name,
              formData.value.role,
              formData.value.is_active ? 1 : 0,
              now,
              editingUser.value.id,
            ],
          );
        } else {
          // Don't update password
          await executeUpdate(
            `UPDATE users SET 
              username = ?, full_name = ?, role = ?, is_active = ?, updated_at = ?
             WHERE id = ?`,
            [
              formData.value.username,
              formData.value.full_name,
              formData.value.role,
              formData.value.is_active ? 1 : 0,
              now,
              editingUser.value.id,
            ],
          );
        }
        toast.success('User updated successfully');
      } else {
        // Create new user
        const id = generateUUID();
        const hashedPassword = await hashPassword(formData.value.password);

        await executeUpdate(
          `INSERT INTO users (
            id, username, password_hash, full_name, role, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            formData.value.username,
            hashedPassword,
            formData.value.full_name,
            formData.value.role,
            formData.value.is_active ? 1 : 0,
            now,
            now,
          ],
        );
        toast.success('User created successfully');
      }

      showModal.value = false;
      await loadUsers();
    } catch (error: unknown) {
      reportDiagnostic('operation_failed', 'auth');
      if (errorMessage(error).includes('UNIQUE constraint')) {
        toast.error('Username already exists');
      } else {
        toast.error('Failed to save user: ' + errorMessage(error));
      }
    } finally {
      loading.value = false;
    }
  }

  async function deleteUser(user: User) {
    // Prevent deleting yourself
    if (user.id === authStore.currentUser?.id) {
      toast.error('You cannot delete yourself');
      return;
    }

    loading.value = true;
    try {
      await executeUpdate('UPDATE users SET deleted_at = ? WHERE id = ?', [
        new Date().toISOString(),
        user.id,
      ]);
      toast.success('User deleted successfully');
      await loadUsers();
    } catch {
      reportDiagnostic('operation_failed', 'auth');
      toast.error('Failed to delete user');
    } finally {
      loading.value = false;
    }
  }

  function getRoleBadgeClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      admin: 'bg-primary-50 text-primary-800',
      manager: 'bg-info-bg text-info-text',
      cashier: 'bg-success-bg text-success-text',
      accountant: 'bg-warning-bg text-warning-text',
    };
    return classes[role];
  }

  function getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      admin: 'Administrator',
      manager: 'Manager',
      cashier: 'Cashier',
      accountant: 'Accountant',
    };
    return labels[role];
  }

  return {
    label,
    authStore,
    users,
    searchQuery,
    loading,
    showModal,
    editingUser,
    formData,
    filteredUsers,
    openAddModal,
    openEditModal,
    saveUser,
    deleteUser,
    getRoleBadgeClass,
    getRoleLabel,
  };
}
