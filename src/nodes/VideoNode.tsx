import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { focusSource, isFocusNode, useCanvas, type CNode } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import NodeShell from './NodeShell'
import VideoToolbar from './VideoToolbar'
import GeneratorPanel from '../generator/GeneratorPanel'
import VideoPanel from '../generator/VideoPanel'
import MarkBoard from '../generator/MarkBoard'
import ExtendTrack from '../generator/ExtendTrack'
import { IcExpand, IcPlay, IcPlus, IcUpload, IcVideo, IcWriting } from '../ui/icons'
import { fmt, MEDIA_FAIL } from '../generator/materialLayout'
import { useUploadInto } from './useUpload'
import { useAspect } from '../generator/hoverShot'

export default function VideoNode({ id, data, selected }: NodeProps<CNode>) {
  const upload = useUploadInto(id)
  const vid = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const nodes = useCanvas((s) => s.nodes)
  const mode = useGenerator((s) => s.map[id]?.mode)
  const self = nodes.find((n) => n.id === id) ?? null
  /** 专注态：从视频上方入口长出来、还没出片的那段时间。操作都长在节点上，就在这段时间里。 */
  const focus = !!self && isFocusNode(self)
  const origin = self ? focusSource(nodes, self) : null
  /**
   * 专注态节点自己还没有画面，摆的是父节点那一段 —— 而且不写回自己的 data：
   * 它只是在看父节点那一段，写回去就成了「它自己有画面」，专注态当场结束。
   */
  const shot = focus ? origin?.data : data
  const has = !!shot?.src
  /**
   * 提示词框重挂的标志。句子由两处改动：面板里插一枚 @ 引用、节点上圈一处标记 ——
   * 都是「由外部改动句子」，所以这个计数住在两者共同的这一层。
   */
  const [docVer, setDocVer] = useState(0)
  const bump = useCallback(() => setDocVer((v) => v + 1), [])

  useEffect(() => { setPlaying(false) }, [shot?.src])

  /**
   * 这段视频到底是横的还是竖的，量自它的封面。量出来就把节点摆成那个形状 ——
   * 竖片是竖的、横片是横的，两边都不留黑；三种朝向占的面积一样大（boxFor）。
   * 专注态不量：那块屏摆的是父节点那一段，形状归它自己那一套（MarkStage 按素材摊开）。
   */
  const ratio = useAspect(focus ? undefined : shot?.poster)
  useEffect(() => { if (ratio && !focus) useCanvas.getState().shape(id, ratio) }, [id, ratio, focus])

  /**
   * 画面本身也能拖动节点。一个视频节点九成的面积就是这张画面，把它整块划成「不可拖」，
   * 能抓的就只剩标题栏那 22px —— 一张全是视频的画布于是像谁都被钉死了。
   * 代价是按下到松手之间可能是一次拖动，所以播放开关按位移判：原地点一下才算点。
   * 阈值和 ⊕ 把手那处是同一档（NodeShell），手上的手感才是一套。
   */
  const down = useRef({ x: 0, y: 0 })
  const toggle = (e: React.MouseEvent) => {
    if (Math.abs(e.clientX - down.current.x) + Math.abs(e.clientY - down.current.y) > 6) return
    const v = vid.current
    if (!v) return
    if (v.paused) { void v.play().catch(() => setPlaying(false)) } else { v.pause() }
  }

  const marking = focus && mode === 'edit'
  const source = marking ? matOf(origin ?? undefined) : null
  // 出片那一刻专注态结束，这条轴跟着一起收走：产出就是一段完整的视频，节点上不再留原片和新增那一截
  const extending = focus && mode === 'extend'

  /**
   * 专注态的标题栏右边挂一枚状态徽章，说的是「正在做哪件事」 ——
   * 徽章从画面右上角搬到这里，画面上就只剩画面和画在它上面的标记，一个字都不压着。
   * 左边那枚图标不跟着换：它说的始终是「这是个视频节点」，和别的节点读法一致。
   */
  const opIcon = mode === 'extend' ? <IcPlus size={14} sw={1.7} /> : <IcWriting size={15} />
  const opLabel = mode === 'extend' ? '延长中' : '编辑中'
  return (
    <NodeShell
      id={id} kind="video" name={data.name} selected={!!selected} focus={focus} ratio={focus ? null : ratio ?? data.ratio}
      action={focus
        ? <span className="nd-op" data-op={mode === 'extend' ? 'extend' : 'edit'}>{opIcon}
          {/* 编辑态拆成单字：笔写到最右边那一下，三个字依次轻轻一跳，像是被写出来的。
              延长态不拆 —— 它那枚图标是在原地呼吸，没有「写到头」那个时刻可对。 */}
          {mode === 'extend' ? opLabel
            // 单字要包在一个 b 里：直接摆进 .nd-op，三个字就各自成了 flex 子项，
            // 被那条 gap:5px 一个个撑开 —— 字距该由字距说了算，不该由图标和字之间那道缝说了算
            : <b>{[...opLabel].map((ch, i) => <em key={i}>{ch}</em>)}</b>}</span>
        : <span onClick={upload.open} title="上传"><IcUpload size={13} /></span>}
      toolbar={<VideoToolbar nodeId={id} visible={!!selected && has && !focus} src={data.src} name={data.name} dur={data.dur} />}
      panel={<GeneratorPanel visible={!!selected}><VideoPanel nodeId={id} docVer={docVer} onBump={bump} /></GeneratorPanel>}
    >
      {source ? <MarkBoard nodeId={id} mat={source} onBump={bump} /> : <>
        {has ? (
          <div className="nd-shot" onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY } }}>
            <video
              ref={vid} className="nd-vid" src={shot?.src} poster={shot?.poster}
              playsInline loop preload="metadata" onClick={toggle}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => { const duration = e.currentTarget.duration; if (!focus && Number.isFinite(duration)) useCanvas.getState().updateNode(id, { dur: duration, mediaReady: true, mediaError: undefined }) }}
              onError={() => { setPlaying(false); if (!focus) useCanvas.getState().updateNode(id, { mediaReady: false, mediaError: MEDIA_FAIL.read }) }} onEnded={() => setPlaying(false)}
            />
            {!playing && <div className="nd-play" onClick={toggle}><span><IcPlay size={26} /></span></div>}
            {/*
              时长直接摆在缩略图上：几秒的视频能做什么任务，规则全挂在这个数上。
              专注态不摆：那块屏底下就是这段视频自己的轴，同一个数在一块屏上写两遍。
            */}
            {!focus && shot?.dur != null && Number.isFinite(shot.dur) && <span className="nd-dur">{fmt(shot.dur)}</span>}
            <button className="nd-corner nodrag" title="全屏" onClick={(e) => { e.stopPropagation(); void vid.current?.requestFullscreen?.().catch(() => {}) }}><IcExpand size={11} /></button>
          </div>
        ) : (
          <div className="nd-ph"><IcVideo size={24} /></div>
        )}
        {extending && <ExtendTrack nodeId={id} />}
      </>}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
      {upload.input}
    </NodeShell>
  )
}
