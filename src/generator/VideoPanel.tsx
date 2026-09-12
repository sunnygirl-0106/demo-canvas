import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { activeIds, fmt, promptHint, tabStates, supportsRange, rangeBlockedReason, MODEL_CAPABILITIES, type MatGet } from './materialLayout'
import { IcArrowR } from '../ui/icons'
import { isTodoError, taskError, timecode, defaultRange } from './videoTask'
import ModeTabs from './ModeTabs'
import MaterialRow from './MaterialRow'
import PromptBox from './PromptBox'
import BottomBar from './BottomBar'
import MediaPreview from './MediaPreview'
import SegmentSelector from './SegmentSelector'
import VideoSettings from './VideoSettings'
/** 文生视频没有素材位，用灵感词填住这块空白，点一下追加到提示词。 */
const TEXT_HINTS = ['电影感光影', '缓慢推轨', '黄金时刻', '浅景深特写']
export default function VideoPanel({ nodeId }: { nodeId: string }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const get: MatGet = useCallback((id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id)), [nodes])
  const [preview, setPreview] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const patch = useGenerator((s) => s.patch)
  /** 延长方向的滑块跟着选中项移动，和 2A 的分段器一致。 */
  const dirWrap = useRef<HTMLDivElement>(null)
  const [dirInd, setDirInd] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const on = dirWrap.current?.querySelector<HTMLElement>('.selected')
    setDirInd((prev) => {
      const next = on ? { x: on.offsetLeft, w: on.offsetWidth } : { x: prev.x, w: 0 }
      return prev.x === next.x && prev.w === next.w ? prev : next
    })
  }, [gen?.direction, gen?.mode])
  if (!gen) return null
  const source = gen.slotEdit ? get(gen.slotEdit) : null
  const mats = activeIds(gen, gen.mode).map((id) => get(id)!).filter(Boolean)
  const taskMode = gen.mode === 'edit' || gen.mode === 'extend'
  const error = taskError(gen, get)
  const note = error
    ? isTodoError(error) ? '' : error
    : taskMode && gen.scope === 'segment' ? '时间范围按整数秒，不承诺逐帧精准控制' : '已准备好，可创建演示任务'
  const busy = gen.tasks.some((task) => task.status === 'running')
  /** Tab 能不能进只看画布上连了什么；模型不参与这一层。 */
  const tabs = tabStates(gen.conn, get)
  /** 只有 2.5 能把「这一段」表达出去，2.0 系列拖了也会被忽略。 */
  const rangeOK = supportsRange(gen.model)
  const rangeWhy = rangeBlockedReason(gen.model)
  const pickRange = (dir: 'before' | 'after' | null = gen.direction) =>
    defaultRange(source?.dur ?? 0, gen.mode, dir)
  /** 演示估算：按时长与清晰度粗算，不接计费。 */
  const cost = Math.round(gen.params.duration * (gen.params.resolution === '1080p' ? 2 : 1.6))
  const durations = MODEL_CAPABILITIES[gen.model].durations
  const durIdx = durations.indexOf(gen.params.duration)
  const stepDuration = (step: number) => {
    const next = durations[Math.min(durations.length - 1, Math.max(0, durIdx + step))]
    if (next != null) patch(nodeId, { params: { ...gen.params, duration: next } })
  }
  const send = () => {
    try { const taskId = useGenerator.getState().submit(nodeId, get); window.setTimeout(() => useGenerator.getState().complete(nodeId, taskId), 1400) }
    catch (e) { patch(nodeId, { notice: (e as Error).message }) }
  }
  const latest = gen.tasks[gen.tasks.length - 1]
  return <>
    <ModeTabs mode={gen.mode} tabs={tabs} onPick={(mode) => useGenerator.getState().setMode(nodeId, mode, get)} />
    {taskMode && <div className="task-heading"><strong>{gen.mode === 'edit' ? '编辑视频' : '延长视频'}{source && <span> · {source.name}</span>}</strong><button onClick={() => useGenerator.getState().setMode(nodeId, 'ref', get)}>退出操作 ↗</button></div>}
    <div ref={anchor}><MaterialRow nodeId={nodeId} gen={gen} get={get} /></div>
    {gen.mode === 'extend' && <div className="extend-controls"><div className="extend-row">
      <div className="direction-options" role="group" aria-label="延长方向" ref={dirWrap}>
        <span className="seg-thumb" aria-hidden style={{ transform: `translateX(${dirInd.x}px)`, width: dirInd.w, opacity: dirInd.w ? 1 : 0 }} />
        <button className={gen.direction === 'before' ? 'selected' : ''} aria-label="向前延长：新增片段接在原视频之前" aria-pressed={gen.direction === 'before'} onClick={() => patch(nodeId, { direction: 'before', range: gen.scope === 'segment' ? defaultRange(source?.dur ?? 0, 'extend', 'before') : gen.range })}><IcArrowR size={14} sw={2} style={{ transform: 'scaleX(-1)' }} />向前</button>
        <button className={gen.direction === 'after' ? 'selected' : ''} aria-label="向后延长：新增片段接在原视频之后" aria-pressed={gen.direction === 'after'} onClick={() => patch(nodeId, { direction: 'after', range: gen.scope === 'segment' ? defaultRange(source?.dur ?? 0, 'extend', 'after') : gen.range })}><IcArrowR size={14} sw={2} />向后</button>
      </div>
      <div className="stepper" role="group" aria-label={`新增片段时长 ${gen.params.duration} 秒`}>
        <button aria-label="缩短新增片段" disabled={durIdx <= 0} onClick={() => stepDuration(-1)}>−</button>
        <span>+{gen.params.duration}s</span>
        <button aria-label="加长新增片段" disabled={durIdx >= durations.length - 1} onClick={() => stepDuration(1)}>+</button>
      </div>
      </div><p className="helper">产出<strong>只有新增的 {gen.params.duration}s</strong>，不含原片。原片 {source?.dur != null ? fmt(source.dur) : '—'}{source?.dur != null && ` · 自己拼起来共 ${fmt(source.dur + gen.params.duration)}`}，本轮不自动拼接。</p></div>}
    {taskMode && source && <>
      <div className="edit-scope">
        <div className="segmented">
          <button aria-pressed={gen.scope === 'whole'} className={gen.scope === 'whole' ? 'selected' : ''}
                  onClick={() => patch(nodeId, { scope: 'whole' })}>{gen.mode === 'edit' ? '改整条' : '从整条接'}</button>
          <button aria-pressed={gen.scope === 'segment' && rangeOK} className={gen.scope === 'segment' && rangeOK ? 'selected' : ''}
                  disabled={!rangeOK} title={rangeWhy || undefined}
                  onClick={() => patch(nodeId, { scope: 'segment', range: gen.range ?? pickRange() })}>{gen.mode === 'edit' ? '改这一段' : '从这一段接'}</button>
        </div>
        <span>{!rangeOK ? rangeWhy
          : gen.mode === 'edit'
            ? gen.scope === 'whole' ? '输出编辑后的整条视频，时长与原片一致' : '输出仍是整条视频，只有这一段按要求改'
            : gen.scope === 'whole' ? '整条作为衔接锚点' : '只用这一段作为衔接锚点，它不会出现在产出里'}</span>
        {!rangeOK && <button className="scope-fix" onClick={() => useGenerator.getState().setModel(nodeId, '2.5', get)}>切到 2.5 启用</button>}
      </div>
      {gen.scope === 'segment' && rangeOK && <SegmentSelector key={source.id + source.src} mat={source} mode={gen.mode} range={gen.range} onChange={(range) => patch(nodeId, { range })} />}
    </>}
    {gen.notice && <div className="source-notice" role="status">{gen.notice}<button aria-label="关闭提示" onClick={() => patch(nodeId, { notice: '' })}>✕</button></div>}
    <PromptBox value={gen.prompt} onChange={(prompt) => patch(nodeId, { prompt })} placeholder={promptHint(gen.mode, !!gen.slotLast)} lit={-1} mats={mats}
      hints={gen.mode === 'text' ? TEXT_HINTS : undefined}
      onReference={(m) => patch(nodeId, { references: { ...gen.references, [m.name]: m.id } })}
      context={taskMode && source ? <>{gen.mode === 'edit' ? '把' : '从'} <button className="reference-chip" onClick={() => setPreview(true)}>视频 {source.name}</button>{gen.scope === 'segment' && rangeOK && gen.range && <> {gen.mode === 'edit' ? '中' : '的'} <button className="reference-chip" onClick={() => { anchor.current?.parentElement?.querySelector<HTMLElement>('.timeline-track')?.focus({ preventScroll: true }); anchor.current?.parentElement?.querySelector('.segment-selector')?.scrollIntoView({ block: 'nearest' }) }}>{timecode(gen.range.start)}–{timecode(gen.range.end)}</button></>}{gen.mode === 'edit' ? ' 的' : <> <span className="reference-chip static">{gen.direction === 'before' ? '向前延长' : '向后延长'} {gen.params.duration}s</span>，</>}</> : undefined} />
    {preview && source && <MediaPreview mat={source} onClose={() => setPreview(false)} />}
    {note && <div className="submission-note"><span className={error ? 'validation' : 'helper'} role="status">{note}</span></div>}
    <BottomBar busy={busy} disabled={!!error} reason={error ?? undefined} cost={cost} onSend={send} left={<VideoSettings nodeId={nodeId} gen={gen} source={source} />} />
    {latest && <details className="task-record" open={busy || undefined}><summary>{latest.status === 'running' ? '正在记录演示任务…' : '最近演示任务已完成 · 未生成或修改视频'}<span>{latest.payload.output}</span></summary>
      <p>Seedance {latest.payload.model} · {latest.payload.params.resolution} · {latest.payload.params.duration}s · {latest.payload.params.sound ? '有声' : '无声'}{latest.payload.range && ` · 原片范围 ${timecode(latest.payload.range.start)}–${timecode(latest.payload.range.end)}`}{latest.payload.direction && ` · ${latest.payload.direction === 'before' ? '向前延长' : '向后延长'}`}</p>
      <p>{latest.payload.prompt}</p><p>已记录 {latest.payload.inputIds.length} 个有效输入。此任务仅演示参数和状态，不提供 AI 编辑成片。</p>
      <button onClick={() => { const blob = new Blob([JSON.stringify(gen.tasks, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '演示任务记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>下载任务记录（{gen.tasks.length}）</button>
    </details>}
  </>
}
