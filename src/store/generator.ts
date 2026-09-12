import { create } from 'zustand'
import { allocate, assign, remove, emptySlots, fallbackMode, modeAvailable, MODEL_CAPABILITIES,
  type MatGet, type Mode, type Model, type Slots, type Zone } from '../generator/materialLayout'
import { sourceError, taskPayload, type TaskPayload, type TimeRange } from '../generator/videoTask'
export interface Params { resolution: string; duration: number; ratio: string; sound: boolean }
interface Draft extends Slots {
  model: Model; prompt: string; params: Params; scope: 'whole' | 'segment'; range: TimeRange | null
  direction: 'before' | 'after' | null; sourceSrc: string | null; sourceId: string | null; references: Record<string, string>; notice: string
}
export interface TaskRecord { id: string; status: 'running' | 'complete'; createdAt: number; payload: TaskPayload }
/** pinned：用户手动选过 Tab。选过之后系统不再自动切走，除非当前 Tab 失效。 */
export interface GenState extends Draft { mode: Mode; conn: string[]; pinned: boolean; drafts: Partial<Record<Mode, Draft>>; tasks: TaskRecord[] }
const freshDraft = (): Draft => ({ ...emptySlots(), model: '2.5', prompt: '', params: { resolution: '720p', duration: 5, ratio: '16:9', sound: true }, scope: 'whole', range: null, direction: null, sourceSrc: null, sourceId: null, references: {}, notice: '' })
export const freshGen = (): GenState => ({ ...freshDraft(), mode: 'text', conn: [], pinned: false, drafts: {}, tasks: [] })
function draftOf(g: GenState): Draft {
  const { mode: _mode, conn: _conn, pinned: _pinned, drafts: _drafts, tasks: _tasks, ...draft } = g
  return draft
}
function sourceSync(d: Draft, get: MatGet): Draft {
  const mat = d.slotEdit ? get(d.slotEdit) : null
  const src = mat?.src ?? null
  if (src !== d.sourceSrc || d.slotEdit !== d.sourceId) return { ...d, sourceSrc: src, sourceId: d.slotEdit, range: null,
    notice: d.sourceSrc ? '源视频已更换，已清除时间范围，请重新检查作用范围。' : d.notice }
  // 用最宽松的区间判断，避免把仍然合法的选区误清掉
  if (d.range && (sourceError(mat?.dur, mat?.ready, 'extend') || d.range.end > Math.floor(mat?.dur ?? 0))) return { ...d, range: null }
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
      /**
       * Tab 落位三条规则：
       * 1. 当前 Tab 失效 → 必须切走（切到哪一眼看得见，失效原因挂在灰掉的 Tab 上悬浮说明，不再弹横幅）
       * 2. 用户还没手动选过 → 连入素材时落到「参考素材」（编辑和延长是强意图，只从视频节点入口进）
       * 3. 用户手动选过且仍有效 → 不动它
       */
      let mode = g.mode; const notice = g.notice; let pinned = g.pinned
      if (!modeAvailable(mode, conn, matGet)) {
        mode = fallbackMode(conn, matGet); pinned = false
      } else if (!pinned && mode === 'text' && conn.length) mode = 'ref'
      if (!conn.length) pinned = false
      const jumped = mode !== g.mode
      const added = conn.filter((mid) => !g.conn.includes(mid))
      const current = sourceSync({ ...draftOf(g), ...allocate(g, conn, mode, matGet, first || jumped, added) }, matGet)
      const drafts = { ...g.drafts }
      for (const key of Object.keys(drafts) as Mode[]) {
        const d = drafts[key]!
        drafts[key] = sourceSync({ ...d, ...allocate(d, conn, key, matGet, false, added) }, matGet)
      }
      return { ...g, ...current, notice, mode, pinned, conn, drafts }
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
      const next = saved ?? { ...freshDraft(), model: g.model, ...allocate(emptySlots(), g.conn, mode, matGet) }
      return { ...g, ...sourceSync(next, matGet), mode, pinned: true, drafts: { ...g.drafts, [g.mode]: draftOf(g) } }
    }),
    /** 模型只决定参数取值域。切换永远允许，落在集合外的旧值静默收敛到最近的合法值。 */
    setModel: (id, model) => edit(id, (g) => {
      const cap = MODEL_CAPABILITIES[model]
      const near = (list: number[], v: number) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0])
      return { ...g, model, params: { ...g.params,
        duration: cap.durations.includes(g.params.duration) ? g.params.duration : near(cap.durations, g.params.duration),
        resolution: cap.resolutions.includes(g.params.resolution) ? g.params.resolution : cap.resolutions[0],
        ratio: cap.ratios.includes(g.params.ratio) ? g.params.ratio : cap.ratios[0] } }
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
