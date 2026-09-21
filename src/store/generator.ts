import { create } from 'zustand'
import { allocate, assign, remove, emptySlots, fallbackMode, isRef, matBlockedReason, modeAfterModel, modeAvailable, modelForSource, refModeOf, MODEL_CAPABILITIES,
  type MatGet, type Mode, type Model, type Slots, type Zone } from '../generator/materialLayout'
import { outOfSource, type MarkGroup } from '../generator/marks'
import { marksOf, stripMarks, type Seg } from '../generator/promptDoc'
import { sourceError, taskPayload, type TaskPayload } from '../generator/videoTask'
export interface Params { resolution: string; duration: number; ratio: string; sound: boolean }
interface Draft extends Slots {
  model: Model; prompt: string; params: Params
  /**
   * 提示词框里的那一句：文字段和标签排成一份可编辑的文档，标记标签就长在里面。
   * prompt 是它念出来的样子（任务记录存这一份），marks 是它里面还留着的那几处标记 ——
   * 两者都由 doc 推出来，句子里删掉一枚标签，这次任务里也就没有它了。
   */
  doc: Seg[]
  /** 已经替用户起过头了。删光了不会再自动送回来 —— 那是开头，不是模板。 */
  seeded: boolean
  /** 标记组取代了原来的 scope + range：作用范围由每一组自己带着，整体范围推得出来 */
  marks: MarkGroup[]
  direction: 'before' | 'after' | null; sourceSrc: string | null; sourceId: string | null; references: Record<string, string>
}
export interface TaskRecord { id: string; status: 'running' | 'complete'; createdAt: number; payload: TaskPayload }
/** pinned：用户手动选过 Tab。选过之后系统不再自动切走，除非当前 Tab 失效。 */
export interface GenState extends Draft { mode: Mode; conn: string[]; pinned: boolean; tasks: TaskRecord[] }
const freshDraft = (): Draft => ({ ...emptySlots(), model: 'sd2.5', prompt: '', params: { resolution: '720p', duration: 5, ratio: '16:9', sound: true }, doc: [], seeded: false, marks: [], direction: 'after', sourceSrc: null, sourceId: null, references: {} })
export const freshGen = (): GenState => ({ ...freshDraft(), mode: 'text', conn: [], pinned: false, tasks: [] })
function sourceSync(d: Draft, get: MatGet): Draft {
  const mat = d.slotEdit ? get(d.slotEdit) : null
  const src = mat?.src ?? null
  // 换源就清掉标记：标的是上一段画面上的东西，换了片子就没有意义了。
  // 句子里的标记 chip 当场消失、入口旁的计数回到「未标记」，这本身就是反馈，
  // 不再额外弹一条黄色横幅告诉用户刚刚发生了什么
  const drop = (x: Draft): Draft => { const doc = stripMarks(x.doc); return { ...x, doc, marks: marksOf(doc) } }
  if (src !== d.sourceSrc || d.slotEdit !== d.sourceId) return drop({ ...d, sourceSrc: src, sourceId: d.slotEdit })
  // 用最宽松的区间判断，避免把仍然合法的标记误清掉
  if (d.marks.length && (sourceError(mat?.dur, mat?.ready, 'extend', d.model) || outOfSource(d.marks, Math.floor(mat?.dur ?? 0)))) return drop(d)
  return d
}
/** 参数落在模型集合外时静默收敛到最近的合法值，而不是置灰。 */
function fitParams(model: Model, params: Params): Params {
  const cap = MODEL_CAPABILITIES[model]
  const near = (list: number[], v: number) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0])
  return { ...params,
    duration: cap.durations.includes(params.duration) ? params.duration : near(cap.durations, params.duration),
    resolution: cap.resolutions.includes(params.resolution) ? params.resolution : cap.resolutions[0],
    ratio: cap.ratios.includes(params.ratio) ? params.ratio : cap.ratios[0] }
}
/**
 * 换模式：句子 / 模型 / 参数 / 方向是用户写的东西，切 Tab 不该丢，原样留着；
 * 素材槽位不是他写的，是按模式算出来的，所以按新模式重新落位再跑一遍源同步。
 */
