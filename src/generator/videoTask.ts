import type { GenState } from '../store/generator'
import { MODEL_CAPABILITIES, fmt, refModeOf, activeIds, inputLimits, isRef, matBlockedReason, modeBlockedReason, supportsRange, rangeBlockedReason, locksRatio, connInfo, modeAvailable, modelUnusableReason, durRange, readingDuration, TAB_REQUIREMENT, type MatGet, type Model, TABS } from './materialLayout'
import { invalidMark, markScope, marksReading, rangeHull, type MarkGroup } from './marks'
// 时间范围的类型与算法都下沉到 marks.ts（标记组自己带着范围），这里原样转出去，调用方不用改 import
export { RANGE_MIN, timecode, adjustRange, type TimeRange } from './marks'
export function sourceError(d?: number, ready = true, model: Model = 'sd2.5', name = ''): string | null {
  const [lo, hi] = MODEL_CAPABILITIES[model].videoSeconds
  // 读完会自己恢复，不用再补一句「准备好后即可继续」
  if (!ready || d == null || !Number.isFinite(d)) return readingDuration(name)
  if (d < lo || d > hi) return durRange(lo, hi, name)
  return null
}
/** 「还没填」类提示：空槽位与占位符在界面上一眼可见，面板里不再重复，只用于禁用按钮与按钮悬停说明。 */
const TODO = {
  first: '还需添加首帧',
  source: '还需选择源视频', direction: '还需选择延长方向',
  badRange: '标记时间超出源视频范围，重新标记后可继续',
}
/**
 * 参考素材读不读得出来。时长不合规、文件读不出来的素材已经由 inputLimits 整条拦住生成，
 * 到这里只剩「还在读」这一种要等的状态。
 */
function referenceError(g: GenState, active: string[], get: MatGet): string | null {
  const source = g.mode === 'edit' || g.mode === 'extend' ? g.slotEdit : null
  for (const id of active) {
    if (id === source) continue // 主视频有自己的区间要求，已经单独查过
    const m = get(id)
    if (m?.kind !== 'video') continue
    if (m.ready === false || m.dur == null || !Number.isFinite(m.dur)) return readingDuration(m.name)
  }
  return null
}
export function taskError(g: GenState, get: MatGet): string | null {
  // 模型没有这个能力时，生成和 Tab 给同一句话
  const cap = MODEL_CAPABILITIES[g.model]
  if (!cap.genModes.includes(g.mode)) return modeUnsupported(g, g.model, get)
  // 素材规则也和 Tab 置灰共用同一份判断：否则会出现「五个模式全部置灰、生成却还能提交」
  const unusable = modeBlockedReason(g.mode, g.conn, get, g.model, g.slotEdit)
  if (unusable) return unusable
  const ids = activeIds(g, g.mode)
  if (g.mode === 'frames' && !g.slotFirst) return TODO.first
  if (g.mode === 'edit' || g.mode === 'extend') {
    const m = g.slotEdit ? get(g.slotEdit) : null
    if (!m) return TODO.source
    // 素材本身用不了（读不出来、时长不在区间内）时，缩略图已经是灰的，这里只把同一句话交给生成按钮
    const blocked = matBlockedReason(m, g.model)
    if (blocked) return blocked
    const error = sourceError(m.dur, m.ready, g.model, m.name)
    if (error) return error
    // 延长一律整条进：原片从哪一头接由方向决定，没有「接哪一段」这回事
    // 只要标了东西就是在指范围 —— 每一处标记都带着一个整数秒，不带时间段的框也一样要模型认秒数
    if (g.mode === 'edit' && g.marks.length) {
      if (!supportsRange(g.model)) return rangeBlockedReason(g.model)
      if (invalidMark(g.marks, Math.floor(m.dur!))) return TODO.badRange
    }
    if (g.mode === 'extend' && !g.direction) return TODO.direction
  }
  const badRef = referenceError(g, ids, get)
  if (badRef) return badRef
  const invalid = Object.entries(g.references).find(([name, id]) => mentions(g.prompt, name) && !ids.includes(id))
  // 连着也可能不参与：不一定是「重新添加素材」能解决的
  if (invalid) return `引用 @${invalid[0]} 未参与本次生成，可移除引用或调整素材`
  // 提示词不设门槛：一句话都不写也让他生成 —— 空句子是他的选择，不是缺一步没做完
  return null
}
/**
 * 型号做不了这件事（U07）。模式标签、模型列表和生成按钮共用这一句。
 * 只有 Seedance 2.5 同时接得住当前素材和这件事时才给这条出路 —— 推荐一个同样用不了的型号更糟。
 */
