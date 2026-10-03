import type { Edge } from '@xyflow/react'
import { boxFor, focusWidthFor, KIND_NAME, NAME_OF, useCanvas, widthOf,
  type CanvasNodeData, type CNode, type NodeKind } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { useVersions, type VersionRecord, type VersionTask } from '../store/versions'
import { WALKTHROUGH_VIDEOS, FAKE_TEXT, matOf, MEDIA, SAMPLE_PHOTOS, PHOTO_ROLES, VID } from './assets'
import { allocate, emptySlots, FOCUS_MODEL, type MatGet, type Mode, type Model } from '../generator/materialLayout'
import { docText, marksOf, segKey, type Seg } from '../generator/promptDoc'
import type { MarkRegion, TimeRange } from '../generator/marks'

/** 名字留空：编号由 named() 在整份画布排好之后统一发 */
const node = (
  id: string, type: 'text' | 'image' | 'video',
  x: number, y: number, _name: string, data: Record<string, unknown> = {},
): CNode => ({ id, type, position: { x, y }, style: { width: widthOf(type, !data.src) }, data: { name: '', ...data } })

/**
 * 画布上的节点按类型从 1 开始编号：视频节点1、图片节点2……
 * 编号在最后统一发，按它们在画布上排出来的先后 —— 走查时报「视频节点3」，找的就是第三段。
 *
 * 走查画布上的视频与图片各自带名字（写明用途），编号只落到没名字的空态节点上；
 * 两种名字同屏摆着，才看得出长名字落到版本列表、来源信息、连线上各是什么样。
 * 编号仍旧照数不误 —— 跳过一个就会让「视频节点7」不再是第七段。
 */
const named = (nodes: CNode[]): CNode[] => {
  const seen: Partial<Record<NodeKind, number>> = {}
  return nodes.map((n) => {
    const kind = (n.type || 'text') as NodeKind
    const no = (seen[kind] = (seen[kind] ?? 0) + 1)
    const name = String(n.data.name || '') || `${KIND_NAME[kind]}${no}`
    return { ...n, data: { ...n.data, name, assetName: name } }
  })
}

const edge = (s: string, t: string): Edge => ({ id: `e-${s}-${t}`, source: s, target: t, type: 'dashed' })

const get: MatGet = (id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id))

/** 走查时弹在画布左上角的那张小卡：这个示例叫什么，以及该看到什么。 */
export interface SceneHint { title: string; checks: string[] }

/** 通过 ?scene=empty 进入空画布。 */
export function sceneEmpty() {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  useCanvas.getState().setAll({ nodes: [], edges: [] })
}

/**
 * 默认节点样例，也是走查用的画布：14 段视频 + 10 张图片 + 文本，每类末尾留一个空态。
 * 每个节点的名字就是它的用途（见 assets.ts 的 WALKTHROUGH_VIDEOS 与 PHOTO_ROLES），
 * 走查时按名字取用，不必先播一遍才知道这段是干什么的。
 *
 * 视频 14 段越过 Seedance 2.5 的 10 段额度；时长按最终规则铺开 ——
 * 1.5 / 2 / 3 秒在统一的 4 秒下限之下（终态），4.2 秒刚过下限，
 * 两段 8 秒合计 16 秒撞 2.0 系列与可灵 O1 的 15 秒合计上限，
 * 18 秒超 2.0 单段但切到 2.5 即恢复，32 秒连 2.5 的 30 秒也接不住。
 * 横版 5 段、竖版 9 段，每个时长档两种画幅都有。
 * 图片 10 张：前两张供首尾帧取用，第 9 张压在 9 张额度上沿，第 10 张越过该额度。
 *
 * 视频按各自的比例摆（横的横、竖的竖），竖排两列；图片和文本也是两列。往下滚就是下一批。
 */
/**
 * 每一区自己的排法。视频节点按素材本来的比例摆，横竖都有（竖片 200×356、横片 356×200），
 * 一套行列间距套在两种长相上，要么竖片上下叠在一起，要么横片左右撞上。
 * 所以视频区的格子按「最宽的那种 × 最高的那种」留：每格 420×430，节点靠左上角落位，
 * 横竖不一的边缘参差是「各按各的比例」本来就会有的样子，不去硬凑齐。
 * 图片和文本仍是固定的 320×200，行距用不着那么高。
 *
 * 两区的列距是同一个 420，于是整份画布只有 x=0 和 x=420 两列 —— 这不是巧合：
 * Canvas 的开场规则按列数分档（一两列的从顶部以 100% 打开往下滚，再多就缩成一屏全览）。
 * 视频区一旦排成三列，整块板子就被缩到 27% 塞进一屏，11 段视频缩成中间一小簇，
 * 一眼看过去像是没剩几段。改这里的 cols 之前先想清楚要的是哪种开场。
 */
interface Grid { cols: number; col: number; row: number }
const VIDEO_GRID: Grid = { cols: 2, col: 420, row: 430 }
const FLAT_GRID: Grid = { cols: 2, col: 420, row: 250 }
interface Spec { id: string; kind: 'text' | 'image' | 'video'; name: string; data?: Record<string, unknown> }
const seq = (n: number, prefix: string, make: (i: number) => Omit<Spec, 'id'>): Spec[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, ...make(i) }))

