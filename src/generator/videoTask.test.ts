import { describe, expect, it } from 'vitest'
import { sourceError, taskPayload, taskError, marksBlockModel } from './videoTask'
import { freshGen } from '../store/generator'
import { matBlockedReason, tabStates, type MatGet } from './materialLayout'
import type { MarkGroup, TimeRange } from './marks'
/** 一组标记：圈了 n 处（都在第 t 秒），可选再带一段时间。 */
const marks = (t: number, n = 1, range: TimeRange | null = null): MarkGroup[] =>
  [{ id: 'g1', range, regions: Array.from({ length: n }, () => ({ t, tool: 'box' as const, rect: [0.2, 0.3, 0.2, 0.2] as [number, number, number, number] })) }]
/** a / b 是图片，其余 id 是 15.1 秒的视频。 */
const img = (id: string) => id === 'a' || id === 'b'
const get: MatGet = (id) => ({ id, name: 'ABCD', kind: img(id) ? 'image' : 'video', dur: img(id) ? undefined : 15.1, ready: true, src: 'source.mp4', grad: '' })
describe('源视频的时长门槛（选区自己的规则在 marks.test.ts 里）', () => {
  it('源视频区间按模式分：编辑 4–30 秒，延长放宽到 2–30 秒', () => {
    expect(sourceError(3, true, 'edit', 'sd2.5')).toContain('4')
    expect(sourceError(3, true, 'extend', 'sd2.5')).toBeNull()
    expect(sourceError(undefined)).toContain('读取'); expect(sourceError(15, false)).toContain('读取')
  })
})
describe('任务参数', () => {
  const edit = () => ({ ...freshGen(), mode: 'edit' as const, conn: ['v'], slotEdit: 'v', sourceSrc: 'source.mp4', prompt: '将椅子改成红色' })
  it('编辑整条进整条出，标记是作用域不改变产出长度', () => {
    // 编辑永远整条进、整条出：标记只是作用域，不改变产出长度
    expect(taskPayload(edit(), get)).toMatchObject({ scope: 'whole', range: null, rangeMeaning: null, marks: [], params: { duration: 15.1, ratio: 'adaptive' }, demo: true })
    expect(taskPayload(edit(), get).output).toContain('整条视频')
    const seg = taskPayload({ ...edit(), marks: marks(3, 2, { start: 3, end: 8 }) }, get)
    expect(seg).toMatchObject({ scope: 'segment', range: { start: 3, end: 8 }, rangeMeaning: '作用域', params: { duration: 15.1 } })
    expect(seg.marks[0].regions).toHaveLength(2)
    expect(seg.output).toContain('整条视频')
    // 只圈了画面、没选时间段：作用范围仍然是整条，但这一处的秒数照样交出去
    const spot = taskPayload({ ...edit(), marks: marks(3) }, get)
    expect(spot).toMatchObject({ scope: 'whole', range: null, rangeMeaning: '作用域' })
    expect(spot.marks[0].regions[0].t).toBe(3)
  })
  it('读作那句话就是这次任务的全部意思', () => {
    expect(taskPayload({ ...edit(), marks: marks(3, 2, { start: 3, end: 8 }) }, get).reads)
      .toBe('把「视频 ABCD」中 00:03–00:08 里的 ⬚ 00:03、⬚ 00:03 的 将椅子改成红色')
    expect(taskPayload(edit(), get).reads).toBe('把「视频 ABCD」的 将椅子改成红色')
  })
  it('不响应范围的型号，只要标了东西就提交不了 —— 哪怕只圈了一个框、没选时间段', () => {
    const g = { ...edit(), model: 'sd2.0' as const, marks: marks(3) }
    expect(taskError(g, (id) => ({ ...get(id)!, dur: 10 }))).toContain('不支持局部编辑')
    // 已经标了东西时只多一句解除办法，不重复标了几处
    expect(marksBlockModel(g, 'sd2.0')).toBe('Seedance 2.0 不支持局部编辑，移除标记后可切换')
    expect(marksBlockModel(g, 'sd2.5')).toBe('')
    // 标记为空时它就不再挡路了
    expect(marksBlockModel({ ...g, marks: [] }, 'sd2.0')).toBe('')
  })
  it('提示词空着也让他生成；标记指向的秒数超出原片才拦下', () => {
    const g = { ...edit(), marks: marks(3, 1, { start: 3, end: 7 }), prompt: '@ABCD ' }
    // 只有自动前缀和一个引用、一句要求都没写：这是他的选择，不是缺一步没做完
    expect(taskError(g, get)).toBe(null)
    expect(taskError({ ...g, doc: [], prompt: '' }, get)).toBe(null)
    expect(taskError({ ...g, prompt: '改成红色', marks: marks(3, 1, { start: 3, end: 99 }) }, get)).toContain('超出源视频范围')
    // 没标记就是改整条，照样能提交
    expect(taskError({ ...g, prompt: '改成红色', marks: [] }, get)).toBe(null)
    // 任务类型由 Tab 决定，提示词不再需要触发关键词
    expect(taskError({ ...g, prompt: '让它好看一点' }, get)).toBe(null)
  })
  it('延长默认向后、永远整条进，不携带任何时间范围', () => {
    const g = { ...edit(), mode: 'extend' as const, prompt: '续写一段海浪', params: { ...edit().params, duration: 30 } }
    // 方向有默认值，不拦一次多余的点击；真被清空了才拦
    expect(g.direction).toBe('after')
    expect(taskError(g, get)).toBe(null)
    expect(taskError({ ...g, direction: null }, get)).toContain('延长方向')
    const done = taskPayload({ ...g, direction: 'before' }, get)
    expect(done).toMatchObject({ range: null, marks: [], scope: 'whole', direction: 'before', params: { duration: 30, ratio: 'adaptive' } })
    // 延长的产出只有新增那一段，不含原片
    expect(done.output).toContain('不含原片')
    // 延长没有「接哪一段」这回事：草稿里残留的标记也不会被带进任务
    const stale = taskPayload({ ...g, direction: 'after', marks: marks(10, 1, { start: 10, end: 15 }) }, get)
    expect(stale).toMatchObject({ range: null, rangeMeaning: null, marks: [], scope: 'whole' })
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
  it('源视频上限也按模型分：2.5 收到 30 秒，2.0 系列只收到 15 秒', () => {
    for (const mode of ['edit', 'extend'] as const) {
      expect(sourceError(20, true, mode, 'sd2.5')).toBeNull()
      expect(sourceError(30, true, mode, 'sd2.5')).toBeNull()
      expect(sourceError(30.1, true, mode, 'sd2.5')).toContain('30 秒之间')
      expect(sourceError(15, true, mode, 'sd2.0')).toBeNull()
      expect(sourceError(15.1, true, mode, 'sd2.0-fast')).toContain('2–15 秒')
    }
  })
  it('辅助参考视频的下限跟着任务类型走；不合规的不拦生成，是被挪出本次输入', () => {
    // 2.5 编辑：待编辑视频 4 秒起，辅助参考视频按文档同样是 4 秒起
    const mixed = (refDur: number): MatGet => (id) => ({ ...get(id)!, dur: id === 'v' ? 10 : refDur })
    const g = { ...edit(), conn: ['v', 'r'], tray: ['r'] }
    // 3 秒那段不再在提交时报黄字，而是在缩略图上就灰掉、不进本次输入，理由跟着素材走
    expect(matBlockedReason(mixed(3)('r')!, 'edit', 'sd2.5')).toBe('视频 ABCD 的时长需在 4–30 秒之间')
    expect(taskError(g, mixed(3))).toBeNull()
    expect(taskPayload(g, mixed(3)).inputIds).toEqual(['v'])
    expect(taskPayload(g, mixed(3)).skipped[0].reason).toBe('视频 ABCD 的时长需在 4–30 秒之间')
    expect(taskPayload(g, mixed(4)).inputIds).toEqual(['v', 'r'])
    // 2.0 编辑的下限是 2 秒，参考视频跟着放宽，3 秒照常参与
    expect(taskPayload({ ...g, model: 'sd2.0' as const }, mixed(3)).inputIds).toEqual(['v', 'r'])
    // 参考生成新视频：不涉及待编辑视频，参考视频 2 秒起
    const ref = { ...freshGen(), mode: 'ref' as const, conn: ['r'], tray: ['r'], prompt: '海边日落' }
    expect(taskError(ref, mixed(2))).toBeNull()
    // 手上只有这一段、它还用不了：参考素材仍然进得去（它是落脚的那个 Tab），
    // 但生成按钮灰着，说的就是那一段为什么用不上
    expect(taskError(ref, mixed(1.5))).toBe('视频 ABCD 的时长需在 2–30 秒之间')
    expect(tabStates(['r'], mixed(1.5), 'sd2.5').find((t) => t.k === 'ref')!.enabled).toBe(true)
    // 延长同样按 2 秒起
    const ext = { ...g, mode: 'extend' as const, prompt: '续写一段海浪' }
    expect(taskPayload(ext, mixed(3)).inputIds).toEqual(['v', 'r'])
    // 上限同样跟着型号走：20 秒的参考视频 2.5 收得下，2.0 收不下 —— 收不下的那一段直接不参与
    expect(taskPayload(ext, mixed(20)).inputIds).toEqual(['v', 'r'])
    expect(taskPayload({ ...ext, model: 'sd2.0' as const }, mixed(20)).inputIds).toEqual(['v'])
    expect(tabStates(['v', 'r'], mixed(20), 'sd2.0').find((t) => t.k === 'extend')!.note).toBe('视频 ABCD 的时长需在 2–15 秒之间，不参与本次生成')
  })
  it('三条限制各自独立：单个时长、数量、合计时长，任意一条超了都提交不了', () => {
    const many = ['r1', 'r2', 'r3', 'r4']
    const each = (dur: number): MatGet => (id) => ({ ...get(id)!, dur: id === 'v' ? 4 : dur })
    const g = { ...edit(), conn: ['v', ...many], tray: many }
    // 单个时长：2.5 编辑要 4 秒起，3 秒的那几段一开始就不算数（缩略图灰掉），不是提交时才拦
    expect(taskPayload(g, each(3)).inputIds).toEqual(['v'])
    expect(taskPayload(g, each(3)).skipped).toHaveLength(4)
    // 数量：2.5 收 10 段视频，5 段没超，超出的才会被挪出本次输入
    expect(taskPayload(g, each(4)).inputIds).toHaveLength(5)
    expect(taskPayload(g, each(4)).skipped).toEqual([])
    // 合计时长：每段 7 秒单独都合规，5 段共 35 秒超出 2.5 的 30 秒
    expect(taskError(g, each(7))).toContain('视频总时长为 32 秒')
  })
  it('2.5 编辑最多 7 段视频：接口写着 10 个，但每段 4 秒起，8 段必然超 30 秒', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `r${i}`)
    const four: MatGet = (id) => ({ ...get(id)!, dur: 4 })
    const g = { ...edit(), conn: ['v', ...ids.slice(0, 6)], tray: ids.slice(0, 6) }
    // 1 段待编辑 + 6 段参考 = 7 段 × 4 秒 = 28 秒，正好在上限内
    expect(taskError(g, four)).toBeNull()
    // 再加一段就是 8 段 × 4 秒 = 32 秒：数量没超 10，合计这条把它拦下
    expect(taskError({ ...g, conn: ['v', ...ids.slice(0, 7)], tray: ids.slice(0, 7) }, four)).toContain('超过 Seedance 2.5 的 30 秒上限')
  })
  it('配额为 0 的素材，连着也不算有效输入', () => {
    // Wan 2.2 图生视频只收 1 张图、不收视频。连了视频但一个都用不上时不能提交，
    // 错了的表现是生成按钮亮着、payload 里 inputIds 是空的，界面看不出来。
    const g = { ...freshGen(), mode: 'refImage' as const, model: 'wan2.2-i2v-a14b' as const, conn: ['v'], tray: ['v'], prompt: '海边日落' }
    expect(taskError(g, get)).toBe('Wan 2.2 图生视频 不支持视频输入')
    // 说这句话的地方不止一处：Tab 灰、型号也灰，用户在做选择之前就看得到
    expect(tabStates(['v'], get, 'wan2.2-i2v-a14b').find((t) => t.k === 'refImage')!.note).toBe('视频不参与本次生成')
  })
  it('延长按整条原片计入时长，合计超限只能靠移除素材', () => {
    const long: MatGet = (id) => ({ ...get(id)!, dur: id === 'v' ? 28 : 10 })
    const g = { ...edit(), mode: 'extend' as const, conn: ['v', 'r'], tray: ['r'], direction: 'after' as const, prompt: '向后延长一段海浪' }
    // 28 秒原片整条进，加 10 秒参考视频超过 2.5 的 30 秒上限
    expect(taskError(g, long)).toContain('超过 Seedance 2.5 的 30 秒上限')
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
    expect(taskError(g, (id) => ({ ...get(id)!, dur: 1 }))).toBe('视频 ABCD 的时长需在 2–30 秒之间')
    expect(taskError(g, (id) => ({ ...get(id)!, error: '无法读取' }))).toBe('视频 ABCD 无法读取，可尝试重新上传')
    expect(taskError(g, (id) => ({ ...get(id)!, ready: false }))).toContain('读取')
  })
  it('隐藏素材不进入任务或引用映射，引用绑定稳定 ID', () => {
    const g = { ...freshGen(), mode: 'frames' as const, conn: ['a', 'v'], slotFirst: 'a', unused: ['v'], prompt: '参考 @ABCD 的光线', references: { ABCD: 'a', EFGH: 'v' } }
    expect(taskPayload(g, get)).toMatchObject({ inputIds: ['a'], references: { ABCD: 'a' }, params: { ratio: 'adaptive' } })
  })
})
