import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvas } from './canvas'
import { readsAs, useVersions, versionsOf } from './versions'
import type { TaskPayload } from '../generator/videoTask'

const media = (src: string) => ({ src, poster: `${src}.jpg`, dur: 5 })
const edit = { mode: 'edit' } as unknown as TaskPayload
const extend = { mode: 'extend' } as unknown as TaskPayload
/** 一个节点的历史按三档读出来：生成 / 编辑 / 延长各收着哪几幅画面 */
const shelf = (nodeId: string) => {
  const list = versionsOf(useVersions.getState().records, nodeId)
  const pick = (k: 'generate' | 'edit' | 'extend') =>
    list.filter((r) => readsAs(r, nodeId) === k).map((r) => r.media.src)
  return { generate: pick('generate'), edit: pick('edit'), extend: pick('extend') }
}

beforeEach(() => {
  useCanvas.getState().setAll({ nodes: [], edges: [] })
  useVersions.getState().reset()
})

describe('版本归属', () => {
  it('一个节点只收自己和直接从它派生出去的那一层', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('a.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    const c = canvas.addNode('video', { x: 0, y: 0 })
    const versions = useVersions.getState()
    versions.record({ id: 't1', nodeId: b, sourceNodeId: a, media: media('b.mp4'), payload: edit })
    versions.record({ id: 't2', nodeId: c, sourceNodeId: b, media: media('c.mp4'), payload: edit })

    const records = useVersions.getState().records
    expect(versionsOf(records, a).map((r) => [r.no, r.nodeId])).toEqual([[1, a], [2, b]])
    expect(versionsOf(records, b).map((r) => r.no)).toEqual([2, 3])
  })

  it('从没生成过的原画面被补记成第一版，之后原地生成也不改写它', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('uploaded.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    useVersions.getState().record({ id: 't1', nodeId: b, sourceNodeId: a, media: media('b.mp4'), payload: edit })
    expect(versionsOf(useVersions.getState().records, a)[0]).toMatchObject({ no: 1, payload: null, media: { src: 'uploaded.mp4' } })

    // 在 A 上原地再生成一次：新的一版接在后面，原画面那一条还在，src 也还是旧的
    useVersions.getState().record({ id: 't2', nodeId: a, sourceNodeId: null, media: media('regen.mp4'), payload: edit })
    useCanvas.getState().updateNode(a, media('regen.mp4'))
    const mine = versionsOf(useVersions.getState().records, a)
    expect(mine.map((r) => r.media.src)).toEqual(['uploaded.mp4', 'b.mp4', 'regen.mp4'])
  })
})

describe('分类只看关系，不看名字', () => {
  /** 视频节点1 —编辑→ 节点2 —延长→ 节点3，和走查图上是同一条链 */
  const chain = () => {
    const canvas = useCanvas.getState()
    const n1 = canvas.addNode('video', { x: 0, y: 0 }, media('视频1.mp4'))
    const n2 = canvas.addNode('video', { x: 0, y: 0 })
    const n3 = canvas.addNode('video', { x: 0, y: 0 })
    useCanvas.getState().updateNode(n2, { name: '局部修改视频：视频节点1' })
    useCanvas.getState().updateNode(n3, { name: '局部修改视频：视频节点1 · 2' })
    const versions = useVersions.getState()
    versions.record({ id: 't1', nodeId: n2, sourceNodeId: n1, media: media('视频2.mp4'), payload: edit })
    versions.record({ id: 't2', nodeId: n3, sourceNodeId: n2, media: media('视频3.mp4'), payload: extend })
    return { n1, n2, n3 }
  }

  it('自己产出的都读作「生成」，编辑 / 延长留给派生出去的那一层', () => {
    const { n1, n2, n3 } = chain()
    expect(shelf(n1)).toEqual({ generate: ['视频1.mp4'], edit: ['视频2.mp4'], extend: [] })
    // 名字叫「局部修改视频：视频节点1」，它自己那幅画面仍然收在「生成」里
    expect(shelf(n2)).toEqual({ generate: ['视频2.mp4'], edit: [], extend: ['视频3.mp4'] })
    expect(shelf(n3)).toEqual({ generate: ['视频3.mp4'], edit: [], extend: [] })
  })

  it('改提示词再生成一次：新的一版落在这个节点的「生成」里，先前那一版还在', () => {
    const { n1, n2, n3 } = chain()
    useVersions.getState().record({ id: 't3', nodeId: n2, sourceNodeId: n1, media: media('视频4.mp4'), payload: edit })
    expect(shelf(n2).generate).toEqual(['视频2.mp4', '视频4.mp4'])
    // 节点3 那一版记的是它当时用的画面，不被倒着改写
    expect(shelf(n3).generate).toEqual(['视频3.mp4'])
    // 从节点1 看，两次都是「拿视频1 编辑出来的」
    expect(shelf(n1).edit).toEqual(['视频2.mp4', '视频4.mp4'])
  })
})
