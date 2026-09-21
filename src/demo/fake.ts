import { useCanvas, type CanvasNodeData } from '../store/canvas'
import { useVersions } from '../store/versions'
import type { TaskPayload } from '../generator/videoTask'
import { MEDIA } from './assets'

/** 本地假生成：转一会儿 loading，然后把结果写进节点 */
export function fakeGen(id: string, ms: number, patch: Partial<CanvasNodeData>) {
  const { updateNode, snapshot } = useCanvas.getState()
  snapshot()                                   // 生成结果也能撤销
  updateNode(id, { busy: true })
  window.setTimeout(() => updateNode(id, { busy: false, ...patch }), ms)
}

/** 视频任务出结果：画面落到节点上，同时记成一版。 */
export function landResult(nodeId: string, taskId: string, payload: TaskPayload) {
  const { nodes, updateNode } = useCanvas.getState()
  const src = payload.sourceId ? nodes.find((n) => n.id === payload.sourceId) : null
  // 编辑的产出与原片同长，演示里就用原片本身；延长产出是新接上的那一段
  const media = payload.mode === 'edit' && src?.data.src
    ? { src: src.data.src, poster: src.data.poster, dur: src.data.dur }
    : payload.mode === 'extend' ? MEDIA.video9 : MEDIA.video10
  // 先记版本再写画面：记录建立之后，节点上「补第一版」那条规则就不会再对同一幅画面记第二次。
  // 这一版读作「生成」还是「编辑 / 延长」，由看它的是哪个节点决定（readsAs），不在这里定死
  useVersions.getState().record({ id: taskId, nodeId, sourceNodeId: payload.sourceId, media, payload })
  updateNode(nodeId, { ...media, mediaReady: true, mediaError: undefined })
}
