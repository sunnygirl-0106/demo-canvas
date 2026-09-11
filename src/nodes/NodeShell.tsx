import { useRef, useState, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useCanvas, type NodeKind } from '../store/canvas'
import { useActiveConn } from '../canvas/hooks'
import { IcImage, IcPlus, IcText, IcVideo } from '../ui/icons'

const KIND_ICON = { text: IcText, image: IcImage, video: IcVideo }

interface Props {
  id: string
  kind: NodeKind
  name: string
  selected: boolean
  action?: ReactNode        // 标题栏右侧小图标
  children: ReactNode       // 内容区
  foot?: ReactNode
  toolbar?: ReactNode       // 节点上方浮动工具栏
  panel?: ReactNode         // 节点下方生成器面板
}

/** 通用节点外壳：外置标题栏、左右 ⊕、选中描边、hover 联动 */
export default function NodeShell({ id, kind, name, selected, action, children, foot, toolbar, panel }: Props) {
  const Icon = KIND_ICON[kind]
  const hover = useCanvas((s) => s.hoverMat)
  const setHover = useCanvas((s) => s.setHoverMat)
  const updateNode = useCanvas((s) => s.updateNode)
  const snapshot = useCanvas((s) => s.snapshot)
  const conn = useActiveConn()
  const spawn = useCanvas((s) => s.spawnDownstream)
  const down = useRef({ x: 0, y: 0 })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const hl = hover === id
  const dim = !!hover && hover !== id && conn.has(id)

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== name) { snapshot(); updateNode(id, { name: v }) }
  }

  return (
    <div className={'nd' + (selected ? ' sel' : '') + (hl ? ' hl' : '') + (dim ? ' dim' : '')}>
      {toolbar}
      <div className="nd-head">
        <span className="ic"><Icon size={13} /></span>
        {editing ? (
          <span className="nd-name">
            <input
              autoFocus value={draft} className="nodrag"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            />
          </span>
        ) : (
          <span className="nd-name" onDoubleClick={() => { setDraft(name); setEditing(true) }}>{name}</span>
        )}
        {action && <span className="act">{action}</span>}
      </div>

      {/* hover 联动只挂在节点框上：面板是 NodeToolbar portal，在 React 树里仍是本节点的子节点，
          挂在外层会被面板里的鼠标事件抢走 hover id */}
      <div
        className="nd-body"
        onMouseEnter={() => { if (kind !== 'text' && !selected) setHover(id) }}
        onMouseLeave={() => { if (hl) setHover(null) }}   // 选中态也要清，否则 hover 会卡住
      >
        {children}
        {foot && <div className="nd-foot">{foot}</div>}
      </div>

      {kind !== 'text' && (
        <Handle type="target" position={Position.Left} id="in" isConnectableStart={false}>
          <div className="h-plus"><IcPlus size={11} sw={2.2} /></div>
        </Handle>
      )}
      {/* 拖出去 = 连线；原地点一下 = 右侧 360px 直接新建一个空视频节点并连上 */}
      <Handle type="source" position={Position.Right} id="out">
        <div
          className="h-plus"
          onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY } }}
          onClick={(e) => {
            if (Math.abs(e.clientX - down.current.x) + Math.abs(e.clientY - down.current.y) > 6) return
            e.stopPropagation()
            spawn(id)
          }}
        >
          <IcPlus size={11} sw={2.2} />
        </div>
      </Handle>

      {panel}
    </div>
  )
}
