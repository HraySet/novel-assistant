/**
 * 章节内大纲：扫描 Markdown 标题（# / ## / ###），生成目录并支持跳转。
 *
 * 从 MdEditor.vue 下沉。`scanHeadings` 是纯函数（只依赖 doc 的 line 迭代），
 * 重点测它——标题层级、文本清理、绝对位置。
 *
 * 依赖规则：`jumpToHeading` 的「滚动到标题」依赖 CodeMirror 的 scrollIntoView
 * 副作用，通过 `scrollTo` 回调注入，不闭包捕获组件里的 view。
 */
import { ref } from 'vue'

export interface Heading {
  level: number
  text: string
  /** 标题在文档中的绝对位置（line.from） */
  pos: number
}

/** CodeMirror doc 的最小接口：按行迭代读取 */
export interface HeadingDoc {
  lines: number
  line(i: number): { text: string; from: number }
}

/** 扫描 1-3 级 Markdown 标题（# 后跟空格），返回层级、清理后的文本与绝对位置 */
export function scanHeadings(doc: HeadingDoc | null): Heading[] {
  if (!doc) return []
  const list: Heading[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const m = /^(#{1,3})\s+(.+)$/.exec(line.text)
    if (m) list.push({ level: m[1].length, text: m[2].trim(), pos: line.from })
  }
  return list
}

export interface EditorOutlineDeps {
  /** 取当前 doc（无 view 时返回 null） */
  getDoc: () => HeadingDoc | null
  /** 跳转：定位光标到 pos 并滚动到视口顶部（由组件用 EditorView.scrollIntoView 实现） */
  jumpTo: (pos: number) => void
}

export function useEditorOutline(deps: EditorOutlineDeps) {
  const showOutline = ref(false)
  const headings = ref<Heading[]>([])
  let outlineTimer: ReturnType<typeof setTimeout> | null = null

  function rescan() {
    headings.value = scanHeadings(deps.getDoc())
  }

  /**
   * 大纲打开期间文档变化时重建（防抖 400ms）。
   * 条目存的是绝对位置，标题上方增删字符会让后面位置整体偏移，
   * 不重建就会「点大纲跳到别处」；文档没变时不重扫，避免每次按键全量遍历。
   */
  function scheduleOutlineRefresh() {
    if (!showOutline.value) return
    if (outlineTimer) clearTimeout(outlineTimer)
    outlineTimer = setTimeout(() => {
      outlineTimer = null
      if (showOutline.value) rescan()
    }, 400)
  }

  function toggleOutline() {
    if (showOutline.value) {
      showOutline.value = false
      return
    }
    rescan()
    showOutline.value = true
  }

  function jumpToHeading(pos: number) {
    deps.jumpTo(pos)
    showOutline.value = false
  }

  function clearOutlineTimer() {
    if (outlineTimer) {
      clearTimeout(outlineTimer)
      outlineTimer = null
    }
  }

  return {
    showOutline,
    headings,
    rescan,
    scheduleOutlineRefresh,
    toggleOutline,
    jumpToHeading,
    clearOutlineTimer,
  }
}
