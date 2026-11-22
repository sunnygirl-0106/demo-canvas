import { useRef, useState } from 'react'
import { useGenerator, type GenState } from '../store/generator'
import { MODEL_CAPABILITIES, MODELS, locksDuration, locksRatio, type Mat, type MatGet, type ModelCap, type Tier } from './materialLayout'
import { modelBlockedReason } from './videoTask'
import Overlay from './Overlay'
import Field, { RatioBox } from './SettingField'
import { IcCheck, IcClock, IcMute, IcQuality, IcSpeaker } from '../ui/icons'
import ModelBadge from '../ui/ModelBadge'
import { useTip } from './useTip'
import { docText } from './promptDoc'

/**
 * 这个型号收什么。一整类都不收的说「不支持视频」，不说「最多 0 段视频」—— 和素材、Tab 那两处一个说法。
 * 用「支持 / 不支持」这套词，和置灰原因（kindUnsupported、配额那两句）同一个说法；
 * 「只收 / 不收」是口语，同一件事在界面上不该有两种腔调。
 */
const intake = (c: ModelCap) => c.quota.video ? `最多 ${c.quota.video} 段视频` : c.quota.image ? '仅支持图片' : '不支持素材'
/**
 * 这一行小字：出多长、多清楚、收几段。三样占一行，不折行。
 * 「不支持编辑与延长 / 不支持局部编辑」这两句缺陷不进这一行 —— 它们让一半型号的小字长到要折两行，
 * 一行装不下就得折成两行，这一格的高又是定死的。也不挂到悬浮说明上：
 * 说明气泡只说置灰原因，而这两件事真挡住换型号时，本来就会由那句置灰原因说出来。
 */
const specLine = (c: ModelCap) =>
  `${c.durationRange[0]}–${c.durationRange[1]}s · ${c.resolutions.join('/')} · ${intake(c)}`

/** 名字后头那枚身份胶囊。免费档不挂 —— 「不是会员专属」这件事不值得占一枚牌子。 */
const TIER_PILL: Record<Tier, string> = { free: '', vip: 'VIP' }
const TierPill = ({ tier }: { tier: Tier }) =>
  TIER_PILL[tier] ? <em className="mdl-tier" data-tier={tier}>{TIER_PILL[tier]}</em> : null
