import type { PointerEvent } from 'react'
import { BRUSH_WIDTH, timecode, type MarkRegion } from './marks'
/** 画面一律 16:9，viewBox 用 160×90 而不是 0..1：等比缩放，笔迹的圆头才不会被压扁。 */
const VW = 160, VH = 90
const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
export type Handle = typeof HANDLES[number]
interface Props {
  regions: MarkRegion[]
  /** 当前停在哪一秒：这一秒的标记满亮，别的秒淡下去。不传就全部满亮（缩略图用） */
  at?: number
  /** 正在编辑的那一处，描边更亮 */
  active?: number
  /** 只读的地方（chip、悬浮卡、清单）不挂交互，也不画标号和手柄 */
  onBoxDown?: (e: PointerEvent<HTMLElement>, i: number, handle: Handle | null) => void
}
/**
 * 标记的唯一渲染处：框是绝对定位的 DOM（要拖要缩要聚焦，比 canvas 命中测试省太多），
 * 笔迹是同一层里的 SVG。坐标全归一化，所以 22px 的 chip 和满屏的画面共用这一份 markup。
 */
export default function MarkArt({ regions, at, active, onBoxDown }: Props) {
  const lit = (r: MarkRegion) => at == null || Math.abs(r.t - at) < 0.5
  const strokes = regions.filter((r) => r.tool === 'brush' && r.strokes?.length)
  return <div className="mark-art" aria-hidden={!onBoxDown || undefined}>
    {!!strokes.length && <svg className="mark-ink" viewBox={`0 0 ${VW} ${VH}`}>
      {strokes.map((r, i) => <g key={i} opacity={lit(r) ? 1 : 0.34}>
        {r.strokes!.map((st, j) => {
          const pts = st.map(([x, y]) => `${(x * VW).toFixed(2)},${(y * VH).toFixed(2)}`).join(' ')
          // 一笔画两遍：底下一条半透明粗线交代涂抹范围，上面一条细线交代笔迹本身
          return <g key={j}>
            <polyline className="ink-wide" points={pts} strokeWidth={(r.width ?? BRUSH_WIDTH) * VW} />
            <polyline className="ink-line" points={pts} />
          </g>
        })}
      </g>)}
    </svg>}
    {regions.map((r, i) => r.tool === 'brush' ? null : <div key={i} className={`mark-box${active === i ? ' on' : ''}`}
      style={{ left: `${r.rect[0] * 100}%`, top: `${r.rect[1] * 100}%`, width: `${r.rect[2] * 100}%`, height: `${r.rect[3] * 100}%`, opacity: lit(r) ? 1 : 0.34 }}
      onPointerDown={onBoxDown && ((e) => onBoxDown(e, i, null))}>
      {onBoxDown && <>
        {/* 贴着画面顶边的框，标号翻到框里面去，否则会被画面边缘切掉 */}
        <span className={`mark-box-label${r.rect[1] < 0.1 ? ' inside' : ''}`}>{regions.length > 1 ? `区域 ${i + 1} · ` : ''}{timecode(r.t)}</span>
        {HANDLES.map((h) => <i key={h} className={`mark-grip ${h}`} onPointerDown={(e) => onBoxDown(e, i, h)} />)}
      </>}
    </div>)}
  </div>
}
