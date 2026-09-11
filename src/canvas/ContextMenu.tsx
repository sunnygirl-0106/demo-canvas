import { useEffect, useRef } from 'react'
import { useMenuPos } from './useMenuPos'
import { useCanvas } from '../store/canvas'
import { IcUpload } from '../ui/icons'

export interface MenuPos { x: number; y: number; flowX: number; flowY: number }

interface Props {
  pos: MenuPos
  onAddNode: () => void
  onUpload: () => void
  onClose: () => void
}

/** 画布空白处右键菜单（截图 2） */
export default function ContextMenu({ pos, onAddNode, onUpload, onClose }: Props) {
  const { undo, redo, paste, past, future, clipboard } = useCanvas()
  const ref = useRef<HTMLDivElement>(null)
  const at = useMenuPos(ref, pos.x, pos.y)

  useEffect(() => {
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', off, true)   // 捕获阶段，面板里的 mousedown 也能收到
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', off, true); window.removeEventListener('keydown', esc) }
  }, [onClose])

  const Item = ({ label, k, disabled, onClick }: { label: string; k?: string; disabled?: boolean; onClick?: () => void }) => (
    <div className="ctx-i" aria-disabled={disabled} onClick={() => { if (!disabled) { onClick?.(); onClose() } }}>
      <span>{label}</span>{k && <span className="k">{k}</span>}
    </div>
  )

  return (
    <div className="ctx" ref={ref} style={at}>
      <div className="ctx-i" onClick={() => { onUpload(); onClose() }}>
        <IcUpload size={15} /><span>上传</span>
      </div>
      <div className="ctx-i" onClick={onAddNode}><span>添加节点</span><span className="k">›</span></div>
      <div className="ctx-sep" />
      <Item label="撤销" k="⌘Z" disabled={!past.length} onClick={undo} />
      <Item label="重做" k="⇧⌘Z" disabled={!future.length} onClick={redo} />
      <div className="ctx-sep" />
      <Item label="粘贴" k="⌘V" disabled={!clipboard} onClick={() => paste({ x: pos.flowX, y: pos.flowY })} />
    </div>
  )
}
