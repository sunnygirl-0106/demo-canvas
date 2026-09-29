import { useState } from 'react'
import type { Mat } from './materialLayout'
import { fmt } from './materialLayout'
import Overlay from './Overlay'
export default function MediaPreview({ mat, onClose }: { mat: Mat; onClose: () => void }) {
  const [error, setError] = useState(false)
  return <Overlay modal label={`预览 ${mat.name}`} className="media-preview" onClose={onClose}>
    <header><div><strong>{mat.name}</strong><span>{mat.kind === 'video' ? `视频${mat.dur != null ? ' · ' + fmt(mat.dur) : ''}` : '图片'}</span></div><button aria-label="关闭预览" onClick={onClose}>✕</button></header>
    {error ? <p role="alert">素材无法读取，可尝试重新上传</p> : mat.kind === 'video'
      /* 进来就放：是用户自己点的「播放」才走到这一层 —— 打开一个停着的画面，
         等于把他刚按下的那一下原样退回去，让他再按一次。浏览器拦下来也不要紧，
         控制条就在那儿（它是被 controls 接住的，不是一枚我们自己画的按钮） */
      ? <video src={mat.src} poster={mat.thumb} controls autoPlay playsInline preload="metadata" onError={() => setError(true)} />
      : <img src={mat.src ?? mat.thumb} alt={mat.name} onError={() => setError(true)} />}
  </Overlay>
}
