/** 线稿图标，路径与原型 / 截图一致；统一 24 viewBox。 */
import type { CSSProperties } from 'react'

interface P { size?: number; color?: string; sw?: number; style?: CSSProperties; className?: string }

const Svg = ({ size = 16, color = 'currentColor', sw = 2, style, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    {children}
  </svg>
)

export const IcLock = (p: P) => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
export const IcVideo = (p: P) => <Svg {...p}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></Svg>
export const IcImage = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></Svg>
export const IcText = (p: P) => <Svg {...p}><path d="M4 7V5h16v2M12 5v14M9 19h6" /></Svg>
export const IcPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IcSwap = (p: P) => <Svg {...p}><path d="M4 8h14l-3-3M20 16H6l3 3" /></Svg>
export const IcChev = (p: P) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const IcBack = (p: P) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>
export const IcShare = (p: P) => <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Svg>
export const IcBell = (p: P) => <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></Svg>
export const IcUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
export const IcFolder = (p: P) => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
export const IcGrid = (p: P) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
export const IcHistory = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" /></Svg>
export const IcCursor = (p: P) => <Svg {...p}><path d="M5 3l14 7-6 2-2 6z" /></Svg>
export const IcKeyboard = (p: P) => <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Svg>
export const IcTarget = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>
export const IcMinus = (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>
export const IcUpload = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>
export const IcExpand = (p: P) => <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>
export const IcScissors = (p: P) => <Svg {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></Svg>
export const IcCamera = (p: P) => <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Svg>
export const IcShots = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></Svg>
export const IcDownload = (p: P) => <Svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Svg>
export const IcSpeaker = (p: P) => <Svg {...p}><path d="M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6" /></Svg>
export const IcPhone = (p: P) => <Svg {...p}><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18.5h2" /></Svg>
export const IcMic = (p: P) => <Svg {...p}><path d="M12 4a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4M12 4a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4M8 9H5.5a2 2 0 0 0 0 4H8M16 9h2.5a2 2 0 0 1 0 4H16" /></Svg>
export const IcEye = (p: P) => <Svg {...p}><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></Svg>
export const IcAudio = (p: P) => <Svg {...p}><path d="M9 18V5l10-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></Svg>
export const IcPano = (p: P) => <Svg {...p}><ellipse cx="12" cy="12" rx="9" ry="4" /><circle cx="12" cy="12" r="8" /></Svg>
export const IcScript = (p: P) => <Svg {...p}><path d="M6 3h9l5 5v13H6z" /><path d="M15 3v5h5M9 13h7M9 17h5" /></Svg>
export const IcCompose = (p: P) => <Svg {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M18 9l4-2v10l-4-2" /></Svg>
export const IcCube = (p: P) => <Svg {...p}><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 22V12M3 7l9 5 9-5" /></Svg>
export const IcWarn = (p: P) => <Svg {...p} sw={3}><path d="M12 6v7M12 17v.5" /></Svg>

/**
 * 星钻：一大一小两枚四角星芒。每条边都往中心弯，小尺寸下四个角才立得住 ——
 * 直边画出来的是一个菱形块，不是「闪」。
 */
export const IcSparkle = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M9.5 5.6Q9.5 13.5 1.9 13.5 9.5 13.5 9.5 21.4 9.5 13.5 17.1 13.5 9.5 13.5 9.5 5.6Z" />
    <path d="M18.6 2.2Q18.6 6.4 14.5 6.4 18.6 6.4 18.6 10.6 18.6 6.4 22.7 6.4 18.6 6.4 18.6 2.2Z" />
  </svg>
)
/** 发送（生成）按钮里的纸飞机 */
export const IcSend = (p: P) => <Svg {...p}><path d="M4.5 12.5l15.5-7-7 15.5-1.8-6.3z" /><path d="M11.2 14.7l3.6-3.9" /></Svg>
/** 延长方向：向后为默认朝向，向前翻转 */
export const IcArrowR = (p: P) => <Svg {...p}><path d="M4 12h14" /><path d="M13 6l6 6-6 6" /></Svg>
/** 退出编辑 / 延长操作 */
export const IcClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
/** @ 呼出的素材面板顶上的搜索 */
export const IcSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>
export const IcPlay = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff"><path d="M8 5l11 7-11 7z" /></svg>
)

/** 模型 icon */
/** 勾：列表里「现在用的就是这一项」 */
export const IcCheck = (p: P) => <Svg {...p}><path d="M4 12.5l5 5L20 6.5" /></Svg>
export const IcSeedance = (p: P) => <Svg {...p}><rect x="5" y="10" width="2.5" height="8" rx="1" /><rect x="10.25" y="6" width="2.5" height="12" rx="1" /><rect x="15.5" y="8" width="2.5" height="10" rx="1" /></Svg>
export const IcWan = (p: P) => <Svg {...p}><path d="M4 12c2-4 4-6 8-6s6 2 8 6-2 6-8 6-6-2-8-6z" /></Svg>
export const IcKling = (p: P) => <Svg {...p}><circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" /><path d="M3 12h4M8 12h4M14 12h4" /></Svg>
/* ── 标记修改 ── */
/**
 * 入口用的套索：虚线圈 + 收绳 + 落点。比方框更像「圈一块出来」这件事，
 * 缩到 14px 仍看得出是个圈 —— 线宽 1.7、虚线 3.4/2.8 是按这个尺寸定的。
 */
export const IcLasso = ({ size = 14, color = 'currentColor', sw = 1.7, style, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={sw} strokeLinecap="round" style={style} className={className}>
    <ellipse cx="12" cy="9.4" rx="7.7" ry="5" strokeDasharray="3.4 2.8" />
    <path d="M9 13.9c-.7 2-.4 3.7.9 5" />
    <circle cx="10.4" cy="19.9" r="1.4" fill={color} stroke="none" />
  </svg>
)
export const IcFrame = (p: P) => <Svg {...p}><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" /></Svg>
export const IcBrush = (p: P) => <Svg {...p}><path d="M15 4l5 5-9.5 9.5L5 20l1.5-5.5z" /><path d="M13 6l5 5" /></Svg>
export const IcUndo = (p: P) => <Svg {...p}><path d="M4 10h9.5a4.5 4.5 0 1 1 0 9H8" /><path d="M8 6l-4 4 4 4" /></Svg>
export const IcTrash = (p: P) => <Svg {...p}><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></Svg>
/** 铅笔：局部修改这件事的图标，节点入口、标题栏的「编辑中」和面板里都用它 */
/**
 * 「正在编辑」那枚会写字的笔。和别的图标不同，它不是方的：写字要有一段跑道，
 * 所以自带一个 26×14 的 viewBox，宽度按它换算。
 *
 * 笔和墨是两条动画、同一个节拍：笔从左往右走（一路小幅摇摆，所以写出来是歪的），
 * 底下那道线用 stroke-dashoffset 跟着笔尖一点点露出来 ——
 * 看着才是「它写出来的」，而不是「它在一条画好的线上滑」。
 * 线本身也是波浪的：笔在抖，写出来的字就不该是直的。
 * 墨线标了 pathLength=1，所以 dasharray 直接用 0–1，不必去量这条曲线到底多长。
 *
 * 笔身和墨迹是两个颜色（--pen-body / --pen-ink，由用它的地方给）：
 * 同一个颜色摆在一起，笔杆和它刚写下的那道线糊成一团，分不清谁是笔、谁是字。
 * 笔尖那一小截和墨是同一支白（--pen-tip / --pen-ink）—— 它是这支笔正在写的那一笔，
 * 和地上那道痕本来就是同一样东西；只是笔尖实一些、写下来的那道痕淡一些，
 * 墨落在纸上总比笔尖里浅，也不至于把一句状态说得比正文还响。
 *
 * 笔身按真笔的几节分开画：笔尖、木头那一圈、笔杆、杆上一道箍。
 * 一块斜着的方板也能读成笔，但读到的是「一个图标」；分了节才读成「一支笔」。
 * 形状竖着画、整组再转 45°：斜着摆的每一段都要自己算坐标，一处调不好整支笔就歪了。
 * 转角写在**内层** g 上 —— 动画改的是外层那个 g 的 CSS transform，
 * 两者落在同一个元素上时 CSS 会把 transform 属性整条顶掉，笔会当场躺平。
 */
export const IcWriting = ({ size = 14, color = 'currentColor', sw = 1, style, className }: P) => (
  <svg width={(size * 26) / 14} height={size} viewBox="0 0 26 14" fill="none"
    style={style} className={`ic-writing${className ? ` ${className}` : ''}`}>
    <path className="ic-writing-ink" pathLength={1} fill="none" stroke={`var(--pen-ink, ${color})`}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      d="M3.2 12.7c1.1-1.2 1.9.8 3-.2s1.9-1.2 3-.2 1.9.8 3-.2 1.9-1.2 3-.2" />
    <g className="ic-writing-pen">
      <g transform="translate(2.9 12.4) rotate(45)">
        {/* 笔杆：顶上收成半圆，那是笔的屁股 */}
        <path fill={`var(--pen-body, ${color})`}
          d="M-1.25-4.1v-7.8a1.25 1.25 0 0 1 2.5 0v7.8z" />
        {/* 木头那一圈：比笔杆窄一丝，笔杆到笔尖之间的那一节 */}
        <path fill={`var(--pen-body, ${color})`} d="M-1.15-4.1h2.3l.1 1.6h-2.5z" opacity=".82" />
        {/* 笔尖：和墨同一支白，只是实一档 —— 它正在写的那一笔，和地上那道痕是同一样东西 */}
        <path fill={`var(--pen-tip, var(--pen-ink, ${color}))`} d="M-1.05-2.5h2.1L0 0z" />
        {/* 杆上那道箍：一根发丝宽，小尺寸下只剩一点质感，不会读成第二支笔 */}
        <path stroke={`var(--pen-tip, var(--pen-ink, ${color}))`} strokeWidth=".6" opacity=".4" d="M-1.25-9.6h2.5" />
      </g>
    </g>
  </svg>
)
/* 版本记录里那三枚：带杆的返回箭头、方框加号（添加到画布）、外指箭头（在画布中查看）——
   路径照设计稿的 16 viewBox 等比放到 24 上，形状一模一样。 */
export const IcArrowL = (p: P) => <Svg {...p}><path d="M13.5 5.25L6.75 12l6.75 6.75" /><path d="M6.75 12h12" /></Svg>
export const IcPlusBox = (p: P) => <Svg {...p}><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.75" /><path d="M12 8.25v7.5M8.25 12h7.5" /></Svg>
export const IcOpenOut = (p: P) => <Svg {...p}><path d="M14.25 3.75h6v6" /><path d="M20.25 3.75l-7.5 7.5" /><path d="M18.75 14.25v4.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5h4.5" /></Svg>
export const IcPencil = (p: P) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
