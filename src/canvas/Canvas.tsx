import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ReactFlow, useNodesInitialized, useReactFlow, useStore,
  type Connection, type Edge, type NodeTypes, type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { isValidConnection, useCanvas, type NodeKind } from '../store/canvas'
import TextNode from '../nodes/TextNode'
import ImageNode from '../nodes/ImageNode'
import VideoNode from '../nodes/VideoNode'
import { loadVideoMetadata } from '../nodes/media'
import DashedEdge from './edges/DashedEdge'
import TopBar from './TopBar'
import LeftDock from './LeftDock'
import ZoomBar from './ZoomBar'
import ContextMenu, { type MenuPos } from './ContextMenu'
import AddNodeMenu from './AddNodeMenu'
import { sceneShowcase, sceneWired, sceneWorkflow } from '../demo/scenes'

/**
 * 把画布缩放比（--z）和标签系数（--zk）写进 CSS。单拎成一个不渲染任何东西的小组件 ——
 * 缩放是每帧都在变的量，让它只惊动这一个组件，摆在 Canvas 里会把整棵节点树一起重画。
 *
 * --zk 就是下面这一行：缩小时恒为 1（标签跟着画面缩），放大过 100% 之后按 1/√z 跟随 ——
 * 画面翻一倍，名字和那几枚开关在屏幕上长大 1.41 倍而不是原地不动。理由见 tokens.css 的那一段。
 * 想调跟随的松紧只动 FOLLOW：0 是一路封死（放大时标签在屏幕上恒定），1 是完全不封（标签跟画面等比长大）。
 */
const FOLLOW = 0.5

function ZoomVar() {
  const zoom = useStore((s) => s.transform[2])
  useEffect(() => {
    const css = document.documentElement.style
    css.setProperty('--z', String(zoom))
    css.setProperty('--zk', String(Math.max(1, zoom) ** (FOLLOW - 1)))
  }, [zoom])
  return null
}

const nodeTypes: NodeTypes = { text: TextNode, image: ImageNode, video: VideoNode }
const edgeTypes: EdgeTypes = { dashed: DashedEdge }
const defaultEdgeOptions = { type: 'dashed' }

