export interface TimeRange { start: number; end: number }
/** 选区是写进提示词的时间戳，按整数秒取，最短 4 秒。 */
export const RANGE_MIN = 4
/** 在轨道上点一下就选上这么长：和最短长度同一档，点出来的就是一段合法的片段。 */
export const SEGMENT_DEFAULT = 4
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
 * 一组 = 一段时间 + 落在它里面的那几处标记。组只是「这一段时间管着这几处」的容器，
 * 界面上不露面 —— 露面的是每一处标记自己（带着自己的时间），以及罩着它们的那一段时间。
 * 一段时间都没选时只有一组（range 为 null），管着整段视频里的那几处。
 */
export interface MarkGroup { id: string; regions: MarkRegion[]; range: TimeRange | null }
/**
 * 手上这一份草稿：圈了几处 + 选了哪几段时间。
 * 时间段是一份平铺的清单而不是一段 —— 「只改这几处」常常散落在片子的好几截里，
 * 一次只能圈一截的话，用户得分几次任务去改同一件事。每一处标记属于罩着它的那一段。
 */
export interface MarkDraft { regions: MarkRegion[]; ranges: TimeRange[] }

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

export const emptyDraft = (): MarkDraft => ({ regions: [], ranges: [] })
export const draftEmpty = (d: MarkDraft) => !d.regions.length && !d.ranges.length
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
 * 一个时间点上标的那些东西，合起来读作一枚标签：「标记 00:05」。
 *
 * 不写是框还是笔。那是他拿哪支工具画出来的，而这一句要说的是「这一帧上有一处要改的地方」——
 * 送进模型的东西两支工具本来也是同一样（画笔交出去的同样是它的外接框，见 MarkRegion）。
 * 分成两个词，用户还得先知道「框选」和「画笔」在这里有没有区别，而答案是没有。
 *
 * 时间是这处标记的身份，任何地方都不能省 —— 三处落在三个时间点就是三枚标签，
 * 不是「3 处」这么一个数字。同一秒圈两个框、再涂一笔说的是同一件事，所以只出一枚。
 */
export const spotLabel = (rs: MarkRegion[]) => `标记 ${timecode(rs[0]?.t ?? 0)}`
/** 读出声的版本：标签上写不下的处数放这里，给 aria 和悬浮卡用。 */
export const spotDetail = (rs: MarkRegion[]) =>
  `${spotLabel(rs)}${rs.length > 1 ? ` ${rs.length} 处` : ''}`
/** 把一串标记按它们各自那一秒归拢，按时间先后排：一秒一枚标签。 */
export function spotsOf(regions: MarkRegion[]): MarkRegion[][] {
  const at = new Map<number, MarkRegion[]>()
  for (const r of regions) at.set(r.t, [...(at.get(r.t) ?? []), r])
  return [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, rs]) => rs)
}
export const rangeLabel = (r: TimeRange) => `${timecode(r.start)}–${timecode(r.end)}`
/**
 * 结构化标签念成文字时一律挂一个 @。
 *
 * 在提示词框里，素材、时间段、标记各是一枚有图有底的牌子，一眼看得出「这不是我打的字」。
 * 一旦念成一串纯文字（任务记录、全部版本里那段提示词），牌子没了，
 * 「00:03–00:08」和用户自己敲的一串数字就长得一模一样，分不出哪几截是机器认的参数。
 * @ 把这件事接回来：用户在这个框里打 @ 引用素材，本来就是「这一截是个指认」的写法，
 * 读的人认得，模型也认得，还不挑字体 —— 比任何一个符号都稳。
 *
 * 只给念出来的那一份加。标签自己在屏幕上不写 @（那是「怎么把它选进来的」，不是它是什么），
 * aria 和悬浮卡读的是 spotLabel / rangeLabel 这一层，也不该多出一个念成「at」的符号。
 */
