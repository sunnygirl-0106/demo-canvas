import type { GenState } from '../store/generator'
import { MODEL_CAPABILITIES, fmt, isRef, refModeOf, matBlockedReason, partition, mediaSecondsWarning, mediaSecondsBlocked, supportsRange, rangeBlockedReason, locksRatio, connInfo, modeAfterModel, modelUnusableReason, sourceBounds, tabNote, TAB_REQUIREMENT, type MatGet, type Mode, type Model, TABS } from './materialLayout'
import { invalidMark, markCount, markScope, marksReading, rangeHull, type MarkGroup } from './marks'
import { docWritten } from './promptDoc'
export { sourceBounds } from './materialLayout'
// 时间范围的类型与算法都下沉到 marks.ts（标记组自己带着范围），这里原样转出去，调用方不用改 import
export { RANGE_MIN, timecode, adjustRange, type TimeRange } from './marks'
export function sourceError(d?: number, ready = true, mode: Mode = 'edit', model: Model = 'sd2.5'): string | null {
  const [lo, hi] = sourceBounds(mode, model)
  if (!ready || d == null || !Number.isFinite(d)) return '正在读取源视频时长，准备好后即可继续'
  if (d < lo) return `源视频不足 ${lo} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  if (d > hi) return `源视频超过 ${hi} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  return null
}
/** 「还没填」类提示：空槽位与占位符在界面上一眼可见，面板里不再重复，只用于禁用按钮与按钮悬停说明。 */
const TODO = {
  first: '请添加首帧', ref: '请添加参考素材', refImage: '请添加参考图',
  source: '请选择源视频', direction: '请选择向前或向后延长',
  badRange: '标记指向的时间已经超出这段原片，请重新标记',
  promptEdit: '描述想要修改的内容', prompt: '请填写生成要求',
}
const TODO_SET = new Set<string>(Object.values(TODO))
export const isTodoError = (error: string | null) => !!error && TODO_SET.has(error)
/**
 * 参考素材读不读得出来。时长不合规、文件读不出来的素材已经在 partition 里被挡在有效输入之外
 * （素材缩略图上置灰、Tab 上悬浮说明），到这里只剩「还在读」这一种要等的状态。
 */
