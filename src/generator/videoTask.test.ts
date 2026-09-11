import { describe, expect, it } from 'vitest'
import { selectRange, adjustRange, sourceError, taskPayload, taskError } from './videoTask'
import { freshGen } from '../store/generator'
import type { MatGet } from './materialLayout'
const get: MatGet = (id) => ({ id, name: 'ABCD', kind: 'video', dur: 15.1, ready: true, src: 'source.mp4', grad: '' })
describe('整数秒片段选择', () => {
  it('15.1 秒视频在 3 秒和片尾选择，不带入小数尾部', () => {
    expect(selectRange(3, 15.1)).toEqual({ start: 3, end: 7 })
    expect(selectRange(15.09, 15.1)).toEqual({ start: 11, end: 15 })
  })
  it('4 秒源只允许 00–04；未知、过短和过长源不可选', () => {
    expect(selectRange(3, 4)).toEqual({ start: 0, end: 4 })
    for (const d of [3.99, 30.01, NaN, Infinity]) expect(selectRange(0, d)).toBeNull()
    expect(sourceError(undefined)).toContain('读取'); expect(sourceError(15, false)).toContain('读取')
  })
  it('拖动两端保持至少 4 秒，平移保持长度且不越界', () => {
    const r = { start: 3, end: 8 }
    expect(adjustRange(r, 'start', 10, 15.1)).toEqual({ start: 4, end: 8 })
    expect(adjustRange(r, 'end', 0, 15.1)).toEqual({ start: 3, end: 7 })
    expect(adjustRange(r, 'move', -10, 15.1)).toEqual({ start: 0, end: 5 })
    expect(adjustRange(r, 'move', 20, 15.1)).toEqual({ start: 10, end: 15 })
    expect(adjustRange(r, 'end', 9.7, 15.1)).toEqual({ start: 3, end: 10 })
  })
  it('所有合法时长、拖动方向与边界均保持整数秒且不交叉', () => {
    for (const d of [4, 4.9, 8, 15.1, 30]) for (let t = -2; t < d + 2; t += 0.7) {
      const r = selectRange(t, d)!
      for (const action of ['start', 'end', 'move'] as const) for (const v of [-50, -0.7, 0, 3.4, 40]) {
        const next = adjustRange(r, action, v, d)
        expect(next.start).toBeGreaterThanOrEqual(0); expect(next.end).toBeLessThanOrEqual(Math.floor(d))
        expect(next.end - next.start).toBeGreaterThanOrEqual(4); expect(Number.isInteger(next.start) && Number.isInteger(next.end)).toBe(true)
      }
    }
  })
})
describe('任务参数', () => {
  const edit = () => ({ ...freshGen(), mode: 'edit' as const, slotEdit: 'v', sourceSrc: 'source.mp4', prompt: '将椅子改为红色' })
  it('整段保留真实小数时长，片段记录原片范围及独立输出含义', () => {
    expect(taskPayload(edit(), get)).toMatchObject({ range: null, params: { duration: 15.1, ratio: 'adaptive' }, output: '整条视频', demo: true })
    expect(taskPayload({ ...edit(), scope: 'segment', range: { start: 3, end: 8 } }, get)).toMatchObject({ range: { start: 3, end: 8 }, params: { duration: 5 }, output: '独立片段' })
  })
  it('自动前缀和引用不能代替修改要求，清除选区后不能提交', () => {
    const g = { ...edit(), scope: 'segment' as const, range: { start: 3, end: 7 }, prompt: '@ABCD ' }
    expect(taskError(g, get)).toBe('描述想要修改的内容')
    expect(taskError({ ...g, prompt: '改为红色', range: null }, get)).toContain('点击时间轴')
  })
  it('延长方向必选，延长时不携带编辑范围、不按原片截短生成时长', () => {
    const g = { ...edit(), mode: 'extend' as const, range: { start: 3, end: 7 }, params: { ...edit().params, duration: 30 } }
    expect(taskError(g, get)).toContain('向前或向后')
    expect(taskPayload({ ...g, direction: 'before' }, get)).toMatchObject({ range: null, direction: 'before', params: { duration: 30, ratio: 'adaptive' } })
  })
  it('隐藏素材不进入任务或引用映射，引用绑定稳定 ID', () => {
    const g = { ...freshGen(), mode: 'frames' as const, slotFirst: 'a', unused: ['v'], prompt: '参考 @ABCD 的光线', references: { ABCD: 'a', EFGH: 'v' } }
    expect(taskPayload(g, get)).toMatchObject({ inputIds: ['a'], references: { ABCD: 'a' }, params: { ratio: 'adaptive' } })
  })
})
