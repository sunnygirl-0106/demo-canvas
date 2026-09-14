import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerator } from './generator'
import { taskError, modelBlockedReason } from '../generator/videoTask'
import { tabStates, type Mat, type MatGet } from '../generator/materialLayout'
let mats: Mat[]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const gs = () => useGenerator.getState()
const state = () => gs().get1('target')
beforeEach(() => {
  gs().reset()
  mats = [{ id: 'v', name: 'ABCD', kind: 'video', dur: 15.1, src: 'a.mp4', ready: true, grad: '' },
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
    // 选了「改这一段」之后，不响应秒数的 2.0 也跟着灰
    gs().patch('target', { scope: 'segment', range: { start: 3, end: 7 } })
    expect(modelBlockedReason(state(), 'sd2.0', get)).toContain('不响应秒数')
    // 只做文生视频的型号，在这两个模式下都是「不支持这个模式」这条先拦住它
    expect(modelBlockedReason(state(), 'wan2.2-ti2v-5b', get)).toContain('不支持编辑视频')
    gs().setMode('target', 'ref', get)
    expect(modelBlockedReason(state(), 'wan2.2-ti2v-5b', get)).toContain('不支持参考素材')
    // 全能的型号在哪种模式下都选得了，不会出现所有型号全灰的死角
    expect(modelBlockedReason(state(), 'sd2.5', get)).toBe('')
  })
})
describe('模式草稿与源视频', () => {
  it('切换保留各自文字、参数、角色、范围与方向', () => {
    gs().patch('target', { prompt: '编辑草稿', scope: 'segment', range: { start: 3, end: 7 } })
    gs().setMode('target', 'extend', get)
    expect(state().range).toBeNull(); expect(state().direction).toBe('after')
    gs().patch('target', { prompt: '续写草稿', direction: 'before', params: { ...state().params, duration: 30 } })
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ prompt: '编辑草稿', range: { start: 3, end: 7 }, params: { duration: 5 } })
    gs().setMode('target', 'extend', get)
    expect(state()).toMatchObject({ prompt: '续写草稿', direction: 'before', params: { duration: 30 }, range: null })
  })
  it('更换源视频清除范围且保留文字，旧源不会变成参考素材', () => {
    gs().patch('target', { prompt: '改椅子', range: { start: 3, end: 7 } })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ slotEdit: 'w', range: null, prompt: '改椅子' })
    expect(state().tray).not.toContain('v'); expect(state().notice).toContain('重新检查')
  })
  it('同一节点上传替换文件，连线不变也清除当前和历史草稿的时间引用', () => {
    gs().patch('target', { prompt: '改椅子', range: { start: 3, end: 7 } })
    gs().setMode('target', 'ref', get)
    mats[0].src = 'new.mp4'; gs().syncSources('target', get)
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ range: null, prompt: '改椅子', sourceSrc: 'new.mp4' })
  })
  it('移除首帧、切换、再次同步均不自动补位，历史连接保留', () => {
    gs().setMode('target', 'frames', get); gs().removeMaterial('target', 'a', get)
    gs().setMode('target', 'ref', get); gs().setMode('target', 'frames', get)
    gs().syncConn('target', ['v', 'w', 'a', 'b'], get)
    expect(state()).toMatchObject({ slotFirst: null, slotLast: 'b' }); expect(state().conn).toHaveLength(4)
  })
  it('切换模型永远允许，不改变模式与草稿，只收敛参数', () => {
    gs().setMode('target', 'edit', get)
    gs().patch('target', { range: { start: 3, end: 7 }, prompt: '保留草稿' })
    gs().setModel('target', 'sd2.0', get)
    expect(state()).toMatchObject({ model: 'sd2.0', mode: 'edit', prompt: '保留草稿', range: { start: 3, end: 7 } })
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
    gs().patch('target', { prompt: '把椅子改成红色', scope: 'segment', range: { start: 3, end: 7 } })
    const taskId = gs().submit('target', get)
    gs().patch('target', { prompt: '新要求', range: { start: 6, end: 10 } })
    expect(state().tasks[0].payload).toMatchObject({ prompt: '把椅子改成红色', range: { start: 3, end: 7 }, demo: true })
    gs().complete('target', taskId)
    expect(state().tasks[0].status).toBe('complete'); expect(state().prompt).toBe('新要求')
  })
})

describe('源资产身份校验', () => {
  it('不同资产使用同一媒体文件时，换源仍清空旧选区', () => {
    mats[1].src = mats[0].src
    gs().patch('target', { scope: 'segment', range: { start: 3, end: 7 }, prompt: '保持用户文字' })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ range: null, prompt: '保持用户文字', sourceId: 'w' })
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
    expect(gs().get1('pin').notice).toBe('')
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

/** 连续操作：单步都对，连起来才暴露的状态问题。 */
describe('连续操作', () => {
  it('断开源视频再接新视频，编辑草稿的文字与局部意图都还在', () => {
    gs().syncConn('flow', ['v', 'a'], get)
    gs().setMode('flow', 'edit', get)
    gs().patch('flow', { prompt: '仅把衣服改成蓝色', scope: 'segment', range: { start: 3, end: 7 } })
    // 断开视频只留图片：编辑进不去，被动切到参考素材
    gs().syncConn('flow', ['a'], get)
    expect(gs().get1('flow').mode).toBe('ref')
    // 接上另一段视频后回到编辑：文字与「改这一段」都在，选区因为换源而清空
    gs().syncConn('flow', ['a', 'w'], get)
    gs().setMode('flow', 'edit', get)
    expect(gs().get1('flow')).toMatchObject({ prompt: '仅把衣服改成蓝色', scope: 'segment', range: null, slotEdit: 'w' })
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
  it('换源后范围待重选，仍然算「改这一段」，不被模型切换悄悄放大成整条', () => {
    gs().patch('target', { prompt: '把椅子改成红色', scope: 'segment', range: { start: 3, end: 7 } })
    gs().applyDrop('target', 'w', 'edit', null, get)
    expect(state()).toMatchObject({ scope: 'segment', range: null })
    // 不响应秒数的模型在选择列表里仍然是灰的
    expect(modelBlockedReason(state(), 'sd2.0', get)).toContain('不响应秒数')
    gs().setModel('target', 'sd2.0', get)
    expect(state().scope).toBe('segment')
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
