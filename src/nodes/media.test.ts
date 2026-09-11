import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVideoMetadata } from './media'
import { useCanvas } from '../store/canvas'

let video: {
  duration: number; currentTime: number; src: string
  onloadedmetadata: (() => void) | null; onerror: (() => void) | null
  removeAttribute: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.useFakeTimers()
  useCanvas.getState().setAll({ nodes: [], edges: [] })
  video = { duration: 12.34, currentTime: 0, src: '', onloadedmetadata: null, onerror: null,
    removeAttribute: vi.fn(), load: vi.fn() }
  vi.stubGlobal('document', { createElement: () => video })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('上传视频元数据', () => {
  it('使用媒体真实时长', () => {
    const id = useCanvas.getState().addNode('video', { x: 0, y: 0 }, { src: 'blob:a' })
    loadVideoMetadata(id, 'blob:a')
    video.onloadedmetadata?.()
    expect(useCanvas.getState().nodes[0].data.dur).toBe(12.34)
  })
  it('较早的上传加载完成，不覆盖后来替换的文件', () => {
    const store = useCanvas.getState()
    const id = store.addNode('video', { x: 0, y: 0 }, { src: 'blob:a' })
    loadVideoMetadata(id, 'blob:a')
    store.updateNode(id, { src: 'blob:b', dur: 5.1 })
    video.onloadedmetadata?.()
    expect(useCanvas.getState().nodes[0].data).toMatchObject({ src: 'blob:b', dur: 5.1 })
  })
  it('加载失败会释放媒体读取资源', () => {
    loadVideoMetadata('missing', 'blob:broken')
    video.onerror?.()
    expect(video.removeAttribute).toHaveBeenCalledWith('src')
    expect(video.load).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
