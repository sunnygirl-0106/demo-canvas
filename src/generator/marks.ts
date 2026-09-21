export interface TimeRange { start: number; end: number }
/** 选区是写进提示词的时间戳，按整数秒取，最短 1 秒。 */
export const RANGE_MIN = 1
/** 「指定片段」默认拉出 2 秒：一秒太窄，看不出这是一段。 */
export const SEGMENT_DEFAULT = 2
export const timecode = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export type MarkTool = 'box' | 'brush'
export type Rect = [number, number, number, number]
export type Stroke = [number, number][]
/**
 * 一处标记：画面坐标一律归一化到 0..1（与素材分辨率无关），t 取整数秒、和选区同一套刻度。
 * 画笔的 rect 是各笔的外接框 —— 送进模型的永远是这个框，笔迹只是用户画给自己看的。
 */
export interface MarkRegion { t: number; tool: MarkTool; rect: Rect; strokes?: Stroke[]; width?: number }
/**
 * 一组 = 当前这一套标记：圈了几处 + 最多一段时间。组只是「这一段时间管着这几处」的容器，
 * 界面上不露面 —— 露面的是每一处标记自己（带着自己的时间），以及罩着它们的那一段时间。
 * 节点上的控件常驻，一次任务只有这一套，所以长度恒为 0 或 1，id 恒为 'g1'。
 */
export interface MarkGroup { id: string; regions: MarkRegion[]; range: TimeRange | null }
export interface MarkDraft { regions: MarkRegion[]; range: TimeRange | null }

/**
 * 画笔默认线宽，归一化到画面宽度。
 * 笔迹底下那条半透明粗线只是交代「涂到哪儿」，不该糊成一团 —— 细到刚好能看出范围就够。
 */
export const BRUSH_WIDTH = 0.026
/**
 * 笔刷粗细的两头。归一化到画面宽度，所以同一档在任何分辨率的素材上涂出来一样粗。
 * 下限刚好还看得出是一条线，上限约等于画面的十二分之一 —— 再粗就不是「涂一块」而是「盖一层」了。
 */
export const BRUSH_MIN = 0.012, BRUSH_MAX = 0.084
export const clampBrush = (w: number) =>
  Number.isFinite(w) ? Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, w)) : BRUSH_WIDTH
/** 滑杆上的位置（0..1）与实际线宽互换：滑杆读的是比例，画笔用的是宽度。 */
export const brushPct = (w: number) => (clampBrush(w) - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN)
export const brushOf = (pct: number) => clampBrush(BRUSH_MIN + (BRUSH_MAX - BRUSH_MIN) * pct)
/** 松手时小于这个尺寸的框当误触丢掉：横竖分开定，因为画面是 16:9，同样的像素在纵向占比更大。 */
const RECT_MIN_W = 0.03, RECT_MIN_H = 0.04
/** 采点阈值（曼哈顿距离）：手抖不记点，否则一笔能攒出几百个点。 */
const POINT_MIN = 0.006

export const emptyDraft = (): MarkDraft => ({ regions: [], range: null })
export const draftEmpty = (d: MarkDraft) => !d.regions.length && !d.range
export const tinyRect = (rect: Rect) => rect[2] < RECT_MIN_W || rect[3] < RECT_MIN_H
/** 两点拉出来的框，归一化并保证正向宽高。 */
export const dragRect = (x0: number, y0: number, x: number, y: number): Rect =>
  [Math.min(x0, x), Math.min(y0, y), Math.abs(x - x0), Math.abs(y - y0)]
/**
 * 画笔的外接框：各笔的包围盒再留半个线宽的余量。
 * 纵向余量按 16/9 放大 —— 归一化坐标里 y 的一个单位比 x 短，不补偿的话框会贴着笔迹上下边。
 */
export function strokeBox(strokes: Stroke[], width = BRUSH_WIDTH): Rect {
  let a = 1, b = 1, c = 0, d = 0
  for (const st of strokes) for (const [x, y] of st) {
    a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y)
  }
  if (a > c) return [0, 0, 0, 0]
  const pad = width / 2
  a = clamp(a - pad, 0, 1); b = clamp(b - pad * 16 / 9, 0, 1)
  c = clamp(c + pad, 0, 1); d = clamp(d + pad * 16 / 9, 0, 1)
  return [a, b, Math.max(0, c - a), Math.max(0, d - b)]
}
/** 往最后一笔上续一个点；离上一个点太近就返回 null，表示这一下不记。 */
export function appendPoint(strokes: Stroke[], x: number, y: number): Stroke[] | null {
  const cur = strokes[strokes.length - 1]
  if (!cur?.length) return null
  const last = cur[cur.length - 1]
  if (Math.abs(last[0] - x) + Math.abs(last[1] - y) < POINT_MIN) return null
  return [...strokes.slice(0, -1), [...cur, [x, y] as [number, number]]]
}

/**
 * 一处标记怎么读：是框还是笔，以及它自己那一帧的时间。
 * 时间是这处标记的身份，任何地方都不能省 —— 三个框落在三个时间点就是三处，
 * 不是「3 处」这么一个数字。
 */
export const regionLabel = (r: MarkRegion) => `${r.tool === 'brush' ? '✎' : '⬚'} ${timecode(r.t)}`
/** 读出声的版本：标签上写不下的工具名和笔数放这里，给 aria 和悬浮卡用。 */
export const regionDetail = (r: MarkRegion) =>
  `${regionLabel(r)} ${r.tool === 'brush' ? `画笔${r.strokes ? ` ${r.strokes.length} 笔` : ''}` : '框选'}`
