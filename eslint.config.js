import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**'],
  },
  // Extension source scripts (content scripts, background, popup)
  {
    ...js.configs.recommended,
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // Available in service workers (background.js)
        ...globals.serviceworker,
        // Global logger injected by debug_utils.js at document_start
        cuLmsLog: 'readonly',
        // DOM utility injected by tasks_fix.js / debug_utils.js
        waitForElement: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Scripts share state via window.* flags — redeclaring globals is intentional
      'no-redeclare': 'off',
      // Empty catch blocks are common in extension code to silently swallow errors
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Emoji regexes in course_overview_task_status.js are intentional
      'no-misleading-character-class': 'warn',
      // Cross-script globals are intentional until proper imports are added
      'no-undef': 'warn',
    },
  },
  // Node.js scripts (pack.js, vite.config.js)
  {
    ...js.configs.recommended,
    files: ['scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