function switchMode(g: GenState, mode: Mode, get: MatGet, pinned: boolean): GenState {
  if (mode === g.mode) return g
  return { ...g, ...sourceSync({ ...g, ...allocate(emptySlots(), g.conn, mode, get) }, get), mode, pinned }
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
       * 2. 用户还没手动选过 → 连入素材时落到这个型号的参考 Tab（编辑和延长是强意图，只从视频节点入口进）
       * 3. 用户手动选过且仍有效 → 不动它
       */
      let mode = g.mode; let pinned = g.pinned
      const added = conn.filter((mid) => !g.conn.includes(mid))
      /**
       * 新连进来的素材在当前 Tab 用不上（编辑要 4 秒起，这段只有 2 秒）：
       * 直接带他去参考 —— 那里收得下，用户接着就能用它。
       * 不把一段灰缩略图塞在编辑面板上等他自己发现。
       */
      const strayAdded = !isRef(mode) && added.some((mid) => {
        const m = matGet(mid)
        return !!m && !!matBlockedReason(m, mode, g.model)
      })
      // 去哪个参考 Tab 由型号说了算（全能参考 / 参考图二选一）；只做文生视频的型号一个都没有，跳过这两条规则
      const refMode = refModeOf(g.model)
      if (!modeAvailable(mode, conn, matGet, g.model, g.slotEdit)) {
        mode = fallbackMode(conn, matGet, g.model); pinned = false
      } else if (strayAdded && refMode && modeAvailable(refMode, conn, matGet, g.model)) {
        mode = refMode; pinned = false
      } else if (!pinned && mode === 'text' && conn.length && refMode) mode = refMode
      if (!conn.length) pinned = false
      const jumped = mode !== g.mode
      const current = sourceSync({ ...g, ...allocate(g, conn, mode, matGet, first || jumped, added) }, matGet)
      return { ...g, ...current, mode, pinned, conn }
    }),
    syncSources: (id, matGet) => edit(id, (g) => {
      const current = sourceSync(g, matGet)
      const next: GenState = current === g ? g : { ...g, ...current }
      /**
       * 视频时长是异步读出来的，读到的那一刻规则才算数：
       * 先把型号收敛到接得住这段源视频的那个，实在没有就切走 Tab —— 都在用户做选择之前完成，
       * 不留一个「亮着的 Tab + 灰掉的生成按钮」让他自己猜。
       */
      const model = modelForSource(next.mode, next.conn, matGet, next.slotEdit, next.model)
      const fitted: GenState = model === next.model ? next : { ...next, model, params: fitParams(model, next.params) }
      return modeAvailable(fitted.mode, fitted.conn, matGet, fitted.model, fitted.slotEdit) ? fitted
        : switchMode(fitted, fallbackMode(fitted.conn, matGet, fitted.model), matGet, false)
    }),
    setMode: (id, mode, matGet) => edit(id, (g) => switchMode(g, mode, matGet, true)),
    /**
     * 模型决定参数取值域与支不支持当前模式。切换永远允许：
     * 落在集合外的参数静默收敛到最近的合法值，新模型没有的模式落回可用的 Tab。
     */
    setModel: (id, model, matGet) => edit(id, (g) => {
      // 「改这一段 / 从这一段接」是用户的意图，不因为新模型不认秒数就悄悄扩大成整条：
      // 不响应秒数的模型在模型列表里本来就是灰的（modelBlockedReason），
      // 真要放大范围有「改为整条，解除模型限制」这个明确的出口。
      const next: GenState = { ...g, model, params: fitParams(model, g.params) }
      // 落在哪个 Tab 和模型列表上那句悬浮说明共用一条（modeAfterModel）：
      // 能不能留下看的是完整的一条规则（能力 + 素材 + 时长），不只是 genModes
      const landing = modeAfterModel(g.mode, g.conn, matGet, model, g.slotEdit)
      if (landing === g.mode) return next
      // 停在一个灰掉的 Tab 上会让生成按钮报一个用户改不动的错，所以这里直接换走。
      // 素材按新 Tab 重新落位，句子 / 参数跟着人走，最后才把新型号盖上去。
      const moved = switchMode(g, landing, matGet, false)
      return { ...moved, model, params: fitParams(model, moved.params) }
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
      if (g.tasks.some((t) => t.status === 'running')) throw new Error('演示任务正在生成')
      const payload = taskPayload(g, matGet)
      const taskId = crypto.randomUUID()
      edit(id, (state) => ({ ...state, tasks: [...state.tasks, { id: taskId, status: 'running', createdAt: Date.now(), payload }] }))
      return taskId
    },
    complete: (id, taskId) => { if (get().map[id]) edit(id, (g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'complete' } : t) })) },
    reset: () => set({ map: {} }),
  }
})
