import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
interface Props {
  children: ReactNode; onClose: () => void; label: string
  anchor?: RefObject<HTMLElement>; className?: string; modal?: boolean
  onMouseEnter?: () => void; onMouseLeave?: () => void; passive?: boolean
  /** 气泡形态：在锚点上居中，并画一个指向锚点的小尖角。 */
  tail?: boolean
}
/** 所有浮层按视窗避让；交互浮层支持 Escape、焦点圈定及关闭后焦点恢复。 */
export default function Overlay({ children, onClose, label, anchor, className = '', modal = false, passive = false, tail = false, onMouseEnter, onMouseLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  const [pos, setPos] = useState({ left: 12, top: 12 })
  const [arrow, setArrow] = useState<{ side: 'down' | 'up'; x: number } | null>(null)
  useLayoutEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    const box = ref.current!
    const place = () => {
      if (!anchor?.current) return
      const a = anchor.current.getBoundingClientRect(); const r = box.getBoundingClientRect()
      const gap = tail ? 11 : 8
      const above = a.top - r.height - gap >= 12
      const top = above ? a.top - r.height - gap : Math.min(a.bottom + gap, window.innerHeight - r.height - 12)
      const want = tail ? a.left + a.width / 2 - r.width / 2 : a.left
      const left = Math.max(12, Math.min(want, window.innerWidth - r.width - 12))
      setPos({ left, top: Math.max(12, top) })
      // 尖角贴着锚点中心，浮层被视窗推开时也不会指偏
      if (tail) setArrow({ side: above ? 'down' : 'up', x: Math.max(18, Math.min(a.left + a.width / 2 - left, r.width - 18)) })
    }
    place()
    const observer = new ResizeObserver(place); observer.observe(box)
    if (!passive) (box.querySelector<HTMLElement>('button:not(:disabled),textarea,input,[tabindex="0"]') ?? box).focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current() }
      if (e.key !== 'Tab' || passive) return
      const focus = [...box.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,video,[tabindex="0"]')].filter((el) => el.getClientRects().length)
      const first = focus[0], last = focus[focus.length - 1]
      if (!first) { e.preventDefault(); box.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    const outside = (e: PointerEvent) => { if (!box.contains(e.target as Node) && !anchor?.current?.contains(e.target as Node)) close.current() }
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => {
      observer.disconnect(); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true)
      if (!passive && restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [anchor, passive, tail])
  const content = <div ref={ref} role={passive ? undefined : 'dialog'} aria-modal={modal || undefined} aria-label={label} tabIndex={-1}
    className={`overlay nodrag nowheel ${className}`} style={modal ? undefined : { position: 'fixed', ...pos }}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
    onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    {children}
    {tail && arrow && <span className="overlay-tail" data-side={arrow.side} style={{ left: arrow.x }} aria-hidden />}
  </div>
  return createPortal(modal ? <div className="modal-backdrop">{content}</div> : content, document.body)
}
