import { useEffect, useRef, useState } from 'react'
import { mediaFailure, MEDIA_FAIL, type Mat, type Model } from './materialLayout'
import { sourceError } from './videoTask'
import { warmFrame } from './markFrame'
import Overlay from './Overlay'
import MarkStage from './MarkStage'
import MarkTrack from './MarkTrack'
import { useTip } from './useTip'
import { IcClose, IcFrame, IcBrush, IcUndo } from '../ui/icons'
import { clipRegions, defaultSegment, draftEmpty, emptyDraft, rangeLabel, regionLabel, timecode, type MarkDraft, type MarkTool, type TimeRange } from './marks'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
interface Props {
  mat: Mat; model: Model
  /** 句子里现在标着几处（保存是接在它们后面，不动它们）。 */
  standing?: string
  onCommit: (draft: MarkDraft) => void; onClose: () => void
}
/**
 * 标记弹窗：一次打开就是一次全新的圈选，不装载上一次标了什么 ——
 * 保存进句子的只跟这一次圈的有关，接在上一次标的那几处后面，两次互不干扰。
 * 选了片段就只播这一段、也只能在这一段里圈；片段改了，掉到外面的那几处跟着摘掉。
 * 会话期间的一切（草稿、撤销栈、播放状态）都只活在这里 —— 取消掉不留任何痕迹。
 */
