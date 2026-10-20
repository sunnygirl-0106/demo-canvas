import type { NodeProps } from '@xyflow/react'
import type { CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import GeneratorPanel from '../generator/GeneratorPanel'
import ImagePanel from '../generator/ImagePanel'
import ImageToolbar from './ImageToolbar'
import { IcImage } from '../ui/icons'

export default function ImageNode({ id, data, selected }: NodeProps<CNode>) {
  return (
    <NodeShell
      id={id} kind="image" name={data.name} selected={!!selected}
      toolbar={<ImageToolbar nodeId={id} visible={!!selected && !!data.src && !data.busy} src={data.src} name={data.name} />}
      panel={<GeneratorPanel visible={!!selected}><ImagePanel nodeId={id} /></GeneratorPanel>}
    >
      {data.src ? (
        // 原先右下角那枚「预览」挪进了工具栏最右边，画面上不再压一枚角标
        <img className="nd-img" src={data.src} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
      ) : (
        <div className="nd-ph"><IcImage size={24} /></div>
      )}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
    </NodeShell>
  )
}
