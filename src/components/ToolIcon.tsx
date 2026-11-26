import { IconList, IconMoney, IconPoll } from './Icons'
import type { ToolKind } from '../lib/tools'

export function ToolIcon({ kind, size = 22 }: { kind: ToolKind; size?: number }) {
  return kind === 'notes' ? <IconList size={size} /> : kind === 'accounts' ? <IconMoney size={size} /> : <IconPoll size={size} />
}
