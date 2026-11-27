import type { Conversation, Role } from './supabase'

/** Miroir de public.can() / default_permission() dans supabase/permissions.sql */
export type Level = 'all' | 'admins' | 'super'
export type Action = 'write' | 'mention_all' | 'pin' | 'delete_others' | 'invite' | 'kick' | 'edit_info' | 'manage_admins'
  | 'tool_list' | 'tool_ledger' | 'tool_poll' | 'tool_event'

export const PERMISSIONS: { action: Action; label: string; default: Level }[] = [
  { action: 'write', label: 'Écrire des messages', default: 'all' },
  { action: 'mention_all', label: 'Mentionner @tous', default: 'all' },
  { action: 'pin', label: 'Épingler des messages', default: 'admins' },
  { action: 'delete_others', label: 'Supprimer les messages des autres', default: 'admins' },
  { action: 'edit_info', label: 'Modifier le nom et la photo', default: 'admins' },
  { action: 'invite', label: 'Inviter des membres', default: 'admins' },
  { action: 'kick', label: 'Exclure des membres', default: 'super' },
  { action: 'manage_admins', label: 'Nommer ou retirer des admins', default: 'super' },
  // outils de la conv (tool_rights.sql) : créer, modifier, supprimer ; cocher, voter et répondre restent à tous
  { action: 'tool_list', label: 'Gérer les pense-bêtes', default: 'all' },
  { action: 'tool_ledger', label: 'Gérer les comptes', default: 'all' },
  { action: 'tool_poll', label: 'Gérer les sondages', default: 'all' },
  { action: 'tool_event', label: 'Gérer le calendrier', default: 'all' },
]

export const LEVEL_LABEL: Record<Level, string> = { all: 'Tous', admins: 'Admins', super: 'Super' }

export function levelOf(conv: Conversation, action: Action): Level {
  return conv.permissions?.[action] ?? PERMISSIONS.find((p) => p.action === action)!.default
}

export function canDo(conv: Conversation | null, role: Role | null, action: Action): boolean {
  if (!conv || !role) return false
  if (!conv.is_group) return action === 'write' || action === 'mention_all' || action === 'pin'
  if (role === 'super_admin') return true
  const lvl = levelOf(conv, action)
  return lvl === 'all' || (lvl === 'admins' && role === 'admin')
}
