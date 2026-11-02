# 清笔设计准则

> 这份文档回答一个问题：**在这个代码库里，什么算好设计。**
> 每条判据都配了本项目的真实正例/反例，不是通用套话。

---

## 一、分层与依赖方向

```
┌─ components/ · App.vue ────────── 视图与交互，可以读 store，不写业务规则
├─ composables/ ────────────────── 有状态的编排：串起 store / api / 平台能力
├─ stores/ ─────────────────────── 领域状态（Pinia setup store），一域一个
├─ core/ ───────────────────────── 纯函数：无 store、无 api、无 Vue 依赖
└─ api/files.ts → Rust commands ── IO 边界，唯一跨进程出口
```

**规则：依赖只能向下。** `core/` 不许 import store 或 api——一旦允许，纯函数就变成了"需要初始化才能跑"的东西，测试成本陡增。

这条规则直接改写了我最初的计划：原本打算把「项目开合生命周期」放进 `core/project.ts`，但它必须调用 4 个 store，属于编排而非纯逻辑——正确的家是 `composables/useProjectSession.ts`。判断标准很简单：**能不能在没有 Pinia、没有 Tauri 的 node 环境里直接跑测试**。能，就是 core。

## 二、六条判据

### 1. 单一真源（Single Source of Truth）

同一个决策只允许存在一处。**判据：改动这个规则时，需要改几个文件？超过一个就有问题。**

- ✅ `core/tree.ts` 的 `TREE_POLICIES`：正文/导出/设定/浏览分别要哪些文件，一处定义
- ❌ 重构前的 5 处遍历：`App.orderedFiles`、`useAiContext.orderedChapters`、`detection.collectRecentChapters`、`useExport.collectFilePaths`、`SearchModal.collectFiles`——规则各写一遍，其中导出那份漏了「排除角色/大纲」，代价是交付物里混进设定文件
- ❌ `KEYRING_SERVICE = "yanyan"`：项目改名后服务名留在原处，成为隐性单点

### 2. 纯函数优先

能写成纯函数的，绝不做成有状态的方法。纯函数可以直接测、可以随便调用、不会因为调用顺序出错。

- ✅ `computeDiff` / `mergeDiffLines` / `walkFiles` / `remapPath`
- ❌ `DiffView.computeMerged`：合并逻辑内嵌在组件里，零测试覆盖，结果三个 P0 全藏在这里；抽出成 `mergeDiffLines` 后 14 个用例当天就抓出了换行 bug 和 CRLF 改写

### 3. 策略数据化，而不是复制 if-else

差异用**数据**表达，不用**代码分叉**表达。

```ts
// ✅ 好：差异是一张表
export const TREE_POLICIES = {
  chapters:   { includeDirs: false, extensions: ['.md','.txt'], excludeDirs: ['角色','大纲'], ... },
  exportable: { ...同 chapters },   // 显式声明"导出==正文"，让这个等式可被断言
  settings:   { ... },
  allFiles:   { ... },
}

// ❌ 差：差异是五份各自 if 的循环
for (const n of nodes) { if (n.isDir) ... else if (/\.(md|txt)$/.test(n.name)) ... }
```

判据：**新增一个场景时，是加一行数据，还是再抄一段循环？**

### 4. 边界显式，失败关闭

- ✅ `resolve_within` 越界一律 `Err`，目标不存在时回溯父目录校验——宁可拒绝，不猜
- ✅ `replaceRange` 用 `expectedOriginal` 校验选区仍为原文，不符合就放弃
- ❌ `applyToSelection` 失败后 `if (!ok) return` 静默返回：用户点了「应用」什么都不发生，也没有提示。**静默失败的代价是用户以为成功了**

### 5. 副作用有唯一入口

写盘、删除、重命名这类动作，全部经 `api/` → Rust 命令；路径迁移全部经 `remapPath`。

- ✅ Rust 侧所有命令过 `resolve_within`，写盘走「备份 → 临时文件 → rename」
- ❌ `renamePath` / `deletePath` / `movePath` 三处各写一套路径改写：move 有前缀映射，另外两个只有精确匹配 → 目录重命名后子文件标签失联

### 6. 可测试性是设计质量的度量

**"这段逻辑好不好测"和"这段逻辑设计好不好"高度相关。** 测不了通常意味着耦合太紧或职责不清。

- `api/files.ts` 是 `invoke` 的薄封装 → 可以用 `vi.mock` 整体替掉，不需要真文件系统
- 纯函数模块 → node 环境直接跑，一个用例毫秒级
- 反过来：`App.vue` 里的 mtime 轮询、关窗守卫，只能靠手动清单验证——这就是它们应该被抽成 composable 的信号

## 三、`core/` 现在有什么

| 文件 | 职责 | 不允许做的事 |
|---|---|---|
| `paths.ts` | 路径规范化、风格感知拼接、边界判断、子树重映射 | 不读文件、不碰 store |
| `tree.ts` | 唯一遍历实现 + 具名策略 + 统一 `TreeEntry` | 不排序（树已排好）、不读文件内容 |

**关于路径的两条硬约束**（踩过坑，写进注释了）：
1. `normalize()` 只用于比较与展示，**不要拿它的结果去调 IPC**；
2. `joinPath()` 保持父路径的分隔符风格——Rust 返回的路径用反斜杠，手工拼的若用正斜杠，同一条目会出现两个字符串形态，`findNode` / `isFileOpen` 这类按字符串比较的逻辑会静默失效。

## 四、反模式清单（本项目出现过，避免复发）

| 反模式 | 后果 | 正确做法 |
|---|---|---|
| 组件内常驻实例 + `onMounted` 单次加载 | 切章后历史版本仍显示旧章备份，恢复写错文件 | 监听 `[show, target]` 变化重载，或 `v-if` 重建 |
| 用 `join('\n')` 拼非行粒度数据 | 正文被逐片段折断 | 连接符跟随数据粒度 |
| 形参收下却不使用（`streamChat` 的 `apiKey`） | 换服务商/双模型时串 Key | 依赖显式传入，或在签名里删掉 |
| 同步命令做重 IO（`scan_mentions`） | 主线程阻塞、UI 卡顿 | `async fn` + `spawn_blocking`（`list_dir` 是对的） |
| 遍历时"顺手"改了一份过滤规则 | 导出混入设定文件 | 遍历只走 `walkFiles` |
| 全部失败路径都 `catch {}` | 用户不知道发生了什么 | 关键动作失败必须有 toast |

## 五、评审五问（改代码前自问）

1. 这个规则**只在一处**定义吗？改动要碰几个文件？
2. 这段逻辑**能在 node 里直接测**吗？不能的话，是耦合问题还是合理的外部依赖？
3. 差异是用**数据**表达，还是又抄了一遍循环？
4. **失败时用户知道吗**？静默返回会不会让人误以为成功？
5. 我有没有把 `core/` 的东西写进 store 依赖，或者把编排逻辑塞进纯函数模块？
