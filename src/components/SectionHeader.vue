<template>
  <div class="section-header">
    <div class="section-header-main">
      <div class="section-header-icon">
        <component :is="icon" :size="18" />
      </div>
      <h3 class="section-header-title">{{ title }}</h3>
    </div>
    <p v-if="desc" class="section-header-desc">{{ desc }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

/**
 * 设置页分区头：图标框 + 标题 + 说明文字。
 * 统一三个分区的视觉结构，以后调整图标框/间距只改这一处。
 */
defineProps<{
  icon: Component
  title: string
  desc?: string
}>()
</script>

<style scoped>
.section-header {
  margin-bottom: 20px;
}

.section-header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.section-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.section-header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-header-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-left: 52px; /* 40px 图标框 + 12px gap */
}
</style>
