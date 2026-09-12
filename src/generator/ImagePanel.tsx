import { useGenerator } from '../store/generator'
import { useCanvas } from '../store/canvas'
import { randomPhoto } from '../demo/assets'
import { fakeGen } from '../demo/fake'
import BottomBar from './BottomBar'
import PromptBox from './PromptBox'
import { IcCamera, IcChev, IcImage } from '../ui/icons'

/** 图片节点面板：无模式 Tab、无素材区 */
export default function ImagePanel({ nodeId }: { nodeId: string }) {
  const gen = useGenerator((s) => s.map[nodeId])
  const patch = useGenerator((s) => s.patch)
  const busy = useCanvas((s) => s.nodes.find((n) => n.id === nodeId)?.data.busy)

  return (
    <>
      <PromptBox
        value={gen?.prompt ?? ''}
        onChange={(v) => patch(nodeId, { prompt: v })}
        placeholder={[{ t: '描述你想生成的图片内容，输入 @ 引用素材' }]}
        lit={-1}
        mats={[]}
      />
      <BottomBar
        cost={94}
        busy={!!busy}
        onSend={() => fakeGen(nodeId, 1500, { src: randomPhoto() })}
        left={
          <>
            <div className="gp-model"><i className="model-dot" />phan nano l…<IcChev size={13} color="var(--ink-2)" sw={2} /></div>
            <div className="gp-sep" />
            <div className="gp-chip"><span style={{ fontSize: 11 }}>☐</span>参数</div>
            <div className="gp-chip"><IcImage size={12} />1张</div>
            <div className="gp-chip"><IcCamera size={12} />摄像机</div>
          </>
        }
      />
    </>
  )
}
