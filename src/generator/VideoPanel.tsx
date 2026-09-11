import { useCallback, useRef, useState } from 'react'
import { connOf, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { loadVideoMetadata } from '../nodes/media'
import { accepts, activeIds, fmt, promptHint, type MatGet, type Zone } from './materialLayout'
import { taskError, timecode } from './videoTask'
import ModeTabs from './ModeTabs'
import MaterialRow from './MaterialRow'
import PromptBox from './PromptBox'
import BottomBar from './BottomBar'
import Overlay from './Overlay'
import MediaPreview from './MediaPreview'
import SegmentSelector from './SegmentSelector'
import VideoSettings from './VideoSettings'
export default function VideoPanel({ nodeId }: { nodeId: string }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const get: MatGet = useCallback((id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id)), [nodes])
  const [picker, setPicker] = useState<{ zone: Zone; replaceId?: string } | null>(null)
  const [preview, setPreview] = useState(false)
  const anchor = useRef<HTMLDivElement>(null); const file = useRef<HTMLInputElement>(null)
  const patch = useGenerator((s) => s.patch)
  if (!gen) return null
  const source = gen.slotEdit ? get(gen.slotEdit) : null
  const mats = activeIds(gen, gen.mode).map((id) => get(id)!).filter(Boolean)
  const error = taskError(gen, get)
  const busy = gen.tasks.some((task) => task.status === 'running')
  const taskMode = gen.mode === 'edit' || gen.mode === 'extend'
  const choose = (id: string, zone: Zone, replaceId?: string) => {
    const gs = useGenerator.getState()
    if (replaceId && replaceId !== id && zone === 'tray') gs.removeMaterial(nodeId, replaceId, get)
    gs.applyDrop(nodeId, id, zone, null, get); setPicker(null)
  }
  const upload = (f: File) => {
    if (!picker) return
    const isVideo = f.type.startsWith('video/')
    if (!/^(image|video)\//.test(f.type) || (picker.zone === 'edit' && !isVideo) || ((picker.zone === 'first' || picker.zone === 'last') && isVideo)) return
    const store = useCanvas.getState(); const me = store.nodes.find((n) => n.id === nodeId); if (!me) return
    const src = URL.createObjectURL(f)
    const id = store.addNode(isVideo ? 'video' : 'image', { x: me.position.x - 400, y: me.position.y + 120 }, { src })
    store.connect(id, nodeId)
    const next = useCanvas.getState()
    next.onNodesChange(next.nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: n.id === nodeId })))
    useGenerator.getState().syncConn(nodeId, connOf(next.edges, nodeId).filter((mid) => !!get(mid)), get)
    choose(id, picker.zone, picker.replaceId)
    if (isVideo) loadVideoMetadata(id, src)
  }
  const send = () => {
    try { const taskId = useGenerator.getState().submit(nodeId, get); window.setTimeout(() => useGenerator.getState().complete(nodeId, taskId), 1400) }
    catch (e) { patch(nodeId, { notice: (e as Error).message }) }
  }
  const latest = gen.tasks[gen.tasks.length - 1]
  return <>
    <ModeTabs mode={gen.mode} model={gen.model} onPick={(mode) => { setPicker(null); useGenerator.getState().setMode(nodeId, mode, get) }} />
    {taskMode && <div className="task-heading"><strong>{gen.mode === 'edit' ? '编辑视频' : '延长视频'}{source && <span> · {source.name}</span>}</strong><button onClick={() => useGenerator.getState().setMode(nodeId, 'ref', get)}>退出操作 ↗</button></div>}
    <div ref={anchor}><MaterialRow nodeId={nodeId} gen={gen} get={get} onPickMaterial={(zone, replaceId) => setPicker({ zone, replaceId })} /></div>
    {picker && <Overlay anchor={anchor} label="选择素材" className="asset-picker" onClose={() => setPicker(null)}>
      <div className="popover-heading">选择已连接素材 <button aria-label="关闭素材选择" onClick={() => setPicker(null)}>✕</button></div>
      {gen.conn.map((id) => get(id)).filter((m) => m && accepts(picker.zone, m.id, get)).map((m) => m && <button key={m.id} className="asset-option" onClick={() => choose(m.id, picker.zone, picker.replaceId)}><img src={m.thumb} alt="" /><span><strong>{m.name}</strong><small>{m.kind === 'video' ? `视频 · ${m.dur != null ? fmt(m.dur) : '读取中'}` : '图片'}</small></span></button>)}
      {!gen.conn.some((id) => accepts(picker.zone, id, get)) && <p className="helper">没有可用的已连接素材</p>}
      <button className="upload-option" onClick={() => file.current?.click()}>＋ 上传{picker.zone === 'edit' ? '视频' : picker.zone === 'first' || picker.zone === 'last' ? '图片' : '图片或视频'}</button>
    </Overlay>}
    <input ref={file} type="file" accept={picker?.zone === 'edit' ? 'video/*' : picker?.zone === 'first' || picker?.zone === 'last' ? 'image/*' : 'image/*,video/*'} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
    {gen.mode === 'edit' && <>
      <div className="edit-scope"><div className="segmented"><button aria-pressed={gen.scope === 'whole'} className={gen.scope === 'whole' ? 'selected' : ''} onClick={() => patch(nodeId, { scope: 'whole' })}>整段视频</button><button aria-pressed={gen.scope === 'segment'} className={gen.scope === 'segment' ? 'selected' : ''} onClick={() => patch(nodeId, { scope: 'segment' })}>选取片段</button></div><span>{gen.scope === 'whole' ? '输出编辑后的整条视频' : '输出独立片段，保留原视频'}</span></div>
      {gen.scope === 'segment' && source && <SegmentSelector key={source.id + source.src} mat={source} range={gen.range} onChange={(range) => patch(nodeId, { range })} />}
    </>}
    {gen.mode === 'extend' && <div className="extend-controls"><div className="direction-options">
      <button className={gen.direction === 'before' ? 'selected' : ''} aria-pressed={gen.direction === 'before'} onClick={() => patch(nodeId, { direction: 'before' })}><strong>向前延长</strong><span><em>新增</em> → 原视频</span></button>
      <button className={gen.direction === 'after' ? 'selected' : ''} aria-pressed={gen.direction === 'after'} onClick={() => patch(nodeId, { direction: 'after' })}><strong>向后延长</strong><span>原视频 → <em>新增</em></span></button>
      </div><p className="helper">原片 {source?.dur != null ? fmt(source.dur) : '—'} · 新增 {gen.params.duration}s{source?.dur != null && ` · 拼接后理论总长 ${fmt(source.dur + gen.params.duration)}`}。本轮仅记录新增片段任务，不自动拼接。</p></div>}
    {gen.notice && <div className="source-notice" role="status">{gen.notice}<button aria-label="关闭提示" onClick={() => patch(nodeId, { notice: '' })}>✕</button></div>}
    <PromptBox value={gen.prompt} onChange={(prompt) => patch(nodeId, { prompt })} placeholder={promptHint(gen.mode, !!gen.slotLast)} lit={-1} mats={mats}
      onReference={(m) => patch(nodeId, { references: { ...gen.references, [m.name]: m.id } })}
      context={taskMode && source ? <>{gen.mode === 'edit' ? '把' : '基于'} <button className="reference-chip" onClick={() => setPreview(true)}>视频 {source.name}</button>{gen.mode === 'edit' && gen.scope === 'segment' && gen.range && <> 中 <button className="reference-chip" onClick={() => { anchor.current?.parentElement?.querySelector<HTMLElement>('.timeline-track')?.focus({ preventScroll: true }); anchor.current?.parentElement?.querySelector('.segment-selector')?.scrollIntoView({ block: 'nearest' }) }}>{timecode(gen.range.start)}–{timecode(gen.range.end)}</button> 的</>}</> : undefined} />
    {preview && source && <MediaPreview mat={source} onClose={() => setPreview(false)} />}
    <div className="submission-note"><span className={error ? 'validation' : 'helper'} role="status">{error || (gen.mode === 'edit' && gen.scope === 'segment' ? '时间范围为编辑约束，不承诺逐帧精准控制' : '已准备好，可创建演示任务')}</span><span className="demo-label">演示 · 不调用真实模型</span></div>
    <BottomBar busy={busy} disabled={!!error} reason={error ?? undefined} onSend={send} left={<VideoSettings nodeId={nodeId} gen={gen} source={source} />} />
    {latest && <details className="task-record" open={busy || undefined}><summary>{latest.status === 'running' ? '正在记录演示任务…' : '最近演示任务已完成 · 未生成或修改视频'}<span>{latest.payload.output}</span></summary>
      <p>Seedance {latest.payload.model} · {latest.payload.params.resolution} · {latest.payload.params.duration}s · {latest.payload.params.sound ? '有声' : '无声'}{latest.payload.range && ` · 原片范围 ${timecode(latest.payload.range.start)}–${timecode(latest.payload.range.end)}`}{latest.payload.direction && ` · ${latest.payload.direction === 'before' ? '向前延长' : '向后延长'}`}</p>
      <p>{latest.payload.prompt}</p><p>已记录 {latest.payload.inputIds.length} 个有效输入。此任务仅演示参数和状态，不提供 AI 编辑成片。</p>
      <button onClick={() => { const blob = new Blob([JSON.stringify(gen.tasks, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '演示任务记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>下载任务记录（{gen.tasks.length}）</button>
    </details>}
  </>
}
