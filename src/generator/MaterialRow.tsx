import { useEffect, useRef, useState } from 'react'
import { fmt, type Mat, type MatGet, type Zone } from './materialLayout'
import { useCanvas } from '../store/canvas'
import { useGenerator, type GenState } from '../store/generator'
import { IcPlus, IcSwap } from '../ui/icons'
import MediaPreview from './MediaPreview'
import Overlay from './Overlay'
function MaterialTile({ mat, role, size, onPick, onRemove }: { mat: Mat | null; role: string; size: 'frame' | 'source' | 'reference'; onPick: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [hover, setHover] = useState(false); const [menu, setMenu] = useState(false); const [preview, setPreview] = useState(false)
  const lit = useCanvas((s) => s.hoverMat === mat?.id)
  const enter = () => { clearTimeout(closeTimer.current); if (mat) useCanvas.getState().setHoverMat(mat.id); clearTimeout(openTimer.current); openTimer.current = setTimeout(() => setHover(true), 300) }
  const leave = () => { clearTimeout(openTimer.current); closeTimer.current = setTimeout(() => { setHover(false); if (useCanvas.getState().hoverMat === mat?.id) useCanvas.getState().setHoverMat(null) }, 180) }
  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); if (useCanvas.getState().hoverMat === mat?.id) useCanvas.getState().setHoverMat(null) }, [mat?.id])
  const showPreview = () => { ref.current?.focus({ preventScroll: true }); clearTimeout(openTimer.current); clearTimeout(closeTimer.current); setHover(false); setMenu(false); setPreview(true) }
  const info = mat ? `${role} · ${mat.name}${mat.kind === 'video' ? ' · ' + (mat.dur != null ? fmt(mat.dur) : '读取时长中') : ''}` : `添加${role}`
  return <div className={`material-wrap ${size}`} onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}>
    <button ref={ref} className={`material-tile ${mat ? 'filled' : 'empty'}${lit ? ' lit' : ''}`} aria-label={info} title={mat ? undefined : info}
      onClick={mat ? showPreview : onPick}>
      {mat?.thumb && <img src={mat.thumb} alt="" />}
      {!mat && <IcPlus size={17} />}
      {mat?.kind === 'video' && <><span className="material-play">▶</span><span className="material-duration">{mat.dur != null ? fmt(mat.dur) : '…'}</span></>}
      {size === 'frame' && <span className={`frame-mark ${role === '首帧' ? 'first' : 'last'}`}>{role === '首帧' ? '⊢' : '⊣'}</span>}
    </button>
    {mat && <button className="material-more" aria-label={`${mat.name} 更多操作`} onClick={() => { setHover(false); setMenu(true) }}>⋯</button>}
    {mat && hover && !menu && !preview && <Overlay passive label={info} anchor={ref} className="material-tooltip" onClose={() => setHover(false)} onMouseEnter={() => { clearTimeout(closeTimer.current); useCanvas.getState().setHoverMat(mat.id) }} onMouseLeave={leave}>
      <span>{info}</span><button onClick={showPreview}>预览 ↗</button>
    </Overlay>}
    {mat && menu && <Overlay label={`${mat.name} 更多操作`} anchor={ref} className="material-actions" onClose={() => setMenu(false)}>
      <button onClick={showPreview}>预览</button><button onClick={() => { setMenu(false); onPick() }}>替换{role}</button>
      <button onClick={() => { setMenu(false); onRemove() }}>移除{role}</button>
    </Overlay>}
    {mat && preview && <MediaPreview mat={mat} onClose={() => setPreview(false)} />}
  </div>
}
export default function MaterialRow({ nodeId, gen, get, onPickMaterial }: { nodeId: string; gen: GenState; get: MatGet; onPickMaterial: (zone: Zone, replaceId?: string) => void }) {
  if (gen.mode === 'text') return null
  const tile = (id: string | null, zone: Zone, role: string, size: 'frame' | 'source' | 'reference') => <MaterialTile key={zone === 'tray' ? id : zone} mat={id ? get(id) : null} role={role} size={size}
    onPick={() => onPickMaterial(zone, id ?? undefined)} onRemove={() => id && useGenerator.getState().removeMaterial(nodeId, id, get)} />
  return <div className="material-row nodrag nowheel">
    {gen.mode === 'frames' ? <div className="frame-pair">
      {tile(gen.slotFirst, 'first', '首帧', 'frame')}
      <button className="frame-swap" aria-label="交换首尾帧" title="交换首尾帧" disabled={!gen.slotFirst || !gen.slotLast} onClick={() => useGenerator.getState().swapFrames(nodeId)}><IcSwap size={15} /></button>
      {tile(gen.slotLast, 'last', '尾帧', 'frame')}
    </div> : <>
      {(gen.mode === 'edit' || gen.mode === 'extend') && <div className="source-material">{tile(gen.slotEdit, 'edit', gen.mode === 'edit' ? '待编辑视频' : '待延长视频', 'source')}<span>源视频</span></div>}
      <div className="reference-materials">{gen.tray.map((id) => tile(id, 'tray', '参考素材', 'reference'))}
        <button className="material-add" title="添加参考素材" aria-label="添加参考素材" onClick={() => onPickMaterial('tray')}><IcPlus size={15} />{!gen.tray.length && <span>参考素材</span>}</button>
      </div>
    </>}
  </div>
}
