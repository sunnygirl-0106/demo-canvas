/** 当前任务的素材角色。隐藏资产仅保留连接，不进入有效输入。 */
export type Mode = 'text' | 'frames' | 'ref' | 'refImage' | 'edit' | 'extend'
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
  /**
   * 每个输入视频的时长区间。文档给的是「单个视频」的硬要求：
   * 2.5 收 2–30 秒，2.0 / Fast / Mini 收 2–15 秒。待编辑、待延长、辅助参考视频共用这一条。
   */
  videoSeconds: [number, number]
  /** 编辑任务对每个输入视频的更严下限。Seedance 2.5 文档要求 4 秒，其余型号沿用 videoSeconds 的下限。 */
  editSourceMin: number
  /** 这个型号支持哪几种模式。编辑和延长是 Seedance 2.0 起才有的能力，别家模型没有。 */
  genModes: Mode[]
  /** 有没有配音开关。可灵与 Wan 的参数里没有这一项。 */
  hasAudioToggle: boolean
}
/**
 * 「全能参考」和「参考图」是同一层级的两个互斥 Tab：收多模态素材的型号给前者，只收图的给后者，
 * 一个型号只会拥有其中一个，另一个根本不出现在 Tab 行上（见 tabStates）。
 */
const ALL_MODES: Mode[] = ['text', 'frames', 'ref', 'edit', 'extend']
const RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
/**
 * 2.0 系列共用一套取值域：产出 4–15 秒、9 图 / 3 视频 / 3 音频、不锁定、不响应秒数。
 * 输入视频这一栏按文档是「单个 2–15 秒、最多 3 个、合计 ≤15 秒」，编辑 / 参考生成 / 延长三种任务一视同仁。
 */
const sd20 = (label: string, resolutions: string[]): ModelCap => ({
  label, resolutions, durations: [4, 5, 6, 8, 10, 15], ratios: RATIOS, formats: ['mp4'],
  durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
  timestamp: false, audioAlone: false, locking: false, videoSeconds: [2, 15], editSourceMin: 2,
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
    timestamp: true, audioAlone: true, locking: true, videoSeconds: [2, 30], editSourceMin: 4,
    genModes: ALL_MODES, hasAudioToggle: true,
  },
  'sd2.0': sd20('Seedance 2.0', ['480p', '720p', '1080p', '4K']),
  /** 平台把高价档位拆成独立模型条目承载定价，所以分辨率只有一档。 */
  'sd2.0-1080p': sd20('SD 2.0 1080p', ['1080p']),
  'sd2.0-4k': sd20('SD 2.0 4K', ['4K']),
  'sd2.0-fast': sd20('Seedance 2.0 Fast', ['480p', '720p']),
  'sd2.0-mini': sd20('Seedance 2.0 Mini', ['480p', '720p']),
  /** 只收参考图：配额也要跟着把视频与音频归零，否则「参考图」面板上还会显示它能收视频。 */
  'sd1.5': { ...sd20('Seedance 1.5', ['480p', '720p', '1080p']),
    genModes: ['text', 'frames', 'refImage'], quota: { image: 9, video: 0, audio: 0, mediaSeconds: 0 } },
  'kling-video-o1': {
    ...sd20('可灵 O1', ['720p', '1080p']),
    durations: [5, 10], durationRange: [5, 10], ratios: ['16:9', '1:1', '9:16'],
    genModes: ['text', 'frames', 'ref'], hasAudioToggle: false,
  },
  'wan2.2': { ...sd20('Wan 2.2', ['480p', '720p', '1080p']),
    genModes: ['text', 'frames', 'refImage'], quota: { image: 9, video: 0, audio: 0, mediaSeconds: 0 },
    hasAudioToggle: false },
  'wan2.2-ti2v-5b': wanVariant('Wan 2.2 文生视频', ['text'], { image: 0, video: 0, audio: 0, mediaSeconds: 0 }),
  'wan2.2-i2v-a14b': wanVariant('Wan 2.2 图生视频', ['refImage'], { image: 1, video: 0, audio: 0, mediaSeconds: 0 }),
}
export const MODELS = Object.keys(MODEL_CAPABILITIES) as Model[]
/** 参考类模式（全能参考 / 参考图）。凡是「这是不是参考」的判断都走这一条，不散着比字符串。 */
export const isRef = (m: Mode) => m === 'ref' || m === 'refImage'
/** 这个型号的参考 Tab 是哪一个 —— 两个互斥，最多有一个；只做文生视频的型号没有。 */
export const refModeOf = (model: Model): Mode | null =>
  MODEL_CAPABILITIES[model].genModes.find(isRef) ?? null

