import { useEffect, useRef, useState } from 'react'
import { useGenerator } from '../store/generator'
import { mediaFailure, MEDIA_FAIL, type Mat } from './materialLayout'
import { sourceError } from './videoTask'
import { warmFrame } from './markFrame'
import MarkStage from './MarkStage'
import MarkTrack from './MarkTrack'
import { useTip } from './useTip'
import { useAspect } from './hoverShot'
import { IcFrame, IcBrush, IcUndo, IcTrash } from '../ui/icons'
import { docText, marksOf, replaceGroup } from './promptDoc'
import { BRUSH_WIDTH, brushOf, brushPct, clipRegions, commitDraft, defaultSegment, draftEmpty, emptyDraft,
  marksReading, timecode, type MarkDraft, type MarkGroup, type MarkTool, type TimeRange } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/**
 * 一套标记读成一串。句子里那几枚标签和手上这份草稿是同一套东西，
 * 比对靠它：一样就不必把外面那份塞回来，也不必让提示词框重挂一遍。
 */
const sign = (d: MarkDraft) => JSON.stringify([
  d.range && [d.range.start, d.range.end],
  d.regions.map((r) => [r.t, r.tool, r.rect, r.strokes ?? null]),
])
const draftOf = (g: MarkGroup | null): MarkDraft => g ? { regions: g.regions, range: g.range } : emptyDraft()
/**
 * 专注态节点上那半截：原片摆在上面，「整段视频 / 指定片段」和时间轴长在画面下面。
 *
 * 它没有「打开 / 关闭」这个回合，所以也没有提交和取消 —— 画面上圈一个框、轴上拖一段，
 * 当场就进句子。删除同样不在这里做：句子里那枚标签退格删掉，这次任务里就没有它，
 * 外面的 marks 变了，手上这份草稿跟着变回去。句子是唯一真相，这块面板只是它的另一种样子。
 */
