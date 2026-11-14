<script setup lang="ts">
import { bindTemplateRef } from '@/lib/templateRefs';

import { useAdvancedItemSearch } from '@/composables/useAdvancedItemSearch';

const {
  label,
  router,
  auth,
  formatCurrency,
  filters,
  categories,
  manufacturers,
  items,
  batches,
  selected,
  loading,
  error,
  page,
  count,
  batchDialog,
  search,
  show,
  clear,
  turn,
} = useAdvancedItemSearch();
const bindbatchDialog = bindTemplateRef(batchDialog);
</script>
<template>
  <div class="tool-terminal search-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ label('Advanced Item Search') }}</h1>
        <p>{{ label('Find medicines by name, generic, SKU, barcode or DRAP registration') }}</p>
      </div>
      <button @click="clear">{{ label('Reset filters') }}</button>
    </header>
    <form class="advanced-search-filters" @submit.prevent="search()">
      <label class="search-term"
        >{{ label('Search')
        }}<input
          v-model="filters.q"
          type="search"
          :placeholder="label('Type product name, generic, SKU or barcode')" /></label
      ><label
        >{{ label('Search field')
        }}<select v-model="filters.field">
          <option value="all">{{ label('All product fields') }}</option>
          <option value="name">{{ label('Product name') }}</option>
          <option value="generic">{{ label('Generic name') }}</option>
          <option value="sku">SKU</option>
          <option value="barcode">Barcode</option>
          <option value="registration">DRAP registration</option>
        </select></label
      >
      <label
        >{{ label('Category')
        }}<select v-model="filters.category">
          <option value="">{{ label('All categories') }}</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select></label
      ><label
        >{{ label('Manufacturer')
        }}<select v-model="filters.manufacturer">
          <option value="">{{ label('All manufacturers') }}</option>
          <option v-for="m in manufacturers" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select></label
      >
      <label
        >{{ label('Stock')
        }}<select v-model="filters.stock">
          <option value="all">{{ label('Any stock') }}</option>
          <option value="in">{{ label('Available stock') }}</option>
          <option value="out">{{ label('Out of stock') }}</option>
          <option value="low">{{ label('At / below reorder level') }}</option>
        </select></label
      ><label
        >{{ label('Expiry')
        }}<select v-model="filters.expiry">
          <option value="all">{{ label('Any expiry') }}</option>
          <option value="near">{{ label('Expires within 60 days') }}</option>
          <option value="expired">{{ label('Has expired stock') }}</option>
        </select></label
      >
      <label
        >{{ label('Minimum unit price')
        }}<input v-model="filters.min" type="number" min="0" step="0.01" /></label
      ><label
        >{{ label('Maximum unit price')
        }}<input v-model="filters.max" type="number" min="0" step="0.01" /></label
      ><label
        >{{ label('Status')
        }}<select v-model="filters.status">
          <option value="active">{{ label('Active') }}</option>
          <option value="inactive">{{ label('Inactive') }}</option>
          <option value="all">{{ label('All statuses') }}</option>
        </select></label
      ><label class="commercial-check"
        ><input v-model="filters.controlled" type="checkbox" />{{
          label('Controlled products only')
        }}</label
      ><button class="bg-primary" :disabled="loading">
        {{ loading ? label('Searching…') : label('Search items') }}
      </button>
    </form>
    <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
    <div class="commercial-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ label('Product / generic') }}</th>
            <th>{{ label('SKU / barcode') }}</th>
            <th>{{ label('Category / manufacturer') }}</th>
            <th>{{ label('Unit price') }}</th>
            <th>{{ label('Available units') }}</th>
            <th>{{ label('Expired units') }}</th>
            <th>{{ label('Next expiry') }}</th>
            <th>{{ label('Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in items" :key="p.id">
            <td>
              {{ p.name }}<small>{{ p.generic_name }} {{ p.is_active ? '' : '· Inactive' }}</small>
            </td>
            <td>
              {{ p.sku }}<small>{{ p.barcode }}</small>
            </td>
            <td>
              {{ p.category || '—' }}<small>{{ p.manufacturer }}</small>
            </td>
            <td>
              {{ formatCurrency(p.unit_price) }}<small>{{ p.pack_size }} units / pack</small>
            </td>
            <td :class="{ 'commercial-error': p.stock <= p.reorder_level }">{{ p.stock }}</td>
            <td>{{ p.expired_stock }}</td>
            <td>{{ p.next_expiry || '—' }}</td>
            <td>
              <button @click="show(p)">{{ label('Batches') }}</button>
              <button v-if="auth.hasRole(['admin', 'manager'])" @click="router.push('/products')">
                {{ label('Manage') }}
              </button>
            </td>
          </tr>
          <tr v-if="!items.length && !loading">
            <td colspan="8" class="commercial-empty">
              {{ label('No items match these filters.') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="tool-summary">
      <div>
        <small>{{ label('Matching products') }}</small><strong>{{ count }}</strong>
      </div>
      <div>
        <small>{{ label('Page') }}</small><strong
          >{{ page + 1 }} / {{ Math.max(1, Math.ceil(count / 100)) }}</strong
        >
      </div>
      <button :disabled="page === 0 || loading" @click="turn(-1)">
        {{ label('Previous') }}</button><button
        :disabled="(page + 1) * 100 >= count || loading"
        @click="turn(1)"
      >
        {{ label('Next') }}
      </button>
    </footer>
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="selected = null"
    >
      <section
        :ref="bindbatchDialog"
        tabindex="-1"
        class="commercial-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="selected.name"
      >
        <header class="tool-header">
          <h2>{{ selected.name }} · Batches</h2>
          <button @click="selected = null">{{ label('Close') }}</button>
        </header>
        <p>
          DRAP: {{ selected.drap_registration_number || 'Not recorded' }} · Earliest expiry is sold
          first.
        </p>
        <table>
          <thead>
            <tr>
              <th>{{ label('Batch') }}</th>
              <th>{{ label('Expiry') }}</th>
              <th>{{ label('Total units') }}</th>
              <th>{{ label('Opened loose units') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in batches" :key="b.id">
              <td>{{ b.batch_number }}</td>
              <td>{{ b.expiry_date }}</td>
              <td>{{ b.quantity_in_stock }}</td>
              <td>{{ b.loose_open_remaining }}</td>
            </tr>
            <tr v-if="!batches.length">
              <td colspan="4">{{ label('No batches recorded.') }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
