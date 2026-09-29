import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Mode, TabState } from './materialLayout'
import { IcModeEdit, IcModeExtend, IcModeFrames, IcModeRef, IcModeRefImage, IcModeText } from '../ui/icons'
import { useTip } from './useTip'

interface Props {
  mode: Mode
  /** 由画布上连了什么算出来，模型不参与。灰掉的 Tab 仍然占位，悬浮说明为什么。 */
  tabs: TabState[]
  onPick: (m: Mode) => void
  /**
   * Tab 行左段的插槽，放这一次用到的素材缩略图。
   * 收起态的 Tab 只剩一颗球，一行里空着的地方足够摆下那几张图 ——
   * 两件事挤进同一行，省下来的一整行高度归提示词。
   */
  mid?: React.ReactNode
  /**
   * Tab 行右端的插槽，放「把提示词框撑大」那一枚。
   * 摆在这一排的最右边、一条细线之外 —— 它和模式不是一类事（一个是「在做什么」，
   * 一个是「怎么看」），但共用这一个角；而这一排球是右沿钉死往左长的，
   * 放在球左边的东西一展开就会被球压住，只有右边这一侧放得稳。
   */
  end?: React.ReactNode
}

/** 每枚图标占的格子。图标本身比它小得多，四周那圈空是留给放大和悬停的余量。 */
const CELL = 48
/** 光标的影响半径：离球心这么远就完全不受它影响了 */
const REACH = 90
/** 正对着光标的那颗最多长这么多（1 = 原大） */
const GROW = 0.5
/**
 * 光标落点每帧往真实位置追这么多。追得不满，鼓包就比手慢半拍 ——
 * 手甩过去，那一包在后面赶，像底下压着一层有粘度的东西；一比一跟着走的话，
 * 它只是「被算出来的一个尺寸」，读不出重量。
 */
const TRACK = 0.16
/** 放大幅度每帧往目标追这么多。比 TRACK 再慢一档：起落比横着走更该软 */
const RAMP = 0.14
/**
 * 展开之后再等这么久，磁吸才醒。
 *
 * 球从当前那颗背后依次抽出来要走小半秒，这中间光标底下的球一路在换 ——
 * 磁吸要是同时开着，就是一排还在就位的球被同时揉了一遍，两段动作互相搅。
 * 等它们站定再醒，读起来是两句话：先「这儿还有几颗」，再「你正指着这一颗」。
 */
const WAKE = 220
/** 托盘有多高。收起态它就是最外层那枚药丸本身，所以这个数不能动。 */
const TRAY = 40
/** 托盘左右各留这么一口气，图标不贴着边 */
const PAD = 5
/** 图标基准边长（没被放大的时候） */
const IC_SIZE = 18
/**
 * 收起态那枚药丸里，名字占这么长。
 * 钉死在「四个字」上（模式名有三字也有四字）：不钉死的话换个模式药丸就长短一跳，
 * 而它是面板顶上唯一从头留到尾的锚；三个字的名字在这一格里居中，看不出来空了两像素。
 */
const PILL = 76
/**
 * 收起态那一格有多宽 —— 算出来正好让托盘等于原来那枚药丸（图标那一格 + 名字 + 左右的气）。
 * 展开之后这一格就退回普通的 CELL，名字那一段是被托盘一起收走的。
 */
const SOLO = TRAY + PILL - PAD * 2

/** 当前那一颗排到最右，其余的保持原次序 —— 这一行是从右往左读的 */
const order = (tabs: TabState[], mode: Mode): Mode[] =>
  [...tabs.filter((t) => t.k !== mode), ...tabs.filter((t) => t.k === mode)].map((t) => t.k)

const ICON: Record<Mode, (p: { size?: number }) => React.ReactElement> = {
  text: IcModeText, frames: IcModeFrames, refImage: IcModeRefImage,
  ref: IcModeRef, edit: IcModeEdit, extend: IcModeExtend,
}

/**
 * 磁吸的两个读数：光标落在这一排右沿往左多远（x），和此刻放大到几成（amp）。
 *
 * 两个都不直接跟着事件走 —— 每帧各往目标追一截，追出来的才是屏幕上用的那个值。
 * 这一层是整个动效的身体：
 *   · x 追得慢，鼓包就吊在手后面半拍，像底下压着一层有粘度的东西；
 *     直接用 e.clientX，那一包和光标严丝合缝地钉在一起，读到的是「一个跟着鼠标的尺寸」，不是一件有重量的东西。
 *   · amp 从 0 涨到 1、离开时再退回 0，所以鼓包是慢慢瘪下去的。
 *     早先这里是「一离开就把坐标清成 null」—— 整排球啪一下同时弹平，
 *     那一帧读起来像控件坏了一下，而不是手拿开了。
 * 尺寸的插值全在这儿做，CSS 那边就不该再叠一层 transition（叠了是两层缓动互相追，永远到不了位）。
 */
