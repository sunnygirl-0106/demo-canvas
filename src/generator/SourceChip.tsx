import { useRef, useState } from 'react'
import type { Mat } from './materialLayout'
import { fmt } from './materialLayout'
import { shotBox, useAspect, useHover } from './hoverShot'
import { useCanvas } from '../store/canvas'
import { IcExpand, IcPlay } from '../ui/icons'
import MediaPreview from './MediaPreview'
import Overlay from './Overlay'
/**
 * 句子里指着一段素材的那枚标签：一块正方形缩略图 + 两个字。
 * 认这一段用的是图不是名字 —— 素材名是一串随机 id，读不出任何东西，
 * 而缩略图一眼就知道是哪一段；名字与时长留给悬浮卡和读屏。
 * 静止态一律正方形，悬浮才按真实比例铺开，和素材方块同一套规矩。
 *
 * 句首的源素材写「视频 / 图片」，@ 引用写它的名字（label）—— 两处是同一枚标签，
 * 图片和视频也是同一枚：都得先看见画面，再看名字。
 * 悬浮同时点亮画布上那条连线，和素材方块一个规矩。
 */
export default function SourceChip({ mat, role, label }: { mat: Mat; role: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const hover = useHover()
  const [preview, setPreview] = useState(false)
  const ratio = useAspect(mat.thumb)
  const lit = useCanvas((s) => s.hoverMat === mat.id)
  const dur = mat.kind === 'video' && mat.dur != null ? fmt(mat.dur) : ''
  const info = `${role} · ${mat.name}${dur ? ` · ${dur}` : ''}`
  const link = (on: boolean) => useCanvas.getState().setHoverMat(on ? mat.id : null)
  return <>
    <button ref={ref} className={`source-chip${lit ? ' lit' : ''}`} aria-label={info} {...hover.bind}
      onMouseEnter={(e) => { hover.bind.onMouseEnter(); link(true); void e }}
      onMouseLeave={() => { hover.bind.onMouseLeave(); link(false) }}
      onFocus={() => { hover.bind.onFocus(); link(true) }}
      onBlur={() => { hover.bind.onBlur(); link(false) }}
      onClick={() => { hover.close(); link(false); setPreview(true) }}>
      <span className="source-chip-shot">
        {mat.thumb && <img src={mat.thumb} alt="" />}
        {mat.kind === 'video' && <i className="source-chip-play" aria-hidden><IcPlay size={7} /></i>}
      </span>
      <span>{label ?? (mat.kind === 'video' ? '视频' : '图片')}</span>
    </button>
    {hover.on && !preview && <Overlay passive center label={info} anchor={ref} className="shot-pop" onClose={hover.close}>
      <span className="material-card-shot" style={shotBox(ratio)}>
        {mat.thumb && <img src={mat.thumb} alt="" />}
        <span className="material-card-cue">{mat.kind === 'video' ? <IcPlay size={16} /> : <IcExpand size={15} sw={2} />}</span>
        <span className="material-card-meta"><strong>{mat.name}</strong>{dur && <span>{dur}</span>}</span>
      </span>
    </Overlay>}
    {preview && <MediaPreview mat={mat} onClose={() => setPreview(false)} />}
  </>
}
