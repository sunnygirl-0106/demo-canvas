import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { shotName, useCanvas } from '../store/canvas'
import { captureFrame, grabFrame, REF_W } from '../generator/markFrame'
import Overlay from '../generator/Overlay'
import { useTip } from '../generator/useTip'
import {
  IcCamera, IcClapper, IcFirstFrame, IcGrid, IcLastFrame, IcMute, IcPause, IcPlay, IcScissors, IcSpeaker,
} from '../ui/icons'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 指针捕获失败不该毁掉整个手势：捕不到就当普通拖拽走（和 MarkStage / MarkTrack 同一套） */
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }
/**
 * 控制条上的时间读作 0:05，不是 00:05。
 * 这块画布上的视频都是几秒到十几秒，前面那位十位数恒等于 0 ——
 * 每看一眼都得先跳过一个不变的字符，才看得到真正在走的那一位。
 * 过了一分钟自然就补上了（1:05），所以不必另写一套。
 */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface Props {
  nodeId: string
  /** 节点上那块正在放的画面。控制条不自己持有 video，只是它的一排开关 */
  video: RefObject<HTMLVideoElement | null>
  src?: string
  /** 抓帧失败时的兜底（封面）：宁可给一张模糊的封面，也不要一个空节点 */
  poster?: string
  dur?: number
  /** 菜单开着时鼠标会走出节点，节点那头据此先别把画面停回起点 */
  onMenu: (open: boolean) => void
}

/**
 * 视频节点上的悬浮控制条：鼠标一进节点就浮出来，压在画面底边。
 *
 * 它只说「这段视频本身」的事 —— 放到哪儿了、有多长、要不要出声、以及对这条片子还能做什么；
 * 「拿它去生成点什么」那几件（局部修改、延长、版本、下载）归节点上方那排工具栏。
 * 两处分工按的是「动的是这一段，还是从这一段长出新的一段」，不是按功能多少凑的。
 *
 * 右上角那枚全屏键留着不动：它和版本卡片上的放大是同一件事（把这一幅看大），
 * 在哪个角点也该是同一处。
 */
