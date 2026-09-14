import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { activeIds, promptHint, tabStates, supportsRange, rangeBlockedReason, MODEL_CAPABILITIES, type MatGet } from './materialLayout'
import { IcArrowR, IcClose } from '../ui/icons'
import { isTodoError, taskError, timecode, defaultRange, rangeOnDirection, modelBlockedReason } from './videoTask'
import ModeTabs from './ModeTabs'
import MaterialRow from './MaterialRow'
import PromptBox from './PromptBox'
import BottomBar from './BottomBar'
import MediaPreview from './MediaPreview'
import SegmentSelector from './SegmentSelector'
import VideoSettings from './VideoSettings'
import { useTip } from './useTip'
/** 文生视频没有素材位，用灵感词填住这块空白，点一下追加到提示词。 */
export default function VideoPanel({ nodeId }: { nodeId: string }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const get: MatGet = useCallback((id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id)), [nodes])
  const [preview, setPreview] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const patch = useGenerator((s) => s.patch)
  /** 灰掉的控件为什么点不了，悬浮 / 聚焦就说 */
  const { tip, node: tipNode } = useTip()
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
  const note = error && !isTodoError(error) ? error : ''
  const busy = gen.tasks.some((task) => task.status === 'running')
  /** Tab 能不能进 = 素材够不够 ∧ 模型有没有这个能力。 */
  const tabs = tabStates(gen.conn, get, gen.model)
  /** 只有 Seedance 2.5 能把「这一段」表达出去，其余型号拖了也会被忽略。 */
  const rangeOK = supportsRange(gen.model)
  const rangeWhy = rangeBlockedReason(gen.model)
  const pickRange = (dir: 'before' | 'after' | null = gen.direction) =>
    defaultRange(source?.dur ?? 0, gen.mode, dir)
  /** 演示估算：按时长与清晰度粗算，不接计费。 */
  const cost = Math.round(gen.params.duration * (gen.params.resolution === '1080p' ? 2 : 1.6))
  const send = () => {
    try { const taskId = useGenerator.getState().submit(nodeId, get); window.setTimeout(() => useGenerator.getState().complete(nodeId, taskId), 1400) }
    catch (e) { patch(nodeId, { notice: (e as Error).message }) }
  }
  const latest = gen.tasks[gen.tasks.length - 1]
  return <>
    {tipNode}
    <ModeTabs mode={gen.mode} tabs={tabs} onPick={(mode) => useGenerator.getState().setMode(nodeId, mode, get)}
      right={taskMode ? <button className="task-exit" title="退出操作" aria-label={`退出${gen.mode === 'edit' ? '编辑' : '延长'}操作`}
        onClick={() => useGenerator.getState().setMode(nodeId, 'ref', get)}><IcClose size={14} /></button> : undefined} />
    <div ref={anchor}><MaterialRow nodeId={nodeId} gen={gen} get={get} /></div>
    {gen.mode === 'extend' && <div className="extend-controls"><div className="extend-row">
      <div className="direction-options" role="group" aria-label="延长方向" ref={dirWrap}>
        <span className="seg-thumb" aria-hidden style={{ transform: `translateX(${dirInd.x}px)`, width: dirInd.w, opacity: dirInd.w ? 1 : 0 }} />
        {/* 改方向只改衔接的那一头，用户已经选好的参考段不动 */}
        <button className={gen.direction === 'before' ? 'selected' : ''} aria-label="向前延长：新增片段接在原视频之前" aria-pressed={gen.direction === 'before'} onClick={() => patch(nodeId, { direction: 'before', range: rangeOnDirection(gen, source?.dur ?? 0, 'before') })}><IcArrowR size={14} sw={2} style={{ transform: 'scaleX(-1)' }} />向前</button>
        <button className={gen.direction === 'after' ? 'selected' : ''} aria-label="向后延长：新增片段接在原视频之后" aria-pressed={gen.direction === 'after'} onClick={() => patch(nodeId, { direction: 'after', range: rangeOnDirection(gen, source?.dur ?? 0, 'after') })}><IcArrowR size={14} sw={2} />向后</button>
      </div>
      </div>
      {gen.scope === 'segment' && !gen.range && <p className="helper">参考范围已清除，请在原片上重新选至少 2 秒。</p>}
      </div>}
    {taskMode && source && <>
      <div className="edit-scope">
        <div className="segmented">
          <button aria-pressed={gen.scope === 'whole'} className={gen.scope === 'whole' ? 'selected' : ''}
                  onClick={() => patch(nodeId, { scope: 'whole' })}>{gen.mode === 'edit' ? '改整条' : '从整条接'}</button>
          <button aria-pressed={gen.scope === 'segment'} className={gen.scope === 'segment' ? 'selected' : ''}
                  aria-disabled={!rangeOK} aria-label={rangeWhy ? `${gen.mode === 'edit' ? '改这一段' : '从这一段接'}：${rangeWhy}` : undefined} {...tip(rangeWhy || undefined)}
                  onClick={() => rangeOK && patch(nodeId, { scope: 'segment', range: gen.range ?? pickRange() })}>{gen.mode === 'edit' ? '改这一段' : '从这一段接'}</button>
        </div>
        {/* 2.5 自己也接不住这个源时就别给这个出口了，点了只会把用户弹出当前模式 */}
        {!rangeOK && !modelBlockedReason(gen, 'sd2.5', get) && <button className="scope-fix" onClick={() => useGenerator.getState().setModel(nodeId, 'sd2.5', get)}>切到 Seedance 2.5 启用</button>}
      </div>
      {gen.scope === 'segment' && rangeOK && <SegmentSelector key={source.id + source.src} mat={source} mode={gen.mode} model={gen.model} range={gen.range} onChange={(range) => patch(nodeId, { range })} />}
    </>}
    {gen.notice && <div className="source-notice" role="status">{gen.notice}<button aria-label="关闭提示" onClick={() => patch(nodeId, { notice: '' })}>✕</button></div>}
    <PromptBox value={gen.prompt} onChange={(prompt) => patch(nodeId, { prompt })} placeholder={promptHint(gen.mode, !!gen.slotLast)} lit={-1} mats={mats}
      onReference={(m) => patch(nodeId, { references: { ...gen.references, [m.name]: m.id } })}
      context={taskMode && source ? <>{gen.mode === 'edit' ? '把' : '从'} <button className="reference-chip" onClick={() => setPreview(true)}>视频 {source.name}</button>{gen.scope === 'segment' && rangeOK && gen.range && <> {gen.mode === 'edit' ? '中' : '的'} <button className="reference-chip" onClick={() => { anchor.current?.parentElement?.querySelector<HTMLElement>('.timeline-track')?.focus({ preventScroll: true }); anchor.current?.parentElement?.querySelector('.segment-selector')?.scrollIntoView({ block: 'nearest' }) }}>{timecode(gen.range.start)}–{timecode(gen.range.end)}</button></>}{gen.mode === 'edit' ? ' 的' : <> <span className="reference-chip static">{gen.direction === 'before' ? '向前延长' : '向后延长'} {gen.params.duration}s</span>，</>}</> : undefined} />
    {preview && source && <MediaPreview mat={source} onClose={() => setPreview(false)} />}
    {note && <div className="submission-note"><span className={error ? 'validation' : 'helper'} role="status">{note}</span></div>}
    <BottomBar busy={busy} disabled={!!error} reason={error ?? undefined} cost={cost} onSend={send} left={<VideoSettings nodeId={nodeId} gen={gen} source={source} get={get} />} />
    {latest && <details className="task-record" open={busy || undefined}><summary>{latest.status === 'running' ? '正在记录演示任务…' : '最近演示任务已完成 · 未生成或修改视频'}<span>{latest.payload.output}</span></summary>
      <p>{MODEL_CAPABILITIES[latest.payload.model].label} · {latest.payload.params.resolution} · {latest.payload.params.duration}s · {latest.payload.params.sound ? '有声' : '无声'}{latest.payload.range && ` · 原片范围 ${timecode(latest.payload.range.start)}–${timecode(latest.payload.range.end)}`}{latest.payload.direction && ` · ${latest.payload.direction === 'before' ? '向前延长' : '向后延长'}`}</p>
      <p>{latest.payload.prompt}</p><p>已记录 {latest.payload.inputIds.length} 个有效输入</p>
      <button onClick={() => { const blob = new Blob([JSON.stringify(gen.tasks, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '演示任务记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>下载任务记录（{gen.tasks.length}）</button>
    </details>}
  </>
}
