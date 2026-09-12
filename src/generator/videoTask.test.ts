import { describe, expect, it } from 'vitest'
import { RANGE_MIN, selectRange, adjustRange, sourceError, taskPayload, taskError } from './videoTask'
import { freshGen } from '../store/generator'
import type { MatGet } from './materialLayout'
const get: MatGet = (id) => ({ id, name: 'ABCD', kind: 'video', dur: 15.1, ready: true, src: 'source.mp4', grad: '' })
describe('整数秒片段选择（最短 1 秒；4 秒是对源视频的要求，不是对选区的）', () => {
  it('15.1 秒视频在 3 秒和片尾选择，不带入小数尾部', () => {
    expect(selectRange(3, 15.1)).toEqual({ start: 3, end: 4 })
    expect(selectRange(15.09, 15.1)).toEqual({ start: 14, end: 15 })
  })
  it('源视频区间按模式分：编辑 4–30 秒，延长放宽到 2–30 秒', () => {
    expect(selectRange(3, 4)).toEqual({ start: 3, end: 4 })
    for (const d of [3.99, 30.01, NaN, Infinity]) expect(selectRange(0, d, 'edit')).toBeNull()
    expect(selectRange(0, 3, 'extend')).toEqual({ start: 0, end: 1 })
    expect(sourceError(3, true, 'edit')).toContain('4')
    expect(sourceError(3, true, 'extend')).toBeNull()
    expect(sourceError(undefined)).toContain('读取'); expect(sourceError(15, false)).toContain('读取')
  })
  it('拖动两端保持至少 1 秒，平移保持长度且不越界', () => {
    const r = { start: 3, end: 8 }
    expect(adjustRange(r, 'start', 10, 15.1)).toEqual({ start: 7, end: 8 })
    expect(adjustRange(r, 'end', 0, 15.1)).toEqual({ start: 3, end: 4 })
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
        expect(next.end - next.start).toBeGreaterThanOrEqual(RANGE_MIN); expect(Number.isInteger(next.start) && Number.isInteger(next.end)).toBe(true)
      }
    }
  })
})
describe('任务参数', () => {
  const edit = () => ({ ...freshGen(), mode: 'edit' as const, slotEdit: 'v', sourceSrc: 'source.mp4', prompt: '将椅子改成红色' })
  it('编辑整条进整条出，选区是作用域不改变产出长度', () => {
    // 编辑永远整条进、整条出：选区只是作用域，不改变产出长度
    expect(taskPayload(edit(), get)).toMatchObject({ range: null, rangeMeaning: null, params: { duration: 15.1, ratio: 'adaptive' }, demo: true })
    expect(taskPayload(edit(), get).output).toContain('整条视频')
    const seg = taskPayload({ ...edit(), scope: 'segment', range: { start: 3, end: 8 } }, get)
    expect(seg).toMatchObject({ range: { start: 3, end: 8 }, rangeMeaning: '作用域', params: { duration: 15.1 } })
    expect(seg.output).toContain('整条视频')
  })
  it('自动前缀和引用不能代替修改要求，清除选区后不能提交', () => {
    const g = { ...edit(), scope: 'segment' as const, range: { start: 3, end: 7 }, prompt: '@ABCD ' }
    expect(taskError(g, get)).toBe('描述想要修改的内容')
    expect(taskError({ ...g, prompt: '改成红色', range: null }, get)).toContain('选取要作用的片段')
    // 少了触发关键词，模型会把任务判成别的类型
    expect(taskError({ ...g, prompt: '让它好看一点' }, get)).toContain('编辑任务')
  })
  it('延长方向必选，延长时不携带编辑范围、不按原片截短生成时长', () => {
    const g = { ...edit(), mode: 'extend' as const, prompt: '续写一段海浪', params: { ...edit().params, duration: 30 } }
    expect(taskError(g, get)).toContain('向前或向后')
    const done = taskPayload({ ...g, direction: 'before' }, get)
    expect(done).toMatchObject({ range: null, direction: 'before', params: { duration: 30, ratio: 'adaptive' } })
    // 延长的产出只有新增那一段，不含原片
    expect(done.output).toContain('不含原片')
    // 延长的选区是锚点，不是作用域
    const anchored = taskPayload({ ...g, direction: 'after', scope: 'segment', range: { start: 10, end: 15 } }, get)
    expect(anchored).toMatchObject({ range: { start: 10, end: 15 }, rangeMeaning: '锚点', params: { duration: 30 } })
  })
  it('隐藏素材不进入任务或引用映射，引用绑定稳定 ID', () => {
    const g = { ...freshGen(), mode: 'frames' as const, slotFirst: 'a', unused: ['v'], prompt: '参考 @ABCD 的光线', references: { ABCD: 'a', EFGH: 'v' } }
    expect(taskPayload(g, get)).toMatchObject({ inputIds: ['a'], references: { ABCD: 'a' }, params: { ratio: 'adaptive' } })
  })
})
