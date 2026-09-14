/** 当前任务的素材角色。隐藏资产仅保留连接，不进入有效输入。 */
export type Mode = 'text' | 'frames' | 'ref' | 'edit' | 'extend'
export type Model = 'sd2.5' | 'sd2.0' | 'sd2.0-1080p' | 'sd2.0-4k' | 'sd2.0-fast' | 'sd2.0-mini'
  | 'sd1.5' | 'kling-video-o1' | 'wan2.2' | 'wan2.2-ti2v-5b' | 'wan2.2-i2v-a14b'
export type Zone = 'edit' | 'first' | 'last' | 'tray' | 'unused'
export interface Mat {
  id: string; name: string; kind: 'image' | 'video'; dur?: number
  src?: string; thumb?: string; grad: string; ready?: boolean; error?: string
}
export type MatGet = (id: string) => Mat | null
export interface Slots {
  slotEdit: string | null; slotFirst: string | null; slotLast: string | null
  tray: string[]; unused: string[]
}
export const emptySlots = (): Slots => ({ slotEdit: null, slotFirst: null, slotLast: null, tray: [], unused: [] })

/**
 * 模型能力表。取值来自平台的模型清单（`models.json`），型号 ID 与展示名与平台一致。
 *
 * 模型决定三层里的两层：第一层（模式）是「素材够不够 ∧ 模型有没有这个能力」，
 * 第二层参数取值域由模型单向决定、静默收敛，第三层素材配额是模型 × 模式二维。
 */
export interface ModelCap {
  label: string
  /** 界面上的离散档位，真实取值域见 durationRange */
  resolutions: string[]; durations: number[]; ratios: string[]; formats: string[]
  durationRange: [number, number]
  quota: { image: number; video: number; audio: number; mediaSeconds: number }
  /** 是否响应整数秒时间戳。除 2.5 外的型号只响应「镜头 N」序号，拖出来的秒数会被忽略。 */
  timestamp: boolean
  /** 是否支持纯音频参考（不搭配图片或视频）。 */
  audioAlone: boolean
  /** 是否有 adaptive 锁定机制（编辑 / 延长 / 首尾帧强制随原素材）。只有 2.5 有。 */
  locking: boolean
  /** 编辑任务对待编辑视频的最短时长。Seedance 2.5 文档要求 4 秒，其余型号没有这条专属下限。 */
  editSourceMin: number
  /** 这个型号支持哪几种模式。编辑和延长是 Seedance 2.0 起才有的能力，别家模型没有。 */
  genModes: Mode[]
  /** 有没有配音开关。可灵与 Wan 的参数里没有这一项。 */
  hasAudioToggle: boolean
}
const ALL_MODES: Mode[] = ['text', 'frames', 'ref', 'edit', 'extend']
/** 编辑与延长走 omni_reference_task_type，是 Seedance 2.0 才有的能力，其余型号只能生成。 */
const GEN_MODES: Mode[] = ['text', 'frames', 'ref']
const RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
/** 2.0 系列共用一套取值域：4–15 秒、9 图 / 3 视频 / 3 音频、不锁定、不响应秒数。 */
const sd20 = (label: string, resolutions: string[]): ModelCap => ({
  label, resolutions, durations: [4, 5, 6, 8, 10, 15], ratios: RATIOS, formats: ['mp4'],
  durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
  timestamp: false, audioAlone: false, locking: false, editSourceMin: 2,
  genModes: ALL_MODES, hasAudioToggle: true,
})
/**
 * Wan 的两个单模式变体：各自只做一件事。上游用一个 `size` 像素串（1280*704 / 704*1280）
 * 同时表达分辨率和画幅，这里拆成 720p + 两档比例呈现。
 */
