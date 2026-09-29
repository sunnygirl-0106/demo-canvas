import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { useCanvas } from '../store/canvas'
import { heldBy, useVersions, versionsOf, type VersionRecord } from '../store/versions'
import { MODEL_CAPABILITIES, fmt } from '../generator/materialLayout'
import type { TaskPayload } from '../generator/videoTask'
import { gradOf } from '../demo/assets'
import { IcArrowL, IcCheck, IcClose, IcCopy, IcOpenOut, IcPencil, IcPlusBox, IcTiles, IcToEnd, IcVideo, IcZoomIn } from '../ui/icons'
import Overlay from '../generator/Overlay'
import { useTip } from '../generator/useTip'
import MediaPreview from '../generator/MediaPreview'
import VersionShot from './VersionShot'

/**
 * 整只气泡的缩放。下面所有的数（和 app.css 里的 --vp-k）都是稿子上的原值，
 * 一个没换算过 —— 稿子按满幅画的，摆进画布里挂在一枚节点旁边就显得大，
 * 于是统一乘这一个数收一档。改这里就得同时改 app.css 里的 --vp-k，两边永远是同一个数。
 *
 * 图标大小是参数不是样式，跟不了 CSS 变量，所以在这儿乘一遍 ——
 * 少乘这一下，一行缩过的字旁边挂着一枚原号的图标，那一处就先漏了底。
 */
const K = 1
const ic = (n: number) => Math.round(n * K)

/** 版本号与月日时分都补足两位：一列数字左右跳动就排不成一列 */
const no2 = (n: number) => String(n).padStart(2, '0')

/** 便签和筛选是同一个词：这一版是怎么产出的 */
type Op = '生成' | '编辑' | '延长' | '上传'
const opOf = (r: VersionRecord): Op =>
  !r.payload ? '上传' : r.payload.mode === 'edit' ? '编辑' : r.payload.mode === 'extend' ? '延长' : '生成'
