import { useRef, type ReactNode } from 'react'
import { IcCheck } from '../ui/icons'
import Overlay from './Overlay'

/**
 * 比例那一枚小方框：框本身就是那个画幅。「16:9」四个字要在脑子里换算成一块横屏，画出来就不必换算 ——
 * 长边定死 15px，短边按比例收，一列看过去是从扁到方到竖的一串形状。
 * 锁死的那一格（随原片 / 随首帧）画成虚线：这会儿形状还没定，实线框会读成「就是这个比例」。
 */
export const RatioBox = ({ ratio, loose }: { ratio: string; loose?: boolean }) => {
  const [w, h] = ratio.split(':').map(Number)
  const long = 15, short = Math.round((long * Math.min(w, h)) / Math.max(w, h))
  const [bw, bh] = w >= h ? [long, short] : [short, long]
  return <i className="ratio-box" data-loose={loose || undefined} style={{ width: bw, height: bh }} />
}

interface Opt { k: string; label: string; on: boolean; glyph?: ReactNode; pick: () => void }
type Say = (t?: string) => Record<string, unknown>
/**
 * 一格参数 = 一枚图标 + 此刻的取值，点开在它正上方落一张小抽屉。
 *
 * 三格分开摆，不再是「720p · 5s · 16:9」挤成一枚按钮 + 一张大面板：
 * 要改哪一格就点哪一格，中间不隔着「先打开参数设置」这一步；没打开的时候，
 * 三枚图标本身就把「画质 / 时长 / 画幅」说完了，不必靠一行小标题指认。
 *
 * 锁死的那一格（跟随原片）仍旧摆在这儿，但不给抽屉：它是这次任务的既成事实，不是一个空位。
 * 为什么改不了挂在悬浮说明上 —— 和面板里其他灰掉的控件是同一条规矩。
 */
export default function SettingField({ id, open, setOpen, name, icon, value, opts, reason, say }: {
  id: string; open: string | null; setOpen: (v: string | null) => void
  name: string; icon: ReactNode; value: string; opts?: Opt[]; reason?: string; say?: Say
}) {
  const at = useRef<HTMLButtonElement>(null)
  const on = open === id
  const tipped = opts ? undefined : say?.(reason)
  return <>
    <button ref={at} className={`gp-field${on ? ' on' : ''}`} {...tipped}
      aria-label={`${name}：${value}${reason ? `（${reason}）` : ''}`}
      aria-expanded={opts ? on : undefined} aria-disabled={opts ? undefined : true}
      onClick={() => { if (opts) setOpen(on ? null : id) }}>
      <i className="gp-field-ic">{icon}</i>{value}
    </button>
    {on && opts && <Overlay anchor={at} label={name} className="gp-drop" onClose={() => setOpen(null)}>
      {opts.map((o) => <button key={o.k} className={o.on ? 'on' : ''} aria-pressed={o.on}
        onClick={() => { o.pick(); setOpen(null) }}>
        <span>{o.glyph && <i className="gp-opt-ic">{o.glyph}</i>}{o.label}</span>
        {o.on && <IcCheck size={13} sw={2.6} />}</button>)}
    </Overlay>}
  </>
}

