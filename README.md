# 砚砚

AI 小说写作助手 — 本地优先、数据自持的写作工具。写小说、记灵感、AI 辅助、统计码字，一个应用全搞定。

## 特性

- 📁 **章节管理**：文件树管理章节，自然排序（第1章 < 第2章 < 第10章），支持拖拽、收藏、重命名
- ✍️ **沉浸编辑器**：CodeMirror 6，打字机模式、聚焦行、字号调节、查找替换
- 🤖 **AI 辅助**：续写 / 润色 / 扩写 / 检查，支持 OpenAI / Claude / DeepSeek，流式输出 + 前后对比
- 📊 **写作统计**：今日字数、目标进度、连续天数、码字日历、写作计时（今日累计，跨重启保留）
- 💾 **自动备份**：每次保存自动备份（保留 20 份），可查看历史版本并一键恢复
- 📤 **导出**：合并导出 Markdown / 纯文本
- 🎨 **主题**：11 套深浅色主题预设

## 技术栈

- Tauri 2（Rust 后端）
- Vue 3 + Pinia + TypeScript
- CodeMirror 6
- Tailwind CSS

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev

# 打包
npm run tauri build
```

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+S` | 保存 |
| `Ctrl+F` | 查找 |
| `Ctrl+H` | 替换 |
| `Ctrl+B` | 切换文件树 |
| `Ctrl+J` | 切换 AI 面板 |
| `Ctrl+P` | 搜索文件 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+Shift+A` | 全屏 AI 对话 |
| `Esc` | 关闭弹窗 |

## 数据存储

所有数据保存在本地项目文件夹内：

- 章节文件：`.md` 文件
- 写作统计：`.stats/stats.json`
- 自动备份：`.backups/`
- 聊天记录：`.chatlog/`
- 应用配置：系统应用数据目录下的 `config.json`

## License

MIT
