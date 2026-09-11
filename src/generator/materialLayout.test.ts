import { describe, expect, it } from 'vitest'
import { activeIds, allocate, assign, remove, emptySlots, supportsMode, visibleTabs, type Mat, type MatGet } from './materialLayout'
const mats: Mat[] = [
  { id: 'a', name: 'ABCD', kind: 'image', grad: '' }, { id: 'b', name: 'EFGH', kind: 'image', grad: '' },
  { id: 'v', name: 'IJKL', kind: 'video', dur: 15.1, grad: '' }, { id: 'w', name: 'MNOP', kind: 'video', dur: 4, grad: '' },
]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const conn = ['v', 'a', 'b', 'w']
describe('模式能力与有效素材', () => {
  it('使用配置表限制编辑/延长能力，移除超长入口', () => {
    expect(visibleTabs('2.5').map((t) => t.k)).toEqual(['text', 'frames', 'ref', 'edit', 'extend'])
    expect(supportsMode('edit', '2.0')).toBe(false)
    expect(supportsMode('extend', '2.0')).toBe(false)
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
