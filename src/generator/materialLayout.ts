/** 当前任务的素材角色。隐藏资产仅保留连接，不进入有效输入。 */
export type Mode = 'text' | 'frames' | 'ref' | 'refImage' | 'edit' | 'extend'
export type Model = 'sd2.5' | 'sd2.0' | 'sd2.0-1080p' | 'sd2.0-4k' | 'sd2.0-fast' | 'sd2.0-mini'
  | 'sd1.5' | 'kling-video-o1' | 'wan2.2' | 'wan2.2-ti2v-5b' | 'wan2.2-i2v-a14b'
export type Zone = 'edit' | 'first' | 'last' | 'tray'
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
   * 每个输入视频的时长区间。下限统一 4 秒，上限按型号：
   * 2.5 收 4–30 秒，2.0 / Fast / Mini 收 4–15 秒。待编辑、待延长、辅助参考视频共用这一条。
   */
  videoSeconds: [number, number]
  /** 这个型号支持哪几种模式。编辑和延长是 Seedance 2.0 起才有的能力，别家模型没有。 */
  genModes: Mode[]
  /** 有没有配音开关。可灵与 Wan 的参数里没有这一项。 */
  hasAudioToggle: boolean
  /** 列表里挂一枚 NEW 牌子。只给最新那一代，同时挂两个就等于谁都不新。 */
  isNew?: boolean
  /**
   * 计费档位。只决定这个型号长什么样（等级环的颜色 + 名字后那枚胶囊），不决定它能不能选 ——
   * 能不能选一律由 modelBlockedReason 按「这个模式 / 这些素材接不接得住」判，
   * 两套规矩混在一起的话，同一个灰掉的型号会有两个互相打架的理由。
   */
  tier: Tier
}
/** 免费 / 会员。免费档不挂胶囊 —— 「不是会员专属」这件事不值得占一枚牌子。 */
export type Tier = 'free' | 'vip'
/**
 * 「全能参考」和「参考图」是同一层级的两个互斥 Tab：收多模态素材的型号给前者，只收图的给后者，
 * 一个型号只会拥有其中一个，另一个根本不出现在 Tab 行上（见 tabStates）。
 */
const ALL_MODES: Mode[] = ['text', 'frames', 'ref', 'edit', 'extend']
const RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
/**
 * 2.0 系列共用一套取值域：产出 4–15 秒、9 图 / 3 视频 / 3 音频、不锁定、不响应秒数。
 * 输入视频这一栏按文档是「单个 4–15 秒、最多 3 个、合计 ≤15 秒」，编辑 / 参考生成 / 延长三种任务一视同仁。
 */
