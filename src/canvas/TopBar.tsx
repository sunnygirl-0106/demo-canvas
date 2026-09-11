import { IcBack, IcBell, IcShare, IcStar, IcUser } from '../ui/icons'

export default function TopBar({ onShowcase, onDemo }: { onShowcase: () => void; onDemo: () => void }) {
  return (
    <div className="topbar">
      <button className="tb-btn"><IcBack size={17} /></button>
      <span className="tb-title">工作流jq</span>
      <span className="tb-num">11</span>
      <button className="tb-btn"><IcShare size={14} /></button>
      <span className="tb-dot" />
      <span className="tb-people"><IcUser size={12} />1 人</span>
      <span className="tb-sync"><i />已同步</span>
      <div className="tb-right">
        <button className="tb-demo" onClick={onShowcase} title="重置并查看所有节点状态">节点示例</button>
        <button className="tb-demo" onClick={onDemo}>连线示例</button>
        <span className="pay">充值中心</span>
        <span className="tb-coin"><IcStar size={13} color="#2fd0d0" />100,000</span>
        <span className="tb-bell"><IcBell size={17} /><b>1</b></span>
        <span className="tb-avatar" />
      </div>
    </div>
  )
}