/** 今天的只写时分，其余写月日 */
const when = (t: number) => {
  const d = new Date(t), hm = `${no2(d.getHours())}:${no2(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString() ? `今天 ${hm}` : `${no2(d.getMonth() + 1)}-${no2(d.getDate())} ${hm}`
}
/** 画幅在提交那一刻就被锁成了 adaptive，读回来得还原成「随的是谁」 */
const ratioOf = (p: TaskPayload) =>
  p.params.ratio !== 'adaptive' ? p.params.ratio : p.mode === 'frames' ? '随首帧' : '随原片'
/**
 * 这一版最终多长，以它自己那段画面为准 —— 延长任务的 params.duration 说的是新增那一截，
 * 不是产出的总长，拿它当「时长」会把一条 13 秒的片子写成 5 秒。
 */
const durOf = (r: VersionRecord) =>
  r.media.dur != null && Number.isFinite(r.media.dur) ? fmt(r.media.dur)
    : r.payload ? fmt(r.payload.params.duration) : ''
/**
 * 参数区读什么。编辑 / 延长锁死的那几项已经在提交时定死，这里只负责把它们读回人话；
 * 没有配音开关的型号不摆「音频」那一行 —— 一栏恒为「无声」说的不是这次任务，是这个型号。
 */
const specsOf = (r: VersionRecord): [string, string][] => {
  if (!r.payload) return ([['时长', durOf(r)]] as [string, string][]).filter(([, v]) => v)
  const cap = MODEL_CAPABILITIES[r.payload.model]
  const rows: [string, string][] = [
    ['模型', cap.label], ['清晰度', r.payload.params.resolution],
    ['画幅', ratioOf(r.payload)], ['时长', durOf(r)],
  ]
  if (cap.hasAudioToggle) rows.push(['音频', r.payload.params.sound ? '有声' : '无声'])
  return rows.filter(([, v]) => v)
}

/**
 * 四档照原型：全部 / 本视频 / 编辑 / 延长 —— 后两档说的是别人拿我这幅画面做出来的东西。
 * 每档前面挂一枚图标：四个词都是两三个汉字，光排成一行得读完才分得开，
 * 一枚图形先把「这一档是干什么的」说了，眼睛扫过去就断得开。
 */
const TABS = [
  ['all', '全部', IcTiles], ['own', '本视频', IcVideo],
  ['edit', '编辑', IcPencil], ['extend', '延长', IcToEnd],
] as const

/**
 * 详情页那块屏多大：和画布上的节点同一条规矩 —— 按素材本来的比例摆，竖片是竖的、横片是横的。
 * 先按定宽算高，高顶到上限就反过来收宽。摆进一个写死的竖框里，一段横片只能取中间那一条，
 * 而这一页就是来看这一版长什么样的，裁掉两边等于把要看的东西裁了。
 * 两个数是两条独立的边界：竖片顶到高（9:16 摆出 223×396），横片顶到宽（16:9 摆出 430×242）。
 * 宽那一条给得比竖片宽出近一倍是有意的 —— 横片按竖片的宽度去摆只剩一条窄带，
 * 摆在半屏高的一栏里像掉了一块，而它和竖片一样是这一页的主角。
 * 气泡的宽度是照着这一条定的（见 app.css 里的 962）：430 的画面 + 20 的缝 + 466 的提示词框，
 * 右边那口井的宽度两种画幅下一样，换的只是左边那块屏占多少。
 */
const STILL_W = 430, STILL_H = 396
const stillBox = (ratio?: number) => {
  const r = ratio && ratio > 0 ? ratio : 9 / 16
  const h = STILL_W / r
  return h > STILL_H
    ? { width: `calc(${Math.round(STILL_H * r)}px * var(--vp-k))`, height: `calc(${STILL_H}px * var(--vp-k))` }
    : { width: `calc(${STILL_W}px * var(--vp-k))`, height: `calc(${Math.round(h)}px * var(--vp-k))` }
}

/**
 * 这个节点承载过的、以及直接从它派生出去的那一层版本，挂在节点侧边的一枚气泡里。
 *
 * 气泡内分两页：先是一屏卡片（这个节点做出过哪几幅画面），点进去才是那一版的细节。
 * 分页而不是「列表下面接一块详情」，是因为提示词是整段的话 —— 一段话垫在一屏卡片底下，
 * 卡片被挤到看不全，话也读不完整；一次只说一件事，两边都能摊开。
 *
 * 主操作不按 kind 分支，只问一句「这一版现在还挂在那个节点上吗」——
 * 挂着就带你过去看，被后来那次生成顶掉了就重新摆一个出来。
 */
export default function VersionsDialog({ nodeId, name, anchor, onClose }:
  { nodeId: string; name: string; anchor: RefObject<HTMLElement>; onClose: () => void }) {
  const records = useVersions((s) => s.records)
  const nodes = useCanvas((s) => s.nodes)
  /**
   * 来源那枚缩略图上的悬浮说明。走项目自己那套（useTip）而不是原生 title：
   * 原生的要等半秒才出、样式跟这块浮层不是一路，而这一句正是缩略图旁边没写出来的东西 ——
   * 裁成方块之后更认不出是哪一段，「是谁的第几版」得有地方问。
   */
  const { tip, node: tipNode } = useTip()
  const { setCenter, getZoom, getViewport, setViewport } = useReactFlow()
  /*
   * 画布的平移缩放。订它是为了把它交给气泡当「锚点动了」的信号（Overlay 的 track）——
   * 画布一动，节点就换了地方，而画布改的是一层 transform，既不滚动也不 resize，
   * 没有任何现成的事件可听。不订这一下，用户一拖画布，气泡就站在原地看着节点走开。
   */
  const transform = useStore((s) => s.transform)
  const [pick, setPick] = useState<(typeof TABS)[number][0]>('all')
  /**
   * 看过的记录 id，最后一个是当前这一页。点来源会跳到别的节点的那一版，所以这条路径
   * 不只在本节点的列表里走 —— 返回键因此写得出「回到哪儿」，而不是只有一个「返回」。
   */
  const [trail, setTrail] = useState<string[]>([])
  /**
   * 这一次换页是往里走还是往回走。只用来定入场的方向：往里走的内容从右边进来，
   * 往回走的从左边进来 —— 「深了一层」和「退回一层」于是分得开，
   * 不然两次换页长得一模一样，动效就只剩「有东西闪了一下」。
   */
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  /** 往里走一层：卡片进详情、详情里点来源再进另一版 —— 都是同一个方向 */
  const dive = (t: string[]) => { setDir('fwd'); setTrail(t) }
  /** 正在全屏看的那一版。气泡不关：看完大图退回来，还站在刚才那一页上 */
  const [zoomed, setZoomed] = useState<string | null>(null)
  /** 抄完那一下：按钮自己说一句「已复制」，一秒半后退回去 —— 不另弹一条 toast */
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])


  /**
   * 一版画面叫什么：产出它的那个节点当下叫什么，它就叫什么。节点被删了就退回记录里存着的那份旧名。
   * 名字只负责区分（编辑视频1、编辑视频2），版本号是同一条视频上的序数，两件事分开说。
   */
  const nameOf = (r: VersionRecord) => String(nodes.find((n) => n.id === r.nodeId)?.data.name ?? r.name) || '未命名'
  /** 指认某一版用的那个称呼：卡片、全屏、来源三处同一种写法，不各写一套 */
  const verOf = (r: VersionRecord) => `${nameOf(r)} · V${r.no}`

  // versionsOf 的结果本来就是时间先后，倒过来即新的在前
  const mine = versionsOf(records, nodeId)
  const own = mine.filter((r) => r.nodeId === nodeId).reverse()
  const der = mine.filter((r) => r.nodeId !== nodeId).reverse()
  const groups = { all: [...own, ...der], own, edit: der.filter((r) => opOf(r) === '编辑'), extend: der.filter((r) => opOf(r) === '延长') }
  const list = groups[pick]

  // 详情页认的是全体记录，不是本节点这一屏 —— 点来源会跳到别的节点的那一版
  const current = records.find((r) => r.id === trail[trail.length - 1]) ?? null
  const prev = records.find((r) => r.id === trail[trail.length - 2]) ?? null
  /** 当前这一版是从哪一版做出来的：来源节点当时那一版，不是它现在最新那一版 */
  const src = current && current.sourceNodeId
    ? records.find((r) => r.nodeId === current.sourceNodeId && r.no === current.baseNo) : undefined
  const big = records.find((r) => r.id === zoomed) ?? null
  /** 全屏那一层用的就是素材预览那套弹窗，所以把一版画面包成一份 Mat 交给它 */
  const bigMat = big && { id: big.id, name: `${nameOf(big)} · V${big.no}`, kind: 'video' as const,
    src: big.media.src, thumb: big.media.poster ?? '', dur: big.media.dur, grad: gradOf(big.id) }
  /*
   * 换页时外框的高度补一段过渡。
   *
   * 两页的高矮本来就不一样（详情页是写死的 528，一屏卡片一排还是两排差着两百多像素），
   * 直接换掉内容外框就是一跳 —— 里面的东西做了再细的入场，也先被这一跳盖过去了。
   * 所以旧高度留一手：换页那一帧量到新高度，就地从旧的补到新的，再把里面的分层入场摆进这段时间里，
   * 读起来是「这一页展开了」，而不是「换了一只气泡」。
   *
   * 认的是高度本身而不是「哪一页」：详情里点来源跳到另一版，两页都是 528，
   * 量出来一样高就不动 —— 一段补到自己的过渡，只会让内容白白停一下。
   */
  const pageRef = useRef<HTMLDivElement>(null)
  const page = current?.id ?? 'list'
  const seen = useRef<{ page: string; h: number }>()
  useLayoutEffect(() => {
    const el = pageRef.current
    if (!el) return
    const h = el.offsetHeight
    const was = seen.current
    seen.current = { page, h }
    if (!was || was.page === page || !was.h || was.h === h) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    /*
     * 补间这段时间里得自己把溢出夹住：内容是按新高度排好的，矮的那一头不夹就会漫到外框外面。
     * 夹法走一枚类名不走行内样式 —— 要夹的不止外框这一层：里面那栏（vp-body）是 overflow:auto 的，
     * 外框一矮它就发现自己装不下，当场支起一条滚动条，补间结束又收回去，一闪一闪的。
     */
    el.classList.add('vp-morph')
    const a = el.animate([{ height: `${was.h}px` }, { height: `${h}px` }],
      { duration: 300, easing: 'cubic-bezier(.2,.75,.2,1)' })
    /*
     * 收尾走两条腿：动画自己结束（或被取消）是一条，一条按时钟走的兜底是另一条 ——
     * 后台标签页里这只动画可能一直不兑现它的 finished，而夹住的那下溢出是会留下来的：
     * 等用户切回来，版本一多的那一屏就被外框齐刷刷裁掉，还没有滚动条可拉。
     *
     * 两条腿都不写进 effect 的清理函数：严格模式下 effect 连跑两遍（装上、拆掉、再装上），
     * 清理函数里一句 cancel 就把刚起头的这段掐了，而第二遍认出「还是这一页」直接返回 ——
     * 开发环境里这段补间于是一次都放不出来。元素随着换页被拆掉时动画自己会被取消，
     * 那一下同样落到下面这只 done 上，不必再另外挂一道。
     */
    const done = () => el.classList.remove('vp-morph')
    const timer = setTimeout(done, 380)
    void a.finished.then(() => { clearTimeout(timer); done() }, done)
  }, [page])
  /**
   * 卡片上不写字 —— 一屏卡片是用来「认出是哪一幅」的，每张下面垫一行小字，
   * 眼睛先读字后看图，这一屏就白摆了；版本号和时间进了详情页才说。
   * 读屏没有画面可认，所以那句话挂在按钮的 aria-label 上。
   */
  const cap = (r: VersionRecord) =>
    r.nodeId === nodeId ? `V${r.no} · ${when(r.createdAt)}` : verOf(r)
  const held = heldBy(records, nodeId)
  /**
   * 画面右上角那一小撮：静止时只有一枚便签（这一版读作生成 / 编辑 / 延长 / 上传），
   * 鼠标压上来，放大镜从它左边长出来 —— 两枚并排，同一套磨砂，读起来是一组，不是各贴各的。
   * 并排就不能各自定位：一个 flex 行摆在角上，宽度由里面那两枚自己说了算，
   * 便签换成「延长」也不会把放大镜挤歪。
   *
   * 左上角那枚「当前显示」只给列表页的卡片：它说的是「画布上现在挂的是这一版」，
   * 只可能落在本视频的某一版上；鼠标压上卡片时淡出，让路给那幅画面。
   */
  const corner = (r: VersionRecord, now = false) => <>
    {now && r.id === held?.id && <i className="vp-now"><b />当前显示</i>}
    <span className="vp-corner">
      <button className="vp-zoom" aria-label={`全屏查看 ${verOf(r)}`}
        onClick={(e) => { e.stopPropagation(); setZoomed(r.id) }}><IcZoomIn size={ic(14)} sw={1.6} /></button>
      <i className="vp-kind">{opOf(r)}</i>
    </span>
  </>

  const host = current ? nodes.find((n) => n.id === current.nodeId) : undefined
  // 「还在画布上吗」问的是「这个节点现在挂的是不是这一条记录」——
  // 不能比画面文件：演示里编辑产出复用原片，同一个节点的 V1、V2 的 src 一样，两版都会被当成在画布上
  const onCanvas = !!current && heldBy(records, current.nodeId)?.id === current.id

  const locate = () => {
    if (!host) return
    onClose()
    const canvas = useCanvas.getState()
    canvas.onNodesChange(canvas.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === host.id })))
    setCenter(host.position.x + (host.measured?.width ?? 320) / 2, host.position.y + (host.measured?.height ?? 220) / 2,
      { zoom: getZoom(), duration: 420 })
  }
  // 同一层的另一个版本，不是它的下游产物，所以不连线
  const add = () => {
    if (!host || !current) return
    onClose()
    useCanvas.getState().addNode('video', { x: host.position.x, y: host.position.y + 260 },
      { ...current.media, mediaReady: true })
  }

  /** 编辑任务的 reads 是这句提示词最终读作什么，比原始输入更接近「我当时要的是什么」 */
  const prompt = current?.payload?.reads || current?.payload?.prompt || ''
  /**
   * 抄走这段话。不走 navigator.clipboard —— 它在一部分环境里会卡在权限询问上，
   * 既不成也不败，按钮就永远停在「复制」两个字上，用户只当是点了没反应。
   * 一块离屏的 textarea 选中再 copy 是同步的：成没成当场就知道，没成就不改口。
   */
  const copy = () => {
    const ta = document.createElement('textarea')
    ta.value = prompt
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) setCopied(true)
  }

  /*
   * 气泡落不进视窗时挪画布，不是挪气泡：它得一直咬在节点右侧那道缝外边。
   * 收到差多少就把画布反向推多少 —— 节点跟着挪，两者的相对位置一动不动。
   * 不带 duration：画布要是滑着过去，气泡（已经按挪完的位置落好了）就会和节点脱开一路，
   * 看着像它飞过去等在那儿。一步到位，两边同一帧落定。
   */
  const shove = (dx: number, dy: number) => {
    const v = getViewport()
    setViewport({ ...v, x: v.x - dx, y: v.y - dy })
  }

  const shut = <button className="vp-x" aria-label="关闭全部版本" onClick={onClose}><IcClose size={ic(15)} sw={1.5} /></button>

  /* 靠上钉：气泡顶边和节点顶边齐平，往下长 —— 列表页越往下越长（版本一多就是两排），
     居中摆会把上半屏空出来、再把下半屏顶到视窗外。尖角落在节点中线上，指的还是它。 */
  /*
   * 全屏那一层是另一个 portal，落在这只气泡外面 —— 气泡的「点外面就关」是挂在 document 上的
   * 捕获期监听，大图里的 stopPropagation 拦不住它。所以全屏开着时这只气泡自己不接关闭：
   * 否则点一下大图，底下的气泡先关掉，挂在它里面的大图跟着一起消失。
   */
  return <>
  {bigMat && <MediaPreview mat={bigMat} onClose={() => setZoomed(null)} />}
  <Overlay side sideLock sideAlign="top" tailNear={ic(44)} onShift={shove} track={transform}
    anchor={anchor} className="versions-pop"
    label={current ? `全部版本 · V${current.no}` : `${name} · 全部版本`}
    onClose={() => { if (!zoomed) onClose() }}>
    {/*
      key 跟着「现在看的是哪一版」走：详情里点来源跳到另一版，React 认得这还是同一棵树，
      只把里面的字换掉 —— 入场动效是挂在元素身上的，不重挂一次就不会再放。
      重挂一次，那一版的画面和文字才跟着重新走一遍入场，和从卡片点进来是同一下。
    */}
    {current ? (
      <div className="vp-detail" key={current.id} ref={pageRef} data-dir={dir}>
        <header>
          {/*
            返回是一枚方底的箭头 + 一行落点的名字：箭头那块底说「这是能按的」，
            名字说「按下去回到哪儿」—— 不是一个光秃秃的「返回」。整条都点得中，
            不是只有那枚方块能点：一行字摆在按钮旁边却点不动，是最容易踩空的一种。
          */}
          <button className="vp-back" onClick={() => { setDir('back'); setTrail((t) => t.slice(0, -1)) }}>
            <i><IcArrowL size={ic(17)} sw={1.6} /></i>{prev ? nameOf(prev) : '全部版本'}</button>
          <div className="vp-acts">
            {/* 挂着它的那个节点已经被删了，两条路都无处可指，就不摆 */}
            {host && (onCanvas
              ? <button className="vp-link" onClick={locate}><IcOpenOut size={ic(15)} sw={1.5} />在画布中查看</button>
              : <button className="vp-link" onClick={add}><IcPlusBox size={ic(15)} sw={1.5} />添加到画布</button>)}
            {shut}
          </div>
        </header>
        <div className="vp-body">
          {/* 按原片比例摊开的一块屏（见 stillBox）：竖片是竖的，横片是横的。
              鼠标压上来就放，底边那条轴常驻 —— 这一页只有一块屏，不用像一屏卡片那样把轴收起来 */}
          <VersionShot className="vp-still" style={stillBox(host?.data.ratio)}
            media={current.media} grad={gradOf(current.id)} corner={corner(current)} />
          <div className="vp-info">
            {/*
              名字打头，后面跟着第几版、怎么来的、什么时候的 —— 一句话，四档深浅：
              名字最实，版本号进一枚小方牌（它是个编号，不是一个词），出身和时间退到说明那一档。
              原来这四样摆成两行（眉批压在名字上方），可它们说的是同一件事的四个侧面，
              分了两行就得读两遍才拼得回来。
              来源跟在最后说完：「基于〔缩略图〕修改」—— 一枚缩略图比一串「视频节点1 · V2」
              更快认出是拿哪一幅改的；读不出是哪一版也没关系，点进去那一页自己会写。
              nameOf 读节点当下的名字，原视频改名后读屏那句跟着改口，指向的那一版（baseNo）不变。
            */}
            <p className="vp-rel">
              <strong>{nameOf(current)}</strong>
              <b>V{current.no}</b><em>{opOf(current)}</em><i>·</i><span>{when(current.createdAt)}</span>
              {src && <span className="vp-srcline">基于
                <button className="vp-src" {...tip(`查看来源 ${verOf(src)}`)}
                  aria-label={`查看来源 ${verOf(src)}`}
                  onClick={() => dive([...trail, src.id])}>
                  <img src={src.media.poster} alt="" />
                </button>
                {opOf(current) === '延长' ? '延长' : '修改'}</span>}
            </p>
            {/*
              提示词是一口常驻的井：一道边、一块比浮层更深的底，界线自己说清楚「话到哪儿为止」。
              原先那块底只在鼠标压上来时才浮出，于是静止态里这段话飘在半空，
              和底下那排参数之间没有任何分界 —— 而这一页最要紧的就是「这段话是那一版的输入」。
              没写提示词的那一版也照样摆这口井，只是里面换成一句说明：框在，页就不会忽高忽低。
            */}
            <div className="vp-pbox">
              <p className="vp-label">提示词
                {/* 只在压上这一块时露出来：静止态这一页上该只有画面和那段话 */}
                {prompt && <button className="vp-copy" onClick={copy}>
                  {copied ? <IcCheck size={ic(12)} sw={2} /> : <IcCopy size={ic(12)} sw={1.7} />}
                  {copied ? '已复制' : '复制'}</button>}
              </p>
              {prompt
                ? <p className="vp-prompt">{prompt}</p>
                : <p className="vp-blank">{current.payload ? '本次未填写提示词' : '画布原视频，无生成记录'}</p>}
            </div>
            {/*
              参数沉在最底下，一项一枚小牌子：原先是三栏对齐的表格，
              「模型」和「Seedance 2.5」左右分站两头，中间那段空白要眼睛自己搭过去。
              一枚牌子里键和值贴着站，扫过去是五个独立的小块，不是一张要对行的表。
              上面不再压一行「参数」：每枚牌子自己就带着键（模型 / 清晰度 / 时长），
              再挂一个总名等于把同一件事说两遍，还多占一行。
            */}
            <div className="vp-specs">
              {specsOf(current).map(([k, v]) => <span key={k}><i>{k}</i><b>{v}</b></span>)}
            </div>
            {tipNode}
          </div>
        </div>
      </div>
    ) : (
      <div className="vp-list" ref={pageRef} data-dir={dir}>
        <header>
          {/*
            标题和名字并排站一行：「全部版本」是这块浮层的名字（实心、最响），
            「小猫咪」是它在说哪一条视频（退一档、跟在后面）—— 两件事同属一句话，
            上下摞成两行反而把它们读成了两个层级。名字在这儿说一次，卡片里就不再重复。
          */}
          <h3 className="vp-head"><strong>全部版本</strong><span>{name}</span></h3>
          {shut}
        </header>
        {/*
          四档单起一行，左对齐顶在卡片那一列的左边线上 —— 它是一屏卡片的开关，
          不是标题右边的附属品；跟着标题挤在同一行里，名字一长就先被挤没了。
          一条都没有的那一档点不了：点进去是一片没有解释的空白，不如灰着。
        */}
        <div className="vp-filters" role="group" aria-label="按类型筛选">
          {TABS.map(([k, label, Ic]) => {
            const empty = !groups[k].length
            // 置灰用 aria-disabled 而不是 disabled：后者拿不到焦点，读屏就听不见这一档还在、只是空着
            return <button key={k} className={pick === k ? 'selected' : ''} aria-pressed={pick === k}
              aria-disabled={empty || undefined} onClick={() => { if (!empty) { setDir('fwd'); setPick(k) } }}>
              <Ic size={ic(20)} sw={1.8} />{label}<b>{groups[k].length}</b></button>
          })}
        </div>
        {/* key 跟着档位走：换一档卡片就重新落一次 —— 四档点起来才有「这一屏换了」的回应，
            而不是底下那几张图默默替换掉（版本一多，两档之间差的只是少了几张，不动一下根本看不出换了没） */}
        <div className="vp-grid" key={pick}>
          {/*
            放大镜是卡片上的第二件事，不能套在那枚大按钮里（按钮不能嵌按钮）——
            所以卡片这层退成一个壳，「进详情」那枚按钮和它并排住在里面。
          */}
          {list.map((r) => <VersionShot key={r.id} className="vp-card" media={r.media} grad={gradOf(r.id)}
            corner={corner(r, true)}
            wrap={(shot) => <button className="vp-open" aria-label={`${cap(r)}，${opOf(r)}`}
              onClick={() => dive([r.id])}>{shot}</button>} />)}
          {!list.length && <p className="vp-blank">暂无版本记录</p>}
        </div>
      </div>
    )}
  </Overlay>
  </>
}
