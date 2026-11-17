<script setup lang="ts">
import { ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import type { Ref } from 'vue';
import type { useUsers } from '@/composables/useUsers';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useUsers>;
const props = defineProps<{
  label: ViewValue<State['label']>;
  loading: ViewValue<State['loading']>;
  editingUser: ViewValue<State['editingUser']>;
  saveUser: ViewValue<State['saveUser']>;
}>();
const showModal = defineModel<ViewValue<State['showModal']>>('showModal', { required: true });
const formData = defineModel<ViewValue<State['formData']>>('formData', { required: true });
const formDialog = ref<HTMLElement | null>(null);
const bindFormDialog = bindTemplateRef(formDialog);
useDialogKeyboard(formDialog, () => {
  if (!props.loading) showModal.value = false;
});
</script>

<template>
  <div
    v-if="showModal"
    :ref="bindFormDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="'User'"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    @pointerdown.self.prevent
  >
    <Card class="w-full max-w-lg">
      <div class="p-6 border-b">
        <h2 class="text-xl font-bold">
          {{ editingUser ? 'Edit User' : 'Add New User' }}
        </h2>
      </div>

      <div class="p-6 space-y-4">
        <div>
          <label for="field-userformdialog-1" class="block text-sm font-medium mb-2"
            >Username *</label
          >
          <Input
            id="field-userformdialog-1"
            v-model="formData.username"
            placeholder="e.g. john.doe"
            :disabled="!!editingUser"
          />
          <p v-if="editingUser" class="text-xs text-gray-500 mt-1">Username cannot be changed</p>
        </div>

        <div>
          <label for="field-userformdialog-2" class="block text-sm font-medium mb-2">
            Password {{ editingUser ? '(leave blank to keep current)' : '*' }}
          </label>
          <Input
            id="field-userformdialog-2"
            v-model="formData.password"
            type="password"
            placeholder="Enter password"
          />
          <p class="text-xs text-gray-500 mt-1">Password will be securely hashed (bcrypt)</p>
        </div>

        <div>
          <label for="field-userformdialog-3" class="block text-sm font-medium mb-2"
            >Full Name *</label
          >
          <Input
            id="field-userformdialog-3"
            v-model="formData.full_name"
            placeholder="e.g. John Doe"
          />
        </div>

        <div>
          <label for="field-userformdialog-4" class="block text-sm font-medium mb-2">Role *</label>
          <select
            id="field-userformdialog-4"
            v-model="formData.role"
            class="w-full border rounded-md p-2"
          >
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
        <Button variant="outline" @click="showModal = false" :disabled="loading">{{
          label('Cancel')
        }}</Button>
        <Button @click="saveUser" :disabled="loading">
          {{ loading ? 'Saving...' : 'Save User' }}
        </Button>
      </div>
    </Card>
  </div>
</template>
