import { create } from 'zustand'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type XYPosition,
} from '@xyflow/react'
import { customAlphabet } from 'nanoid'

export type NodeKind = 'text' | 'image' | 'video'

export interface CanvasNodeData extends Record<string, unknown> {
  name: string
  assetName?: string
  mediaReady?: boolean
  mediaError?: string
  text?: string      // 文本节点内容
  src?: string       // 图片 / 视频源
  poster?: string    // 视频封面
  dur?: number       // 真实视频时长（秒）
  busy?: boolean     // 假生成中
}

export type CNode = Node<CanvasNodeData>

/** 资产名称为随机四个英文字母，引用始终绑定节点 ID。 */
export const newId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)

const NODE_W = 320

interface Snap { nodes: CNode[]; edges: Edge[] }

interface CanvasStore {
  nodes: CNode[]
  edges: Edge[]
  /** hover 联动：素材区 ↔ 画布共用同一个 id */
  hoverMat: string | null
  clipboard: Snap | null
  past: Snap[]
  future: Snap[]

  onNodesChange: (c: NodeChange<CNode>[]) => void
  onEdgesChange: (c: EdgeChange[]) => void
  onConnect: (c: Connection) => void

  snapshot: () => void
  undo: () => void
  redo: () => void
  copySelection: () => void
  paste: (at?: XYPosition) => void

  addNode: (kind: NodeKind, pos: XYPosition, data?: Partial<CanvasNodeData>) => string
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void
  deleteSelection: () => void
  connect: (source: string, target: string) => void
  /** 断开一条连线（悬浮到线上的小剪刀） */
  disconnect: (edgeId: string) => void
  /** 点右 ⊕（不拖）：右侧 360px 直接新建空视频节点并连上 */
  spawnDownstream: (source: string) => string | null
  setHoverMat: (id: string | null) => void
  setAll: (s: Snap) => void
}

const kindOf = (n: CNode) => (n.type || 'text') as NodeKind

export const useCanvas = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  hoverMat: null,
  clipboard: null,
  past: [],
  future: [],

  onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) }),
  onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
  onConnect: (c) => {
    if (!c.source || !c.target) return
    get().connect(c.source, c.target)
  },

  snapshot: () =>
    set((s) => ({
      past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-60),
      future: [],
    })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1]
      if (!prev) return s
      return {
        past: s.past.slice(0, -1),
        future: [{ nodes: s.nodes, edges: s.edges }, ...s.future].slice(0, 60),
        nodes: prev.nodes, edges: prev.edges,
      }
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0]
      if (!next) return s
      return {
        future: s.future.slice(1),
        past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-60),
        nodes: next.nodes, edges: next.edges,
      }
    }),

  copySelection: () => {
    const { nodes, edges } = get()
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) return
    const ids = new Set(sel.map((n) => n.id))
    set({ clipboard: { nodes: sel, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) } })
  },

  paste: (at) => {
    const clip = get().clipboard
    if (!clip?.nodes.length) return
    get().snapshot()
    const map = new Map<string, string>()
    const base = clip.nodes[0].position
    const nodes = clip.nodes.map((n) => {
      const id = newId()
      map.set(n.id, id)
      const position = at
        ? { x: at.x + (n.position.x - base.x), y: at.y + (n.position.y - base.y) }
        : { x: n.position.x + 40, y: n.position.y + 40 }
      return { ...n, id, position, selected: true, data: { ...n.data, name: id, assetName: id } }
    })
    const edges = clip.edges.map((e) => ({
      ...e,
      id: `e-${map.get(e.source)}-${map.get(e.target)}`,
      source: map.get(e.source)!, target: map.get(e.target)!,
    }))
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...nodes],
      edges: [...s.edges, ...edges],
    }))
  },

  addNode: (kind, pos, data) => {
    get().snapshot()
    const id = newId()
    const node: CNode = {
      id, type: kind, position: pos, selected: true,
      style: { width: NODE_W },
      data: { name: id, assetName: id, ...data },
    }
    set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), node] }))
    return id
  },

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    })),

  deleteSelection: () => {
    const { nodes, edges } = get()
    const delN = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const delE = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    if (!delN.size && !delE.size) return
    get().snapshot()
    set({
      nodes: nodes.filter((n) => !delN.has(n.id)),
      edges: edges.filter((e) => !delE.has(e.id) && !delN.has(e.source) && !delN.has(e.target)),
    })
  },

  connect: (source, target) => {
    const { nodes, edges } = get()
    if (!isValidConnection({ source, target, sourceHandle: 'out', targetHandle: 'in' }, nodes, edges)) return
    get().snapshot()
    set({ edges: addEdge({ id: `e-${source}-${target}`, source, target, type: 'dashed' }, edges) })
  },

  /**
   * 断开一条连线。和删除节点走同一条撤销栈 —— 剪错了一条线，⌘Z 就能接回来。
   * 只动这一条边：两头的节点、面板里的草稿都留着，
   * 素材从「本次输入」里退出去由 App 那一层跟着连接自己落位（syncConn）。
   */
  disconnect: (edgeId) => {
    const { edges } = get()
    if (!edges.some((e) => e.id === edgeId)) return
    get().snapshot()
    set({ edges: edges.filter((e) => e.id !== edgeId) })
  },

  spawnDownstream: (source) => {
    const src = get().nodes.find((n) => n.id === source)
    if (!src) return null
    get().snapshot()
    const id = newId()
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), {
        id, type: 'video', position: { x: src.position.x + 360, y: src.position.y },
        selected: true, style: { width: NODE_W }, data: { name: id, assetName: id },
      }],
      edges: addEdge({ id: `e-${source}-${id}`, source, target: id, type: 'dashed' }, s.edges),
    }))
    return id
  },

  setHoverMat: (id) => set({ hoverMat: id }),
  setAll: (s) => set({ nodes: s.nodes, edges: s.edges, past: [], future: [], hoverMat: null }),
}))

/** 只能连进视频 / 图片节点；不能自连、不能重复 */
export function isValidConnection(c: Connection | Edge, nodes: CNode[], edges: Edge[]) {
  if (!c.source || !c.target || c.source === c.target) return false
  const tgt = nodes.find((n) => n.id === c.target)
  if (!tgt || !nodes.some((n) => n.id === c.source)) return false
  if (kindOf(tgt) === 'text') return false
  return !edges.some((e) => e.source === c.source && e.target === c.target)
}

/** 上游素材，按连线先后 */
export function connOf(edges: Edge[], target: string) {
  return edges.filter((e) => e.target === target).map((e) => e.source)
}
