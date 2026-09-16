import { useRef, type PointerEvent } from 'react'
import type { Mat } from './materialLayout'
import { useFrame } from './markFrame'
import { useTip } from './useTip'
import { RANGE_MIN, adjustRange, dragRange, timecode, type MarkRegion, type TimeRange } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 指针捕获失败不该毁掉整个手势：有些环境给不出可捕获的 pointerId，捕不到就当普通拖拽走 */
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }
/** 十格缩略图各取自己那一段的中点，比十张同样的封面更像一条时间轴 */
function TrackFrame({ mat, t }: { mat: Mat; t: number }) {
  return <img src={useFrame(mat.src, t, mat.thumb)} alt="" />
}
/** 刻度：短片每秒一格，长片按十格摊开，免得一排数字挤成一条线 */
function ticksOf(duration: number): number[] {
  const dur = Math.floor(duration)
  const step = Math.max(1, Math.ceil(dur / 10))
  const out: number[] = []
  for (let t = 0; t <= dur; t += step) out.push(t)
  if (out[out.length - 1] !== dur) out.push(dur)
  return out
}
interface Props {
  mat: Mat
  range: TimeRange | null
  regions: MarkRegion[]
  head: number
  /** 非空 = 轨道点不了，原因挂在轨道自己身上悬浮说明 */
  why: string
  onRange: (range: TimeRange) => void
  /** 一段拉完（松手 / 回车）：选了哪一段就把这一段播一遍 */
  onPicked: () => void
  onSeek: (t: number) => void
  /** 拖之前先把当前草稿压进撤销栈 */
  onBegin: () => void
}
/** 时间轴：原来面板上那条，现在搬进弹窗，多了标记的位置钉。 */
export default function MarkTrack({ mat, range, regions, head, why, onRange, onPicked, onSeek, onBegin }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ action: 'start' | 'end' | 'move' | 'new'; x: number; range: TimeRange; anchor: number; moved: boolean } | null>(null)
  const { tip, node: tipNode } = useTip()
  const duration = mat.dur ?? 0
  const pct = (t: number) => `${duration ? clamp(t / duration, 0, 1) * 100 : 0}%`
  /** 选区两端收不过已圈的那几处（弹窗那边真正夹住），这里让读屏报出同一条边界 */
  const lo = regions.length ? Math.min(...regions.map((r) => r.t)) : Infinity
  const hi = regions.length ? Math.max(...regions.map((r) => r.t)) : -Infinity
  const timeAt = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return clamp((x - r.left) / r.width * duration, 0, duration)
  }
  const down = (e: PointerEvent<HTMLElement>, action?: 'start' | 'end' | 'move') => {
    if (why) return
    e.stopPropagation(); e.preventDefault()
    onBegin()
    capture(track.current, e.pointerId)
    if (range && action) { drag.current = { action, x: e.clientX, range: { ...range }, anchor: 0, moved: false }; return }
    // 空轨道上按下去就是从这一秒起手拉一段，松手前一直跟着指针
    const anchor = clamp(Math.round(timeAt(e.clientX)), 0, Math.floor(duration) - RANGE_MIN)
    const next = dragRange(anchor, anchor, duration)
    drag.current = { action: 'new', x: e.clientX, range: next, anchor, moved: false }
    onRange(next); onSeek(next.start)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || why) return
    if (Math.abs(e.clientX - d.x) < 3 && !d.moved) return
    d.moved = true
    if (d.action === 'new') { const next = dragRange(d.anchor, timeAt(e.clientX), duration); onRange(next); return }
    const delta = (e.clientX - d.x) / track.current!.getBoundingClientRect().width * duration
    const next = adjustRange(d.range, d.action, d.action === 'move' ? delta : d.range[d.action] + delta, duration)
    onRange(next); onSeek(next.start)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    // 在选区上按一下没拖动 = 想跳到那一秒看看，不是想搬动它
    if (d?.action === 'move' && !d.moved) onSeek(timeAt(e.clientX))
    drag.current = null
    release(track.current, e.pointerId)
    // 刚拉出来的这一段，松手就放一遍：选了哪一段，看到的就是哪一段
    if (d?.action === 'new') onPicked()
  }
  const nudge = (e: React.KeyboardEvent, action: 'start' | 'end' | 'move') => {
    e.stopPropagation()
    if (!range || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' ? -1 : 1
    onBegin()
    onRange(adjustRange(range, action, action === 'move' ? step : range[action] + step, duration))
  }
  return <div className="mark-track-wrap">
    <div className="timeline-heading">
      <span>{why ? '—' : range
        ? `${timecode(range.start)}–${timecode(range.end)}  ${range.end - range.start}s${regions.length ? `　◆ ${regions.length} 处` : ''}`
        : `00:00–${timecode(duration)}  全时长${regions.length ? `　◆ ${regions.length} 处` : ''}`}</span>
      <span className="mark-track-tag">timeline</span>
    </div>
    <div ref={track} className={`timeline-track${why ? ' disabled' : ''}`} tabIndex={0} aria-disabled={!!why}
      aria-label={why ? `视频时间轴：${why}` : '视频时间轴：按下并拖动选取一段时间'} {...tip(why || undefined)}
      onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={(e) => { e.stopPropagation(); if (why) return; if (e.key === 'Enter') { e.preventDefault(); onBegin(); onRange(dragRange(Math.round(head), Math.round(head), duration)); onPicked() } }}>
      <div className="timeline-frames" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <TrackFrame key={i} mat={mat} t={(i + 0.5) / 10 * duration} />)}
      </div>
      {range && !why && <div className="timeline-selection" style={{ left: pct(range.start), width: pct(range.end - range.start) }} onPointerDown={(e) => down(e, 'move')}>
        <div role="slider" aria-label="选区起点" aria-valuemin={0} aria-valuemax={Math.min(range.end - RANGE_MIN, lo)} aria-valuenow={range.start} aria-valuetext={timecode(range.start)} tabIndex={0}
          className="range-handle start" onPointerDown={(e) => down(e, 'start')} onKeyDown={(e) => nudge(e, 'start')}>Ⅱ</div>
        <span className="selection-grip" role="slider" aria-label="平移选区" aria-valuemin={0} aria-valuemax={Math.floor(duration) - (range.end - range.start)} aria-valuenow={range.start} tabIndex={0}
          onKeyDown={(e) => nudge(e, 'move')}>⋮⋮</span>
        <div role="slider" aria-label="选区终点" aria-valuemin={Math.max(range.start + RANGE_MIN, hi)} aria-valuemax={Math.floor(duration)} aria-valuenow={range.end} aria-valuetext={timecode(range.end)} tabIndex={0}
          className="range-handle end" onPointerDown={(e) => down(e, 'end')} onKeyDown={(e) => nudge(e, 'end')}>Ⅱ</div>
      </div>}
      {/* 标记落在哪一秒，轨道上就钉一枚。钉子只会落在选区里：选区收不过它们 */}
      {!why && regions.map((r, i) => <span key={i} aria-hidden className="mark-pin" style={{ left: pct(r.t) }} />)}
      <div className="timeline-playhead" style={{ left: pct(head) }} />
    </div>
    <div className="timeline-ticks" aria-hidden="true">{ticksOf(duration).map((t) => <span key={t}>{why ? '—' : timecode(t)}</span>)}</div>
    {tipNode}
  </div>
}