export const tag = (s: string) => `@${s}`
/**
 * 一组读作一句。没选时间段就是逐处并列；选了时间段，这一段是它们的定语，念作「…时间段里的…」，
 * 里面有几处就列几处 —— 片段的头尾各一个框，读出来也得是两处。
 */
export function groupReading(g: MarkGroup): string {
  const parts = spotsOf(g.regions).map((rs) => tag(spotLabel(rs))).join('、')
  if (!g.range) return parts || '整段视频'
  return g.regions.length ? `${tag(rangeLabel(g.range))} 里的 ${parts}` : tag(rangeLabel(g.range))
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
const copyRegion = (r: MarkRegion): MarkRegion =>
  ({ ...r, rect: [...r.rect] as Rect, strokes: r.strokes?.map((st) => st.map((p) => [...p] as [number, number])) })
/**
 * 一份草稿拆成几组交出去：一段时间一组，组里装落在它里面的那几处标记；
 * 一段都没选时就是「整段视频」那一组。深拷一份 —— 交出去之后手上再改动不到它。
 * 组 id 按顺序给（g1、g2…）：句子里的标签靠它认回自己属于哪一段。
 */
export function commitDraft(d: MarkDraft): MarkGroup[] {
  if (!d.ranges.length) return d.regions.length ? [{ id: 'g1', regions: d.regions.map(copyRegion), range: null }] : []
  return d.ranges.map((range, i) => ({
    id: `g${i + 1}`,
    regions: d.regions.filter((r) => r.t >= range.start && r.t <= range.end).map(copyRegion),
    range: { ...range },
  }))
}
/** 反过来：句子里现在留着的那几组，摊回手上这一份草稿。 */
export const draftOf = (marks: MarkGroup[]): MarkDraft => ({
  regions: marks.flatMap((g) => g.regions),
  ranges: sortRanges(marks.map((g) => g.range).filter((r): r is TimeRange => !!r)),
})
/** 时间段一律按先后摆：轨道上从左到右读下来，就是它们在片子里的顺序。 */
export const sortRanges = (ranges: TimeRange[]): TimeRange[] =>
  [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
/** 这一秒落在第几段里；哪一段都不在就是 -1。 */
export const rangeAt = (ranges: TimeRange[], t: number) =>
  ranges.findIndex((r) => t >= r.start && t <= r.end)
/** 几段时间加起来有多长：轨道上那个「共 Ns」报的就是它。 */
export const rangesTotal = (ranges: TimeRange[]) => ranges.reduce((n, r) => n + (r.end - r.start), 0)
/**
 * 第 i 段左右能伸到哪儿：被两边的邻居挡住。
 * 段与段之间不许叠 —— 叠起来的两段说的是同一截时间，读出来却是两句，
 * 所以宁可让它顶在邻居身上停下，也不去事后合并（合并会让手里正拖的那一段忽然消失）。
 */
export const rangeBounds = (ranges: TimeRange[], i: number, duration: number): [number, number] =>
  [i > 0 ? ranges[i - 1].end : 0, i + 1 < ranges.length ? ranges[i + 1].start : Math.floor(duration)]

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
/** 提交前的合法性：整数秒、至少 RANGE_MIN 秒、区域与时间段都落在原片之内。 */
export function invalidMark(marks: MarkGroup[], duration: number): boolean {
  return marks.some((g) => {
    if (g.regions.some((r) => !Number.isInteger(r.t) || r.t < 0 || r.t > duration)) return true
    const r = g.range
    return !!r && (!Number.isInteger(r.start) || !Number.isInteger(r.end)
      || r.start < 0 || r.end > duration || r.end - r.start < RANGE_MIN)
  })
}
/**
 * 在轨道上点一下就选上的那一段：从点中的这一秒起 SEGMENT_DEFAULT 秒，撞到片尾、撞到旁边那一段就缩。
 * lo / hi 是这一下能占的地界（默认整条片子）—— 空隙短得摆不下最短那一段就不选，返回 null。
 */
export function defaultSegment(t: number, duration: number, lo = 0, hi = duration): TimeRange | null {
  const dur = Math.floor(duration)
  if (!Number.isFinite(dur) || dur < RANGE_MIN) return null
  const a = clamp(Math.floor(lo), 0, dur), b = clamp(Math.floor(hi), 0, dur)
  if (b - a < RANGE_MIN) return null
  const start = clamp(Math.round(t), a, b - RANGE_MIN)
  return { start, end: Math.min(start + SEGMENT_DEFAULT, b) }
}
/**
 * 在轨道上从 anchor 秒拖到 sec 秒：整数秒、至少 RANGE_MIN 秒。
 * 还没拖开时默认往后补足最短那一段 —— 在第 3 秒按一下，拿到的是 3–7 而不是往前倒。
 */
export function dragRange(anchor: number, sec: number, duration: number, lo = 0, hi = duration): TimeRange {
  const dur = Math.floor(duration)
  const a = clamp(Math.floor(lo), 0, dur), z = clamp(Math.floor(hi), 0, dur)
  const b = clamp(Math.round(sec), a, z)
  let start = Math.min(anchor, b), end = Math.max(anchor, b)
  if (end - start < RANGE_MIN) { if (end + RANGE_MIN <= z) end = start + RANGE_MIN; else start = end - RANGE_MIN }
  return { start: clamp(start, a, z - RANGE_MIN), end: clamp(end, a + RANGE_MIN, z) }
}
/**
 * 片段就是这次能改的全部范围：选了哪一段就播哪一段，也只能在这一段里圈。
 * 所以**新选出一段**时，落到它外面的那几处跟着摘掉 —— 外面留不住东西。
 * 调整已有的那一段不走这条路：那时段两端反过来被里面的标记顶住（见 pinnedBy），
 * 一次拖动把用户画出来的东西抹掉，比让它停在那儿难懂得多。
 */
export const clipRegions = (regions: MarkRegion[], ranges: TimeRange[]) =>
  ranges.length ? regions.filter((r) => rangeAt(ranges, r.t) >= 0) : regions
/**
 * 这一段里已经有标记的那几秒落在哪两头：段的两端收不过它们。
 * 一处都没有就是一对空边界（+∞ / −∞），下面那几条 clamp 自然不受它影响。
 */
export const pinnedBy = (regions: MarkRegion[], r: TimeRange): [number, number] => {
  const ts = regions.filter((g) => g.t >= r.start && g.t <= r.end).map((g) => g.t)
  return [ts.length ? Math.min(...ts) : Infinity, ts.length ? Math.max(...ts) : -Infinity]
}
/**
 * 拖两端保持至少 RANGE_MIN 秒，平移保持长度；lo / hi 是邻居留给它的地界，默认整条片子。
 * pin 是「这一段里已经标了东西的那几秒」（见 pinnedBy）：段不能从它们身上移开 ——
 * 调整一下片段就把用户画出来的东西挤掉，比让它顶在那儿停下难懂得多。
 */
export function adjustRange(range: TimeRange, action: 'start' | 'end' | 'move', value: number, duration: number,
  lo = 0, hi = duration, pin: [number, number] = [Infinity, -Infinity]): TimeRange {
  const dur = Math.floor(duration)
  const a = clamp(Math.floor(lo), 0, dur), b = clamp(Math.floor(hi), 0, dur)
  const [pinLo, pinHi] = pin
  if (action === 'start') return { ...range, start: clamp(Math.round(value), a, Math.min(range.end - RANGE_MIN, pinLo)) }
  if (action === 'end') return { ...range, end: clamp(Math.round(value), Math.max(range.start + RANGE_MIN, pinHi), b) }
  const len = range.end - range.start
  const lowest = Math.max(a, Number.isFinite(pinHi) ? pinHi - len : a)
  const highest = Math.max(lowest, Math.min(b - len, Number.isFinite(pinLo) ? pinLo : b - len))
  const start = clamp(range.start + Math.round(value), lowest, highest)
  return { start, end: start + len }
}
