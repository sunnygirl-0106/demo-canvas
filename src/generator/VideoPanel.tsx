import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { partition, promptHint, refModeOf, tabStates, MODEL_CAPABILITIES, type MatGet } from './materialLayout'
import { IcArrowR, IcClose } from '../ui/icons'
import { taskError, timecode } from './videoTask'
import { commitDraft, markCount } from './marks'
import ModeTabs from './ModeTabs'
import MaterialRow from './MaterialRow'
import PromptBox from './PromptBox'
import { docText, insertGroup, marksOf, seedDoc, type Seg } from './promptDoc'
import BottomBar from './BottomBar'
import MarkDialog from './MarkDialog'
import MarkEntry from './MarkEntry'
import PromptSeg from './PromptSeg'
import VideoSettings from './VideoSettings'
import { useTip } from './useTip'
/** 文生视频没有素材位，用灵感词填住这块空白，点一下追加到提示词。 */
export default function VideoPanel({ nodeId }: { nodeId: string }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const get: MatGet = useCallback((id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id)), [nodes])
  /** 标记弹窗是会话态，不进草稿：关掉面板再回来，句子里的标记还在 */
  const [dialog, setDialog] = useState(false)
  /**
   * 重挂可编辑区的标志。只有「起头」「插入标签」这种由外部改动句子的时刻才 +1 ——
   * 打字期间一律不动，否则每敲一个字光标都会被打回末尾。
   */
  const [docVer, setDocVer] = useState(0)
  const anchor = useRef<HTMLDivElement>(null)
  const patch = useGenerator((s) => s.patch)
  /** 灰掉的控件为什么点不了，悬浮 / 聚焦就说 */
  const { node: tipNode } = useTip()
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
  /**
   * 进了编辑 / 延长就替用户把这句话的开头写好（「把 视频 的」「从 视频 向后延长 5s，」）。
   * 只起这一次头：删光了不会自动送回来 —— 那是开头，不是模板。
   */
  useEffect(() => {
    const g = useGenerator.getState().map[nodeId]
    if (!g || g.seeded || (g.mode !== 'edit' && g.mode !== 'extend')) return
    const mat = g.slotEdit ? get(g.slotEdit) : null
    if (!mat) return
    const doc = [...seedDoc(g.mode), ...g.doc]
    patch(nodeId, { doc, seeded: true, marks: marksOf(doc), prompt: docText(doc, { name: mat.name, direction: g.direction, duration: g.params.duration }) })
    setDocVer((v) => v + 1)
  }, [nodeId, gen?.mode, gen?.slotEdit, gen?.seeded, get, patch])
  if (!gen) return null
  const source = gen.slotEdit ? get(gen.slotEdit) : null
  /**
   * 句子改了就把它记下来：marks 和 prompt 都从句子推出来 ——
   * 删掉一枚标签，这次任务里也就没有它；这一句念出来的样子就是任务记录里的 prompt。
   */
  const say = (doc: Seg[]) => docText(doc, { name: source?.name, direction: gen.direction, duration: gen.params.duration })
  const setDoc = (doc: Seg[]) => patch(nodeId, { doc, marks: marksOf(doc), prompt: say(doc) })
  /** 由外部改动句子（插入这一次的标签）：内容换了，可编辑区得重挂一遍 */
  const writeDoc = (doc: Seg[], extra?: Record<string, unknown>) => {
    patch(nodeId, { doc, marks: marksOf(doc), prompt: say(doc), ...extra })
    setDocVer((v) => v + 1)
  }
  const mats = partition(gen, gen.mode, gen.model, get).active.map((id) => get(id)!).filter(Boolean)
  const taskMode = gen.mode === 'edit' || gen.mode === 'extend'
  /** 做不成的原因一律挂在生成按钮上（灰掉 + 悬浮说明），面板里不再留黄色小字 */
  const error = taskError(gen, get)
  const busy = gen.tasks.some((task) => task.status === 'running')
  /** Tab 能不能进 = 素材够不够 ∧ 模型有没有这个能力。 */
  // 每个 Tab 按它自己草稿里的那一段源视频判断，没有草稿的就是连着的第一段
  const tabs = tabStates(gen.conn, get, gen.model, (m) => (m === gen.mode ? gen.slotEdit : gen.drafts[m]?.slotEdit) ?? null)
  /**
   * 句子里现在标着的那一套。弹窗每次都是全新一次圈选，保存是接在这一套后面 ——
   * 上一次标的那几处留着，所以打开时把「会接在什么后面」说清楚。
   */
  const held = markCount(gen.marks)
  const standing = [held.regions ? `${held.regions} 处` : '', held.ranges ? `${held.ranges} 段` : ''].filter(Boolean).join(' · ')
  /** 演示估算：按时长与清晰度粗算，不接计费。 */
  const cost = Math.round(gen.params.duration * (gen.params.resolution === '1080p' ? 2 : 1.6))
  const send = () => {
    // 提交不合规的任务这条路已经在按钮上堵死了（灰掉 + 悬浮说明），真抛出来只可能是代码问题
    try { const taskId = useGenerator.getState().submit(nodeId, get); window.setTimeout(() => useGenerator.getState().complete(nodeId, taskId), 1400) }
    catch (e) { console.error(e) }
  }
  const latest = gen.tasks[gen.tasks.length - 1]
  const tally = latest ? markCount(latest.payload.marks) : null
  return <>
    {tipNode}
    <ModeTabs mode={gen.mode} tabs={tabs} onPick={(mode) => useGenerator.getState().setMode(nodeId, mode, get)}
      right={taskMode ? <button className="task-exit" title="退出操作" aria-label={`退出${gen.mode === 'edit' ? '编辑' : '延长'}操作`}
        onClick={() => useGenerator.getState().setMode(nodeId, refModeOf(gen.model) ?? 'text', get)}><IcClose size={14} /></button> : undefined} />
    <div ref={anchor}><MaterialRow nodeId={nodeId} gen={gen} get={get} /></div>
    {/*
      * 提示词框里是一整句可以编辑的话：「把 视频X 中 00:01–00:03 时间段里的 00:01 的 …」，
      * 读下来就是这次任务的全部意思。「把」「中」「时间段里的」都是普通文字，能删能改；
      * 标签是原子，退格一次整枚消失，删掉哪一枚，这次任务里就没有它。
      */}
    <PromptBox doc={gen.doc} ver={`${gen.mode}:${docVer}`} onDoc={setDoc}
      renderSeg={(s) => <PromptSeg s={s} doc={gen.doc} mat={source} get={get} direction={gen.direction} duration={gen.params.duration}
        role={gen.mode === 'edit' ? '这个视频用来编辑' : '这个视频用来延长'} />}
      placeholder={promptHint(gen.mode, !!gen.slotLast).map((p) => p.t).join('')} mats={mats}
      onInsert={(doc, m) => writeDoc(doc, { references: { ...gen.references, [m.name]: m.id } })}
      tools={gen.mode === 'edit' && source ? <MarkEntry nodeId={nodeId} gen={gen} get={get} open={dialog} onOpen={() => setDialog(true)} />
        /*
         * 延长方向和编辑的「标记修改」是同一类东西：都是这一句话怎么写的开关，
         * 所以摆在同一处 —— 句子左下角那一行常驻工具里，不再在素材和句子之间横一条自己的带子
         * （那条带子只有延长有，换到这个 Tab 整块面板就比别的高一截）。
         */
        : gen.mode === 'extend' ? <div className="direction-options" role="group" aria-label="延长方向" ref={dirWrap}>
          <span className="seg-thumb" aria-hidden style={{ transform: `translateX(${dirInd.x}px)`, width: dirInd.w, opacity: dirInd.w ? 1 : 0 }} />
          {/* 延长永远整条进，方向只决定新片段接在哪一头 */}
          <button className={gen.direction === 'before' ? 'selected' : ''} aria-label="向前延长：新增片段接在原视频之前" aria-pressed={gen.direction === 'before'} onClick={() => patch(nodeId, { direction: 'before' })}><IcArrowR size={13} sw={2} style={{ transform: 'scaleX(-1)' }} />向前</button>
          <button className={gen.direction === 'after' ? 'selected' : ''} aria-label="向后延长：新增片段接在原视频之后" aria-pressed={gen.direction === 'after'} onClick={() => patch(nodeId, { direction: 'after' })}><IcArrowR size={13} sw={2} />向后</button>
        </div> : undefined} />
    {/* 每打开一次就是全新一次圈选，保存是把这一次的标签插进句子里，不动上一次标的那几处 */}
    {dialog && source && <MarkDialog mat={source} model={gen.model} standing={standing} onClose={() => setDialog(false)}
      onCommit={(d) => writeDoc(insertGroup(gen.doc, commitDraft(d, gen.markSeq + 1)), { markSeq: gen.markSeq + 1 })} />}
    <BottomBar busy={busy} disabled={!!error} reason={error ?? undefined} cost={cost} onSend={send} left={<VideoSettings nodeId={nodeId} gen={gen} source={source} get={get} />} />
    {latest && <details className="task-record" open={busy || undefined}><summary>{latest.status === 'running' ? '正在记录演示任务…' : '最近演示任务已完成 · 未生成或修改视频'}<span>{latest.payload.output}</span></summary>
      <p>{MODEL_CAPABILITIES[latest.payload.model].label} · {latest.payload.params.resolution} · {latest.payload.params.duration}s · {latest.payload.params.sound ? '有声' : '无声'}{!!tally?.regions && ` · 标记 ${tally.regions} 处`}{!!tally?.ranges && ` · ${tally.ranges} 段`}{latest.payload.range && ` · 原片范围 ${timecode(latest.payload.range.start)}–${timecode(latest.payload.range.end)}`}{latest.payload.direction && ` · ${latest.payload.direction === 'before' ? '向前延长' : '向后延长'}`}</p>
      <p>{latest.payload.prompt}</p><p>已记录 {latest.payload.inputIds.length} 个有效输入</p>
      <button onClick={() => { const blob = new Blob([JSON.stringify(gen.tasks, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '演示任务记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>下载任务记录（{gen.tasks.length}）</button>
    </details>}
  </>
}