export function sceneShowcase() {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  /** 视频、图片、其他各占自己的行区，每区都从新的一行开始，各按各的行列间距排 */
  const lanes: { grid: Grid; items: Spec[] }[] = [
    { grid: VIDEO_GRID, items: WALKTHROUGH_VIDEOS.map((media, i) => ({
      id: `VC${String(i + 1).padStart(2, '0')}`, kind: 'video' as const, name: media.name, data: { ...media } })) },
    { grid: FLAT_GRID, items: seq(PHOTO_ROLES.length, 'IP', (i) => ({
      kind: 'image', name: PHOTO_ROLES[i],
      data: { src: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length], name: PHOTO_ROLES[i] } })) },
    { grid: FLAT_GRID, items: [
      { id: 'TX01', kind: 'text', name: '文本 · 场景描述', data: {
        text: '午后的阳光透过窗帘洒进客厅。\n镜头缓缓向前推进，掠过桌面与沙发。\n保持家具布局，换成温暖的电影色调。' } },
      { id: 'TX02', kind: 'text', name: '文本 · 对白片段', data: { text: FAKE_TEXT } },
      // 空态各留一个：新建节点长什么样，不用再手动加
      { id: 'VE01', kind: 'video', name: '视频 · 空态' },
      { id: 'IE01', kind: 'image', name: '图片 · 空态' },
      { id: 'TE01', kind: 'text', name: '文本 · 空态' },
    ] },
  ]
  const nodes: CNode[] = []
  // 行高一区一个值，所以按累计的 y 往下摞，不能拿「第几行 × 一个固定行高」算
  let y = 0
  for (const { grid, items } of lanes) {
    items.forEach((s, i) => nodes.push(
      node(s.id, s.kind, (i % grid.cols) * grid.col, y + Math.floor(i / grid.cols) * grid.row, s.name, s.data)))
    y += Math.ceil(items.length / grid.cols) * grid.row
  }
  useCanvas.getState().setAll({ nodes: named(nodes), edges: [] })
}

/* ────────────────────────────── 素材连接与模式 ──────────────────────────────
 * 每个示例＝一组已经连好的素材 ＋ 一个选中的生成节点，刷新即到达状态机上的某一格。
 * 判定全部交给 syncConn 现跑（模式落位 + 模型自动求解），示例本身不写死模式与落位 ——
 * 这样示例里看到的就是代码真实的落位，与《视频节点规则状态机》对不上的地方即是漏洞。
 * 只预设「用户此前选过的模型 / 此前已经连着的那几段」（画布上无从表达的那一半前提），其余一概不设。
 */
interface WireSpec {
  /** 走查时报的名字，也是 ?scene= 的取值 */
  title: string
  /** 状态机上对应的那一格 */
  expect: string
  /** 用户此前选过的模型；不写就是默认的 Seedance 2.5 */
  model?: Model
  /**
   * 「前 n 段素材早就连着了，用户当时选的是这个模型和这个模式」。
   * 直接写进生成器状态，不走「空节点首次接入」那条规则 —— 剩下的素材再一根一根连上，
   * 于是这个示例问的是「已经在做一件事的节点上再接一段素材会怎样」，而不是首次接入。
   */
  pre?: { model: Model; mode: Mode; n: number }
  sources: Spec[]
}
const ROW: Record<Spec['kind'], number> = { video: 420, image: 260, text: 260 }
const vid = (id: string, v: typeof VID[keyof typeof VID]): Spec => ({ id, kind: 'video', name: v.name, data: { ...v } })
const img = (id: string, i: number): Spec => ({ id, kind: 'image', name: PHOTO_ROLES[i],
  data: { src: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length], name: PHOTO_ROLES[i] } })
const txt = (id: string, name: string, text: string): Spec => ({ id, kind: 'text', name, data: { text } })

function wire(spec: WireSpec) {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  const nodes: CNode[] = []
  let y = 0
  for (const sc of spec.sources) { nodes.push(node(sc.id, sc.kind, 0, y, sc.name, sc.data)); y += ROW[sc.kind] }
  // 生成节点摆在这一列的竖向中点，四周留出连线的余量
  nodes.push({ ...node('TGT', 'video', 620, Math.max(0, y / 2 - 180), '', { name: `生成节点 · ${spec.title}` }), selected: true })
  useCanvas.getState().setAll({ nodes: named(nodes), edges: spec.sources.map((sc) => edge(sc.id, 'TGT')) })
  const gs = useGenerator.getState()
  // 模型是画布上表达不了的那一半前提，只好先按用户选过的那一个摆好；模式仍由落位规则自己算
  if (spec.model) gs.patch('TGT', { model: spec.model })
  const ids = spec.sources.map((sc) => sc.id)
  let from = 0
  if (spec.pre) {
    const head = ids.slice(0, spec.pre.n)
    gs.patch('TGT', { model: spec.pre.model, mode: spec.pre.mode, conn: head,
      ...allocate(emptySlots(), head, spec.pre.mode, get) })
    // 源视频那一份（sourceSrc / sourceId）由 sourceSync 自己补齐，它就在 syncSources 里
    gs.syncSources('TGT', get)
    from = spec.pre.n
  }
  // 连线次序就是落位次序：一根一根接上，和用户在画布上逐根连出来的结果一样
  for (let i = from; i < ids.length; i++) gs.syncConn('TGT', ids.slice(0, i + 1).filter((id) => !!get(id)), get)
}

