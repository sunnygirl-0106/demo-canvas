import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerator } from './generator'
import { taskError, modelBlockedReason, modelNote } from '../generator/videoTask'
import { modelForSource, tabStates, visibleRefs, type Mat, type MatGet } from '../generator/materialLayout'
import type { MarkGroup, TimeRange } from '../generator/marks'
/** 一组标记：第 t 秒圈了一处，可选再带一段时间。 */
const marks = (t: number, range: TimeRange | null = null): MarkGroup[] =>
  [{ id: 'g1', range, regions: [{ t, tool: 'box', rect: [0.2, 0.3, 0.2, 0.2] }] }]
let mats: Mat[]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const gs = () => useGenerator.getState()
const state = () => gs().get1('target')
beforeEach(() => {
  gs().reset()
  mats = [{ id: 'v', name: 'ABCD', kind: 'video', dur: 10, src: 'a.mp4', ready: true, grad: '' },
    { id: 'w', name: 'EFGH', kind: 'video', dur: 4, src: 'b.mp4', ready: true, grad: '' },
    { id: 'a', name: 'IJKL', kind: 'image', src: 'a.jpg', grad: '' }, { id: 'b', name: 'MNOP', kind: 'image', src: 'b.jpg', grad: '' }]
  gs().syncConn('target', ['v', 'w', 'a', 'b'], get)
  // 连入素材只落到参考素材；编辑是强意图，从视频节点入口显式进入
  gs().setMode('target', 'edit', get)
})
describe('模型置灰', () => {
  it('做不了当前这件事的型号一律灰掉：不支持这个模式、接不住已选范围、连接下没模式可进', () => {
    // 编辑模式下，别家模型压根没有编辑能力，列表里就不该还能选
    expect(modelBlockedReason(state(), 'kling-video-o1', get)).toContain('不支持编辑视频')
    expect(modelBlockedReason(state(), 'sd2.0', get)).toBe('')
    // 标了东西之后，不响应范围的 2.0 也跟着灰
    gs().patch('target', { marks: marks(3, { start: 3, end: 7 }) })
    expect(modelBlockedReason(state(), 'sd2.0', get)).toBe('Seedance 2.0 不支持局部编辑，移除标记后可切换')
    // 只做文生视频的型号，在这两个模式下都是「不支持这个模式」这条先拦住它
    expect(modelBlockedReason(state(), 'wan2.2-ti2v-5b', get)).toContain('不支持编辑视频')
    gs().setMode('target', 'ref', get)
    expect(modelBlockedReason(state(), 'wan2.2-ti2v-5b', get)).toContain('不支持全能参考')
    // 全能的型号在哪种模式下都选得了，不会出现所有型号全灰的死角
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
  })
  it('换只收参考图的型号不算「不支持」：Tab 自己改名落过去，不是一个走不出去的死角', () => {
    gs().setMode('target', 'ref', get)
    // 「先切到别的模式再选」这条出路在这里并不存在 —— 参考图在 2.5 下本来就是灰的，
    // 所以这一步不能把 Wan 灰掉，否则连了素材就再也选不到它
    expect(modelBlockedReason(state(), 'wan2.2', get)).toBe('')
    gs().setModel('target', 'wan2.2', get)
    expect(state().mode).toBe('refImage')
    const tabs = tabStates(state().conn, get, 'wan2.2')
    expect(tabs.find((t) => t.k === 'ref')).toBeUndefined()
    expect(tabs.find((t) => t.k === 'refImage')!.enabled).toBe(true)
    // 视频不参与：面板上不摆它，Tab 上说一句，生成按钮拿得到图所以照常亮着
    expect(visibleRefs(state().tray, 'refImage', 'wan2.2', get)).toEqual(['a', 'b'])
    expect(tabs.find((t) => t.k === 'refImage')!.note).toBe('视频不参与本次生成')
    // 换回来同样是改个名，不是「不支持参考图」
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
    gs().setModel('target', 'sd2.5', get)
    expect(state().mode).toBe('ref')
  })
  it('选得了但会变样的型号，在做选择之前就说：换过去落到哪、什么素材从此不参与', () => {
    gs().setMode('target', 'ref', get)
    // 连着两段视频两张图，Wan 只收参考图：换之前就说清楚会落到哪、哪些素材不参与
    expect(modelNote(state(), 'wan2.2', get)).toBe('视频不参与本次生成')
    // 当前这个型号自己不说；灰掉的型号有自己的理由，不叠加这一句
    expect(modelNote(state(), 'sd2.5', get)).toBe('')
    expect(modelNote(state(), 'wan2.2-ti2v-5b', get)).toBe('')
    // 换过去之后 Tab 上挂的是同一句话 —— 提前说的和到了那儿说的不能是两回事
    gs().setModel('target', 'wan2.2', get)
    expect(tabStates(state().conn, get, 'wan2.2').find((t) => t.k === state().mode)!.note)
      .toBe('视频不参与本次生成')
  })
  it('换过去会让参考视频不合规的型号也灰掉，不等提交才报', () => {
    // 源视频 10 秒两个型号都收，但 3 秒的参考视频只有 2.0 收得下
    mats.push({ id: 'r', name: 'QRST', kind: 'video', dur: 3, src: 'r.mp4', ready: true, grad: '' })
    gs().syncConn('target', ['v', 'r'], get)
    gs().setMode('target', 'edit', get)
    gs().setModel('target', 'sd2.0', get)
    expect(state().tray).toContain('r')
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('视频 QRST 的时长需在 4–30 秒之间')
    // 反过来从 2.5 看 2.0 的下限是放宽，不拦
    gs().setModel('target', 'sd2.0', get)
    expect(modelBlockedReason(state(), 'sd2.0', get)).toBe('')
  })
  it('2.0 的输入上限比 2.5 严：单个 15 秒、合计 15 秒，超了的型号也灰掉', () => {
    // 16 秒的源视频 2.5 收得下（2–30 秒），2.0 收不下（2–15 秒）—— 指名是哪一段，不说「都不在区间内」
    mats[0].dur = 16
    gs().syncConn('target', ['v'], get)
    gs().setMode('target', 'edit', get)
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
    for (const m of ['sd2.0', 'sd2.0-fast', 'sd2.0-mini'] as const) {
      expect(modelBlockedReason(state(), m, get)).toBe('视频 ABCD 的时长需在 2–15 秒之间')
    }
    // 单个都合规、合计超了的情况：10 + 8 秒在 2.5 的 30 秒内，却过不了 2.0 的 15 秒
    mats[0].dur = 10
    mats.push({ id: 'r', name: 'QRST', kind: 'video', dur: 8, src: 'r.mp4', ready: true, grad: '' })
    gs().syncConn('target', ['v', 'r'], get)
    gs().setMode('target', 'edit', get)
    expect(state().tray).toContain('r')
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
    expect(modelBlockedReason(state(), 'sd2.0', get)).toBe('视频总时长为 18 秒，超过 Seedance 2.0 的 15 秒上限')
  })
})
describe('模式草稿与源视频', () => {
  it('切换保留各自文字、参数、角色、标记与方向', () => {
    gs().patch('target', { prompt: '编辑草稿', marks: marks(3, { start: 3, end: 7 }) })
    gs().setMode('target', 'extend', get)
    expect(state().marks).toEqual([]); expect(state().direction).toBe('after')
    gs().patch('target', { prompt: '续写草稿', direction: 'before', params: { ...state().params, duration: 30 } })
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ prompt: '编辑草稿', marks: marks(3, { start: 3, end: 7 }), params: { duration: 5 } })
    gs().setMode('target', 'extend', get)
    expect(state()).toMatchObject({ prompt: '续写草稿', direction: 'before', params: { duration: 30 }, marks: [] })
  })
  it('更换源视频清除标记且保留文字，旧源不会变成参考素材', () => {
    gs().patch('target', { prompt: '改椅子', marks: marks(3, { start: 3, end: 7 }) })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ slotEdit: 'w', marks: [], prompt: '改椅子' })
    expect(state().tray).not.toContain('v')
  })
  it('同一节点上传替换文件，连线不变也清除当前和历史草稿里的标记', () => {
    gs().patch('target', { prompt: '改椅子', marks: marks(3, { start: 3, end: 7 }) })
    gs().setMode('target', 'ref', get)
    mats[0].src = 'new.mp4'; gs().syncSources('target', get)
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ marks: [], prompt: '改椅子', sourceSrc: 'new.mp4' })
  })
  it('移除首帧、切换、再次同步均不自动补位，历史连接保留', () => {
    gs().setMode('target', 'frames', get); gs().removeMaterial('target', 'a', get)
    gs().setMode('target', 'ref', get); gs().setMode('target', 'frames', get)
    gs().syncConn('target', ['v', 'w', 'a', 'b'], get)
    expect(state()).toMatchObject({ slotFirst: null, slotLast: 'b' }); expect(state().conn).toHaveLength(4)
  })
  it('切换模型永远允许，不改变模式与草稿，只收敛参数', () => {
    gs().setMode('target', 'edit', get)
    gs().patch('target', { marks: marks(3, { start: 3, end: 7 }), prompt: '保留草稿' })
    gs().setModel('target', 'sd2.0', get)
    expect(state()).toMatchObject({ model: 'sd2.0', mode: 'edit', prompt: '保留草稿', marks: marks(3, { start: 3, end: 7 }) })
    gs().setModel('target', 'sd2.5', get); expect(state().model).toBe('sd2.5')
  })
  it('切到没有编辑能力的模型时落回参考素材，编辑草稿仍然留着', () => {
    gs().setMode('target', 'edit', get)
    gs().patch('target', { prompt: '把椅子改成红色' })
    // 可灵没有编辑能力，留在灰掉的 Tab 上会报一个用户改不动的错
    gs().setModel('target', 'kling-video-o1', get)
    expect(state()).toMatchObject({ model: 'kling-video-o1', mode: 'ref' })
    gs().setModel('target', 'sd2.5', get); gs().setMode('target', 'edit', get)
    expect(state().prompt).toBe('把椅子改成红色')
  })
  it('任务保存不可变快照；完成任务不回写媒体或污染新草稿', () => {
    gs().patch('target', { prompt: '把椅子改成红色', marks: marks(3, { start: 3, end: 7 }) })
    const taskId = gs().submit('target', get)
    gs().patch('target', { prompt: '新要求', marks: marks(6, { start: 6, end: 10 }) })
    expect(state().tasks[0].payload).toMatchObject({ prompt: '把椅子改成红色', range: { start: 3, end: 7 }, demo: true })
    expect(state().tasks[0].payload.marks[0].regions[0].t).toBe(3)
    gs().complete('target', taskId)
    expect(state().tasks[0].status).toBe('complete'); expect(state().prompt).toBe('新要求')
  })
})

