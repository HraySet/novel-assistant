# 清笔重构方案（安全优先）

> 日期：2026-11-02 · 依据：REVIEW-2026-11-01.md、PLAN-DIFF-2026-11-01.md、全量代码审读
> 原则：**先有安全网，再动刀；每一步都能单独回滚；用编译器找漏，不靠人眼**

---

## 0. 基线实况（本文档撰写时实测）

| 项 | 状态 |
|---|---|
| `node_modules` | **原本缺失**，已用 `npm ci` 恢复（198 包，25s，lockfile 未变） |
| `npx vitest run` | ✅ 2 文件 / 19 用例全绿（countWords 5 + useDiff 14） |
| `npx vue-tsc --noEmit` | ✅ 退出码 0，零类型错误（strict + strictTemplates 均开） |
| 分支 | `master` 直接开发，无 CI，无 tag |
| 未提交 | 仅 3 个未跟踪文件（两份报告 + .workbuddy） |

**结论：类型检查是现成的可靠闸门；测试覆盖极薄（只有 2 个纯函数模块）；没有 CI 兜底。**

## 1. 重构目标与非目标

**目标（可验收）**
1. 消除「同一逻辑多份实现」：前端 5 处文件树遍历、3 处路径映射、2 处上下文装配 → 各自收敛为 1 处
2. 项目开/关的生命周期有唯一入口，取代散落的 5 处初始化
3. App.vue 从 756 行降到 400 行以内，横向关注点（外部文件监听 / 关窗守卫 / AI 落盘）独立
4. Rust `lib.rs` 按领域切分，同步/异步约定统一
5. **全程：`vue-tsc` 零错误、`vitest` 全绿、手动回归清单 15 条全过**

**非目标（本阶段不做）**
- 不升级依赖版本（vite 8 / TS 6 已够新，升级与重构混做会无法定位问题）
- 不改 UI 视觉与交互
- 不重写 diff 算法、不碰 MdEditor 内部结构
- 不引入新的状态管理/路由/组件库
- 不做组件级自动化测试（vitest 当前是 node 环境，引入 jsdom + @vue/test-utils 是独立决策，建议后置）

## 2. 安全网（四件套，全部就位后才允许进入 Step 2）

### 2.1 三道闸门 + 一个清单

```bash
npx vitest run          # 闸门 1：逻辑
npx vue-tsc --noEmit    # 闸门 2：类型（本项目最强的网）
npm run build           # 闸门 3：打包可完成
```
闸门 3 附加手动回归清单（见 §6）。**每完成一个迁移点，三道闸门全跑一遍再继续。**

### 2.2 行为快照法（核心机制）

这是「确保不出错」的关键：在动任何实现之前，先把**当前实现的输出**固化成测试快照，迁移后逐字段比对。

```ts
// src/core/__tests__/tree.characterization.test.ts
import { describe, it, expect } from 'vitest'
import { FIXTURE_TREE } from './fixtures/tree.fixture'

// 迁移前：直接调用旧实现（从原地 import）
// 迁移后：改调新实现，快照不许变
import { collectFilePaths } from '../../composables/useExport'

describe('树遍历行为契约', () => {
  it('导出用：当前行为快照（注意：会包含 角色/大纲 —— 待 P1-3 修复）', () => {
    expect(collectFilePaths(FIXTURE_TREE)).toMatchInlineSnapshot()
  })
})
```

**为什么这是核心**：五个 walker 的过滤规则不一样（导出那份**不排除**设定文件），快照会把这个差异显式写出来。今后任何一次快照变化都必须回答一个问题——「这是我有意修 bug，还是我不小心改了行为？」两者在 diff 里长得一模一样，只有显式 review 才能区分。

### 2.3 双跑比对（用于高风险迁移点）

`core/tree.ts` 内置 dev 断言：新旧实现在同一输入上必须产出相同结果，否则 `console.error` 打印差异。只在 `import.meta.env.DEV` 生效，发布版零开销。

```ts
export function walkFiles(nodes, policy) {
  const next = walkImpl(nodes, policy)
  if (import.meta.env.DEV) {
    const prev = legacyWalk(nodes, policy)   // 迁移期临时保留
    if (!samePaths(prev, next)) console.error('[walkFiles] 新旧实现不一致', { policy, prev, next })
  }
  return next
}
```
真实项目里的树千奇百怪（用户自建深层目录、特殊字符文件名、非 md 文件混放），fixture 覆盖不全时，双跑能兜住。

