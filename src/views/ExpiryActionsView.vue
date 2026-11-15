<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import { bindTemplateRef } from '@/lib/templateRefs';

import { useExpiryActions } from '@/composables/useExpiryActions';

const {
  pick,
  formatDateTime,
  formatNumber,
  nearExpiryDays,
  batches,
  holds,
  tab,
  query,
  filter,
  selectedId,
  quantity,
  reason,
  busy,
  error,
  notice,
  selectedHold,
  resolution,
  resolutionNotes,
  dialog,
  selected,
  visible,
  load,
  adjustment,
  quarantine,
  resolve,
  isExpired,
  isNearExpiry,
} = useExpiryActions();
const binddialog = bindTemplateRef(dialog);
</script>
<template>
  <div class="tool-terminal compact-workspace finance-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Expiry & Quarantine Actions', 'میعاد اور قرنطینہ کی کارروائیاں') }}</h1>
        <p>
          {{
            pick(
              'Manager-approved stock protection and auditable resolutions',
              'منیجر کی مجاز اسٹاک حفاظت اور قابلِ پڑتال تصفیے',
            )
          }}
        </p>
      </div>
      <button @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button>
    </header>
    <div class="commercial-tabs">
      <button :aria-pressed="tab === 'batches'" @click="tab = 'batches'">
        {{ pick('Batch actions', 'بیچ کی کارروائیاں') }}</button><button
        :aria-pressed="tab === 'holds'"
        @click="tab = 'holds'"
      >
        {{ pick('Quarantine audit', 'قرنطینہ ریکارڈ') }}
      </button>
    </div>
    <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="tab === 'batches'" class="commercial-split">
      <section class="commercial-main">
        <div class="commercial-filters">
          <input
            v-model="query"
            type="search"
            :placeholder="pick('Product, SKU or batch', 'مصنوعات، کوڈ یا بیچ')"
          /><select v-model="filter" :aria-label="pick('Stock filter', 'اسٹاک فلٹر')">
            <option value="near">
              {{ pick('Expired / next', 'میعاد ختم / اگلے') }} {{ formatNumber(nearExpiryDays) }}
              {{ pick('days', 'دن') }}
            </option>
            <option value="expired">{{ pick('Expired only', 'صرف میعاد ختم') }}</option>
            <option value="held">
              {{ pick('Has quarantined units', 'قرنطینہ اکائیاں موجود') }}
            </option>
            <option value="all">{{ pick('All batches', 'تمام بیچ') }}</option>
          </select>
        </div>
        <div class="paged-table-host commercial-table-scroll">
          <CompactPages
            :items="visible"
            :row-height="56"
            :header-height="36"
            v-slot="{ rows: pageRows }"
          >
            <table>
              <thead>
                <tr>
                  <th>{{ pick('Product / batch', 'مصنوعات / بیچ') }}</th>
                  <th>{{ pick('Expiry', 'میعاد') }}</th>
                  <th>{{ pick('Outside quarantine', 'قرنطینہ سے باہر') }}</th>
                  <th>{{ pick('Quarantined units', 'قرنطینہ اکائیاں') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ item: b } in pageRows" :key="b.id">
                  <td>
                    {{ b.name }}<small>{{ b.batch_number }} · {{ b.sku }}</small>
                  </td>
                  <td>
                    {{ b.expiry_date
                    }}<small v-if="isExpired(b.expiry_date)" class="stock-badge expired">{{
                      pick('Expired — cannot sell', 'میعاد ختم — فروخت منع')
                    }}</small
                    ><small
                      v-else-if="isNearExpiry(b.expiry_date, nearExpiryDays)"
                      class="stock-badge near"
                      >{{ pick('Near expiry', 'قریب المیعاد') }}</small
                    >
                  </td>
                  <td>{{ b.quantity_in_stock }}</td>
                  <td>
                    <strong v-if="b.held" class="stock-badge held"
                      >{{ pick('Quarantined', 'قرنطینہ') }}: {{ b.held }}</strong
                    ><span v-else>0</span>
                  </td>
                  <td>
                    <button @click="selectedId = b.id">{{ pick('Select', 'منتخب کریں') }}</button>
                  </td>
                </tr>
                <tr v-if="!visible.length">
                  <td colspan="5" class="commercial-empty">
                    {{ pick('No batches match.', 'کوئی بیچ نہیں ملا۔') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </CompactPages>
        </div>
        <footer class="tool-summary">
          <small>{{
            pick(
              'Available units exclude quarantine; expired units are always blocked by POS.',
              'دستیاب تعداد میں قرنطینہ شامل نہیں؛ میعاد ختم اکائیاں POS میں ہمیشہ ممنوع ہیں۔',
            )
          }}</small>
        </footer>
      </section>
      <aside class="commercial-dock">
        <h2>{{ pick('Batch actions', 'بیچ کی کارروائیاں') }}</h2>
        <form @submit.prevent="quarantine">
          <label
            >{{ pick('Product / batch', 'مصنوعات / بیچ')
            }}<select v-model="selectedId" required>
              <option value="">{{ pick('Choose batch', 'بیچ منتخب کریں') }}</option>
              <option v-for="b in batches" :key="b.id" :value="b.id">
                {{ b.name }} · {{ b.batch_number }}
              </option>
            </select></label
          >
          <p v-if="selected">
            {{ pick('Outside quarantine', 'قرنطینہ سے باہر') }}: {{ selected.quantity_in_stock }} ·
            {{ pick('Held', 'قرنطینہ') }}: {{ selected.held }}
          </p>
          <label
            >{{ pick('Units to quarantine', 'قرنطینہ کی اکائیاں')
            }}<input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="selected?.quantity_in_stock || 0"
              step="1"
              required /></label
          ><label
            >{{ pick('Reason', 'وجہ')
            }}<textarea v-model="reason" maxlength="500" required /></label
          ><button class="bg-primary" :disabled="busy || !selected || !selected.quantity_in_stock">
            {{ pick('Quarantine now', 'اب قرنطینہ کریں') }}
          </button>
          <p class="commercial-hint">
            {{
              pick(
                'Quarantine is an immediate authorized hold. It does not destroy stock or change supplier balances.',
                'قرنطینہ فوری مجاز پابندی ہے۔ یہ اسٹاک تلف نہیں کرتا یا سپلائر کا بقایا نہیں بدلتا۔',
              )
            }}
          </p>
        </form>
        <hr />
        <button :disabled="!selected || !selected.quantity_in_stock" @click="adjustment('expired')">
          {{ pick('Write-off → approval', 'تلفی ← منظوری') }}</button><button
          :disabled="!selected || !selected.quantity_in_stock"
          @click="adjustment('return_to_supplier')"
        >
          {{ pick('Return to supplier → approval', 'سپلائر کو واپسی ← منظوری') }}
        </button>
        <p class="commercial-hint">
          {{
            pick(
              'For available units, write-offs and supplier returns use the existing adjustment approval. Resolve held units from Quarantine audit. Record supplier credits separately after confirmation.',
              'دستیاب اکائیوں کی تلفی اور سپلائر واپسی موجودہ منظوری سے ہوتی ہے۔ قرنطینہ اکائیوں کا تصفیہ ریکارڈ سے کریں۔ تصدیق کے بعد سپلائر کریڈٹ الگ درج کریں۔',
            )
          }}
        </p>
      </aside>
    </div>
    <div v-else class="paged-table-host commercial-table-scroll">
      <CompactPages :items="holds" :row-height="56" :header-height="36" v-slot="{ rows: pageRows }">
        <table>
          <thead>
            <tr>
              <th>{{ pick('Product / batch', 'مصنوعات / بیچ') }}</th>
              <th>{{ pick('Quantity / reason', 'تعداد / وجہ') }}</th>
              <th>{{ pick('Held by / date', 'روکنے والا / تاریخ') }}</th>
              <th>{{ pick('Status / resolution', 'حیثیت / تصفیہ') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item: h } in pageRows" :key="h.id">
              <td>
                {{ h.name }}<small>{{ h.batch_number }}</small>
              </td>
              <td>
                {{ h.quantity }}<small>{{ h.reason }}</small>
              </td>
              <td>
                {{ h.created_by_name }}<small>{{ formatDateTime(h.created_at) }}</small>
              </td>
              <td>
                {{ h.status }}<small>{{ h.resolved_by_name }} {{ h.resolution_notes }}</small>
              </td>
              <td>
                <button
                  v-if="h.status === 'held'"
                  @click="
                    selectedHold = h;
                    resolution = 'written_off';
                    resolutionNotes = '';
                  "
                >
                  {{ pick('Resolve hold', 'قرنطینہ کا تصفیہ') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
    <div
      v-if="selectedHold"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <form
        :ref="binddialog"
        class="commercial-dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="pick('Resolve quarantine', 'قرنطینہ کا تصفیہ')"
        @submit.prevent="resolve"
      >
        <h2>
          {{ selectedHold.name }} · {{ selectedHold.batch_number }} · {{ selectedHold.quantity }}
        </h2>
        <label
          >{{ pick('Resolution', 'تصفیہ')
          }}<select v-model="resolution">
            <option value="released">
              {{ pick('Release for sale (unexpired only)', 'فروخت کے لیے جاری کریں (درست میعاد)') }}
            </option>
            <option value="written_off">
              {{ pick('Confirm destruction / write-off', 'تلفی کی تصدیق') }}
            </option>
            <option value="returned">
              {{ pick('Confirm physical return to supplier', 'سپلائر کو حقیقی واپسی کی تصدیق') }}
            </option>
          </select></label
        ><label
          >{{ pick('Reason / return reference', 'وجہ / واپسی حوالہ')
          }}<textarea v-model="resolutionNotes" required maxlength="500" />
        </label>
        <p>
          {{
            pick(
              'This resolves the entire hold. Disposal and supplier returns do not reduce available stock again or create supplier credit.',
              'یہ پورے قرنطینہ کا تصفیہ ہے۔ تلفی یا واپسی دوبارہ اسٹاک کم نہیں کرتی اور سپلائر کریڈٹ نہیں بناتی۔',
            )
          }}
        </p>
        <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
        <div>
          <button type="button" :disabled="busy" @click="selectedHold = null">
            {{ pick('Cancel', 'منسوخ') }}
          </button>
          <button class="bg-primary" :disabled="busy">
            {{ pick('Confirm resolution', 'تصفیہ کی تصدیق') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
