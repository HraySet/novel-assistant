<template>
  <div class="flex flex-col h-full">
    <EmptyState v-if="!booksStore.workspaceStatus.initialized"
      :icon="FolderOutline" title="还未设置工作区" subtitle="先在设置中选择一个目录" />
    <EmptyState v-else-if="!booksStore.currentBookId"
      :icon="BookOutline" title="还没有作品" subtitle="点击左上角书图标创建" />
    <EmptyState v-else-if="!store.currentChapterId"
      :icon="ChatbubblesOutline" title="请先选择一个章节" subtitle="在左侧大纲中点击章节开始对话" />

    <!-- === Active Chat === -->
    <template v-else>
      <SectionHeader :icon="ChatbubblesOutline" label="AI 对话" :count="messages.length">
        <template #actions>
          <span v-if="loading" class="w-1.5 h-1.5 rounded-full animate-pulse" :style="{ backgroundColor: settings.accentColor }" />
          <button v-if="undoStack.length" class="text-[10px] px-2 py-1 rounded transition-colors"
            :style="{ color: 'var(--text-tertiary)' }" @click="undo">↩ 回滚</button>
          <button v-if="messages.length" class="text-[10px] px-2 py-1 rounded transition-colors"
            :style="{ color: 'var(--text-tertiary)' }" @click="clearChat">清空</button>
        </template>
      </SectionHeader>

      <!-- Messages -->
      <div ref="msgList" class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <!-- Empty messages state -->
        <div v-if="messages.length === 0 && !loading" class="flex flex-col items-center justify-center py-12 gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl" :class="tx('bg-white/5', 'bg-black/5')">💬</div>
          <p :class="tx('text-gray-500', 'text-gray-400')" class="text-xs text-center">和 AI 聊聊你的小说</p>
        </div>

        <template v-for="(msg, i) in messages" :key="i">
          <!-- User: right-aligned -->
          <div v-if="msg.role === 'user'" class="flex items-start gap-2.5">
            <div class="flex-1" />
            <div class="max-w-[80%]">
              <div class="rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed" :style="{ backgroundColor: settings.accentColor, color: '#fff' }">
                {{ msg.content }}
              </div>
            </div>
            <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" :style="{ backgroundColor: settings.accentColor + '15' }">
              <span class="text-[10px] font-medium" :style="{ color: settings.accentColor }">我</span>
            </div>
          </div>

          <!-- AI: left-aligned -->
          <div v-else class="flex items-start gap-2.5">
            <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" :style="{ backgroundColor: settings.accentColor + '15' }">
              <span class="text-[10px] font-bold" :style="{ color: settings.accentColor }">AI</span>
            </div>
            <div class="max-w-[80%]">
              <div :class="tx('bg-slate-800 text-gray-300', 'bg-gray-100 text-gray-700')"
                class="rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed">
                <span v-if="streaming && !msg.content" class="flex items-center gap-1.5 text-gray-500 text-xs">
                  思考中<span class="inline-flex gap-0.5"><span class="w-1 h-1 rounded-full animate-bounce" :style="{ backgroundColor: settings.accentColor }" style="animation-delay:0ms"></span><span class="w-1 h-1 rounded-full animate-bounce" :style="{ backgroundColor: settings.accentColor }" style="animation-delay:150ms"></span><span class="w-1 h-1 rounded-full animate-bounce" :style="{ backgroundColor: settings.accentColor }" style="animation-delay:300ms"></span></span>
                </span>
                <span v-else>{{ msg.content }}<span v-if="streaming" class="inline-block w-1.5 h-4 animate-pulse align-middle ml-0.5 rounded-sm" :style="{ backgroundColor: settings.accentColor }"></span></span>
              </div>

              <!-- Action buttons -->
              <div v-if="msg.role === 'assistant' && msg.actions?.length && !streaming" class="mt-1.5 space-y-1">
                <button v-for="(act, ai) in msg.actions" :key="ai"
                  class="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all text-left group"
                  :class="tx('hover:bg-white/5', 'hover:bg-black/5')"
                  :style="{ color: settings.accentColor }"
                  @click="onApplyAction(act)">
                  <span class="flex-1 truncate">{{ act.label }}</span>
                  <span class="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">应用</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Feedback toast -->
        <div v-if="feedbackShow" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all duration-300"
          :class="feedbackOk ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'">
          {{ feedbackMsg }}
        </div>
      </div>

      <!-- Input area -->
      <div class="shrink-0 px-4 pb-3 pt-2 border-t" :class="tx('border-white/[0.08]', 'border-black/[0.08]')">
        <!-- Quick commands -->
        <div class="flex gap-1 mb-2 flex-wrap">
          <button v-for="q in quickCommands" :key="q.label" class="px-2.5 py-1 rounded-lg text-[10px] transition-colors"
            :class="tx('bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10', 'bg-black/5 text-gray-500 hover:text-gray-700 hover:bg-black/10')"
            @click="onQuickCommand(q)">{{ q.label }}</button>
        </div>
        <div class="flex gap-2 items-end">
          <textarea v-model="input"
            :class="tx('bg-white/5 border-white/[0.08] text-gray-200 placeholder:text-gray-600', 'bg-black/5 border-black/[0.08] text-gray-700 placeholder:text-gray-400')"
            class="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-inset"
            :style="{ '--tw-ring-color': settings.accentColor }"
            rows="1" :placeholder="store.currentChapterId ? '输入消息...' : '请先选择章节'"
            :disabled="loading || !store.currentChapterId"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
            ref="inputEl"></textarea>
          <button class="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0"
            :class="!input.trim() || loading
              ? tx('bg-white/5 text-gray-600', 'bg-black/5 text-gray-400')
              : ''"
            :style="!input.trim() || loading ? {} : { backgroundColor: settings.accentColor, color: '#fff' }"
            :disabled="!input.trim() || loading" @click="send">
            <n-icon size="16"><send-outline /></n-icon>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { NIcon } from "naive-ui";