/**
 * 常见且重要的那几格。连线次序就是落位次序 —— 数组里排第几就是第几个接进来的。
 * 走查按 `?scene=<键>` 直达，键名与状态机上的说法一致。
 */
export const WIRED: Record<string, WireSpec> = {
  edit1: { title: '第 1 段视频 → 编辑视频', expect: '视频 ① 占源视频席位，模式落 Seedance 2.5 编辑视频',
    sources: [vid('S1', VID.h5)] },
  ref2: { title: '第 2 段视频 → 全能参考', expect: '源视频身份解除；编辑 / 延长入口不灰，可手动切回',
    sources: [vid('S1', VID.h5), vid('S2', VID.v5)] },
  img1: { title: '空节点接入图片 → 全能参考', expect: '第 1、2 张图片都落 Seedance 2.5 全能参考，不再默认首尾帧',
    sources: [img('P1', 0), img('P2', 1)] },
  frames3: { title: '首尾帧席位已满，再接第 3 张图片',
    expect: '退回全能参考；首尾帧置灰「最多 2 张，当前已连接 3 张」。断开第 3 张再切回首尾帧，首帧 / 尾帧的分配恢复',
    pre: { model: 'sd2.5', mode: 'frames', n: 2 },
    sources: [img('P1', 0), img('P2', 1), img('P3', 2)] },
  'fresh-wan': { title: '空节点接入第一段视频（此前选的是 Wan 2.2）',
    expect: '首次接入一律切到 Seedance 2.5，落编辑视频 —— Wan 2.2 接不住视频',
    model: 'wan2.2', sources: [vid('S1', VID.h5)] },
  'text-src': { title: '文本节点 → 空视频节点', expect: '文本内容填进提示词框，模式仍是文生视频（文本不是素材）',
    sources: [txt('T1', '文本 · 场景描述',
      '午后的阳光透过窗帘洒进客厅。\n镜头缓缓向前推进，掠过桌面与沙发。\n保持家具布局，换成温暖的电影色调。')] },
  single: { title: '单段超上限 → 自动换型号',
    expect: '18 秒超 2.0 的 15 秒：自动换成收得下它的 Seedance 2.5，留在全能参考',
    pre: { model: 'sd2.0', mode: 'ref', n: 1 },
    sources: [img('P1', 0), vid('S1', VID.v18)] },
  total: { title: '合计超上限 → 自动换型号',
    expect: '两段各 8 秒合计 16 秒超 2.0：自动换 2.5（合计 ≤ 30 秒）',
    pre: { model: 'sd2.0', mode: 'ref', n: 1 },
    sources: [vid('S1', VID.h8), vid('S2', VID.v8)] },
  quota: { title: '数量超额度 → 自动换型号', expect: '第 10 张超 2.0 的 9 张：自动换 2.5（30 张）',
    pre: { model: 'sd2.0', mode: 'ref', n: 9 },
    sources: PHOTO_ROLES.map((_, i) => img(`P${i + 1}`, i)) },
  nokind: { title: '模型不收视频 → 自动换型号',
    expect: 'Wan 2.2 的参考图容纳不下视频：自动换 2.5，落全能参考（已有 1 张图，不算首次接入）',
    pre: { model: 'wan2.2', mode: 'refImage', n: 1 },
    sources: [img('P1', 2), vid('S1', VID.h5)] },
  short: { title: '低于 4 秒 · 全平台都收不下', expect: '换谁都接不住：落编辑视频，生成置灰，不提示换型号',
    sources: [vid('S1', VID.v3)] },
  ceil: { title: '单段超 30 秒 · 全平台都收不下', expect: '32 秒越过 2.5 的 30 秒：落编辑视频，由生成按钮拦',
    sources: [vid('S1', VID.h32)] },
  count: { title: '视频段数超 2.5 额度', expect: '11 段越过 2.5 的 10 段，且无更高额度的型号：由生成按钮拦',
    sources: Array.from({ length: 11 }, (_, i) => vid(`S${i + 1}`, VID.v4)) },
  refimg: { title: '参考图档', expect: '第 3 张之后仍是「参考图」，Tab 行上没有「全能参考」',
    pre: { model: 'wan2.2', mode: 'refImage', n: 2 },
    sources: [img('P1', 0), img('P2', 1), img('P3', 2)] },
  mixed: { title: '全能参考 · 图 ＋ 多段视频', expect: '2.5 下 3 图 ＋ 3 段视频合计 27.2 秒，在 30 秒之内',
    sources: [vid('S1', VID.h5), vid('S2', VID.v10), vid('S3', VID.h12), img('P1', 2), img('P2', 6)] },
}

/* ────────────────────────────── 版本与上下游 ──────────────────────────────
 * 版本归属（§4.2）靠的是一屏已经发生过的历史，画布上连几根线表达不出来 ——
 * 所以这一组示例直接把记录摆好，再按连线顺序逐根同步出面板状态，和用户一步步做出来的结果一样。
 */
