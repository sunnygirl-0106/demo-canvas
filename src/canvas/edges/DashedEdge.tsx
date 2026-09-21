import { useEffect, useRef, useState } from 'react'
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { isFocusNode, useCanvas } from '../../store/canvas'
import { useGenerator } from '../../store/generator'
import { activeIds } from '../../generator/materialLayout'
import { IcScissors } from '../../ui/icons'
export default function DashedEdge(p: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = p
  const hover = useCanvas((s) => s.hoverMat)
  const [d, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })

  const gen = useGenerator((s) => s.map[p.target])
  /**
   * 从视频上方入口长出来的那一条线，就地说出它长出来的是什么事 ——
   * 这条线两头的名字都是「视频节点」，不说这一句，连出来的那个节点为什么在那儿就只能靠猜。
   * 只有专注态（还没出片）才挂：出片之后它就是普通的一条来源线了。
   */
  const nodes = useCanvas((s) => s.nodes)
  const to = nodes.find((n) => n.id === target)
  const op = to && isFocusNode(to) && to.data.operationSource === source
    ? (useGenerator.getState().map[target]?.mode === 'extend' ? '延长续写' : '局部重绘') : null
  const active = !gen || activeIds(gen, gen.mode).includes(source)
  const lit = active && hover === source
  const dimmed = !!hover && !lit

  /**
   * 悬浮到线上才亮出剪刀 —— 平时画布上不该多一排常驻按钮。
   * 从线挪到剪刀上要经过一小段「既不在线上也不在按钮上」的路，所以收起延后一拍。
   */
  const [armed, setArmed] = useState(false)
  const off = useRef<ReturnType<typeof setTimeout>>()
  const enter = () => { clearTimeout(off.current); setArmed(true) }
  const leave = () => { off.current = setTimeout(() => setArmed(false), 160) }
  useEffect(() => () => clearTimeout(off.current), [])

  return (
    <>
      <path
        id={id} className="rf-edgepath" d={d} fill="none"
        stroke="var(--teal)" strokeWidth={lit || armed ? 2.2 : 1.5} strokeDasharray={lit ? undefined : '4 4'}
        opacity={armed ? 0.9 : !active ? 0.1 : dimmed ? 0.12 : lit ? 1 : 0.55}
        markerEnd="url(#arrow-teal)"
      />
      {/* 加宽的透明命中区，方便点选删除、也方便悬浮出剪刀 */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction"
        onMouseEnter={enter} onMouseLeave={leave} />
      {op && !armed && (
        <EdgeLabelRenderer>
          <span className="edge-op" style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY - 16}px)` }}>{op}</span>
        </EdgeLabelRenderer>
      )}
      {armed && (
        <EdgeLabelRenderer>
          <button
            className="edge-cut nodrag nopan" title="断开连线" aria-label={`断开 ${source} 到 ${target} 的连线`}
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            onMouseEnter={enter} onMouseLeave={leave}
            onClick={(e) => { e.stopPropagation(); useCanvas.getState().disconnect(id) }}
          ><IcScissors size={12} /></button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
