import { NodeToolbar, Position } from '@xyflow/react'
import { IcDownload, IcScissors, IcPlus } from '../ui/icons'
import { connOf, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
/** 为源视频创建独立下游任务，原素材保留。重复进入恢复同一任务草稿。 */
export default function VideoToolbar({ nodeId, visible, src, name }: { nodeId: string; visible: boolean; src?: string; name: string }) {
  const open = (mode: 'edit' | 'extend') => {
    const store = useCanvas.getState()
    const existing = store.nodes.find((n) => n.data.operationSource === nodeId)
    const id = existing?.id ?? store.spawnDownstream(nodeId)
    if (!id) return
    if (!existing) store.updateNode(id, { operationSource: nodeId })
    const next = useCanvas.getState()
    next.onNodesChange(next.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === id })))
    const get = (mid: string) => matOf(useCanvas.getState().nodes.find((n) => n.id === mid))
    const gs = useGenerator.getState()
    gs.syncConn(id, connOf(next.edges, id).filter((mid) => !!get(mid)), get)
    gs.setMode(id, mode, get)
    if (!gs.get1(id).slotEdit) gs.applyDrop(id, nodeId, 'edit', null, get)
  }
  return <NodeToolbar isVisible={visible} position={Position.Top} offset={14}><div className="vtool nodrag">
    <button onClick={() => open('edit')}><IcScissors size={13} />编辑视频</button><span className="sep" />
    <button onClick={() => open('extend')}><IcPlus size={13} />延长视频</button><span className="sep" />
    <a href={src} download={`${name}.mp4`}><IcDownload size={13} />下载</a>
  </div></NodeToolbar>
}