interface VerMedia { src: string; poster: string; dur: number; ratio: number }
/** 这一组示例只用五段素材，名字与画幅一一对上（见本文件末尾各示例的 nodes） */
const VMEDIA = {
  sofa: { src: VID.h5.src, poster: VID.h5.poster, dur: VID.h5.dur, ratio: 16 / 9 },
  sofa2: { src: VID.h8.src, poster: VID.h8.poster, dur: VID.h8.dur, ratio: 16 / 9 },
  study: { src: VID.h12.src, poster: VID.h12.poster, dur: VID.h12.dur, ratio: 16 / 9 },
  cat: { src: VID.v5.src, poster: VID.v5.poster, dur: VID.v5.dur, ratio: 9 / 16 },
  refOut: { src: VID.v5b.src, poster: VID.v5b.poster, dur: VID.v5b.dur, ratio: 9 / 16 },
} satisfies Record<string, VerMedia>
type MediaKey = keyof typeof VMEDIA

/** 一条版本记录。`media` 不写就沿用来源版本那一幅 —— 编辑的产出与原片同长，演示里就是同一幅画面 */
interface VerSpec {
  kind: 'upload' | 'text' | 'ref' | 'edit' | 'extend'
  media?: MediaKey
  /** 几分钟前。排到前一天去（ago 大于一天）才看得到「MM-DD HH:MM」那一档写法 */
  ago: number
  /** 编辑 / 延长的来源版本：[节点, 第几版] */
  base?: [string, number]
  /** 提交时那一句（含标签）。详情页和「复制」都拿它现念 */
  prompt?: Seg[]
}
interface VerNode {
  id: string; name: string; x: number; y: number
  /** 按时间先后，最后一条就是节点上现在显示的那一版 */
  versions?: VerSpec[]
  /** 只留在记录里，不上画布 —— 节点删了，这段视频做过什么的记录还在 */
  deleted?: boolean
  /** 快捷入口创建、还没出片的那个子节点：写 operationSource，没有自己的画面 */
  focusOf?: string
  /** 生成面板里回填的那一句（上一次生成留下的草稿） */
  panel?: Seg[]
}
interface VersionScene {
  title: string
  /** 菜单里那一行摘要 */
  summary: string
  /** 卡片里那几条「应看到」 */
  checks: string[]
  nodes: VerNode[]
  edges: [string, string][]
  select?: string
  /** 顺手把「全部版本」那只气泡打开 */
  open?: boolean
}

const MINUTE = 60_000
const MODE_OF: Record<VerSpec['kind'], Mode | null> =
  { upload: null, text: 'text', ref: 'ref', edit: 'edit', extend: 'extend' }
/** 延长的新增时长，和参数栏的默认值同一个 */
const EXTEND_SECS = 5

/** 句首那一截（和 seedDoc 一样），后面接用户自己写的那半句 */
const editDoc = (text: string): Seg[] =>
  [{ t: 'text', v: '把' }, { t: 'mat', k: segKey() }, { t: 'text', v: `的${text}` }]
const extendDoc = (text: string): Seg[] =>
  [{ t: 'text', v: '从' }, { t: 'mat', k: segKey() }, { t: 'dur', k: segKey() }, { t: 'text', v: `，${text}` }]
const refDoc = (text: string): Seg[] => [{ t: 'text', v: text }]
const boxAt = (t: number): MarkRegion => ({ t, tool: 'box', rect: [0.32, 0.36, 0.3, 0.28] })
/** 带一枚标记标签的那一句：「把 @客厅沙发 中 @标记 00:02 的…」 */
const markDoc = (text: string, t: number): Seg[] => [
  { t: 'text', v: '把' }, { t: 'mat', k: segKey() }, { t: 'text', v: '中' },
  { t: 'mark', k: segKey(), g: 'g1', regions: [boxAt(t)] }, { t: 'text', v: `的${text}` },
]
/** 片段标签 + 标记标签都有的那一句 */
const segmentDoc = (text: string, range: TimeRange, t: number): Seg[] => [
  { t: 'text', v: '把' }, { t: 'mat', k: segKey() }, { t: 'text', v: '中' },
  { t: 'range', k: segKey(), g: 'g1', range }, { t: 'text', v: '里的' },
  { t: 'mark', k: segKey(), g: 'g1', regions: [boxAt(t)] }, { t: 'text', v: `的${text}` },
]

