import type { Mat, MatGet, Mode } from './materialLayout'
import { useAspect } from './hoverShot'
import { RangeChip, RegionChip } from './MarkChips'
import SourceChip from './SourceChip'
import { segText, type Seg } from './promptDoc'
/**
 * 句子里的一枚标签。哪一枚由文档说了算 —— 这里只管把它画出来：
 * 素材、延长参数、时间段、一处标记，各是一枚，谁被删了就不会走到这里。
 */
export default function PromptSeg({ s, doc, mat, get, role, mode, direction, duration }: {
  s: Seg; doc: Seg[]; mat: Mat | null; get: MatGet; role: string; mode: Mode
  direction: 'before' | 'after' | null; duration: number
}) {
  // 一段素材量一次比例就够：缩略图按它的真实比例裁，横竖屏各裁自己溢出的那一边
  const ratio = useAspect(mat?.thumb)
  if (s.t === 'text') return null
  /**
   * 一枚标签只在读它的那个 Tab 里才是结构化的：方向和秒数只有延长在读，时间段和标记只有编辑在读。
   * 换到别的 Tab，它们就只是这句话里的几个字 —— 摆着一枚亮着的标签，等于说这次任务还带着它。
   * 换的只是样子：句子里那一枚还在原处，切回去它又是一枚标签。
   */
  if ((s.t === 'dur' && mode !== 'extend') || ((s.t === 'range' || s.t === 'mark') && mode !== 'edit'))
    return <span className="prompt-flat">{segText(s, { name: mat?.name, direction, duration })}</span>
  // 方向还没选时不替用户说「向后」，和 segText 里那句念法保持一致
  if (s.t === 'dur') return <span className="reference-chip static">{direction === 'before' ? '向前延长' : direction === 'after' ? '向后延长' : '延长'} {duration}s</span>
  // @ 引来的那一段：和句首那枚源素材是同一枚标签，只是指着别的素材。
  // 素材从画布上被拿走了，这一枚就不画了 —— 提交时也对不上，videoTask 那边会拦
  if (s.t === 'ref') { const m = get(s.id); return m ? <SourceChip mat={m} role="引用素材" label={s.name} /> : null }
  if (!mat) return null
  if (s.t === 'mat') return <SourceChip mat={mat} role={role} />
  if (s.t === 'range') return <RangeChip range={s.range} n={doc.filter((x) => x.t === 'mark' && x.g === s.g).length} />
  return <RegionChip mat={mat} ratio={ratio} r={s.region} />
}
