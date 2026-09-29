import type { Mat } from '../generator/materialLayout'
import type { CNode } from '../store/canvas'

/** 素材缩略图的渐变兜底色（离线时 picsum 拉不到就靠它） */
export const GRADS = [
  'linear-gradient(135deg,#3b6fb0,#9fd0f0)',
  'linear-gradient(135deg,#b06a3b,#f0c99f)',
  'linear-gradient(135deg,#5a4a3a,#a08870)',
  'linear-gradient(135deg,#5a3b7a,#c69fe0)',
  'linear-gradient(135deg,#1f4f52,#6fb3b0)',
  'linear-gradient(135deg,#3b5a3a,#9fd0a8)',
]

export const gradOf = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return GRADS[h % GRADS.length]
}

export const photo = (seed: string) => `https://picsum.photos/seed/${seed}/640/360`

const mediaUrl = (path: string) => `${import.meta.env.BASE_URL}media/${path}`

export const MEDIA = {
  defaultVideo: { src: mediaUrl('S2JS_wm.mp4'), poster: mediaUrl('poster-S2JS.jpg'), dur: 5.1 },
  video10: { src: mediaUrl('video-10.mp4'), poster: mediaUrl('poster-video-10.jpg'), dur: 5.1 },
  video9: { src: mediaUrl('video-9.mp4'), poster: mediaUrl('poster-video-9.jpg'), dur: 5.1 },
  gh77: { src: mediaUrl('GH77.mp4'), poster: mediaUrl('poster-GH77.jpg'), dur: 10.1 },
}

const clip = (name: string, dur: number) => ({ src: mediaUrl(`clip-${name}.mp4`), poster: mediaUrl(`poster-clip-${name}.jpg`), dur })

export interface WalkVideo { src: string; poster: string; dur: number; name: string }

/**
 * 走查用的视频素材。每一段只为一条规则准备，名字里直接写清「时长 · 画幅 · 用途」——
 * 走查时按名字取用，不必先播一遍才知道这段是干什么的。
 *
 * 时长按最终规则铺开：下限统一 4 秒（与模型无关），
 * Seedance 2.5 单段 4–30s / 合计 ≤ 30s / 30 张 · 10 段；
 * Seedance 2.0 系列与可灵 O1 单段 4–15s / 合计 ≤ 15s / 9 张 · 3 段。
 * 共 14 段，越过 2.5 的 10 段视频额度；横版 5 段、竖版 9 段，两种画幅在每个时长档都有。
 */
export const VID = {
  // ── 低于 4 秒下限：更换模型无效，终态 ──
  v1_5: { ...clip('1', 1.5), name: '1.5s 竖版 · 低于 4 秒下限' },
  h2: { ...clip('2a', 2), name: '2s 横版 · 低于 4 秒下限' },
  v3: { ...clip('3', 3), name: '3s 竖版 · 低于 4 秒下限' },
  // ── 刚过下限与常规可用段 ──
  v4: { ...clip('4', 4.2), name: '4.2s 竖版 · 刚过 4 秒下限' },
  h5: { ...MEDIA.defaultVideo, name: '5.1s 横版 · 编辑视频默认源' },
  v5: { ...MEDIA.video9, name: '5.1s 竖版 · 第二段转全能参考' },
  v5b: { ...MEDIA.video10, name: '5.1s 竖版 · 更换素材用' },
  v6: { ...clip('6', 6), name: '6s 竖版 · 解除受阻用' },
  // ── 合计时长：两段 8s ＝ 16s，撞 2.0 系列与可灵 O1 的 15 秒合计上限 ──
  h8: { ...clip('h8', 8), name: '8s 横版 · 合计撞 2.0 上限' },
  v8: { ...clip('8', 8), name: '8s 竖版 · 合计撞 2.0 上限' },
  v10: { ...MEDIA.gh77, name: '10.1s 竖版 · 2.0 单段上沿' },
  h12: { ...clip('h12', 12), name: '12s 横版 · 2.5 合计内' },
  // ── 单段上限：18s 超 2.0，切 2.5 即恢复；32s 连 2.5 的 30 秒也接不住 ──
  v18: { ...clip('v18', 18), name: '18s 竖版 · 超 2.0 单段 · 可切 2.5' },
  h32: { ...clip('h32', 32), name: '32s 横版 · 超全部模型单段上限' },
} satisfies Record<string, WalkVideo>

export const WALKTHROUGH_VIDEOS: WalkVideo[] = Object.values(VID)

/** 参考图池：1–6 为横版 640×400，7–8 为竖版 450×800（从竖版原片抽帧） */
export const SAMPLE_PHOTOS = Array.from({ length: 8 }, (_, i) => mediaUrl(`photos/reference-${i + 1}.jpg`))

/**
 * 图片节点的名字同样写明用途。共 10 张：
 * 前两张供首尾帧取用，第 9 张压在 2.0 系列与可灵 O1 的 9 张额度上沿，第 10 张越过该额度。
 */
export const PHOTO_ROLES = [
  '首帧候选 · 横版客厅',
  '尾帧候选 · 横版客厅',
  '参考图 3 · 横版',
  '参考图 4 · 横版',
  '参考图 5 · 横版',
  '参考图 6 · 横版',
  '参考图 7 · 竖版',
  '参考图 8 · 竖版',
  '参考图 9 · 2.0 图片额度上沿',
  '参考图 10 · 越过 9 张额度',
]

/** 图片节点假生成时随机填的一张 */
export const randomPhoto = () => photo(Math.random().toString(36).slice(2, 7))

/** 文本节点假生成的固定文案 */
export const FAKE_TEXT =
  '雨停了，屋檐还在滴水。\n她先开口："你瘦了。"\n他把伞收拢，靠在门框上，没有看她："路上堵。"\n' +
  '两个人都笑了一下，像是把要说的话又往回咽了半句。'

/** 画布节点 → 素材区用的 Mat */
export function matOf(n: CNode | undefined): Mat | null {
  if (!n || !n.data.src) return null
  const kind = n.type === 'video' ? 'video' : n.type === 'image' ? 'image' : null
  if (!kind) return null      // 文本节点不作为素材
  return {
    id: n.id,
    name: n.data.assetName || n.data.name || n.id,
    src: n.data.src,
    ready: n.data.mediaReady === true,
    error: n.data.mediaError,
    kind,
    dur: kind === 'video' ? n.data.dur : undefined,
    thumb: kind === 'video' ? n.data.poster : n.data.src,
    grad: gradOf(n.id),
  }
}
