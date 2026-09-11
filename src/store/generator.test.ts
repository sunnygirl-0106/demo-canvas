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
    gs().setMode('target', 'text', get)
    mats[0].src = 'new.mp4'; gs().syncSources('target', get)
    gs().setMode('target', 'edit', get)
    expect(state()).toMatchObject({ range: null, prompt: '改椅子', sourceSrc: 'new.mp4' })
  })
  it('移除首帧、切换、再次同步均不自动补位，历史连接保留', () => {
    gs().setMode('target', 'frames', get); gs().removeMaterial('target', 'a', get)
    gs().setMode('target', 'text', get); gs().setMode('target', 'frames', get)
    gs().syncConn('target', ['v', 'w', 'a', 'b'], get)
    expect(state()).toMatchObject({ slotFirst: null, slotLast: 'b' }); expect(state().conn).toHaveLength(4)
  })
  it('不兼容模型切换不改变任何草稿；退出操作后可切换并再次恢复', () => {
    gs().patch('target', { range: { start: 3, end: 7 }, prompt: '保留草稿' })
    gs().setModel('target', '2.0', get); expect(state().model).toBe('2.5'); expect(state().mode).toBe('edit')
    gs().setMode('target', 'ref', get); gs().setModel('target', '2.0', get); expect(state().model).toBe('2.0')
    gs().setMode('target', 'edit', get); expect(state()).toMatchObject({ model: '2.5', prompt: '保留草稿', range: { start: 3, end: 7 } })
  })
  it('任务保存不可变快照；完成任务不回写媒体或污染新草稿', () => {
    gs().patch('target', { prompt: '改椅子', scope: 'segment', range: { start: 3, end: 7 } })
    const taskId = gs().submit('target', get)
    gs().patch('target', { prompt: '新要求', range: { start: 6, end: 10 } })
    expect(state().tasks[0].payload).toMatchObject({ prompt: '改椅子', range: { start: 3, end: 7 }, demo: true })
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
  it('未填写的空视频节点首次连入素材时自动进入相应模式', () => {
    gs().syncConn('empty', [], get)
    gs().syncConn('empty', ['v'], get)
    expect(gs().get1('empty').mode).toBe('edit')
    gs().setMode('empty', 'text', get)
    gs().syncConn('empty', ['v', 'a'], get)
    expect(gs().get1('empty').mode).toBe('text')
  })
  it('切换旧模型时只保留其已有的演示参数范围', () => {
    gs().setMode('target', 'ref', get)
    gs().patch('target', { params: { duration: 30, resolution: '1080p', ratio: '9:16', sound: false } })
    gs().setModel('target', '2.0', get)
    expect(state().params).toEqual({ duration: 5, resolution: '720p', ratio: '16:9', sound: false })
  })
})
