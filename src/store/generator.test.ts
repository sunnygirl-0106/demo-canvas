import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerator } from './generator'
import type { Mat, MatGet } from '../generator/materialLayout'
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
describe('模式草稿与源视频', () => {
  it('切换保留各自文字、参数、角色、范围与方向', () => {
    gs().patch('target', { prompt: '编辑草稿', scope: 'segment', range: { start: 3, end: 7 } })
    gs().setMode('target', 'extend', get)
    expect(state().range).toBeNull(); expect(state().direction).toBeNull()
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
    gs().setModel('target', '2.0', get)
    expect(state()).toMatchObject({ model: '2.0', mode: 'edit', prompt: '保留草稿', range: { start: 3, end: 7 } })
    gs().setModel('target', '2.5', get); expect(state().model).toBe('2.5')
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
    gs().setModel('target', '2.0', get)
    // 2.0 保留 1080p 与 9:16，只把 30s 收敛到上限 15s
    expect(state().params).toEqual({ duration: 15, resolution: '1080p', ratio: '9:16', sound: false })
    gs().setModel('target', '2.0-mini', get)
    expect(state().params.resolution).toBe('480p')
  })
})