function modeUnsupported(g: GenState, model: Model, get: MatGet): string {
  const label = TABS.find((t) => t.k === g.mode)!.label
  const alt = model !== DELUXE && modeAvailable(g.mode, g.conn, get, DELUXE, g.slotEdit)
    ? `，可使用 ${MODEL_CAPABILITIES[DELUXE].label}` : ''
  return `${MODEL_CAPABILITIES[model].label} 不支持${label}${alt}`
}
const DELUXE: Model = 'sd2.5'
/**
 * 换这个型号会让当前这件事做不成的所有原因，模型列表按它置灰 —— 所有规则一个入口。
 * 顺序按「说得多具体」排：先说它接不住哪一段素材（类型 → 单段时长 → 数量 → 合计时长），
 * 再说它接不住你已经选好的范围，最后才是「它在当前连接下一个模式都进不去」这种最泛的情况。
 * 理由里不带型号名：它就写在模型列表的同一行上。
 */
export function modelBlockedReason(g: GenState, model: Model, get: MatGet): string {
  return modeBlocksModel(g, model, get) || inputsBlockModel(g, model, get)
    || marksBlockModel(g, model) || modelUnusableReason(g.conn, get, model)
}
/** 换过去之后素材就超限了。当前型号本来就超了的不算在它头上——那是素材的问题，生成按钮已经在说。 */
function inputsBlockModel(g: GenState, model: Model, get: MatGet): string {
  const ids = activeIds(g, g.mode)
  return inputLimits(ids, g.model, get) ? '' : inputLimits(ids, model, get)
}
/**
 * 正在做的事它做不了。和 Tab 置灰、生成校验共用同一句判断：
 * Tab 会因为型号灰掉，型号也该因为 Tab 灰掉，两边不能只拦一头。
 */
function modeBlocksModel(g: GenState, model: Model, get: MatGet): string {
  // 全能参考和参考图是同一件事的两个名字：换过去只是 Tab 改个名（setModel 会自己落过去），
  // 不能按「不支持」把型号灰掉 —— 那会让「连了素材就选不到 Wan」变成一个走不出去的死角，
  // 因为另一个参考 Tab 在当前型号下本来就是灰的，「先切到别的模式再选」这条出路并不存在。
  if (isRef(g.mode) ? !refModeOf(model) : !MODEL_CAPABILITIES[model].genModes.includes(g.mode)) {
    return modeUnsupported(g, model, get)
  }
  if (g.mode !== 'edit' && g.mode !== 'extend') return ''
  // 换过去这个模式就容纳不下手上的素材了（只收图的型号收不下源视频）。
  // 当前型号本来就容纳不下的不算在它头上 —— 那是素材的问题，和 inputsBlockModel 同一条道理
  const mine = TAB_REQUIREMENT[g.mode](connInfo(g.conn, get, g.model, g.slotEdit))
  return mine ? '' : TAB_REQUIREMENT[g.mode](connInfo(g.conn, get, model, g.slotEdit))
}
/**
 * 切到不响应范围的模型会让用户标的东西全部失效，所以拦住它，并给出解除办法。
 * 注意只拦、不清：标记是手画出来的，比一个开关贵得多，换个型号不该把它们抹掉 ——
 * 要放大成整条有「移除标记，改整条」这个明确的出口。
 */
export function marksBlockModel(g: GenState, model: Model): string {
  if (g.mode !== 'edit' || !g.marks.length || supportsRange(model)) return ''
  // 理由和标记入口上挂的是同一句，只多一条解除办法；标了几处不用在这里重复
  return `${rangeBlockedReason(model)}，移除标记后可切换`
}
/**
 * 句子里真的提到了这枚引用。名字带编号（视频节点1、视频节点11），
 * 直接按字符串包含算，「@视频节点11」会把「视频节点1」也算成提到过 ——
 * 一条早就从句子里删掉的引用于是又被算进这次任务里。
 */