function versionScene(scene: VersionScene) {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  const at = (id: string) => scene.nodes.find((n) => n.id === id)
  /** 这一版是哪一幅画面：编辑的产出沿用来源那一幅，一路往上找 */
  const mediaKey = (nodeId: string, no: number): MediaKey => {
    const spec = at(nodeId)?.versions?.[no - 1]
    if (spec?.media) return spec.media
    return spec?.base ? mediaKey(spec.base[0], spec.base[1]) : 'sofa'
  }
  const now = Date.now()

  // ① 先摆记录：版本号由 seed 按每个节点出现的先后发
  const rows: Omit<VersionRecord, 'no'>[] = []
  for (const n of scene.nodes) {
    (n.versions ?? []).forEach((spec, i) => {
      const m = VMEDIA[spec.media ?? mediaKey(n.id, i + 1)]
      const mode = MODE_OF[spec.kind]
      // 延长的产出只有新增那一截，所以时长写新增时长，不是这段演示素材本身有多长
      const dur = spec.kind === 'extend' ? EXTEND_SECS : m.dur
      const task: VersionTask | null = mode && {
        mode, model: FOCUS_MODEL, doc: spec.prompt ?? [],
        params: { resolution: '720p', duration: dur,
          // 编辑 / 延长的画幅锁死随原片，提交那一刻就记成 adaptive
          ratio: mode === 'edit' || mode === 'extend' ? 'adaptive' : '16:9', sound: true },
        sourceId: spec.base?.[0] ?? null, direction: spec.kind === 'extend' ? 'after' : null,
      }
      rows.push({ id: `${n.id}-v${i + 1}`, nodeId: n.id, name: n.name,
        sourceNodeId: spec.base?.[0] ?? null, baseNo: spec.base?.[1] ?? null,
        createdAt: now - spec.ago * MINUTE, media: { src: m.src, poster: m.poster, dur }, task })
    })
  }
  useVersions.getState().seed(rows)

  // ② 再摆画布
  const ratioOf = (id: string): number => {
    const n = at(id)
    return n?.versions?.length ? VMEDIA[mediaKey(id, n.versions.length)].ratio : 16 / 9
  }
  const nodes: CNode[] = []
  for (const n of scene.nodes) {
    if (n.deleted) continue
    const last = n.versions?.[n.versions.length - 1]
    const m = last ? VMEDIA[mediaKey(n.id, n.versions!.length)] : null
    const data: CanvasNodeData = { name: n.name, assetName: n.name }
    if (m && last) Object.assign(data, { src: m.src, poster: m.poster, ratio: m.ratio, mediaReady: true,
      dur: last.kind === 'extend' ? EXTEND_SECS : m.dur })
    if (n.focusOf) data.operationSource = n.focusOf
    // 专注态那块屏比普通节点宽一截，宽多少跟着源片的朝向走（和点「局部编辑」时同一条）
    const width = n.focusOf ? focusWidthFor(ratioOf(n.focusOf))
      : m ? boxFor(m.ratio).width : widthOf('video', true)
    nodes.push({ id: n.id, type: 'video', position: { x: n.x, y: n.y }, style: { width }, data,
      selected: n.id === scene.select })
  }
  useCanvas.getState().setAll({ nodes, edges: scene.edges.map(([s, t]) => edge(s, t)) })

  // ③ 按连线顺序逐根同步：结果等同用户一根一根连上
  const gs = useGenerator.getState()
  const conn: Record<string, string[]> = {}
  for (const [from, to] of scene.edges) {
    const n = at(to)
    if (!n || n.deleted) continue
    conn[to] = [...(conn[to] ?? []), from]
    const list = conn[to].filter((id) => !!get(id))
    if (n.focusOf && conn[to].length === 1) {
      // 和点一下「局部编辑 / 延长视频」那一下一样：先按常规落位，再把模式和型号锁住
      gs.syncConn(to, list, get)
      gs.setMode(to, n.name.startsWith(NAME_OF.extend) ? 'extend' : 'edit', get)
      if (!gs.get1(to).slotEdit) gs.applyDrop(to, from, 'edit', null, get)
      gs.setModel(to, FOCUS_MODEL, get)
    } else gs.syncConn(to, list, get, !!n.focusOf)
  }

  // ④ 回填上一次生成留下的那一句
  for (const n of scene.nodes) {
    if (!n.panel || n.deleted) continue
    const g = gs.get1(n.id)
    const mat = g.slotEdit ? get(g.slotEdit) : null
    /**
     * sourceSrc 指的是**来源版本**那一幅画面。源视频后来又生成过一版时，
     * 这一句和节点上现在那一幅就对不上 —— 面板第一次同步就认出换了源，
     * 按 §3.2.1 清掉片段、标记和对应标签，用户的文字留着。
     */
    const base = n.versions?.[0]?.base
    gs.patch(n.id, { doc: n.panel, marks: marksOf(n.panel), seeded: true,
      prompt: docText(n.panel, { name: mat?.name, direction: g.direction, duration: g.params.duration }),
      sourceId: g.slotEdit, sourceSrc: base ? VMEDIA[mediaKey(base[0], base[1])].src : g.sourceSrc })
  }

  // ⑤ 最后把「全部版本」那只气泡摆开
  if (scene.open && scene.select) useCanvas.getState().setOpenVersions(scene.select)
}

const SOFA = { id: 'SOFA', name: '客厅沙发', x: 0, y: 0 } as const
const sofaV1: VerSpec = { kind: 'upload', media: 'sofa', ago: 1500 }
/** 客厅沙发原地重新生成的那一版（§4.2 的「上游重新生成」都用它） */
const sofaV2: VerSpec = { kind: 'ref', media: 'sofa2', ago: 90, prompt: refDoc('同一间客厅，换成黄昏的光') }

