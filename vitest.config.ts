import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    // No unit tests remain after the animated NeuronHeroText hero was retired
    // for the calm Design System v2 hero; keep the script green until specs return.
    passWithNoTests: true,
  },
})
