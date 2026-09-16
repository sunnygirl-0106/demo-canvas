import type { ReactNode } from 'react'
import { IcSparkle, IcSend } from '../ui/icons'
import { useTip } from './useTip'
interface Props { left: ReactNode; cost?: number; busy?: boolean; disabled?: boolean; reason?: string; onSend: () => void }
export default function BottomBar({ left, cost, busy, disabled, reason, onSend }: Props) {
  const label = busy ? '正在生成' : reason || '生成演示任务'
  const off = !!busy || !!disabled
  /**
   * 生成按钮用 aria-disabled 而不是 disabled：真 disabled 的按钮不发鼠标事件，
   * 挂在上面的说明谁也看不到 —— 而「为什么点不了」正是这里唯一要说的话。
   */
  const { tip, node: tipNode } = useTip()
  return <div className="gp-bot nodrag"><div className="gp-botL">{left}</div><div className="gp-botR">
    {cost != null && <span className="gp-cost" title="演示估算，不实际扣费">
      <IcSparkle size={18} color="var(--ink)" /><span>星钻</span><b>{cost}</b></span>}
    <button className={`gp-send${busy ? ' busy' : ''}`} aria-disabled={off} {...tip(off ? label : undefined)}
      onClick={() => { if (!off) onSend() }} aria-label={label}>
      {busy ? <span className="spin" /> : <span className="gp-send-ic"><IcSend size={27} sw={1.4} /></span>}
    </button>{tipNode}</div></div>
}