/** 模式规则：锁定项。任务类型由当前 Tab 决定，不再靠提示词里的触发词推断。 */
export interface ModeRule {
  /** 仅当模型 locking 为真时生效 */
  locks: { ratio?: 'adaptive'; duration?: 'source' }
}
export const MODE_RULES: Record<Mode, ModeRule> = {
  text: { locks: {} },
  frames: { locks: { ratio: 'adaptive' } },
  ref: { locks: {} },
  refImage: { locks: {} },
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
  supportsRange(model) ? '' : `${MODEL_CAPABILITIES[model].label} 不支持局部编辑`

/**
 * 这个任务类型收多长的视频 —— 待编辑视频和辅助参考视频共用这一条。
 * 上限由模型给（2.5 是 30 秒，2.0 系列 15 秒）；下限只有「2.5 的编辑任务」抬到 4 秒，其余一律 2 秒起。
 */
export const sourceBounds = (mode: Mode, model: Model): [number, number] => {
  const cap = MODEL_CAPABILITIES[model]
  return [mode === 'edit' ? Math.max(cap.editSourceMin, cap.videoSeconds[0]) : cap.videoSeconds[0], cap.videoSeconds[1]]
}
/**
 * 视频节点上的「编辑视频 / 延长视频」入口能不能点：这段时长有没有任何型号接得住。
 * 一段都接不住就在入口处灰掉并说清楚区间，不要放人进去再用黄字告诉他不行。
 */
export function sourceEntryReason(dur: number | undefined, mode: 'edit' | 'extend', name = ''): string {
  if (dur == null || !Number.isFinite(dur)) return ''   // 还在读时长，先不拦
  const able = MODELS.filter((m) => MODEL_CAPABILITIES[m].genModes.includes(mode))
  if (able.some((m) => { const [lo, hi] = sourceBounds(mode, m); return dur >= lo && dur <= hi })) return ''
  const lo = Math.min(...able.map((m) => sourceBounds(mode, m)[0]))
  const hi = Math.max(...able.map((m) => sourceBounds(mode, m)[1]))
  // 区间按这个入口自己的规则填，不为了和别处说一样的话改数值
  return durRange(lo, hi, name)
}
/**
 * 提示里的素材描述：「视频 ABCD 」这种「类型或角色 + 名称」的说法。
 * 名字是用来定位问题的，缺席时退回只说类型，不留一个空档。
 */
export const subject = (what: string, ...names: string[]) => {
  const said = names.filter(Boolean).join('、')
  return said ? `${what} ${said} ` : what
}
/** 时长一律阿拉伯数字 + 「秒」，区间用「–」。同一条区间上的多段视频合成一句，不逐段重复 */
export const durRange = (lo: number, hi: number, ...names: string[]) =>
  `${subject('视频', ...names)}的时长需在 ${lo}–${hi} 秒之间`
/** 读不出来 / 放不出来：首帧图片说「首帧 ABCD」，不能一律说成「视频」 */
export const mediaFailure = (what: string, name: string, cause: string) =>
  `${subject(what, name)}${cause}，可尝试重新上传`
/** 节点上只存原因，素材描述在展示时才拼 —— 同一份错误在首帧位和素材区读起来不一样 */
export const MEDIA_FAIL = { read: '无法读取', play: '无法播放' } as const
export const readingDuration = (name = '') => `正在读取${subject('视频', name)}的时长`
export const secs = (d: number) => `${d % 1 ? d.toFixed(1) : d} 秒`
/**
 * 这个素材在当前任务里用不上的原因：返回 null 表示能用。
 * 理由拆成「怎么说」和「说哪几段」两半 —— 同一个原因涉及多段视频时合并素材名（tabNote），
 * 不把同一句话逐段重复一遍。
 */
export interface Block { key: string; say: (names: string[]) => string }
export function matBlock(m: Mat, mode: Mode, model: Model): Block | null {
  const kind = m.kind === 'video' ? '视频' : '图片'
  if (m.error) return { key: `error:${m.id}`, say: () => mediaFailure(kind, m.name, m.error!) }
  if (mode === 'text' || mode === 'frames') return null
  const cap = MODEL_CAPABILITIES[model]
  // 一整类都不收的型号（Wan 图生视频不收视频）：说「不支持」，不说「最多使用 0 段」
  if (!cap.quota[m.kind]) return { key: `kind:${m.kind}`, say: () => `${cap.label} 不支持${kind}输入` }
  if (m.kind !== 'video') return null
  if (m.dur == null || !Number.isFinite(m.dur)) return null
  const [lo, hi] = sourceBounds(mode, model)
  // 说的是这件事的门槛本身，不是「哪个型号的哪条规格」：用户听得懂的是秒数。
  // 低于 / 高于所有型号合起来的那条线时，说的是那条线 —— 换型号、换 Tab 都救不回来，
  // 没必要拿当前型号更严的门槛去唬人。
  const range = m.dur < FLOOR || m.dur > CEIL ? [FLOOR, CEIL] : m.dur < lo || m.dur > hi ? [lo, hi] : null
  return range ? { key: `dur:${range[0]}-${range[1]}`, say: (names) => durRange(range[0], range[1], ...names) } : null
}
/**
 * 这个素材用不上的那一句话，空串表示能用 —— 界面按这一句把素材置灰并悬浮说明，
 * 不再等到用户写完提示词、点生成时才用黄字告诉他。
 * 时长还没读出来的先当能用：读到了自然会再判一次。
 */
export const matBlockedReason = (m: Mat, mode: Mode, model: Model): string =>
  matBlock(m, mode, model)?.say([m.name]) ?? ''
/** 所有型号合起来的收片区间：2–30 秒。这两条线之外的素材，整个产品都用不了 */
const FLOOR = Math.min(...MODELS.map((m) => MODEL_CAPABILITIES[m].videoSeconds[0]))
const CEIL = Math.max(...MODELS.map((m) => MODEL_CAPABILITIES[m].videoSeconds[1]))
/**
 * 面板上该摆哪些参考素材：用不上的那些不摆。
 * 摆一排灰掉的缩略图再解释「它为什么不参与」，等于把一句失败说明钉在面板上 ——
 * 这句话挂在 Tab 的悬浮说明里就够了（tabNote），素材本身的归宿是参考那个 Tab。
 */
export const visibleRefs = (tray: string[], mode: Mode, model: Model, get: MatGet): string[] =>
  tray.filter((id) => { const m = get(id); return !!m && !matBlockedReason(m, mode, model) })
/** 这段视频能不能当这个模式的源。时长还没读出来的先当可以，读到了自然会再判一次。 */
export function fitsAsSource(m: Mat, mode: Mode, model: Model): boolean {
  return m.kind === 'video' && !matBlockedReason(m, mode, model)
}
export const TABS: { k: Mode; label: string }[] = [
  { k: 'text', label: '文生视频' }, { k: 'frames', label: '首尾帧' },
  { k: 'refImage', label: '参考图' }, { k: 'ref', label: '全能参考' },
  { k: 'edit', label: '编辑视频' }, { k: 'extend', label: '延长视频' },
]
export const fmt = (d: number) => (d % 1 ? d.toFixed(1) : String(d)) + 's'

export interface Counts { image: number; video: number; total: number }
export function countConn(conn: string[], get: MatGet): Counts {
  let image = 0, video = 0
  for (const id of conn) { const m = get(id); if (m?.kind === 'image') image++; else if (m?.kind === 'video') video++ }
  return { image, video, total: image + video }
}
/** 连了什么 + 用哪个型号。编辑 / 延长能不能进还要看时长，所以素材本身也带上。 */
export interface ConnInfo extends Counts { mats: Mat[]; model: Model; source: Mat | null }
/**
 * 编辑 / 延长会用哪一段：已经选定的就是它（从视频节点入口进来时指名的那一段），
 * 还没选定就是连着的第一段视频。就这一段，不挑、不跳过、不换 ——
 * 「第一段不合规就顺手用第二段」是替用户做决定，宁可把入口灰掉让他自己选。
 */
export function connInfo(conn: string[], get: MatGet, model: Model, sourceId?: string | null): ConnInfo {
  const mats = conn.map(get).filter((m): m is Mat => !!m)
  const image = mats.filter((m) => m.kind === 'image').length
  const picked = sourceId ? mats.find((m) => m.id === sourceId) : null
  const source = picked ?? mats.find((m) => m.kind === 'video') ?? null
  return { image, video: mats.length - image, total: mats.length, mats, model, source }
}
/**
 * 时长不合规不是「进去之后才报的黄字」，是进不进得去本身：
 * 要用的那一段不合规，编辑 / 延长就在入口处灰掉，并把是哪一段、差在哪说出来。
 * 判的只有那一段 —— 画布上另有一段合规的视频，不代表可以替用户换过去。
 */
function sourceRequirement(c: ConnInfo, mode: 'edit' | 'extend'): string {
  if (!c.source || c.source.kind !== 'video') return NEEDS.video
  return matBlockedReason(c.source, mode, c.model)
}
/**
 * 素材还没连够时说的那句话：说的是「去画布上连什么」这个动作，
 * 不是「本模式需要几个输入」这种规格描述 —— 用户要的是下一步怎么做。
 */
const NEEDS = {
  image: '连接 1–2 张图片后可用',
  video: '连接视频后可用',
  /** 只收图片的型号不能让用户去连视频 */
  any: (c: ConnInfo) => `连接${MODEL_CAPABILITIES[c.model].quota.video ? '图片或视频' : '图片'}后可用`,
}
/** 素材这一半：画布上连了什么决定 Tab 能不能进。模型那一半见 tabStates。 */
export const TAB_REQUIREMENT: Record<Mode, (c: ConnInfo) => string> = {
  text: (c) => c.total ? '文生视频仅使用文本，断开素材连接后可用' : '',
  frames: (c) => !c.image ? NEEDS.image
    : c.image > 2 ? `首尾帧最多支持 2 张图片，当前已连接 ${c.image} 张` : '',
  // 参考是所有 Tab 失效时的落脚点，只要画布上有东西就进得去：
  // 用不上的那些只是「本次不参与」（缩略图置灰、Tab 悬浮说明），不把整个 Tab 关掉 ——
  // 否则连一段 1.5 秒的视频会让五个 Tab 全灰，用户无处可去
  ref: (c) => c.total ? '' : NEEDS.any(c),
  // 参考图这一条和全能参考完全一样，不改成「必须有图」：只连了视频的 Wan 用户会六个 Tab 全灰、
  // 无处可去。连了视频进来照旧是「缩略图置灰 + 悬浮说明 + 生成按钮拦住」。
  refImage: (c) => c.total ? '' : NEEDS.any(c),
  edit: (c) => sourceRequirement(c, 'edit'),
  extend: (c) => sourceRequirement(c, 'extend'),
}
/**
 * 进得去、但有连着的素材用不上：不在面板里摆一排「不参与」的缩略图，
 * 只在这个 Tab 上挂一句悬浮说明 —— 进来之前就知道哪些素材不参与。
 */
export function tabNote(mode: Mode, c: ConnInfo, model: Model): string {
  if (mode === 'text') return ''
  if (mode === 'frames') return c.video ? SKIP('视频') : ''
  const cap = MODEL_CAPABILITIES[model]
  // 一整类都不收的模式（参考图不收视频）：说的是「这一类不参与」，不逐个点名 ——
  // 和首尾帧不用视频是同一件事，就说同一句话；也别说成「最多使用 0 段」
  const ignored = [!cap.quota.video && c.video ? '视频' : '', !cap.quota.image && c.image ? '图片' : ''].filter(Boolean)
  // 剩下的才逐个说：时长不合规、读不出来的都不拦着生成，也不静默丢，
  // 进来之前就在 Tab 上说清楚哪几个不参与，理由相同的并成一句
  const groups = new Map<string, { say: Block['say']; names: string[] }>()
  for (const m of c.mats) {
    if (!cap.quota[m.kind]) continue   // 这一类已经整类说过了
    const b = matBlock(m, mode, model)
    if (!b) continue
    const g = groups.get(b.key) ?? { say: b.say, names: [] }
    g.names.push(m.name); groups.set(b.key, g)
  }
  // 原因照旧，后面补一句「不参与本次生成」：说清楚影响范围是这一段素材，不是整件事做不成
  const said = [ignored.length ? SKIP(ignored.join('与')) : '',
    ...[...groups.values()].map((g) => `${g.say(g.names)}，不参与本次生成`)].filter(Boolean)
  if (said.length) return said.join('；')
  const over: string[] = []
  if (c.image > cap.quota.image) over.push(`${cap.quota.image} 张图片`)
  if (c.video > cap.quota.video) over.push(`${cap.quota.video} 段视频`)
  return over.length ? `${cap.label} 最多支持 ${over.join('、')}，超出部分不参与本次生成` : ''
}
/** 素材留着、连接也留着，只是这一次不用它 —— 不说成「忽略」「移除」 */
const SKIP = (what: string) => `${what}不参与本次生成`
export interface TabState { k: Mode; label: string; enabled: boolean; reason: string; note: string }
/**
 * 这个型号做得了的那几件事，各自能不能进。
 *
 * 型号没有的能力不摆一个灰 Tab 在那儿：Tab 行说的是「这个型号能做哪几件事」，
 * 灰掉说的是「这件事它会做，但画布上的素材还不够」—— 两句话不混在同一个位置上。
 * 「这个型号做不了我要的事」由模型列表那一头说（modelBlockedReason 会把它那一行灰掉并给理由），
 * 编辑 / 延长另有视频节点上的入口，从那儿进来会自动换成接得住的型号。
 */
export function tabStates(conn: string[], get: MatGet, model: Model, sourceOf?: (mode: Mode) => string | null): TabState[] {
  const cap = MODEL_CAPABILITIES[model]
  return TABS.filter((t) => cap.genModes.includes(t.k)).map((t) => {
    // 每个 Tab 问的是「它自己那一份草稿会用哪一段」，不是当前 Tab 手上的那一段
    const source = sourceOf?.(t.k) ?? null
    const c = connInfo(conn, get, model, source)
    let reason = TAB_REQUIREMENT[t.k](c)
    // 进不去但换个型号就进得去时，直接把那个型号说出来 —— 否则用户在灰掉的 Tab 上无路可走
    if (reason && (t.k === 'edit' || t.k === 'extend') && c.video) {
      const better = MODELS.find((m) => m !== model && modeAvailable(t.k, conn, get, m, source))
      if (better) reason += `；可切换至 ${MODEL_CAPABILITIES[better].label}`
    }
    return { ...t, enabled: !reason, reason, note: reason ? '' : tabNote(t.k, c, model) }
  })
}
/**
 * 接得住这段源视频、又做得了这件事的型号。当前型号就行时原样返回，
 * 换不到就也返回当前型号 —— 由 Tab 与素材缩略图去置灰并说原因。
 * 时长是异步读出来的，读到的那一刻要靠它把型号收敛过去，而不是把用户丢在一个灰掉的面板里。
 */
export function modelForSource(mode: Mode, conn: string[], get: MatGet, sourceId: string | null, current: Model): Model {
  const ok = (m: Model) => modeAvailable(mode, conn, get, m, sourceId)
  return ok(current) ? current : MODELS.find(ok) ?? current
}
export const modeAvailable = (mode: Mode, conn: string[], get: MatGet, model: Model, sourceId?: string | null) =>
  MODEL_CAPABILITIES[model].genModes.includes(mode) && !TAB_REQUIREMENT[mode](connInfo(conn, get, model, sourceId))
/**
 * 这个型号在当前连接下一个模式都进不去 —— 选了它只会落在一个全灰的 Tab 上，
 * 所以在模型列表里就灰掉。典型的是只做文生视频的型号：画布上一连素材它就没得做了。
 */
export function modelUnusableReason(conn: string[], get: MatGet, model: Model): string {
  const cap = MODEL_CAPABILITIES[model]
  if (cap.genModes.some((m) => modeAvailable(m, conn, get, model))) return ''
  // 说的就是它那件事做不成的原因本身，和那个 Tab 上挂的是同一句话 ——
  // 不再加「只做参考图」这种前缀：型号做得了什么就写在这一行上，理由里不用再念一遍。
  const c = connInfo(conn, get, model)
  for (const m of cap.genModes) { const why = TAB_REQUIREMENT[m](c); if (why) return why }
  return `${cap.label} 不支持当前素材`
}
/** 当前 Tab 失效时落到哪里：还有素材就去这个型号的参考 Tab，空画布回文生视频；模型也不支持时继续往下找。 */
export const fallbackMode = (conn: string[], get: MatGet, model: Model): Mode => {
  const order: Mode[] = countConn(conn, get).total
    ? ['refImage', 'ref', 'text'] : ['text', 'refImage', 'ref']
  return order.find((m) => modeAvailable(m, conn, get, model)) ?? 'text'
}

/**
 * 换成这个型号之后会落在哪个 Tab：当前这个还进得去就不动它，进不去才按 fallback 找。
 * setModel 与模型列表上的悬浮说明共用这一条 —— 说的和做的必须是同一件事。
 */
export const modeAfterModel = (mode: Mode, conn: string[], get: MatGet, model: Model, sourceId?: string | null): Mode =>
  modeAvailable(mode, conn, get, model, sourceId) ? mode : fallbackMode(conn, get, model)

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
    const blocked = matBlockedReason(m, mode, model)
    if (blocked) { skipped.push({ id, reason: blocked }); continue }
    if (m.kind === 'image' && ++image > cap.quota.image) skipped.push({ id, reason: `${cap.label} 最多支持 ${cap.quota.image} 张图片，超出部分不参与本次生成` })
    else if (m.kind === 'video' && ++video > cap.quota.video) skipped.push({ id, reason: `${cap.label} 最多支持 ${cap.quota.video} 段视频，超出部分不参与本次生成` })
    else active.push(id)
  }
  for (const id of s.unused) {
    const m = get(id); if (!m || skipped.some((x) => x.id === id)) continue
    skipped.push({ id, reason: unusedReason(mode) })
  }
  return { active, skipped }
}
function unusedReason(mode: Mode): string {
  if (mode === 'text') return SKIP('素材')
  if (mode === 'frames') return SKIP('视频')
  return `${SKIP('')}，连接保留`
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
  // 不说「移除其中一段」：移掉一段也未必就够，该移几段由用户自己看着办
  return total > cap.quota.mediaSeconds ? overSeconds(total, cap.label, cap.quota.mediaSeconds) : ''
}
const overSeconds = (total: number, label: string, limit: number) =>
  `视频总时长为 ${secs(total)}，超过 ${label} 的 ${limit} 秒上限`
