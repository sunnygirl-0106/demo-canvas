import type { GenState } from '../store/generator'
import { activeIds, supportsMode, type MatGet } from './materialLayout'
export interface TimeRange { start: number; end: number }
export const timecode = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export function sourceError(d?: number, ready = true): string | null {
  if (!ready || d == null || !Number.isFinite(d)) return '正在读取源视频时长，准备好后即可继续'
  if (d < 4) return '源视频不足 4 秒，请选择 4–30 秒的视频'
  if (d > 30) return '源视频超过 30 秒，本轮演示支持 4–30 秒的视频'
  return null
}
export function selectRange(t: number, duration: number): TimeRange | null {
  if (sourceError(duration)) return null
  const start = clamp(Math.floor(t), 0, Math.floor(duration) - 4)
  return { start, end: start + 4 }
}
export function adjustRange(range: TimeRange, action: 'start' | 'end' | 'move', value: number, duration: number): TimeRange {
  const end = Math.floor(duration)
  if (action === 'start') return { ...range, start: clamp(Math.round(value), 0, range.end - 4) }
  if (action === 'end') return { ...range, end: clamp(Math.round(value), range.start + 4, end) }
  const start = clamp(range.start + Math.round(value), 0, end - (range.end - range.start))
  return { start, end: start + range.end - range.start }
}
export function taskError(g: GenState, get: MatGet): string | null {
  if (!supportsMode(g.mode, g.model)) return '当前模型不支持此操作，请退出操作后切换模型'
  if (g.mode === 'frames' && !g.slotFirst) return '请添加首帧'
  if (g.mode === 'ref' && !g.tray.length) return '请添加参考素材'
  if (g.mode === 'edit' || g.mode === 'extend') {
    const m = g.slotEdit ? get(g.slotEdit) : null
    if (!m) return '请选择源视频'
    if (m.error) return m.error
    const error = sourceError(m.dur, m.ready)
    if (error) return error
    if (g.mode === 'edit' && g.scope === 'segment') {
      if (!g.range) return '点击时间轴选取至少 4 秒的片段'
      if (g.range.start < 0 || g.range.end > Math.floor(m.dur!) || g.range.end - g.range.start < 4 || !Number.isInteger(g.range.start) || !Number.isInteger(g.range.end)) return '请重新选择有效的时间范围'
    }
    if (g.mode === 'extend' && !g.direction) return '请选择向前或向后延长'
  }
  const ids = activeIds(g, g.mode)
  const invalid = Object.entries(g.references).find(([name, id]) => g.prompt.includes(`@${name}`) && !ids.includes(id))
  if (invalid) return `引用 @${invalid[0]} 已不在本次素材中，请删除引用或重新添加素材`
  const text = g.prompt.replace(/@[A-Z]{4}\b/g, '').trim()
  if (!text) return g.mode === 'edit' ? '描述想要修改的内容' : '请填写生成要求'
  return null
}
export function taskPayload(g: GenState, get: MatGet) {
  const error = taskError(g, get)
  if (error) throw new Error(error)
  const ids = activeIds(g, g.mode)
  const source = (g.mode === 'edit' || g.mode === 'extend') && g.slotEdit ? get(g.slotEdit) : null
  const segment = g.mode === 'edit' && g.scope === 'segment'
  return {
    mode: g.mode, model: g.model, prompt: g.prompt.trim(), inputIds: ids,
    inputs: ids.map((id) => { const m = get(id)!; return { id, name: m.name, kind: m.kind, src: m.src, duration: m.dur } }),
    scope: g.mode === 'edit' ? g.scope : null,
    roles: { source: source?.id ?? null, firstFrame: g.mode === 'frames' ? g.slotFirst : null, lastFrame: g.mode === 'frames' ? g.slotLast : null, references: g.mode === 'text' || g.mode === 'frames' ? [] : [...g.tray] },
    references: Object.fromEntries(Object.entries(g.references).filter(([name, id]) => ids.includes(id) && g.prompt.includes(`@${name}`))),
    sourceId: source?.id ?? null, sourceSrc: source?.src ?? null, sourceDuration: source?.dur ?? null,
    range: segment && g.range ? { ...g.range } : null,
    direction: g.mode === 'extend' ? g.direction : null,
    params: { ...g.params, ratio: g.mode === 'edit' || g.mode === 'extend' || (g.mode === 'frames' && g.model === '2.5') ? 'adaptive' : g.params.ratio,
      duration: g.mode === 'edit' ? (segment ? g.range!.end - g.range!.start : source!.dur!) : g.params.duration },
    output: g.mode === 'edit' ? segment ? '独立片段' : '整条视频' : g.mode === 'extend' ? '新增片段（不自动拼接）' : '新视频',
    demo: true as const,
  }
}
export type TaskPayload = ReturnType<typeof taskPayload>