### 2.4 分支与提交纪律

- 新建 `refactor/core-seam` 分支，**master 不动**
- 每个 Step 一个 commit，commit message 前缀区分：`refactor(core):` / `fix(history):` / `test(core):`
- 每个 Step 完成后打 tag（`step0-ok`、`step1-ok`…），回滚点明确
- **重构 commit 与 bug 修复 commit 严格分开**——这是能单独 revert 的前提
- Rust 改动单独分支（`refactor/rust-split`），不与前端混

## 3. 分阶段方案

### Step 0 —— 止血（不属于重构，但必须先做）

**为什么先做**：带着数据损坏级 bug 动刀，出事时分不清是重构引入的还是原本就有。

| 修什么 | 位置 | 改动量 |
|---|---|---|
| H1 历史版本跨章写错文件 | HistoryModal.vue:115 改 watch | 1 行 |
| diff P0-1 `replaceRange` 缺 dispatch | MdEditor.vue:409 | 1 行 |
| diff P0-2 word 模式 join 换行 | DiffView.vue:156 | 3 行 |
| diff P0-3 重复 assistant 占位消息 | useAiChat.ts:232 | 删 1 行 |

**验收**：手动复现四个 bug，确认症状消失；`vue-tsc` 仍为 0。
**回滚**：四个独立 commit，可单独 revert。

### Step 1 —— 建 `src/core/`（纯新增，零风险）✅ 已完成

**不改任何现有调用点**，只新增纯函数模块 + 测试。

```
src/core/
  tree.ts         walkFiles(nodes, policy) + TREE_POLICIES + TreeEntry
  paths.ts        normalize / joinPath(风格保持) / dirname / basename / isInside / remapPath
  __tests__/
    fixtures/tree.fixture.ts     手工构造的 FileNode 树（角色/大纲/_前缀/隐藏目录/非文本/嵌套/空目录）
    tree.test.ts                 四种 policy 的行为契约 + 可组合性 + 边界
    paths.test.ts                前缀剥离/风格/边界/子树重映射
```

> **修正（v1.1）**：原计划把 `project.ts`（项目生命周期）放进 core，这是分层错误——
> 它必须调用 4 个 store，属于编排而非纯逻辑。已改为在 Step 2 第 7 项以
> `composables/useProjectSession.ts` 实现。core 只允许放「能在 node 环境直接测」的纯函数。

**关键设计**：

```ts
export type TreePolicy =
  | 'chapters'     // 正文：md/txt，排除 角色/ 大纲/ _ 前缀/ 隐藏目录
  | 'exportable'   // 导出：同 chapters（修复 P1-3 后应与之等价）
  | 'settings'     // 角色卡 / 大纲
  | 'allFiles'     // 搜索用：所有文件
```

**验收**：新模块单测全绿（目标 +15 用例）；`vue-tsc` 0；**现有功能零变化**（因为没人调用它）。
**回滚**：删目录即可，零影响。

### Step 2 —— 绞杀式迁移（一次一处，风险由低到高）

顺序经过风险评估：先无副作用、再带副作用、最后核心写作流。

| # | 迁移点 | 风险 | 迁移后顺带修 |
|---|---|---|---|
| 1 | `SearchModal.collectFiles` | 低（纯展示） | P1-5「最近打开」改用 openHistory |
| 2 | `useExport.collectFilePaths` | 低（快照会变，是预期的） | **P1-3 导出排除设定文件** |
| 3 | `detection.collectRecentChapters` + `collectDirFiles` | 中（AI 输入，副作用） | 与 useAiContext 合并为共用装配 |
| 4 | `useAiContext.orderedChapters` + `collectDir` | 中（AI 上下文核心） | 预算常量收敛为一处 |
| 5 | `App.orderedFiles` | 中（上下章导航） | 无 |
| 6 | `renamePath` / `deletePath` 路径映射 | **高**（写盘路径相关） | **P1-2 目录重命名/删除的子文件标签** |
| 7 | `openProject` 生命周期 | **高**（跨 store 编排） | **P1-1 切换项目不清旧状态** |

