import { useMemo } from 'react'
import { useStore } from '@xyflow/react'
import { connOf, useCanvas } from '../store/canvas'

/**
 * 画面上那几件控件跟随画布缩放的松紧。0 是一路封死（放大时它们在屏幕上恒定），
 * 1 是完全不封（跟画面等比长大）。0.5 就是下面这一行：画面翻一倍，它们长 1.41 倍。
 * 缩小时恒为 1 —— 那一路跟着画面一起缩，占画面多大一块不变。理由见 tokens.css 的那一段。
 */
const FOLLOW = 0.5
export const zkOf = (zoom: number) => Math.max(1, zoom) ** (FOLLOW - 1)
/** ⊕ 的方框边长（26）加上它离节点边的那道缝（6）—— 连线的端点就落在这个距离之外 */
export const PLUS_SPAN = 32
/** 当前这一帧的跟随系数。连线要靠它算出「端点离节点边还有多远」，好把这一截补回去 */
export const useZk = () => useStore((s) => zkOf(s.transform[2]))

/** 当前选中节点的上游节点集合 —— hover 联动时用来决定谁变暗 */
export function useActiveConn() {
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)
  const sel = nodes.find((n) => n.selected)
  const id = sel?.id
  return useMemo(() => new Set(id ? connOf(edges, id) : []), [id, edges])
}
