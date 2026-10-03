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
  renamed?: boolean  // 名字是用户手打的：自动命名不再改口
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
/** 名字分五本账：三类节点各一本，编辑 / 延长出来的视频各一本（和从谁改出来的无关）。 */
export type NameKind = NodeKind | 'edit' | 'extend'
export const NAME_OF: Record<NameKind, string> = { ...KIND_NAME, edit: '编辑视频', extend: '延长视频' }
/**
 * 画布上按类型从 1 开始编号：视频节点1、视频节点2……
 * 名字就是它当素材时的名字（name 和 assetName 一直是同一个），两处不分家 ——
 * 画布上叫「视频节点1」、面板里却叫另一个名字，等于同一段视频有两个称呼。
 *
 * 号由 store 自己数（见 seq / claimName），不去现有的名字里找最大号（§4.1）：
 * 用户把「视频节点3」改叫「客厅沙发」之后，那个 3 就不在画布上了 ——
 * 照名字数的话下一个还叫视频节点3，两段视频的编号于是对不上它们出生的先后。
 * 删掉也不回退：编号是用来区分的，不是一份连号的清单。
 */
export const seqOf = (nodes: CNode[]): Record<NameKind, number> => {
  const seq = { text: 0, image: 0, video: 0, edit: 0, extend: 0 }
  for (const n of nodes) {
    const name = String(n.data.name ?? '')
    for (const k of Object.keys(seq) as NameKind[]) {
      const hit = new RegExp(`^${NAME_OF[k]}(\\d+)$`).exec(name)
      if (hit) seq[k] = Math.max(seq[k], Number(hit[1]))
    }
  }
  return seq
}

/**
 * 从一段视频截出来的那张图叫什么：「首帧：视频节点1」—— 说清它是谁的哪一帧。
 * 同一段视频截第二张就往下数「· 2」，和操作节点那套（opName）是同一个规矩：
 * 名字里带着来源，画布上隔着几步也看得出这张图是从哪儿来的。
 */
