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
import { sceneShowcase, sceneWorkflow } from '../demo/scenes'

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

  // 单列从顶部以可读大小开始；连线场景全览。编辑时保持用户的视角。
  useEffect(() => {
    if (!pendingFit.current || !initialized || !canvasWidth) return
    pendingFit.current = false
    const first = st.nodes[0]
    if (first && st.nodes.every((n) => n.position.x === first.position.x)) {
      void setViewport({ x: canvasWidth / 2 - first.position.x - 160, y: 100 - first.position.y, zoom: 1 })
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
        <Background variant={BackgroundVariant.Dots} gap={45} size={2} color="var(--dot)" bgColor="var(--bg)" />
      </ReactFlow>

      {/* 连线箭头 */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker id="arrow-teal" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0 1.2 L7.5 4.5 L0 7.8 z" fill="var(--teal)" />
          </marker>
        </defs>
      </svg>

      <TopBar onShowcase={() => showScene(sceneShowcase)} onDemo={() => showScene(sceneWorkflow)} />
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
