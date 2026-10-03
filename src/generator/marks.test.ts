import { describe, expect, it } from 'vitest'
import {
  BRUSH_MAX, BRUSH_MIN, BRUSH_WIDTH, RANGE_MIN, adjustRange, appendPoint, brushOf, brushPct, clampBrush,
  clipRegions, commitDraft, defaultSegment, draftOf, dragRange, dragRect,
  draftEmpty, dropLastChip, groupReading, invalidMark, markScope, marksReading,
  outOfSource, pinnedBy, rangeAt, rangeBounds, rangeHull, rangesTotal, regionLabel,
  spotDetail, spotLabel, spotsOf, strokeBox, tinyRect,
  type MarkGroup, type MarkRegion, type Stroke,
} from './marks'
const box = (t: number, rect: [number, number, number, number] = [0.2, 0.3, 0.2, 0.2]): MarkRegion => ({ t, tool: 'box', rect })
const brush = (t: number, strokes: Stroke[]): MarkRegion => ({ t, tool: 'brush', width: BRUSH_WIDTH, strokes, rect: strokeBox(strokes) })
const group = (regions: MarkRegion[], range: MarkGroup['range'] = null): MarkGroup => ({ id: 'g1', regions, range })

describe('画面上圈出来的那一块', () => {
  it('框拉得太小就是误点，松手即丢', () => {
    expect(tinyRect([0.1, 0.1, 0.029, 0.5])).toBe(true)
    expect(tinyRect([0.1, 0.1, 0.5, 0.039])).toBe(true)
    expect(tinyRect([0.1, 0.1, 0.03, 0.04])).toBe(false)
  })
  it('两点拉出来的框永远是正向宽高，从哪个角起手都一样', () => {
    for (const r of [dragRect(0.6, 0.8, 0.2, 0.3), dragRect(0.2, 0.3, 0.6, 0.8)])
      [0.2, 0.3, 0.4, 0.5].forEach((v, i) => expect(r[i]).toBeCloseTo(v))
  })
  it('画笔的框是所有笔画的外包络，按笔宽往外撑一圈', () => {
    // 纵向多撑 16/9：归一化坐标里 y 的一格比 x 短，不补偿的话框会贴着笔迹
    const [x, y, w, h] = strokeBox([[[0.4, 0.4], [0.6, 0.5]]], 0.04)
    expect(x).toBeCloseTo(0.38); expect(w).toBeCloseTo(0.24)
    expect(y).toBeCloseTo(0.4 - 0.02 * 16 / 9); expect(h).toBeCloseTo(0.1 + 0.04 * 16 / 9)
    // 贴着画面边缘画，框也不会越出 0..1
    const edge = strokeBox([[[0, 0], [1, 1]]], 0.08)
    expect(edge[0]).toBe(0); expect(edge[1]).toBe(0)
    expect(edge[0] + edge[2]).toBeLessThanOrEqual(1); expect(edge[1] + edge[3]).toBeLessThanOrEqual(1)
    // 多笔一起算一个框
    const two = strokeBox([[[0.1, 0.1]], [[0.9, 0.9]]], 0)
    ;[0.1, 0.1, 0.8, 0.8].forEach((v, i) => expect(two[i]).toBeCloseTo(v))
  })
  it('手抖不记点：离上一个点太近的一律丢掉', () => {
    const st: Stroke[] = [[[0.5, 0.5]]]
    expect(appendPoint(st, 0.502, 0.502)).toBeNull()
    expect(appendPoint(st, 0.51, 0.5)?.[0]).toHaveLength(2)
  })
})

