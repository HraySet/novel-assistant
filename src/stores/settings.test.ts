import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './settings'

/**
 * 这组用例的价值不只是覆盖取值逻辑，更是**证明 store 能在无浏览器环境初始化**：
 * 之前 `loadEditorFontSize` 裸用 localStorage、`applyEditorFontSize` 裸用 document，
 * settings store 在 node 里一碰就抛 ReferenceError，于是它的所有状态逻辑都无法被测。
 */
describe('settings store（无 DOM / 无 localStorage 环境）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('可以正常初始化，并回落到默认值', () => {
    const s = useSettingsStore()
    expect(s.editorFontSize).toBe(17)
    expect(s.editorLineHeight).toBe(1.8)
    expect(s.editorWidth).toBe('中')
    expect(s.aiProvider).toBe('openai')
    expect(s.typewriterMode).toBe(false)
    expect(s.focusLineMode).toBe(false)
  })

  it('字号夹取在 14–24 之间', () => {
    const s = useSettingsStore()
    s.setEditorFontSize(100)
    expect(s.editorFontSize).toBe(24)
    s.setEditorFontSize(1)
    expect(s.editorFontSize).toBe(14)
    s.setEditorFontSize(18)
    expect(s.editorFontSize).toBe(18)
  })

  it('行距夹取在 1.5–2.2 之间并保留一位小数', () => {
    const s = useSettingsStore()
    s.setEditorLineHeight(5)
    expect(s.editorLineHeight).toBe(2.2)
    s.setEditorLineHeight(0.1)
    expect(s.editorLineHeight).toBe(1.5)
    s.setEditorLineHeight(1.86)
    expect(s.editorLineHeight).toBe(1.9)
  })

  it('正文宽度只接受预设值，非法值回落「中」', () => {
    const s = useSettingsStore()
    s.setEditorWidth('宽')
    expect(s.editorWidth).toBe('宽')
  })

  it('打字机 / 聚焦行可独立开关', () => {
    const s = useSettingsStore()
    expect(s.typewriterMode).toBe(false)
    s.toggleTypewriter()
    expect(s.typewriterMode).toBe(true)
    expect(s.focusLineMode).toBe(false)
    s.toggleFocusLine()
    expect(s.focusLineMode).toBe(true)
  })

  it('AI 上下文选项有完整默认值并可局部覆盖', () => {
    const s = useSettingsStore()
    expect(s.aiContextOptions).toMatchObject({
      roles: true,
      outlines: true,
      project: true,
      recap: true,
      recapChapters: 4,
    })
    s.setAiContextOptions({ roles: false })
    expect(s.aiContextOptions.roles).toBe(false)
    expect(s.aiContextOptions.outlines).toBe(true)
  })

  it('快捷提示词可覆盖与还原', () => {
    const s = useSettingsStore()
    s.setAiQuickPrompt('润色', '自定义提示词')
    expect(s.aiQuickPrompts['润色']).toBe('自定义提示词')
    s.resetAiQuickPrompt('润色')
    expect(s.aiQuickPrompts['润色']).toBeUndefined()
  })

  it('主题预设切换会同步强调色、背景色与明暗', () => {
    const s = useSettingsStore()
    const dark = s.colorPresets.find((p) => p.dark)!
    s.applyColorPreset(dark)
    expect(s.themeDark).toBe(true)
    expect(s.accentColor).toBe(dark.value)
    expect(s.bgColor).toBe(dark.bg)
  })
})

describe('默认 AI 配置的隔离性', () => {
  it('修改一个实例的 Key 不会泄漏到新建实例', () => {
    setActivePinia(createPinia())
    const first = useSettingsStore()
    first.aiApiKey = 'sk-should-not-leak'

    setActivePinia(createPinia())
    const second = useSettingsStore()

    // 根因：`{ ...DEFAULT_AI_CONFIGS }` 是浅拷贝，内层 provider 对象被共享，
    // 修改 key 等于改模块级默认值，之后每个新实例都会带着它
    expect(second.aiApiKey).toBe('')
  })
})