describe('源资产身份校验', () => {
  it('不同资产使用同一媒体文件时，换源仍清空旧标记', () => {
    mats[1].src = mats[0].src
    gs().patch('target', { marks: marks(3, { start: 3, end: 7 }), prompt: '保持用户文字' })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ marks: [], prompt: '保持用户文字', sourceId: 'w' })
  })
})

describe('初次连接与参数兼容', () => {
  it('连入素材一律落到参考素材；编辑与延长只从视频节点入口显式进入', () => {
    gs().syncConn('empty', [], get)
    expect(gs().get1('empty').mode).toBe('text')
    gs().syncConn('empty', ['v'], get)
    expect(gs().get1('empty').mode).toBe('ref')
  })
  it('手动选过的 Tab 不被抢走；失效时才切走（原因挂在灰 Tab 上，不再弹横幅）', () => {
    gs().syncConn('pin', ['a', 'b'], get)
    gs().setMode('pin', 'frames', get)
    gs().syncConn('pin', ['a', 'b', 'v'], get)
    expect(gs().get1('pin').mode).toBe('frames')
    gs().syncConn('pin', ['v'], get)
    expect(gs().get1('pin').mode).toBe('ref')
    gs().syncConn('pin', [], get)
    expect(gs().get1('pin').mode).toBe('text')
  })
  it('参数落在集合外时收敛到最近的合法值，而不是置灰', () => {
    gs().setMode('target', 'ref', get)
    gs().patch('target', { params: { duration: 30, resolution: '1080p', ratio: '9:16', sound: false } })
    gs().setModel('target', 'sd2.0', get)
    // 2.0 保留 1080p 与 9:16，只把 30s 收敛到上限 15s
    expect(state().params).toEqual({ duration: 15, resolution: '1080p', ratio: '9:16', sound: false })
    gs().setModel('target', 'sd2.0-mini', get)
    expect(state().params.resolution).toBe('480p')
  })
})

