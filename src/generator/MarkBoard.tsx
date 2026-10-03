import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { mediaFailure, MEDIA_FAIL, type Mat } from './materialLayout'
import { sourceError } from './videoTask'
import { warmFrame } from './markFrame'
import MarkStage from './MarkStage'
import MarkTrack from './MarkTrack'
import { useTip } from './useTip'
import { useAspect } from './hoverShot'
import { IcFrame, IcBrush, IcUndo, IcTrash } from '../ui/icons'
import { docText, marksOf, replaceMarks } from './promptDoc'
import { BRUSH_WIDTH, brushOf, brushPct, clipRegions, commitDraft, draftOf, emptyDraft,
  marksReading, rangeAt, rangesTotal, timecode, type MarkDraft, type MarkTool, type TimeRange } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/**
 * 一套标记读成一串。句子里那几枚标签和手上这份草稿是同一套东西，
 * 比对靠它：一样就不必把外面那份塞回来，也不必让提示词框重挂一遍。
 */
const sign = (d: MarkDraft) => JSON.stringify([
  d.ranges.map((r) => [r.start, r.end]),
  d.regions.map((r) => [r.t, r.tool, r.rect, r.strokes ?? null]),
])
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
  /**
   * 「指定片段」这个开关自己的状态（§3.2.3）。
   * 不再由「有没有片段」推出来：推出来的话，开关只能靠替用户先选上一段来表达「开了」——
   * 而他点开它要的只是「让我来挑」。开着、还一段都没挑时按整段视频处理。
   */
  const [segment, setSegment] = useState(false)
  const [tool, setTool] = useState<MarkTool>('box')
  const [brush, setBrush] = useState(BRUSH_WIDTH)
  const [active, setActive] = useState(-1)
  /** 选中的那几段里，眼下在看的是第几段 —— 播放和圈选都发生在它里面 */
  const [pick, setPick] = useState(0)
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
    || sourceError(mat.dur, mat.ready, gen?.model ?? 'sd2.5', mat.name) || ''

  /**
   * 这块屏自己把源片读出来了，就以眼前这一份为准回填源节点：时长、读没读到、以及那条错。
   *
   * 「读不出来 / 还在读」这两件事原本只有源节点自己那枚 <video> 说得出口
   *（VideoNode 的 onLoadedMetadata / onError），而那枚元素只在节点以普通形态摆在画布上时才在：
   * 它要是错过了那一次 —— 浏览器把整个标签页挪到后台（后台页的 video 干脆不开始加载）、
   * 元素在读到一半时被换掉、或者只是一次偶然的加载失败 —— 那个判断就永远停在错的那一档上：
   * mediaError 一旦写进去，只有它自己再读成功一次才擦得掉，而进了局部编辑它已经不在画面上了，
   * 于是「无法读取，可尝试重新上传」会一直糊在这块屏上，哪怕源片本身好好的。
   *
   * 这块屏用的是同一个 src，而且是 preload=auto —— 它读成功这件事，就是最新、最直接的证据。
   */
  const ready = useCallback((d: number) => {
    setBroken('')
    const n = useCanvas.getState().nodes.find((x) => x.id === mat.id)
    // 三样都已经是对的就不写：updateNode 会换掉整份 nodes，白写一次全画布都跟着重渲染一遍
    if (!n || (n.data.mediaReady === true && n.data.mediaError == null && n.data.dur === d)) return
    useCanvas.getState().updateNode(mat.id, { dur: d, mediaReady: true, mediaError: undefined })
  }, [mat.id])

  /** 源能读就自动播起来：进来先看一遍，比让用户自己按播放更快找到要改的那一帧 */
  useEffect(() => { if (!why) void video.current?.play().catch(() => undefined) }, [why])

  /**
   * 句子里那一套变了（用户把一枚标签退格删掉了）就收回来：画面上那个框跟着消失。
   * 自己刚写出去的那一份不算「变了」—— 否则每动一下都要把它原样再塞回来一次。
   */
  const mine = useRef(sign(draft))
  const outside = draftOf(gen?.marks ?? [])
  const there = sign(outside)
  useEffect(() => {
    if (there === mine.current) return
    mine.current = there
    setDraft(outside)
    // 外面带进来几段（面板回填、或撤销回到有片段的那一步）：开关跟着亮起来
    if (outside.ranges.length) setSegment(true)
    setActive(-1)
    // 句子里少了一段（那枚标签被退格删掉了）：眼下在看的那一段也跟着往回收，别指向一个没有的号
    setPick((p) => clamp(p, 0, Math.max(0, outside.ranges.length - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [there])

  /**
   * 手上这一套写回句子里。标签的读法没变（拖着框改大小）就不让提示词框重挂，
   * 只在松手那一下补一次 —— 每动一像素重挂一遍，句子里那几枚缩略图会一直在闪。
   */
  const pending = useRef(false)
  const write = (d: MarkDraft) => {
    const g = useGenerator.getState().get1(nodeId)
    const doc = replaceMarks(g.doc, commitDraft(d))
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
   * 眼下这一份：选中的那几段，以及在看的是其中第几段。
   * 「改哪几段」是一份清单，但播放头和圈选每时每刻只落在其中一段里。
   * 这一份跟着改动同步更新 —— 拖轨道时「改片段」和「挪播放头」发生在同一个事件里，
   * setDraft 还没落地，夹播放头就会照着上一段夹。
   */
  const live = useRef<{ ranges: TimeRange[]; pick: number }>({ ranges: draft.ranges, pick })
  live.current = { ranges: draft.ranges, pick }
  /** 眼下在看的那一段；一段都没选就是整条片子 */
  const cur = () => live.current.ranges[live.current.pick] ?? null
  /** 把注意力挪到第 i 段上。VideoWiring 一段放完接着放下一段也走这里，所以引用要稳。 */
  const focus = useCallback((i: number) => { live.current = { ...live.current, pick: i }; setPick(i) }, [])
  const inScope = (t: number) => { const r = cur(); return clamp(t, r?.start ?? 0, r?.end ?? duration) }
  /**
   * 播放头只走在眼下这一段里 ——
   * 圈选发生在停住的那一秒上，头出不去，圈就出不去，「圈在片段之外」这件事从源头上不成立。
   */
  const jump = (t: number) => {
    const v = video.current; if (!v) return
    const at = inScope(t)
    v.currentTime = at; setHead(at)
  }
  /** 用户点到哪一秒：那一秒在哪一段里，眼下看的就换成哪一段，然后才夹。 */
  const seek = (t: number) => {
    const i = rangeAt(live.current.ranges, t)
    if (i >= 0 && i !== live.current.pick) focus(i)
    jump(t)
  }
  const pauseAt = (t: number) => { video.current?.pause(); seek(t); setSecond(Math.round(inScope(t))) }
  /** 改完片段之后把播放头收回来：这一下不换段（换了就等于替用户跳到别处去了） */
  const holdAt = (t: number) => { video.current?.pause(); jump(t); setSecond(Math.round(inScope(t))) }
  /**
   * 片段的唯一入口。`fresh` = 这一下是**新选出一段**：那时片段外的已有标记跟着摘掉（§3.2.3）——
   * 选了这一段就是说「只改这儿」，外面留不住东西。
   * 调整已有的那一段不摘：段两端反过来被里面的标记顶住（见 marks 的 pinnedBy）。
   */
  const setRanges = (next: TimeRange[], at: number, fresh = false) => {
    live.current = { ranges: next, pick: clamp(at, 0, Math.max(0, next.length - 1)) }
    setPick(live.current.pick)
    apply({ ranges: next, regions: fresh ? clipRegions(draft.regions, next) : draft.regions })
    setActive(-1)
    const v = video.current, r = cur()
    if (v && r && (v.currentTime < r.start || v.currentTime > r.end)) holdAt(v.currentTime)
  }
  /**
   * 扔掉一段。圈在它里面的那几处跟着走 —— 它们本来就是「这一段里的那几处」，
   * 段没了，这几处也就没有了立足的时间。最后一段被扔掉就等于回到整段视频。
   */
  const dropRange = (i: number) => {
    const r = draft.ranges[i]
    if (why || !r) return
    remember()
    const ranges = draft.ranges.filter((_, j) => j !== i)
    live.current = { ranges, pick: clamp(i, 0, Math.max(0, ranges.length - 1)) }
    setPick(live.current.pick)
    apply({ ranges, regions: draft.regions.filter((g) => g.t < r.start || g.t > r.end) })
    setActive(-1); settle()
    holdAt(video.current?.currentTime ?? 0)
  }
  /**
   * 选了哪一段就播哪一段：段一定下来（live 已同步），就从它的头上把这一段放一遍。
   * 这一下是我们替用户按的，播不起来（刚跳完帧、自动播放被拦）不能算「视频坏了」——
   * 只有用户自己按播放键那一下失败，才值得把整个画面蒙起来说源有问题。
   */
  const playRange = () => {
    const v = video.current, r = cur()
    if (!v || why || !r) return
    jump(r.start)
    void v.play().catch(() => undefined)
  }
  const togglePlay = () => {
    const v = video.current; if (!v || why) return
    if (!v.paused) { v.pause(); return }
    const rs = live.current.ranges
    if (rs.length) {
      // 停在某一段里（还没走到它的尾）就接着放；掉在段外或停在末尾，从第一段的头重放
      const i = rs.findIndex((r) => v.currentTime >= r.start && v.currentTime < r.end - 0.05)
      focus(i < 0 ? 0 : i)
      if (i < 0) jump(rs[0].start)
    } else if (v.currentTime >= duration - 0.05) jump(0)
    void v.play().catch(() => setBroken(mediaFailure('视频', mat.name, MEDIA_FAIL.play)))
  }
  /**
   * 撤销栈。「一步」= 一次动手之前的那个样子：画面上按下去、轨道上拖一把、换一次作用范围，
   * 都在动手前先把当下这一份压进来。只是点了一下没拉出框来（tinyRect）也走这条路退回去 ——
   * 误触和撤回是同一件事，不必为它单留一个「按下之前」的影子。画布那条 ⌘Z 仍在外面兜底。
   */
  const [past, setPast] = useState<MarkDraft[]>([])
  const remember = () => setPast((p) => [...p.slice(-49), draft])
  /** 退回上一份：选中的那几段跟着一起退，播放头掉在新范围外就收回来。 */
  const back = () => {
    const prev = past[past.length - 1]
    if (!prev) return
    setPast((p) => p.slice(0, -1))
    live.current = { ranges: prev.ranges, pick: clamp(pick, 0, Math.max(0, prev.ranges.length - 1)) }
    setPick(live.current.pick)
    apply(prev); setActive(-1); settle()
    const v = video.current, r = cur()
    if (v && r && (v.currentTime < r.start || v.currentTime > r.end)) holdAt(v.currentTime)
  }
  const begin = (t: number) => { remember(); pauseAt(t) }
  const cancel = () => back()
  /** 清除全部标记：只收画面上圈的那些，片段留着（§3.2.3）—— 片段说的是「改哪一截」，不是标记。 */
  const clearAll = () => {
    if (why || !draft.regions.length) return
    remember(); apply({ ...draft, regions: [] }); setActive(-1); settle()
  }
  /**
   * 开关只管「要不要只改一截」这一件事：打开就把时间轴摆出来，哪一截由他在轨道上点（§3.2.3）。
   * 关掉清除全部片段，画面标记留着 —— 标记是手画出来的，比一个开关贵得多。
   */
  const setScope = (on: boolean) => {
    if (why || on === segment) return
    setSegment(on)
    if (on || !draft.ranges.length) return
    remember(); live.current = { ranges: [], pick: 0 }; setPick(0)
    apply({ ...draft, ranges: [] }); settle()
  }

  const noStep = !past.length, noMark = !draft.regions.length
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
    <button className="mark-round" aria-label="撤销" aria-disabled={noStep}
      {...tip(noStep ? '暂无可撤销的操作' : '撤销上一步操作')} onClick={back}><IcUndo size={14} /></button>
    <button className="mark-round" aria-label="清除全部标记" aria-disabled={noMark}
      {...tip(noMark ? '暂无可清除的标记' : '清除全部标记')} onClick={clearAll}><IcTrash size={14} /></button>
  </>

  return <div className="nd-board mark-board nodrag nowheel" onPointerUp={settle} onPointerCancel={settle}>
    <MarkStage mat={mat} video={video} tool={tool} brush={brush} draft={draft} second={second} active={active} aspect={aspect}
      paused={!playing} playing={playing} veil={why} loading={loading} tools={stageTools}
      onTogglePlay={togglePlay} onBegin={begin} onDraft={(d, i) => { apply(d); setActive(i) }} onCancel={cancel} />
    {/* video 的事件绑在 MarkStage 渲染出来的那个元素上，这里只挂回调 */}
    <VideoWiring video={video} ranges={draft.ranges} pick={pick} duration={duration} src={mat.src} name={mat.name}
      onHead={setHead} onPlaying={setPlaying} onSecond={setSecond} onBroken={setBroken} onReady={ready} onPick={focus} />
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
      <button role="switch" aria-checked={segment} aria-disabled={!!why}
        className={`mark-switch${segment ? ' on' : ''}`}
        {...tip(why || '只改选中的片段')}
        onClick={() => setScope(!segment)}><i aria-hidden />指定片段</button>
      {/* 没选片段时这里什么都不写：开关本身已经说了「改的是整条」，再补一句「整段 00:00–00:10」
          只是把同一件事说第二遍，还占掉这一行最后那块地方 —— 那块地方留给真选了片段时的时间码。
          选了不止一段就不再摊开每一段的时间码（一行摆不下）：报几段、加起来多长，细目在下面那条轨上 */}
      {!why && !!draft.ranges.length && <span className="mark-range">
        {draft.ranges.length > 1
          ? `${draft.ranges.length} 段 · 共 ${rangesTotal(draft.ranges)}s`
          : `${timecode(draft.ranges[0].start)} – ${timecode(draft.ranges[0].end)}`}</span>}
    </div>
    {/* 开关一开轨道就摆出来，哪怕还一段都没选 —— 「点时间轴才选出一段」得先看得见时间轴 */}
    {segment && <MarkTrack mat={mat} ranges={draft.ranges} pick={pick} regions={draft.regions} head={head} why={why}
      onBegin={remember} onSeek={pauseAt} onRanges={setRanges} onDrop={dropRange} onPicked={playRange} />}
    {tipNode}
  </div>
}
/** 播放状态与播放头：video 元素在 MarkStage 里，这里只负责把它的事件接出来。 */
function VideoWiring({ video, ranges, pick, duration, src, name, onHead, onPlaying, onSecond, onBroken, onReady, onPick }: {
  video: React.RefObject<HTMLVideoElement>; ranges: TimeRange[]; pick: number; duration: number
  src?: string; name: string
  onHead: (t: number) => void; onPlaying: (v: boolean) => void; onSecond: (t: number) => void; onBroken: (v: string) => void
  /** 这块屏把源片读出来了，时长报上去 —— 谁在等这一句，见 MarkBoard 里的 ready */
  onReady: (dur: number) => void
  /** 一段放完，接着放下一段：报一声眼下换到第几段了 */
  onPick: (i: number) => void
}) {
  const box = useRef({ ranges, pick, duration, src }); box.current = { ranges, pick, duration, src }
  useEffect(() => {
    const v = video.current; if (!v) return
    const play = () => onPlaying(true)
    const pause = () => { onPlaying(false); onSecond(Math.round(v.currentTime)) }
    const time = () => {
      const { ranges: rs, pick: i } = box.current
      const r = rs[i]
      // 选了片段就只播这几段：一段放到尾，接着放下一段；最后一段放完才停住，中间没选的那几截跳过去
      if (r && v.currentTime >= r.end) {
        const next = rs[i + 1]
        // 跳过去之后 pick 还要等一次渲染才跟上，这时候再收到一次 timeupdate 也不会重跳：已经在那儿了
        if (next && !v.paused) { if (v.currentTime < next.start) { v.currentTime = next.start; onPick(i + 1) } }
        else { v.pause(); v.currentTime = r.end }
      }
      onHead(v.currentTime)
    }
    // 整条放完了从头再来：选了片段就回到第一段的头上
    const ended = () => {
      const first = box.current.ranges[0]
      v.currentTime = first?.start ?? 0
      if (first) onPick(0)
      void v.play().catch(() => undefined)
    }
    // 暂停到的每一秒顺手存一张干净帧：句子里的 chip 立刻就有图，不用再解一遍视频
    const seeked = () => { if (box.current.src) warmFrame(v, box.current.src, Math.round(v.currentTime)) }
    const fail = () => onBroken(mediaFailure('视频', name, MEDIA_FAIL.read))
    /* 挂上来时元素可能已经读完了（换个源、组件重挂）—— 那就不会再有 loadedmetadata 可等，当场报一次 */
    const meta = () => { if (Number.isFinite(v.duration)) onReady(v.duration) }
    meta()
    v.addEventListener('play', play); v.addEventListener('pause', pause); v.addEventListener('timeupdate', time)
    v.addEventListener('ended', ended); v.addEventListener('seeked', seeked); v.addEventListener('error', fail)
    v.addEventListener('loadedmetadata', meta)
    return () => {
      v.removeEventListener('play', play); v.removeEventListener('pause', pause); v.removeEventListener('timeupdate', time)
      v.removeEventListener('ended', ended); v.removeEventListener('seeked', seeked); v.removeEventListener('error', fail)
      v.removeEventListener('loadedmetadata', meta)
    }
  }, [video, name, onHead, onPlaying, onSecond, onBroken, onReady, onPick])
  return null
}
