<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import PurchaseReceiptInformation from '@/components/purchases/PurchaseReceiptInformation.vue';
import PurchaseReceiptItems from '@/components/purchases/PurchaseReceiptItems.vue';
import { usePurchaseOrderReceive } from '@/composables/usePurchaseOrderReceive';

const { router, formatCurrency, loading, saving, po, receiveItems, canReceive, receiveGoods } =
  usePurchaseOrderReceive();
</script>

<template>
  <div class="tool-terminal receive-view compact-workspace">
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">Receive Purchase Order</h2>
        <p class="view-subtitle">Enter batch details and quantities received</p>
      </div>
      <Button @click="router.push('/purchase-orders')" variant="outline"> Back to List </Button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>

    <div v-else-if="po" class="content">
      <!-- PO Info -->
      <PurchaseReceiptInformation :format-currency="formatCurrency" :po="po" />
      <!-- Receive Items -->
      <PurchaseReceiptItems v-model:receive-items="receiveItems" />
      <!-- Actions -->
      <div class="actions">
        <Button @click="router.push('/purchase-orders')" variant="outline" :disabled="saving">
          Cancel
        </Button>
        <Button @click="receiveGoods" :disabled="!canReceive || saving">
          {{ saving ? 'Processing...' : 'Receive Goods & Update Stock' }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style src="@/components/purchases/PurchaseOrderReceive.css"></style>
