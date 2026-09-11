import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './canvas/Canvas'
import { connOf, useCanvas } from './store/canvas'
import { useGenerator } from './store/generator'
import { matOf } from './demo/assets'
import type { MatGet } from './generator/materialLayout'
import './styles/app.css'

const get: MatGet = (id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id))

export default function App() {
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)

  /* 连线变化 → 所有视频节点的生成器重新落位（不依赖面板是否打开） */
  useEffect(() => {
    const gs = useGenerator.getState()
    nodes.forEach((n) => {
      if (n.type !== 'video') return
      const conn = connOf(edges, n.id).filter((id) => !!get(id))
      const cur = gs.map[n.id]
      if (!cur || cur.conn.join(',') !== conn.join(',')) gs.syncConn(n.id, conn, get)
      else gs.syncSources(n.id, get)
    })
  }, [nodes, edges])

  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
