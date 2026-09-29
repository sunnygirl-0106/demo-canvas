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
  payload: TaskPayload | null      // 上传 / 示例带进来的原画面没有任务记录
}

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
  /** 有画面、却还没有任何一条记录承载过它 → 把它当下这幅画面补记成第一版。幂等。 */
  base: (nodeId: string) => void
  record: (input: RecordInput) => void
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
        createdAt: Date.now(), media: { src, poster: node.data.poster, dur: node.data.dur }, payload: null,
      }],
    }))
  },

  record: (input) => {
    // 派生自谁，就先保证谁的那幅原画面已经有了版本号 —— 否则「基于 版本 NN」无处可指
    const from = input.sourceNodeId ?? input.nodeId
    get().base(from)
    const baseNo = heldBy(get().records, from)?.no ?? null
    const name = String(useCanvas.getState().nodes.find((n) => n.id === input.nodeId)?.data.name ?? '')
    set((s) => ({
      records: [...s.records, { ...input, name, baseNo, createdAt: Date.now(),
        no: s.records.filter((r) => r.nodeId === input.nodeId).length + 1 }],
    }))
  },

  reset: () => set({ records: [] }),
}))
