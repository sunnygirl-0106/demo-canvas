import { useRef, useState } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { useCanvas } from '../store/canvas'
import { matOf } from '../demo/assets'
import { useTip } from '../generator/useTip'
import Overlay from '../generator/Overlay'
import MediaPreview from '../generator/MediaPreview'

/** 和视频工具栏同一个数：让开节点名那一行（.nd-head）再留口气，理由见 VideoToolbar 的 HEAD_CLEAR */
const HEAD_CLEAR = 24 + 8

/**
 * 图片节点上方的工具栏，照「图片节点工具栏 · v3」那版排：
 * 前八件带文字（常用的改图动作），竖线后六件只给图标、悬浮才说名字（顺手的事）。
 * 洗图、工具箱、宫格切分三件带一个下拉，开着的时候那一枚亮着、小箭头翻过来。
 *
 * 外壳、hover、按下、亮起来那一下全借视频工具栏的 .vtool —— 两种节点头上那条是同一样东西，
 * 不该一条软软地涨出来、另一条唰地变色。
 */
const I = {
  reverse: 'M10 4h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9z M14 8H4 M7 5L4 8l3 3 M4 16h16 M4 20h10',
  cut: 'M6 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M20 4 8.12 15.88 M14.47 14.48 20 20 M8.12 8.12 12 12',
  erase: 'M7 21l-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21 M22 21H7 M5 11l9 9',
  brush: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08 M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
  sparkles: 'M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z M20 3v4 M22 5h-4',
  globe: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20 M2 12h20',
  toolbox: 'M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M2 13h20 M8 11.5v3 M16 11.5v3',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2',
  grid: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  rotate: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5',
  note: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.38 2.63a1 1 0 0 1 3 3l-9.01 9.01a2 2 0 0 1-.85.51l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .51-.85z',
  dl: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  eye: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0 M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  cam: 'M16 13l5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5 M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  book: 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  film: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M7 3v18 M17 3v18 M3 7.5h4 M3 12h18 M3 16.5h4 M17 7.5h4 M17 16.5h4',
  panels: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 9h18 M9 21V9',
  clapper: 'M20.2 6L3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z M6.2 5.3l3.1 3.9 M12.4 3.4l3.1 4 M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  face: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  idcard: 'M16 10h2 M16 14h2 M6.17 15a3 3 0 0 1 5.66 0 M9 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  mountain: 'M8 3l4 8 5-5 5 15H2L8 3z',
  pkg: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z M12 22V12 M3.29 7L12 12l8.71-5 M7.5 4.27l9 5.15',
  sliders: 'M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4',
  aperture: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M14.31 8l5.74 9.94 M9.69 8h11.48 M7.38 12l5.74-9.94 M9.69 16L3.95 6.06 M14.31 16H2.83 M16.62 12l-5.74 9.94',
  history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 7a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21',
  box3d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7l8.7 5 8.7-5 M12 22V12',
  chev: 'M6 9l6 6 6-6',
  chevR: 'M9 6l6 6-6 6',
}

