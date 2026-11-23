import { useRef, useState } from 'react'
import { useGenerator } from '../store/generator'
import { IcCheck, IcChev, IcImage, IcQuality } from '../ui/icons'
import ModelBadge from '../ui/ModelBadge'
import Overlay from './Overlay'
import Field, { RatioBox } from './SettingField'
import { IMAGE_COUNTS, IMAGE_MODELS, IMAGE_RATIOS, IMAGE_RESOLUTIONS, resolveImageSettings, type ImageSettings as Settings } from './imageOptions'

export default function ImageSettings({ nodeId }: { nodeId: string }) {
  const saved = useGenerator((s) => s.map[nodeId]?.imageSettings)
  const settings = resolveImageSettings(saved)
  const [open, setOpen] = useState<string | null>(null)
  const modelAnchor = useRef<HTMLButtonElement>(null)
  const model = IMAGE_MODELS.find((m) => m.id === settings.model) ?? IMAGE_MODELS[0]
  const patch = (value: Partial<Settings>) => {
    const store = useGenerator.getState()
    store.patch(nodeId, { imageSettings: resolveImageSettings({ ...store.get1(nodeId).imageSettings, ...value }) })
  }
  const field = { open, setOpen }
  return <div className="gp-set">
    <button ref={modelAnchor} type="button" className={`gp-mdl img-model-button${open === 'model' ? ' on' : ''}`}
      aria-label={`图片模型：${model.label}`} aria-haspopup="dialog" aria-expanded={open === 'model'}
      onClick={() => setOpen(open === 'model' ? null : 'model')}>
      <ModelBadge /><span className="gp-mdl-name">{model.label}</span>
      {model.id === 'phan-nano' && <em className="mdl-tier">推荐</em>}<IcChev size={13} />
    </button>
    <Field {...field} id="res" name="图片分辨率" value={settings.resolution}
      icon={<IcQuality size={15} sw={1.9} lv={IMAGE_RESOLUTIONS.indexOf(settings.resolution) + 1} />}
      opts={IMAGE_RESOLUTIONS.map((resolution) => ({ k: resolution, label: resolution,
        on: settings.resolution === resolution, pick: () => patch({ resolution }) }))} />
    <Field {...field} id="ratio" name="图片比例" value={settings.ratio}
      icon={<RatioBox ratio={settings.ratio} />}
      opts={IMAGE_RATIOS.map((ratio) => ({ k: ratio, label: ratio, glyph: <RatioBox ratio={ratio} />,
        on: settings.ratio === ratio, pick: () => patch({ ratio }) }))} />
    <Field {...field} id="count" name="生成张数" value={`${settings.count}张`} icon={<IcImage size={15} sw={1.9} />}
      opts={IMAGE_COUNTS.map((count) => ({ k: String(count), label: `${count}张`,
        on: settings.count === count, pick: () => patch({ count }) }))} />
    {open === 'model' && <Overlay anchor={modelAnchor} label="选择图片模型" className="mdl-drop img-model-drop" onClose={() => setOpen(null)}>
      {IMAGE_MODELS.map((m) => <button type="button" key={m.id} className={`mdl-row${settings.model === m.id ? ' on' : ''}`}
        aria-pressed={settings.model === m.id} onClick={() => { patch({ model: m.id }); setOpen(null) }}>
        <ModelBadge size={20} />
        <span className="mdl-row-main"><span className="mdl-row-name">{m.label}{m.id === 'phan-nano' && <em className="mdl-tier">推荐</em>}</span><small>图像生成，支持提示词创作</small></span>
        {settings.model === m.id && <IcCheck size={15} className="mdl-tick" />}
      </button>)}
    </Overlay>}
  </div>
}
