import { useEffect, useRef, useState } from 'react'
import { fmt, isRef, matBlockedReason, visibleRefs, type Mat, type MatGet } from './materialLayout'
import { useCanvas } from '../store/canvas'
import { useGenerator, type GenState } from '../store/generator'
import { IcExpand, IcPlay, IcSwap } from '../ui/icons'
import MediaPreview from './MediaPreview'
import { shotBox, useAspect } from './hoverShot'
import Overlay from './Overlay'
import { useMarkShots, type MarkShot } from './markShot'
import { timecode } from './marks'
type Size = 'frame' | 'source' | 'reference'
/** why 非空 = 这个素材本次用不上：缩略图置灰，悬浮卡里把原因原样说出来。 */
function MaterialTile({ mat, role, size, mark, why }: { mat: Mat; role: string; size: Size; mark?: string; why?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [hover, setHover] = useState(false); const [preview, setPreview] = useState(false)
  const lit = useCanvas((s) => s.hoverMat === mat.id)
  const enter = () => { clearTimeout(closeTimer.current); useCanvas.getState().setHoverMat(mat.id); clearTimeout(openTimer.current); openTimer.current = setTimeout(() => setHover(true), 300) }
  const leave = () => { clearTimeout(openTimer.current); closeTimer.current = setTimeout(() => { setHover(false); if (useCanvas.getState().hoverMat === mat.id) useCanvas.getState().setHoverMat(null) }, 180) }
  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); if (useCanvas.getState().hoverMat === mat.id) useCanvas.getState().setHoverMat(null) }, [mat.id])
  const ratio = useAspect(mat.thumb)
  const showPreview = () => { ref.current?.focus({ preventScroll: true }); clearTimeout(openTimer.current); clearTimeout(closeTimer.current); setHover(false); setPreview(true) }
  const dur = mat.kind === 'video' ? (mat.dur != null ? fmt(mat.dur) : '正在读取时长') : ''
  const info = `${role} · ${mat.name}${dur ? ' · ' + dur : ''}${why ? ' · ' + why : ''}`
  return <div className={`material-wrap ${size}`} onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}>
    <button ref={ref} className={`material-tile${lit ? ' lit' : ''}${why ? ' off' : ''}`} aria-label={info} onClick={showPreview}>
      {mat.thumb && <img src={mat.thumb} alt="" />}
      {/* 方块上只留两样：视频一个居中的播放三角，首尾帧一个角标。时长是文字，不该压在画面上 —— 交给悬浮卡和读屏 */}
      {mat.kind === 'video' && <span className="material-play" aria-hidden><IcPlay size={13} /></span>}
      {mark && <span className="material-mark">{mark}</span>}
    </button>
    {/* 悬浮放大就是那张画面本身：按真实比例铺开，没有卡片外框 —— 名字和原因写在画面自己的暗角上 */}
    {hover && !preview && <Overlay passive center label={info} anchor={ref} className="shot-pop" onClose={() => setHover(false)} onMouseEnter={() => { clearTimeout(closeTimer.current); useCanvas.getState().setHoverMat(mat.id) }} onMouseLeave={leave}>
      <button className="material-card-shot" style={shotBox(ratio)} onClick={showPreview} aria-label={`放大查看 ${mat.name}`}>
        {mat.thumb && <img src={mat.thumb} alt="" />}
        <span className="material-card-cue">{mat.kind === 'video' ? <IcPlay size={16} /> : <IcExpand size={15} sw={2} />}</span>
        <span className="material-card-meta"><strong>{mat.name}</strong>{dur && <span>{dur}</span>}
          {why && <small>{why}</small>}</span>
      </button>
    </Overlay>}
    {preview && <MediaPreview mat={mat} onClose={() => setPreview(false)} />}
  </div>
}
/** 空槽只做占位与引导，素材一律从画布连线进入。 */
function EmptySlot({ role, size, kind, required }: { role: string; size: Size; kind: '图片' | '视频' | '素材'; required?: boolean }) {
  const hint = `${required ? '必填' : '选填'} · 从画布连接${kind}节点后自动填入`
  return <div className={`material-wrap ${size}`}>
    <div className={`material-empty${required ? ' required' : ''}`} title={`${role}：${hint}`} aria-label={`${role}：${hint}`}>
      <span>{role}</span><small>连接节点</small>
    </div>
  </div>
}
/**
 * 标记参考图：每标一处就自动截下那一帧（标记画在上面），挂在源视频右边当参考素材。
 * 就这么摆着，不加描边也不写第几秒 —— 图上画着的红框自己就说清楚了它是怎么来的，
 * 再给它一套专属装饰，只是把一件一看就懂的事说第二遍。是哪一秒留给悬浮卡和读屏。
 * 还没画好的那一格先占着位置：位置一直在，图到了就填上，不会等一下才挤开旁边的东西。
 */
