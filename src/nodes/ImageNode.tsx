import type { NodeProps } from '@xyflow/react'
import type { CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import GeneratorPanel from '../generator/GeneratorPanel'
import ImagePanel from '../generator/ImagePanel'
import { IcEye, IcImage } from '../ui/icons'

export default function ImageNode({ id, data, selected }: NodeProps<CNode>) {
  return (
    <NodeShell
      id={id} kind="image" name={data.name} selected={!!selected}
      panel={<GeneratorPanel visible={!!selected}><ImagePanel nodeId={id} /></GeneratorPanel>}
    >
      {data.src ? (
        <>
          <img className="nd-img" src={data.src} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="nd-preview"><IcEye size={12} />预览</div>
        </>
      ) : (
        <div className="nd-ph"><IcImage size={24} /></div>
      )}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
    </NodeShell>
  )
}