describe('标记怎么读：一处就是一处，各报各的时间', () => {
  it('标签上写的是它自己那一帧的时间 —— 三个时间点三处，不折叠成「3 处」', () => {
    expect(regionLabel(box(3))).toBe('框选 00:03')
    expect(regionLabel(brush(61, [[[0.5, 0.5]]]))).toBe('画笔 01:01')
    // 整段视频里在两个时间点各框了一处，读出来就是并列的两处
    expect(groupReading(group([box(1), box(3)]))).toBe('@框选 00:01、@框选 00:03')
  })
  it('指定片段里头尾各一个框，两处都列出来，那一段读作它们的定语', () => {
    expect(groupReading(group([box(3), box(8)], { start: 3, end: 8 }))).toBe('@00:03–00:08 里的 @框选 00:03、@框选 00:08')
    // 只选了一段时间、一处没圈：这一段本身就是那处标记
    expect(groupReading(group([], { start: 1, end: 3 }))).toBe('@00:01–00:03')
    expect(groupReading(group([]))).toBe('整段视频')
  })
  it('几次标记连读成一句，组与组之间用分号断开', () => {
    expect(marksReading([group([box(1)]), { ...group([box(3), box(8)], { start: 3, end: 8 }), id: 'g2' }]))
      .toBe('@框选 00:01；@00:03–00:08 里的 @框选 00:03、@框选 00:08')
  })
  it('同一时间点只出一枚标签：两种工具都用过时按框选报，明细里补上处数', () => {
    // 同一秒圈两个框再涂一笔，说的是「这一帧上要改的地方」—— 一枚标签，不是三枚
    expect(spotsOf([box(3), brush(3, [[[0.5, 0.5]]]), box(8)]).map((rs) => rs.length)).toEqual([2, 1])
    expect(spotLabel([brush(5, [[[0.5, 0.5]]]), box(5)])).toBe('框选 00:05')
    expect(spotLabel([brush(61, [[[0.5, 0.5]]])])).toBe('画笔 01:01')
    expect(spotDetail([box(3)])).toBe('框选 00:03')
    expect(spotDetail([box(3), box(3)])).toBe('框选 00:03 2 处')
  })
  it('保存下来的是这次圈的那一套，深拷一份，外面再改不动它', () => {
    const draft = { regions: [box(1), box(3)], ranges: [{ start: 1, end: 4 }] }
    const saved = commitDraft(draft)
    expect(marksReading(saved)).toBe('@00:01–00:04 里的 @框选 00:01、@框选 00:03')
    draft.regions[0].rect[0] = 0.9
    expect(saved[0].regions[0].rect[0]).toBe(0.2)
  })
  it('选了好几段：一段一组，每一处标记归罩着它的那一段', () => {
    const saved = commitDraft({ regions: [box(1), box(3), box(8)], ranges: [{ start: 1, end: 4 }, { start: 7, end: 9 }] })
    expect(saved.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(marksReading(saved)).toBe('@00:01–00:04 里的 @框选 00:01、@框选 00:03；@00:07–00:09 里的 @框选 00:08')
    // 一段都没选就是「整段视频」那一组；一处也没圈就一组都没有
    expect(commitDraft({ regions: [box(1)], ranges: [] }).map((g) => g.range)).toEqual([null])
    expect(commitDraft({ regions: [], ranges: [] })).toEqual([])
  })
  it('句子里留着的那几组摊回草稿：几段时间按先后排好，几处标记并成一串', () => {
    const d = draftOf([{ ...group([box(8)], { start: 7, end: 9 }), id: 'g2' }, group([box(1)], { start: 1, end: 4 })])
    expect(d.ranges).toEqual([{ start: 1, end: 4 }, { start: 7, end: 9 }])
    expect(d.regions.map((r) => r.t)).toEqual([8, 1])
  })
})

describe('作用范围由标记推出来，不再是一个开关', () => {
  it('有任何一组带时间段，这次就是改这一段', () => {
    expect(markScope([])).toBe('whole')
    expect(markScope([group([box(1)])])).toBe('whole')
    expect(markScope([group([box(1)]), { ...group([], { start: 2, end: 4 }), id: 'g2' }])).toBe('segment')
  })
  it('任务记录里的 range 是所有组的外包络；只有一组时就是那一组', () => {
    expect(rangeHull([])).toBeNull()
    expect(rangeHull([group([], { start: 3, end: 8 })])).toEqual({ start: 3, end: 8 })
    expect(rangeHull([group([], { start: 6, end: 9 }), { ...group([], { start: 1, end: 4 }), id: 'g2' }]))
      .toEqual({ start: 1, end: 9 })
  })
  it('光标停在最前面按退格：从句尾一枚一枚往回删，一组删空就地消失', () => {
    const two = [group([box(1), box(2)], { start: 1, end: 3 }), { ...group([box(8)], { start: 8, end: 9 }), id: 'g2' }]
    // 先删最后一组的那一处标记
    const a = dropLastChip(two)
    expect(marksReading(a)).toBe('@00:01–00:03 里的 @框选 00:01、@框选 00:02；@00:08–00:09')
    // 再按一次删掉它的时间段，这一组就空了，整组消失
    const b = dropLastChip(a)
    expect(marksReading(b)).toBe('@00:01–00:03 里的 @框选 00:01、@框选 00:02')
    // 一路删到空
    expect(dropLastChip(dropLastChip(dropLastChip(b)))).toEqual([])
    expect(dropLastChip([])).toEqual([])
  })
  it('片段就是能改的全部范围：改了片段，掉到外面的那几处跟着摘掉，边界上的留着', () => {
    const marked = [box(2), box(4), box(9)]
    expect(clipRegions(marked, [{ start: 4, end: 9 }])).toEqual([box(4), box(9)])
    expect(clipRegions(marked, [{ start: 5, end: 6 }])).toEqual([])
    // 选了好几段：落在其中任何一段里的都留着
    expect(clipRegions(marked, [{ start: 1, end: 2 }, { start: 8, end: 10 }])).toEqual([box(2), box(9)])
    // 整段视频（一段都没选）就谁也不摘
    expect(clipRegions(marked, [])).toEqual(marked)
  })
  it('草稿空不空看的是「圈了没有」和「选了没有」两件事', () => {
    expect(draftEmpty({ regions: [], ranges: [] })).toBe(true)
    expect(draftEmpty({ regions: [], ranges: [{ start: 1, end: 2 }] })).toBe(false)
    expect(draftEmpty({ regions: [box(1)], ranges: [] })).toBe(false)
  })
  it('这一秒落在第几段里；几段加起来有多长', () => {
    const rs = [{ start: 1, end: 3 }, { start: 6, end: 9 }]
    expect(rangeAt(rs, 2)).toBe(0)
    expect(rangeAt(rs, 4)).toBe(-1)
    expect(rangeAt(rs, 9)).toBe(1)
    expect(rangesTotal(rs)).toBe(5)
  })
  it('段与段不许叠：每一段只能在左右邻居留下的那条空隙里伸展', () => {
    const rs = [{ start: 1, end: 5 }, { start: 11, end: 16 }]
    expect(rangeBounds(rs, 0, 24)).toEqual([0, 11])
    expect(rangeBounds(rs, 1, 24)).toEqual([5, 24])
    // 拖尾巴顶到下一段的头上就停住
    expect(adjustRange(rs[0], 'end', 20, 24, 0, 11)).toEqual({ start: 1, end: 11 })
    // 平移也顶在两边的邻居之间
    expect(adjustRange(rs[0], 'move', 30, 24, 0, 11)).toEqual({ start: 7, end: 11 })
    // 新拉的一段同样只在这条空隙里
    expect(dragRange(6, 20, 24, 5, 11)).toEqual({ start: 6, end: 11 })
  })
  it('点一下就选上的那一段只在空隙里长；空隙摆不下最短那一段就什么也不选', () => {
    expect(defaultSegment(6, 24, 5, 11)).toEqual({ start: 6, end: 10 })
    // 空隙只剩 3 秒，摆不下最短的 4 秒
    expect(defaultSegment(6, 24, 5, 8)).toBeNull()
  })
  it('调整片段时不能从它里面已有的标记上移开', () => {
    const r = { start: 2, end: 9 }
    const pin = pinnedBy([box(4), box(7)], r)
    expect(pin).toEqual([4, 7])
    // 两端各顶在最靠边的那一处标记上
    expect(adjustRange(r, 'start', 6, 15, 0, 15, pin)).toEqual({ start: 4, end: 9 })
    expect(adjustRange(r, 'end', 5, 15, 0, 15, pin)).toEqual({ start: 2, end: 7 })
    // 整体平移到「两处标记都还在段里」为止
    expect(adjustRange(r, 'move', 20, 15, 0, 15, pin)).toEqual({ start: 4, end: 11 })
    expect(adjustRange(r, 'move', -20, 15, 0, 15, pin)).toEqual({ start: 0, end: 7 })
    // 一处标记都没有：两头照旧只被邻居挡着
    expect(pinnedBy([], r)).toEqual([Infinity, -Infinity])
    expect(adjustRange(r, 'start', 6, 15, 0, 15, pinnedBy([], r))).toEqual({ start: 5, end: 9 })
  })
})

describe('提交与失效', () => {
  it('提交出来的是一份深拷贝：之后接着改草稿，已经进句子的那一组不会跟着变', () => {
    const draft = { regions: [brush(2, [[[0.1, 0.2]]])], ranges: [{ start: 1, end: 3 }] }
    const [g] = commitDraft(draft)
    expect(g.id).toBe('g1')
    draft.regions[0].strokes![0].push([0.9, 0.9]); draft.ranges[0].end = 9
    expect(g.regions[0].strokes![0]).toHaveLength(1)
    expect(g.range).toEqual({ start: 1, end: 3 })
  })
  it('换源或时长变短：标记指向的秒数没了就整批作废', () => {
    expect(outOfSource([group([box(9)])], 10)).toBe(false)
    expect(outOfSource([group([box(11)])], 10)).toBe(true)
    expect(outOfSource([group([], { start: 8, end: 12 })], 10)).toBe(true)
  })
  it('提交前只认整数秒、至少 4 秒、不越出原片', () => {
    expect(invalidMark([group([box(3)], { start: 1, end: 5 })], 10)).toBe(false)
    expect(invalidMark([group([box(3.5)])], 10)).toBe(true)
    expect(invalidMark([group([box(11)])], 10)).toBe(true)
    // 不足最短那一段
    expect(invalidMark([group([], { start: 2, end: 5 })], 10)).toBe(true)
    expect(invalidMark([group([], { start: 2, end: 11 })], 10)).toBe(true)
    expect(invalidMark([group([], { start: 1.5, end: 6 })], 10)).toBe(true)
  })
})

describe('时间段的取法', () => {
  it('「指定片段」默认拉出 4 秒，撞到片尾就缩', () => {
    expect(defaultSegment(0, 15.1)).toEqual({ start: 0, end: 4 })
    expect(defaultSegment(3.4, 15.1)).toEqual({ start: 3, end: 7 })
    expect(defaultSegment(14.9, 15.1)).toEqual({ start: 11, end: 15 })
    // 整条片子比最短那一段还短：一段都摆不下
    expect(defaultSegment(0, 3.9)).toBeNull()
  })
  it('在轨道上从哪头拖都一样，不足 4 秒就往里让而不是越界', () => {
    expect(dragRange(3, 7.4, 15.1)).toEqual({ start: 3, end: 7 })
    expect(dragRange(7, 3.4, 15.1)).toEqual({ start: 3, end: 7 })
    expect(dragRange(3, 3, 15.1)).toEqual({ start: 3, end: 7 })
    expect(dragRange(0, 0, 15.1)).toEqual({ start: 0, end: 4 })
    expect(dragRange(15, 15, 15.1)).toEqual({ start: 11, end: 15 })
  })
  it('拖两端保持至少 4 秒，平移保持长度且不越界', () => {
    const r = { start: 3, end: 8 }
    expect(adjustRange(r, 'start', 10, 15.1)).toEqual({ start: 4, end: 8 })
    expect(adjustRange(r, 'end', 0, 15.1)).toEqual({ start: 3, end: 7 })
    expect(adjustRange(r, 'move', -10, 15.1)).toEqual({ start: 0, end: 5 })
    expect(adjustRange(r, 'move', 20, 15.1)).toEqual({ start: 10, end: 15 })
    expect(adjustRange(r, 'end', 9.7, 15.1)).toEqual({ start: 3, end: 10 })
  })
  it('所有合法时长、拖动方向与边界均保持整数秒且不交叉', () => {
    for (const d of [4, 4.9, 8, 15.1, 30]) for (let t = -2; t < d + 2; t += 0.7) {
      const r = defaultSegment(t, d)!
      for (const action of ['start', 'end', 'move'] as const) for (const v of [-50, -0.7, 0, 3.4, 40]) {
        const next = adjustRange(r, action, v, d)
        expect(next.start).toBeGreaterThanOrEqual(0); expect(next.end).toBeLessThanOrEqual(Math.floor(d))
        expect(next.end - next.start).toBeGreaterThanOrEqual(RANGE_MIN)
        expect(Number.isInteger(next.start) && Number.isInteger(next.end)).toBe(true)
      }
      for (const b of [-3, 0, 1.4, d, d + 5]) {
        const next = dragRange(r.start, b, d)
        expect(next.start).toBeGreaterThanOrEqual(0); expect(next.end).toBeLessThanOrEqual(Math.floor(d))
        expect(next.end - next.start).toBeGreaterThanOrEqual(RANGE_MIN)
      }
    }
  })
})

describe('笔刷粗细', () => {
  it('滑杆两头就是笔刷两头，来回换算不跑偏', () => {
    expect(brushOf(0)).toBeCloseTo(BRUSH_MIN)
    expect(brushOf(1)).toBeCloseTo(BRUSH_MAX)
    for (const w of [BRUSH_MIN, BRUSH_WIDTH, BRUSH_MAX]) expect(brushOf(brushPct(w))).toBeCloseTo(w)
  })
  it('越界和读不出来的值都收回区间内，笔永远画得出来', () => {
    expect(clampBrush(0)).toBe(BRUSH_MIN)
    expect(clampBrush(9)).toBe(BRUSH_MAX)
    expect(clampBrush(Number.NaN)).toBe(BRUSH_WIDTH)
    expect(brushPct(-1)).toBe(0)
    expect(brushPct(9)).toBe(1)
  })
  it('外接框跟着这一处自己那一档粗细留余量，不是都按默认值算', () => {
    const pts: Stroke[] = [[[0.5, 0.5]]]
    expect(strokeBox(pts, BRUSH_MAX)[2]).toBeGreaterThan(strokeBox(pts, BRUSH_MIN)[2])
  })
})
