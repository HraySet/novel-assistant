/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// 让本文件成为模块：下方对 vue 的类型增强才会"合并"而非"覆盖"原始声明
import type {} from "vue";

// Tauri 2 窗口拖拽属性
declare module "vue" {
  interface HTMLAttributes {
    "data-tauri-drag-region"?: string | boolean;
  }
}
