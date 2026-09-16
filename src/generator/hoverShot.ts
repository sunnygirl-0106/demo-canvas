import { useEffect, useRef, useState } from 'react'
/** 悬浮卡里那块画面的最大铺开尺寸：横屏顶到宽、竖屏顶到高，两者面积相当。 */
const SHOT_MAX_W = 248, SHOT_MAX_H = 250
/**
 * 悬浮 300ms 才展开、离开 180ms 才收：句子里的标签挨得近，
 * 手划过去不该一路炸开一串卡片。素材方块和句子里的标签共用这一套节奏。
 */
export function useHover() {
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [on, setOn] = useState(false)
  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current) }, [])
  return {
    on,
    close: () => setOn(false),
    bind: {
      onMouseEnter: () => { clearTimeout(closeTimer.current); clearTimeout(openTimer.current); openTimer.current = setTimeout(() => setOn(true), 300) },
      onMouseLeave: () => { clearTimeout(openTimer.current); closeTimer.current = setTimeout(() => setOn(false), 180) },
      onFocus: () => setOn(true),
      onBlur: () => setOn(false),
    },
  }
}
/**
 * 素材的真实宽高比。方块是静止态的统一规格，展开时得按素材本来的样子铺开 ——
 * 横屏展成横屏、竖屏展成竖屏，不拉伸也不裁切，所以比例只能从图自己身上量。
 */
export function useAspect(src?: string) {
  const [ratio, setRatio] = useState<number | null>(null)
  useEffect(() => {
    setRatio(null)
    if (!src) return
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive && img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight) }
    img.src = src
    return () => { alive = false }
  }, [src])
  return ratio
}
/** 按真实比例算出展开后的画面尺寸，横竖屏各自顶住自己那一边。 */
export function shotBox(ratio: number | null) {
  const ar = ratio || 16 / 9
  const w = Math.min(SHOT_MAX_W, SHOT_MAX_H * ar)
  return { width: Math.round(w), height: Math.round(w / ar) }
}