const wanVariant = (label: string, genModes: Mode[], quota: ModelCap['quota']): ModelCap => ({
  ...sd20(label, ['720p']),
  durations: [5], durationRange: [5, 5], ratios: ['16:9', '9:16'],
  quota, genModes, hasAudioToggle: false,
})
export const MODEL_CAPABILITIES: Record<Model, ModelCap> = {
  'sd2.5': {
    label: 'Seedance 2.5',
    resolutions: ['480p', '720p', '1080p'], durations: [4, 5, 6, 8, 10, 15, 20, 30],
    ratios: RATIOS, formats: ['mp4', 'mov'],
    durationRange: [4, 30], quota: { image: 30, video: 10, audio: 10, mediaSeconds: 30 },
    timestamp: true, audioAlone: true, locking: true, editSourceMin: 4,
    genModes: ALL_MODES, hasAudioToggle: true,
  },
  'sd2.0': sd20('Seedance 2.0', ['480p', '720p', '1080p', '4K']),
  /** 平台把高价档位拆成独立模型条目承载定价，所以分辨率只有一档。 */
  'sd2.0-1080p': sd20('SD 2.0 1080p', ['1080p']),
  'sd2.0-4k': sd20('SD 2.0 4K', ['4K']),
  'sd2.0-fast': sd20('Seedance 2.0 Fast', ['480p', '720p']),
  'sd2.0-mini': sd20('Seedance 2.0 Mini', ['480p', '720p']),
  'sd1.5': { ...sd20('Seedance 1.5', ['480p', '720p', '1080p']), genModes: GEN_MODES },
  'kling-video-o1': {
    ...sd20('可灵 O1', ['720p', '1080p']),
    durations: [5, 10], durationRange: [5, 10], ratios: ['16:9', '1:1', '9:16'],
    genModes: GEN_MODES, hasAudioToggle: false,
  },
  'wan2.2': { ...sd20('Wan 2.2', ['480p', '720p', '1080p']), genModes: GEN_MODES, hasAudioToggle: false },
  'wan2.2-ti2v-5b': wanVariant('Wan 2.2 文生视频', ['text'], { image: 0, video: 0, audio: 0, mediaSeconds: 0 }),
  'wan2.2-i2v-a14b': wanVariant('Wan 2.2 图生视频', ['ref'], { image: 1, video: 0, audio: 0, mediaSeconds: 0 }),
}
export const MODELS = Object.keys(MODEL_CAPABILITIES) as Model[]

/** 模式规则：锁定项。任务类型由当前 Tab 决定，不再靠提示词里的触发词推断。 */
export interface ModeRule {
  /** 仅当模型 locking 为真时生效 */
  locks: { ratio?: 'adaptive'; duration?: 'source' }
}
export const MODE_RULES: Record<Mode, ModeRule> = {
  text: { locks: {} },
  frames: { locks: { ratio: 'adaptive' } },
  ref: { locks: {} },
  edit: { locks: { ratio: 'adaptive', duration: 'source' } },
  extend: { locks: { ratio: 'adaptive' } },
}
export const locksRatio = (mode: Mode, model: Model) =>
  MODEL_CAPABILITIES[model].locking && MODE_RULES[mode].locks.ratio === 'adaptive'
/** 编辑任务整条进、整条出，与模型无关，所以锁定不看 locking 开关。 */
export const locksDuration = (mode: Mode) => MODE_RULES[mode].locks.duration === 'source'
/** 只有 Seedance 2.5 能把「改这一段 / 从这一段接」表达出去；其余型号拖了也会被忽略。 */
export const supportsRange = (model: Model) => MODEL_CAPABILITIES[model].timestamp
export const rangeBlockedReason = (model: Model) =>
  supportsRange(model) ? '' : `${MODEL_CAPABILITIES[model].label} 不响应秒数，时间范围会被忽略`

/**
 * 这个任务类型收多长的视频 —— 待编辑视频和辅助参考视频共用这一条。
 * 编辑任务的下限由模型给（2.5 是 4 秒，2.0 系列 2 秒），参考生成与延长一律 2 秒起。
 */
export const sourceBounds = (mode: Mode, model: Model): [number, number] =>
  [mode === 'edit' ? MODEL_CAPABILITIES[model].editSourceMin : 2, 30]
/**
 * 视频节点上的「编辑视频 / 延长视频」入口能不能点：这段时长有没有任何型号接得住。
 * 一段都接不住就在入口处灰掉并说清楚区间，不要放人进去再用黄字告诉他不行。
 */
