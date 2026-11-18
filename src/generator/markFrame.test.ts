import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let sources: string[], videos: FakeVideo[], draws: string[]
let alive: number, peak: number
class FakeVideo {
  preload = ''; muted = false; crossOrigin = ''; duration = 12
  videoWidth = 640; videoHeight = 360; readyState = 0; seeking = false
  onloadeddata: (() => void) | null = null
  onseeked: (() => void) | null = null
  onerror: (() => void) | null = null
  private time = 0
  private source = ''
  constructor() { videos.push(this) }
  get src() { return this.source }
  set src(src: string) {
    if (!this.source) peak = Math.max(peak, ++alive)
    this.source = src; sources.push(src); this.time = 0
    if (src === 'stall') return
    queueMicrotask(() => { this.readyState = 2; this.onloadeddata?.() })
  }
  get currentTime() { return this.time }
  set currentTime(t: number) {
    this.time = t; this.seeking = true
    queueMicrotask(() => { this.seeking = false; this.onseeked?.() })
  }
  removeAttribute() { if (this.source) alive--; this.source = ''; this.readyState = 0 }
  load() {}
}

beforeEach(() => {
  vi.resetModules()
  sources = []; videos = []; draws = []; alive = peak = 0
  vi.stubGlobal('document', { createElement: (tag: string) => {
    if (tag === 'video') return new FakeVideo()
    let frame = ''
    return { width: 0, height: 0,
      getContext: () => ({ drawImage: (v: FakeVideo) => { frame = `${v.src}@${v.currentTime}`; draws.push(frame) } }),
      toDataURL: () => frame }
  } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('视频截帧调度与帧缓存', () => {
  it('十张时间轴缩略图复用一个解码器、一次源加载，结束后释放资源', async () => {
    const { captureFrame } = await import('./markFrame')
    const times = Array.from({ length: 10 }, (_, i) => i + 0.5)
    const frames = await Promise.all(times.map((t) => captureFrame('clip', t)))
    expect(frames).toEqual(times.map((t) => `clip@${t}`))
    expect(sources).toEqual(['clip'])
    expect(videos).toHaveLength(1)
    expect(peak).toBe(1)
    expect(alive).toBe(0)
  })
  it('第 0 秒已经解码时直接取图，不等待无意义的 seeked', async () => {
    const { captureFrame } = await import('./markFrame')
    expect(await captureFrame('clip', 0)).toBe('clip@0')
    expect(draws).toEqual(['clip@0'])
  })
  it('重复请求合并，但不同时间、不同源的帧不能串用', async () => {
    const { captureFrame } = await import('./markFrame')
    const first = captureFrame('a', 1.01)
    expect(captureFrame('a', 1.01)).toBe(first)
    expect(await Promise.all([first, captureFrame('a', 1.04), captureFrame('b', 1.01)]))
      .toEqual(['a@1.01', 'a@1.04', 'b@1.01'])
    expect(peak).toBe(1)
  })
  it('暂停在 1.4 秒的画面不能污染第 1 秒缓存，正在 seek 的旧帧不缓存', async () => {
    const { warmFrame, captureFrame, grabFrame } = await import('./markFrame')
    const v = new FakeVideo(); v.src = 'clip'; v.currentTime = 1.4
    expect(grabFrame(v as unknown as HTMLVideoElement, 'clip')).toBeNull()
    await Promise.resolve()
    warmFrame(v as unknown as HTMLVideoElement, 'clip')
    expect(await captureFrame('clip', 1.4)).toBe('clip@1.4')
    expect(await captureFrame('clip', 1)).toBe('clip@1')
  })
  it('一个视频超时后释放解码器，后面的任务仍可完成且失败请求可重试', async () => {
    vi.useFakeTimers()
    const { captureFrame } = await import('./markFrame')
    const failed = captureFrame('stall', 1)
    const checked = expect(failed).rejects.toThrow('timeout')
    const sameSource = expect(captureFrame('stall', 2)).rejects.toThrow('timeout')
    const next = captureFrame('good', 2)
    await vi.advanceTimersByTimeAsync(8000)
    await checked
    await sameSource
    expect(await next).toBe('good@2')
    expect(sources).toEqual(['stall', 'good'])
    expect(alive).toBe(0)
    const retry = captureFrame('stall', 1)
    expect(retry).not.toBe(failed)
    const retryChecked = expect(retry).rejects.toThrow('timeout')
    await vi.advanceTimersByTimeAsync(8000)
    await retryChecked
  })
})
