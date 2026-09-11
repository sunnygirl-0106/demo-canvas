import { useRef, useState } from 'react'
import { useGenerator, type GenState } from '../store/generator'
import { MODEL_CAPABILITIES, supportsMode, type Mat, type Model } from './materialLayout'
import Overlay from './Overlay'
export default function VideoSettings({ nodeId, gen, source }: { nodeId: string; gen: GenState; source: Mat | null }) {
  const modelButton = useRef<HTMLButtonElement>(null); const paramButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<'model' | 'params' | null>(null)
  const cap = MODEL_CAPABILITIES[gen.model]
  const ratio = gen.mode === 'edit' || gen.mode === 'extend' ? '随原片' : gen.mode === 'frames' && gen.model === '2.5' ? '随首帧' : gen.params.ratio
  const duration = gen.mode === 'edit' ? gen.scope === 'segment' ? gen.range ? `${gen.range.end - gen.range.start}s` : '随所选片段' : source?.dur != null ? `${Number(source.dur.toFixed(1))}s` : '随原片' : `${gen.params.duration}s`
  const patch = (p: Partial<GenState['params']>) => useGenerator.getState().patch(nodeId, { params: { ...gen.params, ...p } })
  return <>
    <button ref={modelButton} className="setting-trigger model-trigger" onClick={() => setOpen(open === 'model' ? null : 'model')} aria-expanded={open === 'model'}>Seedance {gen.model} <span>⌄</span></button>
    <button ref={paramButton} className="setting-trigger" aria-label={`参数设置：${gen.params.resolution} · ${duration} · ${ratio} · ${gen.params.sound ? '有声' : '无声'}`} aria-expanded={open === 'params'} onClick={() => setOpen(open === 'params' ? null : 'params')}>{gen.params.resolution} · {duration} · {ratio} · {gen.params.sound ? '有声' : '无声'} <span>⌄</span></button>
    {open === 'model' && <Overlay anchor={modelButton} label="选择模型" className="model-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">选择模型 <button aria-label="关闭模型选择" onClick={() => setOpen(null)}>✕</button></div>
      {(Object.keys(MODEL_CAPABILITIES) as Model[]).map((model) => { const compatible = supportsMode(gen.mode, model); return <button key={model} className={`model-option${gen.model === model ? ' selected' : ''}`} aria-disabled={!compatible} onClick={() => { if (compatible) { useGenerator.getState().setModel(nodeId, model, () => null); setOpen(null) } }}>
        <span>Seedance {model}{gen.model === model ? ' ✓' : ''}</span><small>{compatible ? model === '2.5' ? '生成、编辑与延长' : '文生视频、首尾帧与参考素材' : `本轮不支持${gen.mode === 'edit' ? '视频编辑' : '视频延长'}，请先退出当前操作`}</small>
      </button> })}
    </Overlay>}
    {open === 'params' && <Overlay anchor={paramButton} label="视频参数设置" className="params-popover" onClose={() => setOpen(null)}>
      <div className="popover-heading">视频参数 <button aria-label="关闭参数设置" onClick={() => setOpen(null)}>✕</button></div>
      <fieldset><legend>清晰度</legend><div className="option-row">{cap.resolutions.map((r) => <button key={r} className={r === gen.params.resolution ? 'selected' : ''} aria-pressed={r === gen.params.resolution} onClick={() => patch({ resolution: r })}>{r}</button>)}</div></fieldset>
      <fieldset><legend>{gen.mode === 'extend' ? '新增片段时长' : '时长'}</legend>{gen.mode === 'edit' ? <p className="readonly-value">{gen.scope === 'segment' ? '随所选片段' : '随原片'}{!duration.startsWith('随') && ` · ${duration}`}</p> : <div className="option-row">{cap.durations.map((d) => <button key={d} className={d === gen.params.duration ? 'selected' : ''} aria-pressed={d === gen.params.duration} onClick={() => patch({ duration: d })}>{d}s</button>)}</div>}</fieldset>
      <fieldset><legend>比例</legend>{ratio.startsWith('随') ? <p className="readonly-value">{ratio}</p> : <div className="option-row">{cap.ratios.map((r) => <button key={r} className={r === gen.params.ratio ? 'selected' : ''} aria-pressed={r === gen.params.ratio} onClick={() => patch({ ratio: r })}>{r}</button>)}</div>}</fieldset>
      <div className="sound-setting"><span>声音</span><button role="switch" aria-label="生成声音" aria-checked={gen.params.sound} className={`sound-switch${gen.params.sound ? ' on' : ''}`} onClick={() => patch({ sound: !gen.params.sound })}><span /></button></div>
      <p className="helper">参数自动保存到当前模式草稿</p>
    </Overlay>}
  </>
}
