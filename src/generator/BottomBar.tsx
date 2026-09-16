import type { ReactNode } from 'react'
import { IcCredit, IcSend } from '../ui/icons'
import { useTip } from './useTip'
interface Props { left: ReactNode; cost?: number; busy?: boolean; disabled?: boolean; reason?: string; onSend: () => void }
export default function BottomBar({ left, cost, busy, disabled, reason, onSend }: Props) {
  const label = busy ? '处理中' : reason || '生成演示任务'
  const off = !!busy || !!disabled
  /**
   * 生成按钮用 aria-disabled 而不是 disabled：真 disabled 的按钮不发鼠标事件，
   * 挂在上面的说明谁也看不到 —— 而「为什么点不了」正是这里唯一要说的话。
   */
  const { tip, node: tipNode } = useTip()
  return <div className="gp-bot nodrag"><div className="gp-botL">{left}</div><div className="gp-botR">
    {cost != null && <span className="gp-cost" title="演示估算，不实际扣费"><IcCredit size={14} color="var(--teal)" /><b>{cost}</b>积分 / 次</span>}
    <button className={`gp-send${busy ? ' busy' : ''}`} aria-disabled={off} {...tip(off ? label : undefined)}
      onClick={() => { if (!off) onSend() }} aria-label={label}>
      {busy ? <span className="spin" /> : <span className="gp-send-ic"><IcSend size={19} sw={1.9} /></span>}
    </button>{tipNode}</div></div>
}