**每个迁移点的固定动作（五步法）**：
1. 先写/补齐该点的快照测试（红灯或记录现状）
2. 改为调用 `core/` 新实现
3. **删掉旧实现**——这是关键：漏网的调用点会立刻编译报错，让 `vue-tsc` 替你找漏
4. 跑三道闸门，快照 diff 逐行确认（是"有意修 bug"还是"回归"）
5. 提交 + 打 tag

> 第 3 步是整个方案里最重要的技巧。**不要保留旧的私有实现做"兼容层"**，否则漏改的调用点会安静地走老代码，问题延后到线上才暴露。

### Step 3 —— 拆 App.vue（等 core 就位后再做）

抽三个 composable，各自单一职责：
- `useExternalFileWatch()` —— 3 秒 mtime 轮询 + 脏文件保护（App.vue:418-441）
- `useCloseGuard()` —— 关窗三键确认 + 全量 flush（App.vue:456-481）
- `useAiApply()` —— `handleApplySelection` / `handleAiInsert` / diff 落地（App.vue:344-357）

**风险点**：抽取时容易把 `ref` 的创建顺序或 `watch` 的注册时机弄错，导致响应式断链。对策：抽一个跑一次闸门；`useCloseGuard` 涉及 window 事件绑定，必须在 onUnmounted 配对解绑。

**验收**：App.vue ≤ 400 行；关窗保存、外部修改感知、AI 插入三项手动验过。

> **执行偏差（v1.2）**：实际把 script 段从 330 行降到 262 行，文件总行数 756 → 692。
> 未达 400 行的原因是剩余体积是**弹窗模板与 232 行样式**，继续拆只是把 markup
> 搬走并增加 props/emit 转发，不改善任何逻辑接缝。判断：收益低于风险，暂不拆。
> 若确实要压到 400 行，正确做法是把「新建项目 / 退出确认 / 设置」三个弹窗拆成
> 独立组件（各约 30-60 行模板），而不是继续动逻辑。

### Step 4 —— Rust 拆分（独立分支）

- `lib.rs` → `commands/fs.rs｜trash.rs｜backup.rs｜export.rs｜ai_config.rs｜mention.rs`，`generate_handler!` 保持原样平铺引用
- **统一 async 约定**：凡是会读大量文件或遍历目录的命令一律 `async fn` + `spawn_blocking`（现有 `list_dir` 是对的，`scan_mentions` 漏了 → P1-4）
- `scan_mentions` 顺带修「最近文件」语义（按章节序或 mtime，而非目录迭代顺序）

**验收**：`cargo check` + `npm run tauri build` 通过；角色面板、导出、回收站在真实项目上验一遍。

## 4. 风险登记表

| 风险 | 触发场景 | 对策 |
|---|---|---|
| 漏改调用点 | 迁移时靠肉眼 grep | 删除旧实现让编译器报错（Step 2 第 3 步） |
| 快照更新掩盖回归 | 顺手 `-u` 刷新快照 | 快照 diff 必须人工逐行 review，commit message 说明原因 |
| 合并遍历后性能退化 | 一处调用多次 walk | Step 2 后用 2000 文件 fixture 计时，超基线 20% 需拆缓存 |
| 拆分后响应式断链 | composable 抽取 | 每抽一个跑闸门；先抽最独立的 |
| 写盘路径改错 | Step 2 第 6/7 项 | 迁移前用 `renamePath` 单测锁 remap 结果；真实项目里先复制一份目录试 |
| 测试环境限制 | vitest 为 node 环境 | 只测纯函数；UI 依赖手动清单，不硬凑组件测试 |
| master 被污染 | 直接在主干改 | 全程 `refactor/*` 分支，合并前 squash |

## 5. 明确不动的清单

- `MdEditor.vue` 内部（竞态令牌 / 内容提供者 / 撤销缓存是正确设计，行数多但职责清晰）
- `useDiff` 的算法部分（19 个用例护着，是链路里最健康的一块）
- `useFileTreeDrag` / `useExternalFileImport`（Windows OLE 双轨 + 看门狗，重写不会更好）
- `BaseModal` / 设计令牌 / 主题系统
- Pinia 工具选型（问题在职责边界，不在库）

## 6. 手动回归清单（每 Step 完成必跑，15 条）

