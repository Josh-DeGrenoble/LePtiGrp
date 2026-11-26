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
