import type { Edge } from '@xyflow/react'
import { useCanvas, KIND_NAME, widthOf, type CNode, type NodeKind } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { useVersions } from '../store/versions'
import { WALKTHROUGH_VIDEOS, FAKE_TEXT, MEDIA, SAMPLE_PHOTOS, PHOTO_ROLES, VID } from './assets'
import type { Model } from '../generator/materialLayout'

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

/* ────────────────────────────── 连线示例 ──────────────────────────────
 * 每个示例＝一组已经连好的素材 ＋ 一个选中的生成节点，刷新即到达状态机上的某一格。
 * 判定全部交给 syncConn 现跑（模式落位 + 模型自动求解），示例本身不写死模式与落位 ——
 * 这样示例里看到的就是代码真实的落位，与《视频节点规则状态机》对不上的地方即是漏洞。
 * 只预设「用户此前选过的模型」（画布上无从表达的那一半前提），其余一概不设。
 */
interface WireSpec {
  /** 走查时报的名字，也是 ?scene= 的取值 */
  title: string
  /** 状态机上对应的那一格 */
  expect: string
  /** 用户此前选过的模型；不写就是默认的 Seedance 2.5 */
  model?: Model
  sources: Spec[]
}
const ROW: Record<Spec['kind'], number> = { video: 420, image: 260, text: 260 }
const vid = (id: string, v: typeof VID[keyof typeof VID]): Spec => ({ id, kind: 'video', name: v.name, data: { ...v } })
const img = (id: string, i: number): Spec => ({ id, kind: 'image', name: PHOTO_ROLES[i],
  data: { src: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length], name: PHOTO_ROLES[i] } })

function wire(spec: WireSpec) {
  useGenerator.getState().reset()
  useVersions.getState().reset()
  const nodes: CNode[] = []
  let y = 0
  for (const sc of spec.sources) { nodes.push(node(sc.id, sc.kind, 0, y, sc.name, sc.data)); y += ROW[sc.kind] }
  // 生成节点摆在这一列的竖向中点，四周留出连线的余量
  nodes.push({ ...node('TGT', 'video', 620, Math.max(0, y / 2 - 180), '', { name: `生成节点 · ${spec.title}` }), selected: true })
  useCanvas.getState().setAll({ nodes: named(nodes), edges: spec.sources.map((sc) => edge(sc.id, 'TGT')) })
  // 模型是画布上表达不了的那一半前提，只好先按用户选过的那一个摆好；模式仍由落位规则自己算
  if (spec.model) useGenerator.getState().patch('TGT', { model: spec.model })
}

/**
 * 常见且重要的那几格。连线次序就是落位次序 —— 数组里排第几就是第几个接进来的。
 * 走查按 `?scene=<键>` 直达，键名与状态机上的说法一致。
 */
export const WIRED: Record<string, WireSpec> = {
  edit1: { title: '第 1 段视频 → 编辑视频', expect: '视频 ① 占源视频席位，模式落编辑视频',
    sources: [vid('S1', VID.h5)] },
  ref2: { title: '第 2 段视频 → 全能参考', expect: '源视频身份解除；编辑 / 延长入口不灰，可手动切回',
    sources: [vid('S1', VID.h5), vid('S2', VID.v5)] },
  frames: { title: '第 1、2 张图片 → 首尾帧', expect: '首帧 ＝ 图片 ①、尾帧 ＝ 图片 ②，按连接次序填',
    sources: [img('P1', 0), img('P2', 1)] },
  frames3: { title: '第 3 张图片 → 首尾帧席位已满', expect: '入口置灰「最多 2 张，当前已连接 3 张」，退回参考模式',
    sources: [img('P1', 0), img('P2', 1), img('P3', 2)] },
  framesv: { title: '首尾帧下接入视频', expect: '首尾帧不承载视频，落编辑视频，两张图片退回参考素材',
    sources: [img('P1', 0), img('P2', 1), vid('S1', VID.h5)] },
  single: { title: '单段超上限 → 自动换型号', expect: '18 秒超 2.0 的 15 秒：自动换成收得下它的 Seedance 2.5',
    model: 'sd2.0', sources: [vid('S1', VID.v18)] },
  total: { title: '合计超上限 → 自动换型号', expect: '两段各 8 秒合计 16 秒超 2.0：自动换 2.5（合计 ≤ 30 秒）',
    model: 'sd2.0', sources: [vid('S1', VID.h8), vid('S2', VID.v8)] },
  quota: { title: '数量超额度 → 自动换型号', expect: '10 张超 2.0 的 9 张：自动换 2.5（30 张）',
    model: 'sd2.0', sources: PHOTO_ROLES.map((_, i) => img(`P${i + 1}`, i)) },
  nokind: { title: '模型不收视频 → 自动换型号', expect: 'Wan 2.2 不收视频：自动换 2.5 并落编辑视频',
    model: 'wan2.2', sources: [vid('S1', VID.h5), img('P1', 2)] },
  short: { title: '低于 4 秒 · 全平台都收不下', expect: '换谁都接不住：落编辑视频，生成置灰，不提示换型号',
    sources: [vid('S1', VID.v3)] },
  ceil: { title: '单段超 30 秒 · 全平台都收不下', expect: '32 秒越过 2.5 的 30 秒：落编辑视频，由生成按钮拦',
    sources: [vid('S1', VID.h32)] },
  count: { title: '视频段数超 2.5 额度', expect: '11 段越过 2.5 的 10 段，且无更高额度的型号：由生成按钮拦',
    sources: Array.from({ length: 11 }, (_, i) => vid(`S${i + 1}`, VID.v4)) },
  refimg: { title: '参考图档', expect: '只收图的型号拿「参考图」，Tab 行上没有「全能参考」',
    model: 'wan2.2', sources: [img('P1', 0), img('P2', 1), img('P3', 2)] },
  mixed: { title: '全能参考 · 图 ＋ 多段视频', expect: '2.5 下 3 图 ＋ 3 段视频合计 27.2 秒，在 30 秒之内',
    sources: [vid('S1', VID.h5), vid('S2', VID.v10), vid('S3', VID.h12), img('P1', 2), img('P2', 6)] },
}

/** 顶栏「连线示例」那个菜单点下去走的就是这一条，和 `?scene=<键>` 是同一条路 */
export function sceneWired(key: string) {
  const spec = WIRED[key]
  if (spec) wire(spec)
}

export function sceneInitial(search: string) {
  const scene = new URLSearchParams(search).get('scene')
  if (scene === 'empty') sceneEmpty()
  else if (scene === '1') sceneWorkflow()
  else if (scene && WIRED[scene]) wire(WIRED[scene])
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
