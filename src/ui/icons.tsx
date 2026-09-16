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

/** 星钻 */
export const IcStar = ({ size = 14, color = '#e7ebee' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 14l.7 1.6 1.6.7-1.6.7L5 18.6l-.7-1.6-1.6-.7 1.6-.7z" />
  </svg>
)
/** 积分：单枚五角星 */
export const IcCredit = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.1 6.3L20.5 10l-5.2 3.8L17 20l-5-3.6L7 20l1.7-6.2L3.5 10l6.4-1.7z" />
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
