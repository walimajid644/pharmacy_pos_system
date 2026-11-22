import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'zod-prose-annotations',
      enforce: 'pre',
      transform(code, id) {
        if (!/\/node_modules\/zod\/v4\/core\/(util|regexes)\.js$/.test(id.replace(/\\/g, '/'))) {
          return;
        }
        // Zod mentions this marker in prose; Rollup treats it as a misplaced
        // optimization directive. Keep the actual /*@__PURE__*/ directives.
        const cleaned = code.replaceAll('`@__PURE__`', '`PURE`');
        if (cleaned !== code) return { code: cleaned, map: null };
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
