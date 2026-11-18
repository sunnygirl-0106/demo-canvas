import { useEffect, useState } from 'react'
/**
 * 「第 t 秒那一帧」的缓存。标记 chip、展开清单、悬浮卡、轨道上的十格都要它，
 * 而且它们会跟着提示词的每一次敲键重渲染 —— 所以抓一次存住，再渲染只是换一个 img src。
 *
 * 存的是**没画标记的干净帧**：键只有 (src, t)，改动某一处区域不会让缓存失效，
 * 标记一律用 MarkArt 画在图上面，同一份 markup 从 17px 用到 560px。
 */
const cache = new Map<string, Promise<string>>()
const key = (src: string, t: number, w: number) => JSON.stringify([src, t, w])
function remember(k: string, value: Promise<string>) {
  cache.delete(k)
  cache.set(k, value)
  if (cache.size > 128) cache.delete(cache.keys().next().value!)
}
/** 缩略图不需要清晰，够看出是哪一帧就行；宽度定死，高度按视频真实比例算。 */
export const SHOT_W = 320
/** 标记参考图是要当输入用的，得看得清画面本身，所以单独抓一份大的。 */
export const REF_W = 960

function shoot(video: HTMLVideoElement, w = SHOT_W): string | null {
  if (video.seeking || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(w, video.videoWidth)
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', w > SHOT_W ? 0.86 : 0.72)
  } catch { return null }
}
/**
 * 从正在播的那块画面上直接拓一张：它此刻就停在这一帧，drawImage 是一毫秒的事，
 * 不必再离屏解码一遍（那要几百毫秒，点下去到出图之间会空一拍）。
 * 拓下来的同时顺手存进缓存 —— 同一帧别处再要，就不用再解一遍。
 * 画面还没解出来（videoWidth 为 0）就返回 null，由调用方退回离屏那条路。
 */
export function grabFrame(video: HTMLVideoElement | null | undefined, src: string, w = SHOT_W): string | null {
  if (!video) return null
  const shot = shoot(video, w)
  if (shot) remember(key(src, video.currentTime, w), Promise.resolve(shot))
  return shot
}
type FrameJob = { src: string; t: number; w: number; resolve: (shot: string) => void; reject: (error: unknown) => void }
const queue: FrameJob[] = []
let working = false

/** 时间轴的十张图共用一个离屏解码器，避免同时下载、解码十份原片。 */
async function drain() {
  if (working) return
  working = true
  let video: HTMLVideoElement | undefined
  let source: string | undefined
  const release = () => {
    if (video) { video.removeAttribute('src'); video.load() }
    video = undefined; source = undefined
  }
  try {
    while (queue.length) {
      const job = queue.shift()!
      try {
        if (!video) {
          video = document.createElement('video')
          video.preload = 'auto'; video.muted = true; video.crossOrigin = 'anonymous'
        }
        const sameSource = source === job.src
        source = job.src
        job.resolve(await decode(video, job, sameSource))
      } catch (error) {
        release(); job.reject(error)
        // 同一源加载失败时整条时间轴退回封面，别让十张图逐张超时并堵住其他视频。
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].src === job.src) queue.splice(i, 1)[0].reject(error)
        }
      }
    }
  } finally { release(); working = false }
}

function decode(video: HTMLVideoElement, { src, t, w }: FrameJob, sameSource: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.onloadeddata = video.onseeked = video.onerror = null
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, 8000)
    video.onerror = () => { cleanup(); reject(new Error('error')) }
    const finish = () => {
      const shot = shoot(video, w)
      cleanup()
      shot ? resolve(shot) : reject(new Error('blank'))
    }
    const seek = () => {
      video.onloadeddata = null
      const target = Math.max(0, Math.min(t, Math.max(0, video.duration - 0.05)))
      // 第 0 秒已经解好时无需等一次可能不会发生的 seeked。
      if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2 && !video.seeking) finish()
      else video.currentTime = target
    }
    video.onloadeddata = seek
    video.onseeked = finish
    if (sameSource && video.readyState >= 2) seek()
    else if (!sameSource) video.src = src
  })
}

/** 抓不出来就 reject，调用方退回封面；失败后可重试。 */
export function captureFrame(src: string, t: number, w = SHOT_W): Promise<string> {
  const k = key(src, t, w)
  const hit = cache.get(k)
  if (hit) return hit
  const job = new Promise<string>((resolve, reject) => queue.push({ src, t, w, resolve, reject }))
  remember(k, job)
  job.catch(() => { if (cache.get(k) === job) cache.delete(k) })
  void drain()
  return job
}
/**
 * 把弹窗里那个 `<video>` 已经解到的这一帧顺手存下来。
 * 它刚刚就停在这一秒上，drawImage 是一毫秒的事 —— 标记一提交，句子里的 chip 立刻就有图。
 */
export function warmFrame(video: HTMLVideoElement | null, src: string) {
  if (!video) return
  const k = key(src, video.currentTime, SHOT_W)
  if (cache.has(k)) return
  const shot = shoot(video)
  if (shot) remember(k, Promise.resolve(shot))
}
/** 抓到之前先用封面顶着，永远不给一个空框。 */
export function useFrame(src: string | undefined, t: number, fallback?: string): string | undefined {
  const [shot, setShot] = useState<{ key: string; url: string }>()
  const wanted = src ? key(src, t, SHOT_W) : ''
  useEffect(() => {
    if (!src) { setShot(undefined); return }
    let alive = true
    captureFrame(src, t).then((url) => { if (alive) setShot({ key: key(src, t, SHOT_W), url }) }, () => { if (alive) setShot(undefined) })
    return () => { alive = false }
  }, [src, t])
  return shot?.key === wanted ? shot.url : fallback
}
