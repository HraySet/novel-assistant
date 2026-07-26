import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
}

export const useFileStore = defineStore('file', () => {
  const tree = ref<FileNode[]>([])
  const openFile = ref<OpenFile | null>(null)
  const openHistory = ref<string[]>([])
  const historyIndex = ref(-1)

  function setTree(nodes: FileNode[]) {
    tree.value = nodes
  }

  function setOpenFile(file: OpenFile) {
    openFile.value = file
    // 添加到历史
    if (openHistory.value[openHistory.value.length - 1] !== file.path) {
      openHistory.value.push(file.path)
      historyIndex.value = openHistory.value.length - 1
    }
  }

  function goBack(): string | null {
    if (historyIndex.value > 0) {
      historyIndex.value--
      return openHistory.value[historyIndex.value]
    }
    return null
  }

  function goForward(): string | null {
    if (historyIndex.value < openHistory.value.length - 1) {
      historyIndex.value++
      return openHistory.value[historyIndex.value]
    }
    return null
  }

  function hasBack(): boolean {
    return historyIndex.value > 0
  }

  function hasForward(): boolean {
    return historyIndex.value < openHistory.value.length - 1
  }

  return {
    tree,
    openFile,
    setTree,
    setOpenFile,
    goBack,
    goForward,
    hasBack,
    hasForward,
  }
})
