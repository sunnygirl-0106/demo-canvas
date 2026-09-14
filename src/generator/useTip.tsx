import { useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import Overlay from './Overlay'
/**
 * 置灰控件的统一说明气泡：悬浮或聚焦就说清楚为什么点不了，不让用户自己猜。
 *
 * 配套的规矩是「置灰一律用 aria-disabled，不用 disabled」：
 * disabled 的按钮不发鼠标事件、也拿不到焦点，挂上去的说明谁也看不到。
 * 点击由调用方自己挡（reason 非空就 return），键盘用户则靠 focus 看到同一句话。
 */
export function useTip() {
  const at = useRef<HTMLElement | null>(null)
  const [text, setText] = useState('')
  const close = () => setText('')
  const open = (t: string | undefined, el: HTMLElement) => { if (t) { at.current = el; setText(t) } }
  const tip = (t?: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => open(t, e.currentTarget),
    onMouseLeave: close,
    onFocus: (e: FocusEvent<HTMLElement>) => open(t, e.currentTarget),
    onBlur: close,
  })
  const node = text
    ? <Overlay passive tail label={text} anchor={at} className="tab-tip" onClose={close}>{text}</Overlay>
    : null
  return { tip, node }
}
