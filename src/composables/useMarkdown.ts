/**
 * 轻量 Markdown → HTML 渲染，不依赖外部库。
 * 覆盖小说写作场景常见语法：粗体、斜体、标题、代码块、列表、分割线。
 */
export function renderMarkdown(text: string): string {
  // 先转义 HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块（``` ... ```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`
  })

  // 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 标题 # ## ###
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // 粗体 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体 *text*（不跟 * 连续的情况）
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')

  // 无序列表 - item
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')

  // 分割线 ---
  html = html.replace(/^---+$/gm, '<hr>')

  // 段落：双换行分割
  html = html.replace(/\n\n+/g, '</p><p>')
  html = `<p>${html}</p>`

  // 清理块级元素周围的空段落
  html = html.replace(/<p><(h[123]|pre|ul|hr)/g, '<$1')
  html = html.replace(/(\/h[123]>|\/pre>|\/ul>|\/hr>)<\/p>/g, '$1')
  html = html.replace(/<p><\/p>/g, '')

  return html
}
