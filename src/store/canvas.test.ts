import { beforeEach, describe, expect, it } from 'vitest'
import { opName, useCanvas } from './canvas'
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

  it('剪刀断开的是那一条线，两头的节点都留着，一次撤销就接回来', () => {
    const store = useCanvas.getState()
    const source = store.addNode('image', { x: 0, y: 0 })
    const target = store.spawnDownstream(source)!
    const edge = useCanvas.getState().edges[0].id
    store.disconnect(edge)
    expect(useCanvas.getState().edges).toHaveLength(0)
    expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual([source, target])
    store.undo()
    expect(useCanvas.getState().edges.map((e) => e.id)).toEqual([edge])
    // 已经断开过的那一条再剪一次不进撤销栈，⌘Z 不会莫名其妙退回更早的一步
    store.disconnect(edge)
    store.disconnect(edge)
    store.undo()
    expect(useCanvas.getState().edges.map((e) => e.id)).toEqual([edge])
  })

  it('不存在的来源不产生悬空连线', () => {
    const store = useCanvas.getState()
    const target = store.addNode('video', { x: 0, y: 0 })
    store.connect('missing', target)
    expect(useCanvas.getState().edges).toHaveLength(0)
  })
})

describe('操作节点的名字', () => {
  const node = (id: string, name: string, renamed?: boolean) =>
    ({ id, type: 'video', position: { x: 0, y: 0 }, data: { name, renamed } }) as never
  const on = (...names: string[]) => names.map((n, i) => node(`N${i}`, n))

  it('两件事同名，连着操作时把手数往下数，不把上一次的名字套进来', () => {
    const src = node('A', '视频节点1')
    // 编辑和延长长出来的节点叫同一个名字：分它们的是标题栏右边那枚徽章，不是名字
    expect(opName([src], 'edit', src)).toBe('局部修改视频：视频节点1')
    expect(opName([src], 'extend', src)).toBe('局部修改视频：视频节点1')

    const second = node('B', '局部修改视频：视频节点1')
    expect(opName([src, second], 'extend', second)).toBe('局部修改视频：视频节点1 · 2')
    const third = node('C', '局部修改视频：视频节点1 · 2')
    expect(opName([src, second, third], 'edit', third)).toBe('局部修改视频：视频节点1 · 3')
  })

  it('手动改过的名字整串当根，从第一手重新数', () => {
    const src = node('A', '主角特写', true)
    expect(opName([src], 'extend', src)).toBe('局部修改视频：主角特写')
    // 改的名字碰巧长得像自动名也照样当根：他手打的那串就是他要的名字
    const odd = node('B', '局部修改视频：旧稿', true)
    expect(opName([odd], 'edit', odd)).toBe('局部修改视频：局部修改视频：旧稿')
  })

  it('名字被占了接着往下数，改口时不算自己占着的那个', () => {
    const src = node('A', '视频节点1')
    const taken = on('局部修改视频：视频节点1')
    expect(opName([src, ...taken], 'edit', src)).toBe('局部修改视频：视频节点1 · 2')
    // 同一个还没出结果的节点从编辑改口成延长：它自己现在叫什么不挡自己的路
    const pending = node('P', '局部修改视频：视频节点1')
    expect(opName([src, pending], 'extend', src, 'P')).toBe('局部修改视频：视频节点1')
  })
})
