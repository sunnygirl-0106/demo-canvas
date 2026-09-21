import { useEffect, useRef, useState } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { IcDownload, IcHistory, IcPencil, IcPlus } from '../ui/icons'
import { connOf, FOCUS_NODE_W, isFocusNode, opName, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { useVersions, versionsOf } from '../store/versions'
import { matOf } from '../demo/assets'
import { FOCUS_MODEL, sourceEntryReason } from '../generator/materialLayout'
import { useTip } from '../generator/useTip'
import VersionsDialog from './VersionsDialog'
/** 为源视频创建独立下游任务，原素材保留。已经出过结果的那个节点不再复用，再进一次就长一个新的。 */
export default function VideoToolbar({ nodeId, visible, src, name, dur }: { nodeId: string; visible: boolean; src?: string; name: string; dur?: number }) {
  /** 接不住这段视频的入口直接灰掉，理由挂在悬浮说明上 */
  const { tip, node: tipNode } = useTip()
  const records = useVersions((s) => s.records)
  const [versions, setVersions] = useState(false)
  /**
   * 版本记录挂在**节点**身上，不是挂在这枚按钮上：气泡有半屏高，贴着工具栏那枚小按钮居中摆，
   * 一半会被视窗顶出去。指着节点说「这段视频有这些版本」，尖角落在画面中间，也是它本来的意思。
   */
  const anchor = useRef<HTMLElement | null>(null)
  const openVersions = () => {
    anchor.current = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)
    setVersions(true)
  }
  /**
   * 上传进来、示例场景带进来的原视频从没走过生成，也该有「版本 01 · 原视频」。
   * 和 record() 里调的是同一个幂等函数：有画面的视频节点就有第一版。
   */
  useEffect(() => { useVersions.getState().base(nodeId) }, [nodeId, src])
  const open = (mode: 'edit' | 'extend') => {
    const store = useCanvas.getState()
    const source = store.nodes.find((n) => n.id === nodeId)
    if (!source) return
    // 已经出过结果的那个不算「还能接着用」：把新的一次编辑塞回去会顶掉它的产物，
    // 源视频也就只可能有一个 v2。留着还没出结果的那个可复用，是为了点了编辑又改主意点延长时不留一串空节点。
    const existing = store.nodes.find((n) => n.data.operationSource === nodeId && isFocusNode(n))
    // 名字直接说清它是拿谁改出来的：「局部修改视频：视频节点1」。点了编辑又改主意点延长时跟着改口，
    // 复用的是同一个还没出结果的节点，名字不能停在上一次那件事上；
    // 但用户给它手打过名字就不再改口 —— 手打的名字比自动名贵。
    const label = existing?.data.renamed ? null : opName(store.nodes, mode, source, existing?.id)
    // 专注态节点要在自己身上摆下画面 + 框选层 + 时间轴，比普通节点宽一截
    const id = existing?.id ?? store.spawnDownstream(nodeId, label ?? undefined, FOCUS_NODE_W)
    if (!id) return
    store.updateNode(id, { operationSource: nodeId, ...(existing && label ? { name: label, assetName: label } : {}) })
    const next = useCanvas.getState()
    next.onNodesChange(next.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === id })))
    const get = (mid: string) => matOf(useCanvas.getState().nodes.find((n) => n.id === mid))
    const gs = useGenerator.getState()
    gs.syncConn(id, connOf(next.edges, id).filter((mid) => !!get(mid)), get)
    gs.setMode(id, mode, get)
    if (!gs.get1(id).slotEdit) gs.applyDrop(id, nodeId, 'edit', null, get)
    /**
     * 编辑 / 延长锁死 Seedance 2.5：入口放行看的就是 2.5 接不接得住这一段
     * （sourceEntryReason），所以这里不再「挑一个接得住的型号」—— 说的和做的是同一条规则。
     */
    gs.setModel(id, FOCUS_MODEL, get)
  }
  const entry = (mode: 'edit' | 'extend', label: string, icon: React.ReactNode) => {
    const reason = sourceEntryReason(dur, mode, name)
    return <button aria-disabled={!!reason} aria-label={reason ? `${label}：${reason}` : label}
      {...tip(reason || undefined)} onClick={() => { if (!reason) open(mode) }}>{icon}{label}</button>
  }
  /**
   * 四个入口一进来都是未点击态：这排只是摆出「能对这条视频做什么」，没有哪一件已经选中，
   * 所以「局部修改」也不实心、不着青色 —— 亮起来的样子该留给真正进了编辑之后。
   * 竖线插在前两件和后两件之间：前两件把人带进另一种状态，后两件是顺手的事；
   * 每两个之间都插一条竖线，等于说这四件事一样重，那条线也就什么都没说。
   */
  return <NodeToolbar isVisible={visible} position={Position.Top} offset={14}><div className="vtool nodrag">
    {entry('edit', '局部修改', <IcPencil size={15} sw={1.7} />)}
    {entry('extend', '延长视频', <IcPlus size={15} sw={1.7} />)}<span className="sep" />
    <button aria-expanded={versions} onClick={() => (versions ? setVersions(false) : openVersions())}>
      <IcHistory size={15} sw={1.7} />版本记录
      <b>{versionsOf(records, nodeId).length}</b></button>
    <a href={src} download={`${name}.mp4`}><IcDownload size={15} sw={1.7} />下载</a>
    {tipNode}
    {versions && <VersionsDialog nodeId={nodeId} name={name} anchor={anchor} onClose={() => setVersions(false)} />}
  </div></NodeToolbar>
}