function referenceError(g: GenState, active: string[], get: MatGet): string | null {
  const source = g.mode === 'edit' || g.mode === 'extend' ? g.slotEdit : null
  for (const id of active) {
    if (id === source) continue // 主视频有自己的区间要求，已经单独查过
    const m = get(id)
    if (m?.kind !== 'video') continue
    if (m.ready === false || m.dur == null || !Number.isFinite(m.dur)) return `正在读取参考视频 ${m.name} 的时长，准备好后即可继续`
  }
  return null
}
export function taskError(g: GenState, get: MatGet): string | null {
  // 模型没有这个能力时，生成和 Tab 给同一句话
  const cap = MODEL_CAPABILITIES[g.model]
  if (!cap.genModes.includes(g.mode)) return `${cap.label} 不支持${TABS.find((t) => t.k === g.mode)!.label}`
  // 素材规则也和 Tab 置灰共用同一份判断：否则会出现「五个模式全部置灰、生成却还能提交」
  const unusable = TAB_REQUIREMENT[g.mode](connInfo(g.conn, get, g.model, g.slotEdit))
  if (unusable) return unusable
  const { active } = partition(g, g.mode, g.model, get)
  if (g.mode === 'frames') {
    if (!g.slotFirst) return TODO.first
    const first = get(g.slotFirst)
    if (first?.error) return `首帧 ${first.name}：${first.error}`
  }
  // 用有效输入判断，不用连线数：配额为 0 的素材连着也不算数。
  // 连着、却一个都用不上时，说的是那一段为什么用不上，不是干巴巴一句「请添加参考素材」
  if (isRef(g.mode) && !active.length) {
    const first = g.tray.map(get).find((m): m is NonNullable<typeof m> => !!m)
    const why = first && matBlockedReason(first, g.mode, g.model)
    return why ? `${first!.name} ${why}` : g.mode === 'refImage' ? TODO.refImage : TODO.ref
  }
  if (g.mode === 'edit' || g.mode === 'extend') {
    const m = g.slotEdit ? get(g.slotEdit) : null
    if (!m) return TODO.source
    // 素材本身用不了（读不出来、时长不在区间内）时，缩略图已经是灰的，这里只把同一句话交给生成按钮
    const blocked = matBlockedReason(m, g.mode, g.model)
    if (blocked) return `${m.name} ${blocked}`
    const error = sourceError(m.dur, m.ready, g.mode, g.model)
    if (error) return error
    // 延长一律整条进：原片从哪一头接由方向决定，没有「接哪一段」这回事
    // 只要标了东西就是在指范围 —— 每一处标记都带着一个整数秒，不带时间段的框也一样要模型认秒数
    if (g.mode === 'edit' && g.marks.length) {
      if (!supportsRange(g.model)) return rangeBlockedReason(g.model)
      if (invalidMark(g.marks, Math.floor(m.dur!))) return TODO.badRange
    }
    if (g.mode === 'extend' && !g.direction) return TODO.direction
  }
  const badRef = referenceError(g, active, get)
  if (badRef) return badRef
  const warn = mediaSecondsWarning(g, get)
  if (warn) return warn
  const invalid = Object.entries(g.references).find(([name, id]) => g.prompt.includes(`@${name}`) && !active.includes(id))
  if (invalid) return `引用 @${invalid[0]} 已不在本次素材中，请删除引用或重新添加素材`
  // 句子开头那几个字是替用户写的，不算他说过话：去掉之后还剩字，才叫说清楚了要改什么
  if (!docWritten(g.doc, g.prompt)) return g.mode === 'edit' ? TODO.promptEdit : TODO.prompt
  return null
}
/**
 * 换这个型号会让当前这件事做不成的所有原因，模型列表按它置灰 —— 所有规则一个入口。
 * 顺序按「说得多具体」排：先说它接不住哪一段素材（源视频 → 参考视频 → 合计时长），
 * 再说它接不住你已经选好的范围，最后才是「它在当前连接下一个模式都进不去」这种最泛的情况。
 * 理由里不带型号名：它就写在模型列表的同一行上。
 */
export function modelBlockedReason(g: GenState, model: Model, get: MatGet): string {
  return modeBlocksModel(g, model, get) || refsBlockModel(g, model, get)
    || mediaSecondsBlocked(g, model, get)
    || marksBlockModel(g, model) || modelUnusableReason(g.conn, get, model)
}
/**
 * 选得了、但换过去之后会变样：落到哪个 Tab、有哪些连着的素材从此不参与。
 * 说的和那个 Tab 自己的悬浮说明是同一句（tabNote）—— 只是提前到做选择之前说，
 * 不用先换过去、再回头去 Tab 上发现视频不见了。灰掉的型号不走这条，它有自己的理由。
 */
export function modelNote(g: GenState, model: Model, get: MatGet): string {
  if (model === g.model || modelBlockedReason(g, model, get)) return ''
  const mode = modeAfterModel(g.mode, g.conn, get, model, g.slotEdit)
  return tabNote(mode, connInfo(g.conn, get, model, g.slotEdit), model)
}
/**
 * 换过去之后手上的参考视频会不合规：2.5 的编辑任务要求辅助参考视频也 4 秒起，
 * 2.0 只要 2 秒但最长只收 15 秒。区间只会变严才需要查，放宽的方向不拦。
 */
