import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerator } from './generator'
import { taskError, modelBlockedReason } from '../generator/videoTask'
import { tabStates, type Mat, type MatGet } from '../generator/materialLayout'
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
    { id: 'a', name: 'IJKL', kind: 'image', src: 'a.jpg', grad: '' }, { id: 'b', name: 'MNOP', kind: 'image', src: 'b.jpg', grad: '' },
    { id: 'x', name: 'QRST', kind: 'image', src: 'x.jpg', grad: '' }]
  // 一段视频 + 两张图片接进空节点：落位自己就落到编辑视频（源视频 v、参考 a / b）
  gs().syncConn('target', ['v', 'a', 'b'], get)
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
    // 只留两张图：视频它一段都收不下，那是「素材超限」那条规则的事，不是「不支持参考图」
    gs().syncConn('target', ['a', 'b'], get)
    gs().setMode('target', 'ref', get)
    // 「先切到别的模式再选」这条出路在这里并不存在 —— 参考图在 2.5 下本来就是灰的，
    // 所以这一步不能把 Wan 灰掉，否则连了素材就再也选不到它
    expect(modelBlockedReason(state(), 'wan2.2', get)).toBe('')
    gs().setModel('target', 'wan2.2', get)
    expect(state().mode).toBe('refImage')
    const tabs = tabStates(state().conn, get, 'wan2.2')
    expect(tabs.find((t) => t.k === 'ref')).toBeUndefined()
    expect(tabs.find((t) => t.k === 'refImage')!.enabled).toBe(true)
    // 换回来同样是改个名，不是「不支持参考图」
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
    gs().setModel('target', 'sd2.5', get)
    expect(state().mode).toBe('ref')
  })
  it('换过去会让参考视频不合规的型号也灰掉，不等提交才报', () => {
    // 源视频 10 秒两个型号都收，但 20 秒的参考视频只有 2.5 收得下
    mats.push({ id: 'r', name: 'QRST', kind: 'video', dur: 20, src: 'r.mp4', ready: true, grad: '' })
    gs().syncConn('target', ['v', 'r'], get)
    gs().setMode('target', 'edit', get)
    expect(state().tray).toContain('r')
    expect(modelBlockedReason(state(), 'sd2.0', get)).toBe('视频 QRST 的时长需在 4–15 秒之间')
    // 手上这个型号收得下，它那一行就不灰
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
  })
  it('2.0 的输入上限比 2.5 严：单个 15 秒、合计 15 秒，超了的型号也灰掉', () => {
    // 16 秒的源视频 2.5 收得下（2–30 秒），2.0 收不下（2–15 秒）—— 指名是哪一段，不说「都不在区间内」
    mats[0].dur = 16
    gs().syncConn('target', ['v'], get)
    gs().setMode('target', 'edit', get)
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
    for (const m of ['sd2.0', 'sd2.0-fast', 'sd2.0-mini'] as const) {
      expect(modelBlockedReason(state(), m, get)).toBe('视频 ABCD 的时长需在 4–15 秒之间')
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
  it('更换源视频清除标记且保留文字，旧源不会变成参考素材', () => {
    // 第二段视频一接上，落位就把人送去全能参考；这条用例问的是「换源」，明写一句切回编辑
    gs().syncConn('target', ['v', 'w', 'a', 'b'], get); gs().setMode('target', 'edit', get)
    gs().patch('target', { prompt: '改椅子', marks: marks(3, { start: 3, end: 7 }) })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ slotEdit: 'w', marks: [], prompt: '改椅子' })
    expect(state().tray).not.toContain('v')
  })
  it('同一节点上传替换文件，连线不变也清除这一份句子里的标记', () => {
    gs().patch('target', { prompt: '改椅子', marks: marks(3, { start: 3, end: 7 }) })
    gs().setMode('target', 'ref', get)
    mats[0].src = 'new.mp4'; gs().syncSources('target', get)
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ marks: [], prompt: '改椅子', sourceSrc: 'new.mp4' })
  })
  it('剪断首帧由尾帧递补，历史连接保留', () => {
    // 两张图片接进空节点就落首尾帧：① 首帧、② 尾帧
    gs().syncConn('fr', ['a', 'b'], get)
    expect(gs().get1('fr')).toMatchObject({ mode: 'frames', slotFirst: 'a', slotLast: 'b' })
    // 剪断首帧那条线：尾帧升上来，尾帧位空出来等下一张
    gs().syncConn('fr', ['b'], get)
    expect(gs().get1('fr')).toMatchObject({ mode: 'frames', slotFirst: 'b', slotLast: null })
    expect(gs().get1('fr').conn).toEqual(['b'])
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
    gs().syncConn('target', ['v', 'w', 'a', 'b'], get); gs().setMode('target', 'edit', get)
    gs().patch('target', { marks: marks(3, { start: 3, end: 7 }), prompt: '保持用户文字' })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ marks: [], prompt: '保持用户文字', sourceId: 'w' })
  })
})

