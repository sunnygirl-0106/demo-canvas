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
  ratio?: number     // 画面真实宽高比，量自封面；节点按它摆成横的还是竖的
  busy?: boolean     // 假生成中
  operationSource?: string  // 这个节点是从哪个视频节点的「编辑 / 延长」长出来的
  renamed?: boolean  // 名字是用户手打的：自动命名不再改口，往下派生也以它为根
}

export type CNode = Node<CanvasNodeData>

/**
 * 专注态：这个节点是从某个视频的「局部修改 / 延长视频」入口长出来的，且还没出片。
 * 出片那一刻 src 落上来，它自动变回普通视频节点 —— 「收回」不是一个要写的动作。
 */
export const isFocusNode = (n: CNode) => !!n.data.operationSource && !n.data.src

/** 专注态节点自己还没有画面，它摆的是父节点那一段。 */
export const focusSource = (nodes: CNode[], n: CNode) =>
  isFocusNode(n) ? nodes.find((p) => p.id === n.data.operationSource) ?? null : null

/** 节点 ID 为随机四个英文字母，引用始终绑定它，和显示出来的名字无关。 */
export const newId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)

export const KIND_NAME: Record<NodeKind, string> = { text: '文本节点', image: '图片节点', video: '视频节点' }
/**
 * 画布上按类型从 1 开始编号：视频节点1、视频节点2……
 * 名字就是它当素材时的名字（name 和 assetName 一直是同一个），两处不分家 ——
 * 画布上叫「视频节点1」、面板里却叫另一个名字，等于同一段视频有两个称呼。
 * 取「现有的最大号 + 1」而不是「个数 + 1」：删掉中间一个再新建，不会撞上还在的那个。
 */
export function nextName(nodes: CNode[], kind: NodeKind) {
  const re = new RegExp(`^${KIND_NAME[kind]}(\\d+)$`)
  const max = nodes.reduce((m, n) => {
    const hit = kindOf(n) === kind ? re.exec(String(n.data.name ?? '')) : null
    return hit ? Math.max(m, Number(hit[1])) : m
  }, 0)
  return `${KIND_NAME[kind]}${max + 1}`
}

/**
 * 两件事长出来的节点叫同一个名字：它们是同一个功能「局部修改视频」的两条路，
 * 名字说的是「这个节点是拿谁改出来的」，至于改的是画面里一块地方还是片尾接一段，
 * 标题栏右边那枚「编辑中 / 延长中」徽章说得比名字清楚。
 */
export const OP_NAME: Record<'edit' | 'extend', string> = { edit: '局部修改视频', extend: '局部修改视频' }
const OP_RE = new RegExp(`^(?:${[...new Set(Object.values(OP_NAME))].join('|')})：(.+?)(?: · (\\d+))?$`)

/**
 * 从一个自动名里读出「它其实是谁的第几手」：
 * 「局部修改视频：视频节点1」是视频节点1 的第 1 手，「局部修改视频：视频节点1 · 2」是第 2 手。
 * 读不出这个格式的（本来的编号名、用户手打的名字）就是根本身，从第 0 手算起。
 */
export function traceName(name: string) {
  const hit = OP_RE.exec(name)
  return hit ? { root: hit[1], step: Number(hit[2] ?? 1) } : { root: name, step: 0 }
}

/**
 * 「局部修改 / 延长视频」长出来的那个节点叫什么：「局部修改视频：视频节点1」。
 * 连着操作时只把手数往下数 —— 「局部修改视频：局部修改视频：视频节点1」念到第三层就读不下去了，
 * 所以写成「局部修改视频：视频节点1 · 2」，具体引用的是哪一条视频，连线和面板里的来源信息比名字说得准。
 * 根取源节点当下显示的名字：用户手动改过名字，新节点就跟着改后的那个走，从第一手重新数。
 * 名字被占了接着往下数：同一条视频编辑两次，两个节点不能同名。
 */
export function opName(nodes: CNode[], mode: 'edit' | 'extend', source: CNode, selfId?: string) {
  const shown = String(source.data.name ?? '')
  const { root, step } = source.data.renamed ? { root: shown, step: 0 } : traceName(shown)
  const head = `${OP_NAME[mode]}：${root}`
  const taken = (name: string) => nodes.some((n) => n.id !== selfId && String(n.data.name ?? '') === name)
  for (let n = step + 1; ; n++) {
    const name = n > 1 ? `${head} · ${n}` : head
    if (!taken(name)) return name
  }
}

const NODE_W = 320
/**
 * 视频节点按素材本来的比例摆：竖片是竖的，横片是横的，两边都不留黑。
 * 那么「多大」就不能再由宽度一个数说了算 —— 同样 200px 宽，竖片高 356、横片高 113，
 * 一张画布上两种视频一大一小。改成**面积恒定**：宽 = √(面积 × 比例)，高 = 宽 ÷ 比例。
 * 9:16 摆出 200×356，16:9 摆出 356×200，1:1 摆出 267×267 —— 三种朝向占的地方一样大，
 * 和 320×200 的图片节点也在同一个量级上。
 */
