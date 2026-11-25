const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function Avatar({ name, url, size = 44, group }: { name: string; url?: string | null; size?: number; group?: boolean }) {
  // Avatar prédéfini : "emoji:🦊:#f59e0b"
  if (url?.startsWith('emoji:')) {
    const [, emoji, bg] = url.split(':')
    return <div className="avatar" style={{ width: size, height: size, background: bg, fontSize: size * 0.55 }}>{emoji}</div>
  }
  if (url) return <img src={url} alt="" className="avatar" style={{ width: size, height: size }} />
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  return (
    <div className="avatar" style={{ width: size, height: size, background: COLORS[hash(name) % COLORS.length],
      fontSize: size * 0.4, borderRadius: group ? size * 0.3 : '50%' }}>
      {initials}
    </div>
  )
}