/**
 * 换成这个型号之后，手上这些视频的合计时长会超出它的上限（2.5 是 30 秒，2.0 系列 15 秒）。
 * 当前型号本来就超了的话不算在这个型号头上 —— 那是素材的问题，生成按钮已经在说了。
 * 和生成按钮上那一句说的是同一件事，所以用同一句话。
 */
export function mediaSecondsBlocked(g: InputSpec, model: Model, get: MatGet): string {
  const cap = MODEL_CAPABILITIES[model]
  const total = inputSeconds({ ...g, model }, get)
  if (total <= cap.quota.mediaSeconds || mediaSecondsWarning(g, get)) return ''
  return overSeconds(total, cap.label, cap.quota.mediaSeconds)
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
      // 连着的第一段视频就是要编辑的那一段。不合规也照样放进槽位，
      // 由 Tab 那一层拦住入口 —— 悄悄换成第二段等于替用户改了他要编辑的东西
      if (!s.slotEdit && get(id)?.kind === 'video') s.slotEdit = id
      else s.tray.push(id)
    } else if (isRef(mode)) s.tray.push(id)
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
    ref: '描述你想要生成的画面，输入 @ 引用参考素材',
    refImage: '描述你想要生成的画面，输入 @ 引用参考图', edit: '某一处调整为目标效果',
    extend: '描述新接上的这段画面与动作',
  }
  return [{ t: hints[mode] }]
}
