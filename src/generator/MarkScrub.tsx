import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { IcPause, IcPlay } from '../ui/icons'
import { timecode } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const capture = (el: Element | null, id: number) => { try { el?.setPointerCapture(id) } catch { /* 捕不到就算了 */ } }
const release = (el: Element | null, id: number) => { try { if (el?.hasPointerCapture(id)) el.releasePointerCapture(id) } catch { /* 同上 */ } }
/**
 * 压在标记画面底边的那条控制条：播放键、「走到哪儿 / 一共多长」、一条细进度条。
 * 整段 / 指定片段都在，拖到哪一秒画面就停在哪一秒。
 *
 * 只有进度条和播放键收指针事件，这一条整体不收 —— 画面底下这一截仍然能拉框。
 */
export default function MarkScrub({ head, duration, playing, onSeek, onTogglePlay }: {
  head: number; duration: number; playing: boolean; onSeek: (t: number) => void; onTogglePlay: () => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = bar.current!.getBoundingClientRect()
    return clamp((e.clientX - r.left) / r.width, 0, 1) * duration
  }
  // 手势不往画面上漏：画面那层按下去就是开始画框
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault()
    dragging.current = true; capture(bar.current, e.pointerId); onSeek(at(e))
  }
  const move = (e: PointerEvent<HTMLDivElement>) => { e.stopPropagation(); if (dragging.current) onSeek(at(e)) }
  const up = (e: PointerEvent<HTMLDivElement>) => { e.stopPropagation(); dragging.current = false; release(bar.current, e.pointerId) }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault(); e.stopPropagation()
    onSeek(clamp(head + (e.key === 'ArrowRight' ? 1 : -1), 0, duration))
  }
  const pct = duration ? clamp(head / duration, 0, 1) * 100 : 0
  return <div className="mark-scrub">
    <div className="mark-scrub-row">
      {/* 按下只拦住手势（别让画面那层开始画框），真正的切换走 click：
          pointerdown 上 preventDefault 会连 click 一起掐掉，键盘回车和合成点击就都按不动了 */}
      <button className="mark-scrub-play" aria-label={playing ? '暂停' : '播放'}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onTogglePlay() }}>
        {playing ? <IcPause size={15} /> : <IcPlay size={15} />}
      </button>
      {/* 走到哪儿 / 一共多长：两个数同一套等宽字，秒数跳动时这一行不会跟着左右晃 */}
      <span className="mark-scrub-time"><b>{timecode(head)}</b> / {timecode(duration)}</span>
    </div>
    <div ref={bar} className="mark-scrub-bar" role="slider" tabIndex={0} aria-label="播放进度"
      aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(head)} aria-valuetext={timecode(head)}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      <i><b style={{ width: `${pct}%` }} /></i>
    </div>
  </div>
}
