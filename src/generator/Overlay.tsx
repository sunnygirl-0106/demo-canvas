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
  /**
   * 锁死在右边：右边放不下也不翻到左边，贴着视窗右缘往回收。
   * 挂在画布节点身上的那只气泡（全部版本）要这个 —— 节点在画布上到处都是，
   * 方向跟着位置变，每开一次都得重新找「它是从哪条边长出来的」；
   * 一律朝右，这句话就只说一次。
   *
   * 右边放不下不是往回收，而是让锚点让路：差多少像素通过 onShift 报出去，
   * 外面把画布推同样多，气泡就仍旧咬在节点右侧那 11px 的缝外 —— 见 onShift。
   */
  sideLock?: boolean
  /**
   * 「这只气泡要整个落进视窗，还差 (dx, dy)」。只有 sideLock 会报。
   *
   * 锚点是画布上的一个节点，画布自己能挪 —— 所以不是气泡退让，是画布让路：
   * 外面收到 (dx, dy) 就把画布推同样多，节点跟着挪，气泡和它的相对位置一动不动。
   *
   * 这一帧里气泡先按「画布挪完之后」的位置落位（left - dx），不等下一次渲染：
   * 两边同时到位，中间没有一帧是脱开的。万一画布推不动（到了边界、或者外面没接这个回调），
   * 下一帧会再量一次；重算出来的落点正好就是「贴着视窗边缘」那个位置，
   * 也就是退回成最老实的那种避让 —— 坏不到哪儿去。
   */
  onShift?: (dx: number, dy: number) => void
  /**
   * 锚点自己会动时（画布节点：画布一拖一缩它就换地方），把「动了」这件事传进来 ——
   * 值变了浮层就重新贴一次。窗口滚动和自身改尺寸都有现成的事件可听，唯独画布的平移缩放没有：
   * 它改的是一层 transform，既不滚动也不 resize，不喂进来浮层就会站在原地看着锚点走开。
   *
   * 这一路只跟，不反过来推画布（见 onShift）：用户正拖着画布，浮层再把画布拽回来，
   * 那画布就拖不动了。推画布只发生在浮层刚挂上来、和它自己高矮变了的时候。
   */
  track?: unknown
  /**
   * 尖角离气泡顶边最远多少。默认是「指着锚点的中线」——
   * 锚点是一枚按钮、一行列表项时这句话没问题；锚点是画布上一整个视频节点（半屏高）就不成了：
   * 中线落在气泡下半截甚至气泡外面，尖角被夹到底边，看着像从气泡脚底下长出来的。
   * 给一个上限，尖角就停在标题那一档的高度上，仍旧指着节点，只是指的是它的上半身。
   */
  tailNear?: number
  /**
   * 贴侧边时怎么对齐：默认 center（在锚点上居中）；top 是顶边对顶边 ——
   * 浮层从锚点的上沿起，一路往下长。
   *
   * 「按浮层自己高度的几分之几去偏」那种写法试过，不成：浮层一高，顶边就被顶到锚点上方去了，
   * 看着还是绕着锚点中线在摆。顶边对齐是这句话唯一说得死的量 —— 不管浮层多高，起点都在那儿。
   */
  sideAlign?: 'center' | 'top'
  /** 只居中，不画尖角：悬浮放大给的就是那张画面本身，尖角是外框的一部分，得一起去掉。 */
  center?: boolean
  /**
   * 压在锚点上方时左右怎么对：默认左边对左边；end 是右边对右边 ——
   * 锚点贴着容器右缘时（视频控制条最右那枚菜单键）才说得通，
   * 左对齐会让浮层整个往右探出去，压在旁边那个节点上。
   */
  align?: 'start' | 'end'
}
/** 所有浮层按视窗避让；交互浮层支持 Escape、焦点圈定及关闭后焦点恢复。 */
export default function Overlay({ children, onClose, label, anchor, className = '', modal = false, passive = false, tail = false, side = false, sideLock = false, tailNear, onShift, track, sideAlign = 'center', center = false, align = 'start', onMouseEnter, onMouseLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  // 和 onClose 同一个办法：放进 ref，免得外面每次渲染换一个新函数就把整段定位重跑一遍
  const shift = useRef(onShift); shift.current = onShift
  /** 推画布推了几轮、排着的那一帧 —— 只给 sideLock 那一路用，理由写在它旁边 */
  const tries = useRef(0)
  const raf = useRef<number>()
  /** 主 effect 把当轮的 place 挂在这儿，好让「锚点动了」那条短 effect 也能调到它 */
  const replace = useRef<(mayShift?: boolean) => void>()
  const [pos, setPos] = useState({ left: 12, top: 12, above: false })
  const [arrow, setArrow] = useState<{ side: 'down' | 'up' | 'left' | 'right'; x?: number; y?: number } | null>(null)
  useLayoutEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    const box = ref.current!
    const place = (mayShift = true) => {
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
        /*
         * 锁死朝右的那一路：不比较两边，也不往回收 —— 该在节点右边就一直在节点右边。
         * 落不进视窗的那几个像素报给外面，让画布挪过去（见 onShift）；
         * 这一帧自己先按「画布挪完之后」的位置落位，两边同时到位。
         */
        if (sideLock) {
          const x = right
          const y = sideAlign === 'top' ? a.top : a.top + a.height / 2 - r.height / 2
          const dx = x + r.width + 12 > window.innerWidth ? x + r.width + 12 - window.innerWidth
            : x < 12 ? x - 12 : 0
          const dy = y + r.height + 12 > window.innerHeight ? y + r.height + 12 - window.innerHeight
            : y < 12 ? y - 12 : 0
          const left = x - dx, top = y - dy
          const at = Math.min(a.top + a.height / 2 - top - dy, tailNear ?? Infinity)
          setPos({ left, top, above: false })
          setArrow({ side: 'left', y: Math.max(18, Math.min(at, r.height - 18)) })
          /*
           * 推画布最多试三轮。画布推不动时（到了边界、或者外面根本没接这个回调）
           * 每一帧量到的差额都一样，不设上限就成了一个永不收敛的 rAF 循环；
           * 试满三轮就认了，气泡停在贴着视窗边缘的位置，和最老实的那种避让一个样。
           */
          if (mayShift && (dx || dy) && shift.current && tries.current < 3) {
            tries.current++
            shift.current(dx, dy)
            raf.current = requestAnimationFrame(() => place())
          }
          return
        }
        const fits = right + r.width <= window.innerWidth - 12 || left < 12
        const x = fits ? right : left
        if (x >= 12 && x + r.width <= window.innerWidth - 12) {
          // 被视窗上下推开时 top 会被夹住，尖角那一行跟着实际的 top 算，所以推开了也还指着锚点
        const want = sideAlign === 'top' ? a.top : a.top + a.height / 2 - r.height / 2
        const top = Math.max(12, Math.min(want, window.innerHeight - r.height - 12))
          setPos({ left: x, top, above: false })
          setArrow({ side: fits ? 'left' : 'right', y: Math.max(18, Math.min(a.top + a.height / 2 - top, r.height - 18)) })
          return
        }
      }
      const gap = tail ? 11 : center ? 9 : 8
      const above = a.top - r.height - gap >= 12
      const top = above ? a.top - r.height - gap : Math.min(a.bottom + gap, window.innerHeight - r.height - 12)
      const want = tail || center ? a.left + a.width / 2 - r.width / 2 : align === 'end' ? a.right - r.width : a.left
      const left = Math.max(12, Math.min(want, window.innerWidth - r.width - 12))
      setPos({ left, top: Math.max(12, top), above })
      // 尖角贴着锚点中心，浮层被视窗推开时也不会指偏
      if (tail || side) setArrow({ side: above ? 'down' : 'up', x: Math.max(18, Math.min(a.left + a.width / 2 - left, r.width - 18)) })
    }
    place()
    replace.current = place
    // 换页（列表↔详情）浮层高矮就变了：重新数一轮，让它有机会再把画布推到位
    const observer = new ResizeObserver(() => { tries.current = 0; place() }); observer.observe(box)
    // 跳过置灰的那些：它们不是能用的入口，把焦点搁上去，挂着的「为什么点不了」还会开场就弹出来
    if (!passive) (box.querySelector<HTMLElement>('button:not(:disabled):not([aria-disabled="true"]),textarea,input,[tabindex="0"]') ?? box).focus()
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
    // 事件回调会把 event 当第一个参数传进来，得包一层，别让它落成 mayShift
    const replay = () => place()
    window.addEventListener('resize', replay); window.addEventListener('scroll', replay, true)
    return () => {
      replace.current = undefined
      if (raf.current) cancelAnimationFrame(raf.current)
      observer.disconnect(); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', replay); window.removeEventListener('scroll', replay, true)
      if (!passive && restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [anchor, passive, tail, side, sideLock, tailNear, sideAlign, center, align])
  /*
   * 锚点动了就重贴一次，但不再推画布 —— 画布是被用户（或别处的镜头动画）拖着走的，
   * 浮层此刻的本分是跟住它指的那个东西，不是把它拽回来。
   */
  useLayoutEffect(() => { replace.current?.(false) }, [track])
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
