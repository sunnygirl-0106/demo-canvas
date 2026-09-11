import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvas } from './canvas'
import { matOf } from '../demo/assets'

beforeEach(() => {
  useCanvas.getState().setAll({ nodes: [], edges: [] })
})

describe('画布交互回归', () => {
  it('点击加号新建并连线，一次撤销和重做覆盖整个操作', () => {
    const store = useCanvas.getState()
    const source = store.addNode('image', { x: 0, y: 0 })
    const target = store.spawnDownstream(source)
    expect(useCanvas.getState().edges).toHaveLength(1)
    store.undo()
    expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual([source])
    expect(useCanvas.getState().edges).toHaveLength(0)
    store.redo()
    expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual([source, target])
    expect(useCanvas.getState().edges[0]).toMatchObject({ source, target })
  })

  it('一次拖动含多个位置更新，撤销回到起点，重做到终点', () => {
    const store = useCanvas.getState()
    const id = store.addNode('video', { x: 10, y: 20 })
    store.snapshot()
    store.onNodesChange([{ type: 'position', id, position: { x: 60, y: 80 }, dragging: true }])
    store.onNodesChange([{ type: 'position', id, position: { x: 100, y: 120 }, dragging: false }])
    store.undo()
    expect(useCanvas.getState().nodes[0].position).toEqual({ x: 10, y: 20 })
    store.redo()
    expect(useCanvas.getState().nodes[0].position).toEqual({ x: 100, y: 120 })
  })

  it('空节点不作为参考素材，上传后可用且不虚构时长', () => {
    const store = useCanvas.getState()
    const id = store.addNode('video', { x: 0, y: 0 })
    expect(matOf(useCanvas.getState().nodes[0])).toBeNull()
    store.updateNode(id, { src: 'blob:uploaded' })
    expect(matOf(useCanvas.getState().nodes[0])).toMatchObject({ id, kind: 'video', dur: undefined })
  })

  it('不存在的来源不产生悬空连线', () => {
    const store = useCanvas.getState()
    const target = store.addNode('video', { x: 0, y: 0 })
    store.connect('missing', target)
    expect(useCanvas.getState().edges).toHaveLength(0)
  })
})
