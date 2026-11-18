import { nanoid } from 'nanoid'
import { isToolPending, useCanvas, type CanvasNodeData, type ToolKind, type UpscaleRes } from '../store/canvas'
import { useVersions } from '../store/versions'

// 演示先沿用原片；有专用素材时只换这里，任务与版本的归属不受影响。
const TOOL_DEMO_MEDIA: Partial<Record<ToolKind, { src: string; poster: string; dur: number }>> = {}
export const TOOL_LABEL = { mocap: '深度动作捕捉', upscale: '超清视频' }
export const UPSCALE_OPTIONS: { res: UpscaleRes; short: number }[] = [
  { res: '720p', short: 720 }, { res: '1080p', short: 1080 }, { res: '2160p', short: 2160 },
]
export const upscaleLabel = (res?: UpscaleRes) => res === '2160p' ? '4K' : res ?? ''
const UPSCALE_BLOCKED = '原片已达到该清晰度，无需超清'
export const TOOL_MS = 1800

export const toolEntryReason = (data: CanvasNodeData) =>
  data.mediaError || (data.dur == null || !Number.isFinite(data.dur) ? '视频还在读取，读完即可使用' : null)

export function upscaleBlockedReason(px: CanvasNodeData['px'], res: UpscaleRes) {
  if (!px) return null
  const short = Math.min(px.w, px.h)
  if (UPSCALE_OPTIONS.find((o) => o.res === res)!.short > short) return null
  return UPSCALE_BLOCKED
}

export const upscaleAllBlocked = (px: CanvasNodeData['px']) =>
  UPSCALE_OPTIONS.every((o) => upscaleBlockedReason(px, o.res)) ? UPSCALE_BLOCKED : null

// 任务属于节点状态，不随组件卸载取消；撤销恢复和严格模式重挂都只会排一个计时器。
const jobs = new Map<string, ReturnType<typeof setTimeout>>()
export function ensureToolJob(nodeId: string) {
  if (jobs.has(nodeId)) return
  jobs.set(nodeId, setTimeout(() => {
    jobs.delete(nodeId)
    const node = useCanvas.getState().nodes.find((n) => n.id === nodeId)
    if (node && isToolPending(node)) landTool(nodeId)
  }, TOOL_MS))
}

export function landTool(nodeId: string) {
  const { nodes, updateNode } = useCanvas.getState()
  const node = nodes.find((n) => n.id === nodeId)
  if (!node || !isToolPending(node)) return
  const op = node.data.toolOp!
  const source = nodes.find((n) => n.id === op.source)
  if (!source?.data.src) { updateNode(nodeId, { toolOp: undefined }); return }
  const media = TOOL_DEMO_MEDIA[op.kind]
    ?? { src: source.data.src, poster: source.data.poster, dur: source.data.dur }
  // 先建记录再落画面，避免工具栏补记 V1 时把同一幅产物当成上传视频再记一遍。
  useVersions.getState().record({ id: nanoid(), nodeId, sourceNodeId: op.source, baseNo: op.baseNo,
    media, task: null, tool: { kind: op.kind, resolution: op.resolution } })
  updateNode(nodeId, { ...media, mediaReady: true, mediaError: undefined, toolOp: undefined })
}
