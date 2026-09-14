import type { GenState } from '../store/generator'
import { MODEL_CAPABILITIES, fmt, partition, mediaSecondsWarning, supportsRange, rangeBlockedReason, locksRatio, countConn, modelUnusableReason, TAB_REQUIREMENT, type MatGet, type Mode, type Model, TABS } from './materialLayout'
export interface TimeRange { start: number; end: number }
export const timecode = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 延长的选区会作为输入送进模型，受输入视频 2 秒下限约束；编辑的选区只是写进提示词的时间戳，单位 1 秒。 */
export const rangeMin = (mode: Mode) => mode === 'extend' ? 2 : 1
/** 源视频时长区间：编辑的下限由模型决定，其余任务一律 2 秒。 */
export const sourceBounds = (mode: Mode, model: Model): [number, number] =>
  [mode === 'edit' ? MODEL_CAPABILITIES[model].editSourceMin : 2, 30]
export function sourceError(d?: number, ready = true, mode: Mode = 'edit', model: Model = 'sd2.5'): string | null {
  const [lo, hi] = sourceBounds(mode, model)
  if (!ready || d == null || !Number.isFinite(d)) return '正在读取源视频时长，准备好后即可继续'
  if (d < lo) return `源视频不足 ${lo} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  if (d > hi) return `源视频超过 ${hi} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  return null
}
export function selectRange(t: number, duration: number, mode: Mode = 'edit'): TimeRange | null {
  if (sourceError(duration, true, mode)) return null
  const min = rangeMin(mode)
  const start = clamp(Math.floor(t), 0, Math.floor(duration) - min)
  return { start, end: start + min }
}
export function adjustRange(range: TimeRange, action: 'start' | 'end' | 'move', value: number, duration: number, mode: Mode = 'edit'): TimeRange {
  const end = Math.floor(duration); const min = rangeMin(mode)
  if (action === 'start') return { ...range, start: clamp(Math.round(value), 0, range.end - min) }
  if (action === 'end') return { ...range, end: clamp(Math.round(value), range.start + min, end) }
  const start = clamp(range.start + Math.round(value), 0, end - (range.end - range.start))
  return { start, end: start + range.end - range.start }
}
/** 进入编辑 / 延长时给一个合理的默认选区，用户再拖。方向决定延长从哪头接。 */
export function defaultRange(duration: number, mode: Mode, direction: 'before' | 'after' | null): TimeRange | null {
  const d = Math.floor(duration)
  if (!Number.isFinite(d) || d < rangeMin(mode)) return null
  if (mode === 'extend') return direction === 'before'
    ? { start: 0, end: Math.min(5, d) }
    : { start: Math.max(0, d - 5), end: d }
  const start = Math.floor(d * 0.25)
  return { start, end: Math.max(start + rangeMin(mode), Math.round(d * 0.5)) }
}
/** 「还没填」类提示：空槽位与占位符在界面上一眼可见，面板里不再重复，只用于禁用按钮与按钮悬停说明。 */
const TODO = {
  first: '请添加首帧', ref: '请添加参考素材', source: '请选择源视频', direction: '请选择向前或向后延长',
  range: '在时间轴上选取要作用的片段', badRange: '请重新选择有效的时间范围',
  promptEdit: '描述想要修改的内容', prompt: '请填写生成要求',
}
const TODO_SET = new Set<string>(Object.values(TODO))
export const isTodoError = (error: string | null) => !!error && TODO_SET.has(error)
/**
 * 参考素材也要能读、时长合规。这条以前只在编辑 / 延长里查，
 * 参考模式漏过了 1 秒的视频和标了「无法读取」的文件，要到上游才报错。
 */
