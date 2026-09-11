import { useReactFlow, useStore } from '@xyflow/react'
import { IcGrid, IcMinus, IcPlus, IcTarget } from '../ui/icons'

export default function ZoomBar() {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])

  return (
    <div className="zoombar">
      <button onClick={() => fitView({ duration: 300, padding: 0.25 })} title="定位"><IcTarget size={15} /></button>
      <button title="网格"><IcGrid size={15} /></button>
      <span className="sep" />
      <button onClick={() => zoomOut({ duration: 150 })}><IcMinus size={15} /></button>
      <span className="pct" onClick={() => zoomTo(1, { duration: 200 })}>{Math.round(zoom * 100)}%</span>
      <button onClick={() => zoomIn({ duration: 150 })}><IcPlus size={15} /></button>
    </div>
  )
}
