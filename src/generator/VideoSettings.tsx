import { useRef, useState } from 'react'
import { useGenerator, type GenState } from '../store/generator'
import { MODEL_CAPABILITIES, MODELS, locksDuration, locksRatio, type Mat, type MatGet, type Model, type ModelCap } from './materialLayout'
import { modelBlockedReason, modelNote, marksBlockModel } from './videoTask'
import Overlay from './Overlay'
import { IcChev, IcSeedance, IcWan, IcKling } from '../ui/icons'
import { useTip } from './useTip'

/** 这个型号收什么。一整类都不收的说「只收图片」，不说「最多 0 段视频」—— 和素材、Tab 那两处一个说法。 */
const intake = (c: ModelCap) => c.quota.video ? `最多 ${c.quota.video} 段视频` : c.quota.image ? '只收图片' : '不收素材'
const getModelIcon = (model: Model) => {
  if (model.startsWith('sd')) return <IcSeedance size={14} />
  if (model.startsWith('wan')) return <IcWan size={14} />
  if (model.startsWith('kling')) return <IcKling size={14} />
  return null
}
export default function VideoSettings({ nodeId, gen, source, get }: { nodeId: string; gen: GenState; source: Mat | null; get: MatGet }) {
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
  const patch = (p: Partial<GenState['params']>) => useGenerator.getState().patch(nodeId, { params: { ...gen.params, ...p } })
  return <>
    {tipNode}
    <button ref={modelButton} className="setting-trigger model-trigger" onClick={() => setOpen(open === 'model' ? null : 'model')} aria-expanded={open === 'model'}>
      <i className="model-dot" />{cap.label}<IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    <button ref={paramButton} className="setting-trigger" aria-label={`参数设置：${gen.params.resolution} · ${duration} · ${ratio}${cap.hasAudioToggle ? ` · ${gen.params.sound ? '有声' : '无声'}` : ''}`} aria-expanded={open === 'params'} onClick={() => setOpen(open === 'params' ? null : 'params')}>
      {gen.params.resolution}<i className="sep">·</i>{duration}<i className="sep">·</i>{ratio}
      {cap.hasAudioToggle && <><i className="sep">·</i><em>{gen.params.sound ? '有声' : '无声'}</em></>}<IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    {open === 'model' && <Overlay anchor={modelButton} label="选择模型" className="model-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">选择模型 <button aria-label="关闭模型选择" onClick={() => setOpen(null)}>✕</button></div>
      {MODELS.map((model) => { const c = MODEL_CAPABILITIES[model]; const blocked = modelBlockedReason(gen, model, get); const why = blocked || modelNote(gen, model, get); const icon = getModelIcon(model); return <button key={model} className={`model-option${gen.model === model ? ' selected' : ''}`} aria-disabled={!!blocked}
        aria-label={why ? `${c.label}：${why}` : c.label} {...tip(why)}
        onClick={() => { if (blocked) return; useGenerator.getState().setModel(nodeId, model, get); setOpen(null) }}>
        <span>{icon && <i className="model-icon">{icon}</i>}{c.label}{gen.model === model ? ' \u2713' : ''}</span><small>{`${c.durationRange[0]}\u2013${c.durationRange[1]}s \u00b7 ${c.resolutions.join(' / ')} \u00b7 ${intake(c)}${c.genModes.includes('edit') ? '' : ' \u00b7 \u4e0d\u652f\u6301\u7f16\u8f91\u4e0e\u5ef6\u957f'}${c.timestamp ? '' : ' \u00b7 \u4e0d\u54cd\u5e94\u8303\u56f4'}`}</small>
      </button> })}
      {MODELS.some((model) => !!marksBlockModel(gen, model)) && <button className="scope-fix" onClick={() => useGenerator.getState().patch(nodeId, { marks: [] })}>移除标记，改为整条</button>}
    </Overlay>}
    {open === 'params' && <Overlay anchor={paramButton} label="视频参数设置" className="params-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">视频参数 <button aria-label="关闭参数设置" onClick={() => setOpen(null)}>✕</button></div>
      <fieldset><legend>清晰度</legend><div className="option-row">{cap.resolutions.map((r) => <button key={r} className={r === gen.params.resolution ? 'selected' : ''} aria-pressed={r === gen.params.resolution} onClick={() => patch({ resolution: r })}>{r}</button>)}</div></fieldset>
      <fieldset><legend>{gen.mode === 'extend' ? '新增片段时长' : '时长'}</legend>{durLocked ? <p className="readonly-value">随原片{!duration.startsWith('随') && ` · ${duration}`}</p> : <div className="option-row">{cap.durations.map((d) => <button key={d} className={d === gen.params.duration ? 'selected' : ''} aria-pressed={d === gen.params.duration} onClick={() => patch({ duration: d })}>{d}s</button>)}</div>}</fieldset>
      <fieldset><legend>比例</legend>{ratioLocked ? <p className="readonly-value">{ratio}</p> : <div className="option-row">{cap.ratios.map((r) => <button key={r} className={r === gen.params.ratio ? 'selected' : ''} aria-pressed={r === gen.params.ratio} onClick={() => patch({ ratio: r })}>{r}</button>)}</div>}</fieldset>
      {cap.hasAudioToggle && <div className="sound-setting"><span>声音</span><button role="switch" aria-label="生成声音" aria-checked={gen.params.sound} className={`sound-switch${gen.params.sound ? ' on' : ''}`} onClick={() => patch({ sound: !gen.params.sound })}><span /></button></div>}
    </Overlay>}
  </>
}