const Ic = ({ d, size = 17, sw = 1.6 }: { d: string; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)

type Menu = 'wash' | 'box' | 'grid'

const WASH = [
  { label: '通用洗图', d: I.image },
  { label: '白模动漫洗图', d: I.box3d },
  { label: '法线人物洗图', d: I.user },
]
const BOX: { title: string; items: { label: string; d: string; beta?: boolean }[] }[] = [
  { title: '分镜', items: [
    { label: '多机位九宫格', d: I.cam }, { label: '剧情推演九宫格', d: I.book },
    { label: '25宫格连贯分镜', d: I.film, beta: true }, { label: '故事板', d: I.panels },
    { label: '调度故事板', d: I.clapper }] },
  { title: '设定图', items: [
    { label: '角色三视图生成', d: I.user }, { label: '人脸三视图', d: I.face },
    { label: '角色设定图', d: I.idcard }, { label: '场景设定图', d: I.mountain },
    { label: '产品设定图', d: I.pkg }] },
  { title: '画质光影', items: [
    { label: '人像质感调节', d: I.sliders }, { label: '电影级光影校正', d: I.aperture }] },
]
/** 按时间轴排：往前推的在左，往后推的在右 */
const INFER = ['10秒前', '5秒前', '3秒后', '15秒后']
const GRID = ['2×2', '3×3', '4×4', '5×5']

export default function ImageToolbar({ nodeId, visible, src, name }: {
  nodeId: string; visible: boolean; src?: string; name: string
}) {
  const { tip, node: tipNode } = useTip()
  const [open, setOpen] = useState<Menu | null>(null)
  const [preview, setPreview] = useState(false)
  const self = useCanvas((s) => s.nodes.find((n) => n.id === nodeId))
  const mat = matOf(self)
  const anchors = { wash: useRef<HTMLButtonElement>(null), box: useRef<HTMLButtonElement>(null), grid: useRef<HTMLButtonElement>(null) }
  const close = () => setOpen(null)
  // 这一版只把入口摆齐，各项功能的落地另起：点了先把菜单收起来，不留一个开着的下拉在那儿等
  const pick = () => close()

  /** 带文字的那几件；带 menu 的多一枚小箭头，开着时翻过来 */
  const labeled = (label: string, d: string, menu?: Menu) => (
    <button ref={menu ? anchors[menu] : undefined} aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open === menu : undefined}
      onClick={() => menu ? setOpen(open === menu ? null : menu) : pick()}>
      <Ic d={d} />{label}
      {menu && <i className="itool-caret"><Ic d={I.chev} size={11} sw={2} /></i>}
    </button>
  )
  /** 只有图标的那几件：名字挂在悬浮说明上，下拉开着时不说（说明会压在菜单上） */
  const iconOnly = (label: string, d: string, menu?: Menu) => (
    <button ref={menu ? anchors[menu] : undefined} className={'ic' + (menu ? ' has-menu' : '')} aria-label={label}
      aria-haspopup={menu ? 'menu' : undefined} aria-expanded={menu ? open === menu : undefined}
      {...tip(menu && open === menu ? undefined : label)}
      onClick={() => menu ? setOpen(open === menu ? null : menu) : pick()}>
      <Ic d={d} />
      {menu && <i className="itool-caret"><Ic d={I.chev} size={11} sw={2} /></i>}
    </button>
  )

  return <NodeToolbar isVisible={visible} position={Position.Top} offset={HEAD_CLEAR}><div className="vtool-ring nodrag"><div className="vtool itool">
    {labeled('反推', I.reverse)}
    {labeled('抠图', I.cut)}
    {labeled('擦除', I.erase)}
    {labeled('重绘', I.brush)}
    {labeled('打光', I.sun)}
    {labeled('洗图', I.sparkles, 'wash')}
    {labeled('720全景', I.globe)}
    {labeled('工具箱', I.toolbox, 'box')}
    <span className="itool-sep" aria-hidden />
    {iconOnly('裁剪', I.crop)}
    {iconOnly('宫格切分', I.grid, 'grid')}
    {iconOnly('旋转镜像', I.rotate)}
    {iconOnly('标注', I.note)}
    <a className="ic" href={src} download={name} aria-label="下载" {...tip('下载')}><Ic d={I.dl} /></a>
    <button className="ic" aria-label="预览" {...tip('预览')} onClick={() => setPreview(true)}><Ic d={I.eye} /></button>
    {tipNode}

    {open === 'wash' && <Overlay label="洗图" below anchor={anchors.wash} className="vhud-menu itool-menu" onClose={close}>
      {WASH.map((m) => <button key={m.label} onClick={pick}><Ic d={m.d} size={15} />{m.label}</button>)}
    </Overlay>}
    {open === 'grid' && <Overlay label="宫格切分" below anchor={anchors.grid} className="vhud-menu itool-menu" onClose={close}>
      {GRID.map((g) => <button key={g} onClick={pick}>{g}</button>)}
      <button onClick={pick}>自定义<span className="itool-more"><Ic d={I.chevR} size={12} sw={2} /></span></button>
    </Overlay>}
    {open === 'box' && <Overlay label="工具箱" below anchor={anchors.box} className="itool-box" onClose={close}>
      {BOX.map((g) => <section key={g.title}>
        <h4>{g.title}</h4>
        <div className="itool-box-grid">
          {g.items.map((m) => <button key={m.label} onClick={pick}>
            <span className="itool-tile"><Ic d={m.d} size={15} /></span>{m.label}
            {m.beta && <em className="itool-beta">beta</em>}
          </button>)}
        </div>
      </section>)}
      <section>
        <h4>画面推演</h4>
        <div className="itool-infer">
          <span className="itool-tile"><Ic d={I.history} size={15} /></span>
          {INFER.map((t) => <button key={t} onClick={pick}>{t}</button>)}
        </div>
      </section>
    </Overlay>}
    {preview && mat && <MediaPreview mat={mat} onClose={() => setPreview(false)} />}
  </div></div></NodeToolbar>
}
