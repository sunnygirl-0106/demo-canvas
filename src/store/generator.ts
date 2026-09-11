import { create } from 'zustand'
import { allocate, assign, remove, emptySlots, supportsMode, MODEL_CAPABILITIES, type MatGet, type Mode, type Model, type Slots, type Zone } from '../generator/materialLayout'
import { sourceError, taskPayload, type TaskPayload, type TimeRange } from '../generator/videoTask'
export interface Params { resolution: string; duration: number; ratio: string; sound: boolean }
interface Draft extends Slots {
  model: Model; prompt: string; params: Params; scope: 'whole' | 'segment'; range: TimeRange | null
  direction: 'before' | 'after' | null; sourceSrc: string | null; sourceId: string | null; references: Record<string, string>; notice: string
}
export interface TaskRecord { id: string; status: 'running' | 'complete'; createdAt: number; payload: TaskPayload }
export interface GenState extends Draft { mode: Mode; conn: string[]; drafts: Partial<Record<Mode, Draft>>; tasks: TaskRecord[] }
const freshDraft = (): Draft => ({ ...emptySlots(), model: '2.5', prompt: '', params: { resolution: '720p', duration: 5, ratio: '16:9', sound: true }, scope: 'whole', range: null, direction: null, sourceSrc: null, sourceId: null, references: {}, notice: '' })
export const freshGen = (): GenState => ({ ...freshDraft(), mode: 'text', conn: [], drafts: {}, tasks: [] })
function draftOf(g: GenState): Draft {
  const { mode: _mode, conn: _conn, drafts: _drafts, tasks: _tasks, ...draft } = g
  return draft
}
function sourceSync(d: Draft, get: MatGet): Draft {
  const mat = d.slotEdit ? get(d.slotEdit) : null
  const src = mat?.src ?? null
  if (src !== d.sourceSrc || d.slotEdit !== d.sourceId) return { ...d, sourceSrc: src, sourceId: d.slotEdit, range: null,
    notice: d.sourceSrc ? '源视频已更换，已清除时间范围，请重新检查修改要求的适用范围。' : d.notice }
  if (d.range && (sourceError(mat?.dur, mat?.ready) || d.range.end > Math.floor(mat?.dur ?? 0))) return { ...d, range: null }
  return d
}
interface GenStore {
  map: Record<string, GenState>; get1: (id: string) => GenState
  syncConn: (id: string, conn: string[], get: MatGet) => void
  syncSources: (id: string, get: MatGet) => void
  setMode: (id: string, mode: Mode, get: MatGet) => void
  setModel: (id: string, model: Model, get: MatGet) => void
  applyDrop: (id: string, matId: string, zone: Zone, idx: number | null, get: MatGet) => void
  removeMaterial: (id: string, matId: string, get: MatGet) => void
  swapFrames: (id: string) => void
  patch: (id: string, patch: Partial<Draft>) => void
  submit: (id: string, get: MatGet) => string
  complete: (id: string, taskId: string) => void
  reset: () => void
}
export const useGenerator = create<GenStore>((set, get) => {
  const edit = (id: string, fn: (g: GenState) => GenState) => set((s) => {
    const prev = s.map[id] ?? freshGen(); const next = fn(prev)
    return next === prev ? s : { map: { ...s.map, [id]: next } }
  })
  return {
    map: {}, get1: (id) => get().map[id] ?? freshGen(),
    syncConn: (id, conn, matGet) => edit(id, (g) => {
      const first = !get().map[id]
      const auto = (first || (g.mode === 'text' && !g.conn.length && !g.prompt && !Object.keys(g.drafts).length)) && conn.length > 0
      const mode = auto ? conn.some((mid) => matGet(mid)?.kind === 'video') ? 'edit' : 'ref' : g.mode
      const added = conn.filter((mid) => !g.conn.includes(mid))
      const current = sourceSync({ ...draftOf(g), ...allocate(g, conn, mode, matGet, first || auto, added) }, matGet)
      const drafts = { ...g.drafts }
      for (const key of Object.keys(drafts) as Mode[]) {
        const d = drafts[key]!
        drafts[key] = sourceSync({ ...d, ...allocate(d, conn, key, matGet, false, added) }, matGet)
      }
      return { ...g, ...current, mode, conn, drafts }
    }),
    syncSources: (id, matGet) => edit(id, (g) => {
      const current = sourceSync(g, matGet)
      const drafts = { ...g.drafts }; let changed = current !== g
      for (const key of Object.keys(drafts) as Mode[]) {
        const old = drafts[key]!; drafts[key] = sourceSync(old, matGet); changed ||= old !== drafts[key]
      }
      return changed ? { ...g, ...current, drafts } : g
    }),
    setMode: (id, mode, matGet) => edit(id, (g) => {
      if (mode === g.mode) return g
      const saved = g.drafts[mode]
      const next = saved ?? { ...freshDraft(), model: supportsMode(mode, g.model) ? g.model : '2.5', ...allocate(emptySlots(), g.conn, mode, matGet) }
      return { ...g, ...sourceSync(next, matGet), mode, drafts: { ...g.drafts, [g.mode]: draftOf(g) } }
    }),
    setModel: (id, model) => edit(id, (g) => {
      if (!supportsMode(g.mode, model)) return g
      const cap = MODEL_CAPABILITIES[model]
      return { ...g, model, params: { ...g.params, duration: cap.durations.includes(g.params.duration) ? g.params.duration : cap.durations[0], resolution: cap.resolutions.includes(g.params.resolution) ? g.params.resolution : cap.resolutions[0], ratio: cap.ratios.includes(g.params.ratio) ? g.params.ratio : cap.ratios[0] } }
    }),
    applyDrop: (id, matId, zone, _idx, matGet) => edit(id, (g) => {
      if (!g.conn.includes(matId)) return g
      const next = assign(g, matId, zone, matGet)
      return next ? { ...g, ...sourceSync({ ...g, ...next }, matGet) } : g
    }),
    removeMaterial: (id, matId, matGet) => edit(id, (g) => ({ ...g, ...sourceSync({ ...g, ...remove(g, matId) }, matGet) })),
    swapFrames: (id) => edit(id, (g) => g.slotFirst && g.slotLast ? { ...g, slotFirst: g.slotLast, slotLast: g.slotFirst } : g),
    patch: (id, patch) => edit(id, (g) => ({ ...g, ...patch })),
    submit: (id, matGet) => {
      const g = get().get1(id)
      if (g.tasks.some((t) => t.status === 'running')) throw new Error('演示任务正在处理中')
      const payload = taskPayload(g, matGet)
      const taskId = crypto.randomUUID()
      edit(id, (state) => ({ ...state, tasks: [...state.tasks, { id: taskId, status: 'running', createdAt: Date.now(), payload }] }))
      return taskId
    },
    complete: (id, taskId) => { if (get().map[id]) edit(id, (g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'complete' } : t) })) },
    reset: () => set({ map: {} }),
  }
})
