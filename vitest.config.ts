import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    // scripts/check-counts.test.mjs is the only spec today.
    passWithNoTests: true,
  },
})
