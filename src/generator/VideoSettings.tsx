import { Fragment, useRef, useState } from 'react'
import { useGenerator, type GenState } from '../store/generator'
import { MODEL_CAPABILITIES, MODELS, locksDuration, locksRatio, type Mat, type MatGet, type Model, type ModelCap } from './materialLayout'
import { modelBlockedReason, modelNote } from './videoTask'
import Overlay from './Overlay'
import { IcCheck, IcChev, IcClose, IcSeedance, IcSpeaker, IcWan, IcKling } from '../ui/icons'
import { useTip } from './useTip'
import { docText } from './promptDoc'

/** 这个型号收什么。一整类都不收的说「只收图片」，不说「最多 0 段视频」—— 和素材、Tab 那两处一个说法。 */
const intake = (c: ModelCap) => c.quota.video ? `最多 ${c.quota.video} 段视频` : c.quota.image ? '只收图片' : '不收素材'
const getModelIcon = (model: Model) => {
  if (model.startsWith('sd')) return <IcSeedance size={18} />
  if (model.startsWith('wan')) return <IcWan size={18} />
  if (model.startsWith('kling')) return <IcKling size={18} />
  return null
}
/**
 * 这个型号的取值域，列表里常驻的那行小字：出多长、多清楚、收几段。三样占一行，不折行。
 * 「不支持编辑与延长 / 不响应范围」这两句缺陷不进这一行 —— 它们让一半型号的小字长到要折两行，
 * 一列十一行高低不齐，反倒谁都看不清；改挂在悬浮说明上（limitNote），真要选到它时才说。
 */
const specLine = (c: ModelCap) =>
  `${c.durationRange[0]}–${c.durationRange[1]}s · ${c.resolutions.join('/')} · ${intake(c)}`
/** 这个型号做不了的事。列表里不占位置，悬浮到它身上才说。 */
const limitNote = (c: ModelCap) => [
  c.genModes.includes('edit') ? '' : '不支持编辑与延长',
  c.timestamp ? '' : '不响应范围',
].filter(Boolean).join(' · ')
/** Seedance 是自家的一串型号，排在最前；一条细线之后才是别家的。 */
const isSeedance = (model: Model) => model.startsWith('sd')
/**
 * 比例那一排每个选项前的小方框：框本身就是那个画幅。
 * 「16:9」四个字要在脑子里换算成一块横屏，画出来就不必换算了 —— 长边定死 17px，
 * 短边按比例收，一排看过去是从扁到方到竖的一串形状。
 */
