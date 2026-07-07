# Novel Assistant · 组件设计规范

一份轻量的共享规范，目的不是"新增设计负担"，而是让以后每次加新面板时，
颜色、间距、状态表达都能直接复用，不用重新发明一遍。

---

## 1. 一个信号元素：强调色竖条（Accent Rail）

整个 App 里，"这一项是当前选中/激活的" 只用一种视觉语法表达：
**左边一条 2px 的强调色竖线 + 极淡的强调色背景。**

出现场景：
- 大纲面板：当前展开的章节
- 设定库：当前选中的分类 tab、正在编辑的条目
- 设置页：当前选中的预设按钮、当前布局模式

不用渐变、不用多种高亮色、不用加粗字体来表达"选中"——始终是这一条竖线。
这是唯一被允许"抢眼"的信号，其余状态（hover、默认）都保持安静。

## 2. Token 系统

颜色、圆角、间距全部通过 CSS 变量派生，见 `tokens.css` + `useDesignTokens.ts`。

| Token | 用途 |
|---|---|
| `--accent` | 用户自定义强调色（来自 `store.accentColor`），运行时注入 |
| `--surface-accent` / `--surface-accent-strong` | 强调色的 6-10% / 12-18% 透明变体，用于选中态背景 |
| `--border-accent` | 强调色 45% 透明，用于选中态边框 |
| `--surface-1` / `--surface-2` | 卡片默认背景 / hover 背景（深浅主题各一套） |
| `--border-hairline` / `--border-soft` | 卡片默认边框 / hover 边框 |
| `--text-primary/secondary/tertiary/disabled` | 文字层级，四级足够，不要新增第五级 |
| `--status-success/warning/danger/info` | 语义色，**固定不跟随强调色变化**（比如"已连接"永远是绿色，不管用户选了什么主题色） |
| `--radius-sm/md/lg` | 8 / 12 / 16px，分别对应 胶囊按钮 / 卡片行 / 弹窗大图标 |

关键原则：**语义色和强调色分离**。强调色代表"品牌/选中"，语义色代表"状态好坏"，
两者不能混用，否则用户换了红色主题后，"警告"和"选中"会撞色。

## 3. 组件清单

| 组件 | 替代的重复代码 | 用在哪 |
|---|---|---|
| `SectionHeader.vue` | 每个面板手写的 `图标+标题+数量+加号按钮` header | 大纲 / 设定库 / 未来任何列表面板 |
| `SurfaceCard.vue` | 到处重复的 `bg-white/[0.03] border-white/[0.06]` | 章节行、设定条目行、设置卡片 |
| `StatusDot.vue` | 大纲面板手写的字数状态点 | 任何需要"轻/中/重"三级状态指示的地方 |
| `Tag.vue` | 设定库的 tag 胶囊、大纲的伏笔标签 | 任意胶囊标签 |
| `SegmentedGroup.vue` | 字数目标/字号/服务商/分类 tab 这几组"预设按钮" | 简单的单选按钮组（不含复杂卡片信息的） |
| `EmptyState.vue` | 三个面板里各写一遍的空状态 | 无工作区 / 无作品 / 无大纲 / 无设定 / 搜索无结果 |
| `useConfirmDelete.ts` | 大纲面板的二次确认删除（且修了原来的 timer 泄漏 bug）| 设定库当前**没有**确认就是直接删——统一后必须补上 |

## 4. 使用示例（设定库面板，改造前后对比）

**改造前**（分类 tab，手写样式判断）：
```vue
<button v-for="cat in lib.categories" :key="cat.id"
  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
  :class="lib.selectedCategoryId === cat.id
    ? tx('bg-purple-500/20 text-purple-400', 'bg-purple-500/10 text-purple-600')
    : tx('text-gray-500 hover:text-gray-300 hover:bg-white/5', 'text-gray-400 hover:text-gray-600 hover:bg-black/5')"
  @click="lib.selectCategory(cat.id)">
  {{ cat.icon }} {{ cat.name }} ({{ lib.categoryStats[cat.id] ?? 0 }})
</button>
```

**改造后**（颜色跟随用户的强调色，且和其他预设按钮组视觉一致）：
```vue
<SegmentedGroup
  :options="lib.categories.map(c => ({ value: c.id, label: `${c.icon} ${c.name}` }))"
  :model-value="lib.selectedCategoryId"
  size="sm"
  @update:model-value="lib.selectCategory"
/>
```

**删除按钮改造前**（设定库，一键直接删，没有确认）：
```vue
<button @click.stop="lib.deleteEntry(entry.id)">✕</button>
```

**改造后**（和大纲面板统一为二次确认，且没有 timer 泄漏）：
```vue
<script setup lang="ts">
import { useConfirmDelete } from "../composables/useConfirmDelete";
const del = useConfirmDelete(() => lib.deleteEntry(entry.id));
</script>

<template>
  <button @click.stop="del.trigger" :class="del.armed.value ? 'text-red-400' : 'text-gray-400'">
    {{ del.armed.value ? '确认删除' : '✕' }}
  </button>
</template>
```

## 5. 排版

- 中文字体栈：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`（保证 Win/Mac 都有正确的中文字重）
- 四级文字层级封顶，不要新增第五级：主文字 → 次要 → 三级辅助 → 禁用态
- 数字（字数、计数）统一 `tabular-nums`，已有做法保留
- emoji 图标统一放进 `SurfaceCard`/圆角容器里，不要裸露的大 emoji 和容器化 emoji 混用（目前"关于"页是容器化的，其余页面是裸露的，需要统一成容器化）

## 6. 接入方式

在 App 根组件（如 `App.vue`）调用一次：
```ts
import { useDesignTokens } from "./composables/useDesignTokens";
useDesignTokens(); // 会自动把 store.accentColor 同步进 CSS 变量，并切换 .theme-dark/.theme-light
```
并引入 `tokens.css` 一次即可，其余组件直接读 `var(--xxx)`。
