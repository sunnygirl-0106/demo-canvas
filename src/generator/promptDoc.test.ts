import { describe, expect, it } from 'vitest'
import { CARET, docText, docWritten, marksOf, putAtCaret, replaceGroup, seedDoc, segKey, stripMarks, type Seg } from './promptDoc'
import type { MarkGroup, MarkRegion } from './marks'
const box = (t: number): MarkRegion => ({ t, tool: 'box', rect: [0.2, 0.3, 0.2, 0.2] })
const group = (id: string, regions: MarkRegion[], range: MarkGroup['range'] = null): MarkGroup => ({ id, regions, range })
const ctx = { name: 'TARL', direction: 'after' as const, duration: 5 }
const read = (doc: Seg[]) => docText(doc, ctx)

describe('提示词框里那句话是一份可编辑的文档', () => {
  it('替用户起的头读下来就是一句话', () => {
    expect(read(seedDoc('edit'))).toBe('把 视频 TARL 的')
    expect(read(seedDoc('extend'))).toBe('从 视频 TARL 向后延长 5s，')
  })
  it('句子就是标记的唯一出处：删掉哪一枚标签，这次任务里就没有它', () => {
    const doc = replaceGroup(seedDoc('edit'), group('g1', [box(1), box(2)], { start: 1, end: 3 }))
    expect(marksOf(doc)).toEqual([{ id: 'g1', range: { start: 1, end: 3 }, regions: [box(1), box(2)] }])
    // 用户在框里退格删掉了第二枚标记
    const cut = doc.filter((s) => !(s.t === 'mark' && s.region.t === 2))
    expect(marksOf(cut)).toEqual([{ id: 'g1', range: { start: 1, end: 3 }, regions: [box(1)] }])
    // 时间段那一枚也删了，这一组就不剩什么了
    expect(marksOf(stripMarks(doc))).toEqual([])
  })
  it('起头那几个字不算用户写过要求，写了才算', () => {
    const doc = replaceGroup(seedDoc('edit'), group('g1', [box(1)], { start: 1, end: 2 }))
    expect(docWritten(doc)).toBe('')
    expect(docWritten([...doc, { t: 'text', v: '把右侧的沙发改成红色' }])).toContain('右侧')
    // 没有句子的那些模式退回去看纯文字
    expect(docWritten([], '润色一下这段对白')).toContain('润色一下这段对白')
  })
  it('标签各有各的身份证，删掉一枚不会连累另一枚', () => {
    expect(segKey()).not.toBe(segKey())
  })
  it('@ 引来的素材落在光标那一点，句子里写的是标签不是 @名字', () => {
    const ref = { t: 'ref' as const, k: segKey(), id: 'n2', name: 'GVUI' }
    // 句首那枚源素材后面，用户把光标停在「的」和「镜头」之间
    const doc: Seg[] = [...seedDoc('edit'), { t: 'text', v: `第一${CARET}个镜头` }]
    const out = putAtCaret(doc, ref)
    expect(out.map((s) => s.t)).toEqual(['text', 'mat', 'text', 'text', 'ref', 'text'])
    expect(read(out)).toBe('把 视频 TARL 的第一 @GVUI 个镜头')
    // 占位字符没留在句子里
    expect(read(out)).not.toContain(CARET)
  })
  it('找不到光标就接在句尾，不至于把这一枚丢了', () => {
    const ref = { t: 'ref' as const, k: segKey(), id: 'n2', name: 'GVUI' }
    const out = putAtCaret(seedDoc('edit'), ref)
    expect(out[out.length - 1]).toBe(ref)
  })
  it('@ 引用不算用户自己写的要求', () => {
    expect(docWritten([...seedDoc('edit'), { t: 'ref', k: segKey(), id: 'n2', name: 'GVUI' }])).toBe('')
  })
})
