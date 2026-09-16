import { describe, expect, it } from 'vitest'
import { shotPlan } from './markShot'
import type { MarkGroup, MarkRegion } from './marks'
const box = (t: number, x = 0.2): MarkRegion => ({ t, tool: 'box', rect: [x, 0.3, 0.2, 0.2] })
const group = (id: string, regions: MarkRegion[], range: MarkGroup['range'] = null): MarkGroup => ({ id, regions, range })

describe('标记参考图：一秒一张，画面说了算', () => {
  it('同一秒圈的几处画在同一张上，不同秒各出各的，按时间排', () => {
    const plan = shotPlan([group('g1', [box(5), box(1), box(1, 0.6)])])
    expect(plan.map((s) => s.t)).toEqual([1, 5])
    expect(plan[0].regions).toHaveLength(2)
    expect(plan[1].regions).toHaveLength(1)
  })
  it('两次标记圈在同一秒上，画的是同一帧，所以还是一张', () => {
    const plan = shotPlan([group('g1', [box(3)]), group('g2', [box(3, 0.7)], { start: 2, end: 4 })])
    expect(plan).toHaveLength(1)
    expect(plan[0].regions).toHaveLength(2)
  })
  it('只选了时间段、一处没圈：没有哪一帧可截，不出图', () => {
    expect(shotPlan([group('g1', [], { start: 1, end: 3 })])).toEqual([])
  })
  it('标记动了，这一张的身份也跟着变 —— 图会重画，不会拿旧的顶着', () => {
    const before = shotPlan([group('g1', [box(2)])])[0].key
    expect(shotPlan([group('g1', [box(2)])])[0].key).toBe(before)
    expect(shotPlan([group('g1', [box(2, 0.5)])])[0].key).not.toBe(before)
  })
})