/**
 * 「不符合要求」永远发生在用户做选择之前：Tab / 型号 / 素材缩略图上置灰并悬浮说明，
 * 没有一句话是等用户选完了才冒出来的黄字。
 */
describe('事前置灰，不事后报错', () => {
  it('第一段视频不合规时，编辑入口就是灰的 —— 不替用户换成画布上另一段合规的', () => {
    mats[1].dur = 3   // 连着的第一段是 3 秒：2.5 编辑要 4 秒起
    gs().syncConn('pick', ['w', 'v'], get)
    const why = tabStates(['w', 'v'], get, 'sd2.5', () => null).find((t) => t.k === 'edit')!
    expect(why.enabled).toBe(false)
    expect(why.reason).toBe('视频 EFGH 的时长需在 4–30 秒之间；可切换至 Seedance 2.0')
    // 反过来，把合规的那段排在前面才进得去，选哪一段始终是用户自己的动作
    expect(tabStates(['v', 'w'], get, 'sd2.5', () => null).find((t) => t.k === 'edit')!.enabled).toBe(true)
    // 真进去了也只会拿第一段，不会被悄悄换掉
    gs().syncConn('pick2', ['v', 'w'], get)
    gs().setMode('pick2', 'edit', get)
    expect(gs().get1('pick2').slotEdit).toBe('v')
  })
  it('只有一段 3 秒视频时，编辑 Tab 在 2.5 下就是灰的，并指出换哪个型号', () => {
    mats[1].dur = 3
    gs().syncConn('only', ['w'], get)
    const edit = tabStates(['w'], get, 'sd2.5').find((t) => t.k === 'edit')!
    expect(edit.enabled).toBe(false)
    expect(edit.reason).toBe('视频 EFGH 的时长需在 4–30 秒之间；可切换至 Seedance 2.0')
    // 从视频节点入口进来时按「这一段」挑型号，落地就是能用的组合，不是一个灰面板
    expect(modelForSource('edit', ['w'], get, 'w', 'sd2.5')).toBe('sd2.0')
  })
  it('新连进来的素材在编辑里用不上，就当场带他去参考素材，编辑草稿留着', () => {
    mats[1].dur = 3            // 3 秒：编辑要 4 秒起，参考素材 2 秒起就收
    gs().syncConn('jump', ['v'], get)
    gs().setMode('jump', 'edit', get)
    gs().patch('jump', { prompt: '把椅子改成红色' })
    gs().syncConn('jump', ['v', 'w'], get)
    // 跳过去了，而不是把一段用不上的缩略图塞在编辑面板上
    expect(gs().get1('jump').mode).toBe('ref')
    // 这段素材在参考素材里正常参与
    expect(visibleRefs(gs().get1('jump').tray, 'ref', 'sd2.5', get)).toContain('w')
    // 编辑那边原封不动：源视频还是原来那段，文字也还在
    gs().setMode('jump', 'edit', get)
    expect(gs().get1('jump')).toMatchObject({ slotEdit: 'v', prompt: '把椅子改成红色' })
    // 编辑面板上不摆它，只在 Tab 悬浮说明里提一句
    expect(visibleRefs(gs().get1('jump').tray, 'edit', 'sd2.5', get)).not.toContain('w')
    expect(tabStates(['v', 'w'], get, 'sd2.5', () => 'v').find((t) => t.k === 'edit')!.note)
      .toBe('视频 EFGH 的时长需在 4–30 秒之间，不参与本次生成')
  })
  it('时长晚一步读出来：读到的那一刻把型号收敛过去，不留下一句事后的黄字', () => {
    // 进来时还在读时长（dur 未知），面板先放行
    mats[1].dur = undefined
    gs().syncConn('late', ['w'], get)
    gs().setMode('late', 'edit', get)
    expect(gs().get1('late')).toMatchObject({ mode: 'edit', model: 'sd2.5', slotEdit: 'w' })
    // 读出来是 3 秒：2.5 编辑接不住，自动落到接得住的 2.0，模式与草稿都留着
    mats[1].dur = 3
    gs().syncSources('late', get)
    expect(gs().get1('late')).toMatchObject({ mode: 'edit', model: 'sd2.0', slotEdit: 'w' })
    expect(taskError({ ...gs().get1('late'), prompt: '把椅子改成红色' }, get)).toBeNull()
    // 读出来是 1 秒：1 秒的视频哪种任务都用不上，当场跳回参考素材，而不是停在编辑里报错
    mats[1].dur = 1
    gs().syncSources('late', get)
    expect(gs().get1('late').mode).toBe('ref')
    // 落脚的参考素材进得去，但那一段本次不参与，理由是一句话的门槛
    const states = tabStates(['w'], get, 'sd2.5')
    expect(states.find((t) => t.k === 'edit')!.reason).toBe('视频 EFGH 的时长需在 2–30 秒之间')
    expect(states.find((t) => t.k === 'ref')!.note).toBe('视频 EFGH 的时长需在 2–30 秒之间，不参与本次生成')
    expect(taskError({ ...gs().get1('late'), prompt: '海边日落' }, get)).toBe('视频 EFGH 的时长需在 2–30 秒之间')
  })
})

