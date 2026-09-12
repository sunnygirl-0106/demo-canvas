import { useRef, useState, type ReactNode } from 'react'
import type { Mat, PromptSeg } from './materialLayout'
import { fmt } from './materialLayout'
import Overlay from './Overlay'
import { useCanvas } from '../store/canvas'
import MediaPreview from './MediaPreview'
interface Props { value: string; onChange: (v: string) => void; placeholder: PromptSeg[]; lit: number; mats: Mat[]; context?: ReactNode; onReference?: (mat: Mat) => void; hints?: string[] }
export default function PromptBox({ value, onChange, placeholder, mats, context, onReference, hints }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null); const wrap = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<Mat | null>(null)
  const hover = useCanvas((s) => s.hoverMat)
  const [menu, setMenu] = useState(false); const cursor = useRef(0)
  const chips = mats.filter((m) => value.includes(`@${m.name}`))
  const insert = (mat: Mat) => {
    const before = value.slice(0, cursor.current).replace(/@$/, '')
    const token = `@${mat.name} `
    onChange(before + token + value.slice(cursor.current)); onReference?.(mat); setMenu(false)
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(before.length + token.length, before.length + token.length) })
  }
  /** 灵感词只做追加，不覆盖已写内容。 */
  const addHint = (h: string) => {
    if (value.includes(h)) return
    const base = value.trimEnd().replace(/[，,]$/, '')
    onChange(base ? `${base}，${h}` : h)
    requestAnimationFrame(() => ta.current?.focus())
  }
  return <div className="prompt-editor nodrag nowheel" ref={wrap}>
    {context && <div className="prompt-context">{context}</div>}
    {!!hints?.length && <div className="prompt-hints">
      {hints.map((h) => <button key={h} className="hint-chip" onClick={() => addHint(h)}>{h}</button>)}
    </div>}
    <textarea ref={ta} aria-label="修改或生成要求" value={value} placeholder={placeholder.map((s) => s.t).join('')}
      onChange={(e) => { cursor.current = e.target.selectionStart; onChange(e.target.value); setMenu(e.target.value.slice(0, cursor.current).endsWith('@')) }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setMenu(false) }} />
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
