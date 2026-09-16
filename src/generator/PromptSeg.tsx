import type { Mat, MatGet } from './materialLayout'
import { useAspect } from './hoverShot'
import { RangeChip, RegionChip } from './MarkChips'
import SourceChip from './SourceChip'
import type { Seg } from './promptDoc'
/**
 * 句子里的一枚标签。哪一枚由文档说了算 —— 这里只管把它画出来：
 * 素材、延长参数、时间段、一处标记，各是一枚，谁被删了就不会走到这里。
 */
export default function PromptSeg({ s, doc, mat, get, role, direction, duration }: {
  s: Seg; doc: Seg[]; mat: Mat | null; get: MatGet; role: string
  direction: 'before' | 'after' | null; duration: number
}) {
  // 一段素材量一次比例就够：缩略图按它的真实比例裁，横竖屏各裁自己溢出的那一边
  const ratio = useAspect(mat?.thumb)
  if (s.t === 'text') return null
  if (s.t === 'dur') return <span className="reference-chip static">{direction === 'before' ? '向前延长' : '向后延长'} {duration}s</span>
  // @ 引来的那一段：和句首那枚源素材是同一枚标签，只是指着别的素材。
  // 素材从画布上被拿走了，这一枚就不画了 —— 提交时也对不上，videoTask 那边会拦
  if (s.t === 'ref') { const m = get(s.id); return m ? <SourceChip mat={m} role="引用素材" label={s.name} /> : null }
  if (!mat) return null
  if (s.t === 'mat') return <SourceChip mat={mat} role={role} />
  if (s.t === 'range') return <RangeChip range={s.range} n={doc.filter((x) => x.t === 'mark' && x.g === s.g).length} />
  return <RegionChip mat={mat} ratio={ratio} r={s.region} />
}
