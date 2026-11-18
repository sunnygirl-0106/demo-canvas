import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isToolPending, useCanvas } from '../store/canvas'
import { useVersions } from '../store/versions'
import { ensureToolJob, landTool, TOOL_MS, toolEntryReason, upscaleAllBlocked, upscaleBlockedReason } from './videoTools'

beforeEach(() => {
  vi.useFakeTimers()
  useCanvas.getState().setAll({ nodes: [], edges: [] })
  useVersions.getState().reset()
})
afterEach(() => {
  vi.runAllTimers()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setup = () => {
  const store = useCanvas.getState()
  const source = store.addNode('video', { x: 0, y: 0 }, { src: 'v.mp4', poster: 'v.jpg', dur: 5 })
  const id = store.spawnTool(source, 'upscale', '2160p', useVersions.getState().baseNoOf(source))!
  return { store, source, id }
}
const records = () => useVersions.getState().records.filter((r) => r.tool)

describe('工具箱入口条件', () => {
  it('读取失败优先说明错误，未读到时长才等待，不受生成模型的时长限制', () => {
    expect(toolEntryReason({ name: '视频', mediaError: '读失败' })).toBe('读失败')
    expect(toolEntryReason({ name: '视频' })).toBe('视频还在读取，读完即可使用')
    expect(toolEntryReason({ name: '视频', dur: NaN })).toBe('视频还在读取，读完即可使用')
    expect(toolEntryReason({ name: '视频', dur: 60 })).toBeNull()
  })

  it('缺像素不拦，横竖片一律按短边算，相同分辨率也拦', () => {
    expect(upscaleBlockedReason(undefined, '720p')).toBeNull()
    expect(upscaleAllBlocked(undefined)).toBeNull()
    for (const px of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) {
      expect(upscaleBlockedReason(px, '720p')).toBe('原片已达到该清晰度，无需超清')
      expect(upscaleBlockedReason(px, '1080p')).toBe('原片已达到该清晰度，无需超清')
      expect(upscaleBlockedReason(px, '2160p')).toBeNull()
      expect(upscaleAllBlocked(px)).toBeNull()
    }
  })

  it('按短边边界拦截，置灰提示统一', () => {
    expect(upscaleBlockedReason({ w: 719, h: 2000 }, '720p')).toBeNull()
    expect(upscaleBlockedReason({ w: 720, h: 2000 }, '720p')).toBe('原片已达到该清晰度，无需超清')
    expect(upscaleBlockedReason({ w: 1000, h: 2000 }, '720p')).toBe('原片已达到该清晰度，无需超清')
    expect(upscaleBlockedReason({ w: 1079, h: 2000 }, '1080p')).toBeNull()
    expect(upscaleAllBlocked({ w: 3840, h: 2159 })).toBeNull()
    expect(upscaleAllBlocked({ w: 3840, h: 2160 })).toBe('原片已达到该清晰度，无需超清')
    expect(upscaleAllBlocked({ w: 4320, h: 7680 })).toBe('原片已达到该清晰度，无需超清')
  })
})

describe('状态驱动的工具任务', () => {
  it('同一节点只排一个计时器，到点先记版本再落画面', () => {
    const { id } = setup()
    const timer = vi.spyOn(globalThis, 'setTimeout')
    ensureToolJob(id)
    ensureToolJob(id)
    expect(timer).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TOOL_MS - 1)
    expect(records()).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(records()).toMatchObject([{ nodeId: id, no: 1, task: null, tool: { kind: 'upscale', resolution: '2160p' } }])
    const data = useCanvas.getState().nodes.find((n) => n.id === id)!.data
    expect(data).toMatchObject({ src: 'v.mp4', poster: 'v.jpg', dur: 5, mediaReady: true })
    expect(data.toolOp).toBeUndefined()
    landTool(id)
    expect(records()).toHaveLength(1)
  })

  it('到点前删除节点，任务不记版本；撤销恢复后可重新排任务', () => {
    const { store, id } = setup()
    ensureToolJob(id)
    store.deleteSelection()
    vi.advanceTimersByTime(TOOL_MS)
    expect(records()).toHaveLength(0)
    store.undo()
    expect(isToolPending(useCanvas.getState().nodes.find((n) => n.id === id)!)).toBe(true)
    ensureToolJob(id)
    vi.advanceTimersByTime(TOOL_MS)
    expect(records()).toHaveLength(1)
  })

  it('创建后撤销再重做，同一等待中的任务能完成', () => {
    const { store, id } = setup()
    ensureToolJob(id)
    store.undo()
    store.redo()
    ensureToolJob(id)
    vi.advanceTimersByTime(TOOL_MS)
    expect(records()).toHaveLength(1)
  })

  it('任务已经被其他结果替换，到点不覆盖画面或记版本', () => {
    const { store, id } = setup()
    ensureToolJob(id)
    store.updateNode(id, { src: 'other.mp4' })
    vi.advanceTimersByTime(TOOL_MS)
    expect(records()).toHaveLength(0)
    expect(useCanvas.getState().nodes.find((n) => n.id === id)!.data.src).toBe('other.mp4')
  })

  it('源节点丢失时只退回空视频节点', () => {
    const { store, source, id } = setup()
    store.onNodesChange([{ type: 'remove', id: source }])
    landTool(id)
    const node = useCanvas.getState().nodes.find((n) => n.id === id)!
    expect(node.data.toolOp).toBeUndefined()
    expect(node.data.src).toBeUndefined()
    expect(records()).toHaveLength(0)
  })
})
