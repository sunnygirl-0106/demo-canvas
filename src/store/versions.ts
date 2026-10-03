import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { boxFor, EMPTY_VIDEO_RATIO, useCanvas } from './canvas'
import type { Seg } from '../generator/promptDoc'
import type { Mode, Model } from '../generator/materialLayout'

/**
 * 这一版是怎么做出来的 —— 版本面板念得出来的那几样，别的一概不留。
 * 整份提交记录（TaskPayload）里绝大半是「这次送进模型的素材清单」，版本面板一个字都用不上，
 * 存着只是让同一份数据在两个地方各有一份。
 */
export interface VersionTask {
  mode: Mode
  model: Model
  /**
   * 提交那一刻的句子，连标签一起。详情页和「复制」都拿它现念（docText）——
   * 存成一串死文字的话，原视频改了名，历史里那一句就还在叫旧名字（§4.1）。
   */
  doc: Seg[]
  params: { resolution: string; duration: number; ratio: string; sound: boolean }
  sourceId: string | null
  direction: 'before' | 'after' | null
}

/**
 * 一条版本记录说的是「哪一幅画面，在哪个节点上产出，从谁派生来的」。
 * 只做归属，不做别的：节点怎么摆、画面现在还在不在，都由画布自己说。
 */
export interface VersionRecord {
  id: string                       // = taskId；补记的第一版用 nanoid
  no: number                       // 这个节点上的第几版，显示为 V1、V2
  nodeId: string                   // 这一版挂在哪个节点上产出
  /**
   * 产出它的那个节点当时叫什么。列表里优先读节点当下的名字（用户改了名，历史也跟着改口），
   * 节点被删掉之后就只剩这一份 —— 没有它，一版画面在列表里就没名字可叫。
   */
  name: string
  sourceNodeId: string | null      // 它是从哪个节点的画面派生来的
  baseNo: number | null            // 基于版本 NN
  createdAt: number
  media: { src: string; poster?: string; dur?: number }
  task: VersionTask | null         // 上传 / 示例带进来的原画面没有任务记录
  /**
   * 这一版是「添加到画布」从哪一条记录抄过来的（§4.1）。
   * 抄出来的那一版沿用原版本的类型、提示词和来源，可它不是源视频又做了一次衍生 ——
   * 所以它不进源视频的编辑 / 延长分类里，否则点一次「添加到画布」上游就凭空多一张卡。
   */
  copiedFrom?: string
}

/**
 * 这个节点的「版本记录」：它自己承载过的，加上**直接**从它派生出去的那一层。
 *
 * 每个衍生节点只收它第一次以本节点为源视频成功生成的那一版（§4.2）：
 * 下游原地重新生成是它自己那条视频的事 —— 每重做一次就让上游多一张卡、计数跟着加一，
 * 上游这一屏就变成了下游的版本历史。所以同一个衍生节点只留最早那一条。
 *
 * 只收一层：孙辈的 sourceNodeId 指向的是它父辈所在的节点，条件本身就把层数限死了。
 */
export const versionsOf = (records: VersionRecord[], nodeId: string) => {
  const first = new Map<string, VersionRecord>()
  for (const r of records) {
    if (r.nodeId === nodeId || r.sourceNodeId !== nodeId || r.copiedFrom) continue
    const seen = first.get(r.nodeId)
    if (!seen || r.createdAt < seen.createdAt) first.set(r.nodeId, r)
  }
  const keep = new Set([...first.values()].map((r) => r.id))
  return records.filter((r) => r.nodeId === nodeId || keep.has(r.id))
}
/** 这个节点当下这幅画面是哪一条记录留下的（最后一条挂在它上面的）。 */
export const heldBy = (records: VersionRecord[], nodeId: string) =>
  [...records].reverse().find((r) => r.nodeId === nodeId) ?? null
/**
 * 「全部版本」那一屏的次序：画布上现在显示的那一版排头，接着是本视频的其余版本，
 * 最后才是从它做出来的那些衍生视频；每一组里新的在前。
 *
 * 打开这一屏的人，手上拿着的是节点上那幅画面 —— 第一张卡片就该是它，
 * 其余的按「刚做的最可能还想看」往下排。当下这一版通常也正是最新的一版，
 * 排头这一句于是多数时候不改变什么；写出来是因为这是规则，不是碰巧。
 */
