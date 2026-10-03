import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvas } from './canvas'
import { heldBy, useVersions, versionGroups, versionsOf, type VersionTask } from './versions'

const media = (src: string) => ({ src, poster: `${src}.jpg`, dur: 5 })
const task = (mode: VersionTask['mode']): VersionTask =>
  ({ mode, model: 'sd2.5', doc: [], params: { resolution: '720p', duration: 5, ratio: 'adaptive', sound: true },
    sourceId: null, direction: null })
const gen = task('text')
const edit = task('edit')
const v = () => useVersions.getState()
/** 衍生那一版的「基于 V 几」在提交那一刻就读出来（§3.5.2），所以这里也先读再记 */
const record = (id: string, nodeId: string, sourceNodeId: string | null, src: string, t: VersionTask | null) =>
  v().record({ id, nodeId, sourceNodeId, baseNo: sourceNodeId ? v().baseNoOf(sourceNodeId) : null,
    media: media(src), task: t })

beforeEach(() => {
  useCanvas.getState().setAll({ nodes: [], edges: [] })
  useVersions.getState().reset()
})

describe('版本归属', () => {
  it('从没生成过的原画面被补记成第一版，之后原地生成也不改写它', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('uploaded.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    record('t1', b, a, 'b.mp4', edit)
    expect(versionsOf(v().records, a)[0]).toMatchObject({ no: 1, task: null, media: { src: 'uploaded.mp4' } })

    // 在 A 上原地再生成一次：新的一版接在后面，原画面那一条还在，src 也还是旧的
    record('t2', a, null, 'regen.mp4', edit)
    useCanvas.getState().updateNode(a, media('regen.mp4'))
    expect(versionsOf(v().records, a).map((r) => r.media.src)).toEqual(['uploaded.mp4', 'b.mp4', 'regen.mp4'])
  })

  it('版本号按视频各自数，来源指向提交那一刻源视频显示的那一版', () => {
    // 视频节点1 生成两次 → 编辑出编辑视频1 → 编辑视频1 原地重做 → 对编辑视频1 再编辑出编辑视频2
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 })
    const b = canvas.addNode('video', { x: 0, y: 0 })
    const c = canvas.addNode('video', { x: 0, y: 0 })
    record('g1', a, null, 'a1.mp4', gen)
    record('g2', a, null, 'a2.mp4', gen)
    record('e1', b, a, 'b1.mp4', edit)
    record('e2', b, a, 'b2.mp4', edit)
    record('e3', c, b, 'c1.mp4', edit)
    const at = (id: string) => v().records.find((r) => r.id === id)!
    // 原地生成的那几版没有来源，baseNo 空着；衍生的那几版指向提交那一刻源视频显示的版本
    expect(['g2', 'e1', 'e2', 'e3'].map((id) => [at(id).no, at(id).baseNo])).toEqual([[2, null], [1, 2], [2, 2], [1, 2]])
  })

  it('每个衍生节点只收它第一次以本节点为源的那一版：下游重做不让上游多一张卡', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('a.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    record('e1', b, a, 'b1.mp4', edit)
    record('e2', b, a, 'b2.mp4', edit)
    record('e3', b, a, 'b3.mp4', edit)
    // 源视频这一屏：自己那一版 + 编辑视频的首次，共两条；下游重做几次都不改变这个数
    expect(versionGroups(v().records, a).derived.map((r) => r.id)).toEqual(['e1'])
    expect(versionsOf(v().records, a)).toHaveLength(2)
    // 下游自己那一屏照旧是三版
    expect(versionsOf(v().records, b).map((r) => r.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('只收一层：孙辈不进最上游那一屏', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('a.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    const c = canvas.addNode('video', { x: 0, y: 0 })
    record('e1', b, a, 'b1.mp4', edit)
    record('x1', c, b, 'c1.mp4', task('extend'))
    // a 那一屏：它自己那一版 + 编辑视频1，孙辈的延长视频不在里面
    expect(versionGroups(v().records, a).derived.map((r) => r.id)).toEqual(['e1'])
    expect(versionsOf(v().records, b).map((r) => r.id)).toEqual(['e1', 'x1'])
  })

  it('那一屏的次序：画布上现在显示的排头，其次本视频，最后衍生视频，各自新的在前', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 })
    const b = canvas.addNode('video', { x: 0, y: 0 })
    const c = canvas.addNode('video', { x: 0, y: 0 })
    record('g1', a, null, 'a1.mp4', gen)
    record('e1', b, a, 'b1.mp4', edit)
    record('g2', a, null, 'a2.mp4', gen)
    record('e2', c, a, 'c1.mp4', edit)
    const records = v().records
    const { own, derived } = versionGroups(records, a)
    expect(own[0].id).toBe(heldBy(records, a)!.id)
    expect(own.map((r) => r.id)).toEqual(['g2', 'g1'])
    // 两个衍生节点各出一张，新的在前
    expect(derived.map((r) => r.id)).toEqual(['e2', 'e1'])
  })

  it('「添加到画布」记作新节点的 V1，类型沿用原版本，而且不进源视频那一屏', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('a.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    useCanvas.getState().updateNode(b, { name: '编辑视频1' })
    record('e1', b, a, 'b1.mp4', edit)
    const before = versionsOf(v().records, a).length
    v().addToCanvas('e1')

    const fresh = useCanvas.getState().nodes[2]
    expect(fresh.data.name).toBe('视频节点3')
    // 新节点落在所属节点下方，不连线
    expect(fresh.position.y).toBeGreaterThan(useCanvas.getState().nodes[1].position.y)
    expect(useCanvas.getState().edges).toHaveLength(0)
    const copy = versionsOf(v().records, fresh.id)
    expect(copy).toHaveLength(1)
    expect(copy[0]).toMatchObject({ no: 1, copiedFrom: 'e1', sourceNodeId: a, baseNo: 1, task: { mode: 'edit' } })
    // 源视频那一屏一张不多：这不是它又做了一次衍生
    expect(versionsOf(v().records, a)).toHaveLength(before)
  })

  it('删掉画布上那一格，不删这段视频做过什么的记录', () => {
    const canvas = useCanvas.getState()
    const a = canvas.addNode('video', { x: 0, y: 0 }, media('a.mp4'))
    const b = canvas.addNode('video', { x: 0, y: 0 })
    useCanvas.getState().updateNode(b, { name: '编辑视频1' })
    record('e1', b, a, 'b1.mp4', edit)
    // 把编辑出来的那个节点选中、删掉
    const live = useCanvas.getState()
    live.onNodesChange(live.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === b })))
    useCanvas.getState().deleteSelection()

    expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual([a])
    const records = v().records
    // 那一版还在源视频的这一屏里，连它当时叫什么都还在（节点没了，名字只剩记录里这一份）
    expect(versionGroups(records, a).derived).toMatchObject([{ id: 'e1', name: '编辑视频1', media: { src: 'b1.mp4' } }])
    // 它自己那一屏照旧读得出：画面、来源、提示词都在记录上，不在节点上
    expect(versionsOf(records, b).map((r) => r.id)).toEqual(['e1'])
  })

  it('示例场景直接摆一屏历史：no 按每个节点出现的先后发', () => {
    const now = Date.now()
    v().seed([
      { id: 'b-v1', nodeId: 'B', name: '编辑视频1', sourceNodeId: 'A', baseNo: 1,
        createdAt: now - 1000, media: media('b1.mp4'), task: edit },
      { id: 'a-v1', nodeId: 'A', name: '客厅沙发', sourceNodeId: null, baseNo: null,
        createdAt: now - 9000, media: media('a1.mp4'), task: null },
      { id: 'a-v2', nodeId: 'A', name: '客厅沙发', sourceNodeId: null, baseNo: null,
        createdAt: now - 5000, media: media('a2.mp4'), task: gen },
    ])
    // 按时间先后排好，版本号跟着这个先后走
    expect(v().records.map((r) => [r.id, r.no])).toEqual([['a-v1', 1], ['a-v2', 2], ['b-v1', 1]])
    expect(heldBy(v().records, 'A')!.id).toBe('a-v2')
  })
})
