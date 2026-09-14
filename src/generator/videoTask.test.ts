import { describe, expect, it } from 'vitest'
import { RANGE_MIN, selectRange, adjustRange, sourceError, taskPayload, taskError } from './videoTask'
import { freshGen } from '../store/generator'
import type { MatGet } from './materialLayout'
/** a / b 是图片，其余 id 是 15.1 秒的视频。 */
const img = (id: string) => id === 'a' || id === 'b'
const get: MatGet = (id) => ({ id, name: 'ABCD', kind: img(id) ? 'image' : 'video', dur: img(id) ? undefined : 15.1, ready: true, src: 'source.mp4', grad: '' })
describe('整数秒片段选择（最短 1 秒；4 秒是对源视频的要求，不是对选区的）', () => {
  it('15.1 秒视频在 3 秒和片尾选择，不带入小数尾部', () => {
    expect(selectRange(3, 15.1)).toEqual({ start: 3, end: 4 })
    expect(selectRange(15.09, 15.1)).toEqual({ start: 14, end: 15 })
  })
  it('源视频区间按模式分：编辑 4–30 秒，延长放宽到 2–30 秒', () => {
    expect(selectRange(3, 4)).toEqual({ start: 3, end: 4 })
    for (const d of [3.99, 30.01, NaN, Infinity]) expect(selectRange(0, d)).toBeNull()
    expect(sourceError(3, true, 'edit', 'sd2.5')).toContain('4')
    expect(sourceError(3, true, 'extend', 'sd2.5')).toBeNull()
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
  const edit = () => ({ ...freshGen(), mode: 'edit' as const, conn: ['v'], slotEdit: 'v', sourceSrc: 'source.mp4', prompt: '将椅子改成红色' })
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
    // 任务类型由 Tab 决定，提示词不再需要触发关键词
    expect(taskError({ ...g, prompt: '让它好看一点' }, get)).toBe(null)
  })
  it('延长默认向后、永远整条进，不携带任何时间范围', () => {
    const g = { ...edit(), mode: 'extend' as const, prompt: '续写一段海浪', params: { ...edit().params, duration: 30 } }
    // 方向有默认值，不拦一次多余的点击；真被清空了才拦
    expect(g.direction).toBe('after')
    expect(taskError(g, get)).toBe(null)
    expect(taskError({ ...g, direction: null }, get)).toContain('向前或向后')
    const done = taskPayload({ ...g, direction: 'before' }, get)
    expect(done).toMatchObject({ range: null, scope: 'whole', direction: 'before', params: { duration: 30, ratio: 'adaptive' } })
    // 延长的产出只有新增那一段，不含原片
    expect(done.output).toContain('不含原片')
    // 延长没有「接哪一段」这回事：草稿里残留的选区也不会被带进任务
    const stale = taskPayload({ ...g, direction: 'after', scope: 'segment' as const, range: { start: 10, end: 15 } }, get)
    expect(stale).toMatchObject({ range: null, rangeMeaning: null, scope: 'whole' })
  })
  it('2.0 下编辑任务的时长仍然跟随原片，不受时长选择影响', () => {
    // 2.0 的参考视频合计上限是 15 秒，主视频取 10 秒才不会先被总时长拦下
    const short: MatGet = (id) => ({ ...get(id)!, dur: 10 })
    const g = { ...edit(), model: 'sd2.0' as const, params: { ...edit().params, duration: 5 } }
    expect(taskPayload(g, short).params.duration).toBe(10)
  })
  it('编辑的源视频下限按模型分：2.0 放行 3 秒，2.5 拦下', () => {
    expect(sourceError(3, true, 'edit', 'sd2.0')).toBeNull()
    expect(sourceError(3, true, 'edit', 'sd2.5')).not.toBeNull()
  })
  it('配额为 0 的素材，连着也不算有效输入', () => {
    // Wan 2.2 图生视频只收 1 张图、不收视频。连了视频但一个都用不上时不能提交，
    // 错了的表现是生成按钮亮着、payload 里 inputIds 是空的，界面看不出来。
    const g = { ...freshGen(), mode: 'ref' as const, model: 'wan2.2-i2v-a14b' as const, conn: ['v'], tray: ['v'], prompt: '海边日落' }
    expect(taskError(g, get)).toBe('请添加参考素材')
  })
  it('延长按整条原片计入时长，合计超限只能靠移除素材', () => {
    const long: MatGet = (id) => ({ ...get(id)!, dur: id === 'v' ? 28 : 10 })
    const g = { ...edit(), mode: 'extend' as const, conn: ['v', 'r'], tray: ['r'], direction: 'after' as const, prompt: '向后延长一段海浪' }
    // 28 秒原片整条进，加 10 秒参考视频超过 2.5 的 30 秒上限
    expect(taskError(g, long)).toContain('超出')
    // 去掉那段参考视频就在上限内
    expect(taskError({ ...g, conn: ['v'], tray: [] }, long)).toBeNull()
  })
  it('提交记录与界面参数一致：2.0 不锁比例，没有声音开关的模型不夹带 sound', () => {
    const short: MatGet = (id) => ({ ...get(id)!, dur: 10 })
    // 2.0 编辑可以手选 9:16，提交就得是 9:16；时长仍随原片
    expect(taskPayload({ ...edit(), model: 'sd2.0' as const, params: { ...edit().params, ratio: '9:16' } }, short).params)
      .toMatchObject({ ratio: '9:16', duration: 10 })
    const kling = { ...freshGen(), mode: 'ref' as const, model: 'kling-video-o1' as const, conn: ['v'], tray: ['v'], prompt: '海边日落' }
    expect(kling.params.sound).toBe(true)
    expect(taskPayload(kling, short).params.sound).toBe(false)
  })
  it('参考素材也要能读、时长合规：1 秒视频与读不出的文件都拦在提交前', () => {
    const g = { ...freshGen(), mode: 'ref' as const, conn: ['r'], tray: ['r'], prompt: '海边日落' }
    expect(taskError(g, (id) => ({ ...get(id)!, dur: 1 }))).toContain('2–30 秒')
    expect(taskError(g, (id) => ({ ...get(id)!, error: '视频无法读取，请重新上传' }))).toContain('无法读取')
    expect(taskError(g, (id) => ({ ...get(id)!, ready: false }))).toContain('读取')
  })
  it('隐藏素材不进入任务或引用映射，引用绑定稳定 ID', () => {
    const g = { ...freshGen(), mode: 'frames' as const, conn: ['a', 'v'], slotFirst: 'a', unused: ['v'], prompt: '参考 @ABCD 的光线', references: { ABCD: 'a', EFGH: 'v' } }
    expect(taskPayload(g, get)).toMatchObject({ inputIds: ['a'], references: { ABCD: 'a' }, params: { ratio: 'adaptive' } })
  })
})
