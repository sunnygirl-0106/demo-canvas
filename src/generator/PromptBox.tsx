import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Mat } from './materialLayout'
import { fmt } from './materialLayout'
import { CARET, docWritten, putAtCaret, segKey, type Seg } from './promptDoc'
import Overlay from './Overlay'
import { useCanvas } from '../store/canvas'
import { IcSearch } from '../ui/icons'
interface Props {
  /** 这一句的内容：文字段和标签。 */
  doc: Seg[]
  /**
   * 重建标志。打字不改它 —— 一改就把这块可编辑区整个重新挂一遍，光标会回到末尾。
   * 所以只有「起头」「插入标签」「换了模式」这种由外部改动内容的时刻才让它变。
   */
  ver: string
  onDoc: (doc: Seg[]) => void
  /** 一枚标签渲染成什么。文字由这里自己渲染。 */
  renderSeg: (s: Seg) => ReactNode
  placeholder: string
  mats: Mat[]
  /** 从 @ 面板挑了一段素材：整份句子（标签已经插在光标那一点）连同它一起交出去 */
  onInsert?: (doc: Seg[], mat: Mat) => void
  /**
   * 这个模式上面没有素材行（文生视频）。那一截高度归可编辑区 ——
   * 面板的上下沿不跟着 Tab 变，句子还是从最上面一行起头，只是底下能写的地方更宽裕。
   */
  rowless?: boolean
  /**
   * 删不掉的那几枚标签（按 k 点名）。专注态的句首就是这句话的主语，
   * 删了这句话不成立 —— 退格删掉之后在「读回 DOM」那一步按原位补回来。
   */
  locked?: string[]
  /** 补回来之后内容和 DOM 对不上了，可编辑区得重挂一遍 —— 由外面的 ver 负责。 */
  onRestore?: () => void
}
/**
 * 提示词框。这里不是「灰色模板 + 一个输入框」，而是一整句可以编辑的话：
 * 「把」「中」「时间段里的」这些字和用户自己打的字一样能删能改，标签则是原子，退格一次整枚消失。
 *
 * 做法上是一块 contentEditable：React 只在 ver 变化时把内容挂一遍，打字期间一律不碰 DOM
 * （children 用 useMemo 锁住引用，React 会整棵跳过）—— 否则每敲一个字光标都会跳回去。
 * 每次输入都把 DOM 读回一份 doc，谁被删了、谁被挪了，读一遍就知道。
 */
