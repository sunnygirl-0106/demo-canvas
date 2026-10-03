import { useEffect } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { IcDownload, IcHistory, IcPencil, IcPlus } from '../ui/icons'
import { connOf, focusWidthFor, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { useVersions, versionsOf } from '../store/versions'
import { matOf } from '../demo/assets'
import { FOCUS_MODEL, sourceEntryReason } from '../generator/materialLayout'
import { useTip } from '../generator/useTip'
import VersionsDialog from './VersionsDialog'
/**
 * 工具栏要避开的那一截：节点名字那行（.nd-head）是绝对定位摆在**节点框外面**的，
 * top:-24、高 22，也就是占了节点上方 −24…−2 这一段；react-flow 量的节点框只到画面，
 * 不含这行字。NodeToolbar 的 offset 是「工具栏底边离节点框顶多远」，
 * 给 14 的话底边落在 −14，正好压在名字上 —— 所以要 24（让开整行）再加 8（留口气）。
 * 这个数跟着 .nd-head 的 top 走，那边一改这边要跟着改。
 */
const HEAD_CLEAR = 24 + 8

/** 为源视频创建独立下游任务，原素材保留。每次点击都新长一个子节点，先前那个照旧留在画布上。 */
export default function VideoToolbar({ nodeId, visible, src, name, dur, versions }: {
  nodeId: string; visible: boolean; src?: string; name: string; dur?: number
  /** 「全部版本」那只气泡开着没有。状态在 canvas store 上（openVersions），示例场景也摆得进去 */
  versions: boolean
}) {
  /** 接不住这段视频的入口直接灰掉，理由挂在悬浮说明上 */
  const { tip, node: tipNode } = useTip()
  const records = useVersions((s) => s.records)
  const setVersions = (open: boolean) => useCanvas.getState().setOpenVersions(open ? nodeId : null)
  const count = versionsOf(records, nodeId).length
  /**
   * 上传进来、示例场景带进来的原视频从没走过生成，也该有「V1」。
   * 和 record() 里调的是同一个幂等函数：有画面的视频节点就有第一版。
   */
  useEffect(() => { useVersions.getState().base(nodeId) }, [nodeId, src])
  const open = (mode: 'edit' | 'extend') => {
    const store = useCanvas.getState()
    const source = store.nodes.find((n) => n.id === nodeId)
    if (!source) return
    /**
     * 每点一次就长一个新的「编辑视频N / 延长视频N」（§3.2.1），先前那个原样留着 ——
     * 塞回同一个节点只会让它一会儿是编辑一会儿是延长，而用户点第二次要的多半是「这一段再改一处」。
     * 不要的那个他自己删；源视频一删、连线一剪，还没出片的那些跟着走（见 canvas 的 deleteSelection）。
     */
    const label = store.claimName(mode)
    // 专注态节点要在自己身上摆下画面 + 框选层 + 时间轴，比普通节点宽一截；
    // 宽多少跟着源片的朝向走 —— 横片摊开成横的，别硬塞进竖片那一档（见 focusWidthFor）
    const id = store.spawnDownstream(nodeId, label, focusWidthFor(source.data.ratio))
    if (!id) return
    store.updateNode(id, { operationSource: nodeId })
    const next = useCanvas.getState()
    next.onNodesChange(next.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === id })))
    const get = (mid: string) => matOf(useCanvas.getState().nodes.find((n) => n.id === mid))
    const gs = useGenerator.getState()
    gs.syncConn(id, connOf(next.edges, id).filter((mid) => !!get(mid)), get, true)
    gs.setMode(id, mode, get)
    if (!gs.get1(id).slotEdit) gs.applyDrop(id, nodeId, 'edit', null, get)
    /**
     * 编辑 / 延长锁死 Seedance 2.5：入口放行看的就是 2.5 接不接得住这一段
     * （sourceEntryReason），所以这里不再「挑一个接得住的型号」—— 说的和做的是同一条规则。
     */
    gs.setModel(id, FOCUS_MODEL, get)
  }
  const entry = (mode: 'edit' | 'extend', label: string, icon: React.ReactNode) => {
    const reason = sourceEntryReason(dur, name)
    return <button aria-disabled={!!reason} aria-label={reason ? `${label}：${reason}` : label}
      {...tip(reason || undefined)} onClick={() => { if (!reason) open(mode) }}>{icon}{label}</button>
  }
  /**
   * 四个入口一进来都是未点击态：这排只是摆出「能对这条视频做什么」，没有哪一件已经选中，
   * 所以「局部修改」也不实心、不着青色 —— 亮起来的样子该留给真正进了编辑之后。
   * 唯一会亮的是「全部版本」，而亮的条件是它那个气泡正开着，不是它被选中了。
   *
   * 原先在前两件和后两件之间插过一条竖线（前两件把人带进另一种状态，后两件是顺手的事）。
   * 设计稿把它去掉了，这里跟着去掉：四件事靠间距分组本来就够，
   * 而且现在亮起来的那一枚自带一圈底，再加一条竖线，一行里就有两套分隔在打架。
   *
   * 外面多一层 .vtool-ring：那圈是渐变描边，border 画不出来，得靠外层垫 1.5px 透出渐变。
   */
  return <NodeToolbar isVisible={visible} position={Position.Top} offset={HEAD_CLEAR}><div className="vtool-ring nodrag"><div className="vtool">
    {entry('edit', '局部编辑', <IcPencil size={19} sw={1.7} />)}
    {entry('extend', '延长视频', <IcPlus size={19} sw={1.7} />)}
    {/* 只有一版（或一版都没有）就不摆这个数：「全部版本 1」说的是「这里只有一个」，
        而这枚入口本来就是「点进去看有哪些」—— 一个数写出来反倒像在提醒「没什么可看的」。
        两版起才有「有几版」这件事可说。 */}
    <button aria-expanded={versions} onClick={() => setVersions(!versions)}>
      <IcHistory size={19} sw={1.7} />全部版本
      {count > 1 && <b>{count}</b>}</button>
    <a href={src} download={`${name}.mp4`}><IcDownload size={19} sw={1.7} />下载</a>
    {tipNode}
    {versions && <VersionsDialog nodeId={nodeId} name={name} onClose={() => setVersions(false)} />}
  </div></div></NodeToolbar>
}
