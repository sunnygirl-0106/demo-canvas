import { useRef } from 'react'
import { useCanvas } from '../store/canvas'
import { loadVideoMetadata } from './media'

/** 标题栏上传图标：选文件后直接填进这个节点 */
export function useUploadInto(id: string) {
  const ref = useRef<HTMLInputElement>(null)
  const updateNode = useCanvas((s) => s.updateNode)
  const kind = useCanvas((s) => s.nodes.find((n) => n.id === id)?.type)
  const snapshot = useCanvas((s) => s.snapshot)

  const input = (
    <input
      ref={ref} type="file" accept={kind === 'video' ? 'video/*' : 'image/*'} style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        if (!f.type.startsWith(kind === 'video' ? 'video/' : 'image/')) return
        snapshot()
        const src = URL.createObjectURL(f)
        updateNode(id, { src, poster: undefined, dur: undefined, mediaReady: false, mediaError: undefined })
        if (kind === 'video') loadVideoMetadata(id, src)
      }}
    />
  )
  return { input, open: (e?: React.MouseEvent) => { e?.stopPropagation(); ref.current?.click() } }
}