export function shotName(nodes: CNode[], label: string, source: CNode) {
  const head = `${label}：${String(source.data.name ?? '')}`
  for (let n = 1; ; n++) {
    const name = n > 1 ? `${head} · ${n}` : head
    if (!nodes.some((x) => String(x.data.name ?? '') === name)) return name
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
export const boxFor = (ratio: number) => ({
  width: Math.round(Math.sqrt(NODE_AREA * ratio)),
  height: Math.round(Math.sqrt(NODE_AREA / ratio)),
})
/**
 * 空视频节点的形状：横屏。
 * 它没有素材可量，所以没人会来替它改形状 —— 这个比例就是它最终的样子，
 * 不是一个等着被纠正的猜测。摆成竖的等于替将来那段视频先认了个朝向；
 * 一个还没有画面的框子，横着更像「一块还没放东西的屏」，也和它右边那排图片节点同一个走向。
 */
export const EMPTY_VIDEO_RATIO = 16 / 9
const EMPTY_VIDEO_W = boxFor(EMPTY_VIDEO_RATIO).width
/**
 * 新节点先按多宽摆。视频分两档：
 * 有素材的按竖屏猜（这块画布上的视频多数是竖的，猜错也只是短暂地窄一下，封面一量就改过来）；
 * 空的按横屏，理由见 EMPTY_VIDEO_RATIO —— 那不是猜测，是它就长那样。
 */
export const widthOf = (kind: NodeKind, empty = false) =>
  kind === 'video' ? (empty ? EMPTY_VIDEO_W : VIDEO_NODE_W) : NODE_W
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
/**
 * 专注态那块屏具体多宽，看源片是横是竖 —— 和普通节点同一条规矩（见 boxFor：面积恒定），
 * 只是面积大一档。横竖都写死 420 会把横片亏掉一大截：
 * 一段 9:16 的竖片在 420 宽上是 420×747、31 万像素的一块画布，
 * 同一个 420 摆一段 16:9 的横片只剩 420×236、9.9 万 —— 同样是「在画面上圈准一小块」，
 * 横片上难了三倍，而横片本来就是横着看的，不该在这块屏上被竖着的那一档框住。
 *
 * 面积就取竖片那一档（420×747）：竖片一个像素都不动，横片长成 747×420。
 * 下限还是 420 —— 比 9:16 更窄的片子按面积算会瘦到 400 以下，那是往回走；
 * 上限 760 —— 再宽的超宽片（21:9 往上）会把整个节点连同它下面那块面板顶出一屏，
 * 那时宁可让它矮一点。缺比例（封面还没量出来）就按竖片算，和从前一样。
 */
const FOCUS_AREA = (FOCUS_NODE_W * FOCUS_NODE_W) / (9 / 16)
const FOCUS_MAX_W = 760
export const focusWidthFor = (ratio?: number) =>
  Math.min(FOCUS_MAX_W, Math.max(FOCUS_NODE_W,
    Math.round(Math.sqrt(FOCUS_AREA * (ratio && ratio > 0 ? ratio : 9 / 16)))))
/** 连着截好几帧时，下一张落在上一张下面多远：一个图片节点（200 高 + 标题栏）再留一道缝 */
const SHOT_GAP = 250
/** 同一个源视频派生第二个子节点时，下一个落在上一个下面留的那道缝 */
const DOWN_GAP = 70
/**
 * 派生出来的节点落在源节点右边多远：从源节点的**右边**起算，留这么一道缝。
 * 不能写成「源节点 x + 360」那样的一个数 —— 视频节点的宽度由素材比例定（200 到 356 都有），
 * 按左边界算，源是横片时那道缝只剩几个像素，新节点直接压在隔壁身上。
 */
const NEXT_GAP = 160
const rightOf = (n: CNode) => n.position.x + (Number(n.style?.width) || VIDEO_NODE_W) + NEXT_GAP
/**
 * 这个节点的下沿在哪儿。量过就用量出来的（专注态那块屏比普通节点高一大截），
 * 没量过按它那个比例推一个 —— 写死一个数的话，竖片和专注态的节点都会被压在一起。
 */
const bottomOf = (n: CNode) => n.position.y + (n.measured?.height
  ?? (kindOf(n) === 'video' ? boxFor(Number(n.data.ratio) || EMPTY_VIDEO_RATIO).height : 200))
/**
 * 同一个源视频再派生一个子节点时，新的落在哪条线上：已经挂在它右边的那些节点之下。
 * 和截帧那一套（spawnShot）同一个规矩 —— 点两次「局部编辑」不该叠成一个。
 */
function belowKids(nodes: CNode[], edges: Edge[], source: CNode) {
  const taken = new Set(edges.filter((e) => e.source === source.id).map((e) => e.target))
  return nodes.reduce((y, n) => (taken.has(n.id) ? Math.max(y, bottomOf(n) + DOWN_GAP) : y), source.position.y)
}
/**
 * 跟着一批节点一起走的那些：快捷入口创建、还没出片的子节点（§3.2.1）。
 * 它自己没有画面，摆的是源节点那一段 —— 源节点没了，它连要改什么都指不出来。
 * 已经出过片的不在此列：那是一段独立的视频，删掉源视频不该把它也带走。
 */
function withFocusKids(nodes: CNode[], gone: Set<string>) {
  const out = new Set(gone)
  for (const n of nodes) {
    if (isFocusNode(n) && out.has(String(n.data.operationSource))) out.add(n.id)
  }
  return out
}

interface Snap { nodes: CNode[]; edges: Edge[] }

interface CanvasStore {
  nodes: CNode[]
  edges: Edge[]
  /** hover 联动：素材区 ↔ 画布共用同一个 id */
  hoverMat: string | null
  /**
   * 「全部版本」那只气泡开在哪个节点旁边（null = 没开）。
   *
   * 摆在这一层而不是节点自己的 state 里：它还管着那个节点底下那块生成面板收不收，
   * 而示例场景要能直接把它打开 —— 节点内部的 state 从外面摆不进去。
   */
  openVersions: string | null
  clipboard: Snap | null
  past: Snap[]
  future: Snap[]
  /** 五本名字账的当前号（见 seqOf）：只往上走，删节点不回退 */
  seq: Record<NameKind, number>

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
  /** 点右 ⊕（不拖）：紧挨着源节点右边新建一个空视频节点并连上 */
  spawnDownstream: (source: string, name?: string, width?: number) => string | null
  /** 截一帧：右侧长出一个图片节点，画面就是那一帧，并连回源视频 */
  spawnShot: (source: string, name: string, shot: string) => string | null
  /** 量出素材真实比例后把节点摆成那个形状（不进撤销栈） */
  shape: (id: string, ratio: number) => void
  setHoverMat: (id: string | null) => void
  setOpenVersions: (id: string | null) => void
  /** 发一个新号并占住它：视频节点1、编辑视频2…… */
  claimName: (kind: NameKind) => string
  setAll: (s: Snap) => void
}

const kindOf = (n: CNode) => (n.type || 'text') as NodeKind

export const useCanvas = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  hoverMat: null,
  openVersions: null,
  clipboard: null,
  past: [],
  future: [],
  seq: { text: 0, image: 0, video: 0, edit: 0, extend: 0 },

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
      const name = get().claimName(kindOf(n))
      // 粘贴出来的是一个新的独立节点：它不是谁的操作节点，名字也是新发的编号而不是手打的那个
      return { ...n, id, position, selected: true,
        data: { ...n.data, name, assetName: name, renamed: undefined, operationSource: undefined } }
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
    const name = get().claimName(kind)
    const node: CNode = {
      id, type: kind, position: pos, selected: true,
      style: { width: widthOf(kind, !data?.src) },
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
        return isFocusNode(n) && !isFocusNode(next)
          ? { ...next, style: { ...n.style, width: widthOf('video', !next.data.src) } } : next
      }),
    })),

  deleteSelection: () => {
    const { nodes, edges } = get()
    const delE = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    if (!gone.size && !delE.size) return
    get().snapshot()
    // 删掉的线里有通向还没出片的快捷入口子节点的，子节点跟着一起走（和 disconnect 同一条规矩）
    for (const e of edges) {
      if (!delE.has(e.id)) continue
      const kid = nodes.find((n) => n.id === e.target && isFocusNode(n) && n.data.operationSource === e.source)
      if (kid) gone.add(kid.id)
    }
    const delN = withFocusKids(nodes, gone)
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
    const { nodes, edges } = get()
    const cut = edges.find((e) => e.id === edgeId)
    if (!cut) return
    get().snapshot()
    /**
     * 剪断「源视频 → 还没出片的快捷入口子节点」这条线，子节点跟着一起走（§3.2.1）：
     * 它自己没有画面，摆的是源节点那一段 —— 线断了，它连要改什么都指不出来。
     * 和剪线这一下进同一个撤销快照：⌘Z 一次把线和节点一起接回来。
     */
    const kid = nodes.find((n) => n.id === cut.target && isFocusNode(n) && n.data.operationSource === cut.source)
    set({
      nodes: kid ? nodes.filter((n) => n.id !== kid.id) : nodes,
      edges: edges.filter((e) => e.id !== edgeId && (!kid || (e.source !== kid.id && e.target !== kid.id))),
    })
  },

  spawnDownstream: (source, named, width) => {
    const { nodes, edges } = get()
    const src = nodes.find((n) => n.id === source)
    if (!src) return null
    get().snapshot()
    const id = newId()
    // 操作节点带着自己的名字出生：先叫「视频节点12」再改口，等于让编号白走一趟
    const name = named ?? get().claimName('video')
    const y = belowKids(nodes, edges, src)
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), {
        id, type: 'video', position: { x: rightOf(src), y },
        selected: true, style: { width: width ?? widthOf('video', true) }, data: { name, assetName: name },
      }],
      edges: addEdge({ id: `e-${source}-${id}`, source, target: id, type: 'dashed' }, s.edges),
    }))
    return id
  },

  /**
   * 截帧：在源视频右边长出一个图片节点，画面就是刚截下的那一帧，并连回源视频 ——
   * 连线是这张图的来历，往后它当素材用时，「它是从哪段视频上取的」不用另记一笔。
   * 同一段视频连着截几张不叠在一起：已经截过的那些往下排，新的落在最下面那张之下。
   * 和 ⊕ 派生走同一条撤销栈：截错了一张，⌘Z 就能收回去。
   */
  spawnShot: (source, name, shot) => {
    const { nodes, edges } = get()
    const src = nodes.find((n) => n.id === source)
    if (!src) return null
    get().snapshot()
    const id = newId()
    const taken = new Set(edges.filter((e) => e.source === source).map((e) => e.target))
    const y = nodes.reduce((m, n) => (taken.has(n.id) ? Math.max(m, n.position.y + SHOT_GAP) : m), src.position.y)
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), {
        id, type: 'image', position: { x: rightOf(src), y },
        selected: true, style: { width: widthOf('image') },
        data: { name, assetName: name, src: shot, mediaReady: true },
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
  setOpenVersions: (id) => set({ openVersions: id }),
  claimName: (kind) => {
    const no = get().seq[kind] + 1
    set((s) => ({ seq: { ...s.seq, [kind]: no } }))
    return `${NAME_OF[kind]}${no}`
  },
  // 场景自己带着默认名进来（视频节点3、编辑视频1…）：从那儿接着往下数，别和已经摆着的撞号
  setAll: (s) => set({ nodes: s.nodes, edges: s.edges, past: [], future: [],
    hoverMat: null, openVersions: null, seq: seqOf(s.nodes) }),
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
