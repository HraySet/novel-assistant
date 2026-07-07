import type { Chapter, Character, OutlineNode } from "../stores/novel";

export interface AssembledContext {
  chapterTitle: string;
  outlineSummary: string;
  volumeContext: string;
  relatedCharacters: Pick<Character, "id" | "name" | "role" | "personality" | "appearance" | "notes">[];
  previousChapterSummaries: string[];
  existingContent: string;
  fullPrompt: string;
}

export function assembleContext(
  chapter: Chapter,
  characters: Character[],
  outlines: OutlineNode[],
  maxPrevChapters = 2
): AssembledContext {
  const currentOutline = outlines.find((o) => o.id === chapter.outlineId);
  const prevSummaries = collectPreviousSummaries(chapter, outlines, maxPrevChapters);
  const existingContent = (chapter.content || "").replace(/<[^>]*>/g, "");

  // Smart character selection: only include characters referenced by this chapter
  const involvedCharIds = currentOutline?.characterRefs ?? [];
  const involvedChars = involvedCharIds.length
    ? characters.filter((c) => involvedCharIds.includes(c.id))
    : characters;

  const allChars = involvedChars.map((c) => ({
    id: c.id, name: c.name, role: c.role,
    personality: c.personality, appearance: c.appearance, notes: c.notes,
  }));

  const fullPrompt = buildPrompt(chapter, currentOutline ?? null, outlines, allChars, existingContent, prevSummaries);

  return {
    chapterTitle: chapter.title,
    outlineSummary: currentOutline?.summary ?? "",
    volumeContext: getVolumeTitle(currentOutline, outlines),
    relatedCharacters: allChars,
    previousChapterSummaries: prevSummaries,
    existingContent,
    fullPrompt,
  };
}

function collectPreviousSummaries(chapter: Chapter, outlines: OutlineNode[], maxCount: number): string[] {
  const currentOutline = outlines.find((o) => o.id === chapter.outlineId);
  if (!currentOutline?.parentId) return [];
  const siblings = outlines.filter((o) => o.parentId === currentOutline.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIdx = siblings.findIndex((o) => o.id === currentOutline.id);
  if (currentIdx <= 0) return [];
  const result: string[] = [];
  for (let i = Math.max(0, currentIdx - maxCount); i < currentIdx; i++) {
    const o = siblings[i];
    if (o.summary) result.push(`${o.title}: ${o.summary}`);
  }
  return result;
}

function getVolumeTitle(outline: OutlineNode | null | undefined, outlines: OutlineNode[]): string {
  if (!outline?.parentId) return "";
  const parent = outlines.find((o) => o.id === outline.parentId);
  return parent?.title ?? "";
}

function buildPrompt(
  chapter: Chapter, currentOutline: OutlineNode | null,
  _allOutlines: OutlineNode[],
  characters: Pick<Character, "id" | "name" | "role" | "personality" | "appearance" | "notes">[],
  existingContent: string, prevSummaries: string[]
): string {
  const volumeTitle = getVolumeTitle(currentOutline, _allOutlines);
  const recapBlock = prevSummaries.length > 0
    ? prevSummaries.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
    : "  （故事刚开始，暂无前情）";

  const planBlock = currentOutline ? buildPlanBlock(currentOutline, characters) : "  （本章暂无详细规划）";

  const charBlock = characters.length > 0
    ? characters.map((c) => `- ${c.name}（${c.role}）：性格${c.personality || "未设定"}`).join("\n")
    : "（暂无角色信息）";

  return `【写作上下文】
=== 卷 ===
${volumeTitle || "无"}

=== 当前章节 ===
标题：${chapter.title}

=== 前情提要 ===
${recapBlock}

=== 本章规划 ===
${planBlock}

=== 涉及角色 ===
${charBlock}

=== 已有正文 ===
${existingContent ? existingContent.slice(0, 1500) + (existingContent.length > 1500 ? "\n…（已截断，总长 " + existingContent.length + " 字）" : "") : "（空白章节，准备开始创作）"}

---
请以专业网文编辑的身份，结合作者的写作上下文，给出有针对性的建议。
如果适合直接给出续写/润色/角色分析，请用以下标记格式：

【续写】直接写一段续写内容…
【润色】给出润色后的完整段落…
【角色名】分析与建议…
  - 性格：xxx
  - 外貌：xxx
  - 备注：xxx
【新角色：名字】
  - 定位：xxx
  - 性格：xxx
  - 外貌：xxx
  - 备注：xxx
【大纲建议】
  - 标题：xxx
  - 摘要：xxx

注意：每个建议单独一段，方便作者一键应用。`;
}

function buildPlanBlock(outline: OutlineNode, _characters: Pick<Character, "id" | "name" | "role" | "personality" | "appearance" | "notes">[]): string {
  const lines: string[] = [];
  if (outline.goal) lines.push(`  核心任务：${outline.goal}`);
  if (outline.summary) lines.push(`  内容摘要：${outline.summary}`);
  if (outline.keyEvents.length) {
    lines.push("  关键事件：");
    outline.keyEvents.forEach((ev) => lines.push(`    - ${ev}`));
  }
  if (outline.foreshadowIn) lines.push(`  本章新埋伏笔：${outline.foreshadowIn}`);
  if (outline.foreshadowOut) lines.push(`  本章回收伏笔：${outline.foreshadowOut}`);
  return lines.length ? lines.join("\n") : "  （暂无详细规划）";
}
