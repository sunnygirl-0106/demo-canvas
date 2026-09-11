import type { Edge } from '@xyflow/react'
import { useCanvas, newId, type CNode } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { FAKE_TEXT, MEDIA, SAMPLE_PHOTOS } from './assets'

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

/** 默认节点样例：按视频、图片、文本依次纵向排列，为提示词面板留出空间。 */
export function sceneShowcase() {
  useGenerator.getState().reset()
  const nodes: CNode[] = [
    node('VE01', 'video', 0, 0, '视频 · 空态 01'),
    node('VE02', 'video', 0, 0, '视频 · 空态 02'),
    node('VS2J', 'video', 0, 0, '视频 · S2JS_wm', MEDIA.defaultVideo),
    node('V010', 'video', 0, 0, '视频 · video (10)', MEDIA.video10),
    node('V009', 'video', 0, 0, '视频 · video (9)', MEDIA.video9),
    node('GH77', 'video', 0, 0, '视频 · GH77', MEDIA.gh77),

    node('IE01', 'image', 0, 0, '图片 · 空态 01'),
    node('IE02', 'image', 0, 0, '图片 · 空态 02'),
    ...SAMPLE_PHOTOS.map((src, i) => node(
      `IP0${i + 1}`, 'image', 0, 0,
      `图片 · 参考图 0${i + 1}`, { src },
    )),

    node('TE01', 'text', 0, 0, '文本 · 空态 01'),
    node('TE02', 'text', 0, 0, '文本 · 空态 02'),
    node('TX01', 'text', 0, 0, '文本 · 场景描述', {
      text: '午后的阳光透过窗帘洒进客厅。\n镜头缓缓向前推进，掠过桌面与沙发。\n保持家具布局，换成温暖的电影色调。',
    }),
    node('TX02', 'text', 0, 0, '文本 · 对白片段', { text: FAKE_TEXT }),
  ]
  useCanvas.getState().setAll({
    nodes: nodes.map((n, i) => ({ ...n, position: { x: 0, y: i * 560 } })),
    edges: [],
  })
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
