import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Mat, PromptSeg } from './materialLayout'
import { fmt } from './materialLayout'
import Overlay from './Overlay'
import { useCanvas } from '../store/canvas'
import MediaPreview from './MediaPreview'
interface Props { value: string; onChange: (v: string) => void; placeholder: PromptSeg[]; lit: number; mats: Mat[]; context?: ReactNode; onReference?: (mat: Mat) => void }
/** 前缀和正文之间留一个字的空隙，别让文字贴着「，」起笔。 */
const CTX_GAP = 6
export default function PromptBox({ value, onChange, placeholder, mats, context, onReference }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null); const wrap = useRef<HTMLDivElement>(null)
  const ctx = useRef<HTMLDivElement>(null); const ctxEnd = useRef<HTMLSpanElement>(null)
  const [preview, setPreview] = useState<Mat | null>(null)
  const hover = useCanvas((s) => s.hoverMat)
  const [menu, setMenu] = useState(false); const cursor = useRef(0)
  const chips = mats.filter((m) => value.includes(`@${m.name}`))
  /**
   * 「从 XX 向后延长 6s，」是这句话的开头，用户接着往下写。
   * 量出前缀最后一行的收笔位置，首行缩进到那里、上方留出前缀占掉的行数，
   * 正文就和前缀连成一句，换行后回到整行宽度。
   */
  const [inset, setInset] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    const box = ctx.current, end = ctxEnd.current
    if (!box || !end) { setInset((p) => (p.x || p.y ? { x: 0, y: 0 } : p)); return }
    const measure = () => {
      const a = end.getBoundingClientRect(), b = box.getBoundingClientRect()
      const next = { x: Math.round(a.left - b.left) + CTX_GAP, y: Math.round(a.top - b.top) }
      setInset((p) => (p.x === next.x && p.y === next.y ? p : next))
    }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(box)
    return () => ro.disconnect()
  }, [context])
  /** 高度跟着内容走，省掉右下角那个拉伸把手。 */
  useLayoutEffect(() => {
    const el = ta.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }, [value, inset.x, inset.y])
  const insert = (mat: Mat) => {
    const before = value.slice(0, cursor.current).replace(/@$/, '')
    const token = `@${mat.name} `
    onChange(before + token + value.slice(cursor.current)); onReference?.(mat); setMenu(false)
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(before.length + token.length, before.length + token.length) })
  }
  return <div className="prompt-editor nodrag nowheel" ref={wrap}>
    <div className="prompt-field" onPointerDown={(e) => { if (e.target === e.currentTarget) ta.current?.focus() }}>
      {context && <div className="prompt-context" ref={ctx}>{context}<span className="prompt-context-end" ref={ctxEnd} aria-hidden>&#8203;</span></div>}
      <textarea ref={ta} aria-label="修改或生成要求" value={value} placeholder={placeholder.map((s) => s.t).join('')}
        style={{ textIndent: inset.x, paddingTop: inset.y }}
        onChange={(e) => { cursor.current = e.target.selectionStart; onChange(e.target.value); setMenu(e.target.value.slice(0, cursor.current).endsWith('@')) }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setMenu(false) }} />
    </div>
    {!!chips.length && <div className="prompt-tools">{chips.map((m) => <button key={m.id} className={`reference-chip${hover === m.id ? ' lit' : ''}`} onMouseEnter={() => useCanvas.getState().setHoverMat(m.id)} onMouseLeave={() => useCanvas.getState().setHoverMat(null)} onFocus={() => useCanvas.getState().setHoverMat(m.id)} onBlur={() => useCanvas.getState().setHoverMat(null)} onClick={() => setPreview(m)}>@{m.name}</button>)}</div>}
    {preview && <MediaPreview mat={preview} onClose={() => setPreview(null)} />}
    {menu && <Overlay label="引用已连接资产" anchor={wrap} className="asset-picker" onClose={() => setMenu(false)}>
      <div className="popover-heading">本次使用的素材</div>
      {!mats.length && <p className="helper">当前模式没有可引用的素材</p>}
      {mats.map((m) => <button key={m.id} className="asset-option" onClick={() => insert(m)}>
        <img src={m.thumb} alt="" /><span><strong>{m.name}</strong><small>{m.kind === 'video' ? `视频 · ${m.dur != null ? fmt(m.dur) : '读取中'}` : '图片'}</small></span><span className="asset-at">@{m.name}</span>
      </button>)}
    </Overlay>}
  </div>
}
