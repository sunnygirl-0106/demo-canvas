import { beforeEach, describe, expect, it } from 'vitest'
import { focusWidthFor, isFocusNode, shotName, useCanvas } from './canvas'
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

  it('截帧长出图片节点并连回源视频，连着截几张不叠在一起，一次撤销收回一张', () => {
    const store = useCanvas.getState()
    const src = store.addNode('video', { x: 0, y: 0 }, { src: 'blob:v', dur: 8 })
    const source = () => useCanvas.getState().nodes.find((n) => n.id === src)!
    const first = store.spawnShot(src, shotName(useCanvas.getState().nodes, '首帧', source()), 'data:first')!
    const last = store.spawnShot(src, shotName(useCanvas.getState().nodes, '尾帧', source()), 'data:last')!
    const shots = () => useCanvas.getState().nodes.filter((n) => n.type === 'image')
    expect(shots().map((n) => n.data.name)).toEqual(['首帧：视频节点1', '尾帧：视频节点1'])
    expect(shots().map((n) => n.data.src)).toEqual(['data:first', 'data:last'])
    // 两张都连回源视频，第二张落在第一张下面而不是叠在同一处
    expect(useCanvas.getState().edges.map((e) => [e.source, e.target])).toEqual([[src, first], [src, last]])
    expect(shots()[1].position.y).toBeGreaterThan(shots()[0].position.y)
    store.undo()
    expect(shots().map((n) => n.id)).toEqual([first])
    expect(useCanvas.getState().edges).toHaveLength(1)
  })

  it('同一段视频截第二张同名的帧，名字往下数而不是撞名', () => {
    const store = useCanvas.getState()
    const src = store.addNode('video', { x: 0, y: 0 }, { src: 'blob:v' })
    const source = () => useCanvas.getState().nodes.find((n) => n.id === src)!
    store.spawnShot(src, shotName(useCanvas.getState().nodes, '当前帧', source()), 'data:a')
    store.spawnShot(src, shotName(useCanvas.getState().nodes, '当前帧', source()), 'data:b')
    expect(useCanvas.getState().nodes.filter((n) => n.type === 'image').map((n) => n.data.name))
      .toEqual(['当前帧：视频节点1', '当前帧：视频节点1 · 2'])
  })

  it('不存在的来源不产生悬空连线', () => {
    const store = useCanvas.getState()
    const target = store.addNode('video', { x: 0, y: 0 })
    store.connect('missing', target)
    expect(useCanvas.getState().edges).toHaveLength(0)
  })
})

describe('节点编号由 store 自己数（§4.1）', () => {
  it('五类各一本账，删除不回退，也不去现有的名字里找最大号', () => {
    const store = useCanvas.getState()
    expect(store.claimName('video')).toBe('视频节点1')
    expect(store.claimName('image')).toBe('图片节点1')
    // 编辑和延长各有一本账：已经发过一个编辑视频1，延长出来的仍然从延长视频1 数起
    expect(store.claimName('edit')).toBe('编辑视频1')
    expect(store.claimName('extend')).toBe('延长视频1')
    expect(store.claimName('edit')).toBe('编辑视频2')
    // 用户把号改掉了，后面的编号不跟着它走 —— 编号只用来区分，不代表画布上还剩哪几个号
    const id = useCanvas.getState().addNode('video', { x: 0, y: 0 })
    expect(useCanvas.getState().nodes.find((n) => n.id === id)!.data.name).toBe('视频节点2')
    useCanvas.getState().updateNode(id, { name: '客厅沙发', renamed: true })
    expect(useCanvas.getState().claimName('video')).toBe('视频节点3')
    // 删掉也不回退
    const live = useCanvas.getState()
    live.onNodesChange(live.nodes.map((n) => ({ type: 'select', id: n.id, selected: true })))
    useCanvas.getState().deleteSelection()
    expect(useCanvas.getState().claimName('video')).toBe('视频节点4')
  })

  it('setAll 从场景里已有的默认名接着往下数，不撞号', () => {
    const node = (id: string, name: string) => ({ id, type: 'video', position: { x: 0, y: 0 }, data: { name } }) as never
    useCanvas.getState().setAll({ nodes: [node('A', '视频节点3'), node('B', '编辑视频1'), node('C', '客厅沙发')], edges: [] })
    expect(useCanvas.getState().claimName('video')).toBe('视频节点4')
    expect(useCanvas.getState().claimName('edit')).toBe('编辑视频2')
    expect(useCanvas.getState().claimName('extend')).toBe('延长视频1')
  })
})

