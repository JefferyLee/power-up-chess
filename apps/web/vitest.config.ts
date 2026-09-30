/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vite'
import viteConfig from './vite.config'

// Merge in the main Vite config so our @data alias and other resolve options
// apply to test runs too — otherwise vitest can't find puzzle JSON.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      // Node by default: only a handful of tests need a DOM, and jsdom setup
      // was ~half the suite's wall time. Files that touch window/document opt
      // in with a `// @vitest-environment jsdom` docblock on line 1.
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
)
