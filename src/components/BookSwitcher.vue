<template>
  <div class="flex flex-col items-center gap-1">
    <n-popover trigger="click" placement="right" :width="260" @update:show="onPopoverToggle">
      <template #trigger>
        <button
          class="relative w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center transition-all duration-150 cursor-pointer hover:scale-105"
          :class="tx('hover:bg-white/5 text-gray-400 hover:text-gray-200', 'hover:bg-black/5 text-gray-500 hover:text-gray-700')"
          :title="books.currentBook?.title ?? '无作品'">
          <span class="text-xs leading-tight text-center font-bold tracking-wide" :style="{ color: accentColor }">{{
            displayName }}</span>

          <span v-if="books.books.length > 1"
            class="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] leading-[14px] text-center font-medium"
            :class="tx('bg-white/10 text-gray-300', 'bg-black/10 text-gray-600')">{{ books.books.length }}</span>
        </button>
      </template>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span :style="{ color: 'var(--text-secondary)' }"
            class="text-[10px] uppercase tracking-wider font-medium">作品</span>
          <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">{{ books.books.length }}</span>
        </div>

        <n-input v-if="books.books.length > 6" v-model:value="searchQuery" size="small" placeholder="搜索作品" clearable />

        <div class="space-y-0.5 max-h-56 overflow-y-auto">
          <div v-for="book in filteredBooks" :key="book.id"
            class="group relative flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-[var(--radius-sm)] text-left text-xs transition-all cursor-pointer"
            :style="book.id === books.currentBookId
              ? { backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }
              : { color: 'var(--text-tertiary)' }"
            :class="book.id !== books.currentBookId ? tx('hover:bg-white/[0.04] hover:text-gray-200', 'hover:bg-black/[0.03] hover:text-gray-700') : ''"
            @click="switchTo(book.id)">
            <span v-if="book.id === books.currentBookId" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
              :style="{ backgroundColor: accentColor }" />

            <span
              class="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold text-white"
              :style="{ backgroundColor: colorForBook(book.id) }">{{ (book.title || '书').charAt(0) }}</span>

            <div class="flex-1 min-w-0">
              <div class="truncate">{{ book.title }}</div>
            </div>

            <span v-if="book.id === books.currentBookId" :style="{ color: accentColor }"
              class="text-[10px] flex-shrink-0">✓</span>

            <n-dropdown trigger="click" :options="manageOptions" @select="(key: string) => onManageSelect(key, book)"
              @update:show="(show: boolean) => { if (show) menuOpenFor = book.id }">
              <button
                class="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                :class="[menuOpenFor === book.id ? 'opacity-100' : '', tx('hover:bg-white/10 text-gray-500', 'hover:bg-black/10 text-gray-400')]"
                @click.stop>⋯</button>
            </n-dropdown>
          </div>

          <div v-if="filteredBooks.length === 0 && books.books.length > 0" class="py-6 text-center text-[11px]"
            :style="{ color: 'var(--text-tertiary)' }">
            没有找到匹配的作品
          </div>

          <div v-if="books.books.length === 0" class="py-6 flex flex-col items-center gap-2 text-center">
            <div class="text-[11px]" :style="{ color: 'var(--text-tertiary)' }">还没有任何作品</div>
            <n-button size="small" type="primary" @click="showCreate = true">创建第一个作品</n-button>
          </div>
        </div>

        <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-2 space-y-1">
          <div v-if="books.workspaceStatus.path" :style="{ color: 'var(--text-tertiary)' }"
            class="text-[9px] px-1 truncate" :title="books.workspaceStatus.path">
            {{ books.workspaceStatus.path }}
          </div>

          <button v-if="books.books.length > 0"
            class="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-[var(--radius-sm)] border border-dashed transition-colors"
            :class="tx('border-white/10 text-gray-500 hover:text-gray-200 hover:border-white/20 hover:bg-white/[0.03]',
              'border-black/10 text-gray-400 hover:text-gray-700 hover:border-black/20 hover:bg-black/[0.02]')"
            @click="showCreate = true">
            <span class="text-sm leading-none">+</span>
            <span>创建新作品</span>
          </button>
        </div>
      </div>
    </n-popover>

    <n-modal v-model:show="showCreate" preset="card" :bordered="false" style="width: 380px">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold text-white"
            :style="{ backgroundColor: accentColor }">+</span>
          <span class="text-base font-semibold">{{ editingBook ? '重命名作品' : '创建新作品' }}</span>
        </div>
      </template>
      <div class="space-y-3">
        <n-input v-model:value="newBookTitle" placeholder="作品名称" size="large" maxlength="30" show-count
          @keyup.enter="editingBook ? doRename() : doCreate()" />
        <n-input v-if="!editingBook" v-model:value="newBookDesc" type="textarea" placeholder="简单描述一下这个作品的题材或风格（可选）"
          :autosize="{ minRows: 2, maxRows: 4 }" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <n-button size="small" @click="closeModal">取消</n-button>
          <n-button size="small" type="primary" :disabled="!newBookTitle.trim()"
            @click="editingBook ? doRename() : doCreate()">{{ editingBook ? '保存' : '创建并切换' }}</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="showDeleteConfirm" preset="dialog" type="error" title="删除作品"
      :content="`确定要删除${pendingDelete?.title ?? ''}吗？此操作不可撤销。`" positive-text="删除" negative-text="取消"
      @positive-click="confirmDelete" @negative-click="showDeleteConfirm = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NButton, NInput, NModal, NPopover, NDropdown } from "naive-ui";
