<script setup lang="ts">
import type { Ref } from 'vue';
import type { usePurchaseOrderReceive } from '@/composables/usePurchaseOrderReceive';
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePurchaseOrderReceive>;
const receiveItems = defineModel<ViewValue<State['receiveItems']>>('receiveItems', {
  required: true,
});
</script>

<template>
  <Card class="receive-items">
    <h3 class="section-title">Items to Receive</h3>

    <CompactPages :items="receiveItems" :row-height="42" :header-height="34" v-slot="{ rows }">
      <div class="items-table">
        <div class="table-header">
          <div class="col-product">Product</div>
          <div class="col-ordered">Ordered</div>
          <div class="col-received">Already Received</div>
          <div class="col-receive">Receive Now</div>
          <div class="col-batch">Batch Number</div>
          <div class="col-expiry">Expiry Date</div>
        </div>

        <div v-for="{ item } in rows" :key="item.id" class="table-row">
          <div class="col-product">
            <div class="product-name">{{ item.product_name }}</div>
          </div>
          <div class="col-ordered">{{ item.quantity_ordered }}</div>
          <div class="col-received">{{ item.quantity_received }}</div>
          <div class="col-receive">
            <Input
              v-model.number="item.receive_now"
              type="number"
              min="0"
              :max="item.quantity_ordered - item.quantity_received"
            />
          </div>
          <div class="col-batch">
            <Input
              v-model="item.batch_number"
              placeholder="Batch #"
              :disabled="item.receive_now === 0"
            />
          </div>
          <div class="col-expiry">
            <Input v-model="item.expiry_date" type="date" :disabled="item.receive_now === 0" />
          </div>
        </div>
      </div>
    </CompactPages>
  </Card>
</template>
