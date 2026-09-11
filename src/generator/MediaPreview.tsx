import { useState } from 'react'
import type { Mat } from './materialLayout'
import { fmt } from './materialLayout'
import Overlay from './Overlay'
export default function MediaPreview({ mat, onClose }: { mat: Mat; onClose: () => void }) {
  const [error, setError] = useState(false)
  return <Overlay modal label={`预览 ${mat.name}`} className="media-preview" onClose={onClose}>
    <header><div><strong>{mat.name}</strong><span>{mat.kind === 'video' ? `视频${mat.dur != null ? ' · ' + fmt(mat.dur) : ''}` : '图片'}</span></div><button aria-label="关闭预览" onClick={onClose}>✕</button></header>
    {error ? <p role="alert">素材加载失败，请重新选择文件。</p> : mat.kind === 'video'
      ? <video src={mat.src} poster={mat.thumb} controls playsInline preload="metadata" onError={() => setError(true)} />
      : <img src={mat.src ?? mat.thumb} alt={mat.name} onError={() => setError(true)} />}
  </Overlay>
}
