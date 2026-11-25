import type { Tag } from '../lib/supabase'
export function TagChip({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  return <span className="chip" style={{ background: tag.color + '33', color: tag.color, borderColor: tag.color }} onClick={onClick}>{tag.name}</span>
}
