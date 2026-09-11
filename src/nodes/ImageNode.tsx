import type { NodeProps } from '@xyflow/react'
import type { CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import GeneratorPanel from '../generator/GeneratorPanel'
import ImagePanel from '../generator/ImagePanel'
import { IcEye, IcImage, IcUpload } from '../ui/icons'
import { useUploadInto } from './useUpload'

export default function ImageNode({ id, data, selected }: NodeProps<CNode>) {
  const upload = useUploadInto(id)

  return (
    <NodeShell
      id={id} kind="image" name={data.name} selected={!!selected}
      action={<span onClick={upload.open} title="上传"><IcUpload size={13} /></span>}
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
      {upload.input}
    </NodeShell>
  )
}
