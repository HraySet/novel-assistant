/**
 * 项目会话：进入 / 离开一个项目时的域状态编排。
 *
 * 为什么单独存在：项目切换要同时处理 4 个 store 的状态（文件、统计、检测、对话），
 * 旧实现把这些初始化散落在 App.vue 与 useProjectOperations 里各写一遍，
 * 结果谁也没清 fileStore 的标签——切项目后编辑器还显示上一个项目的章节，
 * Ctrl+S 撞上路径沙箱报错，标签持久化还会把旧路径写进新项目的 key。
 *
 * 依赖方向：composables → stores（合法）；不要反向让 store 依赖本模块。
 */
import { useChatStore } from '../stores/chat'
import { useDetectionStore } from '../stores/detection'
import { useFileStore } from '../stores/file'
import { useStatsStore } from '../stores/stats'

export function useProjectSession() {
  const fileStore = useFileStore()
  const statsStore = useStatsStore()
  const detectionStore = useDetectionStore()
  const chatStore = useChatStore()

  /**
   * 进入项目：先把上一个项目遗留的域状态清干净，再加载新项目。
   * 调用方随后应 `loadTree` 并 `restoreOpenTabs`。
   */
  async function enterProject(root: string): Promise<void> {
    // 文件域：标签 / 活动文件 / 树 / 选区 / 撤销历史目标 / 内容提供者
    fileStore.resetForProject(root)
    // 检测域：先清空再载入，避免上一个项目「待确认的人物变化」串到新项目
    detectionStore.setProjectRoot('')
    detectionStore.setProjectRoot(root)
    // 统计域：内部会先落盘旧项目再读新项目
    await statsStore.init(root)
    // 对话域：按项目重新加载会话索引
    await chatStore.loadConversations(root)
  }

  /** 离开项目（回到项目库）：清空域状态，并把统计数据落盘 */
  async function leaveProject(): Promise<void> {
    statsStore.flushPersist()
    await chatStore.flushSave()
    fileStore.resetForProject('')
    detectionStore.setProjectRoot('')
  }

  return { enterProject, leaveProject }}