const RatioGlyph = ({ ratio }: { ratio: string }) => {
  const [w, h] = ratio.split(':').map(Number)
  const long = 17, short = Math.round((long * Math.min(w, h)) / Math.max(w, h))
  const [bw, bh] = w >= h ? [long, short] : [short, long]
  return <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
    <rect x={(18 - bw) / 2} y={(18 - bh) / 2} width={bw} height={bh} rx="2.5"
      fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
}
/** 专注态锁死 Seedance 2.5，模型那颗按钮点不开；说法和入口放行的那条规则是同一条。 */
const FOCUS_MODEL_TIP = '编辑 / 延长固定使用 Seedance 2.5'
export default function VideoSettings({ nodeId, gen, source, get, focus }: { nodeId: string; gen: GenState; source: Mat | null; get: MatGet; focus: boolean }) {
  const modelButton = useRef<HTMLButtonElement>(null); const paramButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<'model' | 'params' | null>(null)
  /** 灰掉的型号为什么选不了、选得了的换过去会变什么样，悬浮 / 聚焦就说，不用用户自己猜 */
  const { tip, node: tipNode } = useTip(true)
  const cap = MODEL_CAPABILITIES[gen.model]
  /** 锁定是 Seedance 2.5 才有的机制；2.0 系列不锁，比例照常可选。 */
  const ratioLocked = locksRatio(gen.mode, gen.model)
  const durLocked = locksDuration(gen.mode)
  const ratio = ratioLocked ? (gen.mode === 'frames' ? '随首帧' : '随原片') : gen.params.ratio
  const duration = durLocked ? (source?.dur != null ? `${Number(source.dur.toFixed(1))}s` : '随原片') : `${gen.params.duration}s`
  const durLabel = gen.mode === 'extend' ? '新增片段时长' : '时长'
  /** 锁死时这一节只剩标题行，所以「跟着原片走」这句得由它自己说完，不能只剩一个秒数。 */
  const durValue = durLocked && duration !== '随原片' ? `随原片 · ${duration}` : duration
  /**
   * 改完参数把整句重念一遍存回去：句子里「向后延长 5s」那枚标签渲染时读的是当前 duration，
   * 屏幕上当场就变了，但 prompt 是存着的一份字符串 —— 不在这里重算，
   * 提交上去的任务记录里写的还是改之前那句。新增片段时长只在这一栏改，所以只有这一处要管。
   */
  const patch = (p: Partial<GenState['params']>) => {
    const params = { ...gen.params, ...p }
    useGenerator.getState().patch(nodeId, {
      params, prompt: docText(gen.doc, { name: source?.name, direction: gen.direction, duration: params.duration }),
    })
  }
  return <>
    {tipNode}
    <button ref={modelButton} className="setting-trigger model-trigger" aria-disabled={focus || undefined}
      aria-label={focus ? `${cap.label}：${FOCUS_MODEL_TIP}` : undefined} {...tip(focus ? FOCUS_MODEL_TIP : undefined)}
      onClick={() => { if (!focus) setOpen(open === 'model' ? null : 'model') }} aria-expanded={open === 'model'}>
      <i className="model-dot" />{cap.label}<IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    <button ref={paramButton} className="setting-trigger" aria-label={`参数设置：${gen.params.resolution} · ${duration} · ${ratio}${cap.hasAudioToggle ? ` · ${gen.params.sound ? '有声' : '无声'}` : ''}`} aria-expanded={open === 'params'} onClick={() => setOpen(open === 'params' ? null : 'params')}>
      {gen.params.resolution}<i className="sep">·</i>{duration}<i className="sep">·</i>{ratio}
      {cap.hasAudioToggle && <><i className="sep">·</i><em>{gen.params.sound ? '有声' : '无声'}</em></>}<IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    {open === 'model' && <Overlay anchor={modelButton} label="选择模型" className="model-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">选择模型
        <button aria-label="关闭模型选择" onClick={() => setOpen(null)}><IcClose size={15} sw={1.7} /></button></div>
      {MODELS.map((model, i) => {
        const c = MODEL_CAPABILITIES[model]
        const blocked = modelBlockedReason(gen, model, get)
        const why = blocked || modelNote(gen, model, get) || limitNote(c)
        const on = gen.model === model
        return <Fragment key={model}>
          {i > 0 && isSeedance(MODELS[i - 1]) && !isSeedance(model) && <i className="model-split" />}
          <button className={`model-option${on ? ' selected' : ''}`} aria-disabled={!!blocked}
            aria-label={why ? `${c.label}：${why}` : c.label} {...tip(why)}
            onClick={() => { if (blocked) return; useGenerator.getState().setModel(nodeId, model, get); setOpen(null) }}>
            <i className="model-icon">{getModelIcon(model)}</i>
            <span className="model-main">
              <span className="model-name">{c.label}{c.isNew && <em className="model-new">NEW</em>}</span>
              <small>{specLine(c)}</small>
            </span>
            {on && <IcCheck size={17} sw={2.2} className="model-check" />}
          </button>
        </Fragment>
      })}
    </Overlay>}
    {open === 'params' && <Overlay anchor={paramButton} label="视频参数设置" className="params-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">视频参数
        <button aria-label="关闭参数设置" onClick={() => setOpen(null)}><IcClose size={15} sw={1.7} /></button></div>
      {/*
        每一节的标题行右端就摆着此刻的取值：一眼扫下来是「720p / 5s / 16:9」这三个数，
        不必先在下面那排里找出哪一枚是亮的。锁死的那一节（跟随原片）只剩这一行，
        下面不再摆一排点不动的选项 —— 摆出来又按不下去，比不摆更难懂。
      */}
      <div className="param-sec" role="group" aria-label="清晰度">
        <div className="param-head"><span>清晰度</span><b>{gen.params.resolution}</b></div>
        {/* 清晰度是一条从粗到细的刻度，所以用连在一起的一条分段控件，不是散开的几枚标签 */}
        <div className="seg-row">{cap.resolutions.map((r) => <button key={r} className={r === gen.params.resolution ? 'selected' : ''}
          aria-pressed={r === gen.params.resolution} onClick={() => patch({ resolution: r })}>{r}</button>)}</div>
      </div>
      <div className="param-sec" role="group" aria-label={durLabel}>
        <div className="param-head"><span>{durLabel}</span><b>{durValue}</b></div>
        {!durLocked && <div className="chip-row">{cap.durations.map((d) => <button key={d} className={d === gen.params.duration ? 'selected' : ''}
          aria-pressed={d === gen.params.duration} onClick={() => patch({ duration: d })}>{d}s</button>)}</div>}
      </div>
      <div className="param-sec" role="group" aria-label="比例">
        <div className="param-head"><span>比例</span><b>{ratio}</b></div>
        {!ratioLocked && <div className="chip-row">{cap.ratios.map((r) => <button key={r} className={r === gen.params.ratio ? 'selected' : ''}
          aria-pressed={r === gen.params.ratio} onClick={() => patch({ ratio: r })}><RatioGlyph ratio={r} />{r}</button>)}</div>}
      </div>
      {cap.hasAudioToggle && <div className="sound-setting">
        <span><IcSpeaker size={15} sw={1.7} />声音</span>
        <button role="switch" aria-label="生成声音" aria-checked={gen.params.sound}
          className={`sound-switch${gen.params.sound ? ' on' : ''}`} onClick={() => patch({ sound: !gen.params.sound })}><span /></button>
      </div>}
    </Overlay>}
  </>
}
