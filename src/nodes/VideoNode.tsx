import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { EMPTY_VIDEO_RATIO, focusSource, isFocusNode, useCanvas, type CNode } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import NodeShell from './NodeShell'
import VideoToolbar from './VideoToolbar'
import VideoHud from './VideoHud'
import GeneratorPanel from '../generator/GeneratorPanel'
import VideoPanel from '../generator/VideoPanel'
import MarkBoard from '../generator/MarkBoard'
import ExtendTrack from '../generator/ExtendTrack'
import { IcExpand, IcPlus, IcVideo, IcWriting } from '../ui/icons'
import { MEDIA_FAIL } from '../generator/materialLayout'
import { useAspect } from '../generator/hoverShot'

export default function VideoNode({ id, data, selected }: NodeProps<CNode>) {
  const vid = useRef<HTMLVideoElement>(null)
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

  /**
   * 这段视频到底是横的还是竖的，量自它的封面。量出来就把节点摆成那个形状 ——
   * 竖片是竖的、横片是横的，两边都不留黑；三种朝向占的面积一样大（boxFor）。
   * 专注态不量：那块屏摆的是父节点那一段，形状归它自己那一套（MarkStage 按素材摊开）。
   */
  const ratio = useAspect(focus ? undefined : shot?.poster)
  useEffect(() => { if (ratio && !focus) useCanvas.getState().shape(id, ratio) }, [id, ratio, focus])
  /**
   * 空节点没有封面可量，上面那条路永远轮不到它 —— 形状由 EMPTY_VIDEO_RATIO 说了算（横屏）。
   * 新建时就是按这个宽度出生的（widthOf），这里再摆一次是为了那几条绕路来的：
   * 比如专注态断了源、退回成一个空节点，宽度会被还成竖屏那一档。
   */
  useEffect(() => { if (!focus && !has) useCanvas.getState().shape(id, EMPTY_VIDEO_RATIO) }, [id, focus, has])

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
    if (v.paused) { void v.play().catch(() => {}) } else { v.pause() }
  }
  /**
   * 鼠标进来就放，离开就停回起点 —— 一张画布上十来段视频，中间各压一枚播放键，
   * 先看见的是一排按钮，不是那些画面；而「看看这段是什么」本来就只是把鼠标放上去这么一下。
   * 键盘和读屏那条路没断：画面本身仍然可点（toggle），停在哪一帧也还是由它说了算。
   * 停下来回到第 0 帧，不停在半路：一屏缩略图，每张停在各自被瞥到的那一秒，整片就花了。
   *
   * 「要不要停」由两件事一起说了算：鼠标还在不在这块画面上、控制条那枚菜单开没开。
   * 菜单是浮层，摆在节点外面 —— 鼠标从画面挪到菜单上算「离开了这个节点」，
   * 一停就停回第 0 帧，而「截取当前帧」要截的正是刚才停着的那一帧。
   * 所以菜单开着时先不停，等它关上再看鼠标还在不在（关的时候人可能早走远了）。
   */
  /**
   * 读失败先当偶然，重来一次才认。
   *
   * 一张画布上十几段视频同时开读，连接是抢着用的 —— 掉一次不说明这段片子坏了。
   * 而这一枚判断的后果重得不成比例：mediaError 一写进去，这个节点的局部编辑 / 延长入口就全堵上，
   * 而且只有它自己再读成功一次才擦得掉（进了局部编辑，这枚 <video> 已经不在画面上了，
   * 那条路当场就断）。所以先退一步重来一次，第二次还不行，才把这段片子判成读不出来。
   * 局部编辑那块屏也在另一头兜着：它读成功了会把这条错擦掉（见 MarkBoard 的 ready）。
   */
  const retried = useRef(false)
  const retry = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => { retried.current = false; return () => clearTimeout(retry.current) }, [shot?.src])
  const failed = () => {
    if (focus) return
    const v = vid.current
    if (v && !retried.current) {
      retried.current = true
      retry.current = setTimeout(() => v.load(), 500)
      return
    }
    useCanvas.getState().updateNode(id, { mediaReady: false, mediaError: MEDIA_FAIL.read })
  }
  const inside = useRef(false)
  const menu = useRef(false)
  const stop = () => { const v = vid.current; if (!v) return; v.pause(); v.currentTime = 0 }
  const hoverPlay = () => { inside.current = true; void vid.current?.play().catch(() => {}) }
  const hoverStop = () => { inside.current = false; if (!menu.current) stop() }

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
      id={id} kind="video" name={data.name} selected={!!selected} focus={focus}
      ratio={focus ? null : has ? ratio ?? data.ratio : EMPTY_VIDEO_RATIO}
      action={focus
        ? <span className="nd-op" data-op={mode === 'extend' ? 'extend' : 'edit'}>{opIcon}
          {/* 编辑态拆成单字：笔写到最右边那一下，三个字依次轻轻一跳，像是被写出来的。
              延长态不拆 —— 它那枚图标是在原地呼吸，没有「写到头」那个时刻可对。 */}
          {mode === 'extend' ? opLabel
            // 单字要包在一个 b 里：直接摆进 .nd-op，三个字就各自成了 flex 子项，
            // 被那条 gap:5px 一个个撑开 —— 字距该由字距说了算，不该由图标和字之间那道缝说了算
            : <b>{[...opLabel].map((ch, i) => <em key={i}>{ch}</em>)}</b>}</span>
        : undefined}
      toolbar={<VideoToolbar nodeId={id} visible={!!selected && has && !focus} src={data.src} name={data.name} dur={data.dur} />}
      panel={<GeneratorPanel visible={!!selected}><VideoPanel nodeId={id} docVer={docVer} onBump={bump} /></GeneratorPanel>}
    >
      {source ? <MarkBoard nodeId={id} mat={source} onBump={bump} /> : <>
        {has ? (
          <div className="nd-shot" onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY } }}
               onMouseEnter={hoverPlay} onMouseLeave={hoverStop}>
            {/* muted 是悬浮即播的前提：带声音的自动播放会被浏览器拦下来，十来段一起响也没人想听 */}
            <video
              ref={vid} className="nd-vid" src={shot?.src} poster={shot?.poster}
              playsInline loop muted preload="metadata" onClick={toggle}
              onLoadedMetadata={(e) => { const duration = e.currentTarget.duration; retried.current = false
                if (!focus && Number.isFinite(duration)) useCanvas.getState().updateNode(id, { dur: duration, mediaReady: true, mediaError: undefined }) }}
              onError={failed}
            />
            <button className="nd-corner nodrag" title="全屏" onClick={(e) => { e.stopPropagation(); void vid.current?.requestFullscreen?.().catch(() => {}) }}><IcExpand size={11} /></button>
            {/* 鼠标一进来这段就开始放，那就得有一条轴说清「放到哪儿了、还有多长」——
                以及对这条片子还能做什么。它只管这一段视频本身，生成那几件归上方工具栏。
                专注态不摆：那块屏放的是父节点那一段，时间由它自己那条轴（延长轴 / 标记轴）说了算 */}
            {!focus && <VideoHud nodeId={id} video={vid} src={shot?.src} poster={shot?.poster} dur={data.dur}
                                 onMenu={(on) => { menu.current = on; if (!on && !inside.current) stop() }} />}
          </div>
        ) : (
          <div className="nd-ph"><IcVideo size={24} /></div>
        )}
        {extending && <ExtendTrack nodeId={id} />}
      </>}
      {data.busy && <div className="nd-busy"><span className="spin" />生成中…</div>}
    </NodeShell>
  )
}