1. 项目库：新建 / 打开 / 切换 / 移除 / 重新定位
2. **切换项目后**：标签清空、编辑器回到空态、统计切到新项目（P1-1 验收）
3. 文件树：新建 / 重命名 / 删除 / 拖拽移动 / 收藏 / 展开状态跨重启
4. **目录重命名后**：其中已打开的章节标签仍可编辑并保存成功（P1-2 验收）
5. **目录删除后**：子文件标签不残留、收藏无幽灵条目
6. 编辑器：自动保存状态显示、Ctrl+Z 跨重启仍可用、外部改文件能感知
7. 搜索：文件名 / 内容 / **最近打开是真最近** / 键盘上下+回车
8. **历史版本：切章后打开必须是本章备份**（H1 验收，重点）
9. 回收站：删除 → 恢复 → 清空；路径显示不带 `\\?\`
10. 角色卡：出场次数、「最近 XX」文件合理、从本章抽取
11. **导出：EPUB 里没有角色/大纲/_project.md**（P1-3 验收）
12. 统计：今日字数、连续天数、日历、计时
13. AI：一次润色只产生一条 AI 消息（P0-3 验收）、diff 应用正文无多余换行
13b. **diff 交互**：整句润色显示为 1 处修改（不是十几个碎片）；取消某一块后
     该处完全回到原文、语句通顺；块首行的勾选标记与文字对齐；生成过程中界面不卡
14. 主题切换、字号/行距/正文宽度即时生效
15. 关闭应用：有脏文件时三键确认，选「保存并退出」内容不丢

## 7. 起手建议

**现在就能做的、零风险的、当天可见效的：Step 0 止血 + Step 1 建 core。**

Step 1 做完会立刻产生两个副产品：
- 五个 walker 的规则差异被快照显式记录（导出那份的"缺排除"会直接暴露）
- 后续每次迁移都有编译器兜底

建议不要跳过 Step 0 直接进 Step 1——四个 P0 里有三个在数据链路上，重构期间用户（你自己）还在用这个软件写作。

---

## 8. 自我审核修正（v1.1，2026-11-02）

计划书初稿有四处会在执行中出问题，已修正：

| # | 初稿的问题 | 修正 |
|---|---|---|
| 1 | 快照示例里 `import` 了旧实现，但五步法第 3 步要求"删掉旧实现"——测试会跟着一起编译失败 | 快照必须**先跑旧实现、把输出录成字面量断言**，测试只依赖新实现；不 import 即将删除的代码 |
| 2 | 把项目生命周期放进 `core/project.ts`，与"core 零依赖"矛盾（它要调 4 个 store） | 移到 `composables/useProjectSession.ts`，Step 2 第 7 项实现 |
| 3 | `walkFiles` 只定了 policy 没定返回结构，五个调用方要的字段不同，迁移后仍会各自映射 | 统一返回 `TreeEntry`（`node/path/relPath/parentRelPath/depth/isDir/wordCount`），调用方做投影不再遍历 |
| 4 | "迁移时顺带修 bug"只写了一句，实际会让快照变化与纯重构混在一个 commit | 每处迁移拆两步：**迁移 commit（快照不变）+ 修复 commit（快照变化并说明）** |

另外补了两个初稿没覆盖的设计细节：
- **分隔符风格不能靠盘符判断**（`E:/书/a.md` 用正斜杠），否则 `joinPath` 拼出 `E:/书\a.md`，与树中同一条目字符串不等 → 这是测试当场抓出来的
- `normatize()` 只用于比较与展示，结果不能拿去调 IPC

## 9. 执行进度

| 阶段 | 状态 | 验证 |
|---|---|---|
| 基线恢复（`npm ci`） | ✅ | 198 包，lockfile 未变 |
| Step 0 止血 | ✅ 2 commits | 135 用例全绿；`vue-tsc` 0 错误 |
| Step 1 core 模块 | ✅ 1 commit | 新增 46 用例；build 通过 |
| Step 2 迁移 7 处 | ✅ 5 commits | 逐处迁移 + 顺带修复 5 个 P1/P0 |
| Step 3 拆 App.vue | ✅ 1 commit | script 330 → 262 行 |
| 前端遗留项 | ✅ 1 commit | 请求头参数化 / 路径显示 / 单字搜索 / 超时 |
| Step 4 Rust 拆分 | ✅ 2 commits | cargo check/test/build 通过，19 个 Rust 用例 |
| 第二轮：设计债清理 | ✅ 4 commits | 157 前端用例 + 19 Rust 用例 |
| 第三轮：diff 交互重做 | ✅ 2 commits | 179 前端用例（新增 22），视觉截图核对 |

分支：`refactor/core-seam`，基线标签 `baseline-2026-11-02`。

## 10. Step 4 执行记录（Rust）

### 10.1 拆分结果

`lib.rs` 1465 行 → **79 行**（只剩模块声明与命令注册），按领域切成 10 个模块：

| 模块 | 行数 | 职责 |
|---|---|---|
| `types.rs` | 57 | 跨模块数据结构（全部 camelCase） |
| `config.rs` | 64 | config.json 读写、项目路径与索引 |
| `paths.rs` | 210 | **路径沙箱**（安全边界）+ 路径工具 |
| `backup.rs` | 190 | 版本备份、去重哈希、备份迁移 |
| `fs_ops.rs` | 510 | 文件读写/建删/移动 + 字数缓存 |
| `trash.rs` | 119 | 回收站 |
| `ai.rs` | 64 | AI 配置与系统钥匙串 |
| `export.rs` | 231 | TXT/MD/EPUB3 导出 |
| `mention.rs` | 184 | 角色出场统计 |
| `platform.rs` | 116 | 定位文件、拖放、外部拖入 |

依赖单向（platform/export/mention/trash/fs_ops → backup/paths/config → types），命令名与参数完全不变，**前端零改动**。已逐一核对 31 个命令：前端调用的全部命中注册表。

### 10.2 顺带修掉的 4 个缺陷

| 缺陷 | 原因 | 影响 |
|---|---|---|
| `scan_mentions` 同步命令 | 未用 `spawn_blocking`（`list_dir` 用了） | 打开角色面板时主线程读最多 32MB 正文，UI 卡死 |
| 全量读入内存再匹配 | 先收集所有正文再逐个匹配 | 峰值内存随全书增长 |
| `last_file` 取值无意义 | 取目录迭代顺序里最后一个命中文件 | 「最近 第3章.md」是假的，与"最近"无关 |
| `MentionStat` 字段名 | 漏了 `rename_all = "camelCase"` | 前端读 `m.lastFile` 得到 undefined，角色卡渲染「最近 XX」抛 TypeError |

### 10.3 追加修正：备份串档

`ends_with("_{filename}")` 在文件名互为后缀时会互相污染（`章.md` 的备份后缀也匹配 `v2_章.md` 的备份）。改为精确解析 `{ts}_{完整文件名}`，prune / list / 迁移三处共用。

### 10.4 验证

```
cargo check   0 错误、0 警告
cargo test    19 passed（字数口径 5 / 路径沙箱 8 / 备份命名 4 / 出场统计 3）
cargo build   成功，target/debug/yanyan.exe 18.7 MB
```

> 遗留（未做）：删除文件后其 `.backups` 会变成孤儿，清空回收站也不会带走。
> 影响仅是磁盘占用，且这些备份仍有"误删找回"的价值，暂按现状保留，已在 `REVIEW-2026-11-01.md` 记录。

### 10.5 上一轮为什么卡住（保留记录）

本机原先没有 MSVC 工具链，`link` 被 Git 自带的 GNU link 抢占，报 `link: extra operand`。
装 VS Build Tools 2022（勾「使用 C++ 的桌面开发」）后，从 `vcvars64.bat` 加载环境即可。
Git Bash 下直接 `cmd //c` 会被 MSYS 参数转换破坏，改用纯 ASCII 的批处理包装（见下）。

