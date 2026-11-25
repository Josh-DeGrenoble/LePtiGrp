import type { Tag } from '../lib/supabase'

/** Pastille de tag ; `filled` = sélectionnée (fond plein) */
export function TagChip({ tag, onClick, filled }: { tag: Tag; onClick?: () => void; filled?: boolean }) {
  const style = filled
    ? { background: tag.color, color: '#fff', borderColor: tag.color }
    : { background: tag.color + '33', color: tag.color, borderColor: tag.color }
  return <span className="chip" style={style} onClick={onClick}>{tag.name}</span>
}
