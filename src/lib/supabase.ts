import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

export type Profile = { id: string; display_name: string; avatar_url: string | null; friend_code: string }
export type Tag = { id: string; name: string; color: string }
export type Role = 'super_admin' | 'admin' | 'member'

export type ConvSummary = {
  id: string; is_group: boolean; name: string | null; avatar_url: string | null; other_user_id: string | null
  is_favorite: boolean; notify_all: boolean; notify_mentions: boolean; notify_pins: boolean
  last_message_at: string; last_content: string | null; last_author: string | null; unread: number
}

export type Conversation = {
  id: string; is_group: boolean; name: string | null; avatar_url: string | null
  everyone_admin: boolean; permissions: Partial<Record<string, 'all' | 'admins' | 'super'>>
}

export type Member = {
  conversation_id: string; user_id: string; role: Role; is_favorite: boolean
  notify_all: boolean; notify_mentions: boolean; notify_pins: boolean; joined_at: string
  profiles?: Profile
}

export type Message = {
  id: number; conversation_id: string; author_id: string | null; content: string
  mentions: string[]; mention_all: boolean
  pinned_at: string | null; pinned_until: string | null; pinned_by: string | null; created_at: string
}

export function isPinned(m: Message, now = Date.now()) {
  return !!m.pinned_at && (!m.pinned_until || new Date(m.pinned_until).getTime() > now)
}

export function errMsg(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message)
  return String(e)
}