function ShotTile({ shot, name }: { shot: MarkShot; name?: string }) {
  if (!shot.url) return <div className="material-wrap reference">
    <div className="material-shot-wait" role="status" aria-label={`正在生成 ${timecode(shot.t)} 的标记参考图`}>
      <i className="spin" aria-hidden />
    </div>
  </div>
  return <MaterialTile size="reference" role="标记参考图（随标记自动生成）"
    mat={{ id: `mark-shot:${shot.key}`, name: `${name ? `${name} ` : ''}${timecode(shot.t)} 标记`, kind: 'image', src: shot.url, thumb: shot.url, grad: '' }} />
}
export default function MaterialRow({ nodeId, gen, get }: { nodeId: string; gen: GenState; get: MatGet }) {
  // 参考图完全由句子里还留着的那几处标记决定：删掉一枚标签，右边那张图跟着消失
  const edited = gen.mode === 'edit' && gen.slotEdit ? get(gen.slotEdit) : null
  const shots = useMarkShots(edited?.src, edited ? gen.marks : [])
  if (gen.mode === 'text') return null
  const tile = (id: string, role: string, size: Size, mark?: string) => {
    const mat = get(id)
    return mat ? <MaterialTile key={mat.id} mat={mat} role={role} size={size} mark={mark}
      why={matBlockedReason(mat, gen.mode, gen.model) || undefined} /> : null
  }
  const hasSource = gen.mode === 'edit' || gen.mode === 'extend'
  /**
   * 参考素材这一栏只在真有东西时才出现：只连了一个视频就进来编辑 / 延长的人，
   * 面板上该只有那一段视频 —— 空栏和分割线是等着被填的坑，没人要填就别挖。
   */
  /** 用不上的素材不在面板上占位，理由挂在 Tab 的悬浮说明里 */
  const refs = visibleRefs(gen.tray, gen.mode, gen.model, get)
  /** 「参考图」那个 Tab 只收图，名字跟着叫参考图 —— 空槽里说的也是去添加什么 */
  const refRole = gen.mode === 'refImage' ? '参考图' : '参考素材'
  const showRefs = !hasSource || refs.length > 0 || shots.length > 0
  const frames = [
    { zone: 'first', id: gen.slotFirst, role: '首帧', mark: '首' },
    { zone: 'last', id: gen.slotLast, role: '尾帧', mark: '尾' },
  ] as const
  return <div className="material-row nodrag nowheel">
    {gen.mode === 'frames' ? <div className="frame-lane">
      {/* 位次乘以一个步距，步距由 CSS 里的方块边长算出来 —— 方块改大小，这里不用跟着改 */}
      {frames.map((f, i) => <div key={f.id ?? f.zone} className="frame-pos" style={{ transform: `translateX(calc(var(--off) * ${i}))` }}>
        {f.id ? tile(f.id, f.role, 'frame', f.mark)
          : <EmptySlot role={f.role} size="frame" kind="图片" required={i === 0} />}
      </div>)}
      {/* 连接区整体可悬停：线上跑光点、交换键转 180°、顶上弹「互换一下」 */}
      <div className={`frame-link${gen.slotFirst && gen.slotLast ? ' on' : ''}`} data-tip="互换一下">
        <span className="frame-line" aria-hidden />
        {gen.slotFirst && gen.slotLast && <button className="frame-swap" aria-label="交换首尾帧"
          onClick={() => useGenerator.getState().swapFrames(nodeId)}><IcSwap size={13} /></button>}
      </div>
    </div> : <>
      {hasSource && <div className={`source-material${showRefs ? '' : ' solo'}`}>
        {gen.slotEdit ? tile(gen.slotEdit, gen.mode === 'edit' ? '这个视频用来编辑' : '这个视频用来延长', 'source')
          : <EmptySlot role="源视频" size="source" kind="视频" required />}
      </div>}
      {showRefs && <div className="reference-materials">
        {shots.map((s) => <ShotTile key={s.key} shot={s} name={edited?.name} />)}
        {refs.map((id) => tile(id, refRole, 'reference'))}
        {!refs.length && !shots.length && <EmptySlot role={refRole} size="reference"
          kind={gen.mode === 'refImage' ? '图片' : '素材'} required={isRef(gen.mode)} />}
      </div>}
    </>}
  </div>
}