describe('初次连接与参数兼容', () => {
  it('空节点接进来的是什么就去做什么：视频落编辑视频，图片落首尾帧', () => {
    gs().syncConn('empty', [], get)
    expect(gs().get1('empty').mode).toBe('text')
    // 空节点上被接了一段视频，他要做的十有八九是改这段视频
    gs().syncConn('empty', ['v'], get)
    expect(gs().get1('empty')).toMatchObject({ mode: 'edit', slotEdit: 'v' })
    // 只有图片时编辑进不去，落首尾帧 —— 同一句话的另一半
    gs().syncConn('pic', ['a', 'b'], get)
    expect(gs().get1('pic')).toMatchObject({ mode: 'frames', slotFirst: 'a', slotLast: 'b' })
    // 首尾帧只有两个席位：第 3 张图片容纳不下，这才落到参考
    gs().syncConn('pic3', ['a', 'b', 'x'], get)
    expect(gs().get1('pic3').mode).toBe('ref')
  })
  it('接上第二段视频就转全能参考：编辑只承载一段，两段同为参考视频', () => {
    gs().syncConn('two', ['v'], get)
    expect(gs().get1('two')).toMatchObject({ mode: 'edit', slotEdit: 'v' })
    gs().syncConn('two', ['v', 'w'], get)
    expect(gs().get1('two').mode).toBe('ref')
    expect(gs().get1('two').tray).toEqual(['v', 'w'])
  })
  it('首尾帧连进视频后转去参考，提示词不丢', () => {
    gs().syncConn('pin', ['a', 'b'], get)
    gs().setMode('pin', 'frames', get)
    gs().syncConn('pin', ['a', 'b', 'v'], get)
    expect(gs().get1('pin').mode).toBe('ref')
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
  it('时长不合规不改变落位：3 秒的视频照样落编辑视频，话由生成按钮说', () => {
    mats[1].dur = 3   // 2.5 编辑要 4 秒起，可它仍然是一段视频
    gs().syncConn('only', ['w'], get)
    expect(gs().get1('only')).toMatchObject({ mode: 'edit', slotEdit: 'w' })
    // 入口不灰：灰的是生成按钮，它说得出差在哪 —— 也没有「换个型号可以」这条出路
    expect(tabStates(['w'], get, 'sd2.5').find((t) => t.k === 'edit')!.enabled).toBe(true)
    expect(taskError(gs().get1('only'), get)).toBe('视频 EFGH 的时长需在 4–30 秒之间')
  })
  it('真进了编辑也只会拿连着的第一段，不会被悄悄换掉', () => {
    mats[1].dur = 3
    gs().syncConn('pick2', ['v'], get)
    gs().setMode('pick2', 'edit', get)
    expect(gs().get1('pick2').slotEdit).toBe('v')
  })
  it('新接进来的不合规素材不把人从任务里赶走：保留任务与草稿，只是不能生成', () => {
    // 读不出来的那张图片：容纳得下（类型与席位都对），只是生成不了
    mats.push({ id: 'bad', name: 'UVWX', kind: 'image', src: 'bad.jpg', grad: '', error: '无法读取' })
    gs().syncConn('jump', ['v'], get)
    gs().setMode('jump', 'edit', get)
    gs().patch('jump', { prompt: '把椅子改成红色' })
    gs().syncConn('jump', ['v', 'bad'], get)
    // 编辑还容纳得下，就不为了绕开这份素材自动切模式
    expect(gs().get1('jump')).toMatchObject({ mode: 'edit', slotEdit: 'v', prompt: '把椅子改成红色' })
    expect(taskError(gs().get1('jump'), get)).toBe('图片 UVWX 无法读取，可尝试重新上传')
  })
  it('时长晚一步读出来：落位不动，型号也不动，只是生成不了', () => {
    // 进来时还在读时长（dur 未知），面板先放行
    mats[1].dur = undefined
    gs().syncConn('late', ['w'], get)
    expect(gs().get1('late')).toMatchObject({ mode: 'edit', model: 'sd2.5', slotEdit: 'w' })
    // 读出来是 3 秒：它仍然是一段视频，仍然落在编辑视频上 —— 时长不是「进不进得去」
    mats[1].dur = 3
    gs().syncSources('late', get)
    expect(gs().get1('late')).toMatchObject({ mode: 'edit', model: 'sd2.5', slotEdit: 'w' })
    // 那句 4 秒的原因挂在生成按钮上
    expect(taskError({ ...gs().get1('late'), prompt: '海边日落' }, get)).toBe('视频 EFGH 的时长需在 4–30 秒之间')
  })
  it('当前型号一个模式都容纳不了时自动换型号，草稿跟着人走', () => {
    // 首尾帧里连进视频，而当前型号只做文生视频：这个型号下一个模式都进不去
    gs().syncConn('stay', ['a', 'b'], get)
    gs().setMode('stay', 'frames', get)
    gs().patch('stay', { prompt: '从第一张走到第二张' })
    gs().setModel('stay', 'wan2.2-ti2v-5b', get)
    gs().syncConn('stay', ['a', 'b', 'v'], get)
    // 换成容纳得下的型号再落位，而不是把人钉在一个做不成的 Tab 上让生成按钮报错
    expect(gs().get1('stay')).toMatchObject({ model: 'sd2.5', mode: 'ref' })
    expect(gs().get1('stay').prompt).toBe('从第一张走到第二张')
    expect(gs().get1('stay').conn).toEqual(['a', 'b', 'v'])
  })
  it('只收图的型号上接进一段视频：换成接得住它的型号并落位，不是停在参考图上报错', () => {
    gs().syncConn('wan', [], get)
    gs().setModel('wan', 'wan2.2', get)
    gs().syncConn('wan', ['v', 'a'], get)
    expect(gs().get1('wan')).toMatchObject({ model: 'sd2.5', mode: 'edit', slotEdit: 'v' })
    expect(gs().get1('wan').tray).toEqual(['a'])
    expect(taskError(gs().get1('wan'), get)).toBeNull()
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
    // 这个型号在模型列表里本来就是灰的，人不该走到这一步；走到了也提交不了
    expect(modelBlockedReason(g, g.model, get)).toBeTruthy()
    expect(taskError(g, get)).toBeTruthy()
    expect(() => gs().submit('target', get)).toThrow()
  })
})
