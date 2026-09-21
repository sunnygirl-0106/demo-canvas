import { useState, type RefObject } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvas } from '../store/canvas'
import { readsAs, useVersions, versionsOf, type VersionRecord, type VersionRead } from '../store/versions'
import { MODEL_CAPABILITIES, fmt } from '../generator/materialLayout'
import type { TaskPayload } from '../generator/videoTask'
import { gradOf } from '../demo/assets'
import { IcArrowL, IcClose, IcOpenOut, IcPlusBox } from '../ui/icons'
import Overlay from '../generator/Overlay'

/**
 * 图标大小是参数不是样式，跟不了 CSS 里那个 --vp-k，所以在这儿把稿子上的号数乘同一个 1.3：
 * 少乘这一下，一行放大过的字旁边挂着一枚原号的图标，那一处就先漏了底。
 */
const K = 1.05
const ic = (n: number) => Math.round(n * K)

/** 卡片副标题和筛选是同一个词：这一版在这张列表里读作什么（readsAs） */
const READ: Record<VersionRead, string> = { generate: '生成', edit: '编辑', extend: '延长' }
const FILTERS: { k: VersionRead | 'all'; label: string }[] = [
  { k: 'all', label: '全部' }, { k: 'generate', label: '生成' },
  { k: 'edit', label: '编辑' }, { k: 'extend', label: '延长' },
]
/** 版本号与月日时分都补足两位：一列数字左右跳动就排不成一列 */
const no2 = (n: number) => String(n).padStart(2, '0')
const stamp = (t: number) => {
  const d = new Date(t)
  return `${no2(d.getMonth() + 1)}-${no2(d.getDate())} ${no2(d.getHours())}:${no2(d.getMinutes())}`
}
const rel = (r: VersionRecord) => (r.baseNo == null ? '原视频' : `基于 版本 ${no2(r.baseNo)}`)
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
  if (!r.payload) return ([['来源', '原视频'], ['时长', durOf(r)]] as [string, string][]).filter(([, v]) => v)
  const cap = MODEL_CAPABILITIES[r.payload.model]
  const rows: [string, string][] = [
    ['模型', cap.label], ['清晰度', r.payload.params.resolution],
    ['画幅', ratioOf(r.payload)], ['时长', durOf(r)],
  ]
  if (cap.hasAudioToggle) rows.push(['音频', r.payload.params.sound ? '有声' : '无声'])
  return rows.filter(([, v]) => v)
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
  const { setCenter, getZoom } = useReactFlow()
  /**
   * 默认落在「生成」：打开一个节点的历史，先问的是「我这个节点做出来过哪几幅画面」——
   * 从上游「局部修改」长出来的节点也一样，名字叫什么不改变这一档。
   * 它自己还没产出过（刚长出来的空节点）才退回「全部」，不让默认停在一片空白上。
   */
  const [pick, setPick] = useState<VersionRead | 'all'>(() =>
    versionsOf(useVersions.getState().records, nodeId).some((r) => readsAs(r, nodeId) === 'generate') ? 'generate' : 'all')
  const [picked, setPicked] = useState<string | null>(null)

  const all = [...versionsOf(records, nodeId)].sort((a, b) => a.no - b.no)
  const list = pick === 'all' ? all : all.filter((r) => readsAs(r, nodeId) === pick)
  // 详情页是自己的一屏，筛选那排在它上面看不见 —— 所以认的是全集，不是当前这一屏
  const current = all.find((r) => r.id === picked) ?? null

  const host = current ? nodes.find((n) => n.id === current.nodeId) : undefined
  const onCanvas = !!host && !!current && host.data.src === current.media.src

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

  const shut = <button className="vp-x" aria-label="关闭版本记录" onClick={onClose}><IcClose size={ic(14)} sw={1.5} /></button>

  /* 靠上钉：气泡顶边和节点顶边齐平，往下长 —— 列表页越往下越长（版本一多就是两排），
     居中摆会把上半屏空出来、再把下半屏顶到视窗外。尖角落在节点中线上，指的还是它。 */
  return <Overlay side sideAlign="top" anchor={anchor} className="versions-pop"
    label={current ? `版本记录 · 版本 ${no2(current.no)}` : `${name} · 版本记录 ${all.length}`} onClose={onClose}>
    {current ? (
      <div className="vp-detail">
        <header>
          {/* 返回处写的是上一页的名字，不是一个光秃秃的「返回」：点下去落到哪儿，字面上就说清 */}
          <button className="vp-back" onClick={() => setPicked(null)}><IcArrowL size={ic(15)} sw={1.5} />版本记录</button>
          <div className="vp-acts">
            {/*
              主操作不再是一枚实心青块。这一屏上真正的主角是那幅画面和那段提示词，
              摆一块高饱和的色块在右上角，眼睛先落在按钮上；一行带下划线的字同样点得中，
              却不抢走这一屏的落点。挂着它的那个节点已经被删了，两条路都无处可指，就不摆。
            */}
            {host && (onCanvas
              ? <button className="vp-link" onClick={locate}><IcOpenOut size={ic(15)} sw={1.4} />在画布中查看</button>
              : <button className="vp-link" onClick={add}><IcPlusBox size={ic(15)} sw={1.4} />添加到画布</button>)}
            {shut}
          </div>
        </header>
        <div className="vp-body">
          {/* 200×340 的一块竖版位置，画面裁进去（照设计稿）：竖片正好，横片只取中间那一条 */}
          <span className="vp-still" style={{ background: gradOf(current.id) }}>
            {current.media.poster && <img src={current.media.poster} alt="" />}
          </span>
          <div className="vp-info">
            <div className="vp-title">
              <strong>版本 {no2(current.no)}</strong>
              {/* 分类不再是一枚着色的标签：一圈细描边说清它是哪一档就够，颜色留给真正要人动手的地方 */}
              <em>{READ[readsAs(current, nodeId)]}</em>
            </div>
            <p className="vp-rel">{rel(current)}{current.payload ? ` · 生成于 ${stamp(current.createdAt)}` : ''}</p>
            {/* 编辑任务的 reads 是这句提示词最终读作什么，比原始输入更接近「我当时要的是什么」 */}
            {current.payload?.reads || current.payload?.prompt ? <>
              <p className="vp-label">提示词</p>
              <p className="vp-prompt">{current.payload.reads || current.payload.prompt}</p>
            </> : <p className="vp-blank">{current.payload ? '这一次没有写提示词' : '直接带进画布的原视频，没有生成记录'}</p>}
            {/* 参数沉到底边：它是查证用的，不该横在提示词和画面之间 */}
            <div className="vp-fill" />
            <div className="vp-specs">
              {specsOf(current).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="vp-list">
        <header>
          <div><strong>版本记录</strong><span>{name} · {all.length} 个版本</span></div>
          {shut}
        </header>
        {/* 一条都没有的那一档点不了：点进去是一片没有解释的空白，不如灰着 */}
        <div className="vp-filters" role="group" aria-label="按类型筛选">
          {FILTERS.map((f) => {
            const empty = f.k !== 'all' && !all.some((r) => readsAs(r, nodeId) === f.k)
            // 置灰用 aria-disabled 而不是 disabled：后者拿不到焦点，读屏就听不见这一档还在、只是空着
            return <button key={f.k} className={pick === f.k ? 'selected' : ''} aria-pressed={pick === f.k}
              aria-disabled={empty || undefined} onClick={() => { if (!empty) setPick(f.k) }}>{f.label}</button>
          })}
        </div>
        <div className="vp-grid">
          {list.map((r) => <button key={r.id} className="vp-card" onClick={() => setPicked(r.id)}>
            <span className="vp-shot" style={{ background: gradOf(r.id) }}>
              {r.media.poster && <img src={r.media.poster} alt="" />}
              {durOf(r) && <em>{durOf(r)}</em>}
            </span>
            <strong>版本 {no2(r.no)}</strong>
            <small>{READ[readsAs(r, nodeId)]} · {rel(r)}</small>
          </button>)}
          {!list.length && <p className="vp-blank">这个节点还没有任何一版画面</p>}
        </div>
      </div>
    )}
  </Overlay>
}
