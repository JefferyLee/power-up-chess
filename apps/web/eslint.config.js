import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Underscore convention: `_foo` / `_` marks intentionally-unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // react-hooks v6 compiler-preview rules: valuable signals but heavy
      // false-positives on react-three-fiber's ref-mutation idiom (board3d)
      // and on this codebase's reviewed setState-in-effect spots. Keep them
      // VISIBLE as warnings; the classic correctness rules (rules-of-hooks,
      // exhaustive-deps) stay errors and gate CI.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Fast-refresh DX hint, not a correctness rule; this codebase keeps
      // context + hook in one file by convention.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
