import { useEffect, useRef, useState } from 'react'
import { EdgeLabelRenderer, getBezierPath, Position, type EdgeProps } from '@xyflow/react'
import { PLUS_SPAN, useZk } from '../hooks'
import { isFocusNode, NAME_OF, useCanvas } from '../../store/canvas'
import { useGenerator } from '../../store/generator'
import { activeIds } from '../../generator/materialLayout'
import { IcScissors } from '../../ui/icons'
export default function DashedEdge(p: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = p
  const hover = useCanvas((s) => s.hoverMat)
  /*
   * 线的两端直接落在节点边上，不给 ⊕ 空位。
   *
   * react-flow 给的端点是 handle 方框的外沿，而那个方框是照着 ⊕ 摆的（见 app.css 的 .react-flow__handle）——
   * 照它画，线会停在离节点 32px 的地方，中间空出一段「留给加号的位置」；
   * 可加号只在节点选中时才出现，平时那儿什么也没有，就成了一条没接上的线。
   * 所以把这一截（32 × 跟随系数，和方框同一个算法）补回去：线一路走到节点边，
   * ⊕ 出现时压在它上面，像一枚按钮压在线上，而不是线绕着它让路。
   */
  const pad = PLUS_SPAN * useZk()
  const at = (x: number, pos: Position) => pos === Position.Left ? x + pad : pos === Position.Right ? x - pad : x
  const sx = at(sourceX, sourcePosition), tx = at(targetX, targetPosition)
  const [d, labelX, labelY] = getBezierPath({
    sourceX: sx, sourceY, targetX: tx, targetY, sourcePosition, targetPosition,
  })
  /** 渐变得贴着这条线自己的走向，所以用 userSpaceOnUse 直接给两端的坐标 */
  const gid = `eg-${id}`

  const gen = useGenerator((s) => s.map[p.target])
  /**
   * 从视频上方入口长出来的那一条线，就地说出它长出来的是什么事 ——
   * 这条线两头的名字都是「视频节点」，不说这一句，连出来的那个节点为什么在那儿就只能靠猜。
   * 只有专注态（还没出片）才挂：出片之后它就是普通的一条来源线了。
   * 说的就是 NAME_OF 那两个词：出片之后节点会叫「编辑视频1」，线上不该先用另一套叫法。
   */
  const nodes = useCanvas((s) => s.nodes)
  const to = nodes.find((n) => n.id === target)
  const op = to && isFocusNode(to) && to.data.operationSource === source
    ? NAME_OF[useGenerator.getState().map[target]?.mode === 'extend' ? 'extend' : 'edit'] : null
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
      {/*
        * 方向不靠箭头说。
        *
        * 箭头是钉在线尾的一枚实心三角，比线本身重得多：一屏几条线，先看见的是几枚三角。
        * 这儿换成两件一直在说、又都很轻的事 —— 亮度和动。
        * 亮度：从起点那头的两成亮一路涨到落点的满亮，像一道尾巴亮到头的光，
        *      暗的那头是「从这儿出来的」，亮的那头是「落在这儿」，静止的一帧里就读得出来。
        * 动：虚线一直朝落点走（.rf-edgepath 那条动画），3.6s 一轮，慢到不抢眼睛。
        * 悬浮时线变成实线，那一下只剩亮度在说方向 —— 够了，那会儿人正盯着这一条。
        */}
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sx} y1={sourceY} x2={tx} y2={targetY}>
          <stop offset="0" style={{ stopColor: 'var(--teal)', stopOpacity: .2 }} />
          <stop offset=".5" style={{ stopColor: 'var(--teal)', stopOpacity: .62 }} />
          <stop offset="1" style={{ stopColor: 'var(--teal)', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path
        id={id} className="rf-edgepath" d={d} fill="none"
        stroke={`url(#${gid})`} strokeWidth={lit || armed ? 2.2 : 1.5} strokeLinecap="round"
        /*
         * 线段 12、空隙 9：原先 4 4 那种一截一截的碎点，一条线上要排几十节，远看是一条
         * 带毛边的灰线，近看满是碎屑。拉到这个长度，一节就读得出是一段「线」而不是一个点，
         * 整条线上只剩十来节，空隙也跟着松开，密度降下来才看得清它在往哪边走。
         * 两头是圆头（strokeLinecap），每节实际各长出半个线宽，所以空隙给得比线段短些才匀。
         * 节长 21px 要和 app.css 里 gp-flow 的位移对上（-84 = 四节），不然一轮接头会跳。
         */
        strokeDasharray={lit ? undefined : '12 9'}
        opacity={armed ? 0.9 : !active ? 0.1 : dimmed ? 0.12 : lit ? 1 : 0.55}
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
