<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels'
const label=useWorkspaceLabels()
import { ref, onMounted, computed } from 'vue'
import { executeQuery, executeUpdate } from '@/lib/database'
import { generateUUID } from '@/lib/utils'
import { hashPassword } from '@/lib/password'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import type { User, UserRole } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

const toast = useToast()
const authStore = useAuthStore()
const users = ref<User[]>([])
const searchQuery = ref('')
const loading = ref(false)
const showModal = ref(false)
const editingUser = ref<User | null>(null)

// Form state
const formData = ref({
  username: '',
  password: '',
  full_name: '',
  role: 'cashier' as UserRole,
  is_active: true,
})

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  
  const query = searchQuery.value.toLowerCase()
  return users.value.filter(u => 
    u.username.toLowerCase().includes(query) ||
    u.full_name.toLowerCase().includes(query) ||
    u.role.toLowerCase().includes(query)
  )
})

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  try {
    users.value = await executeQuery<User>(
      'SELECT id, username, full_name, role, is_active, last_login, created_at, updated_at, deleted_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
    )
  } catch (error) {
    console.error('Error loading users:', error)
    toast.error('Failed to load users')
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  editingUser.value = null
  formData.value = {
    username: '',
    password: '',
    full_name: '',
    role: 'cashier',
    is_active: true,
  }
  showModal.value = true
}

function openEditModal(user: User) {
  editingUser.value = user
  formData.value = {
    username: user.username,
    password: '', // Don't pre-fill password
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
  }
  showModal.value = true
}

async function saveUser() {
  if (!formData.value.username || !formData.value.full_name) {
    toast.warning('Username and full name are required')
    return
  }

  if (!editingUser.value && !formData.value.password) {
    toast.warning('Password is required for new users')
    return
  }
  if (formData.value.password && (formData.value.password.length < 12 || new TextEncoder().encode(formData.value.password).length > 72)) {
    toast.warning('Passwords must be at least 12 characters and at most 72 bytes')
    return
  }
  if (formData.value.password === 'admin123') {
    toast.warning('Choose a password other than the default administrator password')
    return
  }

  // Prevent editing yourself
  if (editingUser.value && editingUser.value.id === authStore.currentUser?.id) {
    if (formData.value.role !== editingUser.value.role) {
      toast.error('You cannot change your own role')
      return
    }
    if (!formData.value.is_active) {
      toast.error('You cannot deactivate yourself')
      return
    }
  }

  loading.value = true
  try {
    const now = new Date().toISOString()
    
    if (editingUser.value) {
      // Update existing user
      if (formData.value.password) {
        // If password provided, update it
        const hashedPassword = await hashPassword(formData.value.password)
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
            editingUser.value.id
          ]
        )
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
            editingUser.value.id
          ]
        )
      }
      toast.success('User updated successfully')
    } else {
      // Create new user
      const id = generateUUID()
      const hashedPassword = await hashPassword(formData.value.password)
      
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
          now
        ]
      )
      toast.success('User created successfully')
    }
    
    showModal.value = false
    await loadUsers()
  } catch (error: any) {
    console.error('Error saving user:', error)
    if (error.message?.includes('UNIQUE constraint')) {
      toast.error('Username already exists')
    } else {
      toast.error('Failed to save user: ' + error.message)
    }
  } finally {
    loading.value = false
  }
}

async function deleteUser(user: User) {
  // Prevent deleting yourself
  if (user.id === authStore.currentUser?.id) {
    toast.error('You cannot delete yourself')
    return
  }

  loading.value = true
  try {
    await executeUpdate(
      'UPDATE users SET deleted_at = ? WHERE id = ?',
      [new Date().toISOString(), user.id]
    )
    toast.success('User deleted successfully')
    await loadUsers()
  } catch (error) {
    console.error('Error deleting user:', error)
    toast.error('Failed to delete user')
  } finally {
    loading.value = false
  }
}

function getRoleBadgeClass(role: UserRole): string {
  const classes: Record<UserRole, string> = {
    admin: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    cashier: 'bg-green-100 text-green-800',
    accountant: 'bg-yellow-100 text-yellow-800',
  }
  return classes[role]
}

