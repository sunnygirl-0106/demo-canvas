import { useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { fmt, type Mat } from './materialLayout'
import { docText } from './promptDoc'
import { IcChev } from '../ui/icons'
import { useFrame } from './markFrame'
/** 原片摊成一条胶片：每格取自己那一段的中点，比一块写着「原片 8s」的牌子更像一段有长度的片子 */
const FRAMES = 6
function ClipFrame({ mat, t }: { mat: Mat; t: number }) {
  return <img src={useFrame(mat.src, t, mat.thumb)} alt="" />
}
/**
 * 延长那半截：一条横轴，中间是原片，左右两块是可点的延长区。
 *
 * 一整条只说一件事 ——「新增的是接在原片哪一头的哪一截」：两头都是定宽的小口，
 * 没选中的那头是虚线、只摆一枚朝外的角标 + 方向，选中的那头描实、底下补一行「+5s」。
 * 宽度不跟着秒数走 —— 轴上大半的地方要留给原片那几格缩略图，那才是这条轴上唯一有画面的东西；
 * 一截 30 秒的新增能把 5 秒的原片挤成一条缝，而「有多长」那一行字自己已经说清楚了。
 * 秒数档也不摆在这条轴上：它是参数，归参数设置那一栏。
 *
 * 方向也不在面板里再出现一次 —— 同一个开关摆两处，用户会以为是两件事。
 * 出片那一刻专注态结束，这条轴整块消失：产出就是一段完整的视频，
 * 节点上再留着「原片 + 新增的那一截」只是把已经做完的事又摆了一遍。
 */
export default function ExtendTrack({ nodeId }: { nodeId: string }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const source = matOf(nodes.find((n) => n.id === gen?.slotEdit))
  if (!gen || !source) return null
  const secs = gen.params.duration
  const clip = source.dur ?? 0
  /**
   * 换方向要把整句重念一遍存回去：句子里那枚标签渲染时读的是当前 direction / duration，
   * 屏幕上当场就变了，但 prompt 是存着的一份字符串 —— 不在这里重算，
   * 提交上去的任务记录里写的还是上一次那句。
   */
  const setDirection = (direction: 'before' | 'after') => {
    if (direction === gen.direction) return
    useGenerator.getState().patch(nodeId, {
      direction, prompt: docText(gen.doc, { name: source.name, direction, duration: secs }),
    })
  }
  /** 选中那一侧描实、宽一点摆得下「+5s」，另一侧留一个虚线窄口：一眼看得出接的是哪一头 */
  const side = (dir: 'before' | 'after') => {
    const on = gen.direction === dir
    const label = dir === 'before' ? '向前' : '向后'
    return <button className={`ext-side${on ? ' on' : ''}`} aria-pressed={on}
      aria-label={`${label}延长 ${secs}s：新增片段接在原视频之${dir === 'before' ? '前' : '后'}`}
      style={{ flexBasis: on ? 92 : 56 }}
      onClick={() => setDirection(dir)}>
      {on ? <><span>{label}</span><b>+{fmt(secs)}</b></>
        : <><IcChev size={13} sw={1.8} style={{ transform: `rotate(${dir === 'before' ? 90 : -90}deg)` }} /><span>{label}</span></>}
    </button>
  }
  return <div className="nd-board ext-board nodrag nowheel">
    <div className="ext-axis" role="group" aria-label="延长方向与新增片段长度">
      {side('before')}
      {/* 原片摊成一条胶片，末尾挂着自己的时长：它是一段有长度的片子，不是一块写着秒数的牌子 */}
      <span className="ext-clip" aria-label={`原片 ${fmt(clip)}`} style={{ flexGrow: 1, flexBasis: 0 }}>
        <span className="ext-frames" aria-hidden="true">
          {Array.from({ length: FRAMES }, (_, i) => <ClipFrame key={i} mat={source} t={(i + 0.5) / FRAMES * clip} />)}
        </span>
        <i>原片</i><b>{fmt(clip)}</b>
      </span>
      {side('after')}
    </div>
  </div>
}
