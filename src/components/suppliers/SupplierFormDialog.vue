<script setup lang="ts">
import { ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import type { Ref } from 'vue';
import type { useSuppliers } from '@/composables/useSuppliers';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSuppliers>;
defineProps<{
  t: ViewValue<State['t']>;
  pick: ViewValue<State['pick']>;
  isEditing: ViewValue<State['isEditing']>;
  saveSupplier: ViewValue<State['saveSupplier']>;
}>();
const showModal = defineModel<ViewValue<State['showModal']>>('showModal', { required: true });
const currentSupplier = defineModel<ViewValue<State['currentSupplier']>>('currentSupplier', {
  required: true,
});
const formDialog = ref<HTMLElement | null>(null);
const bindFormDialog = bindTemplateRef(formDialog);
useDialogKeyboard(formDialog, () => {
  showModal.value = false;
});
</script>

<template>
  <div
    v-if="showModal"
    :ref="bindFormDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Supplier', 'سپلائر')"
    class="modal-overlay"
    @pointerdown.self.prevent
  >
    <Card class="modal-content">
      <h3 class="modal-title">
        {{
          isEditing
            ? pick('Edit Supplier', 'سپلائر میں ترمیم کریں')
            : pick('Add Supplier', 'سپلائر شامل کریں')
        }}
      </h3>

      <form @submit.prevent="saveSupplier" class="modal-form">
        <div class="form-grid">
          <div class="form-field">
            <label for="field-supplierformdialog-1">{{ t('supplier_code') }} *</label>
            <Input
              id="field-supplierformdialog-1"
              v-model="currentSupplier.supplier_code"
              :disabled="isEditing"
              placeholder="SUP001"
              required
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-2">{{ t('supplier_name') }} *</label>
            <Input
              id="field-supplierformdialog-2"
              v-model="currentSupplier.name"
              :placeholder="pick('Enter supplier name', 'سپلائر کا نام درج کریں')"
              required
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-3">{{ t('contact_person') }}</label>
            <Input
              id="field-supplierformdialog-3"
              v-model="currentSupplier.contact_person"
              :placeholder="pick('Contact person name', 'رابطہ شخص کا نام')"
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-4">{{ t('phone_number') }}</label>
            <Input
              id="field-supplierformdialog-4"
              v-model="currentSupplier.phone_number"
              placeholder="03XX-XXXXXXX"
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-5">{{ t('email') }}</label>
            <Input
              id="field-supplierformdialog-5"
              v-model="currentSupplier.email"
              type="email"
              placeholder="supplier@email.com"
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-6">{{ t('city') }}</label>
            <Input
              id="field-supplierformdialog-6"
              v-model="currentSupplier.city"
              placeholder="Lahore"
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-7">{{
              pick('Payment Terms (days)', 'ادائیگی کی مدت (دن)')
            }}</label>
            <Input
              id="field-supplierformdialog-7"
              v-model.number="currentSupplier.payment_terms"
              type="number"
              min="0"
              step="1"
              placeholder="30"
            />
          </div>

          <div class="form-field">
            <label for="field-supplierformdialog-8">{{ t('credit_limit') }}</label>
            <Input
              id="field-supplierformdialog-8"
              v-model.number="currentSupplier.credit_limit"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>

          <div class="form-field full-width">
            <label for="field-supplierformdialog-9">{{ t('address') }}</label>
            <Input
              id="field-supplierformdialog-9"
              v-model="currentSupplier.address"
              :placeholder="pick('Full address', 'مکمل پتہ')"
            />
          </div>

          <div class="form-field full-width">
            <label for="field-supplierformdialog-10">{{ t('notes') }}</label>
            <textarea
              id="field-supplierformdialog-10"
              v-model="currentSupplier.notes"
              class="form-textarea"
              :placeholder="pick('Additional notes', 'اضافی نوٹس')"
              rows="3"
            ></textarea>
          </div>

          <div class="form-field">
            <label class="checkbox-label">
              <input
                v-model="currentSupplier.is_active"
                type="checkbox"
                :true-value="1"
                :false-value="0"
              />
              <span>{{ t('active') }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <Button type="button" @click="showModal = false" variant="outline">
            {{ t('cancel') }}
          </Button>
          <Button type="submit">
            {{
              isEditing
                ? pick('Update Supplier', 'سپلائر اپ ڈیٹ کریں')
                : pick('Create Supplier', 'سپلائر بنائیں')
            }}
          </Button>
        </div>
      </form>
    </Card>
  </div>
</template>