function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    cashier: 'Cashier',
    accountant: 'Accountant',
  }
  return labels[role]
}
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ label('User Management') }}</h1>
          <p class="text-sm text-gray-600 mt-1">Manage staff accounts and permissions</p>
        </div>
        <Button @click="openAddModal">{{ label('Add User') }}</Button>
      </div>

      <!-- Search -->
      <div class="tool-toolbar p-6 border-b">
        <Input
          v-model="searchQuery"
          placeholder="Search by name, username, or role..."
          class="max-w-md"
        />
      </div>

      <!-- Table -->
      <div class="tool-table-scroll flex-1 overflow-auto p-6">
        <div v-if="loading && users.length === 0" class="text-center py-12 text-gray-500">
          Loading users...
        </div>

        <div v-else-if="filteredUsers.length === 0" class="text-center py-12 text-gray-500">
          {{ searchQuery ? 'No users found' : 'No users yet. Add your first user!' }}
        </div>

        <table v-else class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-left p-3 font-semibold">{{ label('Username') }}</th>
              <th class="text-left p-3 font-semibold">{{ label('Full Name') }}</th>
              <th class="text-left p-3 font-semibold">{{ label('Role') }}</th>
              <th class="text-left p-3 font-semibold">{{ label('Last Login') }}</th>
              <th class="text-center p-3 font-semibold">{{ label('Status') }}</th>
              <th class="text-center p-3 font-semibold">{{ label('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="border-b hover:bg-gray-50"
              :class="{ 'bg-blue-50': user.id === authStore.currentUser?.id }"
            >
              <td class="p-3 font-mono text-sm">
                {{ user.username }}
                <span v-if="user.id === authStore.currentUser?.id" class="ml-2 text-xs text-blue-600 font-semibold">
                  (You)
                </span>
              </td>
              <td class="p-3">{{ user.full_name }}</td>
              <td class="p-3">
                <span
                  :class="[
                    'inline-block px-2 py-1 text-xs rounded',
                    getRoleBadgeClass(user.role)
                  ]"
                >
                  {{ getRoleLabel(user.role) }}
                </span>
              </td>
              <td class="p-3 text-sm text-gray-600">
                {{ user.last_login ? new Date(user.last_login).toLocaleString() : 'Never' }}
              </td>
              <td class="p-3 text-center">
                <span
                  :class="[
                    'inline-block px-2 py-1 text-xs rounded',
                    user.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  ]"
                >
                  {{ user.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="p-3 text-center whitespace-nowrap">
                <Button variant="outline" size="sm" @click="openEditModal(user)" class="mr-2">{{ label('Edit') }}</Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  @click="deleteUser(user)"
                  :disabled="user.id === authStore.currentUser?.id"
                >
                  Delete
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    <footer class="tool-summary"><div><small>{{ label('Users shown') }}</small><strong>{{ filteredUsers.length }}</strong></div></footer>
    </Card>

    <!-- Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="showModal = false"
    >
      <Card class="w-full max-w-lg">
        <div class="p-6 border-b">
          <h2 class="text-xl font-bold">
            {{ editingUser ? 'Edit User' : 'Add New User' }}
          </h2>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Username *</label>
            <Input 
              v-model="formData.username" 
              placeholder="e.g. john.doe" 
              :disabled="!!editingUser"
            />
            <p v-if="editingUser" class="text-xs text-gray-500 mt-1">Username cannot be changed</p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">
              Password {{ editingUser ? '(leave blank to keep current)' : '*' }}
            </label>
            <Input 
              v-model="formData.password" 
              type="password"
              placeholder="Enter password"
            />
            <p class="text-xs text-gray-500 mt-1">
              Password will be securely hashed (bcrypt)
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Full Name *</label>
            <Input v-model="formData.full_name" placeholder="e.g. John Doe" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Role *</label>
            <select v-model="formData.role" class="w-full border rounded-md p-2">
              <option value="cashier">Cashier - POS only</option>
              <option value="manager">Manager - Products, customers, reports</option>
              <option value="accountant">Accountant - Reports and closing</option>
              <option value="admin">Administrator - Full access</option>
            </select>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input v-model="formData.is_active" type="checkbox" />
              <span class="text-sm font-medium">Active (can login)</span>
            </label>
          </div>
        </div>

        <div class="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" @click="showModal = false" :disabled="loading">{{ label('Cancel') }}</Button>
          <Button @click="saveUser" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save User' }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>
