import { useRef, type CSSProperties, type ReactNode } from 'react'
import type { Mat } from './materialLayout'
import { useFrame } from './markFrame'
import { shotBox, useHover } from './hoverShot'
import Overlay from './Overlay'
import MarkArt from './MarkArt'
import { rangeLabel, regionDetail, timecode, type MarkRegion, type TimeRange } from './marks'
import { IcVideo } from '../ui/icons'
/**
 * 正方形小图块里的裁切位置：把圈出来的那一块摆到正中。
 * 居中裁会把贴边的标记整个裁没 —— 而小图块存在的唯一理由就是让人看见标的是哪儿。
 * 横屏的整幅画面比方块宽，往左右挪；竖屏比方块高，往上下挪，两种各管一个方向。
 */
function crop(regions: MarkRegion[], ar: number): CSSProperties {
  const r = regions[0]
  const at = (v: number, size: number) => `${Math.max(100 - size, Math.min(0, 50 - v * size)).toFixed(2)}%`
  if (ar >= 1) return { '--fx': at(r ? r.rect[0] + r.rect[2] / 2 : 0.5, ar * 100), '--fy': '0%' } as CSSProperties
  return { '--fx': '0%', '--fy': at(r ? r.rect[1] + r.rect[3] / 2 : 0.5, 100 / ar) } as CSSProperties
}
/**
 * 一帧画面 + 画在它上面的标记。句子里的标签用填满的正方形小图块（按真实比例裁，只裁溢出的那一边），
 * 悬浮放大则按素材本来的样子铺开：横屏展成横屏，竖屏展成竖屏 —— 两处共用这一份标记渲染。
 * 比例从素材自己身上量，16:9 只是量不到时的兜底。
 */
function Shot({ mat, t, regions, ratio }: { mat: Mat; t: number; regions: MarkRegion[]; ratio: number | null }) {
  const ar = ratio || 16 / 9
  return <span className="mark-shot" style={{ '--ar': ar } as CSSProperties}>
    <span className="mark-shot-in" style={crop(regions, ar)}>
      <img src={useFrame(mat.src, t, mat.thumb)} alt="" />
      <MarkArt regions={regions} />
    </span>
  </span>
}
/**
 * 句子里的标签本体：一块正方形缩略图 + 它的时间，没有别的东西 ——
 * 是框还是笔，缩略图上就画着；也不挂删除叉：这一句就是普通文字，
 * 光标停在最前面按退格就从句尾一枚一枚往回删，和删字一样，不必再摆一排小按钮。
 * 悬浮只是把同一帧放大看清楚 —— 放大出来的就是那一帧，除了左上角那个时间，别的一个字都不加。
 * 没有画面可放大的那一枚（时间段）就不给悬浮层：标签上已经写着起止时间和细轨，
 * 再弹一张图出来只是挡住句子，并没有多说一个字。
 * 整枚当一个图形符号读给读屏：aria-label 已经说全了，不必再让它进 Tab 序。
 */
function Chip({ cls, body, aria, pop }: {
  cls?: string; body: ReactNode; aria: string; pop?: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const hover = useHover()
  return <span ref={ref} className={`mark-chip${cls ? ` ${cls}` : ''}`} {...(pop ? hover.bind : {})}>
    <span className="mark-chip-body" role="img" aria-label={aria}>{body}</span>
    {pop && hover.on && <Overlay passive center label={aria} anchor={ref} className="mark-pop shot-pop" onClose={hover.close}>{pop}</Overlay>}
  </span>
}
/**
 * 一处标记：缩略图上只画它自己，同一秒圈了两块也分得开。
 * 不会有「不在时间段内」这一路 —— 选了片段，圈选就只发生在片段里（弹窗那边从源头上管住了）。
 */
export function RegionChip({ mat, ratio, r }: { mat: Mat; ratio: number | null; r: MarkRegion }) {
  const shot = <Shot mat={mat} t={r.t} regions={[r]} ratio={ratio} />
  return <Chip body={<>{shot}<b>{timecode(r.t)}</b></>} aria={regionDetail(r)}
    pop={<span className="mark-pop-shot" style={shotBox(ratio)}>{shot}<em>{timecode(r.t)}</em></span>} />
}
/**
 * 一段时间：独立的一枚，管着后面那几处。
 * 这一枚不放缩略图，也不给悬浮预览 —— 一段时间没有「那一帧」可给。
 * 一个片段图标 + 起止时间，一行读完；「是这段视频里的一截」由图标说，不再另写「时间段」三个字。
 * 读屏看不见图标，所以 aria 里把「时间段」补回去。
 */
export function RangeChip({ range, n }: { range: TimeRange; n: number }) {
  return <Chip cls="range" aria={`${rangeLabel(range)} 时间段${n ? `，里面有 ${n} 处标记` : ''}`}
    body={<><IcVideo size={16} /><b>{timecode(range.start)}<i>–</i>{timecode(range.end)}</b></>} />
}
