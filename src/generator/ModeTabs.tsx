import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Mode, TabState } from './materialLayout'
import { useTip } from './useTip'

interface Props {
  mode: Mode
  /** 由画布上连了什么算出来，模型不参与。灰掉的 Tab 仍然占位，悬浮说明为什么。 */
  tabs: TabState[]
  onPick: (m: Mode) => void
  /** Tab 行右端的插槽，目前放编辑 / 延长的退出键 */
  right?: React.ReactNode
}
/** 落位后的滑点直径，与移动中被拉成的短棒长度。 */
const DOT = 5, BAR = 22
/** 拉伸持续到指示条快走完为止，回弹的那一下才看得见。 */
const STRETCH = 190

export default function ModeTabs({ mode, tabs, onPick, right }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  /** 量的是选中项本身，指示条落在它的中线上 —— 宽度由「在不在路上」决定，与 Tab 多宽无关。 */
  const [on, setOn] = useState({ x: 0, w: 0 })
  const [moving, setMoving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  /** 灰掉的原因、以及「这个模式有哪些素材不参与」都不弹横幅，悬浮（或键盘聚焦）到那个 Tab 上才说。 */
  const { tip, node: tipNode } = useTip()

  /** 指示条跟随选中项。选中态字重变化会改变宽度，下一帧再量一次。 */
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>('.gp-tab.on')
      if (el) setOn((prev) => prev.x === el.offsetLeft && prev.w === el.offsetWidth ? prev : { x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [mode, tabs])
  useEffect(() => () => clearTimeout(timer.current), [])

  /** 换一个 Tab：滑点先被拉成短棒，到站再收回成点 —— 这一下让「它从哪来」看得见。 */
  const pick = (t: TabState) => {
    if (!t.enabled || t.k === mode) return
    setMoving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoving(false), STRETCH)
    onPick(t.k)
  }

  const tipOf = (t: TabState) => t.reason || t.note
  const w = moving ? BAR : DOT

  return (
    <div className="gp-tabrow">
      <div className="gp-tabs" ref={wrap} role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={mode === t.k} aria-disabled={!t.enabled}
                  aria-label={tipOf(t) ? `${t.label}：${tipOf(t)}` : t.label}
                  className={'gp-tab' + (mode === t.k ? ' on' : '') + (t.enabled ? '' : ' off')}
                  {...tip(tipOf(t))}
                  onClick={() => pick(t)}>
            {/* 做不了的事画一个禁行圈，比删除线更像「现在没这条路」，也不假装文字被划掉了 */}
            {!t.enabled && <span className="gp-tab-no" aria-hidden>⊘</span>}
            {t.label}
          </button>
        ))}
        <span className="gp-ind" aria-hidden
              style={{ transform: `translateX(${Math.round(on.x + on.w / 2 - w / 2)}px)`, width: w, opacity: on.w ? 1 : 0 }} />
      </div>
      {right}
      {tipNode}
    </div>
  )
}
