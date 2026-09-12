import { useEffect, useRef, useState } from 'react'
import { fmt, partition, type Mat, type MatGet } from './materialLayout'
import { useCanvas } from '../store/canvas'
import { useGenerator, type GenState } from '../store/generator'
import { IcExpand, IcPlay, IcSwap } from '../ui/icons'
import MediaPreview from './MediaPreview'
import Overlay from './Overlay'
/** 首帧位与尾帧位的水平距离：方块 72 + 连接线 52。 */
const FRAME_OFF = 124
type Size = 'frame' | 'source' | 'reference'
function MaterialTile({ mat, role, size, mark }: { mat: Mat; role: string; size: Size; mark?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [hover, setHover] = useState(false); const [preview, setPreview] = useState(false)
  const lit = useCanvas((s) => s.hoverMat === mat.id)
  const enter = () => { clearTimeout(closeTimer.current); useCanvas.getState().setHoverMat(mat.id); clearTimeout(openTimer.current); openTimer.current = setTimeout(() => setHover(true), 300) }
  const leave = () => { clearTimeout(openTimer.current); closeTimer.current = setTimeout(() => { setHover(false); if (useCanvas.getState().hoverMat === mat.id) useCanvas.getState().setHoverMat(null) }, 180) }
  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); if (useCanvas.getState().hoverMat === mat.id) useCanvas.getState().setHoverMat(null) }, [mat.id])
  const showPreview = () => { ref.current?.focus({ preventScroll: true }); clearTimeout(openTimer.current); clearTimeout(closeTimer.current); setHover(false); setPreview(true) }
  const info = `${role} · ${mat.name}${mat.kind === 'video' ? ' · ' + (mat.dur != null ? fmt(mat.dur) : '读取时长中') : ''}`
  return <div className={`material-wrap ${size}`} onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}>
    <button ref={ref} className={`material-tile${lit ? ' lit' : ''}`} aria-label={info} onClick={showPreview}>
      {mat.thumb && <img src={mat.thumb} alt="" />}
      {/* 缩略图只留一个标记：视频一个播放小方框，首尾帧一个角标。其余信息都交给悬浮卡 */}
      {mat.kind === 'video' && <span className="material-play">▶</span>}
      {mark && <span className="material-mark">{mark}</span>}
    </button>
    {hover && !preview && <Overlay passive tail label={info} anchor={ref} className="material-card" onClose={() => setHover(false)} onMouseEnter={() => { clearTimeout(closeTimer.current); useCanvas.getState().setHoverMat(mat.id) }} onMouseLeave={leave}>
      <button className="material-card-shot" onClick={showPreview} aria-label={`放大查看 ${mat.name}`}>
        {mat.thumb && <img src={mat.thumb} alt="" />}
        <span className="material-card-veil" />
        <span className="material-card-cue">{mat.kind === 'video' ? <IcPlay size={16} /> : <IcExpand size={15} sw={2} />}</span>
      </button>
      <div className="material-card-meta"><strong>{mat.name}</strong></div>
    </Overlay>}
    {preview && <MediaPreview mat={mat} onClose={() => setPreview(false)} />}
  </div>
}
/** 空槽只做占位与引导，素材一律从画布连线进入。 */
function EmptySlot({ role, size, kind, required }: { role: string; size: Size; kind: '图片' | '视频' | '素材'; required?: boolean }) {
  const hint = `${required ? '必填' : '选填'} · 从画布连接${kind}节点后自动填入`
  return <div className={`material-wrap ${size}`}>
    <div className={`material-empty${required ? ' required' : ''}`} title={`${role}：${hint}`} aria-label={`${role}：${hint}`}>
      <span>{role}</span><small>连接节点</small>
    </div>
  </div>
}
/** 本次用不上的素材：连接不断、缩略图不消失，打上斜纹并说明原因。 */
function SkippedTile({ mat, reason }: { mat: Mat; reason: string }) {
  return <div className="material-skip" title={reason} aria-label={`${mat.name}：${reason}`} tabIndex={0}>
    {mat.thumb && <img src={mat.thumb} alt="" />}
    <span className="material-skip-veil" aria-hidden />
  </div>
}
export default function MaterialRow({ nodeId, gen, get }: { nodeId: string; gen: GenState; get: MatGet }) {
  if (gen.mode === 'text') return null
  const { skipped } = partition(gen, gen.mode, gen.model, get)
  const tile = (id: string, role: string, size: Size, mark?: string) => {
    const mat = get(id)
    return mat ? <MaterialTile key={mat.id} mat={mat} role={role} size={size} mark={mark} /> : null
  }
  const frames = [
    { zone: 'first', id: gen.slotFirst, role: '首帧', mark: '首' },
    { zone: 'last', id: gen.slotLast, role: '尾帧', mark: '尾' },
  ] as const
  return <div className="material-row nodrag nowheel">
    {gen.mode === 'frames' ? <div className="frame-lane" style={{ width: FRAME_OFF + 72 }}>
      {frames.map((f, i) => <div key={f.id ?? f.zone} className="frame-pos" style={{ transform: `translateX(${i * FRAME_OFF}px)` }}>
        {f.id ? tile(f.id, f.role, 'frame', f.mark)
          : <EmptySlot role={f.role} size="frame" kind="图片" required={i === 0} />}
      </div>)}
      {/* 连接区整体可悬停：线上跑光点、交换键转 180°、顶上弹「互换一下」 */}
      <div className={`frame-link${gen.slotFirst && gen.slotLast ? ' on' : ''}`} data-tip="互换一下">
        <span className="frame-line" aria-hidden />
        {gen.slotFirst && gen.slotLast && <button className="frame-swap" aria-label="交换首尾帧"
          onClick={() => useGenerator.getState().swapFrames(nodeId)}><IcSwap size={13} /></button>}
      </div>
    </div> : <>
      {(gen.mode === 'edit' || gen.mode === 'extend') && <div className="source-material">
        {gen.slotEdit ? tile(gen.slotEdit, gen.mode === 'edit' ? '待编辑视频' : '待延长视频', 'source')
          : <EmptySlot role="源视频" size="source" kind="视频" required />}
        <span>源视频</span>
      </div>}
      <div className="reference-materials">
        {gen.tray.map((id) => tile(id, '参考素材', 'reference'))}
        {!gen.tray.length && <EmptySlot role="参考素材" size="reference" kind="素材" required={gen.mode === 'ref'} />}
      </div>
    </>}
    {!!skipped.length && <div className="material-skipped" role="group" aria-label={`${skipped.length} 个素材本次不参与`}>
      <span className="material-skipped-label">不参与</span>
      {skipped.map(({ id, reason }) => { const m = get(id); return m ? <SkippedTile key={id} mat={m} reason={reason} /> : null })}
    </div>}
  </div>
}
