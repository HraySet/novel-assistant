<template>
  <EmptyState v-if="!books.workspaceStatus.initialized" :icon="FolderOutline" title="还未设置工作区"
    subtitle="先在设置中选择一个目录" />
  <EmptyState v-else-if="!books.currentBookId" :icon="BookOutline" title="还没有作品"
    subtitle="点击左上角书图标创建" />
  <slot v-else />
</template>

<script setup lang="ts">
import { FolderOutline, BookOutline } from "@vicons/ionicons5";
import { useBooksStore } from "../stores/books";
import EmptyState from "./EmptyState.vue";

const books = useBooksStore();
</script>
