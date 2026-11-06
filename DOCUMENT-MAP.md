# 意笔（YiBi）文档导航

> 维护：本文是项目现存文档的**统一索引**。
> 2026-11-06 清理：已完成的 10 份计划书（REFACTOR / REBUILD ×6 / OPTIMIZATION / PLAN-DIFF / DECISIONS）已归档至
> `.workbuddy/archive/docs-2026-11-06/`，其结论均已落地进代码。恢复可从该目录取回。

---

## 一、长期有效（写代码前必读）

| 文档 | 是什么 |
|---|---|
| `README.md` | 项目介绍、特性、技术栈、数据存储布局、快捷键（对外入口） |
| `DESIGN.md` | **设计准则**：分层约定、判据、反模式。新增/重构代码必须沿用其约定 |
| `TEST-CHECKLIST-2026-11-02.md` | 手动回归清单（15 条），发版前逐条复验 |

## 二、历史记录（按需查阅，结论已落地）

| 文档 | 是什么 |
|---|---|
| `MODULE-AUDIT-2026-11-02.md` | 模块审计，债务清单的来源 |
| `DESIGN-REVIEW-OVERALL-2026-11-02.md` | 整体设计审查 |
| `REVIEW-2026-11-01.md` | 审查报告（Diff 链路、状态机问题来源） |
| `REVIEW-2026-08-15.md` | 最早期的审查报告 |

## 三、归档（已完成计划书）

`.workbuddy/archive/docs-2026-11-06/` 内 10 份，仅作追溯用，**不要按其内容继续施工**：

`REFACTOR-PLAN-2026-11-02` · `REBUILD-PLAN-2026-11-02` · `REBUILD-MODULE-file/editor/backup/ai` ·
`REBUILD-REVIEW-2026-11-03` · `OPTIMIZATION-PLAN-2026-11-04` · `PLAN-DIFF-2026-11-01` · `DECISIONS-2026-11-02`

---

## 四、验收标准（发版前四道闸门）

```bash
npm test              # vitest
npx vue-tsc --noEmit  # 类型检查
npm run build         # vite build
cd src-tauri && cargo test
```

**实测状态（2026-11-06）**：vitest 329/329 ✓ · vue-tsc 0 错误 ✓ · vite build ✓ · cargo test 31/31 ✓

## 五、已知遗留（暂不处理）

| 项 | 说明 |
|---|---|
| `chapter-order.json` | 章节顺序仍编码在文件名中，插章需重命名后续章节；用户明确「先不做」 |
| 月度用量视图 | 仅有今日用量账本，用户明确「先不做」 |
| 主包体积 757 kB | 单 chunk 超 500 kB 警告，未做代码分割；桌面应用本地加载，非阻塞 |
