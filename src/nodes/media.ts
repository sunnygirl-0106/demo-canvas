import { useCanvas } from '../store/canvas'
import { MEDIA_FAIL } from '../generator/materialLayout'

/** 读取真实时长和封面；只回填仍在使用这份文件的节点。 */
export function loadVideoMetadata(id: string, src: string) {
  const video = document.createElement('video')
  let metadataReady = false
  video.preload = 'auto'
  video.muted = true
  const update = (patch: { dur?: number; poster?: string; mediaReady?: boolean; mediaError?: string }) => {
    const store = useCanvas.getState()
    if (store.nodes.find((n) => n.id === id)?.data.src === src) store.updateNode(id, patch)
  }
  const cleanup = () => {
    clearTimeout(timeout)
    video.onloadedmetadata = video.onseeked = video.onerror = null
    video.removeAttribute('src')
    video.load()
  }
  // 存的是原因，不是整句话：谁来说这句话（素材区说「视频 ABCD」、首尾帧说「首帧 ABCD」）由展示的那一头定
  const timeout = setTimeout(() => { if (!metadataReady) update({ mediaReady: false, mediaError: MEDIA_FAIL.read }); cleanup() }, 15000)
  video.onerror = () => { update({ mediaReady: false, mediaError: MEDIA_FAIL.read }); cleanup() }
  video.onloadedmetadata = () => {
    if (Number.isFinite(video.duration)) { metadataReady = true; update({ dur: video.duration, mediaReady: true, mediaError: undefined }) }
    video.currentTime = Math.min(0.5, video.duration / 2)
  }
  video.onseeked = () => {
    try {
      if (!video.videoWidth || !video.videoHeight) return
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = Math.round(640 * video.videoHeight / video.videoWidth)
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      update({ poster: canvas.toDataURL('image/jpeg', 0.85) })
    } finally {
      cleanup()
    }
  }
  video.src = src
}
