import { useCallback, useEffect, useState } from 'react'
import { isFocusNode, useCanvas } from '../store/canvas'
import { useGenerator } from '../store/generator'
import { matOf } from '../demo/assets'
import { landResult } from '../demo/fake'
import { activeIds, promptHint, tabStates, TABS, type MatGet } from './materialLayout'
import { taskError } from './videoTask'
import ModeTabs from './ModeTabs'
import MaterialRow from './MaterialRow'
import PromptBox from './PromptBox'
import { docText, marksOf, seedDoc, type Seg } from './promptDoc'
import BottomBar from './BottomBar'
import PromptSeg from './PromptSeg'
import VideoSettings from './VideoSettings'
import { useTip } from './useTip'
import { IcCollapse, IcExpand } from '../ui/icons'
/**
 * 面板只剩下「这句话怎么写」和「用什么参数生成」：标记和延长方向都长在节点上了，
 * 所以编辑和延长两边的面板现在完全一样，差异全在节点那半截。
 *
 * docVer / onBump 住在节点那一层：句子由面板（插一枚 @ 引用）和节点（圈一处标记）两处改动，
 * 两边都得让可编辑区重挂一遍。
 */
export default function VideoPanel({ nodeId, docVer, onBump }: { nodeId: string; docVer: number; onBump: () => void }) {
  const nodes = useCanvas((s) => s.nodes)
  const gen = useGenerator((s) => s.map[nodeId])
  const get: MatGet = useCallback((id) => matOf(useCanvas.getState().nodes.find((n) => n.id === id)), [nodes])
  /** 专注态：从视频上方入口长出来、还没出片的那段时间。Tab 收成一项、句首铁打，只在这时候。 */
  const self = nodes.find((n) => n.id === nodeId)
  const focus = !!self && isFocusNode(self)
  const patch = useGenerator((s) => s.patch)
  /** 灰掉的控件为什么点不了，悬浮 / 聚焦就说 */
  const { tip, node: tipNode } = useTip()
  /** 提示词框撑大 / 收回。只管这块可编辑区有多高，不动面板别的地方。 */
  const [big, setBig] = useState(false)
  /**
   * 进了编辑 / 延长就替用户把这句话的开头写好（「把 视频 的」「从 视频 向后延长 5s，」）。
   * 只起这一次头：删光了不会自动送回来 —— 那是开头，不是模板。
   *
   * 只有专注态才起头：普通节点的源视频是从连线里挑的、随时会换，
   * 预置一枚带标签的句首，换一根线它就指错了人。
   */
  useEffect(() => {
    const g = useGenerator.getState().map[nodeId]
    if (!focus || !g || g.seeded || (g.mode !== 'edit' && g.mode !== 'extend')) return
    const mat = g.slotEdit ? get(g.slotEdit) : null
    if (!mat) return
    const doc = [...seedDoc(g.mode), ...g.doc]
    patch(nodeId, { doc, seeded: true, marks: marksOf(doc), prompt: docText(doc, { name: mat.name, direction: g.direction, duration: g.params.duration }) })
    onBump()
  }, [nodeId, focus, gen?.mode, gen?.slotEdit, gen?.seeded, get, patch, onBump])
  if (!gen) return null
  const source = gen.slotEdit ? get(gen.slotEdit) : null
  /**
   * 句子改了就把它记下来：marks 和 prompt 都从句子推出来 ——
   * 删掉一枚标签，这次任务里也就没有它；这一句念出来的样子就是任务记录里的 prompt。
   */
  const say = (doc: Seg[]) => docText(doc, { name: source?.name, direction: gen.direction, duration: gen.params.duration })
  const setDoc = (doc: Seg[]) => patch(nodeId, { doc, marks: marksOf(doc), prompt: say(doc) })
  /** 由外部改动句子（插入这一次的标签）：内容换了，可编辑区得重挂一遍 */
  const writeDoc = (doc: Seg[], extra?: Record<string, unknown>) => {
    patch(nodeId, { doc, marks: marksOf(doc), prompt: say(doc), ...extra })
    onBump()
  }
  const mats = activeIds(gen, gen.mode).map((id) => get(id)!).filter(Boolean)
  /** 做不成的原因一律挂在生成按钮上（灰掉 + 悬浮说明），面板里不再留黄色小字 */
  const error = taskError(gen, get)
  const busy = gen.tasks.some((task) => task.status === 'running')
  /** Tab 能不能进 = 模型有没有这个能力 ∧ 这个模式容纳不容纳得下连着的素材。 */
  // 源视频一个节点只有一份：每个 Tab 判的都是手上这一段，没有就是连着的第一段
  const tabs = tabStates(gen.conn, get, gen.model, () => gen.slotEdit)
  /** 演示估算：按秒计价，1080p 贵一档，不接计费 —— 默认 5 秒 720p 是 188 星钻 */
  const cost = Math.round(gen.params.duration * (gen.params.resolution === '1080p' ? 47 : 37.6))
  const send = () => {
    // 提交不合规的任务这条路已经在按钮上堵死了（灰掉 + 悬浮说明），真抛出来只可能是代码问题
    try {
      const taskId = useGenerator.getState().submit(nodeId, get)
      // 提交那一刻的 payload 就是这一版的全部来历，之后改草稿不能倒着改写它
      const payload = useGenerator.getState().get1(nodeId).tasks.find((t) => t.id === taskId)?.payload
      window.setTimeout(() => {
        useGenerator.getState().complete(nodeId, taskId)
        if (payload) landResult(nodeId, taskId, payload)
      }, 1400)
    }
    catch (e) { console.error(e) }
  }
  return <>
    {tipNode}
    {/*
      * 专注态只有一件事可做，源和模式都锁死了：Tab 数组收成一项，读起来就是这次任务的标题
      * （ModeTabs 里点当前项只是把其余的展开，所以它天然换不动模式）。
      */}
    <ModeTabs mode={gen.mode}
      tabs={focus ? [{ k: gen.mode, label: TABS.find((t) => t.k === gen.mode)!.label, enabled: true, reason: '' }] : tabs}
      onPick={(mode) => useGenerator.getState().setMode(nodeId, mode, get)}
      mid={<MaterialRow nodeId={nodeId} gen={gen} get={get} />}
      /*
       * 这一排最右边：一条细线，然后是「把框撑大」。
       * 细线是必要的 —— 线左边说的是「这次要做哪件事」，右边说的是「这块框怎么看」，
       * 两件不同类的事挤在同一个角上，不划一道就会被读成一排同类的开关。
       */
      end={<>
        <i className="gp-tabrow-sep" aria-hidden />
        <button className={'gp-grow' + (big ? ' on' : '')} aria-pressed={big}
          aria-label={big ? '收起提示词框' : '放大提示词框'} {...tip(big ? '收起提示词框' : '放大提示词框')}
          onClick={() => setBig((v) => !v)}>
          {big ? <IcCollapse size={16} sw={1.8} /> : <IcExpand size={16} sw={1.8} />}</button>
      </>} />
    {/*
      * 提示词框里是一整句可以编辑的话：「把 视频X 中 00:01–00:03 时间段里的 00:01 的 …」，
      * 读下来就是这次任务的全部意思。「把」「中」「时间段里的」都是普通文字，能删能改；
      * 标签是原子，退格一次整枚消失，删掉哪一枚，这次任务里就没有它。
      */}
    {/*
      * 方向和秒数一起进 ver：句子里那枚 dur 标签念出来的样子就由这两个数决定，
      * 它们变了这一句就换了内容 —— 而可编辑区只在 ver 变的时候重挂，不然屏幕上还停在上一次那句。
      * 这两个开关都在节点上，改它们的时候没人在框里打字，重挂那一下不会把光标从谁手里抢走。
      */}
    <PromptBox doc={gen.doc} ver={`${gen.mode}:${gen.direction}:${gen.params.duration}:${docVer}`} onDoc={setDoc}
      renderSeg={(s) => <PromptSeg s={s} doc={gen.doc} mat={source} get={get} mode={gen.mode} direction={gen.direction} duration={gen.params.duration}
        role="源视频" />}
      placeholder={promptHint(gen.mode, !!gen.slotLast).map((p) => p.t).join('')} mats={mats}
      onInsert={(doc, m) => writeDoc(doc, { references: { ...gen.references, [m.name]: m.id } })}
      /*
       * 专注态的句首是铁打的：那枚源素材标签就是这句话的主语，删了这句话不成立。
       * 退格删掉之后在读回 DOM 那一步补回来，再让可编辑区重挂一遍（光标会掉回句尾，这是代价）。
       */
      locked={focus ? gen.doc.filter((s) => s.t === 'mat' || s.t === 'dur').map((s) => (s as { k: string }).k) : undefined}
      onRestore={onBump} big={big} />
    <BottomBar busy={busy} disabled={!!error} reason={error ?? undefined} cost={cost} onSend={send} left={<VideoSettings nodeId={nodeId} gen={gen} source={source} get={get} focus={focus} />} />
  </>
}
