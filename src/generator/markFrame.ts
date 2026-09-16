import { useEffect, useState } from 'react'
/**
 * 「第 t 秒那一帧」的缓存。标记 chip、展开清单、悬浮卡、轨道上的十格都要它，
 * 而且它们会跟着提示词的每一次敲键重渲染 —— 所以抓一次存住，再渲染只是换一个 img src。
 *
 * 存的是**没画标记的干净帧**：键只有 (src, t)，改动某一处区域不会让缓存失效，
 * 标记一律用 MarkArt 画在图上面，同一份 markup 从 17px 用到 560px。
 */
const cache = new Map<string, Promise<string>>()
const key = (src: string, t: number, w: number) => `${src}@${Math.round(t * 10) / 10}#${w}`
/** 缩略图不需要清晰，够看出是哪一帧就行；宽度定死，高度按视频真实比例算。 */
export const SHOT_W = 320
/** 标记参考图是要当输入用的，得看得清画面本身，所以单独抓一份大的。 */
export const REF_W = 960

function shoot(video: HTMLVideoElement, w = SHOT_W): string | null {
  if (!video.videoWidth || !video.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(w, video.videoWidth)
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', w > SHOT_W ? 0.86 : 0.72)
}
/** 离屏解一遍视频，抓第 t 秒。抓不出来就 reject，调用方退回封面 —— 这是装饰，不报错。 */
export function captureFrame(src: string, t: number, w = SHOT_W): Promise<string> {
  const k = key(src, t, w)
  const hit = cache.get(k)
  if (hit) return hit
  const job = new Promise<string>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'; video.muted = true; video.crossOrigin = 'anonymous'
    const cleanup = () => {
      clearTimeout(timer)
      video.onloadeddata = video.onseeked = video.onerror = null
      video.removeAttribute('src'); video.load()
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, 8000)
    video.onerror = () => { cleanup(); reject(new Error('error')) }
    video.onloadeddata = () => { video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05)) }
    video.onseeked = () => {
      const shot = shoot(video, w)
      cleanup()
      shot ? resolve(shot) : reject(new Error('blank'))
    }
    video.src = src
  })
  job.catch(() => cache.delete(k)) // 失败不留脏缓存，下次还能再试
  cache.set(k, job)
  return job
}
/**
 * 把弹窗里那个 `<video>` 已经解到的这一帧顺手存下来。
 * 它刚刚就停在这一秒上，drawImage 是一毫秒的事 —— 标记一提交，句子里的 chip 立刻就有图。
 */
export function warmFrame(video: HTMLVideoElement | null, src: string, t: number) {
  if (!video) return
  const k = key(src, t, SHOT_W)
  if (cache.has(k)) return
  const shot = shoot(video)
  if (shot) cache.set(k, Promise.resolve(shot))
}
/** 抓到之前先用封面顶着，永远不给一个空框。 */
export function useFrame(src: string | undefined, t: number, fallback?: string): string | undefined {
  const [shot, setShot] = useState<string>()
  useEffect(() => {
    if (!src) { setShot(undefined); return }
    let alive = true
    captureFrame(src, t).then((s) => { if (alive) setShot(s) }, () => { if (alive) setShot(undefined) })
    return () => { alive = false }
  }, [src, t])
  return shot ?? fallback
}
