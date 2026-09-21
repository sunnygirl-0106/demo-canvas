import { rangeLabel, regionLabel, type MarkGroup, type MarkRegion, type TimeRange } from './marks'
/**
 * 提示词框里的那句话，就是一份可编辑的文档：文字段和标签交替排列。
 *
 * 「把」「中」「时间段里的」这些字是普通文字 —— 能删、能改、能在中间插字，和用户自己打的字没有区别；
 * 标签（素材、时间段、标记）是原子：退格一次整枚消失，但不会被删成半张缩略图。
 * 这一句读下来就是这次任务的全部意思，所以任务记录里的 prompt 直接由它渲染出来。
 */
export type Seg =
  | { t: 'text'; v: string }
  /** 这一句在说的那段素材 */
  | { t: 'mat'; k: string }
  /** 延长的方向与秒数 */
  | { t: 'dur'; k: string }
  /** 某一次圈选选的那一段时间 */
  | { t: 'range'; k: string; g: string; range: TimeRange }
  /** 某一次圈选里的一处标记 */
  | { t: 'mark'; k: string; g: string; region: MarkRegion }
  /** 打 @ 引来的另一段素材 */
  | { t: 'ref'; k: string; id: string; name: string }
export type Chip = Exclude<Seg, { t: 'text' }>

/** 标签在 DOM 里的身份证：解析时靠它把节点认回对应的那一枚，删掉的自然就不在了。 */
let seq = 0
export const segKey = () => `s${++seq}`

/**
 * 光标那一点的占位字符。
 * contentEditable 里光标停在哪，只有浏览器自己知道 —— 读回来的那份文档上没有这个信息。
 * 所以先让浏览器在光标处插一个字符，再把读回来的文档按它切开：标签就落在原来光标停的地方。
 * 用 U+FEFF（零宽不换行空格）：键盘上打不出来，宽度为零不会让句子跳一下，
 * 而且是 execCommand 真肯插进去的字符 —— U+0000 会被浏览器直接丢掉，读回来就找不着了。
 */
export const CARET = '\uFEFF'
/** 把一枚标签放到占位字符那一点，顺手把占位字符吃掉。找不到就接在句尾。 */
export function putAtCaret(doc: Seg[], chip: Chip): Seg[] {
  const out: Seg[] = []
  let done = false
  for (const s of doc) {
    if (done || s.t !== 'text' || !s.v.includes(CARET)) { out.push(s); continue }
    const i = s.v.indexOf(CARET)
    if (s.v.slice(0, i)) out.push({ t: 'text', v: s.v.slice(0, i) })
    out.push(chip)
    const rest = s.v.slice(i + CARET.length)
    if (rest) out.push({ t: 'text', v: rest })
    done = true
  }
  return done ? out : [...doc, chip]
}

/** 替用户起的头。删光了不会自动送回来 —— 它只是开头，不是模板。 */
export const seedDoc = (mode: 'edit' | 'extend'): Seg[] => mode === 'edit'
  ? [{ t: 'text', v: '把' }, { t: 'mat', k: segKey() }, { t: 'text', v: '的' }]
  : [{ t: 'text', v: '从' }, { t: 'mat', k: segKey() }, { t: 'dur', k: segKey() }, { t: 'text', v: '，' }]

/** 一次圈选的产物变成句子里的几枚标签：一段时间 + 它管着的那几处。 */
export function groupSegs(g: MarkGroup): Seg[] {
  const out: Seg[] = []
  if (g.range) {
    out.push({ t: 'range', k: segKey(), g: g.id, range: g.range })
    // 标签上那个片段图标已经说了「这是视频里的一截」，句子里不再写「时间段」三个字；
    // 后面还跟着几处标记时才补一个「里的」，把两枚标签连起来
    if (g.regions.length) out.push({ t: 'text', v: '里的' })
  }
  // 标签之间不塞空格：挨着的两枚由排版分开，句子里不留这个字符
  g.regions.forEach((region) => out.push({ t: 'mark', k: segKey(), g: g.id, region }))
  return out
}
/**
 * 把当前这一套标记写回句子里。节点上的控件是常驻的，用户改的永远是同一组，
 * 所以这里是「换」不是「追加」：句子里已有的那几枚整段换掉（连中间那个「里的」一起），
 * 一枚都还没有就接在素材标签后面（用「中」连）—— 素材标签也被删掉了，就补在句尾。
 * 插完之后用户照样可以把这些字改掉，这里只负责给一个读得通的起点。
 */
