import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { IcMute, IcSpeaker } from '../ui/icons'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 指针捕获失败不该毁掉整个手势：捕不到就当普通拖拽走（和节点上那条控制条同一套） */
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }

/**
 * 压在版本画面底边的那条迷你轴：一根轴、一枚喇叭，再没别的。
 *
 * 播放键不摆 —— 鼠标压上来这一版就已经在放了，再给一枚「播放」是在说一件已经发生的事。
 * 时间码也不摆：一张两百来像素宽的卡片，左右各一组数字，轴就只剩中间半截，
 * 而这一屏要问的只是「放到哪儿了」——那是轴自己的形状就能答的，不必写成数字。
 * 截帧、剪辑、分镜那些一概不摆：它们是「拿这一段去做别的事」，归画布上那条控制条。
 */
function ShotHud({ video, src }: { video: React.RefObject<HTMLVideoElement | null>; src?: string }) {
  const [cur, setCur] = useState(0)
  const [span, setSpan] = useState(0)
  const [muted, setMuted] = useState(true)
  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  /** 进度和声音一律问视频本身要：画面会被 hover 停回第 0 帧，只有 video 上的事件追得上 */
  useEffect(() => {
    const v = video.current
    if (!v) return
    const sync = () => { setCur(v.currentTime); setMuted(v.muted) }
    const meta = () => { if (Number.isFinite(v.duration)) setSpan(v.duration) }
    sync(); meta()
    v.addEventListener('timeupdate', sync)
    v.addEventListener('pause', sync)
    v.addEventListener('volumechange', sync)
    v.addEventListener('loadedmetadata', meta)
    return () => {
      v.removeEventListener('timeupdate', sync)
      v.removeEventListener('pause', sync)
      v.removeEventListener('volumechange', sync)
      v.removeEventListener('loadedmetadata', meta)
    }
  }, [video, src])

  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const v = video.current
    const r = bar.current?.getBoundingClientRect()
    if (!v || !r || !span) return
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * span
    v.currentTime = t
    setCur(t)
  }
  /** 拖着走的时候画面跟着走：松手才看见结果的进度条，拖起来像在猜 */
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault()
    dragging.current = true
    capture(bar.current, e.pointerId)
    seek(e)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => { if (dragging.current) seek(e) }
  const up = (e: PointerEvent<HTMLDivElement>) => { dragging.current = false; release(bar.current, e.pointerId) }
  /** 键盘走到轨道上：左右各挪一秒 —— 鼠标能做的事，别让键盘只能看着 */
  const key = (e: React.KeyboardEvent) => {
    const v = video.current
    if (!v || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault(); e.stopPropagation()
    v.currentTime = clamp(v.currentTime + (e.key === 'ArrowRight' ? 1 : -1), 0, span)
  }
  /**
   * 声音默认关着 —— 悬浮即播要带声音会被浏览器直接拦下来，一屏卡片一起响也没人想听。
   * 这枚开关是留给「这一版我要听听看」的那一下：用户自己点的，浏览器就放行。
   */
  const sound = () => { const v = video.current; if (v) v.muted = !v.muted }

  const pct = span ? clamp(cur / span, 0, 1) * 100 : 0
  return (
    <div className="vp-hud" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div ref={bar} className="vp-bar" role="slider" tabIndex={0} aria-label="播放进度"
        aria-valuemin={0} aria-valuemax={Math.round(span)} aria-valuenow={Math.round(cur)}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <i><b style={{ width: `${pct}%` }} /></i>
      </div>
      <button className="vp-sound" aria-label={muted ? '取消静音' : '静音'} aria-pressed={muted} onClick={sound}>
        {muted ? <IcMute size={14} sw={1.8} /> : <IcSpeaker size={14} sw={1.8} />}
      </button>
    </div>
  )
}

/**
 * 「全部版本」里的一版画面 —— 列表页那张卡片和详情页那块竖版用的是同一个。
 *
 * 鼠标压上来就开始放，移开停回第 0 帧：和画布上的视频节点同一个读法
 * （为什么是 hover 而不是一枚播放键，见 VideoNode 里那一段）。一屏卡片是用来认出「是哪一幅」的，
 * 每张上各压一枚播放键，先看见的就成了一排按钮；而「看看这一版是什么」本来只是把鼠标放上去这么一下。
 * 停下来回到第 0 帧，不停在半路：一屏卡片各停在各自被瞥到的那一秒，整屏就花了。
 *
 * 右上角那一撮（便签 + 放大镜）原样留着，从外面传进来 —— 它们说的是「这一版是怎么来的、想看大图点这儿」，
 * 和放不放没关系。列表页还要把画面包进「进详情」那枚按钮里（wrap）：按钮里不能再嵌按钮，
 * 所以轴和角标都只能是它的兄弟，不能住在它里面。
 */
export default function VersionShot({ media, grad, className, style, corner, wrap }: {
  media: { src?: string; poster?: string }
  grad: string
  /** 外层那一块：列表页是卡片（vp-card），详情页是按原片比例摊开的那块屏（vp-still） */
  className: string
  /** 详情页那块屏的宽高由素材比例算出来，不是样式表里的一个定值（见 VersionsDialog 的 stillBox） */
  style?: CSSProperties
  corner?: ReactNode
  wrap?: (shot: ReactNode) => ReactNode
}) {
  const video = useRef<HTMLVideoElement>(null)
  const play = () => { void video.current?.play().catch(() => {}) }
  const stop = () => { const v = video.current; if (!v) return; v.pause(); v.currentTime = 0 }

  const shot = (
    <span className="vp-shot" style={{ background: grad }}>
      {/* muted 是悬浮即播的前提：带声音的自动播放会被浏览器拦下来（喇叭那枚开关另说） */}
      {media.src
        ? <video ref={video} src={media.src} poster={media.poster} playsInline loop muted preload="metadata" />
        : media.poster && <img src={media.poster} alt="" />}
    </span>
  )
  return (
    <div className={className} style={style} onMouseEnter={play} onMouseLeave={stop}>
      {wrap ? wrap(shot) : shot}
      {corner}
      {media.src && <ShotHud video={video} src={media.src} />}
    </div>
  )
}
