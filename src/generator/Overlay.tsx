import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
interface Props {
  children: ReactNode; onClose: () => void; label: string
  anchor?: RefObject<HTMLElement>; className?: string; modal?: boolean
  onMouseEnter?: () => void; onMouseLeave?: () => void; passive?: boolean
  /** 气泡形态：在锚点上居中，并画一个指向锚点的小尖角。 */
  tail?: boolean
  /**
   * 贴锚点的侧边说，不压在它正上方 —— 弹窗里那种一行挨一行的列表（模型列表），
   * 说明盖在上一行头上就成了「挡着我要看的东西」。右边放不下自动翻到左边。
   */
  side?: boolean
  /** 只居中，不画尖角：悬浮放大给的就是那张画面本身，尖角是外框的一部分，得一起去掉。 */
  center?: boolean
}
/** 所有浮层按视窗避让；交互浮层支持 Escape、焦点圈定及关闭后焦点恢复。 */
export default function Overlay({ children, onClose, label, anchor, className = '', modal = false, passive = false, tail = false, side = false, center = false, onMouseEnter, onMouseLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  const [pos, setPos] = useState({ left: 12, top: 12, above: false })
  const [arrow, setArrow] = useState<{ side: 'down' | 'up' | 'left' | 'right'; x?: number; y?: number } | null>(null)
  useLayoutEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    const box = ref.current!
    const place = () => {
      if (!anchor?.current) return
      const a = anchor.current.getBoundingClientRect()
      /*
       * 量自己的尺寸用 offsetWidth/Height，不用 getBoundingClientRect ——
       * 入场动画里带着 scale(.88)，rect 量到的是缩小后的那一下，浮层就贴着锚点摆得太低；
       * 动画一结束它长回原大小，正好压住锚点的上沿，鼠标一碰就被挡出来，
       * 悬浮卡于是开了又关地闪。offset 系列是布局尺寸，不受 transform 影响。
       */
      const r = { width: box.offsetWidth, height: box.offsetHeight }
      if (side) {
        // 优先靠右；右边到了视窗边上就翻到左边，两边都放不下才退回压在上面那套
        const right = a.right + 11, left = a.left - 11 - r.width
        const fits = right + r.width <= window.innerWidth - 12 || left < 12
        const x = fits ? right : left
        if (x >= 12 && x + r.width <= window.innerWidth - 12) {
          const top = Math.max(12, Math.min(a.top + a.height / 2 - r.height / 2, window.innerHeight - r.height - 12))
          setPos({ left: x, top, above: false })
          setArrow({ side: fits ? 'left' : 'right', y: Math.max(18, Math.min(a.top + a.height / 2 - top, r.height - 18)) })
          return
        }
      }
      const gap = tail ? 11 : center ? 9 : 8
      const above = a.top - r.height - gap >= 12
      const top = above ? a.top - r.height - gap : Math.min(a.bottom + gap, window.innerHeight - r.height - 12)
      const want = tail || center ? a.left + a.width / 2 - r.width / 2 : a.left
      const left = Math.max(12, Math.min(want, window.innerWidth - r.width - 12))
      setPos({ left, top: Math.max(12, top), above })
      // 尖角贴着锚点中心，浮层被视窗推开时也不会指偏
      if (tail || side) setArrow({ side: above ? 'down' : 'up', x: Math.max(18, Math.min(a.left + a.width / 2 - left, r.width - 18)) })
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
  }, [anchor, passive, tail, side, center])
  const content = <div ref={ref} role={passive ? undefined : 'dialog'} aria-modal={modal || undefined} aria-label={label} tabIndex={-1}
    // 浮层落在锚点上方还是下方，自己的尖角要跟着换边
    data-above={pos.above || undefined}
    className={`overlay nodrag nowheel ${className}`} style={modal ? undefined : { position: 'fixed', left: pos.left, top: pos.top }}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
    onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    {children}
    {(tail || side) && arrow && <span className="overlay-tail" data-side={arrow.side}
      style={arrow.y == null ? { left: arrow.x } : { top: arrow.y }} aria-hidden />}
  </div>
  return createPortal(modal ? <div className="modal-backdrop">{content}</div> : content, document.body)
}
