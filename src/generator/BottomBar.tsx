import type { ReactNode } from 'react'
interface Props { left: ReactNode; cost?: number; busy?: boolean; disabled?: boolean; reason?: string; onSend: () => void }
export default function BottomBar({ left, cost, busy, disabled, reason, onSend }: Props) {
  return <div className="gp-bot nodrag"><div className="gp-botL">{left}</div><div className="gp-botR">
    {cost != null && <span className="gp-cost">演示估算 {cost} 点</span>}
    <button className={`gp-send${busy ? ' busy' : ''}`} disabled={busy || disabled} onClick={onSend} title={reason || '生成演示任务'}>
      {busy && <span className="spin" />}{busy ? '处理中' : '生成'}
    </button></div></div>
}