function referenceError(g: GenState, active: string[], get: MatGet): string | null {
  const source = g.mode === 'edit' || g.mode === 'extend' ? g.slotEdit : null
  for (const id of active) {
    if (id === source) continue // 主视频有自己的区间要求，已经单独查过
    const m = get(id); if (!m) continue
    if (m.error) return `${m.name}：${m.error}`
    if (m.kind !== 'video') continue
    if (m.ready === false || m.dur == null || !Number.isFinite(m.dur)) return `正在读取参考视频 ${m.name} 的时长，准备好后即可继续`
    const [lo, hi] = sourceBounds('ref', g.model)
    if (m.dur < lo || m.dur > hi) return `参考视频 ${m.name} 为 ${fmt(m.dur)}，须为 ${lo}–${hi} 秒`
  }
  return null
}
export function taskError(g: GenState, get: MatGet): string | null {
  // 模型没有这个能力时，生成和 Tab 给同一句话
  const cap = MODEL_CAPABILITIES[g.model]
  if (!cap.genModes.includes(g.mode)) return `${cap.label} 不支持${TABS.find((t) => t.k === g.mode)!.label}`
  // 素材规则也和 Tab 置灰共用同一份判断：否则会出现「五个模式全部置灰、生成却还能提交」
  const unusable = TAB_REQUIREMENT[g.mode](countConn(g.conn, get))
  if (unusable) return unusable
  const { active } = partition(g, g.mode, g.model, get)
  if (g.mode === 'frames' && !g.slotFirst) return TODO.first
  // 用有效输入判断，不用连线数：配额为 0 的素材连着也不算数
  if (g.mode === 'ref' && !active.length) return TODO.ref
  if (g.mode === 'edit' || g.mode === 'extend') {
    const m = g.slotEdit ? get(g.slotEdit) : null
    if (!m) return TODO.source
    if (m.error) return m.error
    const error = sourceError(m.dur, m.ready, g.mode, g.model)
    if (error) return error
    if (g.scope === 'segment') {
      if (!supportsRange(g.model)) return rangeBlockedReason(g.model)
      if (!g.range) return TODO.range
      if (g.range.start < 0 || g.range.end > Math.floor(m.dur!) || g.range.end - g.range.start < rangeMin(g.mode)
        || !Number.isInteger(g.range.start) || !Number.isInteger(g.range.end)) return TODO.badRange
    }
    if (g.mode === 'extend' && !g.direction) return TODO.direction
  }
  const badRef = referenceError(g, active, get)
  if (badRef) return badRef
  const warn = mediaSecondsWarning(g, get)
  if (warn) return warn
  const invalid = Object.entries(g.references).find(([name, id]) => g.prompt.includes(`@${name}`) && !active.includes(id))
  if (invalid) return `引用 @${invalid[0]} 已不在本次素材中，请删除引用或重新添加素材`
  const text = g.prompt.replace(/@[A-Z]{4}\b/g, '').trim()
  if (!text) return g.mode === 'edit' ? TODO.promptEdit : TODO.prompt
  return null
}
/**
 * 换这个型号会让当前这件事做不成的所有原因，模型列表按它置灰 —— 三条规则一个入口。
 * 顺序按「说得多具体」排：先说它做不了你正在做的事，再说它接不住你已经选好的范围，
 * 最后才是「它在当前连接下一个模式都进不去」这种最泛的情况。
 * 理由里不带型号名：它就写在模型列表的同一行上。
 */
export function modelBlockedReason(g: GenState, model: Model, get: MatGet): string {
  return modeBlocksModel(g, model) || rangeBlocksModel(g, model) || modelUnusableReason(g.conn, get, model)
}
/**
 * 正在做的事它做不了。和 Tab 置灰、生成校验共用同一句判断：
 * Tab 会因为型号灰掉，型号也该因为 Tab 灰掉，两边不能只拦一头。
 */
function modeBlocksModel(g: GenState, model: Model): string {
  if (MODEL_CAPABILITIES[model].genModes.includes(g.mode)) return ''
  return `不支持${TABS.find((t) => t.k === g.mode)!.label}，先切到别的模式再选`
}
/**
 * 切到不响应秒数的模型会让用户拖出来的范围失效，所以拦住它，并给出解除办法。
 * 换源后范围被清空、等待重选时同样算局部意图 —— 不能因为范围暂时为空就放行，
 * 那会让任务在用户没察觉的情况下从「改这一段」扩大成「改整条」。
 */
export function rangeBlocksModel(g: GenState, model: Model): string {
  if (!(g.mode === 'edit' || g.mode === 'extend')) return ''
  if (g.scope !== 'segment' || supportsRange(model)) return ''
  return g.range
    ? `不响应秒数，当前指定了 ${timecode(g.range.start)}–${timecode(g.range.end)} 的范围`
    : `不响应秒数，当前是${g.mode === 'edit' ? '「改这一段」' : '「从这一段接」'}、等待重新选取范围`
}
/** 改延长方向只改衔接的那一头；已经选好的参考段保持不变，没选过才给一个默认段。 */
export function rangeOnDirection(g: { scope: 'whole' | 'segment'; range: TimeRange | null }, duration: number, direction: 'before' | 'after'): TimeRange | null {
  if (g.scope !== 'segment') return g.range
  return g.range ?? defaultRange(duration, 'extend', direction)
}
export function taskPayload(g: GenState, get: MatGet) {
  const error = taskError(g, get)
  if (error) throw new Error(error)
  const cap = MODEL_CAPABILITIES[g.model]
  const { active: ids, skipped } = partition(g, g.mode, g.model, get)
  const source = (g.mode === 'edit' || g.mode === 'extend') && g.slotEdit ? get(g.slotEdit) : null
  const ranged = (g.mode === 'edit' || g.mode === 'extend') && g.scope === 'segment' && !!g.range
  return {
    mode: g.mode, model: g.model, prompt: g.prompt.trim(), inputIds: ids,
    inputs: ids.map((id) => { const m = get(id)!; return { id, name: m.name, kind: m.kind, src: m.src, duration: m.dur } }),
    skipped,
    scope: g.mode === 'edit' || g.mode === 'extend' ? g.scope : null,
    roles: { source: source?.id ?? null, firstFrame: g.mode === 'frames' ? g.slotFirst : null, lastFrame: g.mode === 'frames' ? g.slotLast : null, references: g.mode === 'text' || g.mode === 'frames' ? [] : [...g.tray] },
    references: Object.fromEntries(Object.entries(g.references).filter(([name, id]) => ids.includes(id) && g.prompt.includes(`@${name}`))),
    sourceId: source?.id ?? null, sourceSrc: source?.src ?? null, sourceDuration: source?.dur ?? null,
    range: ranged ? { ...g.range! } : null,
    /** 编辑的选区是作用域（产出里有它），延长的选区是锚点（产出里一帧都没有） */
    rangeMeaning: ranged ? (g.mode === 'edit' ? '作用域' : '锚点') : null,
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
