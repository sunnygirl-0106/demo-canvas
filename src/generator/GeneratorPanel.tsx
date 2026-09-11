import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NodeToolbar, Position, useStore, useNodeId } from '@xyflow/react'
/** 跟随节点锚点，浮层独立于画布层级，避免工具栏遮挡与屏幕裁切。 */
export default function GeneratorPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const anchor = useRef<HTMLSpanElement>(null)
  const viewport = useStore((s) => s.transform)
  const nodeId = useNodeId()
  const nodePosition = useStore((s) => s.nodeLookup.get(nodeId ?? '')?.internals.positionAbsolute)
  useLayoutEffect(() => {
    const el = ref.current; const point = anchor.current; if (!el || !point || !visible) return
    const place = () => {
      const a = point.getBoundingClientRect(); const r = el.getBoundingClientRect()
      el.style.left = `${Math.max(12, Math.min(a.left - r.width / 2, window.innerWidth - r.width - 12))}px`
      el.style.top = `${Math.max(64, Math.min(a.top, window.innerHeight - r.height - 16))}px`
    }
    place()
    const observer = new ResizeObserver(place); observer.observe(el)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place) }
  }, [visible, viewport, nodePosition])
  return <>
    <NodeToolbar isVisible={visible} position={Position.Bottom} align="center" offset={24}><span ref={anchor} /></NodeToolbar>
    {visible && createPortal(<div ref={ref} className="gp nodrag nowheel" style={{ position: 'fixed', zIndex: 40 }}
      onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>{children}</div>, document.body)}
  </>
}
