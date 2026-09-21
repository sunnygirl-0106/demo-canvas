import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { useCanvas } from './canvas'
import type { TaskPayload } from '../generator/videoTask'

/**
 * 一条版本记录说的是「哪一幅画面，在哪个节点上产出，从谁派生来的」。
 * 只做归属，不做别的：节点怎么摆、画面现在还在不在，都由画布自己说。
 */
export interface VersionRecord {
  id: string                       // = taskId；补记的第一版用 nanoid
  no: number                       // 全局递增，显示为「版本 01」
  nodeId: string                   // 这一版挂在哪个节点上产出
  sourceNodeId: string | null      // 它是从哪个节点的画面派生来的
  baseNo: number | null            // 基于版本 NN
  createdAt: number
  media: { src: string; poster?: string; dur?: number }
  payload: TaskPayload | null      // 上传 / 示例带进来的原画面没有任务记录
}

/**
 * 这一版，在「正在看它的这个节点」的列表里读作什么。卡片副标题和筛选共用这一句。
 *
 * 分类说的是这幅画面和**当前这个节点**的关系，和节点叫什么名字无关：
 * 节点自己交出来的画面一律读作「生成」—— 不管做出它的是文生视频、参考生成，
 * 还是从上游点「局部修改 / 延长视频」进来的那一次任务。这个节点存在的意义就是产出它，
 * 所以叫「局部修改视频：视频节点1」的节点打开历史，默认亮起的仍是「生成」，它生成的都收在这里。
 * 「编辑」「延长」留给从它派生出去的那一层：那是拿我这幅画面做出来的东西，
 * 是编辑还是延长由那次任务的 mode 说，不由名字说。
 */
export type VersionRead = 'generate' | 'edit' | 'extend'
export const readsAs = (r: VersionRecord, nodeId: string): VersionRead =>
  r.nodeId === nodeId ? 'generate' : r.payload?.mode === 'extend' ? 'extend' : 'edit'

/**
 * 这个节点的「版本记录」：它自己承载过的，加上**直接**从它派生出去的那一层。
 * 孙辈的 sourceNodeId 指向的是它父辈所在的节点，条件本身就把层数限死了，
 * 不需要另写一条「只收一层」的规则。
 */
export const versionsOf = (records: VersionRecord[], nodeId: string) =>
  records.filter((r) => r.nodeId === nodeId || r.sourceNodeId === nodeId)
/** 这个节点当下这幅画面是哪一条记录留下的（最后一条挂在它上面的）。 */
export const heldBy = (records: VersionRecord[], nodeId: string) =>
  [...records].reverse().find((r) => r.nodeId === nodeId) ?? null

type RecordInput = Pick<VersionRecord, 'id' | 'nodeId' | 'sourceNodeId' | 'media' | 'payload'>

interface VersionStore {
  records: VersionRecord[]
  seq: number
  /** 有画面、却还没有任何一条记录承载过它 → 把它当下这幅画面补记成第一版。幂等。 */
  base: (nodeId: string) => void
  record: (input: RecordInput) => void
  reset: () => void
}

export const useVersions = create<VersionStore>((set, get) => ({
  records: [],
  seq: 0,

  base: (nodeId) => {
    if (heldBy(get().records, nodeId)) return
    const node = useCanvas.getState().nodes.find((n) => n.id === nodeId)
    const src = node?.data.src
    if (!src) return
    set((s) => ({
      seq: s.seq + 1,
      records: [...s.records, {
        id: nanoid(), no: s.seq + 1, nodeId, sourceNodeId: null, baseNo: null,
        createdAt: Date.now(), media: { src, poster: node.data.poster, dur: node.data.dur }, payload: null,
      }],
    }))
  },

  record: (input) => {
    // 派生自谁，就先保证谁的那幅原画面已经有了版本号 —— 否则「基于 版本 NN」无处可指
    const from = input.sourceNodeId ?? input.nodeId
    get().base(from)
    const baseNo = heldBy(get().records, from)?.no ?? null
    set((s) => ({
      seq: s.seq + 1,
      records: [...s.records, { ...input, no: s.seq + 1, baseNo, createdAt: Date.now() }],
    }))
  },

  reset: () => set({ records: [], seq: 0 }),
}))
