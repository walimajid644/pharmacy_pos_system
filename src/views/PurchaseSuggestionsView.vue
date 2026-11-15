<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import { bindTemplateRef } from '@/lib/templateRefs';

import { usePurchaseSuggestions } from '@/composables/usePurchaseSuggestions';

const {
  pick,
  formatCurrency,
  suppliers,
  lookback,
  coverage,
  lead,
  loadedPeriod,
  busy,
  error,
  query,
  page,
  selected,
  review,
  supplierId,
  dialog,
  visible,
  chosen,
  cost,
  load,
  toggle,
  startReview,
  openDraft,
  urgency,
} = usePurchaseSuggestions();
const binddialog = bindTemplateRef(dialog);
</script>
<template>
  <div class="tool-terminal documents-terminal suggestions-terminal compact-workspace">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Purchase Suggestions', 'خریداری کی تجاویز') }}</h1>
        <p>
          {{
            pick(
              'Review stock, demand and incoming orders before creating a draft',
              'مسودے سے پہلے اسٹاک، طلب اور آنے والے آرڈر کا جائزہ لیں',
            )
          }}
        </p>
      </div>
      <button :disabled="busy || !chosen.length" @click="startReview">
        {{ pick('Review draft PO', 'خریداری مسودہ دیکھیں') }} ({{ chosen.length }})
      </button>
    </header>
    <form class="commercial-filters" @submit.prevent="load">
      <label
        >{{ pick('Completed lookback days', 'گزشتہ مکمل دن')
        }}<input v-model.number="lookback" type="number" min="1" max="180" required /></label
      ><label
        >{{ pick('Coverage days', 'اسٹاک کی مدت (دن)')
        }}<input v-model.number="coverage" type="number" min="1" max="180" required /></label
      ><label
        >{{ pick('Lead-time days', 'رسد کا وقت (دن)')
        }}<input v-model.number="lead" type="number" min="0" max="90" required /></label
      ><button class="bg-primary" :disabled="busy">{{ pick('Calculate', 'حساب کریں') }}</button
      ><input
        v-model="query"
        type="search"
        :placeholder="pick('Filter product / supplier', 'مصنوعات / سپلائر تلاش کریں')"
        @input="page = 0"
      />
    </form>
    <p class="commercial-hint">
      {{
        pick(
          'Demand uses completed sales, including free units, over complete business days (end exclusive):',
          'طلب مکمل کاروباری دنوں کی فروخت، مفت اکائیوں سمیت، سے ہے (آخری تاریخ شامل نہیں):',
        )
      }}
      {{ loadedPeriod }}.
      {{
        pick(
          'Target = max(reorder level, daily units × (coverage + lead time)); subtract current unexpired stock and sent/partial PO balances, then round up to packs. Draft orders are not incoming stock. Returns are reflected in current stock. No orders are placed automatically.',
          'ہدف = دوبارہ آرڈر کی حد یا یومیہ اکائیاں × (مدت + رسد وقت)، جو زیادہ ہو۔ موجودہ درست میعاد کے اسٹاک اور بھیجے / جزوی آرڈر کا بقایا منہا کر کے پیک تک بڑھایا جاتا ہے۔ مسودے آنے والا اسٹاک نہیں۔ واپسی موجودہ اسٹاک میں شامل ہے۔ آرڈر خودکار نہیں ہوتے۔',
        )
      }}
    </p>
    <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
    <div class="commercial-table-scroll">
      <p v-if="busy" role="status">{{ pick('Calculating…', 'حساب جاری ہے…') }}</p>
      <CompactPages v-else :items="visible" :row-height="100" :header-height="36" v-slot="{ rows }">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  :aria-label="pick('Select this page', 'یہ صفحہ منتخب کریں')"
                  @change="
                    rows.forEach(({ item: r }) =>
                      toggle(r, ($event.target as HTMLInputElement).checked),
                    )
                  "
                />
              </th>
              <th>{{ pick('Product / urgency', 'مصنوعات / ترجیح') }}</th>
              <th>{{ pick('Sellable', 'قابلِ فروخت') }}</th>
              <th>{{ pick('Incoming', 'آنے والا') }}</th>
              <th>{{ pick('Units / day', 'اکائیاں / دن') }}</th>
              <th>{{ pick('Days left', 'باقی دن') }}</th>
              <th>{{ pick('Target / reorder', 'ہدف / آرڈر حد') }}</th>
              <th>{{ pick('Suggested units', 'تجویز کردہ اکائیاں') }}</th>
              <th>{{ pick('Draft units', 'مسودے کی اکائیاں') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item: r } in rows" :key="r.productId">
              <td>
                <input
                  type="checkbox"
                  :checked="!!selected[r.productId]"
                  :aria-label="r.name"
                  @change="toggle(r, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                {{ r.name }}<small>{{ r.sku }} · {{ urgency(r) }}</small
                ><small v-if="r.supplierName"
                  >{{ pick('Previous supplier', 'پچھلا سپلائر') }}: {{ r.supplierName }}</small
                >
              </td>
              <td>{{ r.available }}</td>
              <td>{{ r.incoming }}</td>
              <td>
                {{ r.dailyRate.toFixed(2)
                }}<small
                  >{{ r.recentUnits }} {{ pick('units in period', 'مدت میں اکائیاں') }}</small
                >
              </td>
              <td>{{ r.daysCover == null ? '—' : r.daysCover.toFixed(1) }}</td>
              <td>{{ r.targetStock }} / {{ r.reorderLevel }}</td>
              <td>
                {{ r.suggestedUnits }}<small>{{ pick('Pack', 'پیک') }}: {{ r.packSize }}</small>
              </td>
              <td>
                <input
                  v-if="selected[r.productId] !== undefined"
                  v-model.number="selected[r.productId]"
                  type="number"
                  min="1"
                  step="1"
                  :aria-label="pick('Draft quantity', 'مسودے کی تعداد')"
                  style="width: 80px"
                />
              </td>
            </tr>
            <tr v-if="!visible.length">
              <td colspan="9" class="commercial-empty">
                {{
                  pick(
                    'No purchase shortfall for these settings.',
                    'ان ترتیبات میں خریداری کی کمی نہیں۔',
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
    <footer class="tool-summary">
      <div>
        <small>{{ pick('Matching / selected', 'ملنے والے / منتخب') }}</small><strong
          >{{ visible.length }} / {{ chosen.length }}</strong
        >
      </div>
      <div>
        <small>{{ pick('Estimated cost before tax', 'ٹیکس سے پہلے تخمینی لاگت') }}</small><strong>{{
          formatCurrency(cost)
        }}</strong>
      </div>
    </footer>
    <div v-if="review" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        :ref="binddialog"
        class="commercial-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="pick('Review purchase draft', 'خریداری مسودے کا جائزہ')"
        @submit.prevent="openDraft"
      >
        <h2>{{ pick('Confirm items for draft editor', 'مسودہ ایڈیٹر کے آئٹم کی تصدیق') }}</h2>
        <p>
          {{ chosen.length }} {{ pick('lines', 'آئٹم') }} · {{ formatCurrency(cost) }}
          {{
            pick(
              'estimated before tax. Costs and quantities must be reviewed in the PO editor.',
              'ٹیکس سے پہلے تخمینہ۔ آرڈر ایڈیٹر میں لاگت اور تعداد ضرور دیکھیں۔',
            )
          }}
        </p>
        <label
          >{{ pick('Supplier', 'سپلائر')
          }}<select v-model="supplierId" required>
            <option value="">{{ pick('Choose supplier', 'سپلائر منتخب کریں') }}</option>
            <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select></label
        >
        <p>
          {{
            pick(
              'This opens an unsaved draft only. Nothing is ordered, paid or received until you explicitly save/send in the existing PO flow.',
              'یہ صرف غیر محفوظ مسودہ کھولتا ہے۔ موجودہ آرڈر عمل میں واضح محفوظ / ارسال تک کوئی آرڈر، ادائیگی یا وصولی نہیں ہوتی۔',
            )
          }}
        </p>
        <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
        <div>
          <button type="button" @click="review = false">{{ pick('Cancel', 'منسوخ') }}</button>
          <button class="bg-primary">{{ pick('Open draft editor', 'مسودہ ایڈیٹر کھولیں') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
