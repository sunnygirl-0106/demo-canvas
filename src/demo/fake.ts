import { useCanvas, type CanvasNodeData } from '../store/canvas'
import { useVersions, type VersionTask } from '../store/versions'
import type { TaskPayload } from '../generator/videoTask'
import { MEDIA, VID } from './assets'

/** 本地假生成：转一会儿 loading，然后把结果写进节点 */
export function fakeGen(id: string, ms: number, patch: Partial<CanvasNodeData>) {
  const { updateNode, snapshot } = useCanvas.getState()
  snapshot()                                   // 生成结果也能撤销
  updateNode(id, { busy: true })
  window.setTimeout(() => updateNode(id, { busy: false, ...patch }), ms)
}

const clipOf = (v: { src: string; poster: string; dur: number }) => ({ src: v.src, poster: v.poster, dur: v.dur })
/**
 * 延长产出的那一截画面。
 * 画幅跟着原片走（§3.3.4 配图批注）：横片接横片、竖片接竖片 ——
 * 一段 16:9 的片子延长出一段 9:16，详情页上「画幅：随原片」当场就自相矛盾。
 * 挑到和原片同一段素材时换另一段：产出和原片一模一样，看不出延长发生过。
 */
function extendClip(src?: string, ratio?: number) {
  const pick = (ratio ?? 0) >= 1 ? clipOf(VID.h8) : MEDIA.video9
  return pick.src === src ? MEDIA.video10 : pick
}

/** 视频任务出结果：画面落到节点上，同时记成一版。 */
export function landResult(nodeId: string, taskId: string, payload: TaskPayload, baseNo: number | null) {
  const { nodes, updateNode } = useCanvas.getState()
  const src = payload.sourceId ? nodes.find((n) => n.id === payload.sourceId) : null
  // 编辑的产出与原片同长，演示里就用原片本身；延长产出是新接上的那一段
  const media = payload.mode === 'edit' && src?.data.src
    ? { src: src.data.src, poster: src.data.poster, dur: src.data.dur }
    : payload.mode === 'extend' ? extendClip(src?.data.src, src?.data.ratio) : MEDIA.video10
  const task: VersionTask = {
    mode: payload.mode, model: payload.model, doc: payload.doc, params: payload.params,
    sourceId: payload.sourceId, direction: payload.direction,
  }
  // 先记版本再写画面：记录建立之后，节点上「补第一版」那条规则就不会再对同一幅画面记第二次。
  // 这一版读作「生成」还是「编辑 / 延长」，由它自己的 task.mode 说（见 VersionsDialog 的 opOf）
  useVersions.getState().record({ id: taskId, nodeId, sourceNodeId: payload.sourceId, baseNo,
    // 延长的产出只有新增那一截，所以记录里写的是新增时长，不是这段演示素材本身有多长
    media: payload.mode === 'extend' ? { ...media, dur: payload.params.duration } : media,
    task })
  updateNode(nodeId, { ...media, mediaReady: true, mediaError: undefined })
}
