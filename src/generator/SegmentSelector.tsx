import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Mat } from './materialLayout'
import { fmt } from './materialLayout'
import { adjustRange, selectRange, sourceError, timecode, type TimeRange } from './videoTask'
interface Props { mat: Mat; range: TimeRange | null; onChange: (range: TimeRange | null) => void }
export default function SegmentSelector({ mat, range, onChange }: Props) {
  const video = useRef<HTMLVideoElement>(null); const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ action: 'start' | 'end' | 'move'; x: number; range: TimeRange; moved: boolean } | null>(null)
  const playRange = useRef(false); const [head, setHead] = useState(0); const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const duration = mat.dur ?? 0; const disabled = !!(sourceError(mat.dur, mat.ready) || error)
  useEffect(() => { playRange.current = false; video.current?.pause(); setHead(0); setError('') }, [mat.src])
  useEffect(() => { playRange.current = false; video.current?.pause() }, [range?.start, range?.end])
  const seek = (time: number) => { if (video.current) video.current.currentTime = Math.max(0, Math.min(time, duration)); setHead(time) }
  const timeAt = (x: number) => { const r = track.current!.getBoundingClientRect(); return Math.max(0, Math.min(duration, (x - r.left) / r.width * duration)) }
  const down = (e: PointerEvent<HTMLDivElement>, action?: 'start' | 'end' | 'move') => {
    if (disabled) return
    e.stopPropagation(); e.preventDefault()
    video.current?.pause(); playRange.current = false
    if (range && action) {
      drag.current = { action, x: e.clientX, range: { ...range }, moved: false }
      track.current?.setPointerCapture(e.pointerId)
    } else { const next = selectRange(timeAt(e.clientX), duration); onChange(next); if (next) seek(next.start) }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || disabled) return
    e.stopPropagation()
    if (Math.abs(e.clientX - d.x) < 3 && !d.moved) return
    d.moved = true
    const delta = (e.clientX - d.x) / track.current!.getBoundingClientRect().width * duration
    const value = d.action === 'move' ? delta : d.range[d.action] + delta
    const next = adjustRange(d.range, d.action, value, duration); onChange(next); seek(next.start)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.action === 'move' && !drag.current.moved) seek(timeAt(e.clientX))
    drag.current = null
    if (track.current?.hasPointerCapture(e.pointerId)) track.current.releasePointerCapture(e.pointerId)
  }
  const play = async () => {
    if (!range || !video.current) return
    if (playing) { video.current.pause(); playRange.current = false; return }
    seek(range.start); playRange.current = true
    try { await video.current.play() } catch { setError('无法播放此视频，请检查文件格式或重新上传') }
  }
  return <section className="segment-selector nodrag nowheel" aria-label="片段选择器" id="segment-selector">
    <video ref={video} src={mat.src} poster={mat.thumb} controls playsInline preload="metadata" aria-label="源视频预览"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError('视频无法读取，请重新上传')}
      onTimeUpdate={() => { const v = video.current; if (!v) return; if (playRange.current && range && v.currentTime >= range.end) { v.pause(); v.currentTime = range.end; playRange.current = false }; setHead(v.currentTime) }} />
    <div className="timeline-heading"><span>{range ? `${timecode(range.start)}–${timecode(range.end)} · 已选 ${range.end - range.start} 秒` : '点击轨道，选取至少 4 秒'} </span><span>原片 {mat.dur != null ? fmt(mat.dur) : '读取中'}</span></div>
    <div ref={track} className={`timeline-track${disabled ? ' disabled' : ''}`} aria-label="视频时间轴" aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null }}
      onKeyDown={(e) => { e.stopPropagation(); if (disabled) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(selectRange(head, duration)) } }}>
      <div className="timeline-frames" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <img key={i} src={mat.thumb} alt="" />)}</div>
      {range && !disabled && <div className="timeline-selection" style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }} onPointerDown={(e) => down(e, 'move')}>
        <div role="slider" aria-label="选区起点" aria-valuemin={0} aria-valuemax={range.end - 4} aria-valuenow={range.start} aria-valuetext={timecode(range.start)} tabIndex={0}
          className="range-handle start" onPointerDown={(e) => down(e, 'start')} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(adjustRange(range, 'start', range.start + (e.key === 'ArrowLeft' ? -1 : 1), duration)) } }}>Ⅱ</div>
        <span className="selection-grip" role="slider" aria-label="平移选区" aria-valuemin={0} aria-valuemax={Math.floor(duration) - (range.end - range.start)} aria-valuenow={range.start} tabIndex={0}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(adjustRange(range, 'move', e.key === 'ArrowLeft' ? -1 : 1, duration)) } }}>⋮⋮</span>
        <div role="slider" aria-label="选区终点" aria-valuemin={range.start + 4} aria-valuemax={Math.floor(duration)} aria-valuenow={range.end} aria-valuetext={timecode(range.end)} tabIndex={0}
          className="range-handle end" onPointerDown={(e) => down(e, 'end')} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(adjustRange(range, 'end', range.end + (e.key === 'ArrowLeft' ? -1 : 1), duration)) } }}>Ⅱ</div>
      </div>}
      <div className="timeline-playhead" style={{ left: `${duration ? head / duration * 100 : 0}%` }} />
    </div>
    <div className="timeline-ticks" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((p) => <span key={p}>{timecode(Math.floor(duration * p))}</span>)}</div>
    <div className="timeline-actions"><button disabled={!range || disabled} onClick={() => void play()}>{playing && playRange.current ? '暂停选区' : '▶ 播放选区'}</button><button disabled={!range} onClick={() => { video.current?.pause(); playRange.current = false; onChange(null) }}>清除选区</button><span>整数秒选择 · 最少 4 秒</span></div>
    {error && <p className="validation" role="alert">{error}</p>}
  </section>
}