export default function Canvas() {
  const st = useCanvas()
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow()
  const canvasWidth = useStore((s) => s.width)
  const initialized = useNodesInitialized()
  const pendingFit = useRef(true)
  const [menu, setMenu] = useState<MenuPos | null>(null)
  const [addMenu, setAddMenu] = useState<MenuPos | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const dropAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // 竖着排的（一两列）从顶部以可读大小开始，往下滚着看；铺得开的场景全览。编辑时保持用户的视角。
  useEffect(() => {
    if (!pendingFit.current || !initialized || !canvasWidth) return
    pendingFit.current = false
    const first = st.nodes[0]
    const columns = [...new Set(st.nodes.map((n) => n.position.x))].sort((a, b) => a - b)
    if (first && columns.length <= 2) {
      const span = columns[columns.length - 1] - columns[0] + 320
      void setViewport({ x: canvasWidth / 2 - columns[0] - span / 2, y: 100 - first.position.y, zoom: 1 })
    } else {
      void fitView({ padding: 0.16, maxZoom: 0.85 })
    }
  }, [initialized, st.nodes, canvasWidth, fitView, setViewport])

  const showScene = (load: () => void) => {
    setMenu(null)
    setAddMenu(null)
    pendingFit.current = true
    load()
  }

  const posAt = useCallback(
    (clientX: number, clientY: number): MenuPos => {
      const f = screenToFlowPosition({ x: clientX, y: clientY })
      return { x: clientX, y: clientY, flowX: f.x, flowY: f.y }
    },
    [screenToFlowPosition],
  )

  /* 快捷键：撤销 / 重做 / 复制 / 粘贴 / 删除 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? useCanvas.getState().redo() : useCanvas.getState().undo()
      } else if (meta && e.key.toLowerCase() === 'c') {
        useCanvas.getState().copySelection()
      } else if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        useCanvas.getState().paste()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        useCanvas.getState().deleteSelection()
      } else if (e.key === 'Escape') {
        // 收起选中节点下方那块面板：它比一行还高，盖住下面那个节点就拖不动也点不着，
        // 原来只能去空白处点一下 —— 而空白处正好也可能被面板盖着
        const canvas = useCanvas.getState()
        if (canvas.nodes.some((n) => n.selected)) {
          canvas.onNodesChange(canvas.nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: false })))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addAt = (kind: NodeKind, p: MenuPos) =>
    useCanvas.getState().addNode(kind, { x: p.flowX - 160, y: p.flowY - 100 })

  const openUpload = (p: MenuPos) => { dropAt.current = { x: p.flowX - 160, y: p.flowY - 100 }; file.current?.click() }

  return (
    <>
      <ReactFlow
        nodes={st.nodes}
        edges={st.edges}
        onNodesChange={st.onNodesChange}
        onNodeDragStart={() => st.snapshot()}
        onEdgesChange={st.onEdgesChange}
        onConnect={st.onConnect as (c: Connection) => void}
        isValidConnection={(c: Connection | Edge) => isValidConnection(c, st.nodes, st.edges)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        panOnScroll
        zoomOnScroll={false}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.84 }}
        proOptions={{ hideAttribution: false }}
        connectionLineStyle={{ stroke: 'var(--teal)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
        onDrop={(e) => {
          e.preventDefault()
          const at = screenToFlowPosition({ x: e.clientX, y: e.clientY })
          Array.from(e.dataTransfer.files).filter((f) => /^(image|video)\//.test(f.type)).forEach((f, i) => {
            const src = URL.createObjectURL(f); const isVideo = f.type.startsWith('video/')
            const id = useCanvas.getState().addNode(isVideo ? 'video' : 'image', { x: at.x + i * 35, y: at.y + i * 35 }, { src })
            if (isVideo) loadVideoMetadata(id, src)
          })
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setAddMenu(null)
          setMenu(posAt((e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY))
        }}
        onPaneClick={() => { setMenu(null); setAddMenu(null) }}
        connectOnClick={false}
      >
        <ZoomVar />
        {/* 底色交给 .react-flow 那层径向渐变，这里只画点阵：1px 的点、26px 一格 */}
        <Background variant={BackgroundVariant.Dots} gap={45} size={2} color="var(--dot)" />
      </ReactFlow>

      {/* 连线箭头 */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker id="arrow-teal" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0 1.2 L7.5 4.5 L0 7.8 z" fill="var(--teal)" />
          </marker>
        </defs>
      </svg>

      <TopBar onShowcase={() => showScene(sceneShowcase)}
        onWired={(key) => showScene(() => sceneWired(key))}
        onWorkflow={() => showScene(sceneWorkflow)} />
      <LeftDock onAdd={(e) => { setMenu(null); setAddMenu(posAt(e.clientX + 8, e.clientY)) }} />
      <ZoomBar />

      {menu && (
        <ContextMenu
          pos={menu}
          onAddNode={() => { setAddMenu(menu); setMenu(null) }}
          onUpload={() => openUpload(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {addMenu && (
        <AddNodeMenu
          pos={addMenu}
          onPick={(k) => addAt(k, addMenu)}
          onUpload={() => openUpload(addMenu)}
          onClose={() => setAddMenu(null)}
        />
      )}

      <input
        ref={file} type="file" accept="image/*,video/*" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f || !/^(image|video)\//.test(f.type)) return
          const src = URL.createObjectURL(f)
          const isVideo = f.type.startsWith('video')
          const id = useCanvas.getState().addNode(isVideo ? 'video' : 'image', dropAt.current, { src })
          if (isVideo) loadVideoMetadata(id, src)
        }}
      />
    </>
  )
}
