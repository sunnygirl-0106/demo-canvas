import { useEffect, useRef, useState } from 'react'
import { IcBack, IcBell, IcGem, IcShare, IcUser } from '../ui/icons'
import { VERSIONS, WIRED } from '../demo/scenes'

/**
 * 顶栏右侧两个走查入口。「节点示例」是一屏素材，「连线示例」是一张菜单 ——
 * 每一项都是规则表上的一格，点进去即到达那一格，要点落在画布左上角那张小卡里。
 *
 * 菜单分两组：**素材连接与模式**（连几根线就能表达的那些规则）和
 * **版本与上下游**（一屏已经发生过的历史，画布上连线表达不出来）。
 * 每项只写一行摘要 —— 一条条「应看到」写在菜单里，这张单子就长到要滚两屏。
 */
export default function TopBar({ onShowcase, onWired, onWorkflow }: {
  onShowcase: () => void; onWired: (key: string) => void; onWorkflow: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // 点到别处就收起来：菜单不该赖在画布上挡着连线
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const pick = (run: () => void) => { setOpen(false); run() }
  const item = (key: string, title: string, summary: string) => (
    <button key={key} role="menuitem" onClick={() => pick(() => onWired(key))}>
      <b>{title}</b>
      <i>{summary}</i>
      <code>?scene={key}</code>
    </button>
  )
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
        <button className="tb-demo" onClick={onShowcase} title="重置并查看节点示例">节点示例</button>
        <div className="tb-wrap" ref={box}>
          <button className="tb-demo" aria-expanded={open} onClick={() => setOpen((v) => !v)}>连线示例</button>
          {open && (
            <div className="tb-menu" role="menu">
              <p className="tb-group">素材连接与模式</p>
              {Object.entries(WIRED).map(([key, spec]) => item(key, spec.title, spec.expect))}
              <p className="tb-group">版本与上下游</p>
              {Object.entries(VERSIONS).map(([key, spec]) => item(key, spec.title, spec.summary))}
              <button role="menuitem" className="tb-menu-last" onClick={() => pick(onWorkflow)}>
                <b>已连接素材的工作流</b>
                <i>复刻截图 8：图片 a / b、视频 b、示例视频 → 视频 a</i>
                <code>?scene=1</code>
              </button>
            </div>
          )}
        </div>
        <span className="pay">充值中心</span>
        {/* 顶栏是星钻余额，和底栏单次价格用同一枚图标：同一种货币不该有两个样子 */}
        <span className="tb-coin"><IcGem size={14} />100,000</span>
        <span className="tb-bell"><IcBell size={17} /><b>1</b></span>
        <span className="tb-avatar" />
      </div>
    </div>
  )
}