import { SendOutline, ChatbubblesOutline, FolderOutline, BookOutline } from "@vicons/ionicons5";
import { useNovelStore } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { useBooksStore } from "../stores/books";
import { assembleContext } from "./ContextAssembler";
import { parseActions, applyAction, type ChatAction } from "./ChatActions";
import EmptyState from "./EmptyState.vue";
import SectionHeader from "./SectionHeader.vue";

const store = useNovelStore();
const settings = useSettingsStore();
const booksStore = useBooksStore();

const tx = (d: string, l: string) => settings.themeDark ? d : l;

const messages = ref<{ role: "user" | "assistant"; content: string; actions?: ChatAction[] }[]>([]);
const input = ref("");
const loading = ref(false);
const msgList = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const undoStack = ref<{ undo: () => void; description: string }[]>([]);
const abortController = ref<AbortController | null>(null);
const feedbackShow = ref(false);
const feedbackOk = ref(false);
const feedbackMsg = ref("");
const streaming = computed(() => loading.value);

const STORAGE_KEY = "chat_quick_commands";

const defaultCommands = [
  { label: "续写一段", prompt: "请根据当前章节内容续写一到两段" },
  { label: "评价本章", prompt: "请评价这一章写得怎么样" },
  { label: "角色对话", prompt: "帮我写一段角色间的对话" },
  { label: "场景描写", prompt: "帮我写一段场景描写" },
  { label: "改进建议", prompt: "请给出这一章的具体改进建议" },
];

let savedCommands: { label: string; prompt: string }[] | null = null;
try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) savedCommands = JSON.parse(raw); } catch {}
const quickCommands = ref<{ label: string; prompt: string }[]>(savedCommands || defaultCommands);

function saveQuickCommands() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quickCommands.value));
}

watch(() => store.chatAutoOpen, (v) => {
  if (v && store.chatQuote) { input.value = store.chatQuote; store.clearChatQuote(); }
});

watch(() => store.currentChapterId, async (newId, oldId) => {
  if (abortController.value) { abortController.value.abort(); abortController.value = null; }
  // Save old history, load new
  if (oldId) store.saveChatHistory(oldId, messages.value);
  if (newId) {
    const history = await store.loadChatHistory(newId);
    messages.value = history ?? [];
    undoStack.value = [];
  }
  scrollBottom();
});

// Load initial history
(async () => {
  const initId = store.currentChapterId;
  if (initId) {
    const history = await store.loadChatHistory(initId);
    if (history) messages.value = history;
  }
})();

function autoResize() {
  nextTick(() => {
    const el = inputEl.value;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  });
}

