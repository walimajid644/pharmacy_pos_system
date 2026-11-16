<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import type { Ref } from 'vue';
import type { useUsers } from '@/composables/useUsers';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useUsers>;
defineProps<{
  label: ViewValue<State['label']>;
  authStore: ViewValue<State['authStore']>;
  users: ViewValue<State['users']>;
  searchQuery: ViewValue<State['searchQuery']>;
  loading: ViewValue<State['loading']>;
  filteredUsers: ViewValue<State['filteredUsers']>;
  openEditModal: ViewValue<State['openEditModal']>;
  deleteUser: ViewValue<State['deleteUser']>;
  getRoleBadgeClass: ViewValue<State['getRoleBadgeClass']>;
  getRoleLabel: ViewValue<State['getRoleLabel']>;
}>();
</script>

<template>
  <div class="paged-table-host tool-table-scroll flex-1 overflow-auto p-6">
    <div v-if="loading && users.length === 0" class="text-center py-12 text-gray-500">
      Loading users...
    </div>

    <div v-else-if="filteredUsers.length === 0" class="text-center py-12 text-gray-500">
      {{ searchQuery ? 'No users found' : 'No users yet. Add your first user!' }}
    </div>

    <CompactPages
      v-else
      :items="filteredUsers"
      :row-height="56"
      :header-height="36"
      v-slot="{ rows: pageRows }"
    >
      <table class="w-full border-collapse">
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
            v-for="{ item: user } in pageRows"
            :key="user.id"
            class="border-b hover:bg-surface-page"
            :class="{ 'bg-secondary-50': user.id === authStore.currentUser?.id }"
          >
            <td class="p-3 font-mono text-sm">
              {{ user.username }}
              <span
                v-if="user.id === authStore.currentUser?.id"
                class="ml-2 text-xs text-secondary-600 font-semibold"
              >
                (You)
              </span>
            </td>
            <td class="p-3">{{ user.full_name }}</td>
            <td class="p-3">
              <span
                :class="['inline-block px-2 py-1 text-xs rounded', getRoleBadgeClass(user.role)]"
              >
                {{ getRoleLabel(user.role) }}
              </span>
            </td>
            <td class="p-3 text-sm text-secondary">
              {{ user.last_login ? new Date(user.last_login).toLocaleString() : 'Never' }}
            </td>
            <td class="p-3 text-center">
              <span
                :class="[
                  'inline-block px-2 py-1 text-xs rounded',
                  user.is_active
                    ? 'bg-banner-success-bg border-banner-success-border text-success-text'
                    : 'bg-surface-page text-muted',
                ]"
              >
                {{ user.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="p-3 text-center whitespace-nowrap">
              <Button variant="outline" size="sm" @click="openEditModal(user)" class="mr-2">{{
                label('Edit')
              }}</Button>
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
    </CompactPages>
  </div>
</template>