```bat
@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
cargo %*
```

## 11. 第二轮：设计债清理（超出原计划）

原计划只覆盖「重复实现」与「模块拆分」，第二轮针对的是**派生状态与分层一致性**——
不在 bug 清单里，但对长期可维护性影响更大。

| # | 问题 | 类型 | 处理 |
|---|---|---|---|
| 1 | 6 处直接 `invoke()` 绕过 api 层 | 分层一致性 | 补齐 api 层 7 个函数，调用方全部改走 api |
| 2 | settings 18 处裸 `localStorage` + 直接操作 `document` | 可测性 | 收敛到 `core/storage`；补 `setCssVar` 环境守卫后新增 8 个用例 |
| 3 | 「从本章抽取」用 `openFile.content` 快照 | **真 bug** | 传 `getCurrentContent` getter，打开面板时读编辑器最新内容 |
| 4 | AI 对话历史全量回发 | 成本/稳定性 | 新增 `core/chat.trimHistory`（12 条 / 12000 字预算），7 个用例 |
| 5 | `project.wordCount` 只在打开时算 | 派生状态过期 | 回项目库前重算（`goLibrary`） |

> 注：第 5 项的改动与第 3 项同在 `App.vue`，落在同一个提交里（`fix(character)`），
> 提交信息未单列，此处补记。

