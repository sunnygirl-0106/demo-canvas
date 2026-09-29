import { create } from 'zustand'
import { allocate, assign, countConn, emptySlots, fallbackMode, modeAfterModel, modeAvailable, MODEL_CAPABILITIES, MODELS, modeFits, refModeOf,
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
export interface GenState extends Draft { mode: Mode; conn: string[]; tasks: TaskRecord[] }
const freshDraft = (): Draft => ({ ...emptySlots(), model: 'sd2.5', prompt: '', params: { resolution: '720p', duration: 5, ratio: '16:9', sound: true }, doc: [], seeded: false, marks: [], direction: 'after', sourceSrc: null, sourceId: null, references: {} })
export const freshGen = (): GenState => ({ ...freshDraft(), mode: 'text', conn: [], tasks: [] })
function sourceSync(d: Draft, get: MatGet): Draft {
  const mat = d.slotEdit ? get(d.slotEdit) : null
  const src = mat?.src ?? null
  // 换源就清掉标记：标的是上一段画面上的东西，换了片子就没有意义了。
  // 句子里的标记 chip 当场消失、入口旁的计数回到「未标记」，这本身就是反馈，
  // 不再额外弹一条黄色横幅告诉用户刚刚发生了什么
  const drop = (x: Draft): Draft => { const doc = stripMarks(x.doc); return { ...x, doc, marks: marksOf(doc) } }
  if (src !== d.sourceSrc || d.slotEdit !== d.sourceId) return drop({ ...d, sourceSrc: src, sourceId: d.slotEdit })
  if (d.marks.length && (sourceError(mat?.dur, mat?.ready, d.model) || outOfSource(d.marks, Math.floor(mat?.dur ?? 0)))) return drop(d)
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
 * 落位：这一次连接变化之后，人该站在哪个 Tab、用哪个型号。
 *
 * 先在当前型号上找落点（当前模式容纳得下就不动它，否则 fallbackMode），
 * 再问这个落点收不收得下（单段时长 / 数量 / 合计）。两问都过就是它。
 *
 * 过不了就按模型清单次序找第一个「既容纳得下、又收得下」的型号换过去 ——
 * 一段 18 秒的视频摆在 Seedance 2.0 上，正确的下一步是换成收得下它的 2.5，
 * 而不是把人钉在 2.0 上让生成按钮报一个「可切换至 Seedance 2.5」让他自己点。
 * 数量与合计超额同理：凡是换个型号就接得住的，系统自己换。
 *
 * 一个都收不下时退而求其次，落在「至少容纳得下」的那个（backup）——
 * 低于 4 秒、单段超 30 秒、合计超 30 秒、图片超 30 张就属于这一类：
 * 换谁都接不住，素材照常摆着，由生成按钮说原因。
 *
 * 这条只由连线变化触发。用户自己点模型列表走的是 setModel：收不下的型号照旧可选、
 * 不置灰，切过去由生成按钮拦 —— 否则他永远点不进 Seedance 2.0。
 */
function landingOn(g: Pick<GenState, 'mode' | 'model' | 'slotEdit'>, conn: string[], get: MatGet, model: Model, fresh: boolean): Mode | null {
  return model === g.model && modeAvailable(g.mode, conn, get, model, g.slotEdit)
    ? g.mode : fallbackMode(conn, get, model, fresh)
}
function land(g: Pick<GenState, 'mode' | 'model' | 'slotEdit'>, conn: string[], get: MatGet, fresh: boolean): { mode: Mode; model: Model } {
  let backup: { mode: Mode; model: Model } | null = null
  const here = landingOn(g, conn, get, g.model, fresh)
  if (here) {
    if (modeFits(here, conn, get, g.model)) return { mode: here, model: g.model }
    backup = { mode: here, model: g.model }
  }
  // 模型清单的次序就是优先次序：Seedance 2.5 排在最前，能力最全，换过去最不容易再撞一次墙
  for (const model of MODELS) {
    if (model === g.model) continue
    const there = landingOn(g, conn, get, model, fresh)
    if (!there) continue
    if (modeFits(there, conn, get, model)) return { mode: there, model }
    backup ??= { mode: there, model }
  }
  return backup ?? { mode: g.mode, model: g.model }
}
/**
 * 编辑 / 延长本身容得下多段视频（第一段作源视频，其余进参考区），
 * 但「在它上面再接一段视频」这个动作说明用户要的已经不是改这一段，而是让几段互相参考 ——
 * 所以默认落位转去这个型号的参考 Tab。不区分当前模式是用户选的还是系统落的：
 * 这是一条落位规则，不是「容纳不下」，两个入口照旧不灰，手动切回来仍然进得去。
 */
function leaveSource(g: GenState, conn: string[], added: string[], get: MatGet): GenState {
  if (g.mode !== 'edit' && g.mode !== 'extend') return g
  if (!added.some((id) => get(id)?.kind === 'video')) return g
  if (countConn(conn, get).video < 2) return g
  const ref = refModeOf(g.model)
  return ref ? { ...g, mode: ref } : g
}
function switchMode(g: GenState, mode: Mode, get: MatGet): GenState {
  if (mode === g.mode) return g
  return { ...g, ...sourceSync({ ...g, ...allocate(g, g.conn, mode, get) }, get), mode }
}
interface GenStore {
  map: Record<string, GenState>; get1: (id: string) => GenState
  syncConn: (id: string, conn: string[], get: MatGet) => void
  syncSources: (id: string, get: MatGet) => void
  setMode: (id: string, mode: Mode, get: MatGet) => void
  setModel: (id: string, model: Model, get: MatGet) => void
  applyDrop: (id: string, matId: string, zone: Zone, idx: number | null, get: MatGet) => void
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
      const added = conn.filter((mid) => !g.conn.includes(mid))
      // 先让「再接一段视频」把人从编辑 / 延长带去参考，再走落位与模型自动求解（都在 land 里）
      const base = leaveSource(g, conn, added, matGet)
      const { mode, model } = land(base, conn, matGet, !g.conn.length)
      const jumped = mode !== g.mode
      // 换了型号，参数取值域跟着换：落在集合外的静默收敛到最近的合法值，和 setModel 同一条
      const params = model === g.model ? g.params : fitParams(model, g.params)
      const current = sourceSync({ ...g, model, ...allocate(g, conn, mode, matGet, jumped ? conn : added) }, matGet)
      return { ...g, ...current, mode, model, params, conn }
    }),
    syncSources: (id, matGet) => edit(id, (g) => {
      const next = sourceSync(g, matGet)
      const g2 = next === g ? g : { ...g, ...next }
      /**
       * 媒体是异步读出来的，读到的那一刻才知道这份素材到底是什么。
       * 读出来的东西让当前模式容纳不下了（比如根本不是一段视频），就按同一条规则重新落位；
       * 时长不合规不在此列 —— 3 秒的视频仍然是一段视频，它进得去，只是生成不了。
       */
      const landed = land(g2, g2.conn, matGet, false)
      if (landed.mode === g2.mode && landed.model === g2.model) return g2
      const moved = switchMode(g2, landed.mode, matGet)
      return landed.model === g2.model ? moved
        : { ...moved, model: landed.model, params: fitParams(landed.model, moved.params) }
    }),
    setMode: (id, mode, matGet) => edit(id, (g) => switchMode(g, mode, matGet)),
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
      const moved = switchMode(g, landing, matGet)
      return { ...moved, model, params: fitParams(model, moved.params) }
    }),
    applyDrop: (id, matId, zone, _idx, matGet) => edit(id, (g) => {
      if (!g.conn.includes(matId)) return g
      const next = assign(g, matId, zone, matGet)
      return next ? { ...g, ...sourceSync({ ...g, ...next }, matGet) } : g
    }),
    swapFrames: (id) => edit(id, (g) => g.slotFirst && g.slotLast ? { ...g, slotFirst: g.slotLast, slotLast: g.slotFirst } : g),
    patch: (id, patch) => edit(id, (g) => ({ ...g, ...patch })),
    submit: (id, matGet) => {
      const g = get().get1(id)
      if (g.tasks.some((t) => t.status === 'running')) throw new Error('正在生成')
      const payload = taskPayload(g, matGet)
      const taskId = crypto.randomUUID()
      edit(id, (state) => ({ ...state, tasks: [...state.tasks, { id: taskId, status: 'running', createdAt: Date.now(), payload }] }))
      return taskId
    },
    complete: (id, taskId) => { if (get().map[id]) edit(id, (g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'complete' } : t) })) },
    reset: () => set({ map: {} }),
  }
})
