import { useGenerator, type GenState } from '../store/generator'
import { supportsRange, rangeBlockedReason, type MatGet } from './materialLayout'
import { modelBlockedReason } from './videoTask'
import { IcLasso } from '../ui/icons'
import { useTip } from './useTip'
/**
 * 提示词工具行最左侧的标记入口。中性描边胶囊，悬浮才亮出青色描边 ——
 * 这一屏的青色只留给「生成」和这个入口的悬浮 / 进行态，工具行里不该常驻第二个彩色焦点。
 * 按钮只写「标记修改」，不带计数：标了几处由句子里的标签自己说，
 * 弹窗开着时文案换成「正在标记」—— 按钮本身就是状态灯，关掉即恢复。
 */
export default function MarkEntry({ nodeId, gen, get, open, onOpen }: { nodeId: string; gen: GenState; get: MatGet; open?: boolean; onOpen: () => void }) {
  const { tip, node: tipNode } = useTip()
  const ok = supportsRange(gen.model)
  const why = rangeBlockedReason(gen.model)
  const label = open ? '正在标记' : '标记修改'
  // 2.5 自己也接不住这个源时就别给这个出口了，点了只会把用户弹出当前模式
  const toDeluxe = !ok && !modelBlockedReason(gen, 'sd2.5', get)
  return <>
    <button className={`mark-entry${open ? ' on' : ''}`} aria-disabled={!ok} aria-pressed={open || undefined}
      aria-label={why ? `${label}：${why}` : label}
      {...tip(why || undefined)} onClick={() => { if (ok) onOpen() }}><IcLasso size={14} />{label}</button>
    {/* 做不成的原因挂在生成按钮上，解法挂在惹出这件事的控件旁边 —— 说明气泡里点不了东西 */}
    {toDeluxe && <button className="scope-fix" onClick={() => useGenerator.getState().setModel(nodeId, 'sd2.5', get)}>切到 Seedance 2.5 启用</button>}
    {!ok && !!gen.marks.length && <button className="scope-fix" onClick={() => useGenerator.getState().patch(nodeId, { marks: [] })}>移除标记，改整条</button>}
    {tipNode}
  </>
}