function scrollBottom() {
  nextTick(() => {
    if (msgList.value) msgList.value.scrollTop = msgList.value.scrollHeight;
  });
}

function clearChat() {
  messages.value = [];
  undoStack.value = [];
  const chId = store.currentChapterId;
  if (chId) store.saveChatHistory(chId, []);
}

function showFeedback(ok: boolean, msg: string) {
  feedbackOk.value = ok;
  feedbackMsg.value = msg;
  feedbackShow.value = true;
  setTimeout(() => { feedbackShow.value = false; }, 2000);
}

function onQuickCommand(q: { label: string; prompt: string }) {
  input.value = q.prompt;
  send();
}

async function send() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  const ch = store.chapters.find(c => c.id === store.currentChapterId);
  if (!ch) return;

  messages.value.push({ role: "user", content: text });
  input.value = "";
  autoResize();
  scrollBottom();
  const chId = store.currentChapterId!;
  store.saveChatHistory(chId, messages.value);

  const ctx = assembleContext(ch, store.characters, store.outlines);

  messages.value.push({ role: "assistant", content: "" });
  const assistantIdx = messages.value.length - 1;
  loading.value = true;

  try {
    const provider = settings.aiProvider;
    const apiKey = settings.aiApiKey;
    const model = settings.aiModel;
    const endpoint = settings.aiEndpoint;
    if (!apiKey) throw new Error("请先在设置中配置 API Key");

    const isClaude = provider === "claude";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isClaude) { headers["x-api-key"] = apiKey; headers["anthropic-version"] = "2023-06-01"; }
    else { headers["Authorization"] = `Bearer ${apiKey}`; }

    const body: any = { model, stream: true, messages: [{ role: "system", content: ctx.fullPrompt }, ...messages.value.filter(m => m !== messages.value[assistantIdx]).map(m => ({ role: m.role, content: m.content }))] };
    if (isClaude) { body.max_tokens = 4096; body.system = ctx.fullPrompt; body.messages = body.messages.filter((m: any) => m.role !== "system"); }

    const controller = new AbortController();
    abortController.value = controller;
    const res = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) { const err = await res.text(); throw new Error("API错误 " + res.status + ": " + err); }
    if (!res.body) throw new Error("响应体为空");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "", buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim(); if (!t || !t.startsWith("data:")) continue;
        const d = t.slice(5).trim(); if (d === "[DONE]") continue;
        try { const j = JSON.parse(d); let tok = ""; if (isClaude) { if (j.type === "content_block_delta") tok = j.delta?.text ?? ""; else if (j.type === "content_block_start") tok = j.content_block?.text ?? ""; } else tok = j.choices?.[0]?.delta?.content ?? ""; if (tok) { fullContent += tok; messages.value[assistantIdx].content = fullContent; scrollBottom(); } } catch {}
      }
    }
    if (fullContent) { messages.value[assistantIdx].actions = parseActions(fullContent, store.characters, store.outlines); }
    else { messages.value.splice(assistantIdx, 1); }
    store.saveChatHistory(chId, messages.value);
  } catch (err: any) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (!messages.value[assistantIdx]?.content) messages.value.splice(assistantIdx, 1);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      if (messages.value[assistantIdx]?.content) messages.value[assistantIdx].content += "\n\n❌ " + msg;
      else messages.value[assistantIdx] = { role: "assistant", content: "❌ " + msg };
    }
    scrollBottom();
  } finally { loading.value = false; abortController.value = null; }
}

function onApplyAction(act: ChatAction) {
  doApply(act);
}

function doApply(act: ChatAction) {
  const result = applyAction(act, () => ({
    chapters: store.chapters, characters: store.characters, outlines: store.outlines,
    updateChapterContent: store.updateChapterContent, addCharacter: store.addCharacter,
    addOutlineNode: store.addOutlineNode,
    chapterUpdateSignal: store.chapterUpdateSignal as unknown as { value: number },
  }));
  if (result) {
    undoStack.value.push(result);
    showFeedback(true, "已应用 · " + result.description);
    store.saveChatHistory(store.currentChapterId!, messages.value);
  }
}
function undo() {
  const action = undoStack.value.pop();
  if (action) { action.undo(); showFeedback(true, "已撤销"); store.saveChatHistory(store.currentChapterId!, messages.value); }
}

onUnmounted(() => { if (abortController.value) abortController.value.abort(); });
</script>
