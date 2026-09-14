import { useLayoutEffect, useRef, useState } from 'react'
import type { Mode, TabState } from './materialLayout'
import Overlay from './Overlay'

interface Props {
  mode: Mode
  /** 由画布上连了什么算出来，模型不参与。灰掉的 Tab 仍然占位，悬浮说明为什么。 */
  tabs: TabState[]
  onPick: (m: Mode) => void
  /** Tab 行右端的插槽，目前放编辑 / 延长的退出键 */
  right?: React.ReactNode
}

export default function ModeTabs({ mode, tabs, onPick, right }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ x: 0, w: 0 })
  /** 灰掉的原因不弹横幅，鼠标悬浮（或键盘聚焦）到那个 Tab 上才说。 */
  const [tip, setTip] = useState<TabState | null>(null)
  const tipAt = useRef<HTMLElement | null>(null)

  /** 指示条跟随选中项。选中态字重变化会改变宽度，下一帧再量一次。 */
  useLayoutEffect(() => {
    const measure = () => {
      const on = wrap.current?.querySelector<HTMLElement>('.gp-tab.on')
      if (on) setInd((prev) => prev.x === on.offsetLeft && prev.w === on.offsetWidth ? prev : { x: on.offsetLeft, w: on.offsetWidth })
    }
    measure()
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [mode, tabs])

  const openTip = (t: TabState, el: HTMLElement) => { if (!t.reason) return; tipAt.current = el; setTip(t) }
  const closeTip = (t: TabState) => setTip((cur) => cur?.k === t.k ? null : cur)

  return (
    <div className="gp-tabrow">
      <div className="gp-tabs" ref={wrap} role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={mode === t.k} aria-disabled={!t.enabled}
                  aria-label={t.reason ? `${t.label}：${t.reason}` : t.label}
                  className={'gp-tab' + (mode === t.k ? ' on' : '') + (t.enabled ? '' : ' off')}
                  onMouseEnter={(e) => openTip(t, e.currentTarget)} onMouseLeave={() => closeTip(t)}
                  onFocus={(e) => openTip(t, e.currentTarget)} onBlur={() => closeTip(t)}
                  onClick={() => t.enabled && onPick(t.k)}>{t.label}</button>
        ))}
        <span className="gp-ind" aria-hidden style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}><i /></span>
      </div>
      {right}
      {tip && <Overlay passive tail label={tip.reason} anchor={tipAt} className="tab-tip" onClose={() => setTip(null)}>
        {tip.reason}
      </Overlay>}
    </div>
  )
}
