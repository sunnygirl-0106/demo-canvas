import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvas } from './canvas'
import { useVersions, versionsOf } from './versions'
import type { TaskPayload } from '../generator/videoTask'

const media = (src: string) => ({ src, poster: `${src}.jpg`, dur: 5 })
const gen = { mode: 'text' } as unknown as TaskPayload
const edit = { mode: 'edit' } as unknown as TaskPayload

beforeEach(() => {
  useCanvas.getState().setAll({ nodes: [], edges: [] })
  useVersions.getState().reset()
})

describe('版本归属', () => {
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

  it('版本号按视频各自数，来源指向当时那一版', () => {
    // 视频节点1 生成两次 → 编辑出编辑视频1 → 编辑视频1 原地重做 → 对编辑视频1 再编辑出编辑视频2
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 })
    const b = canvas.addNode('video', { x: 0, y: 0 })
    const c = canvas.addNode('video', { x: 0, y: 0 })
    const v = useVersions.getState()
    v.record({ id: 'g1', nodeId: a, sourceNodeId: null, media: media('a1.mp4'), payload: gen })
    v.record({ id: 'g2', nodeId: a, sourceNodeId: null, media: media('a2.mp4'), payload: gen })
    v.record({ id: 'e1', nodeId: b, sourceNodeId: a, media: media('b1.mp4'), payload: edit })
    v.record({ id: 'e2', nodeId: b, sourceNodeId: a, media: media('b2.mp4'), payload: edit })
    v.record({ id: 'e3', nodeId: c, sourceNodeId: b, media: media('c1.mp4'), payload: edit })
    const at = (id: string) => useVersions.getState().records.find((r) => r.id === id)!
    expect(['g2', 'e1', 'e2', 'e3'].map((id) => [at(id).no, at(id).baseNo])).toEqual([[2, 1], [1, 2], [2, 2], [1, 2]])
  })
})
