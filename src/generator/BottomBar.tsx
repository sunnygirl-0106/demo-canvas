import type { ReactNode } from 'react'
import { IcCredit, IcSend } from '../ui/icons'
interface Props { left: ReactNode; cost?: number; busy?: boolean; disabled?: boolean; reason?: string; onSend: () => void }
export default function BottomBar({ left, cost, busy, disabled, reason, onSend }: Props) {
  const label = busy ? '处理中' : reason || '生成演示任务'
  return <div className="gp-bot nodrag"><div className="gp-botL">{left}</div><div className="gp-botR">
    {cost != null && <span className="gp-cost" title="演示估算，不实际扣费"><IcCredit size={14} color="var(--teal)" /><b>{cost}</b>积分 / 次</span>}
    <button className={`gp-send${busy ? ' busy' : ''}`} disabled={busy || disabled} onClick={onSend} title={label} aria-label={label}>
      {busy ? <span className="spin" /> : <span className="gp-send-ic"><IcSend size={19} sw={1.9} /></span>}
    </button></div></div>
}
