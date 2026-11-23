<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCustomers } from '@/composables/useCustomers';
import { useSuppliers } from '@/composables/useSuppliers';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import { localDateKey } from '@/lib/businessDay';
import { useI18n } from '@/lib/i18n';
import type { Customer, Supplier } from '@/lib/types';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import './ContactForm.css';

type ContactRole = 'client' | 'supplier';
const props = defineProps<{
  initialRole: ContactRole;
  client?: Customer | null;
  supplier?: Partial<Supplier> | null;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [role: ContactRole] }>();
const { pick, t } = useI18n();
const auth = useAuthStore();
const role = ref<ContactRole>(props.initialRole);
const saving = ref(false);
const clients = useCustomers({ loadList: false });
const suppliers = useSuppliers({ loadList: false });
if (props.client) clients.openEditModal(props.client);
else clients.openAddModal();
suppliers.openAddModal();
if (props.supplier?.id) {
  suppliers.currentSupplier.value = { ...props.supplier };
  suppliers.isEditing.value = true;
}
const clientRecord = props.client;
const clientForm = clients.formData;
const supplierForm = suppliers.currentSupplier;
const supplierEditing = suppliers.isEditing;
const editing = computed(() => (role.value === 'client' ? !!clientRecord : supplierEditing.value));
const permission = computed(() =>
  role.value === 'client' ? 'customers.write' : 'suppliers.write',
);
const registrationDate = computed(() => {
  const stamp = role.value === 'client' ? clientRecord?.created_at : supplierForm.value.created_at;
  return stamp ? localDateKey(new Date(stamp)) : localDateKey();
});
const supplierActive = computed({
  get: () => !!supplierForm.value.is_active,
  set: (value: boolean) => {
    supplierForm.value.is_active = value;
  },
});
let initialClient = { ...clientForm.value };
let initialSupplier = { ...supplierForm.value };
const visited = new Set<ContactRole>([props.initialRole]);
watch(role, (next) => {
  if (visited.has(next)) return;
  if (next === 'supplier' && !supplierEditing.value) {
    Object.assign(supplierForm.value, {
      name: [clientForm.value.first_name, clientForm.value.last_name].filter(Boolean).join(' '),
      phone_number: clientForm.value.phone_number,
      address: clientForm.value.address,
      is_active: clientForm.value.is_active,
    });
    initialSupplier = { ...supplierForm.value };
  } else if (next === 'client' && !clientRecord) {
    Object.assign(clientForm.value, {
      first_name: supplierForm.value.name || '',
      phone_number: supplierForm.value.phone_number || '',
      address: supplierForm.value.address || '',
      is_active: !!supplierForm.value.is_active,
    });
    initialClient = { ...clientForm.value };
  }
  visited.add(next);
});
function undo() {
  if (role.value === 'client') clientForm.value = { ...initialClient };
  else supplierForm.value = { ...initialSupplier };
}
function close() {
  if (!saving.value) open.value = false;
}
async function submit() {
  if (saving.value || !auth.can(permission.value)) return;
  saving.value = true;
  try {
    const saved =
      role.value === 'client' ? await clients.saveCustomer() : await suppliers.saveSupplier();
    if (saved) {
      emit('saved', role.value);
      open.value = false;
    }
  } finally {
    saving.value = false;
  }
}
const dialog = ref<HTMLElement | null>(null);
const bindDialog = bindTemplateRef(dialog);
useDialogKeyboard(dialog, close);
</script>

