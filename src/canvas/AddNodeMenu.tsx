import { useEffect, useRef } from 'react'
import { useMenuPos } from './useMenuPos'
import type { NodeKind } from '../store/canvas'
import type { MenuPos } from './ContextMenu'
import {
  IcAudio, IcCompose, IcCube, IcImage, IcPano, IcScript, IcText, IcUpload, IcVideo,
} from '../ui/icons'

const ITEMS: { k: NodeKind | null; icon: React.FC<{ size?: number }>; t: string; s: string }[] = [
  { k: 'text', icon: IcText, t: '文本', s: '脚本、广告词、品牌文案' },
  { k: 'image', icon: IcImage, t: '图片', s: '海报、分镜、角色设计' },
  { k: 'video', icon: IcVideo, t: '视频', s: '视频、动画、电影' },
  { k: null, icon: IcAudio, t: '音频', s: '音乐、配音、音效' },
  { k: null, icon: IcPano, t: '720全景', s: '全景图、空间漫游' },
  { k: null, icon: IcScript, t: '脚本生成器', s: '一句话生成分镜脚本' },
  { k: null, icon: IcCompose, t: '视频合成', s: '多段素材合成一条片子' },
  { k: null, icon: IcCube, t: '3D导演台', s: '镜头调度与场景搭建' },
]

interface Props {
  pos: MenuPos
  onPick: (k: NodeKind) => void
  onUpload: () => void
  onClose: () => void
}

/** 添加节点二级菜单（截图 3）：只有 文本 / 图片 / 视频 会真的建节点 */
export default function AddNodeMenu({ pos, onPick, onUpload, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const at = useMenuPos(ref, pos.x, pos.y)
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', off, true)   // 捕获阶段，面板里的 mousedown 也能收到
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', off, true); window.removeEventListener('keydown', esc) }
  }, [onClose])

  return (
    <div className="addm" ref={ref} style={at}>
      <h4>添加节点</h4>
      {ITEMS.map((it) => (
        <div key={it.t} className={'addm-i' + (it.k ? '' : ' soon')}
             onClick={() => { if (it.k) onPick(it.k); onClose() }}>
          <div className="addm-ic"><it.icon size={18} /></div>
          <div><div className="addm-t">{it.t}</div><div className="addm-s">{it.s}</div></div>
        </div>
      ))}
      <h4>添加资源</h4>
      <div className="addm-i" onClick={() => { onUpload(); onClose() }}>
        <div className="addm-ic"><IcUpload size={18} /></div>
        <div><div className="addm-t">上传</div><div className="addm-s">支持图片、视频和音频</div></div>
      </div>
    </div>
  )
}
