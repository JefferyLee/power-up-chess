import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['lib/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
]