<template>
  <div
    v-if="open"
    :ref="bindDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Client / Supplier', 'کلائنٹ / سپلائر')"
    class="contact-form-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4"
    @pointerdown.self.prevent
  >
    <Card class="contact-form-card">
      <header class="contact-form-titlebar">
        <h2>
          {{
            editing
              ? pick('Edit Client / Supplier', 'کلائنٹ / سپلائر میں ترمیم')
              : pick('Add Client / Supplier', 'کلائنٹ / سپلائر شامل کریں')
          }}
        </h2>
        <button
          type="button"
          :disabled="saving"
          :aria-label="pick('Close contact form', 'رابطے کا فارم بند کریں')"
          @click="close"
        >
          ×
        </button>
      </header>
      <div
        class="contact-role-banner"
        role="radiogroup"
        :aria-label="pick('Contact type', 'رابطے کی قسم')"
      >
        <label :class="{ 'contact-role-selected': role === 'client' }"
          ><input
            v-model="role"
            type="radio"
            value="client"
            name="contact-role"
            :disabled="saving || !auth.can('customers.write')"
          />{{ pick('Client', 'کلائنٹ') }}</label
        >
        <label :class="{ 'contact-role-selected': role === 'supplier' }"
          ><input
            v-model="role"
            type="radio"
            value="supplier"
            name="contact-role"
            :disabled="saving || !auth.can('suppliers.write')"
          />{{ pick('Supplier', 'سپلائر') }}</label
        >
      </div>
      <form class="contact-entry-form" @submit.prevent="submit">
        <fieldset v-if="role === 'client'" class="contact-fields" :disabled="saving">
          <label class="contact-field"
            ><span>{{ pick('ID / Code', 'آئی ڈی / کوڈ') }}</span
            ><input
              :value="clientRecord?.customer_code || ''"
              :placeholder="pick('Assigned on save', 'محفوظ کرنے پر نمبر')"
              readonly
              aria-label="Client code"
          /></label>
          <label class="contact-field"
            ><span>{{ pick('Registration Date', 'رجسٹریشن کی تاریخ') }}</span
            ><input
              :value="registrationDate"
              type="date"
              readonly
              aria-label="Client registration date"
          /></label>
          <div class="contact-field contact-full">
            <label for="field-customersview-1"
              >{{ pick('First Name / Company', 'پہلا نام / کمپنی') }}
              <b aria-hidden="true">*</b></label
            ><Input
              id="field-customersview-1"
              v-model="clientForm.first_name"
              required
              aria-label="Client first name or company"
            />
          </div>
          <div class="contact-field contact-full">
            <label for="field-customersview-2"
              >{{ pick('Last Name', 'آخری نام') }} <b aria-hidden="true">*</b></label
            ><Input
              id="field-customersview-2"
              v-model="clientForm.last_name"
              required
              aria-label="Client last name"
            />
          </div>
          <div class="contact-field">
            <label for="field-customersview-3">{{ t('phone_number') }}</label><Input
              id="field-customersview-3"
              v-model="clientForm.phone_number"
              type="tel"
              aria-label="Client phone"
            />
          </div>
          <label class="contact-field"
            ><span>{{ pick('Type', 'قسم') }}</span
            ><select
              id="field-customersview-4"
              v-model="clientForm.customer_type"
              aria-label="Client type"
            >
              <option value="retail">{{ t('retail') }}</option>
              <option value="wholesale">{{ t('wholesale') }}</option>
            </select></label
          >
          <label class="contact-field contact-full contact-multiline"
            ><span>{{ t('address') }}</span
            ><textarea
              id="field-customersview-5"
              v-model="clientForm.address"
              rows="3"
              aria-label="Client address"
            />
          </label>
          <div class="contact-field contact-full">
            <label for="field-customersview-6">{{ t('credit_limit') }} (Rs)</label
            ><Input
              id="field-customersview-6"
              v-model.number="clientForm.credit_limit"
              type="number"
              min="0"
              step="0.01"
              :disabled="!auth.hasRole(['admin', 'manager'])"
              aria-label="Client credit limit"
            />
          </div>
          <p class="contact-help">
            {{
              pick(
                'Managers set credit limits. Debt changes through sales, collections and credit notes.',
                'کریڈٹ حد منیجر مقرر کرتا ہے۔ بقایا فروخت، وصولی اور کریڈٹ نوٹ سے بدلتا ہے۔',
              )
            }}
          </p>
          <label class="contact-active"
            ><input
              v-model="clientForm.is_active"
              type="checkbox"
              aria-label="Client active"
            /><span>{{ t('active') }}</span></label
          >
        </fieldset>
        <fieldset v-else class="contact-fields" :disabled="saving">
          <div class="contact-field">
            <label for="field-supplierformdialog-1"
              >{{ pick('ID / Code', 'آئی ڈی / کوڈ') }} <b aria-hidden="true">*</b></label
            ><Input
              id="field-supplierformdialog-1"
              v-model="supplierForm.supplier_code"
              :disabled="supplierEditing"
              required
              aria-label="Supplier code"
            />
          </div>
          <label class="contact-field"
            ><span>{{ pick('Registration Date', 'رجسٹریشن کی تاریخ') }}</span
            ><input
              :value="registrationDate"
              type="date"
              readonly
              aria-label="Supplier registration date"
          /></label>
          <div class="contact-field contact-full">
            <label for="field-supplierformdialog-2"
              >{{ pick('Name / Company', 'نام / کمپنی') }} <b aria-hidden="true">*</b></label
            ><Input
              id="field-supplierformdialog-2"
              v-model="supplierForm.name"
              required
              aria-label="Supplier name or company"
            />
          </div>
          <div class="contact-field contact-full">
            <label for="field-supplierformdialog-3">{{ t('contact_person') }}</label><Input
              id="field-supplierformdialog-3"
              v-model="supplierForm.contact_person"
              aria-label="Supplier contact person"
            />
          </div>
          <div class="contact-field">
            <label for="field-supplierformdialog-4">{{ t('phone_number') }}</label><Input
              id="field-supplierformdialog-4"
              v-model="supplierForm.phone_number"
              type="tel"
              aria-label="Supplier phone"
            />
          </div>
          <div class="contact-field">
            <label for="field-supplierformdialog-5">{{ t('email') }}</label><Input
              id="field-supplierformdialog-5"
              v-model="supplierForm.email"
              type="email"
              aria-label="Supplier email"
            />
          </div>
          <label class="contact-field contact-full contact-multiline"
            ><span>{{ t('address') }}</span
            ><textarea
              id="field-supplierformdialog-9"
              v-model="supplierForm.address"
              rows="2"
              aria-label="Supplier address"
            />
          </label>
          <div class="contact-field">
            <label for="field-supplierformdialog-6">{{ t('city') }}</label><Input
              id="field-supplierformdialog-6"
              v-model="supplierForm.city"
              aria-label="Supplier city"
            />
          </div>
          <label class="contact-field"
            ><span>{{ pick('Country', 'ملک') }}</span
            ><input v-model="supplierForm.country" aria-label="Supplier country"
          /></label>
          <div class="contact-field">
            <label for="field-supplierformdialog-7">{{
              pick('Payment Terms (days)', 'ادائیگی کی مدت (دن)')
            }}</label><Input
              id="field-supplierformdialog-7"
              v-model.number="supplierForm.payment_terms"
              type="number"
              min="0"
              step="1"
              aria-label="Supplier payment terms"
            />
          </div>
          <div class="contact-field">
            <label for="field-supplierformdialog-8">{{ t('credit_limit') }}</label><Input
              id="field-supplierformdialog-8"
              v-model.number="supplierForm.credit_limit"
              type="number"
              min="0"
              step="0.01"
              aria-label="Supplier credit limit"
            />
          </div>
          <label class="contact-field contact-full contact-multiline"
            ><span>{{ t('notes') }}</span
            ><textarea
              id="field-supplierformdialog-10"
              v-model="supplierForm.notes"
              rows="2"
              aria-label="Supplier notes"
            />
          </label>
          <label class="contact-active"
            ><input v-model="supplierActive" type="checkbox" aria-label="Supplier active" /><span>{{
              t('active')
            }}</span></label
          >
        </fieldset>
        <footer class="contact-actions">
          <Button type="button" variant="outline" :disabled="saving" @click="undo">{{
            pick('Undo', 'واپس')
          }}</Button>
          <Button type="button" variant="outline" :disabled="saving" @click="close">{{
            pick('Exit', 'بند کریں')
          }}</Button>
          <Button type="submit" :permission="permission" :disabled="saving">{{
            saving
              ? pick('Saving…', 'محفوظ ہو رہا ہے…')
              : role === 'client'
                ? pick('Save Customer', 'گاہک محفوظ کریں')
                : supplierEditing
                  ? pick('Update Supplier', 'سپلائر اپ ڈیٹ کریں')
                  : pick('Create Supplier', 'سپلائر بنائیں')
          }}</Button>
        </footer>
      </form>
    </Card>
  </div>
</template>
