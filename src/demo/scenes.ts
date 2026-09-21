import type { Edge } from '@xyflow/react'
import { useCanvas, KIND_NAME, widthOf, type CNode, type NodeKind } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { useVersions } from '../store/versions'
import { WALKTHROUGH_VIDEOS, FAKE_TEXT, MEDIA, SAMPLE_PHOTOS } from './assets'

/** 名字留空：编号由 named() 在整份画布排好之后统一发 */
const node = (
  id: string, type: 'text' | 'image' | 'video',
  x: number, y: number, _name: string, data: Record<string, unknown> = {},
): CNode => ({ id, type, position: { x, y }, style: { width: widthOf(type) }, data: { name: '', ...data } })

/**
 * 画布上的节点按类型从 1 开始编号：视频节点1、图片节点2……
 * 编号在最后统一发，按它们在画布上排出来的先后 —— 走查时报「视频节点3」，找的就是第三段。
 */
const named = (nodes: CNode[]): CNode[] => {
  const seen: Partial<Record<NodeKind, number>> = {}
  return nodes.map((n) => {
    const kind = (n.type || 'text') as NodeKind
    const name = `${KIND_NAME[kind]}${(seen[kind] = (seen[kind] ?? 0) + 1)}`
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
 * 默认节点样例，也是走查用的画布：11 段长短不一的视频 + 8 张现成图片 + 文本，每类末尾留一个空态。
 * 11 段越过 Seedance 2.5 的 10 段视频配额；时长从 1.5 秒铺到 10 秒，
 * 「超出部分不参与本次生成」「这一段时长哪个型号都接不住」「短片进编辑自动换型号」都能一次试到 ——
 * 全部表现为置灰 + 悬浮说明，没有一句是等用户选完才冒出来的。
 * 视频按各自的比例摆（横的横、竖的竖），一行三个；图片和文本还是两列。往下滚就是下一批。
 */
/**
 * 每一区自己的排法。视频节点按素材本来的比例摆，横竖都有（竖片 200×356、横片 356×200），
 * 一套行列间距套在两种长相上，要么竖片上下叠在一起，要么横片左右撞上。
 * 所以视频区的格子按「最宽的那种 × 最高的那种」留：每格 400×430，节点靠左上角落位，
 * 横竖不一的边缘参差是「各按各的比例」本来就会有的样子，不去硬凑齐。
 * 图片和文本仍是固定的 320×200，两列就够。
 */
interface Grid { cols: number; col: number; row: number }
const VIDEO_GRID: Grid = { cols: 3, col: 400, row: 430 }
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
      id: `VC${String(i + 1).padStart(2, '0')}`, kind: 'video' as const, name: `视频 · ${media.dur}s`, data: media })) },
    { grid: FLAT_GRID, items: seq(8, 'IP', (i) => ({ kind: 'image', name: `图片 · 参考图 ${i + 1}`, data: { src: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length] } })) },
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

export function sceneInitial(search: string) {
  const scene = new URLSearchParams(search).get('scene')
  if (scene === 'empty') sceneEmpty()
  else if (scene === '1') sceneWorkflow()
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
