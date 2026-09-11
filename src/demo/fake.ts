import { useCanvas, type CanvasNodeData } from '../store/canvas'

/** 本地假生成：转一会儿 loading，然后把结果写进节点 */
export function fakeGen(id: string, ms: number, patch: Partial<CanvasNodeData>) {
  const { updateNode, snapshot } = useCanvas.getState()
  snapshot()                                   // 生成结果也能撤销
  updateNode(id, { busy: true })
  window.setTimeout(() => updateNode(id, { busy: false, ...patch }), ms)
}