function useMagnet() {
  /** 渲染用的那一份。每帧换一次，这一行就六颗球，重渲染比让 CSS 去追便宜。 */
  const [m, setM] = useState<{ x: number | null; amp: number }>({ x: null, amp: 0 })
  const r = useRef({ x: null as number | null, tx: null as number | null, amp: 0, to: 0, ready: false, raf: 0, wake: 0 as ReturnType<typeof setTimeout> | 0 })
  const run = () => {
    if (r.current.raf) return
    const step = () => {
      const s = r.current
      const dx = (s.tx ?? s.x ?? 0) - (s.x ?? 0)
      const da = s.to - s.amp
      s.x = (s.x ?? 0) + dx * TRACK
      s.amp += da * RAMP
      const moving = Math.abs(dx) > 0.2 || Math.abs(da) > 0.003
      /*
       * 停下来的时候，幅度归零的那一份要收干净（坐标一起清掉）：
       * 留着上一回的半口气，下次进来鼓包会从那个旧位置先弹一下再飞过来。
       * 也正因为清掉了，下一轮醒来时坐标是空的，鼓包从右沿那颗身上一路扫到手底下（见 aim）。
       */
      if (!moving && !s.to) { s.amp = 0; s.x = null }
      s.raf = moving ? requestAnimationFrame(step) : 0
      /* 没动就别惊动 React：磁吸没醒的那几百毫秒里，鼠标每挪一下都会走到这儿 */
      setM((v) => (v.x === s.x && v.amp === s.amp ? v : { x: s.x, amp: s.amp }))
    }
    r.current.raf = requestAnimationFrame(step)
  }
  useEffect(() => () => { cancelAnimationFrame(r.current.raf); clearTimeout(r.current.wake) }, [])
  return {
    m,
    /** 鼠标进来：先让球散开，过了 WAKE 磁吸才醒 */
    wake: () => {
      clearTimeout(r.current.wake)
      r.current.wake = setTimeout(() => {
        r.current.ready = true
        if (r.current.tx != null) { r.current.to = 1; run() }
      }, WAKE)
    },
    /** 鼠标出去：目标幅度退回 0，鼓包自己瘪下去 */
    rest: () => { clearTimeout(r.current.wake); r.current.ready = false; r.current.tx = null; r.current.to = 0; run() },
    /**
     * 光标动了。只记下目标，追过去是每帧的事。
     *
     * 醒来的那一帧坐标是空的（上一轮收干净了），所以插值是从右沿 0 起步的 ——
     * 鼓包先从当前那颗药丸身上冒出来，再顺着一排球扫到手底下：
     * 球本来就是从那颗药丸背后抽出来的，这道浪接着往同一个方向走，两句话是一句。
     */
    aim: (x: number) => {
      const s = r.current
      s.tx = x
      if (s.ready) s.to = 1
      else if (s.x == null) s.x = x
      run()
    },
  }
}

/**
 * 模式切换：一排玻璃球，静止时只剩当前那一颗。
 *
 * 面板顶上说的是「我正在做什么」，不是一排待选项 —— 所以静止态收成一颗球，
 * 鼠标进来（或键盘聚焦进来）其余的才从它背后往左抽出来，由近及远地依次到位。
 * 当前那一颗钉在最右边，从头到尾不挪窝：它是这一行的锚，展开只是它左边长出几颗可选的 ——
 * 换成「按固定次序排、当前那颗夹在中间」的话，展开那一下它自己会往左飘半行，
 * 「我正在做什么」这句话就一直在动。
 * 展开之后光标底下那颗会鼓起来、微微抬起，像有东西顶着它走：
 * 一排等大的圆点谁也没在说「你现在指着的是这一颗」，这一下鼓起来就是那句话。
 * 名字不刻在球上（35px 的球上刻不下四个字），而是常驻在整排的右端：
 * 收起时它读的是当前这颗，展开后光标扫到哪颗就换成哪颗 —— 一个固定的读数位，
 * 比「每颗球底下各浮一行字」安静，也不会压在提示词第一行上。
 */
