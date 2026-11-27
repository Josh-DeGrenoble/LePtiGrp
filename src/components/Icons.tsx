type P = { size?: number; filled?: boolean; className?: string }
const svg = (size: number, children: React.ReactNode, className?: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{children}</svg>
)
export const IconGear = ({ size = 24 }: P) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>)
export const IconUser = ({ size = 24 }: P) => svg(size, <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)
export const IconUserMinus = ({ size = 22 }: P) => svg(size, <><circle cx="10" cy="8" r="4" /><path d="M2 21c0-4 4-6 8-6s8 2 8 6" /><path d="M17 11h6" /></>)
export const IconBack = ({ size = 26 }: P) => svg(size, <path d="M15 18l-6-6 6-6" />)
export const IconDown = ({ size = 24 }: P) => svg(size, <path d="M6 9l6 6 6-6" />)
export const IconPlus = ({ size = 28 }: P) => svg(size, <><path d="M12 5v14" /><path d="M5 12h14" /></>)
export const IconSend = ({ size = 22 }: P) => svg(size, <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>)
export const IconMail = ({ size = 28 }: P) => svg(size, <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></>)
export const IconMoney = ({ size = 28 }: P) => svg(size, <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>)
export const IconCart = ({ size = 28 }: P) => svg(size, <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" /></>)
export const IconPin = ({ size = 22, filled }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7l-4 4v-4H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    <path d="M12 7v4M12 13.5v.5" stroke={filled ? 'var(--bg)' : 'currentColor'} strokeWidth={2.2} strokeLinecap="round" />
  </svg>
)
export const IconStar = ({ size = 20, filled }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
)
export const IconImages = ({ size = 30 }: P) => svg(size, <><rect x="6" y="2" width="16" height="14" rx="1" /><path d="M2 6v16h16" /><path d="M6 13l4-4 3 3 3-4 6 6" /></>)
export const IconTag = ({ size = 22 }: P) => svg(size, <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7" cy="7" r="1.5" /></>)
export const IconLeave = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M7 12h10" stroke="var(--bg)" strokeWidth={2.5} strokeLinecap="round" /></svg>
)
export const IconShare = ({ size = 20 }: P) => svg(size, <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>)
export const IconPencil = ({ size = 16 }: P) => svg(size, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>)
export const IconSearch = ({ size = 18 }: P) => svg(size, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>)
export const IconUserPlus = ({ size = 18 }: P) => svg(size, <><circle cx="10" cy="8" r="4" /><path d="M2 21c0-4 4-6 8-6s8 2 8 6" /><path d="M19 8v6M16 11h6" /></>)
export const IconClose = ({ size = 18 }: P) => svg(size, <><path d="M18 6L6 18M6 6l12 12" /></>)
export const IconList = ({ size = 22 }: P) => svg(size, <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>)
export const IconPoll = ({ size = 22 }: P) => svg(size, <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>)
export const IconBell = ({ size = 22 }: P) => svg(size, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>)
export const IconTrash = ({ size = 20 }: P) => svg(size, <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>)
export const IconCoffee = ({ size = 22 }: P) => svg(size, <><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /><path d="M6 2v3M10 2v3M14 2v3" /></>)
export const IconBug = ({ size = 22 }: P) => svg(size, <><rect x="8" y="6" width="8" height="14" rx="4" /><path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2" /></>)
export const IconBulb = ({ size = 22 }: P) => svg(size, <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></>)
export const IconNext = ({ size = 18 }: P) => svg(size, <path d="M9 18l6-6-6-6" />)
export const IconLock = ({ size = 18 }: P) => svg(size, <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>)
export const IconShield = ({ size = 18 }: P) => svg(size, <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>)
export const IconCrown = ({ size = 18 }: P) => svg(size, <><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" /><path d="M5 19h14" /></>)
export const IconPhone = ({ size = 18 }: P) => svg(size, <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></>)
export const IconLink = ({ size = 18 }: P) => svg(size, <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>)
export const IconInbox = ({ size = 18 }: P) => svg(size, <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>)
export const IconLogout = ({ size = 18 }: P) => svg(size, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>)
export const IconFilter = ({ size = 22, filled }: P) => svg(size, <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" fill={filled ? 'currentColor' : 'none'} />)
export const IconCopy = ({ size = 20 }: P) => svg(size, <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>)
export const IconMore = ({ size = 22 }: P) => svg(size, <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>)
export const IconSmile = ({ size = 20 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" /></>)
export const IconCheck = ({ size = 20 }: P) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconCamera = ({ size = 22 }: P) => svg(size, <><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></>)
export const IconImage = ({ size = 22 }: P) => svg(size, <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></>)
export const IconQr = ({ size = 20 }: P) => svg(size, <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5" /></>)
export const IconScan = ({ size = 20 }: P) => svg(size, <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M7 12h10" /></>)
export const IconCalendar = ({ size = 18 }: P) => svg(size, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)
export const IconUsers = ({ size = 20 }: P) => svg(size, <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.4 4 5.2" /></>)
