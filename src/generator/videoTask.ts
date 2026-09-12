import type { GenState } from '../store/generator'
import { MODE_RULES, fmt, partition, mediaSecondsWarning, supportsRange, rangeBlockedReason, type MatGet, type Mode } from './materialLayout'
export interface TimeRange { start: number; end: number }
export const timecode = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 选区按整数秒，最短 1 秒 —— 文档里时间戳的单位就是 1 秒。4 秒是对源视频的要求，不是对选区的。 */
export const RANGE_MIN = 1
/** 源视频时长区间由模式决定：编辑 [4,30]，延长等非编辑任务 [2,30]。 */
export const sourceBounds = (mode: Mode): [number, number] => MODE_RULES[mode].sourceDuration ?? [2, 30]
export function sourceError(d?: number, ready = true, mode: Mode = 'edit'): string | null {
  const [lo, hi] = sourceBounds(mode)
  if (!ready || d == null || !Number.isFinite(d)) return '正在读取源视频时长，准备好后即可继续'
  if (d < lo) return `源视频不足 ${lo} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  if (d > hi) return `源视频超过 ${hi} 秒，${mode === 'edit' ? '编辑' : '延长'}任务需要 ${lo}–${hi} 秒的视频`
  return null
}
export function selectRange(t: number, duration: number, mode: Mode = 'edit'): TimeRange | null {
  if (sourceError(duration, true, mode)) return null
  const start = clamp(Math.floor(t), 0, Math.floor(duration) - RANGE_MIN)
  return { start, end: start + RANGE_MIN }
}
export function adjustRange(range: TimeRange, action: 'start' | 'end' | 'move', value: number, duration: number): TimeRange {
  const end = Math.floor(duration)
  if (action === 'start') return { ...range, start: clamp(Math.round(value), 0, range.end - RANGE_MIN) }
  if (action === 'end') return { ...range, end: clamp(Math.round(value), range.start + RANGE_MIN, end) }
  const start = clamp(range.start + Math.round(value), 0, end - (range.end - range.start))
  return { start, end: start + range.end - range.start }
}
/** 进入编辑 / 延长时给一个合理的默认选区，用户再拖。方向决定延长从哪头接。 */
export function defaultRange(duration: number, mode: Mode, direction: 'before' | 'after' | null): TimeRange | null {
  const d = Math.floor(duration)
  if (!Number.isFinite(d) || d < RANGE_MIN) return null
  if (mode === 'extend') return direction === 'before'
    ? { start: 0, end: Math.min(5, d) }
    : { start: Math.max(0, d - 5), end: d }
  const start = Math.floor(d * 0.25)
  return { start, end: Math.max(start + RANGE_MIN, Math.round(d * 0.5)) }
}
/** 「还没填」类提示：空槽位与占位符在界面上一眼可见，面板里不再重复，只用于禁用按钮与按钮悬停说明。 */
const TODO = {
  first: '请添加首帧', ref: '请添加参考素材', source: '请选择源视频', direction: '请选择向前或向后延长',
  range: '在时间轴上选取要作用的片段', badRange: '请重新选择有效的时间范围',
  promptEdit: '描述想要修改的内容', prompt: '请填写生成要求',
}
const TODO_SET = new Set<string>(Object.values(TODO))
export const isTodoError = (error: string | null) => !!error && TODO_SET.has(error)
/** 编辑 / 延长的提示词必须带触发词，否则模型会把任务判成别的类型。 */
export function keywordError(mode: Mode, prompt: string): string | null {
  const words = MODE_RULES[mode].keywords
  if (!words || words.some((w) => prompt.includes(w))) return null
  return mode === 'edit'
    ? '修改要求里需要出现「修改 / 替换 / 删除 / 增加」之类的词，模型靠它判断这是一个编辑任务'
    : '要求里需要出现「延长 / 续写 / 延续」之类的词，模型靠它判断这是一个延长任务'
}
export function taskError(g: GenState, get: MatGet): string | null {
  if (g.mode === 'frames' && !g.slotFirst) return TODO.first
  if (g.mode === 'ref' && !g.tray.length) return TODO.ref
  if (g.mode === 'edit' || g.mode === 'extend') {
    const m = g.slotEdit ? get(g.slotEdit) : null
    if (!m) return TODO.source
    if (m.error) return m.error
    const error = sourceError(m.dur, m.ready, g.mode)
    if (error) return error
    if (g.scope === 'segment') {
      if (!supportsRange(g.model)) return rangeBlockedReason(g.model)
      if (!g.range) return TODO.range
      if (g.range.start < 0 || g.range.end > Math.floor(m.dur!) || g.range.end - g.range.start < RANGE_MIN
        || !Number.isInteger(g.range.start) || !Number.isInteger(g.range.end)) return TODO.badRange
    }
    if (g.mode === 'extend' && !g.direction) return TODO.direction
  }
  const warn = mediaSecondsWarning(g, g.mode, g.model, get)
  if (warn) return warn
  const { active } = partition(g, g.mode, g.model, get)
  const invalid = Object.entries(g.references).find(([name, id]) => g.prompt.includes(`@${name}`) && !active.includes(id))
  if (invalid) return `引用 @${invalid[0]} 已不在本次素材中，请删除引用或重新添加素材`
  const text = g.prompt.replace(/@[A-Z]{4}\b/g, '').trim()
  if (!text) return g.mode === 'edit' ? TODO.promptEdit : TODO.prompt
  return keywordError(g.mode, text)
}
export function taskPayload(g: GenState, get: MatGet) {
  const error = taskError(g, get)
  if (error) throw new Error(error)
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
    params: { ...g.params,
      ratio: g.mode === 'edit' || g.mode === 'extend' || g.mode === 'frames' ? 'adaptive' : g.params.ratio,
      duration: g.mode === 'edit' ? source!.dur! : g.params.duration },
    output: g.mode === 'edit' ? `整条视频（时长与原片一致 ${fmt(source!.dur!)}）`
      : g.mode === 'extend' ? `新增片段 ${g.params.duration}s（不含原片，不自动拼接）` : '新视频',
    demo: true as const,
  }
}
export type TaskPayload = ReturnType<typeof taskPayload>
