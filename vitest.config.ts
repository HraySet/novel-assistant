import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // 默认 node 环境（现有 245 个纯逻辑测试），组件测试文件用
    // `// @vitest-environment happy-dom` 注释按文件覆盖为 DOM 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
