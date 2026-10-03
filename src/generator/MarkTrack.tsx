import { useRef, type PointerEvent } from 'react'
import type { Mat } from './materialLayout'
import { useFrame } from './markFrame'
import { useTip } from './useTip'
import { IcTrash } from '../ui/icons'
import { RANGE_MIN, adjustRange, defaultSegment, dragRange, pinnedBy, rangeAt, rangeBounds, rangeLabel,
  rangesTotal, sortRanges, timecode, type MarkRegion, type TimeRange } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** 指针捕获失败不该毁掉整个手势：有些环境给不出可捕获的 pointerId，捕不到就当普通拖拽走 */
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }
/** 十格缩略图各取自己那一段的中点，比十张同样的封面更像一条时间轴 */
function TrackFrame({ mat, t, dim }: { mat: Mat; t: number; dim: boolean }) {
  return <img className={dim ? 'dim' : ''} src={useFrame(mat.src, t, mat.thumb)} alt="" />
}
/** 一格缩略图代表的那一段时间：选中的那几段之外的格子暗下去，选了哪几段一眼就看得见 */
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
  /** 选中的那几段，按先后排好。空着不会走到这里 —— 一段都没选时整条轨道都不长出来 */
  ranges: TimeRange[]
  /** 眼下在看第几段：播放和圈选都发生在它里面，轨道上把它描亮 */
  pick: number
  regions: MarkRegion[]
  head: number
  /** 非空 = 轨道点不了，原因挂在轨道自己身上悬浮说明 */
  why: string
  /** 改完的整份清单回传：第二个参数是这一下动的是第几段，第三个说这一下是不是**新选**出一段 */
  onRanges: (ranges: TimeRange[], at: number, fresh?: boolean) => void
  /** 扔掉第 i 段（连同圈在它里面的那几处） */
  onDrop: (i: number) => void
  /** 一段拉完（松手 / 回车）：选了哪一段就把这一段播一遍 */
  onPicked: () => void
  onSeek: (t: number) => void
  /** 拖之前先把当前草稿压进撤销栈 */
  onBegin: () => void
}
/** 时间轴：长在专注态节点上、画面下面那一截，多了标记的位置钉。 */
export default function MarkTrack({ mat, ranges, pick, regions, head, why, onRanges, onDrop, onPicked, onSeek, onBegin }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ action: 'start' | 'end' | 'move' | 'new'; i: number; x: number; range: TimeRange
    anchor: number; lo: number; hi: number; moved: boolean } | null>(null)
  const { tip, node: tipNode } = useTip()
  const duration = mat.dur ?? 0
  const pct = (t: number) => `${duration ? clamp(t / duration, 0, 1) * 100 : 0}%`
  const cur = ranges[pick] ?? ranges[0] ?? null
  /** 某一段两端收不过圈在它里面的那几处（adjustRange 真正夹住），读屏报的也是这一条边界 */
  const pinned = (r: TimeRange) => pinnedBy(regions, r)
  const timeAt = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return clamp((x - r.left) / r.width * duration, 0, duration)
  }
  /**
   * 这一秒所在的空隙有多宽：左边最近那一段的尾、右边最近那一段的头。
   * 新拉的一段只能在这条空隙里长 —— 段与段不许叠，叠起来的两段说的是同一截时间。
   */
  const gapAt = (t: number): [number, number] => {
    let lo = 0, hi = Math.floor(duration)
    for (const r of ranges) {
      if (r.end <= t) lo = Math.max(lo, r.end)
      if (r.start >= t) { hi = Math.min(hi, r.start); break }
    }
    return [lo, hi]
  }
  const put = (i: number, r: TimeRange, fresh = false) => onRanges(ranges.map((x, j) => j === i ? r : x), i, fresh)
  /** 在空处按下去：就地选上一段，松手前一直跟着指针走 */
  const start = (e: PointerEvent<HTMLElement>) => {
    const t = timeAt(e.clientX)
    // 点在已选的那一段上：交给那一段自己的手势（这里只会收到落在空处的那几下）
    if (rangeAt(ranges, t) >= 0) return
    const [lo, hi] = gapAt(t)
    // 这条空隙摆不下一秒：这一下什么也不选，也就不必压撤销栈
    if (hi - lo < RANGE_MIN) return
    onBegin()
    capture(track.current, e.pointerId)
    const anchor = clamp(Math.round(t), lo, hi - RANGE_MIN)
    const next = dragRange(anchor, anchor, duration, lo, hi)
    const list = sortRanges([...ranges, next])
    const i = list.indexOf(next)
    drag.current = { action: 'new', i, x: e.clientX, range: next, anchor, lo, hi, moved: false }
    onRanges(list, i, true); onSeek(next.start)
  }
  const down = (e: PointerEvent<HTMLElement>, i?: number, action?: 'start' | 'end' | 'move') => {
    if (why) return
    e.stopPropagation(); e.preventDefault()
    if (i == null || !action) { start(e); return }
    onBegin()
    capture(track.current, e.pointerId)
    const [lo, hi] = rangeBounds(ranges, i, duration)
    drag.current = { action, i, x: e.clientX, range: { ...ranges[i] }, anchor: 0, lo, hi, moved: false }
    // 按在哪一段上，眼下看的就换成哪一段：还没动手，先把注意力挪过去
    if (i !== pick) onRanges(ranges, i)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || why) return
    if (Math.abs(e.clientX - d.x) < 3 && !d.moved) return
    d.moved = true
    if (d.action === 'new') { put(d.i, dragRange(d.anchor, timeAt(e.clientX), duration, d.lo, d.hi), true); return }
    const delta = (e.clientX - d.x) / track.current!.getBoundingClientRect().width * duration
    const next = adjustRange(d.range, d.action, d.action === 'move' ? delta : d.range[d.action] + delta,
      duration, d.lo, d.hi, pinned(d.range))
    put(d.i, next); onSeek(next.start)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    // 在选区上按一下没拖动 = 想跳到那一秒看看，不是想搬动它
    if (d?.action === 'move' && !d.moved) onSeek(timeAt(e.clientX))
    drag.current = null
    release(track.current, e.pointerId)
    if (d?.action !== 'new') return
    // 只是点了一下：那一下就是「选上这一段」，摊开成默认那一档（4 秒，也是最短那一档）
    if (!d.moved) {
      const seg = defaultSegment(d.anchor, duration, d.lo, d.hi)
      if (seg) put(d.i, seg, true)
    }
    // 刚选出来的这一段，松手就放一遍：选了哪一段，看到的就是哪一段
    onPicked()
  }
  const nudge = (e: React.KeyboardEvent, i: number, action: 'start' | 'end' | 'move') => {
    e.stopPropagation()
    const r = ranges[i]
    if (!r || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' ? -1 : 1
    const [lo, hi] = rangeBounds(ranges, i, duration)
    onBegin()
    put(i, adjustRange(r, action, action === 'move' ? step : r[action] + step, duration, lo, hi, pinned(r)))
  }
  /** 回车 = 在播放头这一秒再选一段：键盘上和「点一下轨道」是同一件事 */
  const enter = () => {
    const [lo, hi] = gapAt(head)
    const seg = rangeAt(ranges, head) < 0 ? defaultSegment(Math.round(head), duration, lo, hi) : null
    if (!seg) return
    onBegin()
    const list = sortRanges([...ranges, seg])
    onRanges(list, list.indexOf(seg), true); onPicked()
  }
  const lit = (t: number) => rangeAt(ranges, t) >= 0
  const total = rangesTotal(ranges)
  return <div className="mark-track-wrap">
    {/*
      时间轴自己是一张卡片：上面一行把眼下这一段读出来（起点 → 终点、多长），下面才是可拖的那条轨。
      读数和手势分两层，拖的时候读数不会跟着缩略图一起晃。
      选了不止一段时中间补一句「第几段 / 共几段」—— 上面那两个时间码说的只是其中一段，
      不写清楚是第几段，读的人会以为整条片子就改这一截。
    */}
    <div className="seg-card">
      <div className="seg-head">
        <span className="seg-span">
          <b>{why || !cur ? '—' : timecode(cur.start)}</b>
          <i aria-hidden>→</i>
          <b>{why || !cur ? '—' : timecode(cur.end)}</b>
        </span>
        {!why && ranges.length > 1 && <span className="seg-more">第 {pick + 1} / {ranges.length} 段</span>}
        <span className="seg-dur">{why ? '—' : ranges.length > 1 ? `共 ${total}s` : `${cur ? cur.end - cur.start : 0}s`}</span>
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
          aria-label={why ? `视频时间轴：${why}` : '视频时间轴：点一下选上一段，可以选多段，拖动改长短'} {...tip(why || undefined)}
          onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onKeyDown={(e) => { e.stopPropagation(); if (why) return; if (e.key === 'Enter') { e.preventDefault(); enter() } }}>
          <div className="timeline-frames" aria-hidden="true">
            {Array.from({ length: FRAMES }, (_, i) => {
              const t = (i + 0.5) / FRAMES * duration
              return <TrackFrame key={i} mat={mat} t={t} dim={!why && !lit(t)} />
            })}
          </div>
          {!why && ranges.map((r, i) => {
            const [lo, hi] = rangeBounds(ranges, i, duration)
            const [pinLo, pinHi] = pinned(r)
            return <div key={i} className={`timeline-selection${i === pick ? ' on' : ''}`}
              style={{ left: pct(r.start), width: pct(r.end - r.start) }} onPointerDown={(e) => down(e, i, 'move')}>
              <div role="slider" aria-label="选区起点" aria-valuemin={lo} aria-valuemax={Math.min(r.end - RANGE_MIN, pinLo)} aria-valuenow={r.start} aria-valuetext={timecode(r.start)} tabIndex={0}
                className="range-handle start" onPointerDown={(e) => down(e, i, 'start')} onKeyDown={(e) => nudge(e, i, 'start')} />
              <span className="selection-grip" role="slider" aria-label="平移选区" aria-valuemin={lo} aria-valuemax={hi - (r.end - r.start)} aria-valuenow={r.start} tabIndex={0}
                onKeyDown={(e) => nudge(e, i, 'move')} />
              <div role="slider" aria-label="选区终点" aria-valuemin={Math.max(r.start + RANGE_MIN, pinHi)} aria-valuemax={hi} aria-valuenow={r.end} aria-valuetext={timecode(r.end)} tabIndex={0}
                className="range-handle end" onPointerDown={(e) => down(e, i, 'end')} onKeyDown={(e) => nudge(e, i, 'end')} />
              {/*
                悬到这一段上才露出来的小垃圾桶：它是这一段自己的东西，所以就长在这一段上，
                浮在它正上方 —— 压在段里就把这块能拖的地方占掉了，窄的一段更是整个被它盖住。
                它不挂悬浮说明：说明气泡会落在手正要走过去的那条路上，把这枚桶自己挡掉；
                一枚垃圾桶长在一段上，意思本来也不必再写一遍（读屏读 aria-label）。
              */}
              <button type="button" className="seg-del" aria-label={`删除 ${rangeLabel(r)} 这一段`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDrop(i) }}><IcTrash size={12} /></button>
              <i className="selection-edge" aria-hidden />
            </div>
          })}
          {/* 标记落在哪一秒，轨道上就钉一枚。钉子只会落在选中的那几段里：段收不过它们 */}
          {!why && regions.map((r, i) => <span key={i} aria-hidden className="mark-pin" style={{ left: pct(r.t) }} />)}
          <div className="timeline-playhead" style={{ left: pct(head) }}><i aria-hidden /></div>
        </div>
      </div>
    </div>
    {tipNode}
  </div>
}
