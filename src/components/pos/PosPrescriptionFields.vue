<script setup lang="ts">
import type { Ref } from 'vue';
import type { usePosTerminal } from '@/composables/usePosTerminal';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePosTerminal>;
defineProps<{
  pick: ViewValue<State['pick']>;
  cartStore: ViewValue<State['cartStore']>;
  hasControlled: ViewValue<State['hasControlled']>;
  prescriptionMissing: ViewValue<State['prescriptionMissing']>;
}>();
const patientName = defineModel<ViewValue<State['patientName']>>('patientName', { required: true });
const doctorName = defineModel<ViewValue<State['doctorName']>>('doctorName', { required: true });
const prescriptionNote = defineModel<ViewValue<State['prescriptionNote']>>('prescriptionNote', {
  required: true,
});
</script>

<template>
  <section class="pos-rx-fields">
    <h3>℞ {{ pick('Prescription details', 'نسخے کی تفصیل') }}</h3>
    <p v-if="prescriptionMissing" role="alert" class="pos-error">
      {{
        pick(
          'Prescription details required before checkout.',
          'فروخت سے پہلے نسخے کی تفصیل ضروری ہے۔',
        )
      }}
    </p>
    <label
      >{{ pick('Patient name (optional)', 'مریض کا نام (اختیاری)')
      }}<input v-model="patientName" maxlength="100" type="text" /></label
    ><label
      >{{ pick('Prescribing doctor (optional)', 'نسخہ لکھنے والا ڈاکٹر (اختیاری)')
      }}<input v-model="doctorName" maxlength="100" type="text"
    /></label>
    <p
      v-if="cartStore.items.some((item) => item.product.controlled_substance)"
      class="pos-controlled-warning"
    >
      {{
        pick(
          'Controlled sale: both patient and doctor names OR a prescription note/reference are required.',
          'کنٹرول شدہ فروخت: مریض اور ڈاکٹر دونوں نام یا نسخے کا نوٹ / حوالہ ضروری ہے۔',
        )
      }}
    </p>
    <label v-if="hasControlled"
      >{{ pick('Prescription note / reference', 'نسخے کا نوٹ / حوالہ')
      }}<textarea
        class="pos-prescription-note"
        v-model="prescriptionNote"
        maxlength="500"
        rows="2"
      />
    </label>
  </section>
</template>
