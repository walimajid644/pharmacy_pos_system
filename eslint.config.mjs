import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import ts from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'src-tauri/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off', // TypeScript checks globals, including DOM-only types.

      'no-console': ['error', { allow: ['warn'] }],
      'vue/multi-word-component-names': [
        'error',
        { ignores: ['App', 'Button', 'Input', 'Card', 'Badge', 'Toast'] },
      ],
    },
  },
  {
    files: ['*.{js,mjs,ts}', 'scripts/**/*.mjs', 'tests/**/*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