export const VERSIONS: Record<string, VersionScene> = {
  'ver-quick': {
    title: '快捷入口编辑、延长各一次',
    summary: '客厅沙发编辑一次、延长一次，两张衍生卡片都收在它这一屏里',
    checks: [
      '按钮显示「全部版本 3」；分类为 全部 3 / 本视频 1 / 编辑 1 / 延长 1',
      '卡片顺序：客厅沙发 V1（当前显示 · 上传）→ 延长视频1 → 编辑视频1',
      '编辑视频1 的详情为「编辑视频1 编辑 · 今天 HH:MM 基于〔缩略图〕修改」，名字后不带 V 号；悬浮缩略图显示「客厅沙发 · V1」',
      '延长视频1 的详情里时长 5s、画幅「随原片」',
      '选中编辑视频1 时按钮只写「全部版本」，不带数字',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0,
        versions: [{ kind: 'edit', ago: 40, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }] },
      { id: 'X1', name: '延长视频1', x: 620, y: 420,
        versions: [{ kind: 'extend', media: 'sofa2', ago: 20, base: ['SOFA', 1], prompt: extendDoc('镜头继续向右平移') }] },
    ],
    edges: [['SOFA', 'E1'], ['SOFA', 'X1']],
    select: 'SOFA', open: true,
  },

  'ver-regen-down': {
    title: '下游原地重新生成',
    summary: '编辑视频1 重做了一次：它自己两版，上游只收第一版',
    checks: [
      '编辑视频1 显示「全部版本 2」：V2（当前显示）在前、V1 在后，角标都是「编辑」，详情都带 V 号',
      '客厅沙发 仍是「全部版本 2」，编辑分类只有编辑视频1 的 V1',
      '在编辑视频1 上再点一次生成：它多出 V3，客厅沙发 的计数不变',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0, versions: [
        { kind: 'edit', ago: 60, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') },
        { kind: 'edit', ago: 15, base: ['SOFA', 1], prompt: editDoc('沙发换成深色皮质，再压暗一点') },
      ] },
    ],
    edges: [['SOFA', 'E1']],
    select: 'E1', open: true,
  },

  'ver-manual': {
    title: '手动连线后用编辑视频生成（可操作）',
    summary: '自己把视频连进空节点：落编辑视频，但没有标记工具、没有句首',
    checks: [
      '面板落在「编辑视频」+ Seedance 2.5',
      '节点不放大，没有标记和片段工具，提示词没有句首',
      '点生成后：视频节点1 名字不变，V1 角标「编辑」',
      '客厅沙发 变成「全部版本 2」，编辑分类收录视频节点1，详情为「基于 客厅沙发·V1 修改」',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'N1', name: '视频节点1', x: 620, y: 0 },
    ],
    edges: [['SOFA', 'N1']],
    select: 'N1',
  },

  'ver-ref': {
    title: '两段视频走全能参考，不算衍生',
    summary: '全能参考生成出来的那一版，不记在任何来源视频的名下',
    checks: [
      '视频节点1 的 V1 角标「生成」，详情里没有「基于…」',
      '客厅沙发、小猫咪 的全部版本按钮都不带数字',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'CAT', name: '小猫咪', x: 0, y: 420, versions: [{ kind: 'upload', media: 'cat', ago: 1400 }] },
      { id: 'N1', name: '视频节点1', x: 620, y: 160,
        versions: [{ kind: 'ref', media: 'refOut', ago: 30, prompt: refDoc('让小猫咪跳上客厅的沙发') }] },
    ],
    edges: [['SOFA', 'N1'], ['CAT', 'N1']],
    select: 'N1', open: true,
  },

  'ver-up-regen': {
    title: '上游原地重新生成，下游不变（可操作）',
    summary: '客厅沙发自己又生成了一版：编辑视频1 的画面和来源都不动',
    checks: [
      '列表顺序：V2（当前显示 · 生成）→ V1（上传）→ 编辑视频1（编辑）',
      '编辑视频1 的画面没变，详情来源仍是「客厅沙发 · V1」',
      '选中编辑视频1：面板里的片段和标记标签已清除，文字保留（源视频变了）',
      '在编辑视频1 上再点生成：它的 V2 来源是「客厅沙发 · V2」，客厅沙发 的列表不增加',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1, sofaV2] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0,
        versions: [{ kind: 'edit', ago: 300, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }],
        panel: segmentDoc('沙发换成皮质', { start: 0, end: 4 }, 2) },
    ],
    edges: [['SOFA', 'E1']],
    select: 'SOFA', open: true,
  },

  'ver-both-regen': {
    title: '上下游都重新生成过',
    summary: '两版各自基于当时那一版上游，来源一一对得上',
    checks: [
      'V2 来源「客厅沙发 · V2」，V1 来源「客厅沙发 · V1」',
      '客厅沙发 的编辑分类只有编辑视频1 的 V1',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1, sofaV2] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0, versions: [
        { kind: 'edit', ago: 300, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') },
        { kind: 'edit', ago: 20, base: ['SOFA', 2], prompt: editDoc('沙发换成皮质，保留黄昏的光') },
      ] },
    ],
    edges: [['SOFA', 'E1']],
    select: 'E1', open: true,
  },

  'ver-swap': {
    title: '下游换了源视频',
    summary: '编辑视频1 两版分别改自两段不同的视频，两边各收一张',
    checks: [
      '编辑视频1 的本视频 2 版，来源分别是 客厅沙发 · V1 和 书房 · V1',
      '客厅沙发、书房 的编辑分类各收 1 张（各自的首次）',
      '画布上只剩 书房 → 编辑视频1 这一根线',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'STUDY', name: '书房', x: 0, y: 420, versions: [{ kind: 'upload', media: 'study', ago: 1300 }] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 160, versions: [
        { kind: 'edit', ago: 200, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') },
        { kind: 'edit', ago: 25, base: ['STUDY', 1], prompt: editDoc('书架换成浅色木纹') },
      ] },
    ],
    edges: [['STUDY', 'E1']],
    select: 'E1', open: true,
  },

  'ver-chain': {
    title: '只收一层',
    summary: '沙发 → 编辑视频1 → 延长视频1：最上游不收孙辈',
    checks: [
      '编辑视频1 显示「全部版本 2」（本视频 1 + 延长 1）',
      '客厅沙发 显示「全部版本 2」，不含延长视频1',
      '延长视频1 的详情为「基于 编辑视频1 · V1 延长」',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0,
        versions: [{ kind: 'edit', ago: 90, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }] },
      { id: 'X1', name: '延长视频1', x: 1240, y: 0,
        versions: [{ kind: 'extend', media: 'sofa2', ago: 30, base: ['E1', 1], prompt: extendDoc('镜头继续向右平移') }] },
    ],
    edges: [['SOFA', 'E1'], ['E1', 'X1']],
    select: 'E1', open: true,
  },

  'ver-to-ref': {
    title: '下游改用全能参考再生成',
    summary: '同一个节点换了模式：新的那一版不再属于任何来源视频',
    checks: [
      'V2（当前显示）角标「生成」，详情里没有来源',
      '客厅沙发 仍收编辑视频1 的 V1',
      '小猫咪 什么都不收（按钮不带数字）',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'CAT', name: '小猫咪', x: 0, y: 420, versions: [{ kind: 'upload', media: 'cat', ago: 1400 }] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 160, versions: [
        { kind: 'edit', ago: 150, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') },
        { kind: 'ref', media: 'refOut', ago: 18, prompt: refDoc('让小猫咪跳上皮质沙发') },
      ] },
    ],
    edges: [['SOFA', 'E1'], ['CAT', 'E1']],
    select: 'E1', open: true,
  },

  'ver-add': {
    title: '添加到画布',
    summary: '把旧的那一版重新摆上画布：记作新节点的 V1，类型沿用',
    checks: [
      '点进 V1，主操作是「添加到画布」：点后在编辑视频1 下方新建「视频节点N」，不连线，画面是 V1',
      '新节点的全部版本只有这 1 版（按钮不带数字），角标「编辑」，来源「客厅沙发 · V1」',
      '客厅沙发 的列表不变（仍是 2）',
      '点进 V2，主操作是「在画布中查看」：关闭面板，定位并选中编辑视频1',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0, versions: [
        { kind: 'edit', ago: 60, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') },
        { kind: 'edit', ago: 15, base: ['SOFA', 1], prompt: editDoc('沙发换成深色皮质，再压暗一点') },
      ] },
    ],
    edges: [['SOFA', 'E1']],
    select: 'E1', open: true,
  },

  'ver-deleted': {
    title: '节点删了，历史还在',
    summary: '编辑视频1 和书房都已从画布删除，记录与来源缩略图照旧',
    checks: [
      '客厅沙发 的编辑分类里仍有「编辑视频1」卡片，它的详情右上角只有关闭，没有主操作',
      '选中编辑视频2 打开详情：来源缩略图还在，悬浮显示「书房 · V1」',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0, deleted: true,
        versions: [{ kind: 'edit', ago: 120, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }] },
      { id: 'STUDY', name: '书房', x: 0, y: 420, deleted: true,
        versions: [{ kind: 'upload', media: 'study', ago: 1300 }] },
      { id: 'E2', name: '编辑视频2', x: 620, y: 420,
        versions: [{ kind: 'edit', ago: 50, base: ['STUDY', 1], prompt: editDoc('书架换成浅色木纹') }] },
    ],
    edges: [],
    select: 'SOFA', open: true,
  },

  'ver-rename': {
    title: '改名同步（可操作）',
    summary: '双击客厅沙发改名：下游的来源、提示词、复制出的文字都跟着改口',
    checks: [
      '双击改名后：编辑视频1 详情里的来源悬浮显示新名字',
      '提示词中的 @客厅沙发 也换成新名字，「复制」出来的文字一致',
      '版本号和来源关系不变（仍是 基于 新名字 · V1）',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0,
        versions: [{ kind: 'edit', ago: 45, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }] },
    ],
    edges: [['SOFA', 'E1']],
    select: 'SOFA',
  },

  'ver-upload': {
    title: '上传视频与原地生成',
    summary: '同一个节点先上传、再原地生成一版：两版分属「上传」和「生成」',
    checks: [
      '上传视频 的按钮不带数字',
      '视频节点1 显示「全部版本 2」：V2 生成（当前显示）、V1 上传',
      'V1 的详情提示词框为空，参数只有时长',
    ],
    nodes: [
      { id: 'UP', name: '上传视频', x: 0, y: 0, versions: [{ kind: 'upload', media: 'sofa', ago: 1200 }] },
      { id: 'N1', name: '视频节点1', x: 620, y: 0, versions: [
        { kind: 'upload', media: 'cat', ago: 600 },
        { kind: 'text', media: 'refOut', ago: 12, prompt: refDoc('一只小猫咪在窗台上伸懒腰') },
      ] },
    ],
    edges: [],
    select: 'N1', open: true,
  },

  'ver-focus': {
    title: '快捷入口子节点随源视频删除（可操作）',
    summary: '还没出片的编辑视频1 跟着源视频走，已出片的编辑视频2 留着',
    checks: [
      '剪断 客厅沙发→编辑视频1 的连线：编辑视频1 一起删除（⌘Z 一次全接回来）',
      '⌘Z 恢复后删除客厅沙发：编辑视频1 删除，编辑视频2 保留，详情来源仍在',
      '连点两次「局部编辑」：新建编辑视频3、编辑视频4 两个节点，不叠在一起',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 760, y: 0, focusOf: 'SOFA' },
      { id: 'E2', name: '编辑视频2', x: 760, y: 820,
        versions: [{ kind: 'edit', ago: 70, base: ['SOFA', 1], prompt: editDoc('沙发换成皮质') }] },
    ],
    edges: [['SOFA', 'E1'], ['SOFA', 'E2']],
    select: 'SOFA',
  },

  'ver-focus-ref': {
    title: '快捷入口子节点再接视频',
    summary: '还没出片的子节点上再接一段视频：不切全能参考（§5.1 例外）',
    checks: [
      '仍在编辑视频模式，节点仍是放大的编辑态',
      '小猫咪 进参考素材，源视频还是客厅沙发',
      '模型仍锁死 Seedance 2.5（悬浮模型栏说「编辑 / 延长固定使用 Seedance 2.5」）',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'CAT', name: '小猫咪', x: 0, y: 420, versions: [{ kind: 'upload', media: 'cat', ago: 1400 }] },
      { id: 'E1', name: '编辑视频1', x: 760, y: 0, focusOf: 'SOFA' },
    ],
    edges: [['SOFA', 'E1'], ['CAT', 'E1']],
    select: 'E1',
  },

  'ver-seg-model': {
    title: '有指定片段时换模型',
    summary: '句子里有片段标签才拦 2.0；只有画面标记照旧可切',
    checks: [
      '编辑视频1（句子含片段标签）的模型列表里 Seedance 2.0 系列置灰，悬浮「Seedance 2.0 不支持指定片段编辑」',
      '编辑视频2（句子只有标记标签）可以切到 Seedance 2.0，生成按钮不拦',
    ],
    nodes: [
      { ...SOFA, versions: [sofaV1] },
      { id: 'E1', name: '编辑视频1', x: 620, y: 0,
        versions: [{ kind: 'edit', ago: 80, base: ['SOFA', 1], prompt: segmentDoc('沙发换成皮质', { start: 0, end: 4 }, 2) }],
        panel: segmentDoc('沙发换成皮质', { start: 0, end: 4 }, 2) },
      { id: 'E2', name: '编辑视频2', x: 620, y: 420,
        versions: [{ kind: 'edit', ago: 60, base: ['SOFA', 1], prompt: markDoc('台灯换成铜色', 2) }],
        panel: markDoc('台灯换成铜色', 2) },
    ],
    edges: [['SOFA', 'E1'], ['SOFA', 'E2']],
    select: 'E1',
  },
}

