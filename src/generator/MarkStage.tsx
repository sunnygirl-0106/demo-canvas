import { useRef, type PointerEvent, type RefObject } from 'react'
import type { Mat } from './materialLayout'
import { IcPlay } from '../ui/icons'
import MarkArt, { type Handle } from './MarkArt'
import { BRUSH_WIDTH, appendPoint, dragRect, strokeBox, timecode, tinyRect, type MarkDraft, type MarkRegion, type MarkTool, type Rect } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 指针捕获失败不该毁掉整个手势：有些环境给不出可捕获的 pointerId，捕不到就当普通拖拽走 */
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }
type Drag =
  | { mode: 'rect'; i: number; x0: number; y0: number }
  | { mode: 'move'; i: number; dx: number; dy: number; w: number; h: number }
  | { mode: 'brush'; i: number }
interface Props {
  mat: Mat
  video: RefObject<HTMLVideoElement>
  tool: MarkTool
  draft: MarkDraft
  /** 暂停停在哪一秒：这一秒的标记满亮，别的秒淡着 —— 一眼看得出「现在标的是哪一帧」 */
  second: number
  active: number
  paused: boolean
  playing: boolean
  /** 非空 = 源视频这会儿用不了，画面盖蒙版、手势全停 */
  veil: string
  loading: boolean
  onTogglePlay: () => void
  /** 按下去的那一刻：暂停到这一整秒，并把当前草稿压进撤销栈 */
  onBegin: (t: number) => void
  onDraft: (d: MarkDraft, active: number) => void
  /** 松手时发现只是误点了一下，退回按下之前 */
  onCancel: () => void
}
/** 画面区：真视频打底，标记画在上面。所有手势都在这里，草稿一律整份回传给弹窗。 */
export default function MarkStage({ mat, video, tool, draft, second, active, paused, playing, veil, loading, onTogglePlay, onBegin, onDraft, onCancel }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  /**
   * 手势期间一律读这一份，而不是 props 里的 draft：按下、移动、松手可能落在同一个任务里被 React 合批，
   * 那时 props 还停在按下之前，接着往上改就会把刚画出来的那一处又抹掉。
   */
  const live = useRef(draft)
  live.current = draft
  const commit = (next: MarkDraft, i: number) => { live.current = next; onDraft(next, i) }
  const at = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)] as const
  }
  const nowSecond = () => clamp(Math.round(video.current?.currentTime ?? second), 0, Math.floor(mat.dur ?? 0))
  const patch = (i: number, r: Partial<MarkRegion>) => {
    const d = live.current
    commit({ ...d, regions: d.regions.map((g, j) => j === i ? { ...g, ...r } : g) }, i)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (veil) return
    e.preventDefault()
    const t = nowSecond()
    onBegin(t)
    const [x, y] = at(e)
    capture(box.current, e.pointerId)
    const d = live.current
    if (tool === 'brush') {
      // 同一秒只有一个画笔区域：再涂一笔是往它里面加，不是又开一处 —— 清单和轨道上都只记一条
      const i = d.regions.findIndex((r) => r.tool === 'brush' && r.t === t)
      const strokes = i < 0 ? [[[x, y] as [number, number]]] : [...d.regions[i].strokes!, [[x, y] as [number, number]]]
      const region: MarkRegion = { t, tool: 'brush', width: BRUSH_WIDTH, strokes, rect: strokeBox(strokes) }
      const regions = i < 0 ? [...d.regions, region] : d.regions.map((r, j) => j === i ? region : r)
      const idx = i < 0 ? regions.length - 1 : i
      drag.current = { mode: 'brush', i: idx }
      commit({ ...d, regions }, idx)
      return
    }
    const regions = [...d.regions, { t, tool: 'box' as const, rect: [x, y, 0, 0] as Rect }]
    drag.current = { mode: 'rect', i: regions.length - 1, x0: x, y0: y }
    commit({ ...d, regions }, regions.length - 1)
  }
  const boxDown = (e: PointerEvent<HTMLElement>, i: number, handle: Handle | null) => {
    e.stopPropagation()
    if (veil) return
    e.preventDefault()
    const region = live.current.regions[i]
    if (!region) return
    onBegin(region.t)
    const [x, y] = at(e)
    const r = region.rect
    capture(box.current, e.pointerId)
    // 拖角就是从对角重新拉一个框，和新建走同一条路
    drag.current = handle
      ? { mode: 'rect', i, x0: handle === 'nw' || handle === 'sw' ? r[0] + r[2] : r[0], y0: handle === 'nw' || handle === 'ne' ? r[1] + r[3] : r[1] }
      : { mode: 'move', i, dx: x - r[0], dy: y - r[1], w: r[2], h: r[3] }
    onDraft(live.current, i)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const [x, y] = at(e)
    if (d.mode === 'rect') patch(d.i, { rect: dragRect(d.x0, d.y0, x, y) })
    else if (d.mode === 'move') patch(d.i, { rect: [clamp(x - d.dx, 0, 1 - d.w), clamp(y - d.dy, 0, 1 - d.h), d.w, d.h] })
    else {
      const region = live.current.regions[d.i]
      const strokes = region?.strokes && appendPoint(region.strokes, x, y)
      if (strokes) patch(d.i, { strokes, rect: strokeBox(strokes, region!.width) })
    }
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    release(box.current, e.pointerId)
    if (d?.mode !== 'rect') return
    // 按松手的那一点定稿，不靠中途收到过几次 move：只是点了一下、没拉出个框来就当误触退回去
    const [x, y] = at(e)
    const rect = dragRect(d.x0, d.y0, x, y)
    if (tinyRect(rect)) onCancel(); else patch(d.i, { rect })
  }
  return <div ref={box} className={`mark-stage${veil ? ' off' : ''}`} style={{ cursor: veil ? 'default' : 'crosshair' }}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <video ref={video} src={mat.src} poster={mat.thumb} playsInline muted preload="auto" aria-label={`${mat.name} 标记画面`} />
    <MarkArt regions={draft.regions} at={paused ? second : undefined} active={active} onBoxDown={boxDown} />
    {paused && !veil && <span className="mark-paused">已暂停在 <b>{timecode(second)}</b></span>}
    {!playing && !veil && <button className="mark-play" aria-label="播放" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onTogglePlay() }}><IcPlay size={22} /></button>}
    {veil && <div className="mark-veil" role="status">
      {loading && <i className="spin" aria-hidden />}
      <strong>{veil}</strong>
      <small>{loading ? '元数据到达后自动解锁标记工具' : '换一段能读出来的视频再试'}</small>
    </div>}
  </div>
}
