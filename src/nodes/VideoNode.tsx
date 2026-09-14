import { useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvas, type CNode } from '../store/canvas'
import NodeShell from './NodeShell'
import VideoToolbar from './VideoToolbar'
import GeneratorPanel from '../generator/GeneratorPanel'
import VideoPanel from '../generator/VideoPanel'
import { IcExpand, IcPlay, IcUpload, IcVideo } from '../ui/icons'
import { useUploadInto } from './useUpload'

export default function VideoNode({ id, data, selected }: NodeProps<CNode>) {
  const upload = useUploadInto(id)
  const vid = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const has = !!data.src

  useEffect(() => { setPlaying(false) }, [data.src])

  const toggle = () => {
    const v = vid.current
    if (!v) return
    if (v.paused) { void v.play().catch(() => setPlaying(false)) } else { v.pause() }
  }

  return (
    <NodeShell
      id={id} kind="video" name={data.name} selected={!!selected}
      action={<span onClick={upload.open} title="上传"><IcUpload size={13} /></span>}
      toolbar={<VideoToolbar nodeId={id} visible={!!selected && has} src={data.src} name={data.name} dur={data.dur} />}
      panel={<GeneratorPanel visible={!!selected}><VideoPanel nodeId={id} /></GeneratorPanel>}
    >
      {has ? (
        <>
          <video
            ref={vid} className="nd-vid nodrag" src={data.src} poster={data.poster}
            playsInline loop preload="metadata" onClick={toggle}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => { const duration = e.currentTarget.duration; if (Number.isFinite(duration)) useCanvas.getState().updateNode(id, { dur: duration, mediaReady: true, mediaError: undefined }) }}
            onError={() => { setPlaying(false); useCanvas.getState().updateNode(id, { mediaReady: false, mediaError: '视频无法读取，请重新上传' }) }} onEnded={() => setPlaying(false)}
          />
          {!playing && <div className="nd-play nodrag" onClick={toggle}><span><IcPlay size={26} /></span></div>}
          <button className="nd-corner nodrag" title="全屏" onClick={(e) => { e.stopPropagation(); void vid.current?.requestFullscreen?.().catch(() => {}) }}><IcExpand size={11} /></button>
        </>
      ) : (
        <div className="nd-ph"><IcVideo size={24} /></div>
      )}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
      {upload.input}
    </NodeShell>
  )
}
