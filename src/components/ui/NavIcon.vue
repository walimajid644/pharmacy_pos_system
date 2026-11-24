<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ name: string }>();
const paths = computed(() => {
  const name = props.name;
  if (name === 'home') return ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'];
  if (name === 'logout') return ['M9 4H4v16h5', 'M9 12h12', 'm17 8 4 4-4 4'];
  if (/settings/.test(name)) return ['M4 7h16M4 17h16', 'M8 4v6M16 14v6'];
  if (/customer|supplier|users|cashier/.test(name))
    return [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
      'M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-3.9',
    ];
  if (/expiry|controlled/.test(name)) return ['m12 3 10 18H2L12 3Z', 'M12 9v5M12 17h.01'];
  if (/password|rights/.test(name))
    return ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4', 'M12 15v2'];
  if (/search/.test(name)) return ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'm15 15 6 6'];
  if (/report|income|expense/.test(name)) return ['M4 3v18h17', 'M8 16v-5M13 16V7M18 16V4'];
  if (/bank|payment|closing|shift|balance/.test(name))
    return ['M3 5h18v14H3z', 'M3 9h18', 'M7 15h4'];
  if (/product|stock|categor|manufactur|shelf|catalog/.test(name))
    return ['m12 3 9 5v9l-9 5-9-5V8l9-5Z', 'm3 8 9 5 9-5M12 13v9', 'm7.5 5.5 9 5'];
  if (/backup|restore|import/.test(name)) return ['M4 4h16v16H4z', 'M12 7v8m-3-3 3 3 3-3'];
  if (/history|preorder/.test(name)) return ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l3 2'];
  if (/pos/.test(name)) return ['M3 4h18v12H3z', 'M8 21h8M12 16v5', 'M7 8h5M7 11h9'];
  return ['M5 3h10l4 4v14H5z', 'M14 3v5h5M8 12h8M8 16h6'];
});
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(path, index) in paths" :key="index" :d="path" />
  </svg>
</template>

<style scoped>
.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
