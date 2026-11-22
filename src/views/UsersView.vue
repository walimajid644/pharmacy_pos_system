<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import UserTable from '@/components/users/UserTable.vue';
import UserFormDialog from '@/components/users/UserFormDialog.vue';
import { useUsers } from '@/composables/useUsers';

const {
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
} = useUsers();
</script>

<template>
  <div class="tool-terminal compact-workspace p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ label('User Management') }}</h1>
          <p class="text-sm text-gray-600 mt-1">
            {{ uiLabel('Manage staff accounts and permissions') }}
          </p>
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
      <UserTable
        :label="label"
        :auth-store="authStore"
        :users="users"
        :search-query="searchQuery"
        :loading="loading"
        :filtered-users="filteredUsers"
        :open-edit-modal="openEditModal"
        :delete-user="deleteUser"
        :get-role-badge-class="getRoleBadgeClass"
        :get-role-label="getRoleLabel"
      />
      <footer class="tool-summary">
        <div>
          <small>{{ label('Users shown') }}</small><strong>{{ filteredUsers.length }}</strong>
        </div>
      </footer>
    </Card>

    <!-- Modal -->
    <UserFormDialog
      :label="label"
      :loading="loading"
      :editing-user="editingUser"
      :save-user="saveUser"
      v-model:show-modal="showModal"
      v-model:form-data="formData"
    />
  </div>
</template>
