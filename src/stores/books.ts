import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

// ── Types ──

export interface Book {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

export interface WorkspaceStatus {
  initialized: boolean;
  path: string;
}

// ── Store ──

export const useBooksStore = defineStore("books", () => {
  const books = ref<Book[]>([]);
  const currentBookId = ref<string | null>(null);
  const workspaceStatus = ref<WorkspaceStatus>({ initialized: false, path: "" });
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function init() {
    loading.value = true;
    error.value = null;
    try {
      const status = await invoke<WorkspaceStatus>("get_workspace_status");
      workspaceStatus.value = status;
      if (status.initialized) {
        const list = await invoke<Book[]>("list_books");
        books.value = list;
        if (list.length > 0 && !currentBookId.value) {
          currentBookId.value = list[0].id;
        }
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  init();

  const currentBook = computed(() =>
    books.value.find((b) => b.id === currentBookId.value) ?? null
  );

  async function initWorkspace(path: string) {
    const status = await invoke<WorkspaceStatus>("init_workspace", { path });
    workspaceStatus.value = status;
    const list = await invoke<Book[]>("list_books");
    books.value = list;
    if (list.length > 0) currentBookId.value = list[0].id;
  }

  async function createBook(title: string, description?: string): Promise<Book> {
    const book = await invoke<Book>("create_book", {
      title: title || "未命名作品",
      description: description || "",
    });
    books.value.push(book);
    if (!currentBookId.value) currentBookId.value = book.id;
    return book;
  }

  function switchBook(bookId: string) {
    if (books.value.some((b) => b.id === bookId)) {
      currentBookId.value = bookId;
    }
  }

  async function deleteBook(bookId: string) {
    if (books.value.length <= 1) return;
    await invoke("delete_book", { bookId });
    books.value = books.value.filter((b) => b.id !== bookId);
    if (currentBookId.value === bookId) {
      currentBookId.value = books.value[0]?.id ?? null;
    }
  }

  async function updateBook(bookId: string, title: string, description: string) {
    await invoke("update_book_config", { bookId, title, description });
    const book = books.value.find((b) => b.id === bookId);
    if (book) {
      book.title = title;
      book.description = description;
    }
  }

  async function renameBook(bookId: string, title: string) {
    const book = books.value.find((b) => b.id === bookId);
    if (!book) return;
    await updateBook(bookId, title, book.description);
  }

  async function reloadBooks() {
    const list = await invoke<Book[]>("list_books");
    books.value = list;
  }

  return {
    books,
    currentBookId,
    currentBook,
    workspaceStatus,
    loading,
    error,
    init,
    initWorkspace,
    createBook,
    switchBook,
    deleteBook,
    updateBook,
    renameBook,
    reloadBooks,
  };
});

export function bookKey(bookId: string | null, baseKey: string): string {
  if (!bookId) return baseKey;
  return `book_${bookId}_${baseKey}`;
}