export function replaceGroup(doc: Seg[], g: MarkGroup): Seg[] {
  const own = (s: Seg) => (s.t === 'mark' || s.t === 'range') && s.g === g.id
  const flags = doc.map(own)
  /**
   * 沿用原来那几枚标签的身份证。圈好的框拖着改大小时，句子里的标签念出来还是同一句 ——
   * 身份证不变，可编辑区就不必重挂，光标也不会被打回句尾。
   */
  const reuse = doc.filter(own).map((s) => (s as { k: string }).k)
  let n = 0
  const segs: Seg[] = groupSegs(g).map((s) => {
    if (s.t === 'text') return s
    const k = reuse[n++]
    return k ? { ...s, k } : s
  })
  const first = flags.indexOf(true)
  if (first >= 0) {
    const head = doc.slice(0, first)
    // 整组摘光了（切回「整段视频」）：把当初为它补的那个「中」一起带走，句子不留一个悬着的连接词
    const prev = head[head.length - 1]
    if (!segs.length && prev?.t === 'text' && prev.v.endsWith('中')) head[head.length - 1] = { t: 'text', v: prev.v.slice(0, -1) }
    return [...head, ...segs, ...doc.slice(flags.lastIndexOf(true) + 1)]
  }
  if (!segs.length) return doc
  const mat = doc.map((s) => s.t === 'mat').lastIndexOf(true)
  if (mat < 0) return [...doc, ...segs]
  return [...doc.slice(0, mat + 1), { t: 'text', v: '中' }, ...segs, ...doc.slice(mat + 1)]
}

/**
 * 句子里现在还留着哪些标记 —— 标签被删掉的那一处，这次任务里也就没有了。
 * 组只是「这一段时间管着这几处」的容器，所以按标签上的组号还原回去，顺序随句子。
 */
export function marksOf(doc: Seg[]): MarkGroup[] {
  const out: MarkGroup[] = []
  const at = new Map<string, MarkGroup>()
  const grab = (id: string) => {
    let g = at.get(id)
    if (!g) { g = { id, regions: [], range: null }; at.set(id, g); out.push(g) }
    return g
  }
  for (const s of doc) {
    if (s.t === 'range') grab(s.g).range = s.range
    else if (s.t === 'mark') grab(s.g).regions.push(s.region)
  }
  return out
}
/** 换源之后这些标签指的画面已经不存在了，整批摘掉，文字留着。 */
export const stripMarks = (doc: Seg[]): Seg[] => doc.filter((s) => s.t !== 'mark' && s.t !== 'range')
/** 一个字、一枚标签都没有：这时候才轮到占位文案出场。 */
export const docEmpty = (doc: Seg[]) => !doc.some((s) => s.t !== 'text' || s.v.trim())

interface Ctx { name?: string; direction?: 'before' | 'after' | null; duration?: number }
/** 标签读成什么。任务记录里存的那句 prompt，就是把这一句原样念出来。 */
export function segText(s: Seg, ctx: Ctx): string {
  switch (s.t) {
    case 'text': return s.v
    case 'mat': return `视频 ${ctx.name ?? ''}`.trim()
    // 方向还没选的时候不替用户说「向后」：句子不能白纸黑字写着一个他没点过的选择
    case 'dur': return `${ctx.direction === 'before' ? '向前延长' : ctx.direction === 'after' ? '向后延长' : '延长'} ${ctx.duration ?? 0}s`
    case 'range': return rangeLabel(s.range)
    case 'mark': return regionLabel(s.region)
    // 标签上不写 @（那是「怎么把它选进来的」，不是它是什么），念出来要写：
    // @名字 是这句话交给模型时指认素材的写法，任务记录里也按它对上是哪一段
    case 'ref': return `@${s.name}`
  }
}
/**
 * 念出来的那一句。标签左右的那一个空格属于排版（CSS 外边距），句子里不存这个字符 ——
 * 存了，用户删掉一枚标签、或者接着往标签后面打字时，还得自己去退一个看不见的空格。
 * 所以只在念的时候补：标签和它的邻居之间补一个，挨着标点或已有空白的地方不补。
 */
const TIGHT = /[\s，。、；：！？,.;:!?（）()「」【】]/
export function docText(doc: Seg[], ctx: Ctx): string {
  let out = ''
  let prev: Seg | null = null
  for (const s of doc) {
    const t = segText(s, ctx)
    if (!t) continue
    // 两段纯文字之间是用户自己打的字，原样接上；只有标签才需要这个空格
    const apart = !prev || prev.t !== 'text' || s.t !== 'text'
    const gap = out && apart && !TIGHT.test(out[out.length - 1]) && !TIGHT.test(t[0]) ? ' ' : ''
    out += gap + t
    prev = s
  }
  return out
}
/**
 * 用户到底有没有写要求。
 * 起头那几个字（把、从、中、和、的、时间段里的…）是替他写的，不算数 ——
 * 去掉它们和 @ 引用之后还剩字，才叫「说清楚了要改什么」。
 * 顺带把这几个字从他自己写的句子里也削掉：判空而已，剩一个字就够，不必精确还原。
 */
const FILLER = ['时间段里的', '时间段', '里的', '把', '从', '中', '和', '的', '，', ',']
export function docWritten(doc: Seg[], fallback = ''): string {
  // 还没起头的那些模式（文生视频、首尾帧…）句子就是一段纯文字，退回去看那一段
  let t = doc.length ? doc.filter((s) => s.t === 'text').map((s) => (s as { v: string }).v).join(' ') : fallback
  for (const f of FILLER) t = t.split(f).join(' ')
  return t.replace(/@[A-Z]{4}\b/g, '').trim()
}