export default function VideoHud({ nodeId, video, src, poster, dur, onMenu }: Props) {
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(dur ?? 0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement | null>(null)
  const dragging = useRef(false)
  const { tip, node: tipNode } = useTip()

  /**
   * 进度、播放状态一律问视频本身要 —— 控制条不记账。
   * 画面是可点的（点一下也暂停）、鼠标移出去会停回第 0 帧，
   * 控制条自己那份状态追不上这些，只有 video 上的事件追得上。
   */
  useEffect(() => {
    const v = video.current
    if (!v) return
    const sync = () => { setCur(v.currentTime); setPlaying(!v.paused); setMuted(v.muted) }
    const meta = () => { if (Number.isFinite(v.duration)) setTotal(v.duration) }
    sync(); meta()
    v.addEventListener('timeupdate', sync)
    v.addEventListener('play', sync)
    v.addEventListener('pause', sync)
    v.addEventListener('volumechange', sync)
    v.addEventListener('loadedmetadata', meta)
    return () => {
      v.removeEventListener('timeupdate', sync)
      v.removeEventListener('play', sync)
      v.removeEventListener('pause', sync)
      v.removeEventListener('volumechange', sync)
      v.removeEventListener('loadedmetadata', meta)
    }
  }, [video, src])

  const span = total || dur || 0
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const v = video.current
    const r = bar.current?.getBoundingClientRect()
    if (!v || !r || !span) return
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * span
    v.currentTime = t
    setCur(t)
  }
  /** 拖着走的时候画面跟着走：松手才看见结果的进度条，拖起来像在猜 */
  const barDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    dragging.current = true
    capture(bar.current, e.pointerId)
    seek(e)
  }
  const barMove = (e: PointerEvent<HTMLDivElement>) => { if (dragging.current) seek(e) }
  const barUp = (e: PointerEvent<HTMLDivElement>) => { dragging.current = false; release(bar.current, e.pointerId) }
  /** 键盘走到轨道上：左右各挪一秒 —— 鼠标能做的事，别让键盘只能看着 */
  const barKey = (e: React.KeyboardEvent) => {
    const v = video.current
    if (!v || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault(); e.stopPropagation()
    v.currentTime = clamp(v.currentTime + (e.key === 'ArrowRight' ? 1 : -1), 0, span)
  }

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => {}) ; else v.pause()
  }
  /**
   * 声音默认关着 —— 悬浮即播要带声音会被浏览器直接拦下来，一屏十来段一起响也没人想听。
   * 这枚开关是留给「这一段我要听听看」的那一下：用户自己点开的，浏览器就放行。
   */
  const sound = () => { const v = video.current; if (v) v.muted = !v.muted }

  const menu = (on: boolean) => { setOpen(on); onMenu(on) }

  /**
   * 截一帧：右边长出一张图片节点，并连回这段视频。
   * 当前帧就在眼前，直接从这块正在放的画面上拓一张；首尾帧要跳到另一处，走离屏那条路。
   * 两条路都失败就退回封面 —— 宁可给一张模糊的画面，也不要一个空节点。
   */
  const shoot = async (kind: 'now' | 'first' | 'last', label: string) => {
    if (!src) return
    const v = video.current
    /*
     * 先把这一帧拿到手，再关菜单 —— 反过来就截错了：
     * 菜单一关，鼠标多半已经不在画面上了，这段视频当场停回第 0 帧，
     * 而「当前帧」要的正是它刚才停着的那一帧。
     */
    const at = kind === 'first' ? 0 : kind === 'last' ? Math.max(0, span - 0.05) : v?.currentTime ?? 0
    const live = kind === 'now' ? grabFrame(v, src, REF_W) : null
    menu(false)
    const shot = live ?? await captureFrame(src, at, REF_W).catch(() => poster ?? '')
    if (!shot) return
    const store = useCanvas.getState()
    const source = store.nodes.find((n) => n.id === nodeId)
    if (!source) return
    store.spawnShot(nodeId, shotName(store.nodes, label, source), shot)
  }

  /*
   * 还没接上的那两条不置灰，照常是白的。
   *
   * 置灰说的是「这一条这会儿轮不到你」——条件不对、东西不在、轮到了就会亮。
   * 剪辑视频和一键分镜不是这么回事：它们是这个菜单里本来就该有的两件事，
   * 只是还没接上线。灰着摆在那儿，读出来成了「你这段视频剪不了」，
   * 可这里要说的明明是「马上就能剪」—— 两句话的意思正好相反。
   * 该说的那句交给悬浮时那条「即将上线」，不靠把字调暗来说。
   */
  const item = (icon: ReactNode, label: string, run?: () => void) => (
    <button role="menuitem" aria-label={run ? label : `${label}：即将上线`}
      {...tip(run ? undefined : '即将上线')}
      onClick={() => run?.()}>{icon}{label}</button>
  )

  const pct = span ? clamp(cur / span, 0, 1) * 100 : 0
  return (
    <div className={`vhud nodrag nowheel${open ? ' on' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <button className="vhud-key" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>
        {playing ? <IcPause size={15} /> : <IcPlay size={15} />}
      </button>
      <span className="t">{clock(cur)}</span>
      <div ref={bar} className="vhud-bar" role="slider" tabIndex={0} aria-label="播放进度"
        aria-valuemin={0} aria-valuemax={Math.round(span)} aria-valuenow={Math.round(cur)} aria-valuetext={clock(cur)}
        onPointerDown={barDown} onPointerMove={barMove} onPointerUp={barUp} onPointerCancel={barUp} onKeyDown={barKey}>
        <i><b style={{ width: `${pct}%` }} /></i>
      </div>
      <span className="t">{clock(span)}</span>
      <button className="vhud-key" aria-label={muted ? '取消静音' : '静音'} aria-pressed={muted} onClick={sound}>
        {muted ? <IcMute size={14} sw={1.8} /> : <IcSpeaker size={14} sw={1.8} />}
      </button>
      <button ref={more} className="vhud-more" aria-label="更多操作" aria-haspopup="menu" aria-expanded={open}
        onClick={() => menu(!open)}>
        <IcClapper size={14} sw={1.7} />
      </button>
      {open && (
        /* 菜单走浮层而不是画面里的一层绝对定位：节点体是 overflow:hidden 的，
           横片只有 200px 高，五条菜单在里面会被切掉大半截 */
        <Overlay label="视频操作" anchor={more} align="end" className="vhud-menu" onClose={() => menu(false)}>
          <div role="menu" aria-label="视频操作">
            {item(<IcScissors size={15} sw={1.7} />, '剪辑视频')}
            {item(<IcGrid size={15} sw={1.7} />, '一键分镜')}
            <span className="sep" />
            {item(<IcCamera size={15} sw={1.7} />, '截取当前帧', () => void shoot('now', '当前帧'))}
            {item(<IcFirstFrame size={15} sw={1.7} />, '截取首帧', () => void shoot('first', '首帧'))}
            {item(<IcLastFrame size={15} sw={1.7} />, '截取尾帧', () => void shoot('last', '尾帧'))}
          </div>
          {tipNode}
        </Overlay>
      )}
    </div>
  )
}
