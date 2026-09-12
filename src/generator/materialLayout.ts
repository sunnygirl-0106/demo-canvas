/** 当前任务的素材角色。隐藏资产仅保留连接，不进入有效输入。 */
export type Mode = 'text' | 'frames' | 'ref' | 'edit' | 'extend'
export type Model = '2.5' | '2.0' | '2.0-fast' | '2.0-mini'
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
 * 模型能力表。取值依据火山方舟官方文档（Seedance 2.5 教程 / 2.5 提示词指南 / 2.0 系列教程，2026-09-11）。
 *
 * 关键：四个模型都支持全部 5 种任务类型，模型不决定「哪个 Tab 能进」。
 * 模型决定的是参数取值域、素材配额，以及下面三个能力开关。
 */
export interface ModelCap {
  label: string
  /** 界面上的离散档位，真实取值域见 durationRange */
  resolutions: string[]; durations: number[]; ratios: string[]; formats: string[]
  durationRange: [number, number]
  quota: { image: number; video: number; audio: number; mediaSeconds: number }
  /** 是否响应整数秒时间戳。2.0 系列只响应「镜头 N」序号，拖出来的秒数会被忽略。 */
  timestamp: boolean
  /** 是否支持纯音频参考（不搭配图片或视频）。 */
  audioAlone: boolean
  /** 是否有 adaptive 锁定机制（编辑 / 延长 / 首尾帧强制随原素材）。2.0 系列没有。 */
  locking: boolean
}
export const MODEL_CAPABILITIES: Record<Model, ModelCap> = {
  '2.5': {
    label: 'Seedance 2.5',
    resolutions: ['480p', '720p', '1080p'], durations: [4, 5, 8, 10, 15, 20, 30],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], formats: ['mp4', 'mov'],
    durationRange: [4, 30], quota: { image: 30, video: 10, audio: 10, mediaSeconds: 30 },
    timestamp: true, audioAlone: true, locking: true,
  },
  '2.0': {
    label: 'Seedance 2.0',
    resolutions: ['480p', '720p', '1080p', '4K'], durations: [4, 5, 8, 10, 15],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], formats: ['mp4'],
    durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
    timestamp: false, audioAlone: false, locking: false,
  },
  '2.0-fast': {
    label: 'Seedance 2.0 Fast',
    resolutions: ['480p', '720p'], durations: [4, 5, 8, 10, 15],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], formats: ['mp4'],
    durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
    timestamp: false, audioAlone: false, locking: false,
  },
  '2.0-mini': {
    label: 'Seedance 2.0 Mini',
    resolutions: ['480p', '720p'], durations: [4, 5, 8, 10, 15],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], formats: ['mp4'],
    durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
    timestamp: false, audioAlone: false, locking: false,
  },
}
export const MODELS = Object.keys(MODEL_CAPABILITIES) as Model[]

/** 模式规则：锁定项、源视频时长区间、提示词必须出现的关键词。 */
export interface ModeRule {
  /** 仅当模型 locking 为真时生效 */
  locks: { ratio?: 'adaptive'; duration?: 'source' }
  /** 源视频时长区间。编辑比其他任务严：[4,30]；延长等非编辑任务 [2,30] */
  sourceDuration?: [number, number]
  /** 少了它模型会把任务判成别的类型（InvalidParameter.TaskTypeMismatch） */
  keywords?: string[]
}
export const MODE_RULES: Record<Mode, ModeRule> = {
  text: { locks: {} },
  frames: { locks: { ratio: 'adaptive' } },
  ref: { locks: {} },
  edit: {
    locks: { ratio: 'adaptive', duration: 'source' }, sourceDuration: [4, 30],
    keywords: ['编辑视频', '增加', '加上', '删除', '去掉', '修改', '替换', '改成'],
  },
  extend: {
    locks: { ratio: 'adaptive' }, sourceDuration: [2, 30],
    keywords: ['向前延长', '向后延长', '延长', '延续', '续写'],
  },
}
export const locksRatio = (mode: Mode, model: Model) =>
  MODEL_CAPABILITIES[model].locking && MODE_RULES[mode].locks.ratio === 'adaptive'
export const locksDuration = (mode: Mode, model: Model) =>
  MODEL_CAPABILITIES[model].locking && MODE_RULES[mode].locks.duration === 'source'
/** 只有 2.5 能把「改这一段 / 从这一段接」表达出去；2.0 系列拖了也会被忽略。 */
export const supportsRange = (model: Model) => MODEL_CAPABILITIES[model].timestamp
export const rangeBlockedReason = (model: Model) =>
  supportsRange(model) ? '' : `${MODEL_CAPABILITIES[model].label} 不响应秒数，时间范围会被忽略`

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
/** Tab 能不能进，只由画布上连了什么决定。模型不参与这一层。 */
export const TAB_REQUIREMENT: Record<Mode, (c: Counts) => string> = {
  text: (c) => c.total ? '画布上已连接素材。文生视频只接受文本，断开连接后可用' : '',
  frames: (c) => c.image ? '' : '需要至少 1 张图片作首帧',
  ref: (c) => c.total ? '' : '需要至少 1 个素材',
  edit: (c) => c.video ? '' : '需要 1 段视频作为源',
  extend: (c) => c.video ? '' : '需要 1 段视频作为源',
}
export interface TabState { k: Mode; label: string; enabled: boolean; reason: string }
export function tabStates(conn: string[], get: MatGet): TabState[] {
  const c = countConn(conn, get)
  return TABS.map((t) => { const reason = TAB_REQUIREMENT[t.k](c); return { ...t, enabled: !reason, reason } })
}
export const modeAvailable = (mode: Mode, conn: string[], get: MatGet) => !TAB_REQUIREMENT[mode](countConn(conn, get))
/** 当前 Tab 失效时落到哪里：还有素材就去参考素材，空画布回文生视频。 */
export const fallbackMode = (conn: string[], get: MatGet): Mode => countConn(conn, get).total ? 'ref' : 'text'

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
    skipped.push({ id, reason: unusedReason(mode, m) })
  }
  return { active, skipped }
}
function unusedReason(mode: Mode, m: Mat): string {
  if (mode === 'text') return '文生视频只接受文本，已连接的素材本次不参与'
  if (mode === 'frames') return m.kind === 'image'
    ? '首尾帧最多使用 2 张图片（首帧 + 尾帧），其余本次不参与'
    : '首尾帧只使用图片，已连接的视频本次不参与'
  return '已从本次输入中移除，连接仍然保留'
}
/** 视频总时长超限时指不到具体是哪一段，只报警不置灰，让用户自己决定删哪个。 */
export function mediaSecondsWarning(s: Slots, mode: Mode, model: Model, get: MatGet): string {
  const cap = MODEL_CAPABILITIES[model]
  let total = 0
  for (const id of partition(s, mode, model, get).active) {
    const m = get(id); if (m?.kind === 'video') total += m.dur ?? 0
  }
  return total > cap.quota.mediaSeconds
    ? `参考视频总时长 ${fmt(total)}，超出 ${cap.label} 的 ${cap.quota.mediaSeconds} 秒上限，请移除其中一段`
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
