import { useRef, useState } from 'react'
import { useGenerator, type GenState } from '../store/generator'
import { MODEL_CAPABILITIES, MODELS, locksDuration, locksRatio, type Mat } from './materialLayout'
import Overlay from './Overlay'
import { IcChev } from '../ui/icons'
export default function VideoSettings({ nodeId, gen, source }: { nodeId: string; gen: GenState; source: Mat | null }) {
  const modelButton = useRef<HTMLButtonElement>(null); const paramButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<'model' | 'params' | null>(null)
  const cap = MODEL_CAPABILITIES[gen.model]
  /** 锁定是 Seedance 2.5 才有的机制；2.0 系列不锁，比例照常可选。 */
  const ratioLocked = locksRatio(gen.mode, gen.model)
  const durLocked = locksDuration(gen.mode, gen.model)
  const ratio = ratioLocked ? (gen.mode === 'frames' ? '随首帧' : '随原片') : gen.params.ratio
  const duration = durLocked ? (source?.dur != null ? `${Number(source.dur.toFixed(1))}s` : '随原片') : `${gen.params.duration}s`
  const patch = (p: Partial<GenState['params']>) => useGenerator.getState().patch(nodeId, { params: { ...gen.params, ...p } })
  return <>
    <button ref={modelButton} className="setting-trigger model-trigger" onClick={() => setOpen(open === 'model' ? null : 'model')} aria-expanded={open === 'model'}>
      <i className="model-dot" />{cap.label}<IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    <button ref={paramButton} className="setting-trigger" aria-label={`参数设置：${gen.params.resolution} · ${duration} · ${ratio} · ${gen.params.sound ? '有声' : '无声'}`} aria-expanded={open === 'params'} onClick={() => setOpen(open === 'params' ? null : 'params')}>
      {gen.params.resolution}<i className="sep">·</i>{duration}<i className="sep">·</i>{ratio}<i className="sep">·</i>
      <em>{gen.params.sound ? '有声' : '无声'}</em><IcChev size={13} color="var(--ink-2)" sw={2} /></button>
    {open === 'model' && <Overlay anchor={modelButton} label="选择模型" className="model-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">选择模型 <button aria-label="关闭模型选择" onClick={() => setOpen(null)}>✕</button></div>
      <p className="helper">四个模型都支持全部 5 种任务，切换只影响参数范围与素材上限。</p>
      {MODELS.map((model) => { const c = MODEL_CAPABILITIES[model]; return <button key={model} className={`model-option${gen.model === model ? ' selected' : ''}`} onClick={() => { useGenerator.getState().setModel(nodeId, model, () => null); setOpen(null) }}>
        <span>{c.label}{gen.model === model ? ' \u2713' : ''}</span><small>{c.durationRange[0]}\u2013{c.durationRange[1]}s \u00b7 {c.resolutions.join(' / ')} \u00b7 \u6700\u591a {c.quota.video} \u6bb5\u89c6\u9891{c.timestamp ? '' : ' \u00b7 \u4e0d\u54cd\u5e94\u79d2\u6570'}</small>
      </button> })}
    </Overlay>}
    {open === 'params' && <Overlay anchor={paramButton} label="视频参数设置" className="params-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">视频参数 <button aria-label="关闭参数设置" onClick={() => setOpen(null)}>✕</button></div>
      <fieldset><legend>清晰度</legend><div className="option-row">{cap.resolutions.map((r) => <button key={r} className={r === gen.params.resolution ? 'selected' : ''} aria-pressed={r === gen.params.resolution} onClick={() => patch({ resolution: r })}>{r}</button>)}</div></fieldset>
      <fieldset><legend>{gen.mode === 'extend' ? '新增片段时长' : '时长'}</legend>{durLocked ? <p className="readonly-value">随原片{!duration.startsWith('随') && ` · ${duration}`}<small>编辑任务整条进、整条出，时长不可指定</small></p> : <div className="option-row">{cap.durations.map((d) => <button key={d} className={d === gen.params.duration ? 'selected' : ''} aria-pressed={d === gen.params.duration} onClick={() => patch({ duration: d })}>{d}s</button>)}</div>}</fieldset>
      <fieldset><legend>比例</legend>{ratioLocked ? <p className="readonly-value">{ratio}<small>Seedance 2.5 在这个模式下强制 adaptive</small></p> : <div className="option-row">{cap.ratios.map((r) => <button key={r} className={r === gen.params.ratio ? 'selected' : ''} aria-pressed={r === gen.params.ratio} onClick={() => patch({ ratio: r })}>{r}</button>)}</div>}</fieldset>
      <div className="sound-setting"><span>声音</span><button role="switch" aria-label="生成声音" aria-checked={gen.params.sound} className={`sound-switch${gen.params.sound ? ' on' : ''}`} onClick={() => patch({ sound: !gen.params.sound })}><span /></button></div>
      <p className="helper">参数自动保存到当前模式草稿</p>
    </Overlay>}
  </>
}
