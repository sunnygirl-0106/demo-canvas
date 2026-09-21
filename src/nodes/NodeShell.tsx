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
  /** 专注态：节点体换成一块深底、青边的屏，宽度由节点自己的 style 说了算 */
  focus?: boolean
  action?: ReactNode        // 标题栏右侧小图标
  children: ReactNode       // 内容区
  foot?: ReactNode
  toolbar?: ReactNode       // 节点上方浮动工具栏
  panel?: ReactNode         // 节点下方生成器面板
  /** 画面真实宽高比：给了就按它撑出节点体的高，横片是横的、竖片是竖的 */
  ratio?: number | null
}

/** 通用节点外壳：外置标题栏、左右 ⊕、选中描边、hover 联动 */
export default function NodeShell({ id, kind, name, selected, focus, action, children, foot, toolbar, panel, ratio }: Props) {
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
    // 改的是这个节点的名字，画布上和面板里是同一个：只改一头会让同一段视频有两个称呼。
    // 记一笔「这是手打的」：自动命名从此不再改口，从它派生出去的节点也以这个名字为根。
    if (v && v !== name) { snapshot(); updateNode(id, { name: v, assetName: v, renamed: true }) }
  }

  return (
    /* 类型挂在节点根上：视频节点的画面按 9:16 摆，图片 / 文本不动 —— 这是长相上的分档，不是状态 */
    <div data-kind={kind}
      className={'nd' + (selected ? ' sel' : '') + (hl ? ' hl' : '') + (dim ? ' dim' : '') + (focus ? ' focus' : '')}>
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
        className="nd-body" style={ratio ? { aspectRatio: ratio } : undefined}
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
