import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

export type Profile = {
  id: string; display_name: string; avatar_url: string | null; friend_code: string
  /** Activité des outils dans le chat : réglages par défaut (voir supabase/activity.sql) */
  show_tools_default?: ToolKey[]; notify_activity_default?: boolean
}
/** Outils dont l'activité peut s'afficher dans le chat */
export type ToolKey = 'list' | 'poll' | 'ledger'
export type Tag = { id: string; name: string; color: string }
export type Role = 'super_admin' | 'admin' | 'member'

export type ConvSummary = {
  id: string; is_group: boolean; name: string | null; avatar_url: string | null; other_user_id: string | null
  is_favorite: boolean; notify_all: boolean; notify_mentions: boolean; notify_pins: boolean
  last_message_at: string; last_content: string | null; last_author: string | null; unread: number
  last_ciphertext?: string | null; last_epoch?: number | null; last_author_id?: string | null; last_client_id?: string | null
  show_tools?: ToolKey[] | null; notify_activity?: boolean | null; last_kind?: 'msg' | 'activity'
}

export type Conversation = {
  id: string; is_group: boolean; name: string | null; avatar_url: string | null
  /** Date de l'événement du groupe (AAAA-MM-JJ), facultative */
  event_date?: string | null
  everyone_admin: boolean; permissions: Partial<Record<string, 'all' | 'admins' | 'super'>>
}

export type Member = {
  conversation_id: string; user_id: string; role: Role; is_favorite: boolean
  notify_all: boolean; notify_mentions: boolean; notify_pins: boolean; joined_at: string
  /** vide = réglage par défaut du profil */
  show_tools?: ToolKey[] | null; notify_activity?: boolean | null
  profiles?: Profile
}

export type Message = {
  id: number; conversation_id: string; author_id: string | null
  /** En clair seulement pour les anciens messages et les cartes de sondage ; sinon `ciphertext` (voir lib/e2ee) */
  content: string | null; ciphertext?: string | null; epoch?: number | null; has_media?: boolean
  mentions: string[]; mention_all: boolean
  pinned_at: string | null; pinned_until: string | null; pinned_by: string | null; created_at: string
  client_id?: string | null; poll_id?: string | null
  /** 'activity' : modif d'un outil rattaché à la conv, écrite par le serveur, en clair */
  kind?: 'msg' | 'activity'; tool?: 'list' | 'ledger' | 'poll' | null; tool_id?: string | null; tool_name?: string | null
}

export function isPinned(m: Message, now = Date.now()) {
  return !!m.pinned_at && (!m.pinned_until || new Date(m.pinned_until).getTime() > now)
}

// Erreurs fréquentes du serveur (surtout connexion / inscription) en français clair
const FR: [RegExp, string][] = [
  [/already registered|already been registered|user_already_exists/i, 'Un compte existe déjà avec cet email : connecte-toi.'],
  [/invalid format|email address .* is invalid|validate email|email_address_invalid/i, "Cette adresse email n'est pas valide."],
  [/email not confirmed/i, "Valide d'abord le lien reçu par mail (pense aux spams)."],
  [/rate limit|too many|security purposes|only request this after/i, 'Trop de tentatives : réessaie dans quelques minutes.'],
  [/password should be|weak password|weak_password/i, 'Mot de passe trop faible : 8 caractères minimum.'],
  [/failed to fetch|networkerror|load failed/i, 'Pas de connexion au serveur : vérifie ton réseau.'],
]
export function errMsg(e: unknown) {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e)
  return FR.find(([re]) => re.test(m))?.[1] ?? m
}

/** Partage commun aux outils : pour moi seul, pour une conv, ou libre (participants choisis) */
export type Shared = { id: string; owner_id: string; conversation_id: string | null; participants: string[]; created_at: string }
export type List = Shared & { name: string; categories?: string[]; ledger_id?: string | null }
export type Claim = { item_id: number; user_id: string; qty: number | null }
/** `quantity` = quantité demandée (texte libre, ex. « 3 » ou « 2 kg ») ; `list_claims` = qui en prend combien */
export type QtyKind = 'take' | 'left'
export type ListItem = {
  id: number; list_id: string; content: string; created_at: string; list_claims: Claim[]
  position: number | null; category: string | null
  qty_kind: QtyKind; quantity: string | null; level: number | null  // « à prendre » : quantity ; « restant » : level en %
}
export type Ledger = Shared & { name: string }
export type Expense = { id: number; ledger_id: string; label: string; amount: number; paid_by: string; split: string[]; spent_at: string; created_at: string }
export type Poll = Shared & { question: string; options: string[]; multiple: boolean }
export type Vote = { poll_id: string; user_id: string; option: number }
export type Reminder = { id: number; conversation_id: string | null; message: string; remind_at: string; sent_at: string | null }
