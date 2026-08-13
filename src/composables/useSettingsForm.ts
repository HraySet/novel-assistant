import { ref, computed } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useStatsStore } from "../stores/stats";
import { buildAiHeaders } from "./useAiApi";

export function useSettingsForm() {
  const store = useSettingsStore();
  const stats = useStatsStore();

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
      const res = await fetch(url, { headers: buildAiHeaders() });
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
      const res = await fetch(url, { headers: buildAiHeaders() });
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

  // 每日目标字数：直接绑定 stats store，编辑器底栏同步显示
  const wordTargetPreset = computed({
    get: () => stats.dailyGoal,
    set: (v: number) => stats.setDailyGoal(v),
  });
  const customTarget = ref("");

  function setWordTarget(n: number) { stats.setDailyGoal(n); }
  function setCustomTarget() {
    const v = parseInt(customTarget.value) || 0;
    if (v > 0) stats.setDailyGoal(v);
    customTarget.value = "";
  }

  const fontSize = computed(() => store.editorFontSize);
  function setFontSize(s: string) { store.setEditorFontSize(s); }

  return {
    testing, fetching, testResult, testOk, modelList,
    testConnection, fetchModels,
    wordTargetPreset, customTarget, setWordTarget, setCustomTarget,
    fontSize, setFontSize,
  };
}