/** 清晰度在这把刻度上的位置：图标里三根柱子亮几根。4K 和 1080p 同顶格，刻度只有三档。 */
const qualityLv = (r: string) => (r === '480p' ? 1 : r === '720p' ? 2 : 3)
/** 专注态锁死 Seedance 2.5，模型那颗按钮点不开；说法和入口放行的那条规则是同一条。 */
const FOCUS_MODEL_TIP = '编辑 / 延长固定使用 Seedance 2.5'
export default function VideoSettings({ nodeId, gen, source, get, focus }: { nodeId: string; gen: GenState; source: Mat | null; get: MatGet; focus: boolean }) {
  const modelButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  /** 灰掉的型号为什么选不了，悬浮 / 聚焦就说，不用用户自己猜；没灰的那几行不弹说明，鼠标扫过去不该一路跟着冒气泡 */
  const { tip: rowTip, node: rowTipNode } = useTip(true)
  /** 底栏这一排本身的说明：贴着它上方说，不挤到旁边那几格头上 */
  const { tip, node: tipNode } = useTip()
  const cap = MODEL_CAPABILITIES[gen.model]
  /** 锁定是 Seedance 2.5 才有的机制；2.0 系列不锁，比例照常可选。 */
  const ratioLocked = locksRatio(gen.mode, gen.model)
  const durLocked = locksDuration(gen.mode)
  const ratio = ratioLocked ? (gen.mode === 'frames' ? '随首帧' : '随原片') : gen.params.ratio
  const duration = durLocked ? (source?.dur != null ? `${Number(source.dur.toFixed(1))}s` : '随原片') : `${gen.params.duration}s`
  const durLabel = gen.mode === 'extend' ? '新增片段时长' : '时长'
  /** 锁死时这一格只剩一个取值，所以「随原片」这半句得写在值里，不能只剩一个秒数。 */
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
  const field = { open, setOpen, say: tip }
  return <div className="gp-set">
    {rowTipNode}{tipNode}
    <button ref={modelButton} className={`gp-mdl${open === 'model' ? ' on' : ''}`} aria-disabled={focus || undefined}
      aria-label={focus ? `${cap.label}：${FOCUS_MODEL_TIP}` : `模型：${cap.label}`} {...rowTip(focus ? FOCUS_MODEL_TIP : undefined)}
      onClick={() => { if (!focus) setOpen(open === 'model' ? null : 'model') }} aria-expanded={open === 'model'}>
      <ModelBadge />
      <span className="gp-mdl-name">{cap.label}</span>
      <TierPill tier={cap.tier} />
    </button>
    <Field {...field} id="res" name="清晰度" value={gen.params.resolution}
      icon={<IcQuality size={15} sw={1.9} lv={qualityLv(gen.params.resolution)} />}
      opts={cap.resolutions.map((r) => ({ k: r, label: r, on: r === gen.params.resolution, pick: () => patch({ resolution: r }) }))} />
    <Field {...field} id="dur" name={durLabel} value={durValue} icon={<IcClock size={15} sw={1.9} />}
      reason={durLocked ? '时长与原片一致' : undefined}
      opts={durLocked ? undefined : cap.durations.map((d) => ({ k: `${d}`, label: `${d}s`, on: d === gen.params.duration, pick: () => patch({ duration: d }) }))} />
    <Field {...field} id="ratio" name="比例" value={ratio} icon={<RatioBox ratio={ratioLocked ? '16:9' : ratio} loose={ratioLocked} />}
      reason={ratioLocked ? (gen.mode === 'frames' ? '画幅与首帧一致' : '画幅与原片一致') : undefined}
      opts={ratioLocked ? undefined : cap.ratios.map((r) => ({ k: r, label: r, glyph: <RatioBox ratio={r} />, on: r === gen.params.ratio, pick: () => patch({ ratio: r }) }))} />
    {/* 声音只有开和关两头，不必为它开一张抽屉：一枚会哑掉的喇叭就是这个开关本身 */}
    {cap.hasAudioToggle && <button className={`gp-field ic${gen.params.sound ? '' : ' off'}`} role="switch"
      aria-checked={gen.params.sound} aria-label="生成声音" {...tip(gen.params.sound ? '有声' : '静音')}
      onClick={() => patch({ sound: !gen.params.sound })}>
      {gen.params.sound ? <IcSpeaker size={15} sw={1.9} /> : <IcMute size={15} sw={1.9} />}</button>}
    {open === 'model' && <Overlay anchor={modelButton} label="选择模型" className="mdl-drop" onClose={() => setOpen(null)}>
      {MODELS.map((model) => {
        const c = MODEL_CAPABILITIES[model]
        const blocked = modelBlockedReason(gen, model, get)
        const on = gen.model === model
        return <button key={model} className={`mdl-row${on ? ' on' : ''}`} aria-disabled={!!blocked}
          aria-label={`${c.label}，${specLine(c)}${blocked ? `。${blocked}` : ''}`} {...rowTip(blocked || undefined)}
          onClick={() => { if (blocked) return; useGenerator.getState().setModel(nodeId, model, get); setOpen(null) }}>
          <ModelBadge size={20} />
          <span className="mdl-row-main">
            <span className="mdl-row-name">{c.label}<TierPill tier={c.tier} />{c.isNew && <em className="mdl-new">NEW</em>}</span>
            <small>{specLine(c)}</small>
          </span>
          {on && <IcCheck size={15} sw={2.6} className="mdl-tick" />}
        </button>
      })}
    </Overlay>}
  </div>
}