function refsBlockModel(g: GenState, model: Model, get: MatGet): string {
  const [lo, hi] = sourceBounds(g.mode, model)
  const [curLo, curHi] = sourceBounds(g.mode, g.model)
  if (lo <= curLo && hi >= curHi) return ''
  const source = g.mode === 'edit' || g.mode === 'extend' ? g.slotEdit : null
  // 按「现在正在用的这些输入」去问新型号收不收，不是按新型号自己的筛选结果 ——
  // 否则它把不合规的那一段筛掉之后，反倒显得它什么都收得下
  for (const id of partition(g, g.mode, g.model, get).active) {
    if (id === source) continue // 主视频有自己那一条，已经在 modeBlocksModel 里查过
    const m = get(id)
    if (m?.kind !== 'video' || m.dur == null || !Number.isFinite(m.dur)) continue
    if (m.dur < lo || m.dur > hi) return `参考视频 ${m.name} 为 ${fmt(m.dur)}，这个型号要求 ${lo}–${hi} 秒`
  }
  return ''
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
    return `不支持${TABS.find((t) => t.k === g.mode)!.label}，先切到别的模式再选`
  }
  if (g.mode !== 'edit' && g.mode !== 'extend') return ''
  // 换个型号可能连手上这段源视频都接不住了：2.5 编辑要 4 秒起、最长 30 秒，2.0 是 2–15 秒。
  // 先看已经选定的那一段，再退回「连着的视频有没有一段能当源」—— 画布上别的视频合规，
  // 不代表用户正在编辑的这一段合规。
  const m = g.slotEdit ? get(g.slotEdit) : null
  if (m?.kind === 'video' && m.dur != null && Number.isFinite(m.dur)) {
    const [lo, hi] = sourceBounds(g.mode, model)
    if (m.dur < lo || m.dur > hi) return `源视频 ${m.name} 为 ${fmt(m.dur)}，这个型号要求 ${lo}–${hi} 秒`
  }
  return TAB_REQUIREMENT[g.mode](connInfo(g.conn, get, model, g.slotEdit))
}
/**
 * 切到不响应范围的模型会让用户标的东西全部失效，所以拦住它，并给出解除办法。
 * 注意只拦、不清：标记是手画出来的，比一个开关贵得多，换个型号不该把它们抹掉 ——
 * 要放大成整条有「移除标记，改整条」这个明确的出口。
 */
export function marksBlockModel(g: GenState, model: Model): string {
  if (g.mode !== 'edit' || !g.marks.length || supportsRange(model)) return ''
  const { regions, ranges } = markCount(g.marks)
  // 只选了时间段、一处没圈也算标了东西，这句话不能读成「标了 0 处」
  const tally = [regions ? `${regions} 处` : '', ranges ? `${ranges} 段` : ''].filter(Boolean).join('、')
  return `不响应范围，当前标了 ${tally}`
}
export function taskPayload(g: GenState, get: MatGet) {
  const error = taskError(g, get)
  if (error) throw new Error(error)
  const cap = MODEL_CAPABILITIES[g.model]
  const { active: ids, skipped } = partition(g, g.mode, g.model, get)
  const source = (g.mode === 'edit' || g.mode === 'extend') && g.slotEdit ? get(g.slotEdit) : null
  const marks: MarkGroup[] = g.mode === 'edit' ? g.marks : []
  return {
    mode: g.mode, model: g.model, prompt: g.prompt.trim(), inputIds: ids,
    inputs: ids.map((id) => { const m = get(id)!; return { id, name: m.name, kind: m.kind, src: m.src, duration: m.dur } }),
    skipped,
    scope: g.mode === 'edit' ? markScope(marks) : g.mode === 'extend' ? 'whole' : null,
    roles: { source: source?.id ?? null, firstFrame: g.mode === 'frames' ? g.slotFirst : null, lastFrame: g.mode === 'frames' ? g.slotLast : null, references: g.mode === 'text' || g.mode === 'frames' ? [] : [...g.tray] },
    references: Object.fromEntries(Object.entries(g.references).filter(([name, id]) => ids.includes(id) && g.prompt.includes(`@${name}`))),
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
      ? `把「视频 ${source.name}」${marks.length ? `中 ${marksReading(marks)} 的 ` : '的 '}${g.prompt.trim()}`
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