/** 顶栏「连线示例」那个菜单点下去走的就是这一条，和 `?scene=<键>` 是同一条路 */
export function sceneWired(key: string) {
  const spec = WIRED[key]
  if (spec) { wire(spec); return }
  const ver = VERSIONS[key]
  if (ver) versionScene(ver)
}

/** 这个示例该看到什么 —— 顶栏下方那张小卡读的就是它 */
export const hintOf = (key: string): SceneHint | null => {
  const ver = VERSIONS[key]
  if (ver) return { title: ver.title, checks: ver.checks }
  const wired = WIRED[key]
  return wired ? { title: wired.title, checks: [wired.expect] } : null
}

export function sceneInitial(search: string) {
  const scene = new URLSearchParams(search).get('scene')
  if (scene === 'empty') sceneEmpty()
  else if (scene === '1') sceneWorkflow()
  else if (scene && (WIRED[scene] || VERSIONS[scene])) sceneWired(scene)
  else sceneShowcase()
}

/**
 * 复刻截图 8 的工作流：图片a / 图片b / 视频b / 示例视频 → 视频a。
 * 选中「视频a」，模式自动落到视频编辑：示例视频进主槽，其余进参考托盘。
 */
export function sceneWorkflow() {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  const nodes: CNode[] = [
    node('IMGA', 'image', 0, 0, '图片a', { src: SAMPLE_PHOTOS[0] }),
    node('IMGB', 'image', 0, 270, '图片b', { src: SAMPLE_PHOTOS[1] }),
    node('VIDB', 'video', 0, 540, '视频b'),
    node('FURN', 'video', 0, 960, '示例视频', { src: MEDIA.defaultVideo.src, poster: MEDIA.defaultVideo.poster, dur: MEDIA.defaultVideo.dur }),
    node('GH77', 'video', 0, 1380, 'GH77', MEDIA.gh77),
    { ...node('VIDA', 'video', 560, 560, '视频a'), selected: true },
    node('9JCP', 'video', 1120, 0, '9JCP'),
    node('S4NB', 'image', 1120, 420, 'S4NB'),
    node('ZMPB', 'text', 1120, 690, 'ZMPB'),
  ]
  // 连线先后 = 落位顺序：示例视频先进主槽，图片 a / b 再进托盘
  const edges = [edge('FURN', 'VIDA'), edge('IMGA', 'VIDA'), edge('IMGB', 'VIDA'), edge('VIDB', 'VIDA')]
  useCanvas.getState().setAll({ nodes: named(nodes), edges })
}