export function sourceEntryReason(dur: number | undefined, mode: 'edit' | 'extend'): string {
  if (dur == null || !Number.isFinite(dur)) return ''   // 还在读时长，先不拦
  const able = MODELS.filter((m) => MODEL_CAPABILITIES[m].genModes.includes(mode))
  if (able.some((m) => { const [lo, hi] = sourceBounds(mode, m); return dur >= lo && dur <= hi })) return ''
  const lo = Math.min(...able.map((m) => sourceBounds(mode, m)[0]))
  return `这段视频 ${fmt(dur)}，${mode === 'edit' ? '编辑' : '延长'}需要 ${lo}–30 秒的视频`
}
/** 这段视频能不能当这个模式的源。时长还没读出来的先当可以，读到了自然会再判一次。 */
export function fitsAsSource(m: Mat, mode: Mode, model: Model): boolean {
  if (m.kind !== 'video') return false
  if (m.dur == null || !Number.isFinite(m.dur)) return true
  const [lo, hi] = sourceBounds(mode, model)
  return m.dur >= lo && m.dur <= hi
}
export const TABS: { k: Mode; label: string }[] = [
  { k: 'text', label: '文生视频' }, { k: 'frames', label: '首尾帧' },
  { k: 'ref', label: '参考素材' }, { k: 'edit', label: '编辑视频' }, { k: 'extend', label: '延长视频' },
]
export const fmt = (d: number) => (d % 1 ? d.toFixed(1) : String(d)) + 's'

export interface Counts { image: number; video: number; total: number }
export function countConn(conn: string[], get: MatGet): Counts {
  let image = 0, video = 0
  for (const id of conn) { const m = get(id); if (m?.kind === 'image') image++; else if (m?.kind === 'video') video++ }
  return { image, video, total: image + video }
}
/** 连了什么 + 用哪个型号。编辑 / 延长能不能进还要看时长，所以素材本身也带上。 */
export interface ConnInfo extends Counts { mats: Mat[]; model: Model }
export function connInfo(conn: string[], get: MatGet, model: Model): ConnInfo {
  const mats = conn.map(get).filter((m): m is Mat => !!m)
  const image = mats.filter((m) => m.kind === 'image').length
  return { image, video: mats.length - image, total: mats.length, mats, model }
}
/**
 * 时长不合规不是「进去之后才报的黄字」，是进不进得去本身：
 * 连着的视频没有一段能当源，编辑 / 延长就该在入口处灰掉，并把区间说出来。
 */
function sourceRequirement(c: ConnInfo, mode: 'edit' | 'extend'): string {
  if (!c.video) return '需要 1 段视频作为源'
  if (c.mats.some((m) => fitsAsSource(m, mode, c.model))) return ''
  const [lo, hi] = sourceBounds(mode, c.model)
  return `已连接的视频都不在 ${lo}–${hi} 秒内，${mode === 'edit' ? '编辑' : '延长'}用不了`
}
/** 素材这一半：画布上连了什么决定 Tab 能不能进。模型那一半见 tabStates。 */
export const TAB_REQUIREMENT: Record<Mode, (c: ConnInfo) => string> = {
  text: (c) => c.total ? '画布上已连接素材。文生视频只接受文本，断开连接后可用' : '',
  frames: (c) => !c.image ? '需要至少 1 张图片作首帧'
    : c.image > 2 ? `已连接 ${c.image} 张图片，首尾帧最多使用 2 张` : '',
  ref: (c) => c.total ? '' : '需要至少 1 个素材',
  edit: (c) => sourceRequirement(c, 'edit'),
  extend: (c) => sourceRequirement(c, 'extend'),
}
/**
 * 进得去、但有连着的素材用不上：不在面板里摆一排「不参与」的缩略图，
 * 只在这个 Tab 上挂一句悬浮说明 —— 进来之前就知道会忽略什么。
 */
