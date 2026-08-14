/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["attribute", "data-theme"], // 用 data-theme 而不是 class 切换主题
  content: ["./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 背景
        "bg-page": "var(--color-bg-page)",
        "bg-surface": "var(--color-bg-surface)",
        "bg-surface-hover": "var(--color-bg-surface-hover)",
        "bg-elevated": "var(--color-bg-elevated)",

        // 边框
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",

        // 文字
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        "text-on-accent": "var(--color-text-on-accent)",

        // 强调色
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "accent-bg": "var(--color-accent-bg)",
        "accent-border": "var(--color-accent-border)",

        // 语义色
        success: "var(--color-success)",
        "success-bg": "var(--color-success-bg)",
        danger: "var(--color-danger)",
        "danger-bg": "var(--color-danger-bg)",
        warning: "var(--color-warning)",
        "warning-bg": "var(--color-warning-bg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        voice: ["var(--font-voice)"], // 编辑器正文用 font-voice
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        popover: "var(--shadow-popover)",
      },
      width: {
        sidebar: "var(--width-sidebar)",
        "ai-panel": "var(--width-ai-panel)",
      },
    },
  },
  plugins: [],
};

/*
  用法示例（组件里只写语义类名，不写具体颜色值）：

  文件树容器：
    <div class="w-sidebar bg-bg-surface border-r border-border text-text-secondary">

  当前打开文件高亮：
    <div class="bg-accent-bg text-accent rounded-sm">

  正文编辑器：
    <div class="bg-bg-page text-text-primary font-voice text-[16px] leading-relaxed">

  保存状态：
    <span class="text-success">已保存 ✓</span>
    <span class="text-warning">●</span>

  以后新增主题（比如"柔粉调"）：
    1. 复制 theme-warm-paper.css，改名 theme-soft-coral.css，
       选择器改成 [data-theme="soft-coral"]，改颜色值
    2. 引入这份新 css 文件
    3. 切换主题：document.documentElement.setAttribute('data-theme', 'soft-coral')
    组件代码完全不用动，因为组件只认 bg-accent、text-primary 这些语义类名。
*/
