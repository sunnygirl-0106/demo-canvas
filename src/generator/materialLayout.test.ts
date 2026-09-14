import { describe, expect, it } from 'vitest'
import { activeIds, allocate, assign, remove, emptySlots, partition, tabStates, modeAvailable, modelUnusableReason, fallbackMode, supportsRange, locksRatio, locksDuration, MODEL_CAPABILITIES, type Mat, type MatGet } from './materialLayout'
const mats: Mat[] = [
  { id: 'a', name: 'ABCD', kind: 'image', grad: '' }, { id: 'b', name: 'EFGH', kind: 'image', grad: '' },
  { id: 'v', name: 'IJKL', kind: 'video', dur: 15.1, grad: '' }, { id: 'w', name: 'MNOP', kind: 'video', dur: 4, grad: '' },
]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const conn = ['v', 'a', 'b', 'w']
describe('模式能力与有效素材', () => {
  it('Tab 能不能进先看画布素材，Seedance 2.0 起的型号都支持全部五种', () => {
    const off = (c: string[]) => tabStates(c, get, 'sd2.5').filter((t) => !t.enabled).map((t) => t.k)
    expect(off([])).toEqual(['frames', 'ref', 'edit', 'extend'])
    expect(off(['a'])).toEqual(['text', 'edit', 'extend'])
    expect(off(['v'])).toEqual(['text', 'frames'])
    expect(off(conn)).toEqual(['text'])
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'text')!.reason).toContain('只接受文本')
    expect(fallbackMode([], get, 'sd2.5')).toBe('text')
    expect(fallbackMode(['v'], get, 'sd2.5')).toBe('ref')
  })
  it('模型影响参数域与配额：2.0 系列不锁比例、不认秒数', () => {
    for (const m of ['sd2.5', 'sd2.0', 'sd2.0-1080p', 'sd2.0-4k', 'sd2.0-fast', 'sd2.0-mini'] as const) {
      expect(tabStates(conn, get, m).every((t) => t.k === 'text' || t.enabled)).toBe(true)
      expect(locksRatio('edit', m)).toBe(m === 'sd2.5')
      expect(locksDuration('edit')).toBe(true)
      expect(supportsRange(m)).toBe(m === 'sd2.5')
    }
  })
  it('时长档位不跳过 6 秒', () => {
    for (const m of ['sd2.5', 'sd2.0'] as const) expect(MODEL_CAPABILITIES[m].durations).toContain(6)
  })
  it('别家模型与 1.5 没有编辑与延长，素材够了也进不去', () => {
    for (const m of ['sd1.5', 'kling-video-o1', 'wan2.2'] as const) {
      const states = tabStates(conn, get, m)
      expect(states.filter((t) => !t.enabled).map((t) => t.k)).toEqual(['text', 'edit', 'extend'])
      expect(states.find((t) => t.k === 'edit')!.reason).toBe(`${MODEL_CAPABILITIES[m].label} 不支持编辑视频`)
      expect(modeAvailable('edit', conn, get, m)).toBe(false)
      expect(fallbackMode(conn, get, m)).toBe('ref')
    }
  })
  it('超出配额与用不上的素材都给得出理由，且不进入有效输入', () => {
    const frames = allocate(emptySlots(), conn, 'frames', get)
    const { active, skipped } = partition(frames, 'frames', 'sd2.5', get)
    expect(active).toEqual(['a', 'b'])
    expect(skipped.map((x) => x.id).sort()).toEqual(['v', 'w'])
    expect(skipped.every((x) => x.reason.includes('只使用图片'))).toBe(true)
    const many = { ...emptySlots(), tray: ['v', 'w'] }
    expect(partition(many, 'ref', 'sd2.5', get).skipped).toEqual([])
  })
  it('一个模式都进不去的型号，在模型列表里就灰掉', () => {
    // 只做文生视频的型号：画布上一连素材就没得做，别让用户选进一个全灰的 Tab
    expect(modelUnusableReason(conn, get, 'wan2.2-ti2v-5b')).toContain('已连接素材')
    expect(modelUnusableReason([], get, 'wan2.2-ti2v-5b')).toBe('')
    // 只做图生视频的型号反过来：空画布上没得做
    expect(modelUnusableReason([], get, 'wan2.2-i2v-a14b')).toContain('需要先连接素材')
    expect(modelUnusableReason(conn, get, 'wan2.2-i2v-a14b')).toBe('')
    // 五种模式都支持的型号，连或不连都有得做
    for (const m of ['sd2.5', 'sd2.0', 'kling-video-o1'] as const) {
      expect(modelUnusableReason(conn, get, m)).toBe('')
      expect(modelUnusableReason([], get, m)).toBe('')
    }
  })
  it('用不上的素材不在面板上占位，改由 Tab 悬浮说明', () => {
    // 首尾帧只吃图片：连着的视频不摆「不参与」缩略图，进模式之前在 Tab 上就说清楚
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'frames')!.note).toBe('此模式会忽略已连接的视频节点')
    expect(tabStates(['a', 'b'], get, 'sd2.5').find((t) => t.k === 'frames')!.note).toBe('')
    // 超过配额同样只在 Tab 上说：Wan 图生视频只收 1 张图
    expect(tabStates(['a', 'b'], get, 'wan2.2-i2v-a14b').find((t) => t.k === 'ref')!.note).toContain('最多使用 1 张图片')
    // 进不去的 Tab 说的是进不去的原因，不叠加忽略说明
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'text')!.note).toBe('')
  })
  it('文生视频不展示或提交任何连接素材', () => {
    const s = allocate(emptySlots(), conn, 'text', get)
    expect(activeIds(s, 'text')).toEqual([])
    expect(s.unused).toEqual(conn)
  })
  it('首尾帧只使用两张图，编辑和延长明确源视频', () => {
    const frames = allocate(emptySlots(), conn, 'frames', get)
    expect(activeIds(frames, 'frames')).toEqual(['a', 'b'])
    for (const mode of ['edit', 'extend'] as const) {
      const s = allocate(emptySlots(), conn, mode, get)
      expect(s.slotEdit).toBe('v'); expect(s.tray).toEqual(['a', 'b', 'w'])
    }
  })
  it('移除首帧后不会将尾帧提升为首帧，也不会被连接同步重新填回', () => {
    const s = remove(allocate(emptySlots(), conn, 'frames', get), 'a')
    const next = allocate(s, conn, 'frames', get, false, [])
    expect(next.slotFirst).toBeNull(); expect(next.slotLast).toBe('b')
  })
  it('更换主视频将旧视频转为隐藏资产，不与参考素材互换', () => {
    const next = assign(allocate(emptySlots(), conn, 'edit', get), 'w', 'edit', get)!
    expect(next.slotEdit).toBe('w'); expect(next.tray).toEqual(['a', 'b']); expect(next.unused).toContain('v')
  })
  it('阻止不匹配的角色并清理断开的连接', () => {
    const s = allocate(emptySlots(), conn, 'edit', get)
    expect(assign(s, 'a', 'edit', get)).toBeNull()
    const next = allocate(s, ['a', 'b'], 'edit', get, false, [])
    expect(next.slotEdit).toBeNull(); expect(activeIds(next, 'edit')).toEqual(['a', 'b'])
  })
})
