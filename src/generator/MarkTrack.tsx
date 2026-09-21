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
function TrackFrame({ mat, t, dim }: { mat: Mat; t: number; dim: boolean }) {
  return <img className={dim ? 'dim' : ''} src={useFrame(mat.src, t, mat.thumb)} alt="" />
}
/** 一格缩略图代表的那一段时间：选区之外的那几格暗下去，选了哪一段一眼就看得见 */
const FRAMES = 10
/**
 * 刻度上的数字。一分钟以内的短片按秒读（`0s 1 2 … 8s`）：这一排数字是拿来数格子的，
 * 每个都写成 00:0X，读的人得先跳过那四个一模一样的字符才看得到有用的那一位。
 * 只有首尾带单位 —— 单位说一次就够，中间那几个是同一把尺子上的刻度。
 * 过了一分钟秒数就不再是直觉，换回时间码。
 */
const tickLabel = (t: number, i: number, all: number[], duration: number) =>
  duration > 60 ? timecode(t) : (i === 0 || i === all.length - 1 ? `${t}s` : String(t))
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
/** 时间轴：长在专注态节点上、画面下面那一截，多了标记的位置钉。 */
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
  const lit = (t: number) => !range || (t >= range.start && t <= range.end)
  return <div className="mark-track-wrap">
    {/*
      时间轴自己是一张卡片：上面一行把这一段读出来（起点 → 终点、多长），下面才是可拖的那条轨。
      读数和手势分两层，拖的时候读数不会跟着缩略图一起晃。
      上面不再顶一枚「SEGMENT」的标签 —— 这一整块就是那一段，标签只是把它又叫了一遍。
    */}
    <div className="seg-card">
      <div className="seg-head">
        <span className="seg-span">
          <b>{why ? '—' : timecode(range?.start ?? 0)}</b>
          <i aria-hidden>→</i>
          <b>{why ? '—' : timecode(range?.end ?? duration)}</b>
        </span>
        <span className="seg-dur">{why ? '—' : `${(range ? range.end - range.start : Math.floor(duration))}s`}</span>
      </div>
      {/* 尺子只报刻度，不收手势：高的那几根对着下面那行数字，矮的是它们中间的半格 */}
      <div className="seg-ruler" aria-hidden="true">
        {ticksOf(duration).map((t, i, all) => <span key={t} className="seg-tick">
          <i className="tall" />{i < all.length - 1 && <i className="half" />}
        </span>)}
      </div>
      <div className="timeline-ticks" aria-hidden="true">{ticksOf(duration).map((t, i, all) =>
        <span key={t}>{why ? '—' : tickLabel(t, i, all, duration)}</span>)}</div>
      <div className="seg-body">
        <div ref={track} className={`timeline-track${why ? ' disabled' : ''}`} tabIndex={0} aria-disabled={!!why}
          aria-label={why ? `视频时间轴：${why}` : '视频时间轴：按下并拖动选取一段时间'} {...tip(why || undefined)}
          onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onKeyDown={(e) => { e.stopPropagation(); if (why) return; if (e.key === 'Enter') { e.preventDefault(); onBegin(); onRange(dragRange(Math.round(head), Math.round(head), duration)); onPicked() } }}>
          <div className="timeline-frames" aria-hidden="true">
            {Array.from({ length: FRAMES }, (_, i) => {
              const t = (i + 0.5) / FRAMES * duration
              return <TrackFrame key={i} mat={mat} t={t} dim={!why && !lit(t)} />
            })}
          </div>
          {range && !why && <div className="timeline-selection" style={{ left: pct(range.start), width: pct(range.end - range.start) }} onPointerDown={(e) => down(e, 'move')}>
            <div role="slider" aria-label="选区起点" aria-valuemin={0} aria-valuemax={Math.min(range.end - RANGE_MIN, lo)} aria-valuenow={range.start} aria-valuetext={timecode(range.start)} tabIndex={0}
              className="range-handle start" onPointerDown={(e) => down(e, 'start')} onKeyDown={(e) => nudge(e, 'start')} />
            <span className="selection-grip" role="slider" aria-label="平移选区" aria-valuemin={0} aria-valuemax={Math.floor(duration) - (range.end - range.start)} aria-valuenow={range.start} tabIndex={0}
              onKeyDown={(e) => nudge(e, 'move')} />
            <div role="slider" aria-label="选区终点" aria-valuemin={Math.max(range.start + RANGE_MIN, hi)} aria-valuemax={Math.floor(duration)} aria-valuenow={range.end} aria-valuetext={timecode(range.end)} tabIndex={0}
              className="range-handle end" onPointerDown={(e) => down(e, 'end')} onKeyDown={(e) => nudge(e, 'end')} />
            <i className="selection-edge" aria-hidden />
          </div>}
          {/* 标记落在哪一秒，轨道上就钉一枚。钉子只会落在选区里：选区收不过它们 */}
          {!why && regions.map((r, i) => <span key={i} aria-hidden className="mark-pin" style={{ left: pct(r.t) }} />)}
          <div className="timeline-playhead" style={{ left: pct(head) }}><i aria-hidden /></div>
        </div>
      </div>
    </div>
    {tipNode}
  </div>
}