### 由此沉淀的设计判据（已写入 DESIGN.md §二 7-9）

- **派生状态不缓存**，或必须回答「什么时候过期、过期时谁知道」
- **跨组件传内容优先传 getter**，不传快照（接收方可能在快照之后才用）
- **发给模型的东西必须有预算**，且预算集中定义（`CONTEXT_BUDGETS` / `trimHistory`）

### 验证

```
前端  vitest   157 passed (12 files)
前端  vue-tsc  0 错误
前端  vite build 通过
Rust  cargo check / test(19) / build 均通过
```

## 12. 第三轮：diff 交互粒度重做

用户点名「diff 最严重」，复查后确认：这条链路的 P0 已在 Step 0 修完（不落笔、
换行粉碎、幽灵气泡），但**交互设计层面还有一个语义级缺陷**，且它不会被任何
「正确性测试」发现——因为它写出来的文本是对的，只是用户没法用它做决定。

### 三层问题，同一个病根

| 层 | 表现 | 病根 |
|---|---|---|
| 勾选单位 | 一次整句润色碎成 14 个红绿片段，勾一半得到病句 | 拿 LCS 的**片段**当交互单位 |
| 显示单位 | 每片段独占一行，一句话折成十几行，散文读起来是断的 | 拿**代码 diff 的心智模型**套散文 |
| 信息密度 | 整章对比时全文铺开，几十处改动里找一处 | 未改动区域不折叠 |

### 处理

`useDiff.ts` 新增三个纯函数（22 个用例）：

- `groupHunks(lines, { mergeGap })` —— 相邻删除/新增归为一块，块内同进同退。
  间隔 ≤6 字符的短 equal（「长」「，」）并入同块，于是**整句润色 = 1 处修改**。
- `toRows(lines, granularity)` —— 按片段内换行切成显示行，行内保留多片段。
- `buildDisplayItems(rows, contextLines)` —— 保留上下文 + 折叠，文首文尾同样给提示。

`DiffView.vue` 重写渲染层：勾选框只出现在块首行（续行画连接线），统计改为
「N 处修改 +18 −9」，只读场景（历史版本）不渲染勾选槽。

顺带修掉流式性能问题：生成期间 `newText` 每 token 变化一次，等于每个字重跑一次
O(m×n) 词级 LCS。改为生成中显示纯文本，结束后一次性算 diff。

### 效果（同一段真实文本）

| 指标 | 改前 | 改后 |
|---|---|---|
| 可切换单位 | 14 个片段 | 2 处修改 |
| 显示行数 | 24 行 | 5 行 |
| 取消一半的可能 | 有（写出病句） | 不可能 |
| 整章对比 | 全文铺开 | 折叠 + 上下文 |

### 新增判据（DESIGN.md §二 10）

**交互单位必须是用户能独立判断的语义单元。** 判据是：用户在这个单位上做的决定，
单独拿出来是完整的语义吗？如果需要「先看一眼旁边的单位才能决定」，粒度就错了。

### 已知局限

字级 LCS 在「山影 → 群山」这类改写上会保留中间的字，显示成 `[+群]山[-影]`，
读作「群山影」。正确但不够顺眼。彻底解决需要词级对齐（词典或语义清理），
成本远大于收益，暂不处理——它不影响写回的正确性。

### 验证

```
前端  vitest   179 passed (13 files，新增 22 个 diff 用例)
前端  vue-tsc  0 错误
前端  vite build 通过（2.05s）
```

视觉验证方式：用真实数据 + 项目实际 CSS 生成静态页，Chrome 无头截图逐项核对
（宽面板 / 330px 窄面板 / 取消勾选三种状态），修掉了「块首行自动换行时勾选框
垂直居中、看起来落在第二行」这个只有看截图才能发现的对齐问题。
