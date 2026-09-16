import { useEffect, useRef, useState } from 'react'
import { captureFrame, REF_W } from './markFrame'
import { BRUSH_WIDTH, timecode, type MarkGroup, type MarkRegion } from './marks'
/**
 * 标记参考图：圈完就自动把那一帧连同画上去的标记截下来，挂到源视频右边当参考素材。
 *
 * 句子里的标签说的是「第几秒、哪一块」，模型真正看得懂的是一张画着框的图 ——
 * 这张图不用用户自己去截、去画、再拖进来，标记本身就已经把它说清楚了。
 * 一秒一张：同一秒圈了两块就画在同一张上，不同秒是不同的画面，各出各的。
 */
export interface MarkShot {
  /** 缓存与 React key：秒数 + 这一秒上标记的样子，标记改了这一串就变，图跟着重画 */
  key: string
  t: number
  regions: MarkRegion[]
  /** 还没画出来时是 undefined，面板上先摆一个占位方块 */
  url?: string
}
const round = (n: number) => n.toFixed(3)
/** 这一秒的标记长什么样。动了一个框、多画一笔，这一串就不一样，缓存自然失效。 */
const sign = (t: number, regions: MarkRegion[]) => `${t}|` + regions.map((r) =>
  `${r.tool}:${r.rect.map(round).join(',')}:${(r.strokes ?? []).map((st) => st.length).join('.')}`).join('/')
/**
 * 要截哪几张：把所有组里的标记按秒归拢，一秒一张，按时间先后排。
 * 组只是弹窗会话的容器，参考图关心的是画面 —— 两次会话圈在同一秒上，画的是同一帧。
 */
export function shotPlan(marks: MarkGroup[]): MarkShot[] {
  const at = new Map<number, MarkRegion[]>()
  for (const g of marks) for (const r of g.regions) at.set(r.t, [...(at.get(r.t) ?? []), r])
  return [...at.entries()].sort((a, b) => a[0] - b[0])
    .map(([t, regions]) => ({ key: sign(t, regions), t, regions }))
}

const MARK = '#ff4d5a'
const HALO = 'rgba(255,77,90,.42)'
/** 画在图上的标记和画面上看到的是同一套：框一条红线压一圈暗边，笔迹一粗一细两条。 */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number, regions: MarkRegion[]) {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const unit = Math.max(1, w / 320)
  for (const r of regions) {
    if (r.tool === 'brush' && r.strokes?.length) {
      for (const st of r.strokes) {
        const line = () => {
          ctx.beginPath()
          // 只点了一下的那一笔：给一丁点位移，圆头才画得出一个点
          if (st.length === 1) { ctx.moveTo(st[0][0] * w, st[0][1] * h); ctx.lineTo(st[0][0] * w + 0.01, st[0][1] * h) }
          else st.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)))
          ctx.stroke()
        }
        ctx.strokeStyle = HALO; ctx.lineWidth = (r.width ?? BRUSH_WIDTH) * w; line()
        ctx.strokeStyle = MARK; ctx.lineWidth = 1.5 * unit; line()
      }
      continue
    }
    const [x, y, rw, rh] = r.rect
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3 * unit
    ctx.strokeRect(x * w, y * h, rw * w, rh * h)
    ctx.strokeStyle = MARK; ctx.lineWidth = 1.5 * unit
    ctx.strokeRect(x * w, y * h, rw * w, rh * h)
  }
}
const cache = new Map<string, Promise<string>>()
/** 抓第 t 秒那一帧，把这一秒的标记画上去。抓不出来就 reject —— 面板上那一格不出现，不报错。 */
export function markShot(src: string, t: number, regions: MarkRegion[]): Promise<string> {
  const k = `${src}#${sign(t, regions)}`
  const hit = cache.get(k)
  if (hit) return hit
  const job = captureFrame(src, t, REF_W).then((frame) => new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d')); return }
      ctx.drawImage(img, 0, 0)
      paint(ctx, canvas.width, canvas.height, regions)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => reject(new Error('frame'))
    img.src = frame
  }))
  job.catch(() => cache.delete(k))
  cache.set(k, job)
  return job
}
/** 参考图上读出来的那一句：给读屏和悬浮卡用。 */
export const shotLabel = (s: MarkShot) =>
  `${timecode(s.t)} 的标记参考图，画着这一秒标的 ${s.regions.length} 处`
/**
 * 句子里现在标着什么，右边就挂着哪几张参考图 —— 标记删掉，图跟着消失。
 * 图不进草稿：它完全由标记决定，存一份只会多出一个可能和句子对不上的状态。
 */
export function useMarkShots(src: string | undefined, marks: MarkGroup[]): MarkShot[] {
  const plan = shotPlan(marks)
  const sig = plan.map((s) => s.key).join('|')
  const live = useRef(plan); live.current = plan
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!src) return
    let alive = true
    for (const s of live.current) {
      if (urls[s.key]) continue
      markShot(src, s.t, s.regions).then((url) => {
        if (alive) setUrls((m) => (m[s.key] === url ? m : { ...m, [s.key]: url }))
      }, () => undefined)
    }
    return () => { alive = false }
    // urls 只用来跳过已经画好的那几张，不该因为它变了就再跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, sig])
  return plan.map((s) => ({ ...s, url: urls[s.key] }))
}
