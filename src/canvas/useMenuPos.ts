import { useLayoutEffect, useState, type RefObject } from 'react'

/** 菜单贴着鼠标弹出，但不许跑出可视区 */
export function useMenuPos(ref: RefObject<HTMLElement | null>, x: number, y: number) {
  const [p, setP] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    setP({ left, top })
  }, [ref, x, y])
  return p
}