import { useBooksStore } from "../stores/books";
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";

interface BookItem {
  id: string;
  title: string;
}

const books = useBooksStore();
const s = useSettingsStore();

const accentColor = computed(() => s.accentColor);

const showCreate = ref(false);
const newBookTitle = ref("");
const newBookDesc = ref("");
const editingBook = ref<BookItem | null>(null);

const searchQuery = ref("");
const menuOpenFor = ref<string | null>(null);

const showDeleteConfirm = ref(false);
const pendingDelete = ref<BookItem | null>(null);

const manageOptions = [
  { label: "重命名", key: "rename" },
  { label: "删除", key: "delete" },
];

const displayName = computed(() => {
  const t = books.currentBook?.title;
  if (!t) return "书";
  return t.length > 3 ? t.slice(0, 3) : t;
});

const filteredBooks = computed<BookItem[]>(() => {
  if (!searchQuery.value.trim()) return books.books;
  const q = searchQuery.value.trim().toLowerCase();
  return books.books.filter((b: BookItem) => b.title?.toLowerCase().includes(q));
});

const AVATAR_PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#3b82f6", "#ec4899", "#84cc16",
];
function colorForBook(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function onPopoverToggle(show: boolean) {
  if (!show) {
    searchQuery.value = "";
    menuOpenFor.value = null;
  }
}

function switchTo(bookId: string) {
  books.switchBook(bookId);
}

function onManageSelect(key: string, book: BookItem) {
  menuOpenFor.value = null;
  if (key === "rename") {
    editingBook.value = book;
    newBookTitle.value = book.title;
    showCreate.value = true;
  } else if (key === "delete") {
    pendingDelete.value = book;
    showDeleteConfirm.value = true;
  }
}

function closeModal() {
  showCreate.value = false;
  editingBook.value = null;
  newBookTitle.value = "";
  newBookDesc.value = "";
}

async function doCreate() {
  if (!newBookTitle.value.trim()) return;
  await books.createBook(newBookTitle.value.trim(), newBookDesc.value.trim());
  closeModal();
}

async function doRename() {
  if (!editingBook.value || !newBookTitle.value.trim()) return;
  await books.renameBook(editingBook.value.id, newBookTitle.value.trim());
  closeModal();
}

async function confirmDelete() {
  if (!pendingDelete.value) return;
  await books.deleteBook(pendingDelete.value.id);
  pendingDelete.value = null;
  showDeleteConfirm.value = false;
}
</script>