export const rangeLabel = (r: TimeRange) => `${timecode(r.start)}–${timecode(r.end)}`
/**
 * 一组读作一句。没选时间段就是逐处并列；选了时间段，这一段是它们的定语，念作「…时间段里的…」，
 * 里面有几处就列几处 —— 片段的头尾各一个框，读出来也得是两处。
 */
export function groupReading(g: MarkGroup): string {
  const parts = g.regions.map(regionLabel).join('、')
  if (!g.range) return parts || '整段视频'
  return g.regions.length ? `${rangeLabel(g.range)} 里的 ${parts}` : rangeLabel(g.range)
}
export const marksReading = (marks: MarkGroup[]) => marks.map(groupReading).join('；')
/** 作用范围不再是用户选的开关，而是从标记推出来：有任何一组带时间段，这次就是局部。 */
export const markScope = (marks: MarkGroup[]): 'whole' | 'segment' =>
  marks.some((g) => g.range) ? 'segment' : 'whole'
/**
 * 所有组时间范围的外包络。任务记录里保留这一个 range 是给人看的摘要，
 * 逐组的精确范围在 marks 里 —— 只有一组时它就等于那一组，和改版前读起来一样。
 */
export function rangeHull(marks: MarkGroup[]): TimeRange | null {
  const rs = marks.map((g) => g.range).filter((r): r is TimeRange => !!r)
  return rs.length ? { start: Math.min(...rs.map((r) => r.start)), end: Math.max(...rs.map((r) => r.end)) } : null
}
/** 节点上的控件是常驻的，用户改的永远是「当前这一套标记」，所以组 id 固定一个。 */
export const commitDraft = (d: MarkDraft): MarkGroup => ({
  id: 'g1',
  regions: d.regions.map((r) => ({ ...r, rect: [...r.rect] as Rect, strokes: r.strokes?.map((st) => st.map((p) => [...p] as [number, number])) })),
  range: d.range ? { ...d.range } : null,
})

/**
 * 从句子末尾往回删一枚：光标停在输入框最前面按退格，删的就是紧挨着它的那一枚 ——
 * 和在普通文本里退格一个字一样，一次一枚，而不是整句一起没。
 * 一组里先删标记再删它的时间段，删空的那一组就地消失。
 */
export function dropLastChip(marks: MarkGroup[]): MarkGroup[] {
  const i = marks.length - 1
  if (i < 0) return marks
  const g = marks[i]
  const next: MarkGroup = g.regions.length ? { ...g, regions: g.regions.slice(0, -1) } : { ...g, range: null }
  return [...marks.slice(0, i), next].filter((m) => m.regions.length || m.range)
}
/** 换源、或时长读出来比原来短了：标记指向的秒数已经不存在，整批作废。 */
export const outOfSource = (marks: MarkGroup[], duration: number) =>
  marks.some((g) => g.regions.some((r) => r.t > duration) || (g.range && g.range.end > duration))
/** 提交前的合法性：整数秒、至少 1 秒、区域与时间段都落在原片之内。 */
export function invalidMark(marks: MarkGroup[], duration: number): boolean {
  return marks.some((g) => {
    if (g.regions.some((r) => !Number.isInteger(r.t) || r.t < 0 || r.t > duration)) return true
    const r = g.range
    return !!r && (!Number.isInteger(r.start) || !Number.isInteger(r.end)
      || r.start < 0 || r.end > duration || r.end - r.start < RANGE_MIN)
  })
}
/** 「指定片段」的起手选区：从当前这一秒起 2 秒，撞到片尾就缩。 */
export function defaultSegment(t: number, duration: number): TimeRange | null {
  const dur = Math.floor(duration)
  if (!Number.isFinite(dur) || dur < RANGE_MIN) return null
  const start = clamp(Math.round(t), 0, dur - RANGE_MIN)
  return { start, end: Math.min(start + SEGMENT_DEFAULT, dur) }
}
/**
 * 在轨道上从 anchor 秒拖到 sec 秒：整数秒、至少 1 秒。
 * 还没拖开时默认往后补足一秒 —— 在第 3 秒按一下，拿到的是 3–4 而不是 2–3。
 */
export function dragRange(anchor: number, sec: number, duration: number): TimeRange {
  const dur = Math.floor(duration)
  const b = clamp(Math.round(sec), 0, dur)
  let start = Math.min(anchor, b), end = Math.max(anchor, b)
  if (end - start < RANGE_MIN) { if (end + RANGE_MIN <= dur) end = start + RANGE_MIN; else start = end - RANGE_MIN }
  return { start: clamp(start, 0, dur - RANGE_MIN), end: clamp(end, RANGE_MIN, dur) }
}
/**
 * 片段就是这次能改的全部范围：选了哪一段就播哪一段，也只能在这一段里圈。
 * 所以片段一改，落到新片段外面的那几处就跟着摘掉 —— 外面留不住东西，
 * 「有几处不在时间段内」这种状态因此根本不会出现。摘掉这一下和别的手势走同一条撤销栈。
 */
export const clipRegions = (regions: MarkRegion[], range: TimeRange | null) =>
  range ? regions.filter((r) => r.t >= range.start && r.t <= range.end) : regions
/** 拖两端保持至少 1 秒，平移保持长度且不越界。 */
export function adjustRange(range: TimeRange, action: 'start' | 'end' | 'move', value: number, duration: number): TimeRange {
  const dur = Math.floor(duration)
  if (action === 'start') return { ...range, start: clamp(Math.round(value), 0, range.end - RANGE_MIN) }
  if (action === 'end') return { ...range, end: clamp(Math.round(value), range.start + RANGE_MIN, dur) }
  const start = clamp(range.start + Math.round(value), 0, dur - (range.end - range.start))
  return { start, end: start + range.end - range.start }
}
