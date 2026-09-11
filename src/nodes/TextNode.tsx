import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvas, type CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import GeneratorPanel from '../generator/GeneratorPanel'
import TextPanel from '../generator/TextPanel'
import { IcExpand } from '../ui/icons'

export default function TextNode({ id, data, selected }: NodeProps<CNode>) {
  const updateNode = useCanvas((s) => s.updateNode)
  const snapshot = useCanvas((s) => s.snapshot)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.text ?? '')
  const busy = data.busy

  return (
    <NodeShell
      id={id} kind="text" name={data.name} selected={!!selected}
      action={<IcExpand size={13} />}
      foot="双击文本进入编辑 · 点右上角 ⛶ 展开大屏编辑"
      panel={<GeneratorPanel visible={!!selected}><TextPanel nodeId={id} /></GeneratorPanel>}
    >
      {editing ? (
        <div className="nd-text">
          <textarea
            autoFocus className="nodrag nowheel" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={() => { setEditing(false); if (draft !== (data.text ?? '')) { snapshot(); updateNode(id, { text: draft }) } }}
          />
        </div>
      ) : (
        <div
          className={'nd-text' + (data.text ? '' : ' ph')}
          onDoubleClick={() => { setDraft(data.text ?? ''); setEditing(true) }}
        >
          {data.text || '双击开始编辑...'}
        </div>
      )}
      {busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
    </NodeShell>
  )
}