describe('快捷入口子节点跟着源视频走（§3.2.1）', () => {
  /** 源视频 + 一个还没出片的子节点 + 一个已经出片的子节点 */
  const setup = () => {
    const store = useCanvas.getState()
    const src = store.addNode('video', { x: 0, y: 0 }, { src: 'blob:v', dur: 8 })
    const kid = useCanvas.getState().spawnDownstream(src, '编辑视频1')!
    useCanvas.getState().updateNode(kid, { operationSource: src })
    const done = useCanvas.getState().spawnDownstream(src, '编辑视频2')!
    useCanvas.getState().updateNode(done, { operationSource: src, src: 'blob:out' })
    return { src, kid, done }
  }
  const ids = () => useCanvas.getState().nodes.map((n) => n.id)

  it('两次派生不叠在一起：第二个落在第一个下面', () => {
    const { kid, done } = setup()
    const at = (id: string) => useCanvas.getState().nodes.find((n) => n.id === id)!.position
    expect(at(done).x).toBe(at(kid).x)
    expect(at(done).y).toBeGreaterThan(at(kid).y)
  })

  it('剪断那条线，还没出片的子节点一起删掉；已出片的留着', () => {
    const { src, kid, done } = setup()
    expect(isFocusNode(useCanvas.getState().nodes.find((n) => n.id === kid)!)).toBe(true)
    useCanvas.getState().disconnect(`e-${src}-${kid}`)
    expect(ids()).toEqual([src, done])
    // 一次撤销把线和节点一起接回来
    useCanvas.getState().undo()
    expect(ids()).toEqual([src, kid, done])
    // 剪断通向已出片那个的线：它自己留着
    useCanvas.getState().disconnect(`e-${src}-${done}`)
    expect(ids()).toEqual([src, kid, done])
  })

  it('删掉源视频，还没出片的子节点一起走；已出片的留着', () => {
    const { src, done } = setup()
    const live = useCanvas.getState()
    live.onNodesChange(live.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === src })))
    useCanvas.getState().deleteSelection()
    expect(ids()).toEqual([done])
  })
})

describe('专注态那块屏的大小', () => {
  /** 一块屏占多少地方 = 宽 × 高，高由宽和比例推出来 */
  const area = (ratio: number) => { const w = focusWidthFor(ratio); return w * (w / ratio) }

  it('横片和竖片占的地方一样大，竖片那一档一个像素都没动', () => {
    expect(focusWidthFor(9 / 16)).toBe(420)
    expect(focusWidthFor(16 / 9)).toBe(747)
    // 同一块面积摆成两个朝向，差的那点只是取整
    expect(Math.abs(area(16 / 9) - area(9 / 16))).toBeLessThan(1500)
  })

  it('方片落在两者之间，比例越横越宽', () => {
    expect(focusWidthFor(1)).toBe(560)
    expect(focusWidthFor(4 / 3)).toBeGreaterThan(focusWidthFor(1))
    expect(focusWidthFor(4 / 3)).toBeLessThan(focusWidthFor(16 / 9))
  })

  it('两头都收住：更窄的片子不比竖片再瘦，超宽片不许把一屏顶穿', () => {
    expect(focusWidthFor(0.4)).toBe(420)
    expect(focusWidthFor(21 / 9)).toBe(760)
    // 封面还没量出来就按竖片算，和从前一样
    expect(focusWidthFor(undefined)).toBe(420)
    expect(focusWidthFor(0)).toBe(420)
  })
})