const sd20 = (label: string, resolutions: string[], tier: Tier = 'vip'): ModelCap => ({
  label, resolutions, durations: [4, 5, 6, 8, 10, 15], ratios: RATIOS, formats: ['mp4'],
  durationRange: [4, 15], quota: { image: 9, video: 3, audio: 3, mediaSeconds: 15 },
  timestamp: false, audioAlone: false, locking: false, videoSeconds: [4, 15],
  genModes: ALL_MODES, hasAudioToggle: true, tier,
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
    timestamp: true, audioAlone: true, locking: true, videoSeconds: [4, 30],
    genModes: ALL_MODES, hasAudioToggle: true, isNew: true, tier: 'vip',
  },
  'sd2.0': sd20('Seedance 2.0', ['480p', '720p', '1080p', '4K']),
  /** 平台把高价档位拆成独立模型条目承载定价，所以分辨率只有一档。4K 那一条是整张表里最贵的。 */
  'sd2.0-1080p': sd20('SD 2.0 1080p', ['1080p']),
  'sd2.0-4k': sd20('SD 2.0 4K', ['4K']),
  'sd2.0-fast': sd20('Seedance 2.0 Fast', ['480p', '720p'], 'free'),
  'sd2.0-mini': sd20('Seedance 2.0 Mini', ['480p', '720p'], 'free'),
  /** 只收参考图：配额也要跟着把视频与音频归零，否则「参考图」面板上还会显示它能收视频。 */
  'sd1.5': { ...sd20('Seedance 1.5', ['480p', '720p', '1080p'], 'free'),
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
/**
 * 从视频节点入口（局部修改 / 延长）长出来的那个节点锁死这个型号，模型列表点不开。
 * 2.0 系列也做得了编辑与延长，这里仍旧锁 2.5：局部编辑是标记式的，每一处标记都带着一个整数秒，
 * 而 2.0 系列不响应秒数（timestamp: false）—— 锁 2.0 等于让这个入口的主要功能当场失效。
 * 代价是一段 12 秒、2.0 本来接得住的视频从这里进去也会用 2.5，那是为「进去就能标」付的钱。
 */
export const FOCUS_MODEL: Model = 'sd2.5'
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
 * 视频节点上的「局部修改 / 延长视频」入口能不能点：进去之后锁死的那个型号接不接得住这段时长。
 * 放行和进来之后用哪个型号必须是同一条规则，否则会落进「入口亮着、生成按钮灰着」的死角。
 * 接不住就在入口处灰掉并说清楚区间，不要放人进去再用黄字告诉他不行。
 */
export function sourceEntryReason(dur: number | undefined, name = ''): string {
  if (dur == null || !Number.isFinite(dur)) return ''   // 还在读时长，先不拦
  const [lo, hi] = MODEL_CAPABILITIES[FOCUS_MODEL].videoSeconds
  return dur >= lo && dur <= hi ? '' : durRange(lo, hi, name)
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
/** 时长那一栏还没读出来时填的字。素材方块与 @ 引用列表说的是同一件事，不各写一句 */
export const DUR_READING = '读取中'
export const secs = (d: number) => `${d % 1 ? d.toFixed(1) : d} 秒`
/**
 * 这个素材本身合不合规：返回 null 表示收得下。
 * 理由拆成「怎么说」和「说哪几段」两半 —— 同一个原因涉及多段视频时合并素材名，
 * 不把同一句话逐段重复一遍。
 */
export interface Block { key: string; say: (names: string[]) => string }
/**
 * 一整类都不收的型号（Wan 图生视频不收视频）：说「不支持」，不说「最多使用 0 段」。
 * 原因本身就指出了下一步（断开它、或换一个收得下它的型号），所以不再把两条出路写进句子 ——
 * 一句「不支持视频输入」念完就够，后面那半句只是把同一件事换个说法再说一遍。
 * 这是「容纳不下」，不是「超额」：入口（TAB_REQUIREMENT）和生成闸门说的是同一句，所以只写一遍。
 */
export const kindUnsupported = (kind: Mat['kind'], model: Model) =>
  `${MODEL_CAPABILITIES[model].label} 不支持${kind === 'video' ? '视频' : '图片'}输入`
export function matBlock(m: Mat, model: Model): Block | null {
  const kind = m.kind === 'video' ? '视频' : '图片'
  if (m.error) return { key: `error:${m.id}`, say: () => mediaFailure(kind, m.name, m.error!) }
  const cap = MODEL_CAPABILITIES[model]
  if (!cap.quota[m.kind]) return { key: `kind:${m.kind}`, say: () => kindUnsupported(m.kind, model) }
  if (m.kind !== 'video') return null
  if (m.dur == null || !Number.isFinite(m.dur)) return null
  const [lo, hi] = cap.videoSeconds
  // 说的是这件事的门槛本身，不是「哪个型号的哪条规格」：用户听得懂的是秒数。
  // 低于 / 高于所有型号合起来的那条线时，说的是那条线 —— 换型号、换 Tab 都救不回来，
  // 没必要拿当前型号更严的门槛去唬人。
  const range = m.dur < FLOOR || m.dur > CEIL ? [FLOOR, CEIL] : m.dur < lo || m.dur > hi ? [lo, hi] : null
  return range ? { key: `dur:${range[0]}-${range[1]}`, say: (names) => durRange(range[0], range[1], ...names) } : null
}
/**
 * 这个素材用不了的那一句话，空串表示能用 —— 界面按这一句把素材置灰并悬浮说明，
 * 不再等到用户写完提示词、点生成时才用黄字告诉他。
 * 时长还没读出来的先当能用：读到了自然会再判一次。
 */
export const matBlockedReason = (m: Mat, model: Model): string =>
  matBlock(m, model)?.say([m.name]) ?? ''
/** 所有型号合起来的收片区间：4–30 秒。这两条线之外的素材，整个产品都用不了 */
const FLOOR = Math.min(...MODELS.map((m) => MODEL_CAPABILITIES[m].videoSeconds[0]))
const CEIL = Math.max(...MODELS.map((m) => MODEL_CAPABILITIES[m].videoSeconds[1]))
const overSeconds = (total: number, label: string, limit: number) =>
  `视频总时长为 ${secs(total)}，超过 ${label} 的 ${limit} 秒上限`
/**
 * 本次输入合不合规：单段（类型 / 时长 / 读不读得出来）→ 数量 → 合计时长，
 * 按这个顺序返回第一条不合规的原因，空串表示收得下。
 * 不合规就是不合规，不存在「把这一段挪出去、别的照生成」这回事。
 */
export function inputLimits(ids: string[], model: Model, get: MatGet): string {
  const cap = MODEL_CAPABILITIES[model]
  let image = 0, video = 0, seconds = 0
  for (const id of ids) {
    const m = get(id)
    if (!m) continue
    const block = matBlock(m, model)
    if (block) return block.say([m.name])
    if (m.kind === 'image') image++
    // 视频一律整条计入：编辑是整条进整条出，延长也是拿整条去续写，
    // 选区只是写进提示词的时间戳，不改变送进去的素材
    else { video++; seconds += m.dur ?? 0 }
  }
  if (image > cap.quota.image) return `${cap.label} 最多支持 ${cap.quota.image} 张图片，当前已连接 ${image} 张`
  if (video > cap.quota.video) return `${cap.label} 最多支持 ${cap.quota.video} 段视频，当前已连接 ${video} 段`
  // 不说「移除其中一段」：移掉一段也未必就够，该移几段由用户自己看着办
  return seconds > cap.quota.mediaSeconds ? overSeconds(seconds, cap.label, cap.quota.mediaSeconds) : ''
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
 * 编辑 / 延长要用的那一段：有没有、是不是视频。只问到这里为止 ——
 * 时长合不合规不是「进不进得去」：3 秒的视频仍然是一段视频，进得去、落得下，
 * 由生成按钮说它为什么生成不了。入口只认类型与席位（见 TAB_REQUIREMENT）。
 */
function sourceRequirement(c: ConnInfo): string {
  return !c.source || c.source.kind !== 'video' ? NEEDS.video : kindsFit(c)
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
/**
 * 类型这一半：型号整类都不收的素材（只收图的 Wan 上连着一段视频）不是「收得下但超额」，
 * 是这个模式根本容纳不了它，入口就该拦住。拦住不等于死角 ——
 * 当前型号一个模式都容纳不了时，落位会自动换一个容纳得下的型号（store/generator 里的 land）。
 */
const kindsFit = (c: ConnInfo): string => {
  const bad = c.mats.find((m) => !MODEL_CAPABILITIES[c.model].quota[m.kind])
  return bad ? kindUnsupported(bad.kind, c.model) : ''
}
/**
 * 入口这一条：这个模式容纳不容纳得下画布上连着的这些素材 —— 只问类型与席位。
 * 数量超额、单段时长、合计时长一概不在这里说话，那是「收得下但不合规」，归生成闸门
 * （inputLimits）。两件事分在两处，入口才不会替闸门把人挡在门外。
 */
export const TAB_REQUIREMENT: Record<Mode, (c: ConnInfo) => string> = {
  text: (c) => c.total ? '文生视频仅使用文本，断开素材连接后可用' : '',
  // 只接 1–2 张图片：连了视频就进不去，说的仍然是「去连什么」那一句
  frames: (c) => c.video || !c.image ? NEEDS.image
    : c.image > 2 ? `首尾帧最多支持 2 张图片，当前已连接 ${c.image} 张` : '',
  // 参考是所有 Tab 失效时的落脚点：画布上有东西、而且这个型号收得了这些类型就进得去
  ref: (c) => c.total ? kindsFit(c) : NEEDS.any(c),
  // 参考图和全能参考是同一条。只连了视频的 Wan 用户不靠「放他进一个收不下视频的 Tab」兜底，
  // 而是由落位换一个接得住视频的型号接走 —— 那才是他要的下一步
  refImage: (c) => c.total ? kindsFit(c) : NEEDS.any(c),
  // 编辑和延长都容得下多段视频：第一段作源视频，其余照旧是参考素材，与源视频共用视频额度。
  // 「再接一段视频就转去全能参考」是一条落位规则（见 generator.ts 的 leaveSource），不是容纳不下 ——
  // 所以这两个入口不因为第二段视频置灰，用户手动切回来仍然进得去
  edit: (c) => sourceRequirement(c),
  extend: (c) => sourceRequirement(c),
}
export interface TabState { k: Mode; label: string; enabled: boolean; reason: string }
/**
 * 这个型号做得了的那几件事，各自能不能进。
 *
 * 型号没有的能力不摆一个灰 Tab 在那儿：Tab 行说的是「这个型号能做哪几件事」，
 * 灰掉说的是「这件事它会做，但画布上这些素材它容纳不下」—— 两句话不混在同一个位置上。
 * 「这个型号做不了我要的事」由模型列表那一头说（modelBlockedReason 会把它那一行灰掉并给理由），
 * 编辑 / 延长另有视频节点上的入口，从那儿进来会自动换成接得住的型号。
 *
 * 灰不灰只认「容纳不下」这一条（类型与席位），连脚下站着的那个 Tab 也按同一把尺子量 ——
 * 数量超额、时长不合规一律不灰入口：同一条超限在脚下不灰、在别处灰，两头口径就对不上了。
 * 那些话归生成按钮（taskError），它才是拦住这次任务的那一道。
 */
export function tabStates(conn: string[], get: MatGet, model: Model, sourceOf?: (mode: Mode) => string | null): TabState[] {
  const cap = MODEL_CAPABILITIES[model]
  return TABS.filter((t) => cap.genModes.includes(t.k)).map((t) => {
    // 每个 Tab 问的是「它自己那一份草稿会用哪一段」，不是当前 Tab 手上的那一段
    const reason = TAB_REQUIREMENT[t.k](connInfo(conn, get, model, sourceOf?.(t.k) ?? null))
    return { ...t, enabled: !reason, reason }
  })
}
/** 生成闸门那一条：容纳得下（入口）之后，再问收不收得下（类型 / 时长 / 数量 / 合计）。 */
export function modeBlockedReason(mode: Mode, conn: string[], get: MatGet, model: Model, sourceId?: string | null): string {
  const need = TAB_REQUIREMENT[mode](connInfo(conn, get, model, sourceId))
  if (need) return need
  const slots = allocate(emptySlots(), conn, mode, get)
  return inputLimits(activeIds(slots, mode), model, get)
}
/**
 * 这个模式进不进得去 —— 只看「能力 + 容纳得下」，不看「收不收得下」。
 *
 * 进入一个模式不等于已经满足生成条件：一段 3 秒的视频仍然是一段视频，
 * 连进空节点就该落到编辑视频、面板上看得见它，然后由生成按钮说它为什么不合规。
 * 落在哪（fallbackMode / land / setModel）和 Tab 灰不灰读的都是这一条；
 * 能不能生成读的是 modeBlockedReason 那一条完整规则。
 */
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
  for (const m of cap.genModes) { const why = modeBlockedReason(m, conn, get, model); if (why) return why }
  return `${cap.label} 不支持当前素材`
}
/**
 * 当前 Tab 容纳不下时落到哪里：还有素材就去这个型号的参考 Tab，空画布回文生视频；
 * 这个型号也容纳不下时继续往下找，一个都承接不了就返回 null ——
 * 那是一条业务规则（换型号，或留在原地由生成按钮说原因），不是出错。
 *
 * fresh 为真是「空节点刚接进第一份素材」这一种落位，接进来的是什么就去做什么：
 * 有视频落编辑视频 —— 空节点上接一段视频，他要做的十有八九是改这段视频，
 * 不是拿它当参考再生成一条新的；只有图片落首尾帧 —— 同一句话的另一半。
 * 已经在做别的事的节点不走这一条（新接进来的素材不该把人拽进另一件任务里）。
 */
export const fallbackMode = (conn: string[], get: MatGet, model: Model, fresh = false): Mode | null => {
  const { total, video } = countConn(conn, get)
  // 空节点首次接入：只有一段视频时默认去编辑视频（他多半是要改这一段）；
  // 两段以上视频一起摆进来，要的是让它们互相参考，直接去参考 Tab —— 和「再接一段视频就转参考」是同一条
  const order: Mode[] = !total ? ['text', 'refImage', 'ref']
    : fresh && video === 1 ? ['edit', 'frames', 'refImage', 'ref', 'text']
    : fresh ? ['frames', 'refImage', 'ref', 'text'] : ['refImage', 'ref', 'text']
  return order.find((m) => modeAvailable(m, conn, get, model)) ?? null
}

/** 这个落点收不收得下：单段时长 / 数量 / 合计，三条都要过。容纳得下之后才问这一句。 */
export const modeFits = (mode: Mode, conn: string[], get: MatGet, model: Model): boolean =>
  !inputLimits(activeIds(allocate(emptySlots(), conn, mode, get), mode), model, get)

/**
 * 换成这个型号之后会落在哪个 Tab：当前这个还进得去就不动它，进不去才按 fallback 找。
 * setModel 与模型列表上的悬浮说明共用这一条 —— 说的和做的必须是同一件事。
 * 一个都承接不了时留在原地。
 */
export const modeAfterModel = (mode: Mode, conn: string[], get: MatGet, model: Model, sourceId?: string | null): Mode =>
  modeAvailable(mode, conn, get, model, sourceId) ? mode : fallbackMode(conn, get, model) ?? mode

export function activeIds(s: Slots, mode: Mode): string[] {
  if (mode === 'text') return []
  if (mode === 'frames') return [s.slotFirst, s.slotLast].filter((id): id is string => !!id)
  return [...(s.slotEdit && (mode === 'edit' || mode === 'extend') ? [s.slotEdit] : []), ...s.tray]
}

export function accepts(z: Zone, id: string, get: MatGet) {
  const m = get(id)
  return !!m && (z === 'edit' ? m.kind === 'video' : z === 'first' || z === 'last' ? m.kind === 'image' : true)
}
/**
 * 按模式落位：用户明确做过的角色安排原样留着（仍然连着、仍然有效的那些），
 * 空出来的角色才按连接顺序补 —— 换过首尾帧再切走切回来，不该被重排回连接顺序。
 */
export function allocate(prev: Slots, conn: string[], mode: Mode, get: MatGet, added = conn): Slots {
  const valid = conn.filter((id) => !!get(id))
  const keep = (id: string | null) => id && valid.includes(id) ? id : null
  // 角色在这个模式下不算有效输入时（编辑里的首尾帧、参考里的源视频），素材照旧摆在参考区 ——
  // 角色留着是为了切回来时原样恢复，所以换回来的那一刻要把它从参考区里摘掉，否则同一段素材数了两遍
  const inSlots = mode === 'frames' ? [prev.slotFirst, prev.slotLast]
    : mode === 'edit' || mode === 'extend' ? [prev.slotEdit] : []
  const s: Slots = {
    slotEdit: keep(prev.slotEdit), slotFirst: keep(prev.slotFirst), slotLast: keep(prev.slotLast),
    tray: prev.tray.filter((id) => valid.includes(id) && !inSlots.includes(id)), unused: [],
  }
  // 首帧空出必须由尾帧递补：首帧是必填的那一个，空着这件事就做不成。
  // 剪断首帧留一个洞、把尾帧晾在后面，等于让用户自己去把它挪上来
  if (mode === 'frames' && !s.slotFirst && s.slotLast) { s.slotFirst = s.slotLast; s.slotLast = null }
  const candidates = added.filter((id) => valid.includes(id) && !activeIds(s, mode).includes(id))
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
  // 从参考切过来时素材早就在参考区里，没有「新连进来的」可补：源视频角色还空着就从那儿提一段上来。
  // 「有视频才切得过去」，切过去就该拿着它，不该落在一个空槽上。
  if ((mode === 'edit' || mode === 'extend') && !s.slotEdit) {
    const up = s.tray.find((id) => get(id)?.kind === 'video')
    if (up) { s.slotEdit = up; s.tray = s.tray.filter((id) => id !== up) }
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
  else s.tray.push(id)
  s.unused = [...new Set(s.unused)].filter((mid) => mid !== id)
  return s
}
/** 把某一份素材从它现在占着的角色上摘下来。只有替换会用到它：素材退出本次输入走的是剪断连接那条路。 */
function remove(prev: Slots, id: string): Slots {
  return { slotEdit: prev.slotEdit === id ? null : prev.slotEdit,
    slotFirst: prev.slotFirst === id ? null : prev.slotFirst, slotLast: prev.slotLast === id ? null : prev.slotLast,
    tray: prev.tray.filter((mid) => mid !== id), unused: [...new Set([...prev.unused, id])] }
}
export type PromptSeg = { t: string }
export function promptHint(mode: Mode, hasLast = false): PromptSeg[] {
  const hints: Record<Mode, string> = {
    text: '描述你想要生成的画面', frames: hasLast ? '描述从首帧到尾帧之间发生的变化' : '描述从首帧开始的动作与镜头变化',
    ref: '描述你想要生成的画面，输入 @ 引用参考素材',
    refImage: '描述你想要生成的画面，输入 @ 引用参考图', edit: '描述你想要修改的内容',
    extend: '描述延长部分的画面与动作',
  }
  return [{ t: hints[mode] }]
}