export function versionGroups(records: VersionRecord[], nodeId: string) {
  const mine = versionsOf(records, nodeId)
  const held = heldBy(records, nodeId)
  // versionsOf 的结果本来就是时间先后，倒过来即新的在前
  const rest = mine.filter((r) => r.nodeId === nodeId && r.id !== held?.id).reverse()
  return {
    own: held ? [held, ...rest] : rest,
    derived: mine.filter((r) => r.nodeId !== nodeId).reverse(),
  }
}

type RecordInput = Pick<VersionRecord, 'id' | 'nodeId' | 'sourceNodeId' | 'baseNo' | 'media' | 'task'>

interface VersionStore {
  records: VersionRecord[]
  /** 有画面、却还没有任何一条记录承载过它 → 把它当下这幅画面补记成第一版。幂等。 */
  base: (nodeId: string) => void
  /** 这个节点眼下显示的是第几版。衍生视频的「基于 V几」在**提交那一刻**就读这一句。 */
  baseNoOf: (nodeId: string) => number | null
  record: (input: RecordInput) => void
  /**
   * 「添加到画布」：这一版在所属节点下方摆成一个新节点，记为它的 V1，类型沿用原版本（§4.1）。
   * 不连线 —— 它是同一层的另一个版本，不是谁的下游产物。
   */
  addToCanvas: (recordId: string) => void
  /** 示例场景直接摆一屏版本历史。no 按每个节点出现的先后发号。 */
  seed: (rows: Omit<VersionRecord, 'no'>[]) => void
  reset: () => void
}

export const useVersions = create<VersionStore>((set, get) => ({
  records: [],

  base: (nodeId) => {
    if (heldBy(get().records, nodeId)) return
    const node = useCanvas.getState().nodes.find((n) => n.id === nodeId)
    const src = node?.data.src
    if (!src) return
    set((s) => ({
      records: [...s.records, {
        id: nanoid(), no: s.records.filter((r) => r.nodeId === nodeId).length + 1,
        nodeId, name: String(node.data.name ?? ''), sourceNodeId: null, baseNo: null,
        createdAt: Date.now(), media: { src, poster: node.data.poster, dur: node.data.dur }, task: null,
      }],
    }))
  },

  // 派生自谁，就先保证谁的那幅原画面已经有了版本号 —— 否则「基于 版本 NN」无处可指
  baseNoOf: (nodeId) => {
    get().base(nodeId)
    return heldBy(get().records, nodeId)?.no ?? null
  },

  record: (input) => {
    // 这个节点自己原先那幅画面（上传进来的、示例带进来的）也该有个 V1，不然新的一版会占掉 V1
    get().base(input.nodeId)
    const name = String(useCanvas.getState().nodes.find((n) => n.id === input.nodeId)?.data.name ?? '')
    set((s) => ({
      records: [...s.records, { ...input, name, createdAt: Date.now(),
        no: s.records.filter((r) => r.nodeId === input.nodeId).length + 1 }],
    }))
  },

  addToCanvas: (recordId) => {
    const from = get().records.find((r) => r.id === recordId)
    if (!from) return
    const canvas = useCanvas.getState()
    const host = canvas.nodes.find((n) => n.id === from.nodeId)
    if (!host) return
    /**
     * 落在所属节点**下方**，按它量出来的高度留一道缝 —— 写死一个偏移量的话，
     * 一段竖片（高 356）下面那个新节点会压在它身上。
     */
    const height = host.measured?.height ?? boxFor(Number(host.data.ratio) || EMPTY_VIDEO_RATIO).height
    const id = canvas.addNode('video', { x: host.position.x, y: host.position.y + height + 70 },
      { ...from.media, mediaReady: true })
    const name = String(useCanvas.getState().nodes.find((n) => n.id === id)?.data.name ?? '')
    set((s) => ({
      records: [...s.records, {
        id: nanoid(), no: 1, nodeId: id, name,
        sourceNodeId: from.sourceNodeId, baseNo: from.baseNo, copiedFrom: from.id,
        createdAt: Date.now(), media: { ...from.media }, task: from.task,
      }],
    }))
  },

  seed: (rows) => {
    const no: Record<string, number> = {}
    set({
      records: [...rows].sort((a, b) => a.createdAt - b.createdAt)
        .map((r) => ({ ...r, no: (no[r.nodeId] = (no[r.nodeId] ?? 0) + 1) })),
    })
  },

  reset: () => set({ records: [] }),
}))
