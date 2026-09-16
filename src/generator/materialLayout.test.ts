import { describe, expect, it } from 'vitest'
import { activeIds, allocate, assign, remove, emptySlots, partition, visibleRefs, tabStates, modeAvailable, modelUnusableReason, sourceEntryReason, fallbackMode, supportsRange, locksRatio, locksDuration, MODEL_CAPABILITIES, type Mat, type MatGet, type Mode } from './materialLayout'
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
    const off = (c: string[]) => tabStates(c, get, 'sd2.5').filter((t) => !t.enabled).map((t) => t.k)
    expect(off([])).toEqual(['frames', 'ref', 'edit', 'extend'])
    expect(off(['a'])).toEqual(['text', 'edit', 'extend'])
    // 连什么才进得去，说的是画布上的动作，不是「需要几个输入」这种规格
    const why = (c: string[], k: Mode) => tabStates(c, get, 'sd2.5').find((t) => t.k === k)!.reason
    expect(why([], 'frames')).toBe('需要连接图片节点（1–2 个）')
    expect(why([], 'ref')).toBe('需要连接图片或视频节点')
    // 参考图用的是同一条：空画布下说的也是「去连什么」，不是「这个型号没有它」
    const whyWan = (c: string[], k: Mode) => tabStates(c, get, 'wan2.2').find((t) => t.k === k)!.reason
    expect(whyWan([], 'refImage')).toBe('需要连接图片或视频节点')
    expect(why(['a'], 'edit')).toBe('需要连接视频节点')
    expect(why(['a'], 'extend')).toBe('需要连接视频节点')
    expect(off(['v'])).toEqual(['text', 'frames'])
    expect(off(conn)).toEqual(['text'])
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'text')!.reason).toContain('只接受文本')
    expect(fallbackMode([], get, 'sd2.5')).toBe('text')
    expect(fallbackMode(['v'], get, 'sd2.5')).toBe('ref')
  })
  it('模型影响参数域与配额：2.0 系列不锁比例、不认秒数', () => {
    // 用 4 秒那段打头：2.5 与 2.0 系列都收得下，五个模式才都该是亮的
    for (const m of ['sd2.5', 'sd2.0', 'sd2.0-1080p', 'sd2.0-4k', 'sd2.0-fast', 'sd2.0-mini'] as const) {
      expect(tabStates(['w', 'a', 'b'], get, m).every((t) => t.k === 'text' || t.enabled)).toBe(true)
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
      const states = tabStates(conn, get, m)
      // 这一行上只有这个型号做得了的事：编辑 / 延长、以及另一个参考 Tab 都不在
      expect(states.map((t) => t.k)).toEqual(['text', 'frames', mine])
      // 剩下的灰掉说的才是素材：文生视频灰着，因为画布上连了东西
      expect(states.filter((t) => !t.enabled).map((t) => t.k)).toEqual(['text'])
      expect(states.find((t) => t.k === mine)!.enabled).toBe(true)
      expect(modeAvailable('edit', conn, get, m)).toBe(false)
      expect(fallbackMode(conn, get, m)).toBe(mine)
    }
  })
  it('两个参考 Tab 互斥：只收图的型号进参考图，收多模态的进全能参考', () => {
    // Wan 2.2 只收参考图：全能参考不出现，参考图进得去，连着的视频本次不参与
    const wan = tabStates(conn, get, 'wan2.2')
    expect(wan.find((t) => t.k === 'ref')).toBeUndefined()
    expect(wan.find((t) => t.k === 'refImage')!.enabled).toBe(true)
    expect(visibleRefs(['a', 'w'], 'refImage', 'wan2.2', get)).toEqual(['a'])
    // 忽略一整类说的是同一句话，和首尾帧忽略视频一样，不逐个点名
    expect(wan.find((t) => t.k === 'refImage')!.note).toBe('此模式会忽略已连接的视频节点')
    // Seedance 2.0 反过来：参考图不出现，全能参考里那段 4 秒的视频照常参与
    const sd = tabStates(conn, get, 'sd2.0')
    expect(sd.find((t) => t.k === 'refImage')).toBeUndefined()
    expect(sd.find((t) => t.k === 'ref')!.enabled).toBe(true)
    expect(partition({ ...emptySlots(), tray: ['a', 'w'] }, 'ref', 'sd2.0', get).active).toEqual(['a', 'w'])
  })
  it('超出配额与用不上的素材都给得出理由，且不进入有效输入', () => {
    const frames = allocate(emptySlots(), conn, 'frames', get)
    const { active, skipped } = partition(frames, 'frames', 'sd2.5', get)
    expect(active).toEqual(['a', 'b'])
    expect(skipped.map((x) => x.id).sort()).toEqual(['v', 'w'])
    expect(skipped.every((x) => x.reason.includes('只使用图片'))).toBe(true)
    const many = { ...emptySlots(), tray: ['v', 'w'] }
    expect(partition(many, 'ref', 'sd2.5', get).skipped).toEqual([])
  })
  it('源视频时长不合规不是事后的黄字，是 Tab 进不去', () => {
    // 2 秒的视频：2.5 编辑要 4 秒起，进不去并指到 2.0；延长 2 秒起，照常进得去
    const short: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: m.kind === 'video' ? 2.1 : undefined } : null }
    const states = tabStates(conn, short, 'sd2.5')
    expect(states.find((t) => t.k === 'edit')!.reason).toBe('IJKL 视频时长不能小于四秒，换 Seedance 2.0 可以')
    expect(states.find((t) => t.k === 'extend')!.enabled).toBe(true)
    expect(modeAvailable('edit', conn, short, 'sd2.5')).toBe(false)
    expect(modeAvailable('edit', conn, short, 'sd2.0')).toBe(true)
    // 一秒的视频谁都编辑不了：说的是所有型号合起来的那条线（两秒），
    // 也不给「换 X 可以」这种指不到的出路
    const tiny: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: m.kind === 'video' ? 1 : undefined } : null }
    expect(tabStates(conn, tiny, 'sd2.5').find((t) => t.k === 'edit')!.reason).toBe('IJKL 视频时长不能小于两秒')
    // 判的只有「会被放进槽位的那一段」：第一段不合规就是进不去，
    // 不会因为画布上另有一段合规的视频就替用户换过去
    const first2s: MatGet = (id) => { const m = get(id)!; return m.kind === 'video' ? { ...m, dur: id === 'v' ? 2.1 : 10 } : m }
    expect(modeAvailable('edit', ['v', 'w'], first2s, 'sd2.5')).toBe(false)
    expect(modeAvailable('edit', ['w', 'v'], first2s, 'sd2.5')).toBe(true)
    // 从视频节点入口指名了哪一段，就按那一段判
    expect(modeAvailable('edit', ['w', 'v'], first2s, 'sd2.5', 'v')).toBe(false)
    // 时长还没读出来的先放行，读到了再判
    const loading: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: undefined } : null }
    expect(modeAvailable('edit', conn, loading, 'sd2.5')).toBe(true)
  })
  it('输入视频的上限也按型号分：2.0 系列只收到 15 秒，长片要换 2.5', () => {
    // 20 秒的视频：2.5 编辑 / 延长都收得下，2.0 系列一段都接不住
    const long: MatGet = (id) => { const m = get(id); return m ? { ...m, dur: m.kind === 'video' ? 20 : undefined } : null }
    for (const mode of ['edit', 'extend'] as const) {
      expect(modeAvailable(mode, ['v', 'w'], long, 'sd2.5')).toBe(true)
      for (const m of ['sd2.0', 'sd2.0-fast', 'sd2.0-mini'] as const) expect(modeAvailable(mode, ['v', 'w'], long, m)).toBe(false)
    }
    expect(tabStates(['v', 'w'], long, 'sd2.0').find((t) => t.k === 'edit')!.reason)
      .toBe('IJKL 视频时长不能超过十五秒，换 Seedance 2.5 可以')
    // 入口那句话说的是「所有型号合起来」的区间，上限跟着最宽的 2.5 走
    expect(sourceEntryReason(20, 'edit')).toBe('')
    expect(sourceEntryReason(31, 'edit')).toBe('这段视频 31s，编辑需要 2–30 秒的视频')
  })
  it('视频节点上的入口：没有型号接得住这段时长就灰掉', () => {
    // 2.1 秒：2.5 编辑不了，但 2.0 可以，所以入口照常能点，进去时自动换型号
    expect(sourceEntryReason(2.1, 'edit')).toBe('')
    expect(sourceEntryReason(2.1, 'extend')).toBe('')
    // 1 秒 / 40 秒：谁都接不住，入口处就灰掉并说出区间
    expect(sourceEntryReason(1, 'edit')).toBe('这段视频 1s，编辑需要 2–30 秒的视频')
    expect(sourceEntryReason(40, 'extend')).toBe('这段视频 40s，延长需要 2–30 秒的视频')
    // 时长还没读出来，不先拦
    expect(sourceEntryReason(undefined, 'edit')).toBe('')
  })
  it('一个模式都进不去的型号，在模型列表里就灰掉', () => {
    // 只做文生视频的型号：画布上一连素材就没得做，别让用户选进一个全灰的 Tab
    expect(modelUnusableReason(conn, get, 'wan2.2-ti2v-5b')).toContain('已连接素材')
    expect(modelUnusableReason([], get, 'wan2.2-ti2v-5b')).toBe('')
    // 只做图生视频的型号反过来：空画布上没得做
    // 缺素材时说的是「去画布上连什么」，和那个 Tab 灰掉时说的是同一句
    expect(modelUnusableReason([], get, 'wan2.2-i2v-a14b')).toBe('只做参考图，需要连接图片或视频节点')
    expect(modelUnusableReason(conn, get, 'wan2.2-i2v-a14b')).toBe('')
    // 五种模式都支持的型号，连或不连都有得做
    for (const m of ['sd2.5', 'sd2.0', 'kling-video-o1'] as const) {
      expect(modelUnusableReason(conn, get, m)).toBe('')
      expect(modelUnusableReason([], get, m)).toBe('')
    }
  })
  it('用不上的素材不在面板上占位，改由 Tab 悬浮说明', () => {
    // 时长不合规的那一段也一样：不摆一张灰缩略图在面板上，只在 Tab 上说一句
    const short: MatGet = (id) => { const m = get(id)!; return m.kind === 'video' ? { ...m, dur: id === 'w' ? 3 : 10 } : m }
    expect(visibleRefs(['a', 'v', 'w'], 'edit', 'sd2.5', short)).toEqual(['a', 'v'])
    expect(tabStates(['v', 'w'], short, 'sd2.5', () => 'v').find((t) => t.k === 'edit')!.note)
      .toBe('MNOP 视频时长不能小于四秒')
    // 换到收得下它的 Tab（参考素材 2 秒起），它就正常参与、正常显示
    expect(visibleRefs(['a', 'v', 'w'], 'ref', 'sd2.5', short)).toEqual(['a', 'v', 'w'])
    // 首尾帧只吃图片：连着的视频不摆「不参与」缩略图，进模式之前在 Tab 上就说清楚
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'frames')!.note).toBe('此模式会忽略已连接的视频节点')
    expect(tabStates(['a', 'b'], get, 'sd2.5').find((t) => t.k === 'frames')!.note).toBe('')
    // 超过配额同样只在 Tab 上说：Wan 图生视频只收 1 张图
    expect(tabStates(['a', 'b'], get, 'wan2.2-i2v-a14b').find((t) => t.k === 'refImage')!.note).toContain('最多使用 1 张图片')
    // 进不去的 Tab 说的是进不去的原因，不叠加忽略说明
    expect(tabStates(conn, get, 'sd2.5').find((t) => t.k === 'text')!.note).toBe('')
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
  it('移除首帧后不会将尾帧提升为首帧，也不会被连接同步重新填回', () => {
    const s = remove(allocate(emptySlots(), conn, 'frames', get), 'a')
    const next = allocate(s, conn, 'frames', get, false, [])
    expect(next.slotFirst).toBeNull(); expect(next.slotLast).toBe('b')
  })
  it('更换主视频将旧视频转为隐藏资产，不与参考素材互换', () => {
    const next = assign(allocate(emptySlots(), conn, 'edit', get), 'w', 'edit', get)!
    expect(next.slotEdit).toBe('w'); expect(next.tray).toEqual(['a', 'b']); expect(next.unused).toContain('v')
  })
  it('阻止不匹配的角色并清理断开的连接', () => {
    const s = allocate(emptySlots(), conn, 'edit', get)
    expect(assign(s, 'a', 'edit', get)).toBeNull()
    const next = allocate(s, ['a', 'b'], 'edit', get, false, [])
    expect(next.slotEdit).toBeNull(); expect(activeIds(next, 'edit')).toEqual(['a', 'b'])
  })
})
