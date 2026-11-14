import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// Separate output: the native test driver is never in the release frontend.
export default defineConfig({
  root: path.resolve('tests/native'),
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve('src') } },
  build: {
    outDir: path.resolve('test-results/native-acceptance/frontend'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