export default function ModeTabs({ mode, tabs, onPick, mid, end }: Props) {
  /** 展开 / 收起。专注态只传一项进来，没有可收的东西，那时就一直是展开态。 */
  const [open, setOpen] = useState(false)
  /**
   * 磁吸：光标离这一行右沿多远、此刻放大到几成。两个数都由 useMagnet 一帧一帧地追出来。
   *
   * 量的是右沿不是左沿：这一行是右边钉住、往左长的，展开那一下左沿会往左跑掉大半行。
   * 照左沿算的话，进到收起态那颗球上不动，展开完成时那一截旧坐标就落到了最左边那颗上 ——
   * 鼠标底下明明是最右那颗，鼓起来的却是最左那颗，得再动一下鼠标才纠正得回来。
   */
  const { m, wake, rest, aim } = useMagnet()
  /** 悬在哪一颗上：名字就浮在它底下 */
  const [hot, setHot] = useState(-1)
  /*
   * 灰掉的那颗要说的是一整句「哪个模式 + 为什么点不了」，比一个名字长得多：
   * 球底下那行字是贴着球心居中的，一整句话在最右那颗底下会顶出面板 ——
   * 所以这一句仍旧走全站通用的那枚说明气泡（它自己会挑边、也不会被面板裁掉）。
   */
  const { tip, node: tipNode } = useTip()
  const solo = tabs.length <= 1
  const shown = open || solo
  /*
   * 摆放次序：当前那一颗在最右，其余的按原次序排在它左边。
   *
   * 只在收起的时候重排。展开着换模式要是当场重排，整排球会跳一格 ——
   * 用户刚点中的那颗从手底下跑掉了。所以展开期间次序冻住（青色反光就地移过去就行），
   * 收回去之后再归位：那时其余几颗都是零宽的，重排一眼也看不见。
   */
  const [rank, setRank] = useState<Mode[]>(() => order(tabs, mode))
  const keys = tabs.map((t) => t.k).join()
  useEffect(() => {
    if (!shown) setRank(order(tabs, mode))
    // tabs 每次渲染都是新数组，认它的内容（keys）而不是它本身，否则这条每帧都要跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mode, keys])
  /* 换型号会换掉一整排 Tab：冻住的次序里没有的那几颗按原次序补在最前面（排序是稳定的） */
  const line = useMemo(() => {
    const pos = (m: Mode) => rank.indexOf(m)
    return [...tabs].sort((a, b) => pos(a.k) - pos(b.k))
  }, [tabs, rank])
  const at = Math.max(0, line.findIndex((t) => t.k === mode))

  const enter = () => setOpen(true)
  const leave = () => { setOpen(false); rest(); setHot(-1) }
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    aim(e.currentTarget.getBoundingClientRect().right - e.clientX)
  }

  /** 换一颗球：点当前这一颗只是「把其余的拿出来看看」（触屏没有悬浮，得有这条路） */
  const pick = (t: TabState) => {
    if (t.k === mode) { setOpen((v) => !v); return }
    if (!t.enabled) return
    onPick(t.k)
  }

  /*
   * 「真的展开了」和「只剩一颗」是两件事。专注态只传一项进来，shown 一直为真，
   * 可那时整行就这一颗球，没有第二颗要跟它区分 —— 青色（和球底那一点）只在
   * 真的排开好几颗、需要指认「哪一颗是现在这颗」的时候才该出现。
   */
  const expanded = open && !solo
/**
   * 每枚图标离这一条右沿有多远（不含放大那部分）。磁吸只在展开态起作用，
   * 而展开态所有格子等宽 —— 名字那一段是跟着托盘一起收走的，不在这笔账里。
   * 从右边数起：这一条是右沿钉死、往左长的。
   */
  const centers = useMemo(
    () => line.map((_, j) => PAD + (line.length - 1 - j) * CELL + CELL / 2),
    [line],
  )

  return (
    <div className="gp-tabrow">
      {mid}
      <div className="gp-tabend">
      {/*
        * live = 展开着、并且磁吸醒着。它管的是「格子还裁不裁」：
        * 展开那半秒里要裁（图标一枚接一枚从格子里露出来），站定之后不裁（鼓起来的那枚要顶出坞沿），
        * 一开始收就又得裁上 —— 不然格子收成零宽的路上，图标会漏在坞外面。
        */}
      <div className={'gp-tabs' + (expanded ? ' open' : '') + (expanded && m.amp > 0.002 ? ' live' : '')} role="tablist"
           onMouseEnter={() => { enter(); wake() }} onMouseLeave={leave} onMouseMove={move}
           /* 键盘进来只展开、不唤醒磁吸：没有光标，那颗鼓包会凭空落在最右边 */
           onFocusCapture={enter}
           /* 焦点在这几颗球之间挪不算离开：不加这一句，Tab 键往下走会先收起再展开，闪一下 */
           onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) leave() }}>
        {line.map((t, i) => {
          const on = t.k === mode
          const Ic = ICON[t.k]
          /*
           * 果冻光标：球心离光标越近长得越大。球心按格子算、并且和 m.x 一样从右边数起 ——
           * 不按它自己量出来的位置：鼓起来的球会把邻居推开，照量出来的位置算，
           * 位置和大小就互相追着改，一排球会抖。
           *
           * 衰减走 smoothstep 不走直线：直线的话影响圈边缘有一道折角 ——
           * 光标横着扫过去，每越过一颗球的边界就顿一下，一排球是一段一段地起伏；
           * 两头都平的这条曲线接得上，扫过去才是一道连续推过去的浪。
           */
          const c = centers[i]
          const f = m.x == null ? 0 : Math.max(0, 1 - Math.abs(m.x - c) / REACH)
          const k = 1 + GROW * m.amp * f * f * (3 - 2 * f)
          const hv = shown && hot === i
          /* 收起态整条只留当前那一颗：其余的格子被托盘裁掉 —— 是裁掉不是不存在，展开时它们还在原位 */
          const show = shown || on
          const say = tip(t.enabled ? '' : `${t.label}：${t.reason}`)
          const style = {
            /*
             * 展开到位该有多宽。收起态当前那一格要把名字一起兜住，所以它单独一个宽度。
             * 这一条走 .5s 的缓动（见 .gp-orb 的 transition）。
             */
            '--slot': (show ? (on && !expanded ? SOLO : CELL) : 0) + 'px',
            /*
             * 此刻被光标顶出来多少。只顶出格子的 .75：全跟着长的话整排会被推得太散，
             * 像被挤开的一串珠子。这一条不给 transition —— 那一路插值 useMagnet 每帧已经做完了。
             */
            '--bump': (show ? CELL * (k - 1) * 0.75 : 0) + 'px',
            /* 图标此刻多大。基准 18，正对着光标的那枚最多到 27 */
            '--ic': IC_SIZE * k + 'px',
            /* 鼓起来的同时往上抬一点：只是变大像是贴在托盘上，抬起来才是被顶起来的 */
            '--lift': (show ? -(k - 1) * 14 : 0) + 'px',
            /*
             * 错峰，只在展开这一程有。离当前那枚越远出来得越晚，看得出是从它背后一枚接一枚抽出来的；
             * 挨着的那一枚一点不等 —— 等一档整条托盘开头会先愣一下，那是「卡了」不是「在长」。
             * 当前那一枚反过来要等一等：它这一下是「把名字收走、让出位置」，
             * 抢在第一枚顶上来之前收，托盘会先瘪一截再长开。
             *
             * 收回去时一律不等。收的时候其余四枚一起退、当前这枚同时把名字接回来，
             * 两边用同一条曲线，宽度才是一路减到底 —— 错开半拍的话它会先缩过头再弹回来（量出来是 12px）。
             */
            '--wait': (expanded
              ? (on ? 120 : Math.max(0, Math.abs(i - at) - 1) * 55)
              : 0) + 'ms',
            /* 出场那一下从六成大弹到原大。走 transform、不碰布局，所以和每帧的放大叠得住 */
            '--sc': show ? 1 : 0.6,
          } as CSSProperties
          return (
            <button key={t.k} role="tab" aria-selected={on} aria-disabled={!t.enabled}
                    aria-label={t.reason ? `${t.label}：${t.reason}` : t.label}
                    className={'gp-orb' + (on ? ' on' : '') + (t.enabled ? '' : ' off') + (hv ? ' hot' : '')}
                    style={style} tabIndex={show ? 0 : -1}
                    {...say}
                    onMouseEnter={(e) => { setHot(i); say.onMouseEnter(e) }}
                    onFocus={(e) => { setHot(i); say.onFocus(e) }}
                    onBlur={() => { setHot(-1); say.onBlur() }}
                    onClick={() => pick(t)}>
              <span className="gp-orb-ic" aria-hidden><Ic /></span>
              {/*
                * 收起态这枚药丸里跟着一个名字：那时整条只剩它，「我正在做什么」这句话本来就该读得出来。
                * 展开之后名字收成零宽 —— 那时一排图标各有各的位置，再留一截字在最右边，
                * 整条就一头长一头短，磁吸那道浪扫到尽头会被那截字顶住。
                */}
              {on && <span className="gp-orb-name" aria-hidden>{t.label}</span>}
              {/* 当前那枚底下一点青：一排等大的图标里，颜色还不够钉死「哪一枚是现在这枚」 */}
              <span className="gp-orb-dot" aria-hidden />
              {/* 展开后图标上没地方写字：名字在悬浮时从托盘底下浮出来。灰掉的那枚把名字让给说明气泡 */}
              {!on && t.enabled && <span className="gp-orb-tip" aria-hidden>{t.label}</span>}
            </button>
          )
        })}
      </div>
      {end}
      </div>
      {tipNode}
    </div>
  )
}
