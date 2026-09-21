import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NodeToolbar, Position, useNodeId, useReactFlow, useStore } from '@xyflow/react'
/** 顶栏压着画布上沿：面板和节点上方那排入口都不该钻到它底下去 */
const TOP_SAFE = 64
/** 画布四周留的空 */
const EDGE = 14
/**
 * 节点上沿之上还占着的那一截（画布坐标，跟着缩放走）：标题栏，以及浮在更上面的那排入口。
 * 「这个节点看得全」说的是连同它上面那排一起看得全 —— 入口被顶栏切掉一半，等于没出来。
 */
const HEAD = 62
/** 差这么几个像素不值得动镜头：晃一下比挡住一点点更打扰 */
const SLACK = 2

/**
 * 选中节点后长在它下面的那块生成面板。
 *
 * 位置只有一条规矩：**永远贴在节点下面**。以前它会在贴到屏幕底边时被往上收，
 * 收着收着就盖住了节点自己 —— 而这块面板说的就是「这个节点要生成什么」，
 * 盖住它等于把话题本身挡了。放不下不该由面板让步，该由镜头让步：
 * 上面那排入口、节点、下面这块面板凑成一叠，哪头出了框就把这一叠移回画面中间。
 */
export default function GeneratorPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const anchor = useRef<HTMLSpanElement>(null)
  const viewport = useStore((s) => s.transform)
  const nodeId = useNodeId()
  const node = useStore((s) => s.nodeLookup.get(nodeId ?? ''))
  const nodePosition = node?.internals.positionAbsolute
  const nodeSize = node?.measured
  const { setViewport, getViewport } = useReactFlow()

  /** 跟着节点走：横向在它正下方居中，贴到屏幕边上才收一收；纵向一律顶着它的下沿。 */
  const place = useCallback(() => {
    const el = ref.current; const point = anchor.current
    if (!el || !point) return
    const a = point.getBoundingClientRect(); const r = el.getBoundingClientRect()
    el.style.left = `${Math.max(EDGE, Math.min(a.left - r.width / 2, window.innerWidth - r.width - EDGE))}px`
    el.style.top = `${a.top}px`
  }, [])

  /**
   * 这一叠露不全就把镜头挪回来。整叠比视口还高时先保住下面这块面板 ——
   * 上面那排入口是顺手的几件事，面板是这会儿真正要用的东西。
   */
  const refocus = useCallback(() => {
    const el = ref.current; const point = anchor.current
    if (!el || !point || !nodePosition) return
    const { x: tx, y: ty, zoom } = getViewport()
    const a = point.getBoundingClientRect(); const r = el.getBoundingClientRect()
    const nodeTop = ty + nodePosition.y * zoom
    const top = nodeTop - HEAD * zoom
    const bottom = a.top + r.height + EDGE
    const winTop = TOP_SAFE, winBottom = window.innerHeight - EDGE
    let dy = 0
    if (top < winTop || bottom > winBottom) {
      dy = bottom - top > winBottom - winTop
        ? winBottom - bottom                                   // 放不下整叠：先让面板完整露出来
        : (winTop + winBottom) / 2 - (top + bottom) / 2        // 放得下：整叠归到画面中间
    }
    // 横向只做「看得见」这一件事：面板本来就跟着节点居中，不必再把画布也拽一遍
    const left = tx + nodePosition.x * zoom
    const right = left + (nodeSize?.width ?? 0) * zoom
    let dx = 0
    if (right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - right
    if (left + dx < EDGE) dx = EDGE - left
    if (Math.abs(dx) < SLACK && Math.abs(dy) < SLACK) return
    setViewport({ x: tx + dx, y: ty + dy, zoom }, { duration: 320 })
  }, [getViewport, setViewport, nodePosition, nodeSize?.width])

  /**
   * 一次镜头只挪一回：面板挂上来、换了个节点、或者切 Tab 让它高矮变了，
   * 都在一小拍之后统一算一次 —— 每来一下就动一次，画布会一路追着抖。
   */
  const pending = useRef<ReturnType<typeof setTimeout>>()
  const schedule = useCallback(() => {
    clearTimeout(pending.current)
    pending.current = setTimeout(refocus, 60)
  }, [refocus])

  useLayoutEffect(() => {
    const el = ref.current; if (!el || !visible) return
    place()
    let last = el.getBoundingClientRect().height
    const observer = new ResizeObserver(() => {
      place()
      const h = el.getBoundingClientRect().height
      // 只有真的高矮变了才重新看镜头：拖动画布时 place 每帧都在跑，不该每帧都算一遍
      if (Math.abs(h - last) > SLACK) { last = h; schedule() }
    })
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place) }
  }, [visible, viewport, nodePosition, place, schedule])

  /** 刚选中这个节点：等面板量出真实高度的下一帧再决定镜头挪多少 */
  useEffect(() => {
    if (!visible) return
    schedule()
    return () => clearTimeout(pending.current)
  }, [visible, nodeId, schedule])

  return <>
    <NodeToolbar isVisible={visible} position={Position.Bottom} align="center" offset={24}><span ref={anchor} /></NodeToolbar>
    {visible && createPortal(<div ref={ref} className="gp nodrag nowheel" style={{ position: 'fixed', zIndex: 40 }}
      onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>{children}</div>, document.body)}
  </>
}
