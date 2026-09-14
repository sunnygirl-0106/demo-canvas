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

/**
 * 走查用的 2 秒短片：从上面四段原片各裁 2 秒，不是新生成的素材。
 * 2 秒刚好卡在「延长」的下限之上、「编辑」的 4 秒下限之下，两条规则一次就能试到。
 */
export const CLIPS_2S = Array.from({ length: 4 }, (_, i) => ({
  src: mediaUrl(`clip2s-${i + 1}.mp4`), poster: mediaUrl(`poster-clip2s-${i + 1}.jpg`), dur: 2.1,
}))

export const SAMPLE_PHOTOS = Array.from({ length: 6 }, (_, i) => mediaUrl(`photos/reference-${i + 1}.jpg`))

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
