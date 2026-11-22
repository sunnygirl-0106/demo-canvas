import type { NodeProps } from '@xyflow/react'
import { useCanvas, type CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import GeneratorPanel from '../generator/GeneratorPanel'
import ImagePanel from '../generator/ImagePanel'
import ImageToolbar from './ImageToolbar'
import { IcBack, IcImage } from '../ui/icons'

export default function ImageNode({ id, data, selected }: NodeProps<CNode>) {
  const results = data.imageResults ?? []
  const current = Math.max(0, results.indexOf(data.src ?? ''))
  const pick = (index: number) => useCanvas.getState().updateNode(id, { src: results[index] })
  return (
    <NodeShell
      id={id} kind="image" name={data.name} selected={!!selected} ratio={data.ratio}
      toolbar={<ImageToolbar nodeId={id} visible={!!selected && !!data.src && !data.busy} src={data.src} name={data.name} />}
      panel={<GeneratorPanel visible={!!selected}><ImagePanel nodeId={id} /></GeneratorPanel>}
    >
      {data.src ? (
        // 原先右下角那枚「预览」挪进了工具栏最右边，画面上不再压一枚角标
        <img key={data.src} className="nd-img" src={data.src} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      ) : (
        <div className="nd-ph"><IcImage size={24} /></div>
      )}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
      {!data.busy && results.length > 1 && <div className="image-result-nav nodrag" role="group" aria-label="生成结果"
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="上一张图片" disabled={current === 0} onClick={() => pick(current - 1)}><IcBack size={13} /></button>
        <span aria-live="polite">{current + 1} / {results.length}</span>
        <button type="button" aria-label="下一张图片" disabled={current === results.length - 1} onClick={() => pick(current + 1)}>
          <IcBack size={13} style={{ transform: 'rotate(180deg)' }} /></button>
      </div>}
    </NodeShell>
  )
}