function mentions(prompt: string, name: string) {
  for (let i = prompt.indexOf(`@${name}`); i >= 0; i = prompt.indexOf(`@${name}`, i + 1)) {
    if (!/\d/.test(prompt[i + 1 + name.length] ?? '')) return true
  }
  return false
}
export function taskPayload(g: GenState, get: MatGet) {
  const error = taskError(g, get)
  if (error) throw new Error(error)
  const cap = MODEL_CAPABILITIES[g.model]
  const ids = activeIds(g, g.mode)
  const source = (g.mode === 'edit' || g.mode === 'extend') && g.slotEdit ? get(g.slotEdit) : null
  const marks: MarkGroup[] = g.mode === 'edit' ? g.marks : []
  return {
    mode: g.mode, model: g.model, prompt: g.prompt.trim(), inputIds: ids,
    inputs: ids.map((id) => { const m = get(id)!; return { id, name: m.name, kind: m.kind, src: m.src, duration: m.dur } }),
    scope: g.mode === 'edit' ? markScope(marks) : g.mode === 'extend' ? 'whole' : null,
    roles: { source: source?.id ?? null, firstFrame: g.mode === 'frames' ? g.slotFirst : null, lastFrame: g.mode === 'frames' ? g.slotLast : null, references: g.mode === 'text' || g.mode === 'frames' ? [] : [...g.tray] },
    references: Object.fromEntries(Object.entries(g.references).filter(([name, id]) => ids.includes(id) && mentions(g.prompt, name))),
    sourceId: source?.id ?? null, sourceSrc: source?.src ?? null, sourceDuration: source?.dur ?? null,
    /** 摘要用的外包络；逐组的精确范围在 marks 里，只有一组时两者读起来一样 */
    range: rangeHull(marks),
    /** 每一处标记自动截下的那一帧（标记画在上面）作为参考图挂在源视频右边，记录里存它截自第几秒 */
    markShots: [...new Set(marks.flatMap((g) => g.regions.map((r) => r.t)))].sort((a, b) => a - b),
    /** 编辑的标记是作用域：产出里有它，但不改变产出长度 */
    rangeMeaning: marks.length ? '作用域' : null,
    // 深拷贝：提交记录是那一刻的快照，之后改标记不能倒着改写已经交出去的任务
    marks: marks.map((x): MarkGroup => ({ ...x, range: x.range && { ...x.range }, regions: x.regions.map((r) => ({ ...r, rect: [...r.rect], strokes: r.strokes?.map((st) => st.map((pt) => [...pt] as [number, number])) })) })),
    /** 读作：这一整句提示词最终是什么意思，对着它就能验收 */
    reads: g.mode === 'edit' && source
      // 一句要求都没写时不留一个吊着的「的」：读到哪算哪
      ? `把「视频 ${source.name}」${marks.length ? `中 ${marksReading(marks)} 的 ` : '的 '}${g.prompt.trim()}`.trimEnd().replace(/的$/, '').trimEnd()
      : null,
    direction: g.mode === 'extend' ? g.direction : null,
    // 提交记录必须和界面显示的参数一致：界面能手选比例的模型（2.0 不锁定）就照手选值提交，
    // 参数里没有配音开关的模型不能夹带 sound。
    params: { ...g.params,
      ratio: locksRatio(g.mode, g.model) ? 'adaptive' : g.params.ratio,
      duration: g.mode === 'edit' ? source!.dur! : g.params.duration,
      sound: cap.hasAudioToggle ? g.params.sound : false },
    output: g.mode === 'edit' ? `整条视频（时长与原片一致 ${fmt(source!.dur!)}）`
      : g.mode === 'extend' ? `新增片段 ${g.params.duration}s（不含原片，不自动拼接）` : '新视频',
    demo: true as const,
  }
}
export type TaskPayload = ReturnType<typeof taskPayload>
