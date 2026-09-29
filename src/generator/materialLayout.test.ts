import { describe, expect, it } from 'vitest'
import { activeIds, allocate, assign, emptySlots, tabStates, modeAvailable, modeBlockedReason, modelUnusableReason, sourceEntryReason, fallbackMode, supportsRange, locksRatio, locksDuration, MODEL_CAPABILITIES, type Mat, type MatGet, type Mode } from './materialLayout'
const mats: Mat[] = [
  { id: 'a', name: 'ABCD', kind: 'image', grad: '' }, { id: 'b', name: 'EFGH', kind: 'image', grad: '' },
  { id: 'v', name: 'IJKL', kind: 'video', dur: 15.1, grad: '' }, { id: 'w', name: 'MNOP', kind: 'video', dur: 4, grad: '' },
]
const get: MatGet = (id) => mats.find((m) => m.id === id) ?? null
const conn = ['v', 'a', 'b', 'w']
describe('模式能力与有效素材', () => {
  it('Tab 能不能进先看画布素材；2.0 起的型号拿的是「全能参考」那一个', () => {
    // 参考图不在 2.5 的能力里，它在这个型号下根本不摆出来 —— Tab 行说的是这个型号能做哪几件事
    expect(tabStates([], get, 'sd2.5').map((t) => t.k)).toEqual(['text', 'frames', 'ref', 'edit', 'extend'])
    // 灰不灰只认「这个模式容纳不容纳得下这些素材」，站着的那个 Tab 不再豁免
    const off = (c: string[]) => tabStates(c, get, 'sd2.5').filter((t) => !t.enabled).map((t) => t.k)
    expect(off([])).toEqual(['frames', 'ref', 'edit', 'extend'])
    expect(off(['a'])).toEqual(['text', 'edit', 'extend'])
    // 连什么才进得去，说的是画布上的动作，不是「需要几个输入」这种规格
    const why = (c: string[], k: Mode) => tabStates(c, get, 'sd2.5').find((t) => t.k === k)!.reason
    expect(why([], 'frames')).toBe('连接 1–2 张图片后可用')
    expect(why([], 'ref')).toBe('连接图片或视频后可用')
    // 参考图用的是同一条：空画布下说的也是「去连什么」，不是「这个型号没有它」；
    // 只收图的型号说的也只是图片 —— 不能让用户去连一段它根本不收的视频
    const whyWan = (c: string[], k: Mode) => tabStates(c, get, 'wan2.2').find((t) => t.k === k)!.reason
    expect(whyWan([], 'refImage')).toBe('连接图片后可用')
    expect(why(['a'], 'edit')).toBe('连接视频后可用')
    expect(why(['a'], 'extend')).toBe('连接视频后可用')
    expect(off(['v'])).toEqual(['text', 'frames'])
    // 连了视频，首尾帧也跟着进不去（第 2 节）；编辑 / 延长容得下多段视频，第二段不关它们的门
    expect(off(conn)).toEqual(['text', 'frames'])
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'text')!.reason).toContain('仅使用文本')
    expect(fallbackMode([], get, 'sd2.5')).toBe('text')
    expect(fallbackMode(['v'], get, 'sd2.5')).toBe('ref')
  })
  it('模型影响参数域与配额：2.0 系列不锁比例、不认秒数', () => {
    // 用 4 秒那段打头：2.5 与 2.0 系列都收得下，五个模式才都该是亮的
    for (const m of ['sd2.5', 'sd2.0', 'sd2.0-1080p', 'sd2.0-4k', 'sd2.0-fast', 'sd2.0-mini'] as const) {
      // 连着一段视频，所以文生视频和首尾帧这两个不算数
      expect(tabStates(['w', 'a', 'b'], get, m).every((t) => t.k === 'text' || t.k === 'frames' || t.enabled)).toBe(true)
      expect(locksRatio('edit', m)).toBe(m === 'sd2.5')
      expect(locksDuration('edit')).toBe(true)
      expect(supportsRange(m)).toBe(m === 'sd2.5')
    }
  })
  it('时长档位不跳过 6 秒', () => {
    for (const m of ['sd2.5', 'sd2.0'] as const) expect(MODEL_CAPABILITIES[m].durations).toContain(6)
  })
  it('别家模型与 1.5 没有编辑与延长：做不了的事不摆一个灰 Tab，直接不出现', () => {
    // 顺带说清两个参考 Tab 的互斥：可灵收多模态归「全能参考」，1.5 与 Wan 只收图归「参考图」
    for (const [m, mine] of [['sd1.5', 'refImage'], ['kling-video-o1', 'ref'], ['wan2.2', 'refImage']] as const) {
      // 这一行上只有这个型号做得了的事：编辑 / 延长、以及另一个参考 Tab 都不在
      expect(tabStates(conn, get, m).map((t) => t.k)).toEqual(['text', 'frames', mine])
      expect(modeAvailable('edit', conn, get, m)).toBe(false)
    }
    // 收多模态的可灵：灰掉的只是素材不对的那两个，全能参考接得住这一画布 ——
    // 这条 15.1 秒的视频它收不下，但那是生成按钮要说的事，不是入口
    expect(tabStates(conn, get, 'kling-video-o1').filter((t) => !t.enabled).map((t) => t.k)).toEqual(['text', 'frames'])
    expect(fallbackMode(conn, get, 'kling-video-o1')).toBe('ref')
    // 只收图的两个型号连着视频就一个模式都进不去，参考图自己也容纳不下它。
    // 这不是死角：落位会换一个接得住视频的型号（store 里的 land），模型列表里它们也是灰的
    for (const m of ['sd1.5', 'wan2.2'] as const) {
      expect(tabStates(conn, get, m).filter((t) => !t.enabled).map((t) => t.k)).toEqual(['text', 'frames', 'refImage'])
      expect(fallbackMode(conn, get, m)).toBeNull()
      expect(modelUnusableReason(conn, get, m)).toBeTruthy()
    }
  })
  it('两个参考 Tab 互斥：只收图的型号进参考图，收多模态的进全能参考', () => {
    // Wan 2.2 只收参考图：全能参考不出现。整类都不收的视频是「容纳不下」，不是「超额」，
    // 所以参考图这个 Tab 跟着灰 —— 站着的那个 Tab 也一样，入口只有一把尺子
    const wan = tabStates(conn, get, 'wan2.2')
    expect(wan.find((t) => t.k === 'ref')).toBeUndefined()
    expect(wan.find((t) => t.k === 'refImage')!.enabled).toBe(false)
    expect(wan.find((t) => t.k === 'refImage')!.reason)
      .toBe('Wan 2.2 不支持视频输入')
    // 容纳不下的是那段视频，不是「参考图」这件事本身：只连图片照样进得去
    expect(tabStates(['a', 'b'], get, 'wan2.2').find((t) => t.k === 'refImage')!.enabled).toBe(true)
    // Seedance 2.0 反过来：参考图不出现，全能参考里那段 4 秒的视频照常参与
    const sd = tabStates(['a', 'w'], get, 'sd2.0')
    expect(sd.find((t) => t.k === 'refImage')).toBeUndefined()
    expect(sd.find((t) => t.k === 'ref')!.enabled).toBe(true)
  })
  it('时长不进入入口判定：3 秒的视频照样落编辑视频，由生成闸门说它为什么不行', () => {
    // 2.1 秒仍然是一段视频，编辑 / 延长照样进得去 —— 入口只问类型与席位
    const short: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: m.kind === 'video' ? 2.1 : undefined } : null }
    for (const mode of ['edit', 'extend'] as const) {
      expect(modeAvailable(mode, ['v'], short, 'sd2.5')).toBe(true)
      expect(modeAvailable(mode, ['v'], short, 'sd2.0')).toBe(true)
      expect(tabStates(['v'], short, 'sd2.5').find((t) => t.k === mode)!.enabled).toBe(true)
      // 拦住这次任务的是闸门那一条，话还是同一句
      expect(modeBlockedReason(mode, ['v'], short, 'sd2.5')).toBe('视频 IJKL 的时长需在 4–30 秒之间')
    }
    // 连的不是视频才是真的进不去
    expect(modeAvailable('edit', ['a', 'b'], get, 'sd2.5')).toBe(false)
    // 时长还没读出来的照样进得去
    const loading: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: undefined } : null }
    expect(modeAvailable('edit', ['v'], loading, 'sd2.5')).toBe(true)
  })
  it('第二段视频不关掉编辑 / 延长的入口：转去全能参考是落位规则，不是容纳不下', () => {
    expect(modeAvailable('edit', ['v'], get, 'sd2.5')).toBe(true)
    // 编辑和延长都容得下多段视频：第一段作源视频，其余照旧是参考素材，与源视频共用视频额度
    expect(modeAvailable('edit', ['v', 'w'], get, 'sd2.5')).toBe(true)
    expect(modeAvailable('extend', ['v', 'w'], get, 'sd2.5')).toBe(true)
    expect(tabStates(['v', 'w'], get, 'sd2.5').find((t) => t.k === 'edit')!.reason).toBe('')
    // 「再接一段视频就转去全能参考」由落位说（generator 的 leaveSource），
    // 入口不跟着灰 —— 用户手动切回编辑仍然进得去
    expect(fallbackMode(['v', 'w'], get, 'sd2.5')).toBe('ref')
  })
  it('输入视频的上限也按型号分：2.0 系列只收到 15 秒 —— 那是闸门的事，不是入口', () => {
    // 20 秒的视频 2.0 系列一段都接不住，可它仍然是一段视频：Tab 照进，生成拦住
    const long: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: m.kind === 'video' ? 20 : undefined } : null }
    for (const mode of ['edit', 'extend'] as const) {
      for (const m of ['sd2.5', 'sd2.0', 'sd2.0-fast', 'sd2.0-mini'] as const) {
        expect(modeAvailable(mode, ['v'], long, m)).toBe(true)
      }
      expect(modeBlockedReason(mode, ['v'], long, 'sd2.5')).toBe('')
      expect(modeBlockedReason(mode, ['v'], long, 'sd2.0')).toBe('视频 IJKL 的时长需在 4–15 秒之间')
    }
    expect(tabStates(['v'], long, 'sd2.0').find((t) => t.k === 'edit')!.enabled).toBe(true)
    // 入口那句话说的是「锁死的 2.5 接不接得住」，区间就是 2.5 自己那一条
    expect(sourceEntryReason(20, 'IJKL')).toBe('')
    expect(sourceEntryReason(31, 'IJKL')).toBe('视频 IJKL 的时长需在 4–30 秒之间')
  })
  it('视频节点上的入口：锁死的 2.5 接不住这段时长就灰掉', () => {
    // 下限统一 4 秒、上限按型号，编辑和延长共用同一条：两个入口一起灰，不再分两套
    expect(sourceEntryReason(2.1, 'IJKL')).toBe('视频 IJKL 的时长需在 4–30 秒之间')
    expect(sourceEntryReason(1, 'IJKL')).toBe('视频 IJKL 的时长需在 4–30 秒之间')
    expect(sourceEntryReason(40, 'IJKL')).toBe('视频 IJKL 的时长需在 4–30 秒之间')
    // 时长还没读出来，不先拦
    expect(sourceEntryReason(undefined, 'IJKL')).toBe('')
  })
  it('一个模式都进不去的型号，在模型列表里就灰掉', () => {
    // 只做文生视频的型号：画布上一连素材就没得做，别让用户选进一个全灰的 Tab
    expect(modelUnusableReason(conn, get, 'wan2.2-ti2v-5b')).toBe('文生视频仅使用文本，断开素材连接后可用')
    expect(modelUnusableReason([], get, 'wan2.2-ti2v-5b')).toBe('')
    // 只做图生视频的型号反过来：空画布上没得做
    // 缺素材时说的是「去画布上连什么」，和那个 Tab 灰掉时说的是同一句
    expect(modelUnusableReason([], get, 'wan2.2-i2v-a14b')).toBe('连接图片后可用')
    expect(modelUnusableReason(['a'], get, 'wan2.2-i2v-a14b')).toBe('')
    // 它也不收视频：连着视频时同样一个模式都进不去，换型号那条路由落位去走
    expect(modelUnusableReason(conn, get, 'wan2.2-i2v-a14b'))
      .toBe('Wan 2.2 图生视频 不支持视频输入')
    // 五种模式都支持的型号，连或不连都有得做
    for (const m of ['sd2.5', 'sd2.0', 'kling-video-o1'] as const) {
      expect(modelUnusableReason(conn, get, m)).toBe('')
      expect(modelUnusableReason([], get, m)).toBe('')
    }
  })
  it('首尾帧连了视频就进不去，说的仍然是「去连什么」那一句', () => {
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'frames')!.reason).toBe('连接 1–2 张图片后可用')
  })
  it('文生视频不展示或提交任何连接素材', () => {
    const s = allocate(emptySlots(), conn, 'text', get)
    expect(activeIds(s, 'text')).toEqual([])
    expect(s.unused).toEqual(conn)
  })
  it('首尾帧只使用两张图，编辑和延长明确源视频', () => {
    const frames = allocate(emptySlots(), conn, 'frames', get)
    expect(activeIds(frames, 'frames')).toEqual(['a', 'b'])
    for (const mode of ['edit', 'extend'] as const) {
      const s = allocate(emptySlots(), conn, mode, get)
      expect(s.slotEdit).toBe('v'); expect(s.tray).toEqual(['a', 'b', 'w'])
    }
  })
  it('剪断首帧由尾帧递补：首帧不留一个空洞，也不把尾帧晾在后面', () => {
    const s = allocate(emptySlots(), conn, 'frames', get)
    expect([s.slotFirst, s.slotLast]).toEqual(['a', 'b'])
    // 断开首帧那条连线：尾帧升上来占首帧，尾帧位空出来等下一张图
    const next = allocate(s, ['v', 'b', 'w'], 'frames', get, [])
    expect(next.slotFirst).toBe('b'); expect(next.slotLast).toBeNull()
  })
  it('更换主视频将旧视频转为隐藏资产，不与参考素材互换', () => {
    const next = assign(allocate(emptySlots(), conn, 'edit', get), 'w', 'edit', get)!
    expect(next.slotEdit).toBe('w'); expect(next.tray).toEqual(['a', 'b']); expect(next.unused).toContain('v')
  })
  it('阻止不匹配的角色并清理断开的连接', () => {
    const s = allocate(emptySlots(), conn, 'edit', get)
    expect(assign(s, 'a', 'edit', get)).toBeNull()
    const next = allocate(s, ['a', 'b'], 'edit', get, [])
    expect(next.slotEdit).toBeNull(); expect(activeIds(next, 'edit')).toEqual(['a', 'b'])
  })
})
