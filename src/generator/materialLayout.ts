/** 当前任务的素材角色。隐藏资产仅保留连接，不进入有效输入。 */
export type Mode = 'text' | 'frames' | 'ref' | 'edit' | 'extend'
export type Model = '2.5' | '2.0'
export type Zone = 'edit' | 'first' | 'last' | 'tray' | 'unused'
export interface Mat {
  id: string; name: string; kind: 'image' | 'video'; dur?: number
  src?: string; thumb?: string; grad: string; ready?: boolean; error?: string
}
export type MatGet = (id: string) => Mat | null
export interface Slots {
  slotEdit: string | null; slotFirst: string | null; slotLast: string | null
  tray: string[]; unused: string[]
}
export const emptySlots = (): Slots => ({ slotEdit: null, slotFirst: null, slotLast: null, tray: [], unused: [] })
export const MODEL_CAPABILITIES: Record<Model, { modes: Mode[]; resolutions: string[]; durations: number[]; ratios: string[] }> = {
  '2.5': { modes: ['text', 'frames', 'ref', 'edit', 'extend'], resolutions: ['720p', '1080p'], durations: [4, 5, 8, 10, 15, 20, 30], ratios: ['16:9', '9:16', '1:1'] },
  // 2.0 沿用仓库原有演示参数；未核实的参数范围不扩展。
  '2.0': { modes: ['text', 'frames', 'ref'], resolutions: ['720p'], durations: [5], ratios: ['16:9'] },
}
export const TABS: { k: Mode; label: string }[] = [
  { k: 'text', label: '文生视频' }, { k: 'frames', label: '首尾帧' },
  { k: 'ref', label: '参考素材' }, { k: 'edit', label: '编辑视频' }, { k: 'extend', label: '延长视频' },
]
export const fmt = (d: number) => (d % 1 ? d.toFixed(1) : String(d)) + 's'
export const visibleTabs = (model: Model) => TABS.filter((t) => MODEL_CAPABILITIES[model].modes.includes(t.k))
export const supportsMode = (mode: Mode, model: Model) => MODEL_CAPABILITIES[model].modes.includes(mode)
export function activeIds(s: Slots, mode: Mode): string[] {
  if (mode === 'text') return []
  if (mode === 'frames') return [s.slotFirst, s.slotLast].filter((id): id is string => !!id)
  return [...(s.slotEdit && (mode === 'edit' || mode === 'extend') ? [s.slotEdit] : []), ...s.tray]
}
export function accepts(z: Zone, id: string, get: MatGet) {
  const m = get(id)
  return !!m && (z === 'edit' ? m.kind === 'video' : z === 'first' || z === 'last' ? m.kind === 'image' : true)
}
/** 首次进入模式自动分配；恢复草稿时只接纳新连接，保留明确清空的角色。 */
export function allocate(prev: Slots, conn: string[], mode: Mode, get: MatGet, fresh = true, added = conn): Slots {
  const valid = conn.filter((id) => !!get(id))
  const keep = (id: string | null) => id && valid.includes(id) ? id : null
  const s: Slots = fresh ? emptySlots() : {
    slotEdit: keep(prev.slotEdit), slotFirst: keep(prev.slotFirst), slotLast: keep(prev.slotLast),
    tray: prev.tray.filter((id) => valid.includes(id)), unused: [],
  }
  const candidates = fresh ? valid : added.filter((id) => valid.includes(id) && !activeIds(s, mode).includes(id))
  for (const id of candidates) {
    if (mode === 'frames') {
      if (get(id)?.kind !== 'image') continue
      if (!s.slotFirst) s.slotFirst = id
      else if (!s.slotLast) s.slotLast = id
    } else if (mode === 'edit' || mode === 'extend') {
      if (!s.slotEdit && get(id)?.kind === 'video') s.slotEdit = id
      else s.tray.push(id)
    } else if (mode === 'ref') s.tray.push(id)
  }
  s.unused = valid.filter((id) => !activeIds(s, mode).includes(id))
  return s
}
/** 显式替换只改变指定角色，原素材转为非当前输入，不与参考素材交换。 */
export function assign(prev: Slots, id: string, zone: Zone, get: MatGet): Slots | null {
  if (!accepts(zone, id, get)) return null
  const s = remove(prev, id)
  if (zone === 'edit') { if (s.slotEdit) s.unused.push(s.slotEdit); s.slotEdit = id }
  else if (zone === 'first') { if (s.slotFirst) s.unused.push(s.slotFirst); s.slotFirst = id }
  else if (zone === 'last') { if (s.slotLast) s.unused.push(s.slotLast); s.slotLast = id }
  else if (zone === 'tray') s.tray.push(id)
  else s.unused.push(id)
  s.unused = [...new Set(s.unused)].filter((mid) => mid !== id || zone === 'unused')
  return s
}
export function remove(prev: Slots, id: string): Slots {
  return { slotEdit: prev.slotEdit === id ? null : prev.slotEdit,
    slotFirst: prev.slotFirst === id ? null : prev.slotFirst, slotLast: prev.slotLast === id ? null : prev.slotLast,
    tray: prev.tray.filter((mid) => mid !== id), unused: [...new Set([...prev.unused, id])] }
}
export type PromptSeg = { t: string }
export function promptHint(mode: Mode, hasLast = false): PromptSeg[] {
  const hints: Record<Mode, string> = {
    text: '描述你想要生成的画面内容', frames: hasLast ? '描述从首帧到尾帧之间发生的变化' : '描述从首帧开始的动作与镜头变化',
    ref: '描述你想要生成的画面，输入 @ 引用参考素材', edit: '将右侧黄色椅子改为红色', extend: '描述新增片段的画面与动作',
  }
  return [{ t: hints[mode] }]
}
