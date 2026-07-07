import type { Character, OutlineNode, Chapter } from "../stores/novel";

export interface ChatAction {
  type: string;
  label: string;
  payload: Record<string, unknown>;
}

/**
 * 解析 AI 回复中的结构化建议。
 *
 * 支持的标记格式（AI 在回复中用以下标记包裹可操作内容）：
 *   【续写】...内容...     → 在章节末尾追加
 *   【润色】...内容...     → 替换选中文本或追加
 *   【角色名】             → 分析/更新已有角色
 *   【新角色：名字】       → 建议创建新角色
 *   【大纲建议】           → 建议添加大纲节点
 */
export function parseActions(
  reply: string,
  characters: Character[],
  outlines: OutlineNode[]
): ChatAction[] {
  const actions: ChatAction[] = [];

  // 【续写】...内容...
  const continueRe = /【续写】([\s\S]*?)(?=【|$)/g;
  let m: RegExpExecArray | null;
  while ((m = continueRe.exec(reply)) !== null) {
    const text = m[1].trim();
    if (text) {
      actions.push({
        type: "chapter_continue",
        label: `续写 (${text.slice(0, 30)}…)`,
        payload: { text },
      });
    }
  }

  // 【润色】...内容...
  const polishRe = /【润色】([\s\S]*?)(?=【|$)/g;
  while ((m = polishRe.exec(reply)) !== null) {
    const text = m[1].trim();
    if (text) {
      actions.push({
        type: "chapter_polish",
        label: `润色 (${text.slice(0, 30)}…)`,
        payload: { text },
      });
    }
  }

  // 【角色名】— 分析已有角色
  for (const ch of characters) {
    const charRe = new RegExp(`【${escapeRegex(ch.name)}】([\\s\\S]*?)(?=【|$)`, "g");
    while ((m = charRe.exec(reply)) !== null) {
      const body = m[1].trim();
      if (body) {
        // 尝试提取各字段
        const personality = extractField(body, "性格");
        const appearance = extractField(body, "外貌");
        const notes = extractField(body, "备注");
        const newRole = extractField(body, "定位");
        actions.push({
          type: "character_update",
          label: `更新角色「${ch.name}」`,
          payload: {
            id: ch.id,
            name: ch.name,
            role: newRole || ch.role,
            personality: personality || "",
            appearance: appearance || "",
            notes: notes || "",
          },
        });
      }
    }
  }

  // 【新角色：名字】
  const newCharRe = /【新角色[：:]([^】]+)】([\s\S]*?)(?=【|$)/g;
  while ((m = newCharRe.exec(reply)) !== null) {
    const name = m[1].trim();
    const body = m[2].trim();
    if (name && body) {
      actions.push({
        type: "character_create",
        label: `创建角色「${name}」`,
        payload: {
          name,
          role: extractField(body, "定位") || "配角",
          personality: extractField(body, "性格") || body,
          appearance: extractField(body, "外貌") || "",
          notes: extractField(body, "备注") || "",
        },
      });
    }
  }

  // 【大纲建议】
  const outlineRe = /【大纲建议】([\s\S]*?)(?=【|$)/g;
  while ((m = outlineRe.exec(reply)) !== null) {
    const body = m[1].trim();
    if (body) {
      actions.push({
        type: "outline_add",
        label: "添加大纲建议",
        payload: {
          title: extractField(body, "标题") || "新章节",
          summary: extractField(body, "摘要") || body,
          parentTitle: extractField(body, "所属卷") || undefined,
        },
      });
    }
  }

  return actions;
}

/** 辅助：从文本中提取「字段名：值」或「字段名：值」 */
function extractField(text: string, field: string): string {
  const re = new RegExp(`${escapeRegex(field)}[：:]\\s*(.+?)(?:\\n|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 应用 AI 建议到 store 状态。
 * 返回 undo 信息（用于撤销），如果操作不可撤销则返回 null。
 */
export function applyAction(
  act: ChatAction,
  getStore: () => {
    chapters: Chapter[];
    characters: Character[];
    outlines: OutlineNode[];
    updateChapterContent: (id: string, content: string) => void;
    addCharacter: (c: Omit<Character, "id">) => void;
    addOutlineNode: (n: Omit<OutlineNode, "id" | "sortOrder">) => void;
    chapterUpdateSignal: { value: number };
  }
): { undo: () => void; description: string } | null {
  const store = getStore();

  switch (act.type) {
    case "chapter_continue": {
      const chapter = store.chapters.find(
        (c) => c.id === (act.payload.chapterId as string)
      );
      if (!chapter) return null;
      const oldContent = chapter.content;
      const newContent =
        oldContent + "\n" + (act.payload.text as string);
      store.updateChapterContent(chapter.id, newContent);
      store.chapterUpdateSignal.value++;
      return {
        description: "续写内容已添加",
        undo: () => {
          const ch = store.chapters.find((c) => c.id === chapter.id);
          if (ch) {
            ch.content = oldContent;
            store.chapterUpdateSignal.value++;
          }
        },
      };
    }

    case "chapter_polish": {
      const chapter = store.chapters.find(
        (c) => c.id === (act.payload.chapterId as string)
      );
      if (!chapter) return null;
      const oldContent = chapter.content;
      store.updateChapterContent(
        chapter.id,
        act.payload.text as string
      );
      store.chapterUpdateSignal.value++;
      return {
        description: "润色内容已应用",
        undo: () => {
          const ch = store.chapters.find((c) => c.id === chapter.id);
          if (ch) {
            ch.content = oldContent;
            store.chapterUpdateSignal.value++;
          }
        },
      };
    }

    case "character_update": {
      const char = store.characters.find(
        (c) => c.id === (act.payload.id as string)
      );
      if (!char) return null;
      const old = { ...char };
      Object.assign(char, act.payload);
      return {
        description: `角色「${char.name}」已更新`,
        undo: () => {
          const c = store.characters.find((ch) => ch.id === old.id);
          if (c) Object.assign(c, old);
        },
      };
    }

    case "character_create": {
      store.addCharacter({
        name: act.payload.name as string,
        role: act.payload.role as string,
        personality: act.payload.personality as string,
        appearance: act.payload.appearance as string,
        notes: act.payload.notes as string,
      });
      const newId = store.characters[store.characters.length - 1]?.id;
      return {
        description: `角色「${act.payload.name}」已创建`,
        undo: () => {
          if (newId) {
            const idx = store.characters.findIndex((c) => c.id === newId);
            if (idx >= 0) store.characters.splice(idx, 1);
          }
        },
      };
    }

    case "outline_add": {
      let parentId: string | null = null;
      if (act.payload.parentTitle) {
        const parent = store.outlines.find(
          (o) => o.title === (act.payload.parentTitle as string)
        );
        if (parent) parentId = parent.id;
      }
      store.addOutlineNode({
        parentId,
        title: (act.payload.title as string) || "新章节",
        summary: (act.payload.summary as string) || "",
        goal: "",
        keyEvents: [],
        characterRefs: [],
        foreshadowIn: "",
        foreshadowOut: "",
      });
      // 捕获新节点的精确 ID，避免撤销时误删其他节点
      const newNodeId = store.outlines[store.outlines.length - 1]?.id;
      return {
        description: "大纲节点已添加",
        undo: () => {
          if (newNodeId) {
            const idx = store.outlines.findIndex((o) => o.id === newNodeId);
            if (idx >= 0) store.outlines.splice(idx, 1);
          }
        },
      };
    }

    default:
      return null;
  }
}
