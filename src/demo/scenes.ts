import type { Edge } from '@xyflow/react'
import { useCanvas, newId, type CNode } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { CLIPS_2S, FAKE_TEXT, MEDIA, SAMPLE_PHOTOS } from './assets'

const node = (
  id: string, type: 'text' | 'image' | 'video',
  x: number, y: number, _name: string, data: Record<string, unknown> = {},
): CNode => ({ id, type, position: { x, y }, style: { width: 320 }, data: { ...data, ...(() => { const name = newId(); return { name, assetName: name } })() } })

const edge = (s: string, t: string): Edge => ({ id: `e-${s}-${t}`, source: s, target: t, type: 'dashed' })

/** 通过 ?scene=empty 进入空画布。 */
export function sceneEmpty() {
  useGenerator.getState().reset()
  useCanvas.getState().setAll({ nodes: [], edges: [] })
}

/**
 * 默认节点样例，也是走查用的画布：11 段 2 秒视频 + 8 张现成图片 + 文本，每类末尾留一个空态。
 * 11 段刚好越过 Seedance 2.5 的 10 段视频配额，2 秒 × 11 = 22 秒仍在 30 秒总时长内，
 * 「超出的本次不参与」和「源视频不足 4 秒」这两条一次就能试到。
 */
const COLS = 5
const GRID_COL = 700
const GRID_ROW = 430
interface Spec { id: string; kind: 'text' | 'image' | 'video'; name: string; data?: Record<string, unknown> }
const seq = (n: number, prefix: string, make: (i: number) => Omit<Spec, 'id'>): Spec[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, ...make(i) }))

export function sceneShowcase() {
  useGenerator.getState().reset()
  /** 视频、图片、其他各占自己的行区，每区都从新的一行开始 */
  const lanes: Spec[][] = [
    seq(11, 'VC', (i) => ({ kind: 'video', name: `视频 · 2 秒 ${i + 1}`, data: CLIPS_2S[i % CLIPS_2S.length] })),
    seq(8, 'IP', (i) => ({ kind: 'image', name: `图片 · 参考图 ${i + 1}`, data: { src: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length] } })),
    [
      { id: 'TX01', kind: 'text', name: '文本 · 场景描述', data: {
        text: '午后的阳光透过窗帘洒进客厅。\n镜头缓缓向前推进，掠过桌面与沙发。\n保持家具布局，换成温暖的电影色调。' } },
      { id: 'TX02', kind: 'text', name: '文本 · 对白片段', data: { text: FAKE_TEXT } },
      // 空态各留一个：新建节点长什么样，不用再手动加
      { id: 'VE01', kind: 'video', name: '视频 · 空态' },
      { id: 'IE01', kind: 'image', name: '图片 · 空态' },
      { id: 'TE01', kind: 'text', name: '文本 · 空态' },
    ],
  ]
  const nodes: CNode[] = []
  let row = 0
  for (const lane of lanes) {
    lane.forEach((s, i) => nodes.push(
      node(s.id, s.kind, (i % COLS) * GRID_COL, (row + Math.floor(i / COLS)) * GRID_ROW, s.name, s.data)))
    row += Math.ceil(lane.length / COLS)
  }
  useCanvas.getState().setAll({ nodes, edges: [] })
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
  const nodes: CNode[] = [
    node('IMGA', 'image', 0, 0, '图片a', { src: SAMPLE_PHOTOS[0] }),
    node('IMGB', 'image', 0, 270, '图片b', { src: SAMPLE_PHOTOS[1] }),
    node('VIDB', 'video', 0, 540, '视频b'),
    node('FURN', 'video', 0, 810, '示例视频', { src: MEDIA.defaultVideo.src, poster: MEDIA.defaultVideo.poster, dur: MEDIA.defaultVideo.dur }),
    node('GH77', 'video', 0, 1080, 'GH77', MEDIA.gh77),
    { ...node('VIDA', 'video', 560, 400, '视频a'), selected: true },
    node('9JCP', 'video', 1120, 0, '9JCP'),
    node('S4NB', 'image', 1120, 270, 'S4NB'),
    node('ZMPB', 'text', 1120, 540, 'ZMPB'),
  ]
  // 连线先后 = 落位顺序：示例视频先进主槽，图片 a / b 再进托盘
  const edges = [edge('FURN', 'VIDA'), edge('IMGA', 'VIDA'), edge('IMGB', 'VIDA'), edge('VIDB', 'VIDA')]
  useCanvas.getState().setAll({ nodes, edges })
}
