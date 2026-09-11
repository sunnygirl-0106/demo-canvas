import { useMemo } from 'react'
import { connOf, useCanvas } from '../store/canvas'

/** 当前选中节点的上游节点集合 —— hover 联动时用来决定谁变暗 */
export function useActiveConn() {
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)
  const sel = nodes.find((n) => n.selected)
  const id = sel?.id
  return useMemo(() => new Set(id ? connOf(edges, id) : []), [id, edges])
}
