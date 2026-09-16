import { NodeToolbar, Position } from '@xyflow/react'
import { IcDownload, IcScissors, IcPlus } from '../ui/icons'
import { connOf, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { modelForSource, sourceEntryReason } from '../generator/materialLayout'
import { useTip } from '../generator/useTip'
/** 为源视频创建独立下游任务，原素材保留。重复进入恢复同一任务草稿。 */
export default function VideoToolbar({ nodeId, visible, src, name, dur }: { nodeId: string; visible: boolean; src?: string; name: string; dur?: number }) {
  /** 接不住这段视频的入口直接灰掉，理由挂在悬浮说明上 */
  const { tip, node: tipNode } = useTip()
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
    /**
     * 默认型号接不住「这一段」视频（2.5 编辑要 4 秒起）时换一个接得住的。
     * 看的是点进来的这段源视频，不是「画布上有没有某段视频合规」——
     * 否则用户点了「编辑视频」，落地是一个亮着的 Tab 加一段灰掉的源视频。
     */
    const g = gs.get1(id)
    const better = modelForSource(mode, g.conn, get, g.slotEdit ?? nodeId, g.model)
    if (better !== g.model) { gs.setModel(id, better, get); gs.setMode(id, mode, get) }
  }
  const entry = (mode: 'edit' | 'extend', label: string, icon: React.ReactNode) => {
    const reason = sourceEntryReason(dur, mode, name)
    return <button aria-disabled={!!reason} aria-label={reason ? `${label}：${reason}` : label}
      {...tip(reason || undefined)} onClick={() => { if (!reason) open(mode) }}>{icon}{label}</button>
  }
  return <NodeToolbar isVisible={visible} position={Position.Top} offset={14}><div className="vtool nodrag">
    {entry('edit', '编辑视频', <IcScissors size={13} />)}<span className="sep" />
    {entry('extend', '延长视频', <IcPlus size={13} />)}<span className="sep" />
    <a href={src} download={`${name}.mp4`}><IcDownload size={13} />下载</a>
    {tipNode}
  </div></NodeToolbar>
}