/** 连续操作：单步都对，连起来才暴露的状态问题。 */
describe('连续操作', () => {
  it('断开源视频再接新视频，编辑草稿的文字还在，标记随源作废', () => {
    gs().syncConn('flow', ['v', 'a'], get)
    gs().setMode('flow', 'edit', get)
    gs().patch('flow', { prompt: '仅把衣服改成蓝色', marks: marks(3, { start: 3, end: 7 }) })
    // 断开视频只留图片：编辑进不去，被动切到参考素材
    gs().syncConn('flow', ['a'], get)
    expect(gs().get1('flow').mode).toBe('ref')
    // 接上另一段视频后回到编辑：文字留着，标记因为换源而清空 —— 标的是上一段画面上的东西
    gs().syncConn('flow', ['a', 'w'], get)
    gs().setMode('flow', 'edit', get)
    expect(gs().get1('flow')).toMatchObject({ prompt: '仅把衣服改成蓝色', marks: [], slotEdit: 'w' })
  })
  it('切到可灵再切回 2.5，恢复出来的编辑草稿不会带着不支持编辑的模型', () => {
    gs().patch('target', { prompt: '把椅子改成红色' })
    gs().setModel('target', 'kling-video-o1', get)
    expect(state()).toMatchObject({ mode: 'ref', model: 'kling-video-o1' })
    gs().setModel('target', 'sd2.5', get)
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ mode: 'edit', model: 'sd2.5', prompt: '把椅子改成红色' })
    expect(taskError(state(), get)).toBeNull()
  })
  it('切到不响应范围的型号，标记留着，只是生成按钮灰掉 —— 手画的东西不能被一次换型号抹掉', () => {
    gs().patch('target', { prompt: '把椅子改成红色', marks: marks(3, { start: 3, end: 7 }) })
    // 不响应范围的模型在选择列表里就是灰的，用户在做选择之前已经看到原因
    expect(modelBlockedReason(state(), 'sd2.0', get)).toContain('不支持局部编辑')
    gs().setModel('target', 'sd2.0', get)
    expect(state()).toMatchObject({ model: 'sd2.0', mode: 'edit', marks: marks(3, { start: 3, end: 7 }) })
    // 留着不等于放行：生成按钮说得出是被哪几组挡住的，出口是「移除标记，改整条」
    expect(taskError(state(), get)).toContain('不支持局部编辑')
    gs().patch('target', { marks: [] })
    expect(taskError(state(), get)).toBeNull()
  })
  it('五个模式全部置灰时也提交不了：模式入口与生成校验共用一条素材规则', () => {
    gs().setMode('target', 'ref', get)
    gs().setModel('target', 'wan2.2-ti2v-5b', get)
    gs().patch('target', { prompt: '海边日落' })
    const g = state()
    expect(tabStates(g.conn, get, g.model).some((t) => t.enabled)).toBe(false)
    expect(taskError(g, get)).toBeTruthy()
    expect(() => gs().submit('target', get)).toThrow()
  })
})