export default function MarkDialog({ mat, model, standing, onCommit, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const undo = useRef<MarkDraft[]>([])
  const [draft, setDraft] = useState<MarkDraft>(emptyDraft)
  const [depth, setDepth] = useState(0)
  const [tool, setTool] = useState<MarkTool>('box')
  const [active, setActive] = useState(-1)
  const [head, setHead] = useState(0)
  const [second, setSecond] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [broken, setBroken] = useState('')
  const { tip, node: tipNode } = useTip()
  const duration = mat.dur ?? 0
  const loading = !broken && !mat.error && (mat.ready === false || mat.dur == null)
  const why = broken || (mat.error ? mediaFailure('视频', mat.name, mat.error) : '')
    || sourceError(mat.dur, mat.ready, 'edit', model, mat.name) || ''
  const empty = draftEmpty(draft)
  const pristine = empty

  /** 源能读就自动播起来：进来先看一遍，比让用户自己按播放更快找到要改的那一帧 */
  useEffect(() => { if (!why) void video.current?.play().catch(() => undefined) }, [why])

  const push = () => { undo.current = [...undo.current, draft]; setDepth(undo.current.length) }
  const pop = () => {
    const prev = undo.current[undo.current.length - 1]
    if (!prev || why) return
    undo.current = undo.current.slice(0, -1)
    setDepth(undo.current.length); setDraft(prev); setActive(prev.regions.length - 1)
  }
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
    setDraft((d) => ({ range: next, regions: clipRegions(d.regions, next) }))
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
  /** 按下画面的那一刻：停在这一整秒，并记一笔可撤销 */
  const begin = (t: number) => { push(); pauseAt(t) }
  const setScope = (segment: boolean) => {
    if (why || segment === !!draft.range) return
    push()
    if (!segment) { scope.current = null; setDraft({ ...draft, range: null }); return }
    const range = defaultSegment(video.current?.currentTime ?? 0, duration)
    scope.current = range
    setDraft({ range, regions: clipRegions(draft.regions, range) }); setActive(-1)
    playRange()
  }
  const clear = () => { if (why || empty) return; push(); setDraft(emptyDraft()); setActive(-1) }
  /** 底部清单上摘掉一枚：和画面上的手势走同一条撤销栈，摘错了还能撤回来 */
  const dropRegion = (i: number) => { if (why) return; push(); setDraft((d) => ({ ...d, regions: d.regions.filter((_, j) => j !== i) })); setActive(-1) }
  const dropRange = () => { if (why) return; push(); scope.current = null; setDraft((d) => ({ ...d, range: null })) }
  const tryClose = () => { if (pristine) onClose(); else setConfirm(true) }
  const commit = () => { if (why || empty) return; onCommit(draft); onClose() }

  const undoWhy = why || (!depth ? '暂无可撤销的操作' : '')
  const clearWhy = why || (empty ? '暂无可清除的标记' : '')
  const commitWhy = why || (empty ? '先标记区域或选择时间范围' : '')

  return <Overlay modal label="标记修改区域" className="mark-dialog" onClose={tryClose}>
    <div onKeyDown={(e) => {
      if (e.key !== ' ' && e.code !== 'Space') return
      if ((e.target as HTMLElement).closest('[role=slider]')) return
      e.preventDefault(); togglePlay()
    }}>
      <header className="mark-head">
        <div><strong>标记修改区域</strong><span>视频 {mat.name} · {timecode(duration)} · 每处标记独立记录所在时间</span></div>
        <button className="mark-clear-all" aria-disabled={!!clearWhy} {...tip(clearWhy || undefined)}
          onClick={clear}>清除全部</button>
        <button className="mark-x" aria-label="关闭标记" onClick={tryClose}><IcClose size={14} /></button>
      </header>
      <MarkStage mat={mat} video={video} tool={tool} draft={draft} second={second} active={active}
        paused={!playing} playing={playing} veil={why} loading={loading}
        onTogglePlay={togglePlay} onBegin={begin} onDraft={(d, i) => { setDraft(d); setActive(i) }} onCancel={pop} />
      {/* video 的事件绑在 MarkStage 渲染出来的那个元素上，这里只挂回调 */}
      <VideoWiring video={video} range={draft.range} duration={duration} src={mat.src} name={mat.name}
        onHead={setHead} onPlaying={setPlaying} onSecond={setSecond} onBroken={setBroken} />
      <div className="mark-tools">
        <div className="segmented">
          <button aria-pressed={!draft.range} aria-disabled={!!why} className={draft.range ? '' : 'selected'}
            {...tip(why || undefined)} onClick={() => setScope(false)}>整段视频</button>
          <button aria-pressed={!!draft.range} aria-disabled={!!why} className={draft.range ? 'selected' : ''}
            {...tip(why || '仅播放所选片段，也仅在该片段内标记')}
            onClick={() => setScope(true)}>指定片段</button>
        </div>
        <i className="mark-sep" aria-hidden />
        <div className="mark-toolpick">
          <button aria-pressed={tool === 'box'} className={tool === 'box' ? 'selected' : ''} onClick={() => setTool('box')}><IcFrame size={14} />框选</button>
          <button aria-pressed={tool === 'brush'} className={tool === 'brush' ? 'selected' : ''} onClick={() => setTool('brush')}><IcBrush size={14} />画笔</button>
        </div>
        {/* 这一行只留一个「撤回上一步」：清空整次标记在标题栏上已经有一个出口，
            再摆一把橡皮擦只是同一件事的第二个按钮，还会被误读成「擦掉笔迹」这种并不存在的工具 */}
        <div className="mark-acts">
          <button className="mark-round" aria-label="撤销" aria-disabled={!!undoWhy} {...tip(undoWhy || '撤销上一步操作')} onClick={pop}><IcUndo size={15} /></button>
        </div>
      </div>
      <MarkTrack mat={mat} range={draft.range} regions={draft.regions} head={head} why={why}
        onBegin={push} onSeek={pauseAt} onRange={setRange} onPicked={playRange} />
      <footer className="mark-foot">
        {/* 这份清单和句子里将出现的标签一一对应，而且每一枚都能就地摘掉 —— 删除只在这里做 */}
        <span className="mark-pending">
          {empty ? (standing ? `尚未标记任何区域 · 本次标记将追加到当前的 ${standing}之后` : '尚未标记任何区域') : '本次标记'}
          {!!draft.range && <button className="mark-pending-chip" aria-label={`移除 ${rangeLabel(draft.range)} 这一段时间`}
            onClick={dropRange}>片段 {rangeLabel(draft.range)}<IcClose size={9} sw={2.6} /></button>}
          {draft.regions.map((r, i) => <button key={i} aria-label={`删除 ${regionLabel(r)}`}
            className="mark-pending-chip"
            onClick={() => dropRegion(i)}>{regionLabel(r)}<IcClose size={9} sw={2.6} /></button>)}
        </span>
        <button className="mark-cancel" onClick={tryClose}>取消</button>
        <button className="mark-commit" aria-disabled={!!commitWhy} {...tip(commitWhy || undefined)}
          onClick={commit}>添加到输入框</button>
      </footer>
      {/* 确认层留在弹窗内部：再开一个 Overlay 会落在这个 Overlay 之外，点它反而会触发外部关闭 */}
      {confirm && <div className="mark-confirm" role="alertdialog" aria-label="放弃本次标记">
        <div>
          <strong>放弃本次标记？</strong>
          <p>{`${draft.regions.length
            ? `本次已标记 ${draft.regions.length} 处${draft.range ? `，位于 ${rangeLabel(draft.range)} 片段内` : ''}`
            : `本次已选定 ${rangeLabel(draft.range!)} 片段，尚未标记任何区域`}，尚未添加到输入框。放弃后需重新标记。`}</p>
          <div><button onClick={onClose}>放弃</button><button className="mark-commit" onClick={commit}>添加到输入框</button></div>
        </div>
      </div>}
      {tipNode}
    </div>
  </Overlay>
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
    // 暂停到的每一秒顺手存一张干净帧：提交之后句子里的 chip 立刻就有图，不用再解一遍视频
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