const NODE_AREA = 200 * 356
export const VIDEO_NODE_W = 200
/** 比例还没量出来之前先按竖屏摆：这块画布上的视频多数是竖的，猜错也只是短暂地窄一下 */
export const widthOf = (kind: NodeKind) => (kind === 'video' ? VIDEO_NODE_W : NODE_W)
export const boxFor = (ratio: number) => ({
  width: Math.round(Math.sqrt(NODE_AREA * ratio)),
  height: Math.round(Math.sqrt(NODE_AREA / ratio)),
})
/**
 * 专注态节点比普通节点大一大截：它不是画布上的又一枚缩略图，
 * 而是这段时间里用户唯一在看的那块屏 —— 要在上面看清画面、圈准一块地方、再拖一段时间。
 * 200px 里圈一张人脸，手一抖就是 32px 的误差；420px 上同样的手抖只有 15px。
 *
 * 宽度从 580 收下来，是因为这块屏改成按素材本来的比例摆了：一段 9:16 的竖屏在 580 宽上高到 1031px，
 * 一屏根本放不下。竖屏里真正能圈的面积反而比原来大 —— 原先那块 580×326 的 16:9 板子，
 * 竖片摆进去只占当中 183px 宽的一条，两边全是黑。
 * 落在 420 而不是更窄：画面下面那截轴压矮了近四成（见 app.css 的 .seg-card 一带），
 * 省出来的高度全给了画面 —— 整个节点没有长高，画面却从 676 长到 747。
 * 出片之后缩回 VIDEO_NODE_W —— 产出的视频和画布上别的视频节点长得一样。
 */
export const FOCUS_NODE_W = 420

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
  spawnDownstream: (source: string, name?: string, width?: number) => string | null
  /** 量出素材真实比例后把节点摆成那个形状（不进撤销栈） */
  shape: (id: string, ratio: number) => void
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
    // 一次粘贴好几个：每个都要避开前面刚排上号的那些，所以拿一份跟着长的名单去要号
    const pool = [...get().nodes]
    const nodes = clip.nodes.map((n) => {
      const id = newId()
      map.set(n.id, id)
      const position = at
        ? { x: at.x + (n.position.x - base.x), y: at.y + (n.position.y - base.y) }
        : { x: n.position.x + 40, y: n.position.y + 40 }
      const name = nextName(pool, kindOf(n))
      // 粘贴出来的是一个新的独立节点：它不是谁的操作节点，名字也是新发的编号而不是手打的那个
      const copy = { ...n, id, position, selected: true,
        data: { ...n.data, name, assetName: name, renamed: undefined, operationSource: undefined } }
      pool.push(copy)
      return copy
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
    const name = nextName(get().nodes, kind)
    const node: CNode = {
      id, type: kind, position: pos, selected: true,
      style: { width: widthOf(kind) },
      data: { name, assetName: name, ...data },
    }
    set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), node] }))
    return id
  },

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, data: { ...n.data, ...patch } }
        /**
         * 出片那一刻专注态结束，画面下面那半截控件跟着收走 ——
         * 当初为它们多要的那一截宽度也一起还回去：产出的视频和画布上别的视频节点长得一样，
         * 同一段画面不会因为它是从哪个入口长出来的而显示成另一个比例。
         */
        return isFocusNode(n) && !isFocusNode(next) ? { ...next, style: { ...n.style, width: VIDEO_NODE_W } } : next
      }),
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

  spawnDownstream: (source, named, width) => {
    const src = get().nodes.find((n) => n.id === source)
    if (!src) return null
    get().snapshot()
    const id = newId()
    // 操作节点带着自己的名字出生：先叫「视频节点12」再改口，等于让编号白走一趟
    const name = named ?? nextName(get().nodes, 'video')
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), {
        id, type: 'video', position: { x: src.position.x + 360, y: src.position.y },
        selected: true, style: { width: width ?? VIDEO_NODE_W }, data: { name, assetName: name },
      }],
      edges: addEdge({ id: `e-${source}-${id}`, source, target: id, type: 'dashed' }, s.edges),
    }))
    return id
  },

  /**
   * 量出这段视频的真实比例之后，把节点摆成那个形状。
   * 不进撤销栈 —— 这是「量出来的」，不是用户改的；⌘Z 回到上一步时不该把形状也一起倒回去。
   * 算出来和现在一样就原样返回，别让一次测量引出一轮重排、重排又引出一次测量。
   */
  shape: (id, ratio) => {
    if (!(ratio > 0)) return
    const width = boxFor(ratio).width
    const n = get().nodes.find((x) => x.id === id)
    if (!n || (n.style?.width === width && n.data.ratio === ratio)) return
    set((s) => ({
      nodes: s.nodes.map((x) => x.id === id
        ? { ...x, style: { ...x.style, width }, data: { ...x.data, ratio } } : x),
    }))
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
