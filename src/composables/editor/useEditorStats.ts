/**
 * 章节字数统计（防抖）。
 *
 * 从 MdEditor.vue 下沉。原实现里 `chapterWords` ref 与 `wordsTimer` 内联在组件，
 * 无法脱离 DOM 做单元测试。
 */
import { ref } from 'vue'
import { countWords } from '../../utils/countWords'

export interface EditorStatsDeps {
  getView: () => { state: { doc: { toString(): string } } } | null
}

export function useEditorStats(deps: EditorStatsDeps) {
  const chapterWords = ref(0)
  let wordsTimer: ReturnType<typeof setTimeout> | null = null

  /** 防抖统计当前文档字数（300ms 内连续编辑只算最后一次） */
  function updateChapterWords() {
    if (wordsTimer) clearTimeout(wordsTimer)
    wordsTimer = setTimeout(() => {
      wordsTimer = null
      const view = deps.getView()
      if (view) chapterWords.value = countWords(view.state.doc.toString())
    }, 300)
  }

  function clearWordsTimer() {
    if (wordsTimer) {
      clearTimeout(wordsTimer)
      wordsTimer = null
    }
  }

  return { chapterWords, updateChapterWords, clearWordsTimer }
}
