import { ref, computed } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useBooksStore } from "../stores/books";

export function useSettingsForm() {
  const store = useSettingsStore();
  const booksStore = useBooksStore();

  const darkPresets = computed(() => store.colorPresets.filter((p) => p.dark));
  const lightPresets = computed(() => store.colorPresets.filter((p) => !p.dark));

  const aiProviders = [
    { key: "openai" as const, label: "OpenAI" },
    { key: "claude" as const, label: "Claude" },
    { key: "deepseek" as const, label: "DeepSeek" },
  ];

  const testing = ref(false);
  const fetching = ref(false);
  const testResult = ref("");
  const testOk = ref(false);
  const modelList = ref<string[]>([]);

  async function testConnection() {
    testing.value = true;
    testResult.value = "";
    try {
      const url = `${store.aiEndpoint}/models`;
      const res = await fetch(url, {
        headers: store.aiProvider === "claude"
          ? { "x-api-key": store.aiApiKey, "anthropic-version": "2023-06-01" }
          : { Authorization: `Bearer ${store.aiApiKey}` },
      });
      testOk.value = res.ok;
      testResult.value = res.ok ? "连接成功" : `错误 ${res.status}`;
    } catch {
      testOk.value = false;
      testResult.value = "连接失败";
    }
    testing.value = false;
  }

  async function fetchModels() {
    fetching.value = true;
    try {
      const url = `${store.aiEndpoint}/models`;
      const res = await fetch(url, {
        headers: store.aiProvider === "claude"
          ? { "x-api-key": store.aiApiKey, "anthropic-version": "2023-06-01" }
          : { Authorization: `Bearer ${store.aiApiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        modelList.value = (data.data || [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => !id.includes("whisper") && !id.includes("tts") && !id.includes("dall"))
          .slice(0, 15);
      }
    } catch { /* silent */ }
    fetching.value = false;
  }

  const wordTargetPreset = ref(4000);
  const customTarget = ref("");

  function setWordTarget(n: number) { wordTargetPreset.value = n; }
  function setCustomTarget() {
    const v = parseInt(customTarget.value) || 0;
    if (v > 0) setWordTarget(v);
    customTarget.value = "";
  }

  const fontSize = computed(() => store.editorFontSize);
  function setFontSize(s: string) { store.setEditorFontSize(s); }

  async function pickFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({ directory: true, multiple: false, title: "选择工作区目录" });
      if (chosen) {
        const path = typeof chosen === "string" ? chosen : String(chosen);
        await booksStore.initWorkspace(path);
      }
    } catch { /* non-Tauri env */ }
  }

  return {
    darkPresets, lightPresets, aiProviders,
    testing, fetching, testResult, testOk, modelList,
    testConnection, fetchModels,
    wordTargetPreset, customTarget, setWordTarget, setCustomTarget,
    fontSize, setFontSize, pickFolder,
  };
}
