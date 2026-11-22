<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import CompactPages from '@/components/ui/CompactPages.vue';
import { bindTemplateRef } from '@/lib/templateRefs';

import { useCommercialDocuments } from '@/composables/useCommercialDocuments';

const {
  label,
  formatCurrency,
  pick,
  kind,
  title,
  products,
  customers,
  loading,
  busy,
  error,
  editing,
  query,
  filter,
  productQuery,
  productId,
  printing,
  printLines,
  form,
  editorDialog,
  expired,
  total,
  visible,
  matches,
  load,
  create,
  chooseCustomer,
  add,
  edit,
  save,
  cancel,
  print,
  checkout,
} = useCommercialDocuments();
const bindeditorDialog = bindTemplateRef(editorDialog);
</script>
<template>
  <div class="tool-terminal compact-workspace documents-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ title }}</h1>
        <p>
          {{
            kind === 'estimate'
              ? 'Prepare and print quotations, then convert to a sale'
              : 'Track requested products and fulfil through Sales'
          }}
        </p>
      </div>
      <button @click="create">
        + {{ kind === 'estimate' ? label('New estimate') : label('New pre-order') }}
      </button>
    </header>
    <div class="commercial-filters">
      <input
        v-model="query"
        type="search"
        :placeholder="label('Search number or customer')"
        aria-label="Search documents"
      /><select v-model="filter" aria-label="Document status">
        <option value="all">{{ label('All statuses') }}</option>
        <option value="open">{{ label('Open') }}</option>
        <option value="converted">{{ label('Converted to sale') }}</option>
        <option value="cancelled">{{ label('Cancelled') }}</option></select
      ><button :disabled="loading" @click="load">{{ label('Refresh') }}</button>
    </div>
    <p class="commercial-hint">
      {{ uiLabel('Quantities and prices are per base unit.') }}
      {{
        kind === 'estimate'
          ? 'Quoted totals exclude checkout tax and discounts.'
          : 'Pre-orders do not reserve stock or collect deposits.'
      }}
      {{
        uiLabel(
          'Conversion uses current prices, tax and available unexpired stock; review the sale before checkout.',
        )
      }}
    </p>
    <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
    <div class="paged-table-host commercial-table-scroll">
      <p v-if="loading" role="status">{{ uiLabel('Loading documents…') }}</p>
      <CompactPages
        v-else
        :items="visible"
        :row-height="64"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table>
          <thead>
            <tr>
              <th>{{ label('Number / date') }}</th>
              <th>{{ label('Customer') }}</th>
              <th>{{ kind === 'estimate' ? label('Valid until') : label('Expected date') }}</th>
              <th>{{ label('Quoted subtotal') }}</th>
              <th>{{ label('Status / invoice') }}</th>
              <th>{{ label('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item: d } in pageRows" :key="d.id">
              <td>
                {{ d.number }}<small>{{ d.document_date }}</small>
              </td>
              <td>{{ d.customer_name }}</td>
              <td>
                {{ d.due_date || '—'
                }}<small v-if="expired(d)" class="commercial-error">{{
                  pick('Expired — edit validity date', 'میعاد ختم — تاریخ درست کریں')
                }}</small>
              </td>
              <td>{{ formatCurrency(d.subtotal_cents / 100) }}</td>
              <td>
                {{ d.status }}<small>{{ d.invoice_number }}</small>
              </td>
              <td>
                <button @click="print(d)">{{ label('Print / view') }}</button>
                <template v-if="d.status === 'open'"
                  ><button @click="edit(d)">{{ label('Edit') }}</button>
                  <button
                    class="bg-primary"
                    :disabled="expired(d)"
                    :title="
                      expired(d)
                        ? 'Renew the validity date before loading this estimate'
                        : 'Load into Sales'
                    "
                    @click="checkout(d)"
                  >
                    {{ label('Load into Sales') }}
                  </button>
                  <button :disabled="busy" @click="cancel(d)">
                    {{ label('Cancel') }}
                  </button></template
                >
              </td>
            </tr>
            <tr v-if="!visible.length">
              <td colspan="6" class="commercial-empty">
                {{ label('No documents match these filters.') }}
              </td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
    <footer class="tool-summary">
      <div>
        <small>{{ label('Documents shown') }}</small><strong>{{ visible.length }}</strong>
      </div>
      <div>
        <small>{{ label('Open quoted value') }}</small><strong>{{
          formatCurrency(
            visible.filter((d) => d.status === 'open').reduce((s, d) => s + d.subtotal_cents, 0) /
              100,
          )
        }}</strong>
      </div>
    </footer>
    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        :ref="bindeditorDialog"
        tabindex="-1"
        class="commercial-dialog commercial-document-editor"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @submit.prevent="save"
      >
        <header class="tool-header">
          <h2>
            {{
              form.id
                ? kind === 'estimate'
                  ? pick('Edit estimate', 'تخمینے میں ترمیم')
                  : pick('Edit pre-order', 'پیشگی آرڈر میں ترمیم')
                : kind === 'estimate'
                  ? label('New estimate')
                  : label('New pre-order')
            }}
          </h2>
          <button type="button" :disabled="busy" @click="editing = false">
            {{ label('Close') }}
          </button>
        </header>
        <p v-if="kind === 'preorder'" class="commercial-hint">
          {{
            pick(
              'Pre-orders do not reserve stock or collect deposits. Availability is checked when loading into Sales and again at checkout.',
              'پیشگی آرڈر اسٹاک محفوظ نہیں کرتے اور پیشگی رقم وصول نہیں کرتے۔ فروخت میں لوڈ کرتے اور مکمل کرتے وقت اسٹاک کی جانچ ہوتی ہے۔',
            )
          }}
        </p>
        <div class="commercial-form-grid">
          <label
            >{{ label('Registered customer')
            }}<select
              v-model="form.customerId"
              :required="kind === 'preorder'"
              @change="chooseCustomer"
            >
              <option value="">{{ label('Guest / enter name') }}</option>
              <option v-for="c in customers" :value="c.id" :key="c.id">{{ c.name }}</option>
            </select></label
          ><label
            >{{ label('Customer name')
            }}<input v-model="form.customerName" required maxlength="150" /></label
          ><label
            >{{ label('Date') }}<input v-model="form.documentDate" type="date" required /></label
          ><label
            >{{
              kind === 'estimate'
                ? label('Valid until (optional)')
                : label('Expected date (optional)')
            }}<input v-model="form.dueDate" type="date" :min="form.documentDate"
          /></label>
        </div>
        <div class="commercial-filters">
          <input
            v-model="productQuery"
            :placeholder="label('Filter products by name or SKU')"
            aria-label="Filter products"
          /><select v-model="productId" :aria-label="label('Choose product')">
            <option value="">{{ label('Choose product') }}</option>
            <option v-for="p in matches" :value="p.id" :key="p.id">
              {{ p.name }} · {{ p.sku }}
            </option></select
          ><button type="button" @click="add">{{ label('Add item') }}</button>
        </div>
        <div class="paged-table-host commercial-editor-lines">
          <CompactPages
            :items="form.items"
            :row-height="64"
            :header-height="36"
            v-slot="{ rows: pageRows }"
          >
            <table>
              <thead>
                <tr>
                  <th>{{ label('Product') }}</th>
                  <th>{{ label('Units') }}</th>
                  <th>{{ label('Price / unit (Rs)') }}</th>
                  <th>{{ label('Amount') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ item: l, index: index } in pageRows" :key="l.productId">
                  <td>
                    {{ products.find((p) => p.id === l.productId)?.name || 'Unavailable product'
                    }}<small
                      >{{ uiLabel('Pack:') }}
                      {{ products.find((p) => p.id === l.productId)?.pack_size }}
                      {{ uiLabel('units') }}</small
                    >
                  </td>
                  <td>
                    <input
                      v-model.number="l.quantity"
                      type="number"
                      min="1"
                      step="1"
                      required
                      aria-label="Unit quantity"
                    />
                  </td>
                  <td>
                    <input
                      v-model.number="l.price"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      aria-label="Quoted unit price"
                    />
                  </td>
                  <td>{{ formatCurrency(l.quantity * l.price) }}</td>
                  <td>
                    <button type="button" @click="form.items.splice(index, 1)">
                      {{ label('Remove') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </CompactPages>
        </div>
        <label
          >{{ label('Notes') }}<textarea v-model="form.notes" maxlength="1000" rows="2" />
        </label>
        <footer class="tool-summary">
          <strong>{{ uiLabel('Subtotal') }} {{ formatCurrency(total) }}</strong
          ><button class="bg-primary" :disabled="busy || !form.items.length">
            {{ busy ? label('Saving…') : label('Save document') }}
          </button>
        </footer>
      </form>
    </div>
  </div>
  <Teleport to="body"
    ><section v-if="printing" class="commercial-print">
      <h1>{{ printing.kind === 'estimate' ? 'Estimate / Quotation' : 'Customer Pre-order' }}</h1>
      <h2>{{ printing.number }}</h2>
      <p>{{ printing.customer_name }} · {{ printing.document_date }}</p>
      <p>
        {{ printing.kind === 'estimate' ? label('Valid until') : label('Expected date') }}:
        {{ printing.due_date || 'Not specified' }} · {{ printing.status }}
      </p>
      <table>
        <thead>
          <tr>
            <th>{{ label('Product') }}</th>
            <th>{{ label('Units') }}</th>
            <th>{{ uiLabel('Rate') }}</th>
            <th>{{ label('Amount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in printLines" :key="i">
            <td>{{ l.name }}</td>
            <td>{{ l.quantity }}</td>
            <td>{{ formatCurrency(l.unit_price_cents / 100) }}</td>
            <td>{{ formatCurrency((l.quantity * l.unit_price_cents) / 100) }}</td>
          </tr>
        </tbody>
      </table>
      <h2>{{ uiLabel('Quoted subtotal') }} {{ formatCurrency(printing.subtotal_cents / 100) }}</h2>
      <p>
        {{
          uiLabel(
            'Tax and discounts are calculated at checkout. This document is not a paid sales receipt.',
          )
        }}
      </p>
      <p v-if="printing.kind === 'preorder'">
        {{ pick('No stock reservation or deposit.', 'اسٹاک محفوظ یا پیشگی رقم وصول نہیں کی گئی۔') }}
      </p>
      <p>{{ printing.notes }}</p>
      <p v-if="printing.invoice_number">
        {{ uiLabel('Converted to') }} {{ printing.invoice_number }}
      </p>
    </section></Teleport
  >
</template>