export default function MarkBoard({ nodeId, mat, onBump }: { nodeId: string; mat: Mat; onBump: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const gen = useGenerator((s) => s.map[nodeId])
  const [draft, setDraft] = useState<MarkDraft>(emptyDraft)
  const [tool, setTool] = useState<MarkTool>('box')
  const [brush, setBrush] = useState(BRUSH_WIDTH)
  const [active, setActive] = useState(-1)
  const [head, setHead] = useState(0)
  const [second, setSecond] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState('')
  const { tip, node: tipNode } = useTip()
  const duration = mat.dur ?? 0
  // 这块屏按素材本来的比例摆：横屏摊成横屏、竖屏摊成竖屏，两边都不留黑
  const aspect = useAspect(mat.thumb)
  const loading = !broken && !mat.error && (mat.ready === false || mat.dur == null)
  const why = broken || (mat.error ? mediaFailure('视频', mat.name, mat.error) : '')
    || sourceError(mat.dur, mat.ready, 'edit', gen?.model ?? 'sd2.5', mat.name) || ''

  /** 源能读就自动播起来：进来先看一遍，比让用户自己按播放更快找到要改的那一帧 */
  useEffect(() => { if (!why) void video.current?.play().catch(() => undefined) }, [why])

  /**
   * 句子里那一套变了（用户把一枚标签退格删掉了）就收回来：画面上那个框跟着消失。
   * 自己刚写出去的那一份不算「变了」—— 否则每动一下都要把它原样再塞回来一次。
   */
  const mine = useRef(sign(draft))
  const outside = draftOf(gen?.marks[0] ?? null)
  const there = sign(outside)
  useEffect(() => {
    if (there === mine.current) return
    mine.current = there
    setDraft(outside)
    setActive(-1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [there])

  /**
   * 手上这一套写回句子里。标签的读法没变（拖着框改大小）就不让提示词框重挂，
   * 只在松手那一下补一次 —— 每动一像素重挂一遍，句子里那几枚缩略图会一直在闪。
   */
  const pending = useRef(false)
  const write = (d: MarkDraft) => {
    const g = useGenerator.getState().get1(nodeId)
    const doc = replaceGroup(g.doc, commitDraft(d))
    const marks = marksOf(doc)
    useGenerator.getState().patch(nodeId, { doc, marks,
      prompt: docText(doc, { name: mat.name, direction: g.direction, duration: g.params.duration }) })
    if (marksReading(marks) !== marksReading(g.marks)) { pending.current = false; onBump() }
    else pending.current = true
  }
  const apply = (d: MarkDraft) => { mine.current = sign(d); setDraft(d); write(d) }
  /** 松手那一下：拖动期间攒下的改动，这时候才让句子里的缩略图跟上 */
  const settle = () => { if (pending.current) { pending.current = false; onBump() } }

  /**
   * 当前作用范围。拖轨道时「改片段」和「挪播放头」发生在同一个事件里，
   * setDraft 还没落地，夹播放头就会照着上一段夹 —— 所以这一份跟着改动同步更新。
   */
  const scope = useRef(draft.range)
  scope.current = draft.range
  const inScope = (t: number) => clamp(t, scope.current?.start ?? 0, scope.current?.end ?? duration)
  /**
   * 播放头只走在当前作用范围里：选了片段就夹在片段内 ——
   * 圈选发生在停住的那一秒上，头出不去，圈就出不去，「圈在片段之外」这件事从源头上不成立。
   */
  const seek = (t: number) => {
    const v = video.current; if (!v) return
    const at = inScope(t)
    v.currentTime = at; setHead(at)
  }
  const pauseAt = (t: number) => { video.current?.pause(); seek(t); setSecond(Math.round(inScope(t))) }
  /**
   * 片段的唯一入口：片段就是这次能改的全部范围 ——
   * 掉到新片段外面的那几处跟着摘掉，播放头也收回片段里。
   */
  const setRange = (next: TimeRange) => {
    scope.current = next
    apply({ range: next, regions: clipRegions(draft.regions, next) })
    setActive(-1)
    const v = video.current
    if (v && (v.currentTime < next.start || v.currentTime > next.end)) pauseAt(v.currentTime)
  }
  /**
   * 选了哪一段就播哪一段：片段一定下来（scope 已同步），就从它的头上把这一段放一遍。
   * 这一下是我们替用户按的，播不起来（刚跳完帧、自动播放被拦）不能算「视频坏了」——
   * 只有用户自己按播放键那一下失败，才值得把整个画面蒙起来说源有问题。
   */
  const playRange = () => {
    const v = video.current, r = scope.current
    if (!v || why || !r) return
    seek(r.start)
    void v.play().catch(() => undefined)
  }
  const togglePlay = () => {
    const v = video.current; if (!v || why) return
    if (!v.paused) { v.pause(); return }
    const r = draft.range
    if (r && (v.currentTime < r.start || v.currentTime >= r.end)) seek(r.start)
    else if (!r && v.currentTime >= duration - 0.05) seek(0)
    void v.play().catch(() => setBroken(mediaFailure('视频', mat.name, MEDIA_FAIL.play)))
  }
  /**
   * 撤销栈。「一步」= 一次动手之前的那个样子：画面上按下去、轨道上拖一把、换一次作用范围，
   * 都在动手前先把当下这一份压进来。只是点了一下没拉出框来（tinyRect）也走这条路退回去 ——
   * 误触和撤回是同一件事，不必为它单留一个「按下之前」的影子。画布那条 ⌘Z 仍在外面兜底。
   */
  const [past, setPast] = useState<MarkDraft[]>([])
  const remember = () => setPast((p) => [...p.slice(-49), draft])
  /** 退回上一份：作用范围跟着一起退，播放头掉在新范围外就收回来。 */
  const back = () => {
    const prev = past[past.length - 1]
    if (!prev) return
    setPast((p) => p.slice(0, -1))
    scope.current = prev.range
    apply(prev); setActive(-1); settle()
    const v = video.current
    if (v && (v.currentTime < (prev.range?.start ?? 0) || v.currentTime > (prev.range?.end ?? duration))) pauseAt(v.currentTime)
  }
  const begin = (t: number) => { remember(); pauseAt(t) }
  const cancel = () => back()
  /** 清除全部：这次任务的标记一次收干净，作用范围也回到整段 —— 它本身就是标记的一部分。 */
  const clearAll = () => {
    if (why || draftEmpty(draft)) return
    remember(); scope.current = null
    apply(emptyDraft()); setActive(-1); settle()
  }
  const setScope = (segment: boolean) => {
    if (why || segment === !!draft.range) return
    remember()
    if (!segment) { scope.current = null; apply({ ...draft, range: null }); return }
    const range = defaultSegment(video.current?.currentTime ?? 0, duration)
    scope.current = range
    apply({ range, regions: clipRegions(draft.regions, range) }); setActive(-1)
    playRange()
  }

  const noStep = !past.length, noMark = draftEmpty(draft)
  /**
   * 压在画面底边的那条浮动工具行。它管的全是「画面上这一下」：手往哪儿涂、上一下不算数、全部重来 ——
   * 所以摆在手边，而不是和「改整段还是改一段」一起排在画面下面的那一行里。
   */
  const stageTools = <>
    {tool === 'brush' && <>
      <label className="mark-brush">
        笔刷
        {/* 走过的那一截亮起来：原生滑杆没有「已填充」这一段，只能把它画进轨道的底色里 */}
        <input type="range" min={0} max={100} step={1} value={Math.round(brushPct(brush) * 100)}
          style={{ '--pct': `${Math.round(brushPct(brush) * 100)}%` } as React.CSSProperties}
          aria-label="笔刷粗细" onChange={(e) => setBrush(brushOf(Number(e.target.value) / 100))} />
      </label>
      <i className="mark-sep" aria-hidden />
    </>}
    <button className="mark-round" aria-label="撤回上一步" aria-disabled={noStep}
      {...tip(noStep ? '还没有可撤回的一步' : undefined)} onClick={back}><IcUndo size={14} /></button>
    <button className="mark-round" aria-label="清除全部标记" aria-disabled={noMark}
      {...tip(noMark ? '这次还没有标记' : '清除这次的全部标记')} onClick={clearAll}><IcTrash size={14} /></button>
  </>

  return <div className="nd-board mark-board nodrag nowheel" onPointerUp={settle} onPointerCancel={settle}>
    <MarkStage mat={mat} video={video} tool={tool} brush={brush} draft={draft} second={second} active={active} aspect={aspect}
      paused={!playing} playing={playing} veil={why} loading={loading} tools={stageTools}
      onTogglePlay={togglePlay} onBegin={begin} onDraft={(d, i) => { apply(d); setActive(i) }} onCancel={cancel} />
    {/* video 的事件绑在 MarkStage 渲染出来的那个元素上，这里只挂回调 */}
    <VideoWiring video={video} range={draft.range} duration={duration} src={mat.src} name={mat.name}
      onHead={setHead} onPlaying={setPlaying} onSecond={setSecond} onBroken={setBroken} />
    <div className="mark-tools">
      <div className="mark-toolpick">
        <button aria-pressed={tool === 'box'} className={tool === 'box' ? 'selected' : ''} onClick={() => setTool('box')}><IcFrame size={14} />框选</button>
        <button aria-pressed={tool === 'brush'} className={tool === 'brush' ? 'selected' : ''} onClick={() => setTool('brush')}><IcBrush size={14} />画笔</button>
      </div>
      <i className="mark-sep" aria-hidden />
      {/*
        「整段 / 这一段」只有开和关两个样子，摆成一枚开关就够了 ——
        两个并排的按钮要用户先读完两条文字才知道现在是哪一档，开关自己就说了。
        当前范围写在同一行的末尾：开关说「改不改一段」，这个数说「改的是哪一段」。
      */}
      <button role="switch" aria-checked={!!draft.range} aria-disabled={!!why}
        className={`mark-switch${draft.range ? ' on' : ''}`}
        {...tip(why || '只播放、也只在所选片段内标记；关掉就是改整条')}
        onClick={() => setScope(!draft.range)}><i aria-hidden />只改指定片段</button>
      {/* 没选片段时这里什么都不写：开关本身已经说了「改的是整条」，再补一句「整段 00:00–00:10」
          只是把同一件事说第二遍，还占掉这一行最后那块地方 —— 那块地方留给真选了片段时的时间码 */}
      {!why && draft.range && <span className="mark-range">
        {timecode(draft.range.start)} – {timecode(draft.range.end)}</span>}
    </div>
    {/* 整段视频没有可拖的那一段，轨道也就没有内容可摆 —— 选了片段才长出来 */}
    {!!draft.range && <MarkTrack mat={mat} range={draft.range} regions={draft.regions} head={head} why={why}
      onBegin={remember} onSeek={pauseAt} onRange={setRange} onPicked={playRange} />}
    {tipNode}
  </div>
}
/** 播放状态与播放头：video 元素在 MarkStage 里，这里只负责把它的事件接出来。 */
function VideoWiring({ video, range, duration, src, name, onHead, onPlaying, onSecond, onBroken }: {
  video: React.RefObject<HTMLVideoElement>; range: { start: number; end: number } | null; duration: number
  src?: string; name: string
  onHead: (t: number) => void; onPlaying: (v: boolean) => void; onSecond: (t: number) => void; onBroken: (v: string) => void
}) {
  const box = useRef({ range, duration, src }); box.current = { range, duration, src }
  useEffect(() => {
    const v = video.current; if (!v) return
    const play = () => onPlaying(true)
    const pause = () => { onPlaying(false); onSecond(Math.round(v.currentTime)) }
    const time = () => {
      const r = box.current.range
      // 选了片段就只播这一段：放到尾就停住，不再往后漫出去
      if (r && v.currentTime >= r.end) { v.pause(); v.currentTime = r.end }
      onHead(v.currentTime)
    }
    const ended = () => { v.currentTime = box.current.range?.start ?? 0; void v.play().catch(() => undefined) }
    // 暂停到的每一秒顺手存一张干净帧：句子里的 chip 立刻就有图，不用再解一遍视频
    const seeked = () => { if (box.current.src) warmFrame(v, box.current.src, Math.round(v.currentTime)) }
    const fail = () => onBroken(mediaFailure('视频', name, MEDIA_FAIL.read))
    v.addEventListener('play', play); v.addEventListener('pause', pause); v.addEventListener('timeupdate', time)
    v.addEventListener('ended', ended); v.addEventListener('seeked', seeked); v.addEventListener('error', fail)
    return () => {
      v.removeEventListener('play', play); v.removeEventListener('pause', pause); v.removeEventListener('timeupdate', time)
      v.removeEventListener('ended', ended); v.removeEventListener('seeked', seeked); v.removeEventListener('error', fail)
    }
  }, [video, name, onHead, onPlaying, onSecond, onBroken])
  return null
}
