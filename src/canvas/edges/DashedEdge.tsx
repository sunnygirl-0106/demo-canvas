import { getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCanvas } from '../../store/canvas'
import { useGenerator } from '../../store/generator'
import { activeIds } from '../../generator/materialLayout'
export default function DashedEdge(p: EdgeProps) {
  const { id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = p
  const hover = useCanvas((s) => s.hoverMat)
  const [d] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })

  const gen = useGenerator((s) => s.map[p.target])
  const active = !gen || activeIds(gen, gen.mode).includes(source)
  const lit = active && hover === source
  const dimmed = !!hover && !lit

  return (
    <>
      <path
        id={id} className="rf-edgepath" d={d} fill="none"
        stroke="var(--teal)" strokeWidth={lit ? 2.2 : 1.5} strokeDasharray={lit ? undefined : '4 4'} opacity={!active ? 0.1 : dimmed ? 0.12 : lit ? 1 : 0.55}
        markerEnd="url(#arrow-teal)"
      />
      {/* 加宽的透明命中区，方便点选删除 */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction" />
    </>
  )
}