export function tabNote(mode: Mode, c: Counts, model: Model): string {
  if (mode === 'text') return ''
  if (mode === 'frames') return c.video ? '此模式会忽略已连接的视频节点' : ''
  const cap = MODEL_CAPABILITIES[model]
  // 一个都收不了的那一类：说「忽略」，别说「最多使用 0 段」
  const ignored = [!cap.quota.video && c.video ? '视频' : '', !cap.quota.image && c.image ? '图片' : ''].filter(Boolean)
  if (ignored.length) return `此模式会忽略已连接的${ignored.join('与')}节点`
  const over: string[] = []
  if (c.image > cap.quota.image) over.push(`${cap.quota.image} 张图片`)
  if (c.video > cap.quota.video) over.push(`${cap.quota.video} 段视频`)
  return over.length ? `${cap.label} 最多使用 ${over.join('、')}，超出的本次不参与` : ''
}
export interface TabState { k: Mode; label: string; enabled: boolean; reason: string; note: string }
/** Tab 能不能进 = 素材够不够 ∧ 模型有没有这个能力。模型这一半先判，理由更具体。 */
export function tabStates(conn: string[], get: MatGet, model: Model): TabState[] {
  const c = connInfo(conn, get, model)
  const cap = MODEL_CAPABILITIES[model]
  return TABS.map((t) => {
    let reason = !cap.genModes.includes(t.k)
      ? `${cap.label} 不支持${t.label}`
      : TAB_REQUIREMENT[t.k](c)
    // 进不去但换个型号就进得去时，直接把那个型号说出来 —— 否则用户在灰掉的 Tab 上无路可走
    if (reason && (t.k === 'edit' || t.k === 'extend') && c.video) {
      const better = MODELS.find((m) => m !== model && modeAvailable(t.k, conn, get, m))
      if (better) reason += `，换 ${MODEL_CAPABILITIES[better].label} 可以`
    }
    return { ...t, enabled: !reason, reason, note: reason ? '' : tabNote(t.k, c, model) }
  })
}
export const modeAvailable = (mode: Mode, conn: string[], get: MatGet, model: Model) =>
  MODEL_CAPABILITIES[model].genModes.includes(mode) && !TAB_REQUIREMENT[mode](connInfo(conn, get, model))
/**
 * 这个型号在当前连接下一个模式都进不去 —— 选了它只会落在一个全灰的 Tab 上，
 * 所以在模型列表里就灰掉。典型的是只做文生视频的型号：画布上一连素材它就没得做了。
 */
export function modelUnusableReason(conn: string[], get: MatGet, model: Model): string {
  const cap = MODEL_CAPABILITIES[model]
  if (cap.genModes.some((m) => modeAvailable(m, conn, get, model))) return ''
  const only = cap.genModes.map((m) => TABS.find((t) => t.k === m)!.label).join(' / ')
  // 型号名就在这行上，理由里不用再念一遍
  return countConn(conn, get).total ? `只做${only}，画布上已连接素材` : `只做${only}，需要先连接素材`
}
/** 当前 Tab 失效时落到哪里：还有素材就去参考素材，空画布回文生视频；模型也不支持时继续往下找。 */
export const fallbackMode = (conn: string[], get: MatGet, model: Model): Mode => {
  const order: Mode[] = countConn(conn, get).total ? ['ref', 'text'] : ['text', 'ref']
  return order.find((m) => modeAvailable(m, conn, get, model)) ?? 'text'
}

export function activeIds(s: Slots, mode: Mode): string[] {
  if (mode === 'text') return []
  if (mode === 'frames') return [s.slotFirst, s.slotLast].filter((id): id is string => !!id)
  return [...(s.slotEdit && (mode === 'edit' || mode === 'extend') ? [s.slotEdit] : []), ...s.tray]
}
export interface Skipped { id: string; reason: string }
/**
 * 分出「本次参与」和「本次不参与」，并给每个不参与的素材一句话理由。
 * 连接不断开、缩略图不消失 —— 静默丢弃会让用户以为自己连错了。
 */
export function partition(s: Slots, mode: Mode, model: Model, get: MatGet): { active: string[]; skipped: Skipped[] } {
  const cap = MODEL_CAPABILITIES[model]
  const active: string[] = []; const skipped: Skipped[] = []
  let image = 0, video = 0
  for (const id of activeIds(s, mode)) {
    const m = get(id); if (!m) continue
    if (m.kind === 'image' && ++image > cap.quota.image) skipped.push({ id, reason: `${cap.label} 最多使用 ${cap.quota.image} 张图片，超出的本次不参与` })
    else if (m.kind === 'video' && ++video > cap.quota.video) skipped.push({ id, reason: `${cap.label} 最多使用 ${cap.quota.video} 段视频，超出的本次不参与` })
    else active.push(id)
  }
  for (const id of s.unused) {
    const m = get(id); if (!m || skipped.some((x) => x.id === id)) continue
    skipped.push({ id, reason: unusedReason(mode) })
  }
  return { active, skipped }
}
function unusedReason(mode: Mode): string {
  if (mode === 'text') return '文生视频只接受文本，已连接的素材本次不参与'
  if (mode === 'frames') return '首尾帧只使用图片，已连接的视频本次不参与'
  return '已从本次输入中移除，连接仍然保留'
}
/**
 * 「本次有效输入」的完整描述：素材槽位 + 模式 + 模型。
 * 素材展示、配额校验、时长合计都读这一份，不再各算各的。
 */
