import { describe, expect, it } from 'vitest'
import { activeIds, allocate, assign, remove, emptySlots, partition, tabStates, fallbackMode, supportsRange, locksRatio, locksDuration, type Mat, type MatGet } from './materialLayout'
const mats: Mat[] = [
  { id: 'a', name: 'ABCD', kind: 'image', grad: '' }, { id: 'b', name: 'EFGH', kind: 'image', grad: '' },
  { id: 'v', name: 'IJKL', kind: 'video', dur: 15.1, grad: '' }, { id: 'w', name: 'MNOP', kind: 'video', dur: 4, grad: '' },
]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const conn = ['v', 'a', 'b', 'w']
describe('模式能力与有效素材', () => {
  it('Tab 能不能进只看画布素材，四个模型都支持全部五种', () => {
    const off = (c: string[]) => tabStates(c, get).filter((t) => !t.enabled).map((t) => t.k)
    expect(off([])).toEqual(['frames', 'ref', 'edit', 'extend'])
    expect(off(['a'])).toEqual(['text', 'edit', 'extend'])
    expect(off(['v'])).toEqual(['text', 'frames'])
    expect(off(conn)).toEqual(['text'])
    expect(tabStates(conn, get).find((t) => t.k === 'text')!.reason).toContain('只接受文本')
    expect(fallbackMode([], get)).toBe('text')
    expect(fallbackMode(['v'], get)).toBe('ref')
  })
  it('模型只影响参数域与配额：2.0 系列不锁比例、不认秒数', () => {
    for (const m of ['2.5', '2.0', '2.0-fast', '2.0-mini'] as const) {
      expect(tabStates(conn, get).every((t) => t.k === 'text' || t.enabled)).toBe(true)
      expect(locksRatio('edit', m)).toBe(m === '2.5')
      expect(locksDuration('edit', m)).toBe(m === '2.5')
      expect(supportsRange(m)).toBe(m === '2.5')
    }
  })
  it('超出配额与用不上的素材都给得出理由，且不进入有效输入', () => {
    const frames = allocate(emptySlots(), conn, 'frames', get)
    const { active, skipped } = partition(frames, 'frames', '2.5', get)
    expect(active).toEqual(['a', 'b'])
    expect(skipped.map((x) => x.id).sort()).toEqual(['v', 'w'])
    expect(skipped.every((x) => x.reason.includes('只使用图片'))).toBe(true)
    const many = { ...emptySlots(), tray: ['v', 'w'] }
    expect(partition(many, 'ref', '2.5', get).skipped).toEqual([])
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