export default function PromptBox({ doc, ver, onDoc, renderSeg, placeholder, mats, onInsert, rowless, locked, onRestore }: Props) {
  const ed = useRef<HTMLDivElement>(null); const wrap = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  /** 呼出时的光标位置。挑完素材要回到这里，把触发菜单的那个 @ 一起换掉。 */
  const at = useRef<Range | null>(null)
  const [q, setQ] = useState('')
  /** 解析时要按 DOM 里的身份证把标签认回来，认的是最新这一份 */
  const live = useRef(doc); live.current = doc
  /** 呼出面板里现在能看见的几行：按名字过滤，搜不到就说搜不到，不留一片空白。 */
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? mats.filter((m) => m.name.toLowerCase().includes(k)) : mats
  }, [mats, q])

  /** 把可编辑区里现在的样子读成一份 doc：文字归文字，标签按身份证认回原来那一枚。 */
  const read = (): Seg[] => {
    const box = ed.current
    if (!box) return live.current
    const known = new Map(live.current.filter((s) => s.t !== 'text').map((s) => [(s as { k: string }).k, s]))
    const out: Seg[] = []
    const push = (v: string) => {
      if (!v) return
      const last = out[out.length - 1]
      if (last?.t === 'text') last.v += v; else out.push({ t: 'text', v })
    }
    const walk = (node: Node) => {
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE) { push(n.nodeValue ?? ''); continue }
        if (!(n instanceof HTMLElement)) continue
        const seg = n.dataset.seg && known.get(n.dataset.seg)
        if (seg) { out.push({ ...seg }); continue }
        if (n.tagName === 'BR') { push('\n'); continue }
        // 粘贴进来的结构一律降成纯文字；换行的块级元素补一个换行
        if (getComputedStyle(n).display !== 'inline' && out.length) push('\n')
        walk(n)
      }
    }
    walk(box)
    return out
  }
  /**
   * 锁定的标签被退格删掉了就按原位补回来：位置取它在上一份句子里的下标。
   * 「删不掉」没法靠 CSS —— contentEditable 里退格已经发生了，只能在读回来这一步还原。
   */
  const restore = (next: Seg[]): Seg[] => {
    if (!locked?.length) return next
    const has = new Set(next.filter((s) => s.t !== 'text').map((s) => (s as { k: string }).k))
    const gone = locked.filter((k) => !has.has(k))
    if (!gone.length) return next
    const out = [...next]
    for (const k of gone) {
      const seg = live.current.find((s) => s.t !== 'text' && (s as { k: string }).k === k)
      const at = live.current.findIndex((s) => s === seg)
      if (seg) out.splice(Math.min(at, out.length), 0, seg)
    }
    onRestore?.()
    return out
  }
  /** 占位文案的显隐直接改 DOM：打字期间这块区域不重新渲染，交给 React 就慢半拍 */
  const sync = () => {
    const next = restore(read())
    ed.current?.toggleAttribute('data-empty', !docWritten(next))
    onDoc(next)
    return next
  }
  /** 在光标处插入一段文字（@ 引用走这条路） */
  const type = (text: string) => {
    ed.current?.focus()
    document.execCommand('insertText', false, text)
    sync()
  }
  /**
   * 刚落下的那枚标签的身份证。插完标签整块可编辑区会重挂一遍，光标跟着掉到外面 ——
   * 记着是哪一枚，重挂完把光标送回它后面，用户接着打字就是接着这一句往下写。
   * 用 useLayoutEffect 而不是 rAF：这一句得在浏览器绘制之前跑完，
   * 否则中间隔着一帧，手快的人那一帧里敲的字会掉在框外面。
   */
  const landed = useRef<string | null>(null)
  useLayoutEffect(() => {
    const k = landed.current
    landed.current = null
    const box = ed.current
    const chip = k && box?.querySelector(`[data-seg="${k}"]`)
    if (!box || !chip) return
    box.focus()
    const r = document.createRange()
    r.setStartAfter(chip); r.collapse(true)
    const sel = document.getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
  }, [ver])
  /**
   * 挑中一段素材：句子里落下的是一枚标签，不是 @名字 这几个字 ——
   * 缩略图 + 名字一眼认得出是哪一段（名字是随机 id，光看字认不出），
   * 而 @ 只是「怎么把它选进来的」，选完就不必再摆在句子里。
   * 落点交给浏览器：先在光标处插一个占位字符，读回来再按它切开。
   */
  const insert = (mat: Mat) => {
    setMenu(false)
    // 挑中的那一行连同菜单一起消失，它的 onMouseLeave 再也不会来 —— 不在这儿手动熄掉，
    // 「悬浮在这段素材上」就一直挂着：画布上那个节点一直亮着，句子里刚落下的这一枚
    // 也一直停在 hover 的那一档灰，看着就像它比旁边几枚特殊
    useCanvas.getState().setHoverMat(null)
    // 焦点这会儿在面板里，先把光标放回呼出时的那一点，再删掉它前面的 @ 一起替换
    ed.current?.focus()
    const r = at.current
    if (r) { const sel = document.getSelection(); sel?.removeAllRanges(); sel?.addRange(r) }
    document.execCommand('delete')
    document.execCommand('insertText', false, CARET)
    const k = segKey()
    landed.current = k
    onInsert?.(putAtCaret(read(), { t: 'ref', k, id: mat.id, name: mat.name }), mat)
  }
  /**
   * 内容在 ver 不变时保持同一批元素引用：React 见到相同引用会整棵跳过，
   * 用户敲进去的字就不会被 React 的 vdom「纠正」回上一次的样子。
   */
  const body = useMemo(() => doc.map((s, i) => s.t === 'text'
    ? <Fragment key={`t${i}`}>{s.v}</Fragment>
    // 标签整枚不可编辑：退格删掉的是一整枚，删不出半张缩略图
    : <span key={s.k} data-seg={s.k} contentEditable={false}>{renderSeg(s)}</span>),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ver])

  return <div className={`prompt-editor nodrag nowheel${rowless ? ' rowless' : ''}`} ref={wrap}>
    <div className="prompt-field" onPointerDown={(e) => { if (e.target === e.currentTarget) ed.current?.focus() }}>
      <div key={ver} ref={ed} className="prompt-input" contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline aria-label="修改或生成要求"
        // 起过头的句子后面接占位文案，中间空一格；空句子则顶格，占位文案就落在光标那一点上
        data-ph={doc.length ? ` ${placeholder}` : placeholder}
        data-empty={!docWritten(doc) || undefined}
        onInput={() => {
          const sel = document.getSelection()
          const before = sel?.focusNode?.nodeValue?.slice(0, sel.focusOffset) ?? ''
          sync()
          const open = before.endsWith('@')
          if (open) { at.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null; setQ('') }
          setMenu(open)
        }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setMenu(false) }}
        // 粘贴一律取纯文字：别人页面上的样式和结构进了这一句只会碍事
        onPaste={(e) => { e.preventDefault(); type(e.clipboardData.getData('text/plain')) }}>
        {body}
      </div>
    </div>
    {menu && <Overlay label="引用已连接资产" anchor={wrap} className="asset-picker" onClose={() => setMenu(false)}>
      <div className="asset-search">
        <IcSearch size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索节点或素材" aria-label="搜索节点或素材"
               onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); insert(hits[0]) } }} />
      </div>
      <div className="asset-list">
        {hits.map((m, i) => <button key={m.id} className="asset-option" style={{ animationDelay: `${i * 26}ms` }}
                                    onMouseEnter={() => useCanvas.getState().setHoverMat(m.id)}
                                    onMouseLeave={() => useCanvas.getState().setHoverMat(null)}
                                    onClick={() => insert(m)}>
          {/* 一行只留三样：一张认得出的正方形缩略图、名字、行末的时长。素材名是随机 id 的时候，认的是图 */}
          <span className="asset-shot">{m.thumb && <img src={m.thumb} alt="" />}</span>
          <span className="asset-name">{m.name}</span>
          <span className="asset-dur">{m.kind === 'video' ? (m.dur != null ? fmt(m.dur) : '读取中') : ''}</span>
        </button>)}
        {!hits.length && <p className="helper">{mats.length ? '没有匹配的素材' : '当前模式没有可引用的素材'}</p>}
      </div>
    </Overlay>}
  </div>
}