export interface InputSpec extends Slots { mode: Mode; model: Model }
/**
 * 本次有效输入的视频秒数合计。
 * 视频一律整条进模型：编辑是整条进整条出，延长也是拿整条去续写，
 * 选区只是写进提示词的时间戳，不改变送进去的素材。
 */
export const inputSeconds = (g: InputSpec, get: MatGet): number =>
  partition(g, g.mode, g.model, get).active.reduce((sum, id) => {
    const m = get(id)
    return sum + (m?.kind === 'video' ? m.dur ?? 0 : 0)
  }, 0)
/** 视频总时长超限时指不到具体是哪一段，只报警不置灰，让用户自己决定删哪个。 */
export function mediaSecondsWarning(g: InputSpec, get: MatGet): string {
  const cap = MODEL_CAPABILITIES[g.model]
  const total = inputSeconds(g, get)
  return total > cap.quota.mediaSeconds
    ? `本次输入视频合计 ${fmt(total)}，超出 ${cap.label} 的 ${cap.quota.mediaSeconds} 秒上限，请移除其中一段`
    : ''
}

export function accepts(z: Zone, id: string, get: MatGet) {
  const m = get(id)
  return !!m && (z === 'edit' ? m.kind === 'video' : z === 'first' || z === 'last' ? m.kind === 'image' : true)
}
/** 首次进入模式自动分配；恢复草稿时只接纳新连接，保留明确清空的角色。 */
export function allocate(prev: Slots, conn: string[], mode: Mode, get: MatGet, fresh = true, added = conn): Slots {
  const valid = conn.filter((id) => !!get(id))
  const keep = (id: string | null) => id && valid.includes(id) ? id : null
  const s: Slots = fresh ? emptySlots() : {
    slotEdit: keep(prev.slotEdit), slotFirst: keep(prev.slotFirst), slotLast: keep(prev.slotLast),
    tray: prev.tray.filter((id) => valid.includes(id)), unused: [],
  }
  const candidates = fresh ? valid : added.filter((id) => valid.includes(id) && !activeIds(s, mode).includes(id))
  for (const id of candidates) {
    if (mode === 'frames') {
      if (get(id)?.kind !== 'image') continue
      if (!s.slotFirst) s.slotFirst = id
      else if (!s.slotLast) s.slotLast = id
    } else if (mode === 'edit' || mode === 'extend') {
      if (!s.slotEdit && get(id)?.kind === 'video') s.slotEdit = id
      else s.tray.push(id)
    } else if (mode === 'ref') s.tray.push(id)
  }
  s.unused = valid.filter((id) => !activeIds(s, mode).includes(id))
  return s
}
/** 显式替换只改变指定角色，原素材转为非当前输入，不与参考素材交换。 */
export function assign(prev: Slots, id: string, zone: Zone, get: MatGet): Slots | null {
  if (!accepts(zone, id, get)) return null
  const s = remove(prev, id)
  if (zone === 'edit') { if (s.slotEdit) s.unused.push(s.slotEdit); s.slotEdit = id }
  else if (zone === 'first') { if (s.slotFirst) s.unused.push(s.slotFirst); s.slotFirst = id }
  else if (zone === 'last') { if (s.slotLast) s.unused.push(s.slotLast); s.slotLast = id }
  else if (zone === 'tray') s.tray.push(id)
  else s.unused.push(id)
  s.unused = [...new Set(s.unused)].filter((mid) => mid !== id || zone === 'unused')
  return s
}
export function remove(prev: Slots, id: string): Slots {
  return { slotEdit: prev.slotEdit === id ? null : prev.slotEdit,
    slotFirst: prev.slotFirst === id ? null : prev.slotFirst, slotLast: prev.slotLast === id ? null : prev.slotLast,
    tray: prev.tray.filter((mid) => mid !== id), unused: [...new Set([...prev.unused, id])] }
}
export type PromptSeg = { t: string }
export function promptHint(mode: Mode, hasLast = false): PromptSeg[] {
  const hints: Record<Mode, string> = {
    text: '描述你想要生成的画面内容', frames: hasLast ? '描述从首帧到尾帧之间发生的变化' : '描述从首帧开始的动作与镜头变化',
    ref: '描述你想要生成的画面，输入 @ 引用参考素材', edit: '把右侧的黄色椅子改成红色',
    extend: '描述新接上的这段画面与动作',
  }
  return [{ t: hints[mode] }]
}
